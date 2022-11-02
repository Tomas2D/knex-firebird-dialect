// Firebird Query Builder & Compiler
import QueryCompiler from "knex/lib/query/querycompiler";

class QueryCompiler_Firebird extends QueryCompiler {
  columns() {
    let distinctClause = "";
    if (this.onlyUnions()) {
      return "";
    }

    const hints = this._hintComments();
    const columns = this.grouped.columns || [];
    let i = -1,
      sql = [];

    if (columns) {
      while (++i < columns.length) {
        const stmt = columns[i];
        if (stmt.distinct) distinctClause = "distinct ";
        if (stmt.distinctOn) {
          distinctClause = this.distinctOn(stmt.value);
          continue;
        }
        if (stmt.type === "aggregate") {
          sql.push(...this.aggregate(stmt));
        } else if (stmt.type === "aggregateRaw") {
          sql.push(this.aggregateRaw(stmt));
        } else if (stmt.type === "analytic") {
          sql.push(this.analytic(stmt));
        } else if (stmt.value && stmt.value.length > 0) {
          sql.push(this.formatter.columnize(stmt.value));
        }
      }
    }
    if (sql.length === 0) sql = ["*"];
    return (
      `select ${this._limit()} ${this._offset()} ${hints}${distinctClause}` +
      sql.join(", ") +
      (this.tableName
        ? ` from ${this.single.only ? "only " : ""}${this.tableName}`
        : "")
    );
  }

  _limit() {
    return super.limit().replace("limit", "first");
  }

  _offset() {
    return super.offset().replace("offset", "skip");
  }

  offset() {
    return "";
  }

  limit() {
    return "";
  }

  insert() {
    let sql = super.insert();
    if (sql === "") return sql;

    const { returning } = this.single;
    if (returning) sql += this._returning(returning);

    return {
      sql: sql,
      returning,
    };
  }

  _returning(value) {
    return value ? ` returning ${this.formatter.columnize(value)}` : "";
  }

  _prepInsert(insertValues) {
    const newValues = {};
    for (const key in insertValues) {
      if (insertValues.hasOwnProperty(key)) {
        const value = insertValues[key];
        if (typeof value !== "undefined") {
          newValues[key] = value;
        }
      }
    }
    return super._prepInsert(newValues);
  }
  // Compiles a `columnInfo` query
  columnInfo() {
    const column = this.single.columnInfo;

    // The user may have specified a custom wrapIdentifier function in the config. We
    // need to run the identifiers through that function, but not format them as
    // identifiers otherwise.
    const table = this.client.customWrapIdentifier(
      this.single.table,
      this.identity
    );

    return {
      sql: `
      select 
        rlf.rdb$field_name as name,
        fld.rdb$character_length as max_length,
        typ.rdb$type_name as type,
        rlf.rdb$null_flag as not_null
      from rdb$relation_fields rlf
      inner join rdb$fields fld on fld.rdb$field_name = rlf.rdb$field_source
      inner join rdb$types typ on typ.rdb$type = fld.rdb$field_type
      where rdb$relation_name = '${table}'
      `,
      output(resp) {
        const [rows, fields] = resp;

        const maxLengthRegex = /.*\((\d+)\)/;
        const out = reduce(
          rows,
          function (columns, val) {
            const name = val.NAME.trim();
            columns[name] = {
              type: val.TYPE.trim().toLowerCase(),
              nullable: !val.NOT_NULL,
              // ATSTODO: "defaultValue" não implementado
              // defaultValue: null,
            };

            if (val.MAX_LENGTH) {
              columns[name] = val.MAX_LENGTH;
            }

            return columns;
          },
          {}
        );
        return (column && out[column]) || out;
      },
    };
  }
}

export default QueryCompiler_Firebird;
