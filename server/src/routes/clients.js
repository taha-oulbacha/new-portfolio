const express = require("express");
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");
const { PROJECT_TYPES } = require("../validate");

const router = express.Router();
router.use(requireAdmin);

const STAGES = ["brief", "proposal", "agreed", "building", "review", "delivered", "cancelled"];
const SOURCES = ["website", "upwork", "referral", "direct", "other"];
const KINDS = ["deposit", "milestone", "final", "other"];

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const money = (v) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};
const dateOrNull = (v) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

/* ── Overview: the numbers on the front page ───────────────────────── */
router.get("/overview", async (req, res) => {
  try {
    const [totals] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM clients)                                        AS clients,
        (SELECT COUNT(*) FROM projects WHERE stage NOT IN ('delivered','cancelled')) AS active_projects,
        (SELECT COALESCE(SUM(amount),0) FROM payments)                        AS revenue_all,
        (SELECT COALESCE(SUM(amount),0) FROM payments
          WHERE paid_at >= DATE_FORMAT(CURDATE(), '%Y-01-01'))                AS revenue_year,
        (SELECT COALESCE(SUM(amount),0) FROM payments
          WHERE paid_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY))              AS revenue_30,
        (SELECT COALESCE(SUM(price_total),0) FROM projects
          WHERE stage IN ('proposal','agreed','building','review'))           AS pipeline,
        (SELECT COUNT(*) FROM leads)                                          AS leads_total,
        (SELECT COUNT(*) FROM leads WHERE status = 'won')                     AS leads_won,
        (SELECT COUNT(*) FROM leads WHERE status = 'new')                     AS leads_new
    `);

    // Money in, per month, this year
    const revenueMonthly = await db.query(`
      SELECT DATE_FORMAT(paid_at, '%Y-%m') AS month, SUM(amount) AS total
      FROM payments
      WHERE paid_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 11 MONTH)
      GROUP BY month ORDER BY month ASC
    `);

    // Which offers actually earn
    const byService = await db.query(`
      SELECT p.project_type AS key_name,
             COUNT(DISTINCT p.id)              AS projects,
             COALESCE(SUM(pay.amount), 0)      AS revenue
      FROM projects p
      LEFT JOIN payments pay ON pay.project_id = p.id
      GROUP BY p.project_type
      ORDER BY revenue DESC
    `);

    const byStage = await db.query(`
      SELECT stage AS key_name, COUNT(*) AS n, COALESCE(SUM(price_total),0) AS value
      FROM projects GROUP BY stage
    `);

    const bySource = await db.query(`
      SELECT source AS key_name, COUNT(*) AS n FROM clients GROUP BY source ORDER BY n DESC
    `);

    // What is owed but not yet received
    const [owed] = await db.query(`
      SELECT COALESCE(SUM(p.price_total),0) - COALESCE((
        SELECT SUM(amount) FROM payments pay
        JOIN projects pr ON pr.id = pay.project_id
        WHERE pr.stage <> 'cancelled'
      ),0) AS outstanding
      FROM projects p WHERE p.stage <> 'cancelled'
    `);

    const num = (v) => Number(v) || 0;
    res.json({
      ok: true,
      totals: {
        clients: num(totals.clients),
        activeProjects: num(totals.active_projects),
        revenueAll: num(totals.revenue_all),
        revenueYear: num(totals.revenue_year),
        revenue30: num(totals.revenue_30),
        pipeline: num(totals.pipeline),
        outstanding: Math.max(0, num(owed.outstanding)),
        leadsTotal: num(totals.leads_total),
        leadsWon: num(totals.leads_won),
        leadsNew: num(totals.leads_new),
        winRate: num(totals.leads_total)
          ? Math.round((num(totals.leads_won) / num(totals.leads_total)) * 100)
          : 0,
      },
      revenueMonthly: revenueMonthly.map((r) => ({ month: r.month, total: num(r.total) })),
      byService: byService.map((r) => ({
        key: r.key_name, projects: num(r.projects), revenue: num(r.revenue),
      })),
      byStage: byStage.map((r) => ({ key: r.key_name, n: num(r.n), value: num(r.value) })),
      bySource: bySource.map((r) => ({ key: r.key_name, n: num(r.n) })),
    });
  } catch (err) {
    console.error("Overview failed:", err.message);
    res.status(500).json({ error: "Could not load the overview." });
  }
});

/* ── Clients ───────────────────────────────────────────────────────── */
router.get("/clients", async (req, res) => {
  try {
    const q = str(req.query.q, 80);
    const params = [];
    let where = "";
    if (q) {
      where = "WHERE c.name LIKE ? OR c.company LIKE ? OR c.email LIKE ?";
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    const rows = await db.query(
      `SELECT c.*,
              COUNT(DISTINCT p.id)                             AS project_count,
              COALESCE(SUM(DISTINCT p.price_total), 0)          AS contracted,
              (SELECT COALESCE(SUM(amount),0) FROM payments pay
                 JOIN projects pr ON pr.id = pay.project_id
                WHERE pr.client_id = c.id)                      AS paid,
              (SELECT stage FROM projects WHERE client_id = c.id
                ORDER BY updated_at DESC LIMIT 1)               AS latest_stage
       FROM clients c
       LEFT JOIN projects p ON p.client_id = c.id
       ${where}
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT 200`,
      params
    );
    res.json({
      ok: true,
      clients: rows.map((r) => ({
        ...r,
        project_count: Number(r.project_count) || 0,
        contracted: Number(r.contracted) || 0,
        paid: Number(r.paid) || 0,
      })),
    });
  } catch (err) {
    console.error("List clients failed:", err.message);
    res.status(500).json({ error: "Could not load clients." });
  }
});

router.post("/clients", async (req, res) => {
  const name = str(req.body?.name, 120);
  if (name.length < 2) return res.status(422).json({ error: "A client needs a name." });
  const source = SOURCES.includes(req.body?.source) ? req.body.source : "direct";
  try {
    const result = await db.query(
      `INSERT INTO clients (name, company, email, phone, country, source, notes)
       VALUES (?,?,?,?,?,?,?)`,
      [
        name,
        str(req.body?.company, 140) || null,
        str(req.body?.email, 190).toLowerCase() || null,
        str(req.body?.phone, 40) || null,
        str(req.body?.country, 80) || null,
        source,
        str(req.body?.notes, 4000) || null,
      ]
    );
    res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error("Create client failed:", err.message);
    res.status(500).json({ error: "Could not save that client." });
  }
});

router.get("/clients/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id." });
  try {
    const client = await db.one("SELECT * FROM clients WHERE id = ?", [id]);
    if (!client) return res.status(404).json({ error: "Not found." });

    const projects = await db.query(
      `SELECT p.*,
              (SELECT COALESCE(SUM(amount),0) FROM payments WHERE project_id = p.id) AS paid
       FROM projects p WHERE p.client_id = ? ORDER BY p.created_at DESC`,
      [id]
    );

    for (const p of projects) {
      p.price_total = Number(p.price_total) || 0;
      p.paid = Number(p.paid) || 0;
      p.payments = await db.query(
        "SELECT id, amount, kind, method, note, paid_at FROM payments WHERE project_id = ? ORDER BY paid_at DESC",
        [p.id]
      );
      p.payments.forEach((x) => { x.amount = Number(x.amount) || 0; });
      p.updates = await db.query(
        "SELECT id, note, stage_to, created_at FROM project_updates WHERE project_id = ? ORDER BY created_at DESC LIMIT 50",
        [p.id]
      );
    }

    res.json({ ok: true, client, projects });
  } catch (err) {
    console.error("Get client failed:", err.message);
    res.status(500).json({ error: "Could not load that client." });
  }
});

router.patch("/clients/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id." });
  const map = { name: 120, company: 140, email: 190, phone: 40, country: 80, notes: 4000 };
  const sets = [];
  const params = [];
  Object.entries(map).forEach(([key, max]) => {
    if (req.body?.[key] === undefined) return;
    sets.push(`${key} = ?`);
    params.push(str(req.body[key], max) || null);
  });
  if (req.body?.source !== undefined && SOURCES.includes(req.body.source)) {
    sets.push("source = ?");
    params.push(req.body.source);
  }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update." });
  try {
    params.push(id);
    await db.query(`UPDATE clients SET ${sets.join(", ")} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (err) {
    console.error("Update client failed:", err.message);
    res.status(500).json({ error: "Could not save that." });
  }
});

