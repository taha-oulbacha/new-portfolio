const nodemailer = require("nodemailer");
const config = require("./config");

let transport = null;
if (config.mail.host && config.mail.to) {
  transport = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: config.mail.user
      ? { user: config.mail.user, pass: config.mail.pass }
      : undefined,
  });
}

const LABEL = {
  website: "Standard website",
  ecommerce: "E-commerce store",
  webapp: "Web app / internal tool",
  dashboard: "Data dashboard",
  redesign: "Redesign of an existing site",
  automation: "Automation / bot",
  other: "Something else",
  under_1k: "Under $1,000",
  "1k_3k": "$1,000 – $3,000",
  "3k_7k": "$3,000 – $7,000",
  "7k_plus": "$7,000+",
  not_sure: "Not sure yet",
  asap: "As soon as possible",
  "1_month": "Within a month",
  "1_3_months": "1–3 months",
  flexible: "Flexible",
};

/* Never let a mail failure break a lead submission. */
async function notifyNewLead(lead) {
  if (!transport) return;
  const lines = [
    `Name:      ${lead.name}`,
    `Email:     ${lead.email}`,
    `Phone:     ${lead.phone || "—"}`,
    `Company:   ${lead.company || "—"}`,
    `Wants:     ${LABEL[lead.projectType] || lead.projectType}`,
    `Budget:    ${LABEL[lead.budget] || lead.budget}`,
    `Timeline:  ${LABEL[lead.timeline] || lead.timeline}`,
    "",
    lead.details || "(no extra details)",
  ];
  try {
    await transport.sendMail({
      from: config.mail.from,
      to: config.mail.to,
      replyTo: lead.email,
      subject: `New lead: ${lead.name} — ${LABEL[lead.projectType] || lead.projectType}`,
      text: lines.join("\n"),
    });
  } catch (err) {
    console.error("Lead email failed (lead was still saved):", err.message);
  }
}

/* Verification email for a review a client left themselves. Returns whether
   it actually went out, so the caller can tell the person the truth. */
async function sendVerification(email, name, token) {
  if (!transport) return false;
  const base = (config.publicUrl || "").replace(/\/$/, "");
  const link = `${base}/api/reviews/verify/${token}`;
  try {
    await transport.sendMail({
      from: config.mail.from,
      to: email,
      subject: "Confirm your review for Taha Oulbacha",
      text: [
        `Hi ${name},`,
        "",
        "Thanks for taking the time to write about our work together.",
        "Click the link below to confirm it was really you:",
        "",
        link,
        "",
        "If you didn't write a review, just ignore this email — nothing will be published.",
      ].join("\n"),
      html: `<p>Hi ${name},</p>
<p>Thanks for taking the time to write about our work together.<br>
Click below to confirm it was really you:</p>
<p><a href="${link}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#d9f871;color:#0b0b0b;text-decoration:none;font-weight:600">Confirm my review</a></p>
<p style="color:#777;font-size:13px">If you didn't write a review, ignore this email — nothing will be published.</p>`,
    });
    return true;
  } catch (err) {
    console.error("Verification email failed:", err.message);
    return false;
  }
}

module.exports = { notifyNewLead, sendVerification, LABEL };
