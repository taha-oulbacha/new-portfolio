require("dotenv").config();

const bool = (v, fallback = false) =>
  v === undefined || v === "" ? fallback : /^(1|true|yes)$/i.test(String(v));

const int = (v, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

const config = {
  env: process.env.NODE_ENV || "development",
  port: int(process.env.PORT, 3000),

  corsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Used to build absolute links inside emails (review verification).
  publicUrl:
    process.env.PUBLIC_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${int(process.env.PORT, 3000)}`),

  db: {
    url: process.env.DATABASE_URL || process.env.MYSQL_URL || "",
    host: process.env.DB_HOST || process.env.MYSQLHOST || "localhost",
    port: int(process.env.DB_PORT || process.env.MYSQLPORT, 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER || "root",
    password: process.env.DB_PASSWORD ?? process.env.MYSQLPASSWORD ?? "",
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || "portfolio",
  },

  jwtSecret: process.env.JWT_SECRET || "",
  sessionDays: int(process.env.SESSION_DAYS, 7),

  mail: {
    host: process.env.SMTP_HOST || "",
    port: int(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "Portfolio <no-reply@localhost>",
    to: process.env.MAIL_TO || "",
  },
};

if (config.env === "production" && config.jwtSecret.length < 32) {
  throw new Error(
    "JWT_SECRET must be set to a long random string in production. Generate one with: openssl rand -hex 48"
  );
}
if (!config.jwtSecret) config.jwtSecret = "dev-only-insecure-secret";

module.exports = config;
