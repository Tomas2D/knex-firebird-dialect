# 👾 knex-firebird-dialect

[![codecov](https://codecov.io/gh/Tomas2D/knex-firebird-dialect/branch/master/graph/badge.svg?token=SQA7VM6XIV)](https://codecov.io/gh/Tomas2D/knex-firebird-dialect)

This library serves as dialect (client) for [Knex.js](https://github.com/knex/knex) (A SQL query builder). 

The purpose of doing this is to replace old unmaintained libraries; this one is based on [igorklopov/firebird-knex](https://github.com/igorklopov/firebird-knex).
Under the hood, there is a [node-firebird-driver-native](https://github.com/asfernandes/node-firebird-drivers/blob/master/packages/node-firebird-driver-native/).
In case you can't use the `node-firebird-driver-native` package, stick to version 1.x of this package which works on top of [node-firebird](https://github.com/hgourvest/node-firebird) package.

Show some love and ⭐️ this project!

## 🚀 Usage

Start with installing the package with your favorite package manager.

```
yarn add knex-firebird-dialect node-firebird-driver-native
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

**Notice**: if you using CommonJS require, do not forget to use the default import. `const knexFirebirdDialect = require("knex-firebird-dialect").default`;

For more look at the `tests` folder.
