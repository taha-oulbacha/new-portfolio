/* Clears the test data out of the database.
   Usage:
     npm run wipe-demo            everything: leads, clients, projects, payments, reviews
     npm run wipe-demo -- --leads only the leads
   Your admin logins are never touched. */
const readline = require("readline");
const db = require("../db");

const only = process.argv.slice(2);
const onlyLeads = only.includes("--leads");
const force = only.includes("--yes");

const ask = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });

(async () => {
  const [counts] = await db.query(`
    SELECT (SELECT COUNT(*) FROM leads)    AS leads,
           (SELECT COUNT(*) FROM clients)  AS clients,
           (SELECT COUNT(*) FROM projects) AS projects,
           (SELECT COUNT(*) FROM payments) AS payments,
           (SELECT COUNT(*) FROM reviews)  AS reviews
  `);

  console.log("\nCurrently in the database:");
  console.log(`  leads     ${counts.leads}`);
  if (!onlyLeads) {
    console.log(`  clients   ${counts.clients}`);
    console.log(`  projects  ${counts.projects}`);
    console.log(`  payments  ${counts.payments}`);
    console.log(`  reviews   ${counts.reviews}`);
  }

  const target = onlyLeads
    ? "every lead"
    : "every lead, client, project, payment and review";
  console.log(`\nThis deletes ${target}. Admin logins stay.\n`);

  if (!force) {
    const answer = await ask('Type DELETE to confirm (anything else cancels): ');
    if (answer !== "DELETE") {
      console.log("Cancelled. Nothing was deleted.");
      process.exit(0);
    }
  }

  // Order matters: children first, then parents.
  await db.queryRaw("DELETE FROM lead_events");
  if (!onlyLeads) {
    await db.queryRaw("DELETE FROM payments");
    await db.queryRaw("DELETE FROM project_updates");
    await db.queryRaw("DELETE FROM projects");
    await db.queryRaw("DELETE FROM clients");
    await db.queryRaw("DELETE FROM reviews");
  }
  await db.queryRaw("DELETE FROM leads");

  // Start counting from 1 again so the next real lead is #1.
  const tables = onlyLeads
    ? ["leads", "lead_events"]
    : ["leads", "lead_events", "clients", "projects", "payments", "project_updates", "reviews"];
  for (const t of tables) await db.queryRaw(`ALTER TABLE ${t} AUTO_INCREMENT = 1`);

  console.log("\nDone. The dashboard is empty and ready for real work.");
  process.exit(0);
})().catch((err) => {
  console.error("Wipe failed:", err.message);
  process.exit(1);
});
