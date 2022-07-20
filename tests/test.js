import knexLib from "knex";
import Firebird from "node-firebird";
import client from "../src";
import fs from "fs";
import path from "path";

const generateConfig = () => ({
  client,
  connection: {
    host: "127.0.0.1",
    port: 3050,
    user: process.env.ISC_USER || "SYSDBA",
    password: process.env.ISC_PASSWORD || "masterkey",
    database: path.join(
      process.cwd(),
      `firebird-knex-dialect-${Date.now()}.fdb`
    ),
    lowercase_keys: true,
  },
  pool: { min: 1, max: 1 },
  createDatabaseIfNotExists: true,
  debug: false,
});

describe.skip("Test Node Firebird", () => {
  const knexConfig = generateConfig();
  let fb;

  beforeAll((done) => {
    Firebird.attachOrCreate(knexConfig.connection, (err, db) => {
      expect(err).toBeUndefined();

      fb = db;
      done();
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await new Promise((resolve) => fb.detach(resolve));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await fs.promises.unlink(knexConfig.connection.database).catch(() => {});
  });

  it("Simple select", (done) => {
    fb.query("SELECT 1 FROM RDB$DATABASE", (err, res) => {
      expect(res).toMatchSnapshot();
      done();
    });
  });
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
        table.string("role");
        table.string("user_name");
        table.binary("binary_data");
      })
      .createTable("accounts", function (table) {
        table.increments("id").primary();
        table.string("account_name");
        table.integer("user_id").unsigned().references("users.id");
      });

    expect(await knex.schema.hasTable("users")).toBe(true);
    expect(await knex.schema.hasColumn("users", "id")).toBe(true);

    expect(await knex.schema.hasTable("accounts")).toBe(true);
    expect(await knex.schema.hasColumn("accounts", "user_id")).toBe(true);
    expect(await knex.schema.hasColumn("accounts", "some_column")).toBe(false);
  });

  it("Insert data into tables", async () => {
    await new Promise((resolve) =>
      knex.transaction(async (rtx) => {
        await knex
          .transacting(rtx)
          .returning("id")
          .insert({
            id: 1,
            user_name: "Tomáš 😎",
            role: "user",
            binary_data: Buffer.from("Binary data for Tomáš 😎"),
          })
          .into("users");

        await knex
          .transacting(rtx)
          .returning("user_name")
          .insert({
            id: 2,
            user_name: "Adam",
            role: "user",
            binary_data: Buffer.from("Binary data for Adam"),
          })
          .into("users");
        await knex
          .transacting(rtx)
          .returning("role")
          .insert({
            id: 3,
            user_name: "Lucas",
            role: "user",
            binary_data: Buffer.from("Binary data for Lucas"),
          })
          .into("users");

        await knex
          .transacting(rtx)
          .table("accounts")
          .insert({ id: 101, account_name: "knex", user_id: 1 });

        resolve();
      })
    );

    const users = await knex.select("*").from("users");
    expect(users).toMatchSnapshot();

    const accounts = await knex.select("*").from("accounts");
    expect(accounts).toMatchSnapshot();

    expect(await knex.count().first().from("users")).toMatchInlineSnapshot(`
          Object {
            "count": 3,
          }
      `);
    expect(await knex.count().first().from("accounts")).toMatchInlineSnapshot(`
          Object {
            "count": 1,
          }
      `);
  });

  it("Sorting", async () => {
    await expect(knex.select("id").from("users").orderBy("id", "desc")).resolves
      .toMatchInlineSnapshot(`
      Array [
        Object {
          "id": 3,
        },
        Object {
          "id": 2,
        },
        Object {
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
      knex("users")
        .select("*")
        .where({
          role: "user",
        })
        .offset(2)
        .limit(2)
    ).resolves.toMatchSnapshot();
  });

  it("Select one", async () => {
    await expect(knex("users").first("*")).resolves.toMatchInlineSnapshot(`
      Object {
        "binary_data": Object {
          "data": Array [
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
        "user_name": "Tomáš 😎",
      }
    `);
  });

  it("Test pluck", async () => {
    await expect(knex("users").pluck("id")).resolves.toMatchInlineSnapshot(`
      Array [
        1,
        2,
        3,
      ]
    `);
  });

  it("Drop tables", async () => {
    await knex.schema.dropTable("accounts");
    await knex.schema.dropTable("users");

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
    await expect(knex.transaction(async (rtx) => {
      await knex
        .transacting(rtx)
        .returning("id")
        .insert({
          id: 1
        })
        .into("users")})).rejects.toThrow()
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
