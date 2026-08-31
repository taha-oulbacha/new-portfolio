const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const config = require("./config");
const db = require("./db");

const app = express();

// Railway / Render / nginx sit in front, so trust one proxy hop for req.ip
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        // every font is served from this app, so no external host is needed
        fontSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    // The site and this API live on different domains, so review avatars
    // must be allowed to load cross-origin.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

/* The dashboard is served by this same service, so its own origin must always
   be allowed — otherwise setting CORS_ORIGINS for the public site locks the
   admin panel out of its own API. */
app.use(
  cors((req, cb) => {
    const origin = req.headers.origin;
    const selfOrigin = `${req.protocol}://${req.headers.host}`;

    // In development anything goes. Which port Live Server, `npx serve` or a
    // plain file:// page happens to use is not worth debugging.
    const allowed =
      config.env !== "production" ||
      !origin ||                            // curl, server-to-server, same-origin GETs
      origin === selfOrigin ||              // the admin dashboard
      config.corsOrigins.length === 0 ||
      config.corsOrigins.includes(origin);

    if (!allowed) return cb(new Error("Origin not allowed"));
    cb(null, { origin: origin || true, credentials: true });
  })
);

app.use(express.json({ limit: "2mb" })); // review avatars arrive as data URLs
app.use(cookieParser());

app.get("/api/health", async (req, res) => {
  try {
    await db.ping();
    res.json({ ok: true, db: "up" });
  } catch {
    res.status(503).json({ ok: false, db: "down" });
  }
});

app.use("/api/leads", require("./routes/leads"));
app.use("/api/reviews", require("./routes/reviews"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/admin", require("./routes/clients"));

// The dashboard is served by this same service at /admin
app.use("/admin", express.static(path.join(__dirname, "..", "public", "admin")));
app.get("/", (req, res) => res.redirect("/admin"));

app.use((req, res) => res.status(404).json({ error: "Not found." }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.message === "Origin not allowed")
    return res.status(403).json({ error: "Origin not allowed." });
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Server error." });
});

app.listen(config.port, () => {
  console.log(`API listening on :${config.port} (${config.env})`);
  console.log(`Dashboard: http://localhost:${config.port}/admin`);
});
