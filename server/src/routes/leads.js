const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");

const db = require("../db");
const config = require("../config");
const { validateLead } = require("../validate");
const { notifyNewLead } = require("../mailer");

const router = express.Router();

/* A stranger on the internet posts here, so: strict limits, no echoing input. */
const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many submissions. Please try again in a few minutes." },
});

const hashIp = (ip) =>
  ip ? crypto.createHash("sha256").update(String(ip)).digest("hex") : null;

router.post("/", submitLimiter, async (req, res) => {
  // Honeypot: real people never fill a hidden field.
  if (req.body && typeof req.body.website === "string" && req.body.website.trim()) {
    return res.status(200).json({ ok: true });
  }

  const { ok, errors, value } = validateLead(req.body);
  if (!ok) return res.status(422).json({ error: "Please check the form.", errors });

  const token = crypto.randomBytes(16).toString("hex");

  try {
    const result = await db.query(
      `INSERT INTO leads
        (public_token, name, email, phone, company, project_type, budget, timeline,
         details, source, referrer, ip_hash, user_agent)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        token,
        value.name,
        value.email,
        value.phone,
        value.company,
        value.projectType,
        value.budget,
        value.timeline,
        value.details,
        String(req.body.source || "hero_cta").slice(0, 60),
        String(req.headers.referer || "").slice(0, 255) || null,
        hashIp(req.ip),
        String(req.headers["user-agent"] || "").slice(0, 255) || null,
      ]
    );

    await db.query(
      "INSERT INTO lead_events (lead_id, type, detail) VALUES (?,?,?)",
      [result.insertId, "created", value.projectType]
    );

    notifyNewLead(value); // fire and forget

    res.status(201).json({ ok: true, token });
  } catch (err) {
    console.error("Lead insert failed:", err.message);
    res.status(500).json({ error: "Something went wrong on our side. Please try again." });
  }
});

/* Called when the person actually clicks through to the booking page. */
router.post("/:token/booked", async (req, res) => {
  const token = String(req.params.token || "");
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(400).json({ error: "Bad token." });

  try {
    const lead = await db.one("SELECT id, booked FROM leads WHERE public_token = ?", [token]);
    if (!lead) return res.status(404).json({ error: "Not found." });

    if (!lead.booked) {
      await db.query(
        "UPDATE leads SET booked = 1, booked_at = NOW() WHERE id = ?",
        [lead.id]
      );
      await db.query(
        "INSERT INTO lead_events (lead_id, type, detail) VALUES (?,?,?)",
        [lead.id, "booking_clicked", null]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Booking flag failed:", err.message);
    res.status(500).json({ error: "Could not record that." });
  }
});

module.exports = router;
