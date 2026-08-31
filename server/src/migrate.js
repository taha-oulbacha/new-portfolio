/* Creates the database (when permitted) and applies schema.sql. Safe to re-run. */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const config = require("./config");

const statements = (sql) =>
  sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

  // Managed hosts create the database for you; a local box usually does not.
  if (!config.db.url) {
    const root = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      multipleStatements: true,
    });
    await root.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await root.end();
  }

  const conn = config.db.url
    ? await mysql.createConnection(config.db.url)
    : await mysql.createConnection({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database,
      });

  for (const stmt of statements(sql)) {
    await conn.query(stmt);
  }
  await conn.end();
  console.log("Migrations applied.");
  process.exit(0);
})().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
