const debug = require("debug")("knex:tx");
import Transaction from "knex/lib/execution/transaction";

class Transaction_Firebird extends Transaction {
  begin(conn) {
    return new Promise((resolve, reject) => {
      conn.transaction(
        this.client.driver.ISOLATION_READ_COMMITED,
        (error, transaction) => {
          if (error) return reject(error);
          conn._transaction = transaction;
          resolve();
        }
      );
    });
  }

  savepoint() {
    throw new Error("savepoints not implemented");
  }

  commit(conn, value) {
    return this.query(conn, "commit", 1, value);
  }

  release() {
    throw new Error("releasing savepoints not implemented");
  }

  rollback(conn, error) {
    return this.query(conn, "rollback", 2, error);
  }

  rollbackTo() {
    throw new Error("rolling back to savepoints not implemented");
  }

  query(conn, method, status, value) {
    const q = new Promise((resolve, reject) => {
      const transaction = conn._transaction;
      transaction[method]((error) => {
        delete conn._transaction;
        if (error) return reject(error);
        resolve();
      });
    })
      .catch((error) => {
        status = 2;
        value = error;
        this._completed = true;
        debug("%s error running transaction query", this.txid);
      })
      .then(() => {
        if (status === 1) this._resolver(value);
        if (status === 2) this._rejecter(value);
      });
    if (status === 1 || status === 2) {
      this._completed = true;
    }
    return q;
  }
}

export default Transaction_Firebird;
