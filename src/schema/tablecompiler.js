import TableCompiler from "knex/lib/schema/tablecompiler";

// Table Compiler
// -------

class TableCompiler_Firebird extends TableCompiler {
  // Create a new table.
  createQuery(columns, ifNot) {
    if (ifNot) throw new Error("createQuery ifNot not implemented");
    const createStatement = "create table ";
    let sql =
      createStatement + this.tableName() + " (" + columns.sql.join(", ") + ")";
    this.pushQuery(sql);
  }

  // Compile a plain index key command.
  index(columns, indexName) {
    indexName = indexName
      ? this.formatter.wrap(indexName)
      : this._indexCommand("index", this.tableNameRaw, columns);
    this.pushQuery(
      `create index ${indexName} on ${this.tableName()} (${this.formatter.columnize(
        columns
      )})`
    );
  }

  primary(columns) {
    this.constraintName = this.constraintName
      ? this.formatter.wrap(this.constraintName)
      : this.formatter.wrap(`${this.tableNameRaw}_pkey`);
    this.pushQuery(
      `alter table ${this.tableName()} add constraint ${
        this.constraintName
      } primary key (${this.formatter.columnize(columns)})`
    );
  }

  renameColumn(from, to) {
    const fromSanitized = this.formatter.wrap(from)
    const toSanitized = this.formatter.wrap(to)

    this.pushQuery({
      sql: `alter table ${this.tableName()} ${this.alterColumnPrefix} ${fromSanitized} to ${toSanitized}`,
    });
  }
}

TableCompiler_Firebird.prototype.addColumnsPrefix = 'ADD ';
TableCompiler_Firebird.prototype.dropColumnPrefix = 'DROP ';
TableCompiler_Firebird.prototype.alterColumnPrefix = 'ALTER COLUMN ';

export default TableCompiler_Firebird;
