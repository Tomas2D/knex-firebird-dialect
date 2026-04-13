import knexLib from "knex";
import client from "../src";
import path from "path";
import os from "os";
import * as fs from "fs";

const generateConfig = () => ({
  client,
  connection: {
    host: "127.0.0.1",
    port: 3050,
    username: process.env.ISC_USER || "SYSDBA",
    password: process.env.ISC_PASSWORD || "masterkey",
    database: path.join(os.tmpdir(), `firebird-knex-dialect-${Date.now()}.fdb`),
    lowercase_keys: true,
  },
  pool: { min: 1, max: 1 },
  createDatabaseIfNotExists: true,
  debug: false,
  libraryPath: process.env.LIBRARY_PATH,
});

describe("Basic operations", () => {
  let knex;
  const knexConfig = generateConfig();

  beforeAll(() => {
    knex = knexLib(knexConfig);
  });

  afterAll(async () => {
    await knex.destroy();
    await fs.promises.unlink(knexConfig.connection.database).catch(() => {});
  });

  it("Test connection", async () => {
    await knex.raw("SELECT 1 FROM RDB$DATABASE");
  });

  it("Create tables", async () => {
    expect(await knex.schema.hasTable("users")).toBe(false);
    expect(await knex.schema.hasTable("accounts")).toBe(false);

    await knex.schema
      .createTable("users", function (table) {
        table.increments("id").primary();
        table.string("role").collate();
        table.string("user_name", 100).comment("User Name");
        table.binary("binary_data");
        table.specificType("status", "char(1)");
      })
      .createTable("accounts", function (table) {
        table.increments("id").primary();
        table.string("account_name").collate("utf8");
        table.integer("user_id").unsigned().references("users.id");
      });

    expect(await knex.schema.hasTable("users")).toBe(true);
    expect(await knex.schema.hasColumn("users", "id")).toBe(true);
    expect(await knex.schema.hasColumn("users", "status")).toBe(true);

    expect(await knex.schema.hasTable("accounts")).toBe(true);
    expect(await knex.schema.hasColumn("accounts", "user_id")).toBe(true);
    expect(await knex.schema.hasColumn("accounts", "some_column")).toBe(false);

    expect(await knex("users").columnInfo()).toBeTruthy();
  });

  it("Not implemented functions", async () => {
    const trx = await knex.transaction();
    expect(trx.isCompleted()).toBe(false);
    await trx.commit();
    expect(trx.isCompleted()).toBe(true);
    await expect(() => trx.savepoint()).rejects.toThrow();
    await expect(() => knex.schema.renameTable("X", "Y")).rejects.toThrow();
  });

  it("Insert data into tables", async () => {
    await new Promise((resolve) =>
      knex.transaction(async (rtx) => {
        expect(
          await knex
            .transacting(rtx)
            .returning("id")
            .insert({
              id: 1,
              user_name: "Tomáš 😎",
              role: "user",
              binary_data: Buffer.from("Binary data for Tomáš 😎"),
              status: "A",
            })
            .into("users")
        ).toStrictEqual([
          {
            id: 1,
          },
        ]);

        expect(
          await knex
            .transacting(rtx)
            .returning("user_name")
            .insert({
              id: 2,
              user_name: "Adam",
              role: "user",
              binary_data: Buffer.from("Binary data for Adam"),
              status: "B",
            })
            .into("users")
        ).toStrictEqual([
          {
            user_name: "Adam",
          },
        ]);

        expect(
          await knex
            .transacting(rtx)
            .returning(["id", "role"])
            .insert({
              id: 3,
              user_name: "Lucas",
              role: "user",
              binary_data: Buffer.from("Binary data for Lucas"),
              status: "C",
            })
            .into("users")
        ).toStrictEqual([
          {
            id: 3,
            role: "user",
          },
        ]);

        expect(
          await knex
            .transacting(rtx)
            .table("accounts")
            .insert({ id: 101, account_name: "knex", user_id: 1 })
        ).toStrictEqual([]);

        resolve();
      })
    );

    const users = await knex.select("*").from("users");
    expect(users).toMatchSnapshot();

    const accounts = await knex.select("*").from("accounts");
    expect(accounts).toMatchSnapshot();

    expect(await knex.count().first().from("users")).toMatchInlineSnapshot(`
      {
        "count": 3,
      }
    `);
    expect(await knex.count().first().from("accounts")).toMatchInlineSnapshot(`
      {
        "count": 1,
      }
    `);
  });

  it("Sorting", async () => {
    await expect(knex.distinct("id").from("users").orderBy("id", "desc"))
      .resolves.toMatchInlineSnapshot(`
      [
        {
          "id": 3,
        },
        {
          "id": 2,
        },
        {
          "id": 1,
        },
      ]
    `);
  });

  it("Filtering", async () => {
    await expect(
      knex.select().from("users").where({
        user_name: "Adam",
      })
    ).resolves.toMatchSnapshot();
  });

  it("Left join", async () => {
    await expect(
      knex("users")
        .join("accounts", "users.id", "accounts.user_id")
        .select(
          "users.user_name as user_name",
          "accounts.account_name as account"
        )
    ).resolves.toMatchSnapshot();
  });

  it("Test limits", async () => {
    await expect(
      knex("users").select("*").whereIn(["role"], ["user"]).offset(2).limit(2)
    ).resolves.toMatchSnapshot();
  });

  it("Select one", async () => {
    const results = await knex("users").select("status");
    for (const result of results) {
      expect(result.status.length).toBe(1);
    }
  });

  it("Select one", async () => {
    await expect(knex("users").first("*")).resolves.toMatchInlineSnapshot(`
      {
        "binary_data": {
          "data": [
            66,
            105,
            110,
            97,
            114,
            121,
            32,
            100,
            97,
            116,
            97,
            32,
            102,
            111,
            114,
            32,
            84,
            111,
            109,
            195,
            161,
            197,
            161,
            32,
            240,
            159,
            152,
            142,
          ],
          "type": "Buffer",
        },
        "id": 1,
        "role": "user",
        "status": "A",
        "user_name": "Tomáš 😎",
      }
    `);
  });

  it("Test pluck", async () => {
    await expect(knex("users").pluck("id")).resolves.toMatchInlineSnapshot(`
      [
        1,
        2,
        3,
      ]
    `);
  });

  it("Drop tables", async () => {
    await knex.schema.dropTable("accounts");
    await knex.schema.dropTable("users");

    await knex.schema.dropTableIfExists("accounts");
    await knex.schema.dropTableIfExists("users");

    await expect(knex.schema.hasTable("accounts")).resolves.toBe(false);
    await expect(knex.schema.hasTable("users")).resolves.toBe(false);
  });

  it("Transaction - not implemented parts", (done) => {
    knex.transaction((rtx) => {
      expect(rtx.savepoint).rejects.toThrow(
        new Error("savepoints not implemented")
      );

      rtx.commit();
      done();
    });
  });

  it("Transaction - error", async () => {
    await expect(
      knex.transaction(async (rtx) => {
        await knex
          .transacting(rtx)
          .returning("id")
          .insert({
            id: 1,
          })
          .into("users");
      })
    ).rejects.toThrow();
  });
});

