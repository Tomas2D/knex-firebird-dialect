import Transaction from "knex/lib/execution/transaction";

class Transaction_Firebird extends Transaction {
  /**
   * @param {import('node-firebird-driver-native').Attachment} conn
   * @returns {Promise<unknown>}
   */
  async begin(conn) {
    const transaction = await conn.startTransaction({
      isolation: this.isolationLevel || 'READ_COMMITTED',
      ...(this.readOnly && {
        accessMode: 'READ_ONLY'
      })
    })
    this._transaction = transaction
    return transaction
  }

  savepoint() {
    throw new Error("savepoints not implemented");
  }

  release() {
    throw new Error("releasing savepoints not implemented");
  }

  async commit(conn, value) {
    this._completed = true
    await this._transaction.commit()
    this._resolver(value);
  }

  async rollback(conn, error) {
    this._completed = true
    if (error) {
      this._rejecter(error);
    } else {
      await this._transaction.rollback()
      this._resolver();
    }
  }

  rollbackTo() {
    throw new Error("rolling back to savepoints not implemented");
  }
}

export default Transaction_Firebird;