router.delete("/clients/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id." });
  try {
    await db.query("DELETE FROM clients WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Could not delete that." });
  }
});

/* Turn a won lead into a client, carrying its brief across so nothing
   has to be retyped. */
router.post("/leads/:id/convert", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id." });
  try {
    const lead = await db.one("SELECT * FROM leads WHERE id = ?", [id]);
    if (!lead) return res.status(404).json({ error: "Lead not found." });

    const existing = await db.one("SELECT id FROM clients WHERE lead_id = ?", [id]);
    if (existing)
      return res.status(409).json({ error: "This lead is already a client.", clientId: existing.id });

    const client = await db.query(
      `INSERT INTO clients (lead_id, name, company, email, phone, source, notes)
       VALUES (?,?,?,?,?, 'website', ?)`,
      [id, lead.name, lead.company, lead.email, lead.phone, lead.notes]
    );

    const priceGuess = {
      under_1k: 800, "1k_3k": 2000, "3k_7k": 5000, "7k_plus": 9000, not_sure: 0,
    }[lead.budget] || 0;

    const project = await db.query(
      `INSERT INTO projects (client_id, title, project_type, stage, price_total, brief)
       VALUES (?,?,?, 'proposal', ?, ?)`,
      [
        client.insertId,
        `${lead.name} — ${lead.project_type}`,
        lead.project_type,
        priceGuess,
        lead.details,
      ]
    );
    await db.query(
      "INSERT INTO project_updates (project_id, note, stage_to) VALUES (?,?,?)",
      [project.insertId, "Created from the website brief.", "proposal"]
    );
    await db.query("UPDATE leads SET status = 'won' WHERE id = ?", [id]);

    res.status(201).json({ ok: true, clientId: client.insertId, projectId: project.insertId });
  } catch (err) {
    console.error("Convert lead failed:", err.message);
    res.status(500).json({ error: "Could not convert that lead." });
  }
});

