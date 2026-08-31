/* Usage: npm run create-admin -- you@example.com "a strong password" */
const bcrypt = require("bcryptjs");
const db = require("../db");

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npm run create-admin -- you@example.com "your password"');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("Use a password of at least 10 characters.");
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  await db.query(
    `INSERT INTO admin_users (email, password_hash) VALUES (?,?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [email.toLowerCase(), hash]
  );
  console.log(`Admin ready: ${email}`);
  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
