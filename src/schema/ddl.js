// Firebird_DDL
//
//
// columns and changing datatypes.
// -------

import {
  uniqueId,
  find,
  identity,
  map,
  some,
  negate,
  isEmpty,
  chunk,
} from "lodash";

class Firebird_DDL {
  constructor(client, tableCompiler, pragma, connection) {
    this.client = client;
    this.tableCompiler = tableCompiler;
    this.pragma = pragma;
    this.tableNameRaw = this.tableCompiler.tableNameRaw;
    this.alteredName = uniqueId("_knex_temp_alter");
    this.connection = connection;
    this.formatter =
      client && client.config && client.config.wrapIdentifier
        ? client.config.wrapIdentifier
        : (value) => value;
  }

  tableName() {
    return this.formatter(this.tableNameRaw, (value) => value);
  }

  async getColumn(column) {
    const currentCol = find(this.pragma, (col) => {
      return (
        this.client.wrapIdentifier(col.name).toLowerCase() ===
        this.client.wrapIdentifier(column).toLowerCase()
      );
    });
    if (!currentCol)
      throw new Error(
        `The column ${column} is not in the ${this.tableName()} table`
      );
    return currentCol;
  }

  getTableSql() {
    this.trx.disableProcessing();
    return this.trx
      .raw(
        `SELECT name, sql FROM sqlite_master WHERE type="table" AND name="${this.tableName()}"`
      )
      .then((result) => {
        this.trx.enableProcessing();
        return result;
      });
  }

  async renameTable() {
    return this.trx.raw(
      `ALTER TABLE "${this.tableName()}" RENAME TO "${this.alteredName}"`
    );
  }

  dropOriginal() {
    return this.trx.raw(`DROP TABLE "${this.tableName()}"`);
  }

  dropTempTable() {
    return this.trx.raw(`DROP TABLE "${this.alteredName}"`);
  }

  copyData() {
    return this.trx
      .raw(`SELECT * FROM "${this.tableName()}"`)
      .then((result) =>
        this.insertChunked(20, this.alteredName, identity, result)
      );
  }

  reinsertData(iterator) {
    return this.trx
      .raw(`SELECT * FROM "${this.alteredName}"`)
      .then((result) =>
        this.insertChunked(20, this.tableName(), iterator, result)
      );
  }

  async insertChunked(chunkSize, target, iterator, result) {
    iterator = iterator || identity;
    const chunked = chunk(result, chunkSize);
    for (const batch of chunked) {
      await this.trx.queryBuilder().table(target).insert(map(batch, iterator));
    }
  }

  createTempTable(createTable) {
    return this.trx.raw(
      createTable.sql.replace(this.tableName(), this.alteredName)
    );
  }

  _doReplace(sql, from, to) {
    const oneLineSql = sql.replace(/\s+/g, " ");
    const matched = oneLineSql.match(/^CREATE TABLE\s+(\S+)\s*\((.*)\)/);

    const tableName = matched[1];
    const defs = matched[2];

    if (!defs) {
      throw new Error("No column definitions in this statement!");
    }

    let parens = 0,
      args = [],
      ptr = 0;
    let i = 0;
    const x = defs.length;
    for (i = 0; i < x; i++) {
      switch (defs[i]) {
        case "(":
          parens++;
          break;
        case ")":
          parens--;
          break;
        case ",":
          if (parens === 0) {
            args.push(defs.slice(ptr, i));
            ptr = i + 1;
          }
          break;
        case " ":
          if (ptr === i) {
            ptr = i + 1;
          }
          break;
      }
    }
    args.push(defs.slice(ptr, i));

    const fromIdentifier = from.replace(/[`"'[\]]/g, "");

    args = args.map((item) => {
      item = item.trim();
      let split = item.split(" ");

      const fromMatchCandidates = [
        new RegExp(`\`${fromIdentifier}\``, "i"),
        new RegExp(`"${fromIdentifier}"`, "i"),
        new RegExp(`'${fromIdentifier}'`, "i"),
        new RegExp(`\\[${fromIdentifier}\\]`, "i"),
      ];
      if (fromIdentifier.match(/^\S+$/)) {
        fromMatchCandidates.push(new RegExp(`\\b${fromIdentifier}\\b`, "i"));
      }

      const doesMatchFromIdentifier = (target) =>
        some(fromMatchCandidates, (c) => target.match(c));

      const replaceFromIdentifier = (target) =>
        fromMatchCandidates.reduce(
          (result, candidate) => result.replace(candidate, to),
          target
        );

      if (doesMatchFromIdentifier(split[0])) {
        // column definition
        if (to) {
          split[0] = to;
          return split.join(" ");
        }
        return ""; // for deletions
      }

      // skip constraint name
      const idx = /constraint/i.test(split[0]) ? 2 : 0;

      // primary key and unique constraints have one or more
      // columns from this table listed between (); replace
      // one if it matches
      if (/primary|unique/i.test(split[idx])) {
        const ret = item.replace(/\(.*\)/, replaceFromIdentifier);
        // If any member columns are dropped then uniqueness/pk constraint
        // can not be retained
        if (ret !== item && isEmpty(to)) return "";
        return ret;
      }

      // foreign keys have one or more columns from this table
      // listed between (); replace one if it matches
      // foreign keys also have a 'references' clause
      // which may reference THIS table; if it does, replace
      // column references in that too!
      if (/foreign/.test(split[idx])) {
        split = item.split(/ references /i);
        // the quoted column names save us from having to do anything
        // other than a straight replace here
        const replacedKeySpec = replaceFromIdentifier(split[0]);

        if (split[0] !== replacedKeySpec) {
          // If we are removing one or more columns of a foreign
          // key, then we should not retain the key at all
          if (isEmpty(to)) return "";
          else split[0] = replacedKeySpec;
        }

        if (split[1].slice(0, tableName.length) === tableName) {
          // self-referential foreign key
          const replacedKeyTargetSpec = split[1].replace(
            /\(.*\)/,
            replaceFromIdentifier
          );
          if (split[1] !== replacedKeyTargetSpec) {
            // If we are removing one or more columns of a foreign
            // key, then we should not retain the key at all
            if (isEmpty(to)) return "";
            else split[1] = replacedKeyTargetSpec;
          }
        }
        return split.join(" references ");
      }

      return item;
    });

    args = args.filter(negate(isEmpty));

    if (args.length === 0) {
      throw new Error("Unable to drop last column from table");
    }

    return oneLineSql
      .replace(/\(.*\)/, () => `(${args.join(", ")})`)
      .replace(/,\s*([,)])/, "$1");
  }
}

export default Firebird_DDL;
