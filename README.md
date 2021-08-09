# 👾 knex-firebird-dialect

This library serves as dialect (client) for [Knex.js](https://github.com/knex/knex) (A SQL query builder). 

Purpose of doing is to replace old unmaintained libraries, this one is based on [igorklopov/firebird-knex](https://github.com/igorklopov/firebird-knex).
Under the hood there is a [Firebird driver for Node.JS](https://github.com/hgourvest/node-firebird).

## 🚀 Usage

Start with installing the package with your favorite package manager.

```
yarn install knex-firebird-dialect
```

or

```
npm install knex-firebird-dialect
```

Snippet below shows basic setup.

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

For more look at the `tests` folder.
