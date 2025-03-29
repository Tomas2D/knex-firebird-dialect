// Firebird: Column Builder & Compiler
// -------
import SchemaCompiler from "knex/lib/schema/compiler";

// Schema Compiler
// -------
class SchemaCompiler_Firebird extends SchemaCompiler {
  hasTable(tableName) {
    const fullTableName = this.formatter
      .wrap(prefixedTableName(this.schema, String(tableName)))
      .toUpperCase();

    const sql = `select 1 from rdb$relations where rdb$relation_name = '${fullTableName}'`;
    this.pushQuery({
      sql,
      output: ({ rows, fields }) => {
        if (!rows || rows.length === 0) {
          return false;
        }
        const key = fields[0];
        return Number(rows[0][key]) === 1;
      },
    });
  }

  // Compile the query to determine if a column exists.
  hasColumn(tableName, column) {
    this.pushQuery({
      sql:
        `select i.rdb$field_name as "field" from ` +
        `rdb$relations r join rdb$RELATION_FIELDS i ` +
        `on (i.rdb$relation_name = r.rdb$relation_name) ` +
        `where r.rdb$relation_name = '${this.formatter.wrap(
          tableName.toUpperCase()
        )}'`,
      output({ rows, fields }) {
        const key = fields[0].trim();
        const target = column.trim().toLowerCase();
        for (const row of rows) {
          if (row[key].trim().toLowerCase() === target) {
            return true;
          }
        }
        return false;
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
