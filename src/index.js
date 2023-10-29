import {defaults, map} from "lodash";
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
import { Blob } from 'node-firebird-driver-native'
import * as fs from "fs";

class Client_Firebird extends Client {
  _driver() {
    return require("node-firebird-driver-native");
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

    // FIREBIRD_HOST="fsdm.farmsoft.cz"
    // FIREBIRD_PORT="3050"
    // FIREBIRD_USER="SYSDBA"
    // FIREBIRD_PASSWORD="AgrosofT"
    // FIREBIRD_POOL_SIZE="1"
    // FIREBIRD_KRONOS_PATH="/var/lib/firebird/3.0/data/kronos/kronos.fdb"

    /** @type {import('node-firebird-driver-native').Client} client */
    const client = this.driver.createNativeClient(this.config.libraryPath || this._driver().getDefaultLibraryFilename())
    const databasePath = this.config.connection.database || this.config.connection.path

    if (this.config.createDatabaseIfNotExists) {
      const dbExists = await fs.promises.stat(databasePath).then(() => false).catch(() => true)
      if (dbExists) {
          return await client.createDatabase(databasePath, this.config.connection)
      }
    }

    return await client.connect(databasePath, this.config.connection)
  }

  /**
   * @param {import('node-firebird-driver-native').Attachment} connection
   * @returns {Promise<unknown>}
   */
  async destroyRawConnection(connection) {
    await connection.disconnect()
  }

  /**
   * @param {import('node-firebird-driver-native').Attachment} connection
   * @param obj
   * @returns {Promise<unknown>}
   * @private
   */
  async _query(connection, obj) {
    if (!obj || typeof obj === "string") {
      obj = { sql: obj };
    }
    if (!connection) {
      throw new Error(`Error calling ${obj.method} on connection.`)
    }

    const { sql } = obj;
    if (!sql) {
      return
    }

    if (connection._transaction) {
      throw new Error('this should never happen!')
    }

    const transaction = await connection.startTransaction();
    const statement = await connection.prepare(transaction, sql);

    try {
      let fResponse = {
        rows: [],
        fields: []
      }
      if (obj.returning && !statement.hasResultSet) {
        const response = await statement.executeSingletonAsObject(transaction, obj.bindings)
        fResponse.rows = [Object.values(response)]
        fResponse.fields = Object.keys(response)
      } else if (statement.hasResultSet) {
        const response = await statement.executeQuery(transaction, obj.bindings);
        const [rows, fields] = await Promise.all([
          response.fetch(),
          statement.columnLabels
        ])
        fResponse.rows = rows
        fResponse.fields = fields
      } else {
        await statement.execute(transaction, obj.bindings)
      }


      await this._fixResponse(fResponse, transaction)
      return {
        ...obj,
        response: fResponse
      }
    } finally {
      await transaction.commit()
      await statement.dispose();
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

    const { rows } = response;
    switch (method) {
      case "select":
        return rows;
      case "first":
        return rows[0];
      case "pluck":
        return map(rows, obj.pluck);
      default:
        return rows;
    }
  }

  async _fixResponse(obj, transaction) {
    const { rows, fields } = obj
    if (this.config.connection.lowercase_keys) {
      const newFields = fields.map(field => field.toLowerCase())
      fields.length = 0
      fields.push(...newFields)
    }

    const blobs = [];
    for (let i = 0; i < rows.length; i++) {
      const row = {}
      fields.forEach((key, index) => {
        const value = rows[i][index]
        if (value instanceof Blob) {
          blobs.push(
            value.attachment.openBlob(transaction, value).then(async (stream) => {
              const buffer = Buffer.alloc(await stream.length)
              await stream.read(buffer)
              row[key] = buffer
            })
          )
        } else {
          row[key] = value
        }
      })
      rows[i] = row
    }

    await Promise.all(blobs);

    return obj
  }

  /**
   * @param {import('node-firebird-driver-native').Attachment} db
   * @returns {boolean}
   */
  validateConnection(db) {
    return db.isValid
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
  driverName: "node-firebird",

  Firebird_Formatter,
});

export default Client_Firebird;
