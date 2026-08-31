const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");

const db = require("../db");
const { issueToken, clearToken, requireAdmin } = require("../middleware/auth");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in 15 minutes." },
});

router.post("/login", loginLimiter, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required." });

  try {
    const user = await db.one(
      "SELECT id, email, password_hash FROM admin_users WHERE email = ?",
      [email]
    );
    // Same message either way — never reveal which half was wrong.
    const okPassword = user
      ? await bcrypt.compare(password, user.password_hash)
      : await bcrypt.compare(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");

    if (!user || !okPassword)
      return res.status(401).json({ error: "Wrong email or password." });

    await db.query("UPDATE admin_users SET last_login_at = NOW() WHERE id = ?", [user.id]);
    issueToken(res, user);
    res.json({ ok: true, email: user.email });
  } catch (err) {
    console.error("Login failed:", err.message);
    res.status(500).json({ error: "Could not sign you in." });
  }
});

router.post("/logout", (req, res) => {
  clearToken(res);
  res.json({ ok: true });
});

router.get("/me", requireAdmin, (req, res) => {
  res.json({ ok: true, email: req.admin.email });
});

module.exports = router;
