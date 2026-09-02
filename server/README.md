# Portfolio backend — lead intake + dashboard

Node/Express API and admin dashboard behind the **Let's build your website** button on
[taha-oulbacha.com](https://taha-oulbacha.com). Stores every project brief in MySQL and
gives you one page to work them.

```
server/
├── src/
│   ├── index.js            Express app, CORS, security headers
│   ├── config.js           every env var, read once
│   ├── db.js               mysql2 connection pool
│   ├── schema.sql          tables
│   ├── migrate.js          creates the DB + applies schema (safe to re-run)
│   ├── validate.js         server-side validation, the only one that counts
│   ├── mailer.js           optional "new lead" email
│   ├── middleware/auth.js  JWT in an httpOnly cookie
│   ├── routes/leads.js     public: submit a brief, flag a booking click
│   ├── routes/auth.js      login / logout / me
│   ├── routes/admin.js     list, filter, update, stats, CSV export
│   └── scripts/            create-admin, seed
└── public/admin/           the dashboard (served at /admin)
```

## Run it locally

```bash
cd server
cp .env.example .env          # fill in DB_* and JWT_SECRET
npm install
npm run migrate               # creates the database and tables
npm run create-admin -- you@example.com "a long password"
npm run seed                  # optional: 40 fake leads so the charts aren't empty
npm run dev
```

API on `http://localhost:3000`, dashboard on `http://localhost:3000/admin`.

Then in the site's `config.js` (repo root) set `apiBase: "http://localhost:3000"` and
open the site with any static server — `npx serve .` or VS Code Live Server. Opening
`index.html` as a `file://` URL will not work; the browser blocks the API call.

## Deploy to Railway (no terminal needed)

Everything here is done on railway.app in the browser.

1. **Push this repo to GitHub** (the `server/` folder lives in the same repo as the site).
2. **railway.app → New Project → Deploy from GitHub repo** → pick the repo.
3. Open the service → **Settings → Source → Root Directory** → type `server` → save.
   Railway then runs `npm install` and `npm start` by itself.
4. Back in the project → **+ Create → Database → MySQL**.
5. Open the Node service → **Variables** → **+ New Variable** for each:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{MySQL.MYSQL_URL}}` — type it exactly, Railway resolves it |
   | `JWT_SECRET` | a long random string (50+ characters, any mash of letters and digits) |
   | `NODE_ENV` | `production` |
   | `CORS_ORIGINS` | `https://taha-oulbacha.com,https://www.taha-oulbacha.com` |
   | `ADMIN_EMAIL` | your dashboard login |
   | `ADMIN_PASSWORD` | a strong password, at least 10 characters |

6. **Settings → Networking → Generate Domain.** You get something like
   `portfolio-api-production.up.railway.app`.
7. Watch **Deployments → View Logs**. You want to see `Migrations applied.`,
   `API listening`, and `First admin created: …`.

The tables build themselves on first boot (`npm start` runs the migration first),
and `ADMIN_EMAIL` / `ADMIN_PASSWORD` create your login the first time the admin
table is empty. Neither ever runs twice, so both are safe to leave in place —
though you may as well delete the two admin variables once you have logged in.

8. **Point the site at it** — edit `config.js` in the repo root:

   ```js
   window.PORTFOLIO_CONFIG = {
     apiBase: "https://portfolio-api-production.up.railway.app",
   };
   ```

   Commit and push. GitHub Pages redeploys the static site.

Your dashboard is then at `https://<your-railway-domain>/admin`.

### Doing it from the terminal instead

With the Railway CLI (`brew install railway`), the same thing is:

```bash
cd server
railway login && railway init
railway add --database mysql
railway add --service portfolio-api \
  --variables 'DATABASE_URL=${{MySQL.MYSQL_URL}}' \
  --variables "JWT_SECRET=$(openssl rand -hex 48)" \
  --variables "NODE_ENV=production" \
  --variables "CORS_ORIGINS=https://taha-oulbacha.com"
railway up && railway domain
```

### Optional: a subdomain for the API

Point `api.taha-oulbacha.com` at Railway with a CNAME, add it under
**Settings → Networking → Custom Domain**, and use that as `apiBase`. Nicer URLs, and
you can move hosts later without touching the site.

### Optional: email on every new lead