describe("hasTable / hasColumn", () => {
  let knex;
  const knexConfig = generateConfig();

  beforeAll(async () => {
    knex = knexLib(knexConfig);
    await knex.schema.createTable("ht_test", (table) => {
      table.increments("id").primary();
      table.string("name", 100).notNullable();
      table.integer("age").nullable();
    });
  });

  afterAll(async () => {
    await knex.schema.dropTableIfExists("ht_test");
    await knex.destroy();
    await fs.promises.unlink(knexConfig.connection.database).catch(() => {});
  });

  describe("hasTable", () => {
    it("returns true for an existing table", async () => {
      await expect(knex.schema.hasTable("ht_test")).resolves.toBe(true);
    });

    it("returns false for a non-existing table", async () => {
      await expect(knex.schema.hasTable("no_such_table")).resolves.toBe(false);
    });

    it("is case-insensitive (lowercase input)", async () => {
      await expect(knex.schema.hasTable("ht_test")).resolves.toBe(true);
    });

    it("is case-insensitive (uppercase input)", async () => {
      await expect(knex.schema.hasTable("HT_TEST")).resolves.toBe(true);
    });
  });

  describe("hasColumn", () => {
    it("returns true for an existing column", async () => {
      await expect(knex.schema.hasColumn("ht_test", "name")).resolves.toBe(true);
    });

    it("returns true for a primary key column", async () => {
      await expect(knex.schema.hasColumn("ht_test", "id")).resolves.toBe(true);
    });

    it("returns true for a nullable column", async () => {
      await expect(knex.schema.hasColumn("ht_test", "age")).resolves.toBe(true);
    });

    it("returns false for a non-existing column", async () => {
      await expect(knex.schema.hasColumn("ht_test", "no_such_col")).resolves.toBe(false);
    });

    it("returns false when table does not exist", async () => {
      await expect(knex.schema.hasColumn("no_such_table", "id")).resolves.toBe(false);
    });

    it("is case-insensitive for column name", async () => {
      await expect(knex.schema.hasColumn("ht_test", "NAME")).resolves.toBe(true);
      await expect(knex.schema.hasColumn("ht_test", "Name")).resolves.toBe(true);
    });

    it("is case-insensitive for table name", async () => {
      await expect(knex.schema.hasColumn("HT_TEST", "name")).resolves.toBe(true);
    });

    it("throws when tableName is missing", async () => {
      await expect(knex.schema.hasColumn(null, "name")).rejects.toThrow(
        "hasColumn requires both tableName and column arguments"
      );
    });

    it("throws when column is missing", async () => {
      await expect(knex.schema.hasColumn("ht_test", null)).rejects.toThrow(
        "hasColumn requires both tableName and column arguments"
      );
    });
  });
});

