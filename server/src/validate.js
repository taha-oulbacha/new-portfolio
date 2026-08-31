const PROJECT_TYPES = [
  "website",
  "ecommerce",
  "webapp",
  "dashboard",
  "redesign",
  "automation",
  "other",
];
const BUDGETS = ["under_1k", "1k_3k", "3k_7k", "7k_plus", "not_sure"];
const TIMELINES = ["asap", "1_month", "1_3_months", "flexible"];
const STATUSES = ["new", "contacted", "qualified", "won", "lost"];

const clean = (v, max) =>
  typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function validateLead(body = {}) {
  const errors = {};

  const name = clean(body.name, 120);
  if (name.length < 2) errors.name = "Please enter your name.";

  const email = clean(body.email, 190).toLowerCase();
  if (!EMAIL_RE.test(email)) errors.email = "Please enter a valid email address.";

  // Phone is optional but must look plausible when present.
  const phoneRaw = clean(body.phone, 40);
  const phone = phoneRaw ? phoneRaw.replace(/[^\d+()\-\s]/g, "") : "";
  if (phoneRaw && phone.replace(/\D/g, "").length < 6)
    errors.phone = "That phone number looks too short.";

  const company = clean(body.company, 120) || null;

  const projectType = PROJECT_TYPES.includes(body.projectType)
    ? body.projectType
    : null;
  if (!projectType) errors.projectType = "Pick what you want built.";

  const budget = BUDGETS.includes(body.budget) ? body.budget : null;
  if (!budget) errors.budget = "Pick a budget range.";

  const timeline = TIMELINES.includes(body.timeline) ? body.timeline : null;
  if (!timeline) errors.timeline = "Pick a timeline.";

  const details =
    typeof body.details === "string" ? body.details.trim().slice(0, 4000) : "";

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      name,
      email,
      phone: phone || null,
      company,
      projectType,
      budget,
      timeline,
      details: details || null,
    },
  };
}

module.exports = { validateLead, PROJECT_TYPES, BUDGETS, TIMELINES, STATUSES };
