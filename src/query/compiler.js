// Firebird Query Builder & Compiler
import QueryCompiler from "knex/lib/query/querycompiler";
const identity = require("lodash/identity");
const reduce = require("lodash/reduce");

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

  truncate() {
    throw new Error("Truncate SQL command does not exists in Firebird.");
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

  update() {
    
    let sql = super.update();
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
    if (Array.isArray(insertValues)) {
      if (insertValues.length !== 1) {
        throw new Error("Firebird does not support multiple insertions.");
      }
      insertValues = insertValues[0];
    }

    const newValue = {};
    for (const key in insertValues) {
      if (Object.prototype.hasOwnProperty.call(insertValues, key)) {
        const value = insertValues[key];
        if (typeof value !== "undefined") {
          newValue[key] = value;
        }
      }
    }
    return super._prepInsert(newValue);
  }

  columnInfo() {
    const column = this.getColumnName(this.single.columnInfo);

    // The user may have specified a custom wrapIdentifier function in the config. We
    // need to run the identifiers through that function, but not format them as
    // identifiers otherwise.
    const table = this.client.customWrapIdentifier(this.single.table, identity);

    const self = this;
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
      where rdb$relation_name = '${table.toUpperCase()}'
      `,
      output({ rows }) {
        const result = reduce(
          rows,
          function (columns, value) {
            const name = self.getColumnName(
              value[self.getColumnName("name")].trim()
            );

            columns[name] = {
              type: value[self.getColumnName("type")].trim().toLowerCase(),
              nullable: !value[self.getColumnName("not_null")],
            };

            if (value.MAX_LENGTH) {
              columns[name] = value.MAX_LENGTH;
            }

            return columns;
          },
          {}
        );

        if (column && !result[column]) {
          throw new Error(`Specified column "${column}" was not found!`);
        }
        return column ? result[column] : result;
      },
    };
  }

  getColumnName(name) {
    if (!name) {
      return name;
    }
    return this.client.config.connection.lowercase_keys
      ? name.toLowerCase()
      : name;
  }
}

export default QueryCompiler_Firebird;
