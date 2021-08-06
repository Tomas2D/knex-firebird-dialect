// Firebird: Column Builder & Compiler
// -------
import SchemaCompiler from "knex/lib/schema/compiler";

import { some, flatten } from "lodash";

// Schema Compiler
// -------
class SchemaCompiler_Firebird extends SchemaCompiler {
  hasTable(tableName) {
    const fullTableName = this.formatter
      .wrap(prefixedTableName(this.schema, String(tableName)))
      .toUpperCase();

    const sql = `select 1 as x from rdb$relations where rdb$relation_name = '${fullTableName}'`;
    this.pushQuery({
      sql,
      output: (raw) => {
        const result = flatten(raw).shift();
        if (!result || !(result instanceof Object)) {
          return;
        }

        return Number(result.x) === 1;
      },
    });
  }

  // Compile the query to determine if a column exists.
  hasColumn(tableName, column) {
    this.pushQuery({
      sql:
        `select i.rdb$field_name as "Field" from ` +
        `rdb$relations r join rdb$RELATION_FIELDS i ` +
        `on (i.rdb$relation_name = r.rdb$relation_name) ` +
        `where r.rdb$relation_name = '${this.formatter.wrap(
          tableName.toUpperCase()
        )}'`,
      output(resp) {
        return some(flatten(resp), (col) => {
          return (
            this.client.wrapIdentifier(col.field.trim().toLowerCase()) ===
            this.client.wrapIdentifier(column.trim().toLowerCase())
          );
        });
      },
    });
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

  renameTable(tableName, to) {
    throw new Error(
      `${this.name} is not implemented for this dialect (http://www.firebirdfaq.org/faq363/).`
    );
  }
}

function prefixedTableName(prefix, table) {
  return prefix ? `${prefix}.${table}` : table;
}

export default SchemaCompiler_Firebird;
