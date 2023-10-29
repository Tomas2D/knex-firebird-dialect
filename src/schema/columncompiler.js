import ColumnCompiler from "knex/lib/schema/columncompiler";

// Column Compiler
// -------

class ColumnCompiler_Firebird extends ColumnCompiler {
  modifiers = ["collate", "nullable"];
  increments = "integer not null primary key";

  collate(collation) {
    // TODO request `charset` modifier of knex column
    return collation && `character set ${collation || "ASCII"}`;
  }

  getColumnName() {
    const name = super.getColumnName(arguments)
    if (!name) {
      return name
    }
    return this.client.config.connection.lowercase_keys ? name.toLowerCase() : name
  }
}

export default ColumnCompiler_Firebird;
