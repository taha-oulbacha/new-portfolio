/* Fills the table with believable demo leads so you can see the dashboard
   populated before real traffic arrives. Never run this in production. */
const crypto = require("crypto");
const db = require("../db");

const types = ["website", "ecommerce", "webapp", "dashboard", "redesign", "automation"];
const budgets = ["under_1k", "1k_3k", "3k_7k", "7k_plus", "not_sure"];
const timelines = ["asap", "1_month", "1_3_months", "flexible"];
const statuses = ["new", "new", "new", "contacted", "qualified", "won", "lost"];
const names = [
  "Mohammed Saadi", "Laura Bennett", "Youssef Idrissi", "Emma Clarke",
  "Karim Benali", "Sofia Rossi", "David Okafor", "Nadia Haddad",
  "Tom Whitfield", "Amine Cherkaoui", "Julia Meyer", "Omar Fassi",
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

(async () => {
  for (let i = 0; i < 40; i++) {
    const name = pick(names);
    const daysAgo = Math.floor(Math.random() * 30);
    const res = await db.query(
      `INSERT INTO leads
        (public_token, name, email, phone, company, project_type, budget, timeline,
         details, status, booked, source, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [
        crypto.randomBytes(16).toString("hex"),
        name,
        `${name.split(" ")[0].toLowerCase()}${i}@example.com`,
        "+212 6 00 00 00 00",
        Math.random() > 0.5 ? "Acme Co" : null,
        pick(types),
        pick(budgets),
        pick(timelines),
        "Looking to get something built soon, would like to discuss scope.",
        pick(statuses),
        Math.random() > 0.6 ? 1 : 0,
        "hero_cta",
        daysAgo,
      ]
    );
    await db.query("INSERT INTO lead_events (lead_id, type) VALUES (?,?)", [
      res.insertId,
      "created",
    ]);
  }
  console.log("Seeded 40 demo leads.");
  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
