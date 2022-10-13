import { defaults, map } from "lodash";
import getStream from "get-stream";

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
import { toArrayFromPrimitive } from "./utils";

class Client_Firebird extends Client {
  _driver() {
    return require("node-firebird");
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

  // Get a raw connection from the database, returning a promise with the connection object.
  acquireRawConnection() {
    assert(!this._connectionForTransactions);

    const driverConnectFn = this.config.createDatabaseIfNotExists
      ? this.driver.attachOrCreate
      : this.driver.attach;

    return new Promise((resolve, reject) => {
      let retryCount = 1, maxRetryCount = 3;
      const connect = () => {
        driverConnectFn(this.connectionSettings, (error, connection) => {
          if (!error) {
            return resolve(connection);
          }

          // Bug in the "node-firebird" library
          // "Your user name and password are not defined. Ask your database administrator to set up a Firebird login."
          if (String(error?.gdscode) === '335544472' && retryCount < maxRetryCount) {
            retryCount++
            return connect()
          }
          return reject(error);
        });
      }
      connect()
    });
  }

  // Used to explicitly close a connection, called internally by the pool when
  // a connection times out or the pool is shutdown.
  async destroyRawConnection(connection) {
    return new Promise((resolve, reject) => {
      connection.connection._socket.once("close", () => {
        resolve();
      });

      connection.detach((err) => {
        if (err) {
          reject(err);
        }

        connection.connection._socket.destroy();
      });
    });
  }

  // Runs the query on the specified connection, providing the bindings and any
  // other necessary prep work.
  _query(connection, obj) {
    if (!obj || typeof obj === "string") {
      obj = { sql: obj };
    }
    return new Promise(function (resolver, rejecter) {
      if (!connection) {
        return rejecter(
          new Error(`Error calling ${obj.method} on connection.`)
        );
      }

      const { sql } = obj;
      if (!sql) {
        return resolver();
      }
      const c = connection._trasaction || connection;
      c.query(sql, obj.bindings, (error, rows, fields) => {
        if (error) {
          return rejecter(error);
        }
        obj.response = [rows, fields];
        resolver(obj);
      });
    });
  }

  _stream() {
    throw new Error("_stream not implemented");
    // const client = this;
    // return new Promise(function (resolver, rejecter) {
    //   stream.on('error', rejecter);
    //   stream.on('end', resolver);
    //   return client
    //     ._query(connection, sql)
    //     .then((obj) => obj.response)
    //     .then((rows) => rows.forEach((row) => stream.write(row)))
    //     .catch(function (err) {
    //       stream.emit('error', err);
    //     })
    //     .then(function () {
    //       stream.end();
    //     });
    // });
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

    const [rows, fields] = response;
    await this._fixBlobCallbacks(rows, fields);

    switch (method) {
      case "first":
        return rows[0];
      case "pluck":
        return map(rows, obj.pluck);
      default:
        return rows;
    }
  }

  /**
   * The Firebird library returns BLOBs with callback function, convert to buffer
   * @param {*} rows
   * @param {*} fields
   */
  async _fixBlobCallbacks(rows /* fields */) {
    if (!rows) {
      return rows;
    }

    const blobEntries = [];

    toArrayFromPrimitive(rows).forEach((row, rowIndex) => {
      Object.entries(row).forEach(([colKey, colVal]) => {
        if (colVal instanceof Function) {
          blobEntries.push(
            new Promise((resolve, reject) => {
              colVal((err, name, emitter) => {
                getStream.buffer(emitter).then((buffer) => {
                  rows[rowIndex][colKey] = buffer;
                  resolve();
                }).catch(reject);
              });
            })
          );
        } else if (colVal instanceof Buffer) {
          rows[rowIndex][colKey] = colVal.toString("utf8");
        }
      });
    });

    await Promise.all(blobEntries);

    return rows;
  }

  validateConnection(db) {
    const { _isClosed, _isDetach, _socket, _isOpened } = db.connection;

    if (_isClosed || _isDetach || !_socket || !_isOpened) {
      return false;
    }

    return true;
  }

  poolDefaults() {
    const options = { min: 2, max: 4 };
    return defaults(options, super.poolDefaults(this));
  }

  ping(resource, callback) {
    resource.query("select 1 from RDB$DATABASE", callback);
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