/* ── Projects ──────────────────────────────────────────────────────── */
router.post("/projects", async (req, res) => {
  const clientId = Number.parseInt(req.body?.clientId, 10);
  const title = str(req.body?.title, 180);
  if (!Number.isFinite(clientId) || title.length < 2)
    return res.status(422).json({ error: "A project needs a client and a title." });
  try {
    const result = await db.query(
      `INSERT INTO projects (client_id, title, project_type, stage, price_total, brief, due_at)
       VALUES (?,?,?,?,?,?,?)`,
      [
        clientId,
        title,
        PROJECT_TYPES.includes(req.body?.projectType) ? req.body.projectType : "other",
        STAGES.includes(req.body?.stage) ? req.body.stage : "brief",
        money(req.body?.priceTotal),
        str(req.body?.brief, 6000) || null,
        dateOrNull(req.body?.dueAt),
      ]
    );
    res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error("Create project failed:", err.message);
    res.status(500).json({ error: "Could not create that project." });
  }
});

router.patch("/projects/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id." });

  const sets = [];
  const params = [];
  let newStage = null;

  if (req.body?.stage !== undefined) {
    if (!STAGES.includes(req.body.stage)) return res.status(422).json({ error: "Unknown stage." });
    newStage = req.body.stage;
    sets.push("stage = ?");
    params.push(newStage);
    if (newStage === "delivered") sets.push("delivered_at = COALESCE(delivered_at, CURDATE())");
  }
  if (req.body?.title !== undefined) { sets.push("title = ?"); params.push(str(req.body.title, 180)); }
  if (req.body?.projectType !== undefined && PROJECT_TYPES.includes(req.body.projectType)) {
    sets.push("project_type = ?"); params.push(req.body.projectType);
  }
  if (req.body?.priceTotal !== undefined) { sets.push("price_total = ?"); params.push(money(req.body.priceTotal)); }
  if (req.body?.progress !== undefined) {
    const p = Math.max(0, Math.min(100, Number.parseInt(req.body.progress, 10) || 0));
    sets.push("progress = ?"); params.push(p);
  }
  ["brief", "requirements"].forEach((k) => {
    if (req.body?.[k] === undefined) return;
    sets.push(`${k} = ?`); params.push(str(req.body[k], 6000) || null);
  });
  ["startedAt", "dueAt"].forEach((k) => {
    if (req.body?.[k] === undefined) return;
    sets.push(`${k === "startedAt" ? "started_at" : "due_at"} = ?`);
    params.push(dateOrNull(req.body[k]));
  });

  if (!sets.length) return res.status(400).json({ error: "Nothing to update." });

  try {
    params.push(id);
    await db.query(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`, params);
    const note = str(req.body?.note, 2000);
    if (newStage || note) {
      await db.query(
        "INSERT INTO project_updates (project_id, note, stage_to) VALUES (?,?,?)",
        [id, note || null, newStage]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Update project failed:", err.message);
    res.status(500).json({ error: "Could not save that." });
  }
});

router.delete("/projects/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id." });
  try {
    await db.query("DELETE FROM projects WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Could not delete that." });
  }
});

/* ── Payments ──────────────────────────────────────────────────────── */
router.post("/projects/:id/payments", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const amount = money(req.body?.amount);
  if (!Number.isFinite(id) || amount <= 0)
    return res.status(422).json({ error: "A payment needs an amount above zero." });
  try {
    await db.query(
      "INSERT INTO payments (project_id, amount, kind, method, note, paid_at) VALUES (?,?,?,?,?,?)",
      [
        id,
        amount,
        KINDS.includes(req.body?.kind) ? req.body.kind : "milestone",
        str(req.body?.method, 60) || null,
        str(req.body?.note, 255) || null,
        dateOrNull(req.body?.paidAt) || new Date().toISOString().slice(0, 10),
      ]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Add payment failed:", err.message);
    res.status(500).json({ error: "Could not record that payment." });
  }
});

router.delete("/payments/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id." });
  try {
    await db.query("DELETE FROM payments WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Could not delete that payment." });
  }
});

module.exports = router;
