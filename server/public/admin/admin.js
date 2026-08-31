/* Studio dashboard — leads, clients, money and reviews.
   Talks to the same origin that serves this page. */
(() => {
  "use strict";

  const LABEL = {
    website: "Website", ecommerce: "E-commerce", webapp: "Web app / SaaS",
    dashboard: "Dashboard", redesign: "Redesign", automation: "Automation",
    other: "Custom system",
    under_1k: "Under $1k", "1k_3k": "$1k – $3k", "3k_7k": "$3k – $7k",
    "7k_plus": "$7k+", not_sure: "Not sure yet",
    asap: "As soon as possible", "1_month": "Within a month",
    "1_3_months": "1–3 months", flexible: "Flexible",
    new: "New", contacted: "Contacted", qualified: "Qualified", won: "Won", lost: "Lost",
    pending: "Waiting for you", approved: "Live", rejected: "Rejected",
    brief: "Brief", proposal: "Proposal", agreed: "Agreed", building: "Building",
    review: "In review", delivered: "Delivered", cancelled: "Cancelled",
    upwork: "Upwork", referral: "Referral", direct: "Direct", "": "—",
  };
  const TYPES = ["website", "ecommerce", "webapp", "dashboard", "redesign", "automation", "other"];
  const BUDGETS = ["under_1k", "1k_3k", "3k_7k", "7k_plus", "not_sure"];
  const STATUSES = ["new", "contacted", "qualified", "won", "lost"];
  const STAGES = ["brief", "proposal", "agreed", "building", "review", "delivered", "cancelled"];
  const SOURCES = ["website", "upwork", "referral", "direct", "other"];

  const $ = (id) => document.getElementById(id);
  const label = (k) => LABEL[k] || k || "—";
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  };
  const initials = (name) =>
    String(name || "?").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const money = (n) =>
    "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

  const api = async (path, options = {}) => {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    let data = null;
    try { data = await res.json(); } catch { /* not json */ }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  };

  let toastTimer;
  const toast = (msg, isError = false) => {
    const t = $("toast");
    t.textContent = msg;
    t.classList.toggle("is-error", isError);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
  };

  const fmtDate = (v) => {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" });
  };
  const fmtDateTime = (v) => {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return `${fmtDate(v)} · ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  };

  const state = { page: 1, filters: {}, pages: 1 };

  // ── Auth ──────────────────────────────────────────────────
  const showLogin = () => { $("loginScreen").hidden = false; $("app").hidden = true; };
  const showApp = (email) => {
    $("loginScreen").hidden = true;
    $("app").hidden = false;
    $("who").textContent = email || "";
  };

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("loginBtn"), err = $("loginError");
    err.textContent = ""; btn.disabled = true; btn.textContent = "Signing in…";
    try {
      const form = new FormData(e.target);
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      showApp(data.email);
      await boot();
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false; btn.textContent = "Sign in";
    }
  });

  $("logoutBtn").addEventListener("click", async () => {
    try { await api("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    showLogin();
  });

  // ── Charts ────────────────────────────────────────────────
  function barChart(host, series, { accentLast = true, fmt = (v) => v } = {}) {
    host.textContent = "";
    const max = Math.max(1, ...series.map((s) => s.value));
    const W = 100, H = 42, pad = 2;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H + 8}`);
    svg.setAttribute("preserveAspectRatio", "none");

    [0, 0.5, 1].forEach((f) => {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      const y = pad + (H - pad * 2) * f;
      line.setAttribute("x1", 0); line.setAttribute("x2", W);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      line.setAttribute("class", "grid-line");
      line.setAttribute("vector-effect", "non-scaling-stroke");
      svg.appendChild(line);
    });

    const slot = W / Math.max(series.length, 1);
    series.forEach((s, i) => {
      const h = s.value === 0 ? 0.5 : ((H - pad * 2) * s.value) / max;
      const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("x", i * slot + slot * 0.2);
      r.setAttribute("width", slot * 0.6);
      r.setAttribute("y", H - pad - h);
      r.setAttribute("height", h);
      r.setAttribute("rx", 0.7);
      r.setAttribute("class", `bar${s.value === 0 ? " dim" : ""}`);
      if (accentLast && i !== series.length - 1) r.style.opacity = s.value === 0 ? 0.14 : 0.55;
      const t = document.createElementNS("http://www.w3.org/2000/svg", "title");
      t.textContent = `${s.label}: ${fmt(s.value)}`;
      r.appendChild(t);
      svg.appendChild(r);

      if (series.length <= 14) {
        const lbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
        lbl.setAttribute("x", i * slot + slot / 2);
        lbl.setAttribute("y", H + 5);
        lbl.setAttribute("text-anchor", "middle");
        lbl.setAttribute("class", "lbl");
        lbl.textContent = s.short || "";
        svg.appendChild(lbl);
      }
    });
    host.appendChild(svg);
  }

  function renderBars(host, rows, fmt = (v) => v) {
    host.textContent = "";
    if (!rows.length) { host.appendChild(el("p", "bars-empty", "Nothing yet.")); return; }
    const max = Math.max(...rows.map((r) => r.value), 1);
    rows.forEach((r) => {
      const row = el("div", "bar-row");
      const top = el("div", "bar-top");
      top.appendChild(el("span", null, label(r.key)));
      top.appendChild(el("span", null, fmt(r.value)));
      const track = el("div", "bar-track");
      const fill = el("div", "bar-fill");
      fill.style.width = `${(r.value / max) * 100}%`;
      track.appendChild(fill);
      row.appendChild(top); row.appendChild(track);
      host.appendChild(row);
    });
  }

  // ── Overview ──────────────────────────────────────────────
  async function loadOverview() {
    const d = await api("/api/admin/overview");
    const t = d.totals;

    const box = $("ovKpis");
    box.textContent = "";
    [
      { ico: "💰", label: "Revenue this year", value: money(t.revenueYear), foot: `${money(t.revenue30)} in the last 30 days` },
      { ico: "📄", label: "Waiting to be paid", value: money(t.outstanding), foot: "agreed work not yet settled" },
      { ico: "👥", label: "Clients", value: t.clients, foot: `${t.activeProjects} project${t.activeProjects === 1 ? "" : "s"} running` },
      { ico: "🎯", label: "Lead win rate", value: `${t.winRate}%`, foot: `${t.leadsWon} won of ${t.leadsTotal}` },
      { ico: "🔔", label: "Needs a reply", value: t.leadsNew, foot: "new leads sitting there" },
    ].forEach((k) => {
      const card = el("div", "kpi");
      const top = el("div", "kpi-top");
      top.appendChild(el("span", "kpi-ico", k.ico));
      top.appendChild(el("span", "kpi-label", k.label));
      card.appendChild(top);
      card.appendChild(el("div", "kpi-value", k.value));
      if (k.foot) card.appendChild(el("div", "kpi-foot", k.foot));
      box.appendChild(card);
    });

    $("ovRevenueBig").textContent = money(t.revenueAll);
    $("ovPipelineBig").textContent = money(t.pipeline);

    // last 12 months, gaps filled so the shape is honest
    const map = new Map(d.revenueMonthly.map((r) => [r.month, r.total]));
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        label: dt.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        short: dt.toLocaleDateString(undefined, { month: "narrow" }),
        value: map.get(key) || 0,
      });
    }
    barChart($("ovRevenueChart"), months, { fmt: money });

    const funnel = $("ovFunnel");
    funnel.textContent = "";
    const stageMap = new Map(d.byStage.map((s) => [s.key, s]));
    const maxV = Math.max(1, ...d.byStage.map((s) => s.value));
    ["proposal", "agreed", "building", "review", "delivered"].forEach((stage, i) => {
      const s = stageMap.get(stage) || { n: 0, value: 0 };
      const row = el("div", "fn-row");
      row.appendChild(el("span", "fn-name", label(stage)));
      const track = el("div", "fn-track");
      const fill = el("div", `fn-fill c${i % 5}`);
      fill.style.width = `${Math.max(2, (s.value / maxV) * 100)}%`;
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el("span", "fn-val", `${s.n} · ${money(s.value)}`));
      funnel.appendChild(row);
    });

    renderBars($("ovServices"), d.byService.map((s) => ({ key: s.key, value: s.revenue })), money);
    renderBars($("ovSources"), d.bySource.map((s) => ({ key: s.key, value: s.n })), (v) => `${v}`);
  }

  // ── Leads ─────────────────────────────────────────────────
  const queryString = () => {
    const p = new URLSearchParams();
    Object.entries(state.filters).forEach(([k, v]) => { if (v) p.set(k, v); });
    p.set("page", state.page);
    return p.toString();
  };

  async function loadLeadStats() {
    const s = await api("/api/admin/stats");
    const box = $("kpis");
    box.textContent = "";
    [
      { label: "Total leads", value: s.totals.total, foot: `${s.totals.last30} in 30 days` },
      { label: "Last 7 days", value: s.totals.last7 },
      { label: "Waiting on you", value: s.totals.new, foot: "still marked new" },
      { label: "Won", value: s.totals.won },
    ].forEach((k) => {
      const card = el("div", "kpi");
      card.appendChild(el("div", "kpi-label", k.label));
      card.appendChild(el("div", "kpi-value", k.value));
      if (k.foot) card.appendChild(el("div", "kpi-foot", k.foot));
      box.appendChild(card);
    });
    $("leadCount").textContent = s.totals.total;

    const map = new Map(s.daily.map((x) => [x.day, x.n]));
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      days.push({ label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }), value: map.get(key) || 0 });
    }
    barChart($("trendChart"), days, { accentLast: false });
    $("trendNote").textContent = `peak ${Math.max(0, ...days.map((d) => d.value))}/day`;
  }

  async function loadLeads() {
    const data = await api(`/api/admin/leads?${queryString()}`);
    state.pages = data.pages;
    const body = $("leadRows");
    body.textContent = "";

    if (!data.leads.length) {
      const tr = el("tr"); const td = el("td", "cell-empty", "No leads match these filters.");
      td.colSpan = 6; tr.appendChild(td); body.appendChild(tr);
    } else {
      data.leads.forEach((lead) => {
        const tr = el("tr");
        tr.tabIndex = 0;
        tr.appendChild(el("td", "cell-muted", fmtDateTime(lead.created_at)));
        const nameCell = el("td");
        const wrap = el("div", "cell-name");
        wrap.appendChild(el("span", "avatar-dot", initials(lead.name)));
        wrap.appendChild(el("span", null, lead.name));
        nameCell.appendChild(wrap);
        tr.appendChild(nameCell);
        tr.appendChild(el("td", "cell-muted", lead.email));
        tr.appendChild(el("td", null, label(lead.project_type)));
        tr.appendChild(el("td", "cell-muted", label(lead.budget)));
        const st = el("td");
        st.appendChild(el("span", `pill ${lead.status}`, label(lead.status)));
        tr.appendChild(st);
        tr.addEventListener("click", () => openLead(lead.id));
        tr.addEventListener("keydown", (e) => { if (e.key === "Enter") openLead(lead.id); });
        body.appendChild(tr);
      });
    }

    $("resultCount").textContent = `${data.total} lead${data.total === 1 ? "" : "s"}`;
    $("pageLabel").textContent = `Page ${data.page} of ${data.pages}`;
    $("prevPage").disabled = data.page <= 1;
    $("nextPage").disabled = data.page >= data.pages;
    $("exportBtn").href = `/api/admin/export.csv?${queryString()}`;
  }

  // ── Drawer helpers ────────────────────────────────────────
  const closeDrawer = () => { $("drawer").hidden = true; $("drawerBackdrop").hidden = true; };
  $("drawerClose").addEventListener("click", closeDrawer);
  $("drawerBackdrop").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("drawer").hidden) closeDrawer();
  });
  const openDrawer = (title) => {
    $("drawerName").textContent = title;
    const body = $("drawerBody");
    body.textContent = "";
    $("drawer").hidden = false;
    $("drawerBackdrop").hidden = false;
    return body;
  };
  const addField = (grid, k, v, opts = {}) => {
    const f = el("div", `field${opts.full ? " field-full" : ""}`);
    f.appendChild(el("span", "field-label", k));
    const val = el("div", "field-value");
    if (opts.href && v) {
      const a = el("a", null, v); a.href = opts.href; val.appendChild(a);
    } else val.textContent = v || "—";
    f.appendChild(val); grid.appendChild(f);
    return f;
  };

  // ── Lead detail ───────────────────────────────────────────
  async function openLead(id) {
    let payload;
    try { payload = await api(`/api/admin/leads/${id}`); }
    catch (ex) { toast(ex.message, true); return; }
    const { lead, events } = payload;

    const body = openDrawer(lead.name);
    const grid = el("div", "field-grid");
    addField(grid, "Email", lead.email, { href: `mailto:${lead.email}` });
    addField(grid, "Phone", lead.phone, { href: lead.phone ? `tel:${lead.phone}` : null });
    addField(grid, "Company", lead.company);
    addField(grid, "Submitted", fmtDateTime(lead.created_at));
    addField(grid, "Wants", label(lead.project_type));
    addField(grid, "Budget", label(lead.budget));
    addField(grid, "Timeline", label(lead.timeline));
    addField(grid, "Came from", lead.source || "—");
    addField(grid, "What they said", lead.details, { full: true });
    body.appendChild(grid);

    const statusBlock = el("div");
    statusBlock.appendChild(el("div", "section-title", "Status"));
    const row = el("div", "status-row");
    STATUSES.forEach((s) => {
      const b = el("button", `status-btn${s === lead.status ? " is-on" : ""}`, label(s));
      b.type = "button";
      b.addEventListener("click", async () => {
        try {
          await api(`/api/admin/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ status: s }) });
          toast(`Marked ${label(s).toLowerCase()}`);
          await Promise.all([loadLeadStats(), loadLeads()]);
          openLead(lead.id);
        } catch (ex) { toast(ex.message, true); }
      });
      row.appendChild(b);
    });
    statusBlock.appendChild(row);
    body.appendChild(statusBlock);

    const convert = el("button", "btn-primary", "Convert to client →");
    convert.type = "button";
    convert.addEventListener("click", async () => {
      try {
        const r = await api(`/api/admin/leads/${lead.id}/convert`, { method: "POST" });
        toast("Client created from this brief");
        closeDrawer();
        switchView("clients");
        await loadClients();
        openClient(r.clientId);
      } catch (ex) {
        if (ex.message.includes("already a client")) toast("Already a client", true);
        else toast(ex.message, true);
      }
    });
    body.appendChild(convert);

    const notesBlock = el("div");
    notesBlock.appendChild(el("div", "section-title", "Your notes"));
    const ta = el("textarea");
    ta.value = lead.notes || "";
    ta.rows = 3;
    ta.placeholder = "What was said, what to follow up on…";
    notesBlock.appendChild(ta);
    body.appendChild(notesBlock);

    const actions = el("div", "drawer-actions");
    const del = el("button", "btn-danger", "Delete lead");
    del.type = "button";
    del.addEventListener("click", async () => {
      if (!window.confirm(`Delete the lead from ${lead.name}?`)) return;
      try {
        await api(`/api/admin/leads/${lead.id}`, { method: "DELETE" });
        toast("Deleted"); closeDrawer();
        await Promise.all([loadLeadStats(), loadLeads()]);
      } catch (ex) { toast(ex.message, true); }
    });
    const save = el("button", "btn-primary", "Save notes");
    save.type = "button";
    save.addEventListener("click", async () => {
      try {
        await api(`/api/admin/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ notes: ta.value }) });
        toast("Notes saved");
      } catch (ex) { toast(ex.message, true); }
    });
    actions.appendChild(del); actions.appendChild(save);
    body.appendChild(actions);

    if (events.length) {
      const tl = el("div");
      tl.appendChild(el("div", "section-title", "History"));
      const list = el("div", "timeline");
      events.forEach((ev) => {
        const item = el("div", "timeline-item");
        item.appendChild(el("span", "timeline-dot"));
        const text = ev.type === "status_change" ? `Moved to ${label(ev.detail)}` : "Submitted the brief";
        item.appendChild(el("span", null, `${text} · ${fmtDateTime(ev.created_at)}`));
        list.appendChild(item);
      });
      tl.appendChild(list);
      body.appendChild(tl);
    }
  }

  // ── Clients ───────────────────────────────────────────────
  async function loadClients() {
    const q = $("clientSearch").value.trim();
    const data = await api(`/api/admin/clients${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    const body = $("clientRows");
    body.textContent = "";

    if (!data.clients.length) {
      const tr = el("tr");
      const td = el("td", "cell-empty", "No clients yet. Win a lead, or add someone from Upwork or real life.");
      td.colSpan = 6; tr.appendChild(td); body.appendChild(tr);
    } else {
      data.clients.forEach((c) => {
        const tr = el("tr");
        tr.tabIndex = 0;
        const nameCell = el("td");
        const wrap = el("div", "cell-name");
        wrap.appendChild(el("span", "avatar-dot", initials(c.name)));
        const who = el("div");
        who.appendChild(el("div", null, c.name));
        if (c.company) who.appendChild(el("div", "cell-muted", c.company));
        wrap.appendChild(who);
        nameCell.appendChild(wrap);
        tr.appendChild(nameCell);
        tr.appendChild(el("td", "cell-muted", label(c.source)));
        tr.appendChild(el("td", null, c.project_count));
        tr.appendChild(el("td", null, money(c.contracted)));
        tr.appendChild(el("td", null, money(c.paid)));
        const st = el("td");
        if (c.latest_stage) st.appendChild(el("span", `pill ${c.latest_stage}`, label(c.latest_stage)));
        else st.appendChild(el("span", "cell-muted", "—"));
        tr.appendChild(st);
        tr.addEventListener("click", () => openClient(c.id));
        tr.addEventListener("keydown", (e) => { if (e.key === "Enter") openClient(c.id); });
        body.appendChild(tr);
      });
    }
    $("clientNote").textContent = `${data.clients.length} client${data.clients.length === 1 ? "" : "s"}`;
    $("clientCount").textContent = data.clients.length;
  }

  async function openClient(id) {
    let payload;
    try { payload = await api(`/api/admin/clients/${id}`); }
    catch (ex) { toast(ex.message, true); return; }
    const { client, projects } = payload;

    const body = openDrawer(client.name);

    const grid = el("div", "field-grid");
    addField(grid, "Company", client.company);
    addField(grid, "Source", label(client.source));
    addField(grid, "Email", client.email, { href: client.email ? `mailto:${client.email}` : null });
    addField(grid, "Phone", client.phone, { href: client.phone ? `tel:${client.phone}` : null });
    addField(grid, "Client since", fmtDate(client.created_at));
    addField(grid, "Country", client.country);
    body.appendChild(grid);

    // ── each project is its own report
    projects.forEach((p) => body.appendChild(projectCard(p, id)));

    const addProj = el("button", "btn-ghost", "+ Add a project");
    addProj.type = "button";
    addProj.addEventListener("click", async () => {
      const title = window.prompt("Project title", `${client.name} — new project`);
      if (!title) return;
      try {
        await api("/api/admin/projects", {
          method: "POST",
          body: JSON.stringify({ clientId: id, title, stage: "brief" }),
        });
        toast("Project added");
        openClient(id);
        loadClients();
      } catch (ex) { toast(ex.message, true); }
    });
    body.appendChild(addProj);

    const notesBlock = el("div");
    notesBlock.appendChild(el("div", "section-title", "Client notes"));
    const ta = el("textarea");
    ta.rows = 3; ta.value = client.notes || "";
    notesBlock.appendChild(ta);
    body.appendChild(notesBlock);

    const actions = el("div", "drawer-actions");
    const del = el("button", "btn-danger", "Delete client");
    del.type = "button";
    del.addEventListener("click", async () => {
      if (!window.confirm(`Delete ${client.name} and all their projects?`)) return;
      try {
        await api(`/api/admin/clients/${id}`, { method: "DELETE" });
        toast("Client deleted"); closeDrawer(); loadClients(); loadOverview();
      } catch (ex) { toast(ex.message, true); }
    });
    const save = el("button", "btn-primary", "Save notes");
    save.type = "button";
    save.addEventListener("click", async () => {
      try {
        await api(`/api/admin/clients/${id}`, { method: "PATCH", body: JSON.stringify({ notes: ta.value }) });
        toast("Saved");
      } catch (ex) { toast(ex.message, true); }
    });
    actions.appendChild(del); actions.appendChild(save);
    body.appendChild(actions);
  }

  /* The full report for one project: what they want, where the work is,
     what it costs and what has actually been paid. */
  function projectCard(p, clientId) {
    const card = el("div", "proj");
    const due = Math.max(0, p.price_total - p.paid);

    const top = el("div", "proj-top");
    const head = el("div");
    head.appendChild(el("div", "proj-title", p.title));
    head.appendChild(el("div", "proj-sub", `${label(p.project_type)}${p.due_at ? ` · due ${fmtDate(p.due_at)}` : ""}`));
    top.appendChild(head);
    top.appendChild(el("span", `pill ${p.stage}`, label(p.stage)));
    card.appendChild(top);

    if (p.brief) {
      const b = el("div");
      b.appendChild(el("div", "section-title", "What they asked for"));
      b.appendChild(el("div", "field-value", p.brief));
      card.appendChild(b);
    }

    const moneyRow = el("div", "money-row");
    const cell = (k, v, cls) => {
      const c = el("div", `money-cell${cls ? ` ${cls}` : ""}`);
      c.appendChild(el("span", "field-label", k));
      c.appendChild(el("b", null, money(v)));
      return c;
    };
    moneyRow.appendChild(cell("Agreed price", p.price_total));
    moneyRow.appendChild(cell("Paid", p.paid, "paid"));
    moneyRow.appendChild(cell("Still owed", due, "due"));
    card.appendChild(moneyRow);

    // progress
    const prog = el("div");
    prog.appendChild(el("div", "section-title", `Progress — ${p.progress}%`));
    const track = el("div", "progress-track");
    const fill = el("div", "progress-fill");
    fill.style.width = `${p.progress}%`;
    track.appendChild(fill);
    prog.appendChild(track);
    const slider = document.createElement("input");
    slider.type = "range"; slider.min = 0; slider.max = 100; slider.step = 5; slider.value = p.progress;
    slider.style.marginTop = "10px";
    slider.addEventListener("change", async () => {
      try {
        await api(`/api/admin/projects/${p.id}`, {
          method: "PATCH", body: JSON.stringify({ progress: slider.value }),
        });
        fill.style.width = `${slider.value}%`;
        toast(`Progress ${slider.value}%`);
      } catch (ex) { toast(ex.message, true); }
    });
    prog.appendChild(slider);
    card.appendChild(prog);

    // stage
    const stageBlock = el("div");
    stageBlock.appendChild(el("div", "section-title", "Where the work is"));
    const stageRow = el("div", "status-row");
    STAGES.forEach((s) => {
      const b = el("button", `status-btn${s === p.stage ? " is-on" : ""}`, label(s));
      b.type = "button";
      b.addEventListener("click", async () => {
        try {
          await api(`/api/admin/projects/${p.id}`, { method: "PATCH", body: JSON.stringify({ stage: s }) });
          toast(`Moved to ${label(s).toLowerCase()}`);
          openClient(clientId); loadClients(); loadOverview();
        } catch (ex) { toast(ex.message, true); }
      });
      stageRow.appendChild(b);
    });
    stageBlock.appendChild(stageRow);
    card.appendChild(stageBlock);

    // price editor
    const priceBlock = el("div");
    priceBlock.appendChild(el("div", "section-title", "Agreed price"));
    const priceRow = el("div", "form-actions");
    const priceInput = document.createElement("input");
    priceInput.type = "number"; priceInput.min = 0; priceInput.step = "50";
    priceInput.value = p.price_total; priceInput.style.maxWidth = "180px";
    const priceSave = el("button", "btn-ghost", "Update price");
    priceSave.type = "button";
    priceSave.addEventListener("click", async () => {
      try {
        await api(`/api/admin/projects/${p.id}`, {
          method: "PATCH", body: JSON.stringify({ priceTotal: priceInput.value }),
        });
        toast("Price updated"); openClient(clientId); loadClients(); loadOverview();
      } catch (ex) { toast(ex.message, true); }
    });
    priceRow.appendChild(priceInput); priceRow.appendChild(priceSave);
    priceBlock.appendChild(priceRow);
    card.appendChild(priceBlock);

    // payments
    const payBlock = el("div");
    payBlock.appendChild(el("div", "section-title", "Payments received"));
    const list = el("div", "pay-list");
    if (!p.payments.length) list.appendChild(el("div", "pay-row", "Nothing received yet."));
    p.payments.forEach((pay) => {
      const row = el("div", "pay-row");
      row.appendChild(el("b", null, money(pay.amount)));
      row.appendChild(el("span", null, `${label(pay.kind) || pay.kind} · ${fmtDate(pay.paid_at)}`));
      const x = el("button", "x", "×");
      x.type = "button";
      x.addEventListener("click", async () => {
        try {
          await api(`/api/admin/payments/${pay.id}`, { method: "DELETE" });
          toast("Payment removed"); openClient(clientId); loadClients(); loadOverview();
        } catch (ex) { toast(ex.message, true); }
      });
      row.appendChild(x);
      list.appendChild(row);
    });
    payBlock.appendChild(list);

    const payForm = el("div", "form-actions");
    const amt = document.createElement("input");
    amt.type = "number"; amt.min = 0; amt.step = "50"; amt.placeholder = "Amount"; amt.style.maxWidth = "140px";
    const kind = document.createElement("select");
    ["deposit", "milestone", "final", "other"].forEach((k) => {
      const o = el("option", null, k[0].toUpperCase() + k.slice(1)); o.value = k; kind.appendChild(o);
    });
    kind.style.maxWidth = "150px";
    const addPay = el("button", "btn-primary", "Record payment");
    addPay.type = "button";
    addPay.addEventListener("click", async () => {
      if (!amt.value) return toast("Enter an amount", true);
      try {
        await api(`/api/admin/projects/${p.id}/payments`, {
          method: "POST", body: JSON.stringify({ amount: amt.value, kind: kind.value }),
        });
        toast("Payment recorded"); openClient(clientId); loadClients(); loadOverview();
      } catch (ex) { toast(ex.message, true); }
    });
    payForm.appendChild(amt); payForm.appendChild(kind); payForm.appendChild(addPay);
    payBlock.appendChild(payForm);
    card.appendChild(payBlock);

    // log
    if (p.updates.length) {
      const tl = el("div");
      tl.appendChild(el("div", "section-title", "Log"));
      const list2 = el("div", "timeline");
      p.updates.forEach((u) => {
        const item = el("div", "timeline-item");
        item.appendChild(el("span", "timeline-dot"));
        const txt = u.note || (u.stage_to ? `Moved to ${label(u.stage_to)}` : "Updated");
        item.appendChild(el("span", null, `${txt} · ${fmtDateTime(u.created_at)}`));
        list2.appendChild(item);
      });
      tl.appendChild(list2);
      card.appendChild(tl);
    }

    return card;
  }

  // add a client who never touched the website
  $("addClientBtn").addEventListener("click", () => {
    const body = openDrawer("New client");
    const form = el("div", "stack-form");
    const mk = (labelText, name, type = "text") => {
      const l = el("label", null, labelText);
      const i = document.createElement(type === "select" ? "select" : "input");
      if (type !== "select") i.type = type;
      i.name = name;
      l.appendChild(i);
      form.appendChild(l);
      return i;
    };
    const name = mk("Name", "name");
    const company = mk("Company", "company");
    const email = mk("Email", "email", "email");
    const phone = mk("Phone", "phone", "tel");
    const source = mk("Where they came from", "source", "select");
    SOURCES.forEach((s) => { const o = el("option", null, label(s)); o.value = s; source.appendChild(o); });
    source.value = "upwork";

    const save = el("button", "btn-primary", "Create client");
    save.type = "button";
    save.addEventListener("click", async () => {
      if (!name.value.trim()) return toast("A name is required", true);
      try {
        const r = await api("/api/admin/clients", {
          method: "POST",
          body: JSON.stringify({
            name: name.value, company: company.value, email: email.value,
            phone: phone.value, source: source.value,
          }),
        });
        toast("Client created");
        switchView("clients");
        await loadClients();
        openClient(r.id);
      } catch (ex) { toast(ex.message, true); }
    });
    form.appendChild(save);
    body.appendChild(form);
  });

  // ── Reviews ───────────────────────────────────────────────
  let rvAvatar = "";
  const setPreview = (dataUrl) => {
    const e = $("rvPreview");
    if (dataUrl) {
      e.textContent = ""; e.style.backgroundImage = `url(${dataUrl})`;
      e.classList.add("has-photo"); $("rvClear").hidden = false;
    } else {
      e.textContent = "+"; e.style.backgroundImage = "";
      e.classList.remove("has-photo"); $("rvClear").hidden = true;
    }
  };

  /* Resize to a 256px square before upload so a phone photo never
     reaches the database at full size. */
  const readAvatar = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("That file is not an image."));
        img.onload = () => {
          const S = 256;
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = S;
          const ctx = canvas.getContext("2d");
          const side = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });

  TYPES.forEach((t) => { const o = el("option", null, label(t)); o.value = t; $("rvType").appendChild(o); });
  TYPES.forEach((t) => { const o = el("option", null, label(t)); o.value = t; $("typeFilter").appendChild(o); });
  BUDGETS.forEach((b) => { const o = el("option", null, label(b)); o.value = b; $("budgetFilter").appendChild(o); });

  $("rvFile").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try { rvAvatar = await readAvatar(file); setPreview(rvAvatar); }
    catch (ex) { toast(ex.message, true); }
  });
  $("rvClear").addEventListener("click", () => { rvAvatar = ""; $("rvFile").value = ""; setPreview(""); });

  $("reviewForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("rvSubmit"), err = $("rvError");
    err.textContent = ""; btn.disabled = true; btn.textContent = "Publishing…";
    try {
      const fd = new FormData(e.target);
      await api("/api/admin/reviews", {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"), role: fd.get("role"), projectType: fd.get("projectType"),
          rating: fd.get("rating"), body: fd.get("body"), avatar: rvAvatar || undefined,
        }),
      });
      e.target.reset(); rvAvatar = ""; $("rvFile").value = ""; setPreview("");
      toast("Review published");
      loadReviews();
    } catch (ex) { err.textContent = ex.message; }
    finally { btn.disabled = false; btn.textContent = "Publish review"; }
  });

  const starRow = (n) => "★".repeat(n) + "☆".repeat(5 - n);

  async function loadReviews() {
    try {
      const status = $("rvFilter").value;
      const data = await api(`/api/admin/reviews${status ? `?status=${status}` : ""}`);
      const host = $("reviewList");
      host.textContent = "";
      if (!data.reviews.length) host.appendChild(el("p", "rv-empty", "Nothing here yet."));

      data.reviews.forEach((r) => {
        const item = el("div", `rv-item${r.status === "pending" ? " is-pending" : ""}`);
        if (r.has_avatar) {
          const img = document.createElement("img");
          img.className = "rv-avatar";
          img.src = `/api/admin/reviews/${r.id}/avatar`;
          img.alt = r.author_name;
          item.appendChild(img);
        } else {
          item.appendChild(el("span", "rv-avatar rv-avatar--letters", initials(r.author_name)));
        }
        const main = el("div");
        const head = el("div", "rv-head");
        head.appendChild(el("span", "rv-name", r.author_name));
        if (r.author_role) head.appendChild(el("span", "rv-role", r.author_role));
        const meta = el("div", "rv-meta");
        meta.appendChild(el("span", `pill ${r.status}`, label(r.status)));
        if (r.source === "client" && !r.email_verified)
          meta.appendChild(el("span", "pill unverified", "Email not verified"));
        head.appendChild(meta);
        main.appendChild(head);
        main.appendChild(el("div", "rv-stars", starRow(r.rating)));
        main.appendChild(el("p", "rv-body", r.body));

        const foot = el("div", "rv-foot");
        const act = (text, cls, status) => {
          const b = el("button", cls, text);
          b.type = "button";
          b.addEventListener("click", async () => {
            try {
              await api(`/api/admin/reviews/${r.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
              toast(status === "approved" ? "Live on the site" : "Hidden");
              loadReviews();
            } catch (ex) { toast(ex.message, true); }
          });
          return b;
        };
        if (r.status !== "approved") foot.appendChild(act("Approve", "btn-primary", "approved"));
        if (r.status !== "rejected") foot.appendChild(act("Reject", "btn-ghost", "rejected"));
        const del = el("button", "btn-danger", "Delete");
        del.type = "button";
        del.addEventListener("click", async () => {
          if (!window.confirm(`Delete the review from ${r.author_name}?`)) return;
          try {
            await api(`/api/admin/reviews/${r.id}`, { method: "DELETE" });
            toast("Deleted"); loadReviews();
          } catch (ex) { toast(ex.message, true); }
        });
        foot.appendChild(del);
        foot.appendChild(el("span", "rv-when", `${label(r.project_type)} · ${fmtDate(r.created_at)}`));
        main.appendChild(foot);
        item.appendChild(main);
        host.appendChild(item);
      });

      $("rvCounts").textContent = `${data.counts.pending} waiting · ${data.counts.approved} live`;
      const badge = $("reviewBadge");
      badge.textContent = data.counts.pending;
      badge.hidden = data.counts.pending === 0;
    } catch (ex) {
      if (/sign|session/i.test(ex.message)) showLogin();
      else toast(ex.message, true);
    }
  }
  $("rvFilter").addEventListener("change", loadReviews);

  // ── Filters + paging ──────────────────────────────────────
  let searchTimer;
  const applyFilters = () => {
    state.filters = {
      q: $("search").value.trim(),
      status: $("statusFilter").value,
      type: $("typeFilter").value,
      budget: $("budgetFilter").value,
    };
    state.page = 1;
    loadLeads().catch((ex) => toast(ex.message, true));
  };
  $("search").addEventListener("input", () => {
    clearTimeout(searchTimer); searchTimer = setTimeout(applyFilters, 280);
  });
  ["statusFilter", "typeFilter", "budgetFilter"].forEach((id) =>
    $(id).addEventListener("change", applyFilters));
  $("prevPage").addEventListener("click", () => { if (state.page > 1) { state.page--; loadLeads(); } });
  $("nextPage").addEventListener("click", () => { if (state.page < state.pages) { state.page++; loadLeads(); } });

  let clientTimer;
  $("clientSearch").addEventListener("input", () => {
    clearTimeout(clientTimer);
    clientTimer = setTimeout(() => loadClients().catch((ex) => toast(ex.message, true)), 280);
  });

  // ── Views ─────────────────────────────────────────────────
  const VIEWS = { overview: "Overview", leads: "Leads", clients: "Clients", reviews: "Reviews" };
  function switchView(view) {
    document.querySelectorAll(".nav-item[data-view]").forEach((n) =>
      n.classList.toggle("is-on", n.dataset.view === view));
    Object.keys(VIEWS).forEach((v) => {
      $(`view${v[0].toUpperCase()}${v.slice(1)}`).hidden = v !== view;
    });
    $("crumb").textContent = VIEWS[view];
    $("exportBtn").hidden = view !== "leads";
    if (view === "overview") loadOverview().catch(() => {});
    if (view === "clients") loadClients().catch(() => {});
    if (view === "reviews") loadReviews();
  }
  document.querySelectorAll(".nav-item[data-view]").forEach((n) =>
    n.addEventListener("click", () => switchView(n.dataset.view)));

  // ── Boot ──────────────────────────────────────────────────
  async function boot() {
    try {
      await Promise.all([
        loadOverview(),
        loadLeadStats(),
        loadLeads(),
        loadClients(),
        loadReviews(),
      ]);
    } catch (ex) {
      if (/sign|session/i.test(ex.message)) showLogin();
      else toast(ex.message, true);
    }
  }

  (async () => {
    try {
      const me = await api("/api/auth/me");
      showApp(me.email);
      switchView("overview");
      await boot();
    } catch {
      showLogin();
    }
  })();
})();
