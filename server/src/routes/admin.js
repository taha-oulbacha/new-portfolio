const express = require("express");
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");
const { STATUSES } = require("../validate");

const router = express.Router();
router.use(requireAdmin);

const PAGE_SIZE = 25;

/* Shared WHERE builder for the list, the export and the count. */
function buildFilter(q) {
  const where = [];
  const params = [];

  if (q.status && STATUSES.includes(q.status)) {
    where.push("status = ?");
    params.push(q.status);
  }
  if (q.type) {
    where.push("project_type = ?");
    params.push(String(q.type));
  }
  if (q.budget) {
    where.push("budget = ?");
    params.push(String(q.budget));
  }
  if (q.booked === "1") where.push("booked = 1");

  const search = String(q.q || "").trim();
  if (search) {
    where.push("(name LIKE ? OR email LIKE ? OR company LIKE ? OR details LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (q.from) {
    where.push("created_at >= ?");
    params.push(`${String(q.from).slice(0, 10)} 00:00:00`);
  }
  if (q.to) {
    where.push("created_at <= ?");
    params.push(`${String(q.to).slice(0, 10)} 23:59:59`);
  }

  return { clause: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

router.get("/leads", async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const { clause, params } = buildFilter(req.query);

    const totalRow = await db.query(
      `SELECT COUNT(*) AS n FROM leads ${clause}`,
      params
    );
    const total = totalRow[0].n;

    // LIMIT/OFFSET are interpolated as validated integers; prepared statements
    // refuse to bind them in MySQL.
    const offset = (page - 1) * PAGE_SIZE;
    const rows = await db.query(
      `SELECT id, name, email, phone, company, project_type, budget, timeline,
              status, booked, created_at
       FROM leads ${clause}
       ORDER BY created_at DESC
       LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      params
    );

    res.json({
      ok: true,
      leads: rows,
      page,
      pageSize: PAGE_SIZE,
      total,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (err) {
    console.error("List leads failed:", err.message);
    res.status(500).json({ error: "Could not load leads." });
  }
});

router.get("/leads/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id." });
  try {
    const lead = await db.one("SELECT * FROM leads WHERE id = ?", [id]);
    if (!lead) return res.status(404).json({ error: "Not found." });
    const events = await db.query(
      "SELECT type, detail, created_at FROM lead_events WHERE lead_id = ? ORDER BY created_at ASC",
      [id]
    );
    delete lead.ip_hash;
    res.json({ ok: true, lead, events });
  } catch (err) {
    console.error("Get lead failed:", err.message);
    res.status(500).json({ error: "Could not load that lead." });
  }
});

router.patch("/leads/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id." });

  const sets = [];
  const params = [];

  if (req.body?.status !== undefined) {
    if (!STATUSES.includes(req.body.status))
      return res.status(422).json({ error: "Unknown status." });
    sets.push("status = ?");
    params.push(req.body.status);
  }
  if (req.body?.notes !== undefined) {
    sets.push("notes = ?");
    params.push(String(req.body.notes).slice(0, 4000) || null);
  }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update." });

  try {
    params.push(id);
    await db.query(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?`, params);
    if (req.body?.status !== undefined) {
      await db.query(
        "INSERT INTO lead_events (lead_id, type, detail) VALUES (?,?,?)",
        [id, "status_change", req.body.status]
      );
    }
    const lead = await db.one("SELECT * FROM leads WHERE id = ?", [id]);
    if (lead) delete lead.ip_hash;
    res.json({ ok: true, lead });
  } catch (err) {
    console.error("Update lead failed:", err.message);
    res.status(500).json({ error: "Could not save that." });
  }
});

router.delete("/leads/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id." });
  try {
    await db.query("DELETE FROM leads WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete lead failed:", err.message);
    res.status(500).json({ error: "Could not delete that." });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const [totals] = await db.query(`
      SELECT
        COUNT(*)                                                       AS total,
        SUM(created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))             AS last7,
        SUM(created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY))            AS last30,
        SUM(status = 'new')                                            AS new_count,
        SUM(status = 'won')                                            AS won_count,
        SUM(booked = 1)                                                AS booked_count
      FROM leads
    `);

    const daily = await db.query(`
      SELECT DATE(created_at) AS day, COUNT(*) AS n
      FROM leads
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);

    const byType = await db.query(`
      SELECT project_type AS key_name, COUNT(*) AS n
      FROM leads GROUP BY project_type ORDER BY n DESC
    `);
    const byBudget = await db.query(`
      SELECT budget AS key_name, COUNT(*) AS n
      FROM leads GROUP BY budget ORDER BY n DESC
    `);
    const byStatus = await db.query(`
      SELECT status AS key_name, COUNT(*) AS n
      FROM leads GROUP BY status
    `);

    res.json({
      ok: true,
      totals: {
        total: Number(totals.total) || 0,
        last7: Number(totals.last7) || 0,
        last30: Number(totals.last30) || 0,
        new: Number(totals.new_count) || 0,
        won: Number(totals.won_count) || 0,
        booked: Number(totals.booked_count) || 0,
      },
      daily: daily.map((d) => ({
        day: d.day instanceof Date ? d.day.toISOString().slice(0, 10) : String(d.day),
        n: Number(d.n),
      })),
      byType: byType.map((r) => ({ key: r.key_name, n: Number(r.n) })),
      byBudget: byBudget.map((r) => ({ key: r.key_name, n: Number(r.n) })),
      byStatus: byStatus.map((r) => ({ key: r.key_name, n: Number(r.n) })),
    });
  } catch (err) {
    console.error("Stats failed:", err.message);
    res.status(500).json({ error: "Could not load stats." });
  }
});

router.get("/export.csv", async (req, res) => {
  try {
    const { clause, params } = buildFilter(req.query);
    const rows = await db.query(
      `SELECT id, created_at, name, email, phone, company, project_type, budget,
              timeline, status, booked, details, notes
       FROM leads ${clause} ORDER BY created_at DESC`,
      params
    );

    const fmt = (v) => {
      if (v instanceof Date) {
        const p2 = (n) => String(n).padStart(2, "0");
        return `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())} ` +
               `${p2(v.getHours())}:${p2(v.getMinutes())}`;
      }
      return v;
    };
    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(fmt(v)).replace(/"/g, '""');
      // Stop spreadsheets running a cell as a formula, but leave real phone
      // numbers like +212... alone.
      const looksLikeFormula =
        /^[=@]/.test(s) || (/^[+\-]/.test(s) && !/^[+\-][\d\s().-]+$/.test(s));
      return `"${looksLikeFormula ? `'${s}` : s}"`;
    };
    const header = Object.keys(rows[0] || { id: "" }).join(",");
    const body = rows.map((r) => Object.values(r).map(esc).join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(`${header}\n${body}`);
  } catch (err) {
    console.error("Export failed:", err.message);
    res.status(500).json({ error: "Could not export." });
  }
});

/* ══════════════ REVIEWS ══════════════════════════════════════════ */
const crypto = require("crypto");
const { PROJECT_TYPES } = require("../validate");

const MAX_AVATAR_BYTES = 900 * 1024;
const REVIEW_STATUSES = ["pending", "approved", "rejected"];

function decodeAvatar(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return null;
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m || dataUrl.length > MAX_AVATAR_BYTES) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

router.get("/reviews", async (req, res) => {
  try {
    const status = REVIEW_STATUSES.includes(req.query.status) ? req.query.status : null;
    const rows = await db.query(
      `SELECT id, author_name, author_role, email, project_type, rating, body,
              status, source, email_verified, sort_order, created_at,
              (avatar_data IS NOT NULL) AS has_avatar
       FROM reviews
       ${status ? "WHERE status = ?" : ""}
       ORDER BY FIELD(status,'pending','approved','rejected'), created_at DESC
       LIMIT 200`,
      status ? [status] : []
    );
    const [counts] = await db.query(`
      SELECT SUM(status='pending') AS pending,
             SUM(status='approved') AS approved,
             SUM(status='rejected') AS rejected
      FROM reviews`);
    res.json({
      ok: true,
      counts: {
        pending: Number(counts.pending) || 0,
        approved: Number(counts.approved) || 0,
        rejected: Number(counts.rejected) || 0,
      },
      reviews: rows.map((r) => ({ ...r, has_avatar: !!r.has_avatar })),
    });
  } catch (err) {
    console.error("List reviews failed:", err.message);
    res.status(500).json({ error: "Could not load reviews." });
  }
});

/* The admin view needs to see pending avatars too, which the public
   endpoint deliberately refuses to serve. */
router.get("/reviews/:id/avatar", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).end();
  try {
    const row = await db.one("SELECT avatar_mime, avatar_data FROM reviews WHERE id = ?", [id]);
    if (!row || !row.avatar_data) return res.status(404).end();
    res.set("Content-Type", row.avatar_mime || "image/jpeg");
    res.set("Cache-Control", "private, max-age=60");
    res.send(row.avatar_data);
  } catch {
    res.status(500).end();
  }
});

router.post("/reviews", async (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 120);
  const role = String(req.body?.role || "").trim().slice(0, 140) || null;
  const body = String(req.body?.body || "").trim().slice(0, 1200);
  const projectType = PROJECT_TYPES.includes(req.body?.projectType)
    ? req.body.projectType
    : "other";
  let rating = Number.parseInt(req.body?.rating, 10);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) rating = 5;

  if (name.length < 2 || body.length < 10)
    return res.status(422).json({ error: "A name and a few words of review are required." });

  const avatar = decodeAvatar(req.body?.avatar);
  if (req.body?.avatar && !avatar)
    return res.status(422).json({ error: "That photo could not be read (JPG, PNG or WebP, under 1MB)." });

  try {
    const result = await db.query(
      `INSERT INTO reviews
        (author_name, author_role, project_type, rating, body,
         avatar_mime, avatar_data, status, source, email_verified)
       VALUES (?,?,?,?,?,?,?, 'approved', 'admin', 1)`,
      [name, role, projectType, rating, body,
       avatar ? avatar.mime : null, avatar ? avatar.buffer : null]
    );
    res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error("Create review failed:", err.message);
    res.status(500).json({ error: "Could not save that review." });
  }
});

router.patch("/reviews/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id." });

  const sets = [];
  const params = [];

  if (req.body?.status !== undefined) {
    if (!REVIEW_STATUSES.includes(req.body.status))
      return res.status(422).json({ error: "Unknown status." });
    sets.push("status = ?");
    params.push(req.body.status);
  }
  ["name", "role", "body"].forEach((key) => {
    if (req.body?.[key] === undefined) return;
    const col = key === "name" ? "author_name" : key === "role" ? "author_role" : "body";
    sets.push(`${col} = ?`);
    params.push(String(req.body[key]).trim().slice(0, key === "body" ? 1200 : 140) || null);
  });
  if (req.body?.projectType !== undefined && PROJECT_TYPES.includes(req.body.projectType)) {
    sets.push("project_type = ?");
    params.push(req.body.projectType);
  }
  if (req.body?.sortOrder !== undefined) {
    sets.push("sort_order = ?");
    params.push(Number.parseInt(req.body.sortOrder, 10) || 0);
  }
  if (req.body?.avatar !== undefined) {
    const avatar = decodeAvatar(req.body.avatar);
    if (req.body.avatar && !avatar)
      return res.status(422).json({ error: "That photo could not be read." });
    sets.push("avatar_mime = ?", "avatar_data = ?");
    params.push(avatar ? avatar.mime : null, avatar ? avatar.buffer : null);
  }

  if (!sets.length) return res.status(400).json({ error: "Nothing to update." });

  try {
    params.push(id);
    await db.query(`UPDATE reviews SET ${sets.join(", ")} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (err) {
    console.error("Update review failed:", err.message);
    res.status(500).json({ error: "Could not save that." });
  }
});

router.delete("/reviews/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id." });
  try {
    await db.query("DELETE FROM reviews WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete review failed:", err.message);
    res.status(500).json({ error: "Could not delete that." });
  }
});

module.exports = router;

