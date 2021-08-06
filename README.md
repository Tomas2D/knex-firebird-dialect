# 👾 knex-firebird-dialect

This library serves as dialect (client) for [Knex.js](https://github.com/knex/knex) (A SQL query builder). 

Purpose of doing is to replace old unmaintained libraries, this one is based on [igorklopov/firebird-knex](https://github.com/igorklopov/firebird-knex).

## 🚀 Usage

This snippet shows basic setup, for more look at `tests` folder. 

```javascript
import knexLib from "knex";
import knexFirebirdDialect from "knex-firebird-dialect";

const knexConfig = {
  client: knexFirebirdDialect,
  connection: {
    host: "127.0.0.1",
    port: 3050,
    user: "SYSDBA",
    password: "masterkey",
    database: '/tmp/database.fdb',
    lowercase_keys: true,
  },
  createDatabaseIfNotExists: true,
  debug: false,
};
```
