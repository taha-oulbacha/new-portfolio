const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");

const db = require("../db");
const config = require("../config");
const { PROJECT_TYPES } = require("../validate");
const { sendVerification } = require("../mailer");

const router = express.Router();

const MAX_AVATAR_BYTES = 900 * 1024; // ~900KB of base64 after client-side resize

const clean = (v, max) =>
  typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const hashIp = (ip) =>
  ip ? crypto.createHash("sha256").update(String(ip)).digest("hex") : null;

/* Turns a data: URL from the browser into {mime, buffer}, or null. */
function decodeAvatar(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  if (dataUrl.length > MAX_AVATAR_BYTES) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

/* ── Public: the approved reviews on the About page ───────────────── */
router.get("/", async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT id, author_name, author_role, project_type, rating, body,
              (avatar_data IS NOT NULL) AS has_avatar, created_at
       FROM reviews
       WHERE status = 'approved'
       ORDER BY sort_order DESC, created_at DESC
       LIMIT 24`
    );
    res.set("Cache-Control", "public, max-age=120");
    res.json({
      ok: true,
      reviews: rows.map((r) => ({
        id: r.id,
        name: r.author_name,
        role: r.author_role,
        projectType: r.project_type,
        rating: r.rating,
        body: r.body,
        avatar: r.has_avatar ? `/api/reviews/${r.id}/avatar` : null,
        date: r.created_at,
      })),
    });
  } catch (err) {
    console.error("Public reviews failed:", err.message);
    res.status(500).json({ error: "Could not load reviews." });
  }
});

/* Avatars are served from the database so they survive every redeploy. */
router.get("/:id/avatar", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).end();
  try {
    const row = await db.one(
      "SELECT avatar_mime, avatar_data, status FROM reviews WHERE id = ?",
      [id]
    );
    if (!row || !row.avatar_data || row.status !== "approved")
      return res.status(404).end();
    res.set("Content-Type", row.avatar_mime || "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(row.avatar_data);
  } catch {
    res.status(500).end();
  }
});

/* ── Public: a client leaves a review ─────────────────────────────── */
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 4,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many reviews from this connection. Try again later." },
});

router.post("/", submitLimiter, async (req, res) => {
  // Honeypot
  if (req.body && typeof req.body.website === "string" && req.body.website.trim())
    return res.status(200).json({ ok: true, pending: true });

  const errors = {};
  const name = clean(req.body?.name, 120);
  if (name.length < 2) errors.name = "Please enter your name.";

  const email = clean(req.body?.email, 190).toLowerCase();
  if (!EMAIL_RE.test(email)) errors.email = "We need a valid email to verify this review.";

  const role = clean(req.body?.role, 140) || null;

  const projectType = PROJECT_TYPES.includes(req.body?.projectType)
    ? req.body.projectType
    : null;
  if (!projectType) errors.projectType = "Pick which project this was about.";

  const body = typeof req.body?.body === "string" ? req.body.body.trim().slice(0, 1200) : "";
  if (body.length < 20) errors.body = "Please write at least a sentence or two.";

  let rating = Number.parseInt(req.body?.rating, 10);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) rating = 5;

  if (Object.keys(errors).length)
    return res.status(422).json({ error: "Please check the form.", errors });

  const avatar = decodeAvatar(req.body?.avatar);
  if (req.body?.avatar && !avatar)
    return res.status(422).json({
      error: "That photo could not be read. Use a JPG, PNG or WebP under 1MB.",
    });

  const token = crypto.randomBytes(16).toString("hex");

  try {
    await db.query(
      `INSERT INTO reviews
        (author_name, author_role, email, project_type, rating, body,
         avatar_mime, avatar_data, status, source, verify_token, ip_hash)
       VALUES (?,?,?,?,?,?,?,?, 'pending', 'client', ?, ?)`,
      [
        name,
        role,
        email,
        projectType,
        rating,
        body,
        avatar ? avatar.mime : null,
        avatar ? avatar.buffer : null,
        token,
        hashIp(req.ip),
      ]
    );

    const sent = await sendVerification(email, name, token);
    res.status(201).json({
      ok: true,
      emailSent: sent,
      // When email isn't configured the review is still saved — losing a real
      // review would be worse than skipping the verification step.
      message: sent
        ? "Check your inbox and click the link to confirm it's really you."
        : "Saved. Taha will confirm it with you directly before it appears.",
    });
  } catch (err) {
    console.error("Review insert failed:", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/* Clicked from the verification email. */
router.get("/verify/:token", async (req, res) => {
  const token = String(req.params.token || "");
  const page = (title, message, ok = true) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08080a;
       color:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;padding:24px}
  .box{max-width:420px;text-align:center}
  .tick{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;
        margin:0 auto 22px;font-size:30px;background:${ok ? "#d9f871" : "#f8717a"};color:#0b0b0b}
  h1{font-size:22px;margin:0 0 10px}
  p{color:#8b8b95;line-height:1.6;margin:0 0 26px}
  a{display:inline-block;padding:13px 26px;border-radius:999px;background:#d9f871;
    color:#0b0b0b;text-decoration:none;font-weight:600}
</style></head>
<body><div class="box"><div class="tick">${ok ? "&check;" : "!"}</div>
<h1>${title}</h1><p>${message}</p>
<a href="https://taha-oulbacha.com/about.html">Back to the site</a></div></body></html>`;

  if (!/^[a-f0-9]{32}$/.test(token))
    return res.status(400).send(page("Link not valid", "That verification link looks wrong.", false));

  try {
    const row = await db.one("SELECT id, email_verified FROM reviews WHERE verify_token = ?", [token]);
    if (!row)
      return res.status(404).send(page("Link expired", "This link has already been used, or the review was removed.", false));

    if (!row.email_verified) {
      await db.query(
        "UPDATE reviews SET email_verified = 1, verify_token = NULL WHERE id = ?",
        [row.id]
      );
    }
    res.send(
      page(
        "Thank you — that's confirmed",
        "Your review is with Taha now. It appears on the site once he's had a look."
      )
    );
  } catch (err) {
    console.error("Verify failed:", err.message);
    res.status(500).send(page("Something went wrong", "Please try the link again in a moment.", false));
  }
});

module.exports = router;
