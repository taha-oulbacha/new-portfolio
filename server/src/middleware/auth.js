const jwt = require("jsonwebtoken");
const config = require("../config");

const COOKIE = "portfolio_admin";

function issueToken(res, user) {
  const token = jwt.sign(
    { sub: user.id, email: user.email },
    config.jwtSecret,
    { expiresIn: `${config.sessionDays}d` }
  );
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: config.env === "production",
    sameSite: config.env === "production" ? "none" : "lax",
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function clearToken(res) {
  res.clearCookie(COOKIE, {
    httpOnly: true,
    secure: config.env === "production",
    sameSite: config.env === "production" ? "none" : "lax",
    path: "/",
  });
}

function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: "Not signed in." });
  try {
    req.admin = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    clearToken(res);
    res.status(401).json({ error: "Session expired. Sign in again." });
  }
}

module.exports = { issueToken, clearToken, requireAdmin, COOKIE };
