// Firebird: Column Builder & Compiler
// -------
import SchemaCompiler from "knex/lib/schema/compiler";

// Schema Compiler
// -------
class SchemaCompiler_Firebird extends SchemaCompiler {
  hasTable(tableName) {
    const fullTableName = prefixedTableName(this.schema, String(tableName)).toUpperCase();
    this.pushQuery({
      sql: `select 1 from rdb$relations where rdb$relation_name = ?`,
      bindings: [fullTableName],
      output: ({ rows }) => rows.length > 0,
    });
  }

  // Compile the query to determine if a column exists.
  hasColumn(tableName, column) {
    if (!tableName || !column) {
      throw new Error("hasColumn requires both tableName and column arguments");
    }
    const table = String(tableName).toUpperCase();
    const field = String(column).trim().toUpperCase();
    this.pushQuery({
      sql:
        `select 1 from rdb$relations r ` +
        `join rdb$relation_fields i on (i.rdb$relation_name = r.rdb$relation_name) ` +
        `where r.rdb$relation_name = ? ` +
        `and trim(i.rdb$field_name) = ?`,
      bindings: [table, field],
      output({ rows }) {
        return rows.length > 0;
      },
    });
  }

  getColumnName() {
    const name = super.getColumnName(arguments);
    return this.client.config.connection.lowercase_keys
      ? name.toLowerCase()
      : name;
  }

  dropTableIfExists(tableName) {
    const fullTableName = this.formatter
      .wrap(prefixedTableName(this.schema, tableName))
      .toUpperCase();
    const dropTableSql = this.dropTablePrefix + fullTableName;

    this.pushQuery(`
      EXECUTE BLOCK AS BEGIN
      if (exists(select 1 from rdb$relations where rdb$relation_name = '${fullTableName}')) then
      execute statement '${dropTableSql}';
      END
    `);

    return this;
  }

  // eslint-disable-next-line no-unused-vars
  renameTable(tableName, to) {
    throw new Error(
      `${this.name} is not implemented for this dialect (http://www.firebirdfaq.org/faq363/).`
    );
  }
}

function prefixedTableName(prefix, table) {
  return prefix ? `${prefix}.${table}` : table;
}

SchemaCompiler_Firebird.prototype.lowerCase = true;

export default SchemaCompiler_Firebird;
