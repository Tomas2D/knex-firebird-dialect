import { defaults, map } from "lodash";
import { readableToString } from "@rauschma/stringio";

import assert from "assert";
import Client from "knex/lib/client";

import ColumnCompiler from "./schema/columncompiler";
import QueryCompiler from "./query/compiler";
import TableCompiler from "./schema/tablecompiler";
import Transaction from "./transaction";
import SchemaCompiler from "./schema/compiler";
import Firebird_Formatter from "./formatter";
import Firebird_DDL from "./schema/ddl";

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
      driverConnectFn(this.connectionSettings, (error, connection) => {
        if (error) {
          return reject(error);
        }
        resolve(connection);
      });
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
  processResponse(obj, runner) {
    if (!obj) {
      return;
    }
    const { response, method } = obj;
    if (obj.output) {
      return obj.output.call(runner, response);
    }

    const [rows, fields] = response;
    this._fixBufferStrings(rows, fields);
    this._fixBlobCallbacks(rows, fields);

    switch (method) {
      case "first":
        return rows[0];
      case "pluck":
        return map(rows, obj.pluck);
      default:
        return rows;
    }
  }

  _fixBufferStrings(rows, fields) {
    if (!rows) {
      return rows;
    }

    for (const row of Array.isArray(rows) ? rows : [rows]) {
      for (const cell in row) {
        const value = row[cell];
        if (Buffer.isBuffer(value)) {
          for (const field of fields) {
            if (
              field.alias.toUpperCase() === cell.toUpperCase() &&
              (field.type === 448 || field.type === 452)
            ) {
              // SQLVarString
              row[cell] = value.toString("utf8");
              break;
            }
          }
        }
      }
    }
  }
  /**
   * The Firebird library returns BLOLs with callback functions; Those need to be loaded asynchronously
   * @param {*} rows
   * @param {*} fields
   */
  _fixBlobCallbacks(rows /*, fields */) {
    if (!rows) {
      return rows;
    }

    const blobEntries = [];

    // Seek and verify if there is any BLOB
    for (const row of Array.isArray(rows) ? rows : [rows]) {
      for (const cell in row) {
        const value = row[cell];
        // ATSTODO: Está presumindo que o blob é texto; recomenda-se diferenciar texto de binário. Talvez o "fields" ajude?
        // Is it a callback BLOB?
        if (value instanceof Function) {
          blobEntries.push(
            new Promise((resolve, reject) => {
              value((err, name, stream) => {
                if (err) {
                  reject(err);
                  return;
                }

                // ATSTODO: Ver como fazer quando o string não tiver o "setEncoding()"
                if (!stream["setEncoding"]) {
                  stream["setEncoding"] = () => undefined;
                }

                // ATSTODO: Não está convertendo os cadacteres acentuados corretamente, mesmo informando a codificação
                readableToString(stream, "none")
                  .then((blobString) => {
                    row[cell] = blobString;
                    resolve();
                  })
                  .catch((err) => {
                    reject(err);
                  });
              });
            })
          );
        }
      }
    }
    // Returns a Promise that wait BLOBs be loaded and returns it
    return Promise.all(blobEntries).then(() => rows);
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
