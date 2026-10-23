import { defaults, map, noop } from "lodash";
import assert from "assert";
import Client from "knex/lib/client";

import ColumnBuilder from "./schema/columnbuilder";
import ColumnCompiler from "./schema/columncompiler";
import QueryCompiler from "./query/compiler";
import TableCompiler from "./schema/tablecompiler";
import Transaction from "./transaction";
import SchemaCompiler from "./schema/compiler";
import Firebird_Formatter from "./formatter";
import Firebird_DDL from "./schema/ddl";
import {
  isFirebirdConnectionError,
  isFirebirdFeatureNotSupportedError,
  withTimeout,
} from "./utils";
import * as driver from "node-firebird-driver-native";

const DEFAULT_PING_TIMEOUT_MS = 3000;
const DEFAULT_CANCEL_TIMEOUT_MS = 5000;

class Client_Firebird extends Client {
  constructor(config = {}, ...args) {
    if (!config.connection) {
      throw new Error('Missing "connection" property in configuration!');
    }

    const customConfig = { ...config, connection: { ...config.connection } };
    if (customConfig.connection.user) {
      customConfig.connection.username = customConfig.connection.user;
      delete customConfig.connection.user;
    }

    if (!customConfig.connection.database) {
      throw new Error("Database path/alias is missing!");
    }

    super(customConfig, ...args);
  }

  _driver() {
    return driver;
  }

  schemaCompiler() {
    return new SchemaCompiler(this, ...arguments);
  }

  queryCompiler(builder, formatter) {
    return new QueryCompiler(this, builder, formatter);
  }

  columnCompiler() {
    return new ColumnCompiler(this, ...arguments);
  }

  columnBuilder() {
    return new ColumnBuilder(this, ...arguments);
  }

  tableCompiler() {
    return new TableCompiler(this, ...arguments);
  }

  transaction() {
    return new Transaction(this, ...arguments);
  }

  wrapIdentifierImpl(value) {
    if (value === "*") {
      return value;
    }

    return value;
  }

  async acquireRawConnection() {
    assert(!this._connectionForTransactions);

    const driver = this._driver();
    const client = driver.createNativeClient(
      this.config.libraryPath || driver.getDefaultLibraryFilename()
    );

    const databasePath = this.config.connection.database;
    const getConnectionString = () => {
      const { host, port } = this.config.connection;

      const target = [host, port].filter(Boolean).join("/");
      return [target, databasePath].filter(Boolean).join(":");
    };

    const uri = getConnectionString();
    const connect = () => client.connect(uri, this.config.connection);
    const connectWithCreate = () =>
      client.createDatabase(uri, this.config.connection);

    if (this.config.createDatabaseIfNotExists) {
      try {
        return await connectWithCreate();
      } catch (e) {
        const errMsg = String(e);
        if (
          ['I/O error during "open O_CREAT"', "DATABASE is in use"].some(
            (msg) => errMsg.includes(msg)
          )
        ) {
          return await connect();
        }
        throw e;
      }
    }
    return await connect();
  }

  /**
   * @param {import('node-firebird-driver-native').Attachment} connection
   * @returns {Promise<unknown>}
   */
  async destroyRawConnection(connection) {
    await connection.disconnect();
  }

  /**
   * @param {import('node-firebird-driver-native').Attachment} connection
   * @param obj
   * @returns {Promise<unknown>}
   * @private
   */
  async _query(connection, obj) {
    // Kept on the connection so that cancelQuery() can wait until it settles
    const pending = this._execute(connection, obj);
    if (connection) {
      connection.__knex__activeQuery = pending;
    }
    try {
      return await pending;
    } finally {
      if (connection?.__knex__activeQuery === pending) {
        connection.__knex__activeQuery = undefined;
      }
    }
  }