describe("SQL Injection", () => {
  let knex;
  const knexConfig = generateConfig();

  beforeAll(async () => {
    knex = knexLib(knexConfig);
    await knex.schema.createTable("sqli_test", (table) => {
      table.string("payload", 200).nullable();
    });
  });

  afterAll(async () => {
    await knex.schema.dropTableIfExists("sqli_test");
    await knex.destroy();
    await fs.promises.unlink(knexConfig.connection.database).catch(() => {});
  });

  describe("hasTable", () => {
    it("does not find a table when name contains SQL injection payload", async () => {
      await expect(
        knex.schema.hasTable("sqli_test' OR '1'='1")
      ).resolves.toBe(false);
    });

    it("does not find a table with UNION injection payload", async () => {
      await expect(
        knex.schema.hasTable("sqli_test' UNION SELECT 1 FROM RDB$DATABASE --")
      ).resolves.toBe(false);
    });

    it("does not find a table with comment injection payload", async () => {
      await expect(
        knex.schema.hasTable("sqli_test'--")
      ).resolves.toBe(false);
    });
  });

  describe("hasColumn", () => {
    it("does not find a column when name contains SQL injection payload", async () => {
      await expect(
        knex.schema.hasColumn("sqli_test", "id' OR '1'='1")
      ).resolves.toBe(false);
    });

    it("does not find a column with UNION injection payload", async () => {
      await expect(
        knex.schema.hasColumn("sqli_test", "id' UNION SELECT 1 FROM RDB$DATABASE --")
      ).resolves.toBe(false);
    });

    it("does not find a column when table name contains injection payload", async () => {
      await expect(
        knex.schema.hasColumn("sqli_test' OR '1'='1", "id")
      ).resolves.toBe(false);
    });

  });

  describe("dropTableIfExists", () => {
    it("throws on invalid identifier with injection payload", async () => {
      await expect(
        knex.schema.dropTableIfExists("sqli_test; DROP TABLE sqli_test2 --")
      ).rejects.toThrow("Invalid identifier");
    });

    it("throws on identifier with quote injection", async () => {
      await expect(
        knex.schema.dropTableIfExists("sqli_test' OR '1'='1")
      ).rejects.toThrow("Invalid identifier");
    });
  });

  describe("data binding (insert/select)", () => {
    it("stores and retrieves SQL injection string as plain data", async () => {
      const injected = "'; DROP TABLE sqli_test; --";
      await knex("sqli_test").insert({ payload: injected });
      const rows = await knex("sqli_test").where({ payload: injected }).select("payload");
      expect(rows).toHaveLength(1);
      expect(rows[0].payload).toBe(injected);
    });

    it("does not return rows for injected WHERE condition", async () => {
      const rows = await knex("sqli_test")
        .whereRaw("payload = ?", ["nonexistent' OR '1'='1"])
        .select("payload");
      expect(rows).toHaveLength(0);
    });
  });
});

describe("DDL", () => {
  let knex;
  const tableName = "ddl";
  const knexConfig = generateConfig();

  beforeAll(async () => {
    knex = knexLib(knexConfig);
    await new Promise((resolve) => setTimeout(resolve, 400));
  });

  afterAll(async () => {
    await knex.destroy();
    await fs.promises.unlink(knexConfig.connection.database).catch(() => {});
  });

  it("Test connection", async () => {
    await knex.raw("SELECT 1 FROM RDB$DATABASE");
  });

  it("Create table", async () => {
    expect(await knex.schema.hasTable("ddl")).toBe(false);

    await knex.schema.createTable("ddl", function (table) {
      table.string("id").primary();
      table.string("col_a").nullable();
      table.integer("col_b").notNullable();
      table.integer("col_d").nullable();
    });

    expect(await knex.schema.hasTable("ddl")).toBe(true);
  });

  it("Rename table columns", async () => {
    const oldName = "col_d";
    const newName = "col_d_renamed";

    expect(await knex.schema.hasColumn(tableName, oldName)).toBe(true);
    expect(await knex.schema.hasColumn(tableName, newName)).toBe(false);

    await knex.schema
      .table(tableName, (table) => table.renameColumn(oldName, newName))
      .then();

    expect(await knex.schema.hasColumn(tableName, oldName)).toBe(false);
    expect(await knex.schema.hasColumn(tableName, newName)).toBe(true);

    await knex.schema
      .table(tableName, (table) => table.renameColumn(newName, oldName))
      .then();

    expect(await knex.schema.hasColumn(tableName, oldName)).toBe(true);
    expect(await knex.schema.hasColumn(tableName, newName)).toBe(false);
  });

  it("Create & Drop column", async () => {
    expect(await knex.schema.hasColumn(tableName, "tmp")).toBe(false);
    await knex.schema
      .alterTable(tableName, (table) => table.string("tmp").nullable())
      .then();
    expect(await knex.schema.hasColumn(tableName, "tmp")).toBe(true);
    await knex.schema
      .table(tableName, (table) => table.dropColumn("tmp"))
      .then();
    expect(await knex.schema.hasColumn(tableName, "tmp")).toBe(false);
  });
});