Fill the `SMTP_*` and `MAIL_TO` variables. With a Gmail account use an
[App Password](https://myaccount.google.com/apppasswords), host `smtp.gmail.com`,
port `587`. Leave `SMTP_HOST` empty and notifications are simply skipped — leads
are always saved either way.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/leads` | public | submit a brief (rate limited, honeypot) |
| `POST` | `/api/leads/:token/booked` | token | mark that they clicked through to the calendar |
| `POST` | `/api/auth/login` | public | sets the session cookie |
| `POST` | `/api/auth/logout` | cookie | clears it |
| `GET` | `/api/auth/me` | cookie | who am I |
| `GET` | `/api/admin/leads` | cookie | list — `?q=&status=&type=&budget=&booked=1&page=` |
| `GET` | `/api/admin/leads/:id` | cookie | one lead + its history |
| `PATCH` | `/api/admin/leads/:id` | cookie | change status, save notes |
| `DELETE` | `/api/admin/leads/:id` | cookie | delete |
| `GET` | `/api/admin/stats` | cookie | KPIs, 30-day trend, breakdowns |
| `GET` | `/api/admin/export.csv` | cookie | CSV of the current filter |
| `GET` | `/api/health` | public | uptime check |

## Clients, projects and money

Leads are people who asked. Clients are people you work with. A won lead becomes a
client with one button — the brief, contact details and budget carry across, so nothing
is retyped. Clients who came from Upwork, a referral or real life are added by hand.

Each client holds one or more **projects**, and each project is a full report: what they
asked for, the stage the work is at, a progress slider, the agreed price, and every
payment actually received. Revenue is always the sum of `payments` — never of
`price_total` — so the dashboard shows money in the bank, not money hoped for.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/overview` | KPIs, 12-month revenue, pipeline, offers, sources |
| `GET` `POST` | `/api/admin/clients` | list / create (including offline clients) |
| `GET` `PATCH` `DELETE` | `/api/admin/clients/:id` | full report / edit / remove |
| `POST` | `/api/admin/leads/:id/convert` | won lead → client + project |
| `POST` `PATCH` `DELETE` | `/api/admin/projects…` | stage, price, progress, brief |
| `POST` | `/api/admin/projects/:id/payments` | record money received |

## Client reviews

The About page renders whatever `GET /api/reviews` returns, so nothing is hardcoded.

- **You add one** in the dashboard's Reviews tab — name, role, project, rating, photo.
  It goes live immediately.
- **A client adds one** from the "Leave a review" button on the About page. It is saved
  as pending, they get an email with a link to prove the address is theirs, and it only
  appears on the site after you approve it. Two gates, both required.
- Photos are cropped to a 256px square in the browser and stored in MySQL as a blob,
  so they survive every redeploy without needing a disk or an S3 bucket.

Verification emails need the `SMTP_*` variables. Without them a client's review is
still saved (losing a real review would be worse) and the dashboard flags it
"Email not verified" so you know to confirm it yourself.

| Method | Path | Auth |
|---|---|---|
| `GET` | `/api/reviews` | public — approved only |
| `GET` | `/api/reviews/:id/avatar` | public — approved only |
| `POST` | `/api/reviews` | public, rate limited, honeypot |
| `GET` | `/api/reviews/verify/:token` | from the email |
| `GET` | `/api/admin/reviews` | cookie |
| `POST` | `/api/admin/reviews` | cookie — publishes straight away |
| `PATCH` | `/api/admin/reviews/:id` | cookie — approve / reject / edit |
| `DELETE` | `/api/admin/reviews/:id` | cookie |

## What protects this

- **Validation is server-side.** The browser checks are only there to be polite; nothing
  reaches the database without passing `validate.js`.
- **Parameterised queries** everywhere. The only interpolated values are `LIMIT`/`OFFSET`,
  which are parsed as integers first — MySQL refuses to bind those.
- **Rate limits**: 8 submissions per IP per 10 minutes, 10 login attempts per 15 minutes.
- **Honeypot** field that people never see and bots usually fill.
- **Passwords** are bcrypt hashes (cost 12). Login answers "wrong email or password"
  either way and still runs a comparison when the user does not exist, so response time
  does not reveal which accounts are real.
- **Session** is a signed JWT in an httpOnly, secure, SameSite cookie — unreadable to
  page scripts.
- **CORS** allows only the origins you list, plus the dashboard's own origin.
- **IP addresses are stored hashed**, never in the clear.

## Backups

Railway snapshots the MySQL volume, but take your own too: the dashboard's **Export CSV**
button downloads everything matching the current filter. Worth doing monthly.