  /**
   * @param {import('node-firebird-driver-native').Attachment} connection
   * @param obj
   * @returns {Promise<unknown>}
   * @private
   */
  async _execute(connection, obj) {
    if (!obj || typeof obj === "string") {
      obj = { sql: obj };
    }
    if (!connection) {
      throw new Error(`Error calling ${obj.method} on connection.`);
    }

    const { sql } = obj;
    if (!sql) {
      return;
    }

    if (connection._transaction) {
      throw new Error("this should never happen!");
    }

    let transaction, statement;

    try {
      transaction = await connection.startTransaction();
      statement = await connection.prepare(transaction, sql);
      let fResponse = {
        rows: [],
        fields: [],
      };
      // Statements such as `UPDATE ... RETURNING` have output columns but no
      // cursor. Knex only sets `obj.returning` for builder queries, so also
      // detect them from the prepared statement to support `knex.raw(...)`.
      if (
        !statement.hasResultSet &&
        (obj.returning || (await statement.columnLabels).length > 0)
      ) {
        const response = await statement.executeSingletonAsObject(
          transaction,
          obj.bindings
        );
        fResponse.rows = [Object.values(response)];
        fResponse.fields = Object.keys(response);
      } else if (statement.hasResultSet) {
        const response = await statement.executeQuery(
          transaction,
          obj.bindings
        );
        try {
          const [rows, fields] = await Promise.all([
            response.fetch(),
            statement.columnLabels || [],
          ]);
          fResponse.rows = rows;
          fResponse.fields = fields;
        } finally {
          await response.close();
        }
      } else {
        await statement.execute(transaction, obj.bindings);
      }

      await this._fixResponse(fResponse, transaction);
      await transaction.commit();

      return {
        ...obj,
        response: fResponse,
      };
    } catch (e) {
      if (transaction) {
        await transaction.rollback().catch(noop);
        transaction = null;
      }
      if (isFirebirdConnectionError(e)) {
        await this.destroyRawConnection(connection);
      }
      throw e;
    } finally {
      if (statement) {
        await statement.dispose().catch(noop);
        statement = null;
      }
    }
  }

  _stream() {
    throw new Error("_stream not implemented");
  }

  // Ensures the response is returned in the same format as other clients.
  async processResponse(obj, runner) {
    if (!obj) {
      return;
    }
    const { response, method } = obj;
    if (obj.output) {
      return obj.output.call(runner, response);
    }

    const { rows, fields } = response;
    switch (method) {
      case "select":
        return rows;
      case "first":
        return rows[0];
      case "pluck":
        return map(rows, obj.pluck);
      case "insert":
        return Object.defineProperties(rows.slice(), {
          rows: { value: rows, enumerable: false },
          fields: { value: fields, enumerable: false },
        });
      default:
        return response;
    }
  }

  async _fixResponse(obj, transaction) {
    const { rows, fields } = obj;
    if (this.config.connection.lowercase_keys) {
      const newFields = fields.map((field) => field.toLowerCase());
      fields.length = 0;
      fields.push(...newFields);
    }

    const blobs = [];
    for (let i = 0; i < rows.length; i++) {
      const row = {};
      fields.forEach((key, index) => {
        const value = rows[i][index];
        if (value instanceof this._driver().Blob) {
          blobs.push(
            value.attachment
              .openBlob(transaction, value)
              .then(async (stream) => {
                const buffer = Buffer.alloc(await stream.length);
                await stream.read(buffer);
                row[key] = buffer;
              })
          );
        } else {
          row[key] = value;
        }
      });
      rows[i] = row;
    }

    await Promise.all(blobs);

    return obj;
  }

  /**
   * @param {import('node-firebird-driver-native').Attachment} db
   * @returns {boolean}
   */
  async validateConnection(db) {
    if (!db.isValid) {
      return false;
    }
    if (db.__knex__pingUnsupported) {
      return true;
    }

    try {
      // A ping over a half-open TCP connection may block until the OS gives up (minutes),
      // so do not let it hold the pool slot that long. The pool destroys rejected connections.
      await withTimeout(
        db.client.statusAction((status) =>
          db.attachmentHandle.pingAsync(status)
        ),
        this.config.pingTimeout ?? DEFAULT_PING_TIMEOUT_MS,
        "Firebird ping timed out"
      );
      return true;
    } catch (e) {
      if (isFirebirdFeatureNotSupportedError(e)) {
        // Server older than Firebird 3.0, ping is not available
        db.__knex__pingUnsupported = true;
        return true;
      }
      return false;
    }
  }

  /**
   * Called by knex when a query with `.timeout(ms, { cancel: true })` exceeds its timeout.
   * Interrupts the running statement (including lock waits) and waits until it unwinds,
   * so the connection is returned to the pool idle. If cancelling fails, knex disposes the connection.
   *
   * @param {import('node-firebird-driver-native').Attachment} connection
   */
  async cancelQuery(connection) {
    const activeQuery = connection.__knex__activeQuery;
    await connection.cancelOperation(false);
    if (activeQuery) {
      await withTimeout(
        activeQuery.catch(noop),
        this.config.cancelTimeout ?? DEFAULT_CANCEL_TIMEOUT_MS,
        "Cancelled Firebird query did not finish in time"
      );
    }
  }

  poolDefaults() {
    const options = { min: 2, max: 4 };
    return defaults(options, super.poolDefaults(this));
  }

  ddl(compiler, pragma, connection) {
    return new Firebird_DDL(this, compiler, pragma, connection);
  }
}

Object.assign(Client_Firebird.prototype, {
  dialect: "firebird",
  driverName: "node-firebird-driver-native",
  canCancelQuery: true,

  Firebird_Formatter,
});

export default Client_Firebird;
