/* One place to point the site at the backend.

   Local dev:  http://localhost:3000  (or whatever PORT you set in server/.env)
   Production: the URL Railway gives your service, e.g.
               https://xxxx.up.railway.app  or  https://api.taha-oulbacha.com

   This MUST match the port the API is actually listening on. If they drift
   apart, every form on the site fails with "Failed to fetch". */
window.PORTFOLIO_CONFIG = {
  apiBase: "http://localhost:3100",
};

/* Development-only sanity check. Silently does nothing in production.
   If the API can't be reached it says so in the console with the fix,
   instead of leaving you guessing at a generic fetch error. */
(() => {
  const host = location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return;

  const base = window.PORTFOLIO_CONFIG.apiBase.replace(/\/$/, "");
  fetch(`${base}/api/health`)
    .then((r) => r.ok || Promise.reject(new Error(String(r.status))))
    .catch(() => {
      console.warn(
        `%c[portfolio] Cannot reach the API at ${base}\n` +
          `The forms on this page will fail until this is fixed.\n\n` +
          `  1. Is the server running?   cd server && npm start\n` +
          `  2. Does the port match?     check PORT in server/.env\n` +
          `     and set apiBase in config.js to the same number.`,
        "color:#d9f871;background:#111;padding:6px 10px;border-radius:6px"
      );
    });
})();
