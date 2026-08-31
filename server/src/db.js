const mysql = require("mysql2/promise");
const config = require("./config");

const buildOptions = () => {
  const base = {
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4_general_ci",
    timezone: "Z",
    // Railway / PlanetScale hand you a URL; everything else uses discrete vars.
    ...(config.db.url
      ? { uri: config.db.url }
      : {
          host: config.db.host,
          port: config.db.port,
          user: config.db.user,
          password: config.db.password,
          database: config.db.database,
        }),
  };
  return base;
};

const opts = buildOptions();
const pool = opts.uri
  ? mysql.createPool(opts.uri)
  : mysql.createPool(opts);

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function queryRaw(sql) {
  const [rows] = await pool.query(sql);
  return rows;
}

async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function ping() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, queryRaw, one, ping };
