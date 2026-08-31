/* Multi-step project brief. Opens from the hero CTA, posts to the Node API,
   and hands the person the booking link once their details are saved. */
(() => {
  "use strict";

  const CONFIG = window.PORTFOLIO_CONFIG || {};
  const API_BASE = (CONFIG.apiBase || "").replace(/\/$/, "");

  const PROJECT_TYPES = [
    { value: "website", title: "A website", note: "Presentation, portfolio or landing page" },
    { value: "ecommerce", title: "An online store", note: "Products, cart, payments" },
    { value: "webapp", title: "A web app or tool", note: "Something with logins and logic" },
    { value: "dashboard", title: "A data dashboard", note: "Track numbers in one place" },
    { value: "redesign", title: "A redesign", note: "I have a site, it needs to be better" },
    { value: "automation", title: "Automation", note: "Bots, integrations, saved hours" },
  ];

  const BUDGETS = [
    { value: "under_1k", title: "Under $1,000" },
    { value: "1k_3k", title: "$1,000 – $3,000" },
    { value: "3k_7k", title: "$3,000 – $7,000" },
    { value: "7k_plus", title: "$7,000+" },
    { value: "not_sure", title: "Not sure yet", note: "We can work it out on the call" },
  ];

  const TIMELINES = [
    { value: "asap", title: "As soon as possible" },
    { value: "1_month", title: "Within a month" },
    { value: "1_3_months", title: "In 1–3 months" },
    { value: "flexible", title: "No fixed date" },
  ];

  const STEP_TITLES = [
    "Let's start with you",
    "What do you want built?",
    "What's your budget?",
    "When do you need it?",
  ];
  const STEP_SUBS = [
    "So I know who I'm building for.",
    "Pick the closest one — we'll refine it together.",
    "A range is enough. It keeps the proposal realistic.",
    "Last step — then I read it and come back to you personally.",
  ];

  const TOTAL_STEPS = 4;

  const data = {
    name: "", email: "", phone: "", company: "",
    projectType: "", budget: "", timeline: "", details: "",
  };

  let step = 1;
  let submitting = false;
  let lastSource = "hero_cta";
  let lastFocused = null;
  let root = null;

  const h = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // ── Shell ──────────────────────────────────────────────────
  function build() {
    root = h("div", "quote-modal");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Start a project");
    root.hidden = true;

    root.innerHTML = `
      <div class="quote-backdrop" data-close></div>
      <div class="quote-card">
        <button class="quote-close" type="button" data-close aria-label="Close">&times;</button>
        <div class="quote-progress"><span class="quote-progress-fill"></span></div>
        <p class="quote-step-count"></p>
        <h2 class="quote-title"></h2>
        <p class="quote-sub"></p>
        <form class="quote-form" novalidate autocomplete="on">
          <div class="quote-body"></div>
          <p class="quote-error" role="alert"></p>
          <div class="quote-nav">
            <button type="button" class="quote-back">Back</button>
            <button type="submit" class="quote-next">Continue</button>
          </div>
        </form>
      </div>`;

    document.body.appendChild(root);

    root.querySelectorAll("[data-close]").forEach((n) =>
      n.addEventListener("click", close)
    );
    root.querySelector(".quote-back").addEventListener("click", () => go(step - 1));
    root.querySelector(".quote-form").addEventListener("submit", (e) => {
      e.preventDefault();
      next();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !root.hidden) close();
    });
  }

  const q = (sel) => root.querySelector(sel);

  // ── Step rendering ─────────────────────────────────────────
  function field(name, labelText, type, placeholder, required) {
    const wrap = h("label", "quote-field");
    const top = h("span", "quote-label", labelText);
    if (!required) top.appendChild(h("i", "quote-optional", "optional"));
    wrap.appendChild(top);
    const input = document.createElement("input");
    input.type = type;
    input.name = name;
    input.value = data[name];
    input.placeholder = placeholder;
    input.autocomplete =
      name === "name" ? "name" : name === "email" ? "email" : name === "phone" ? "tel" : "organization";
    input.addEventListener("input", () => { data[name] = input.value; });
    wrap.appendChild(input);
    return wrap;
  }

  function choices(list, key, autoAdvance = true) {
    const grid = h("div", "quote-choices");
    list.forEach((opt) => {
      const btn = h("button", `quote-choice${data[key] === opt.value ? " is-picked" : ""}`);
      btn.type = "button";
      btn.appendChild(h("span", "quote-choice-title", opt.title));
      if (opt.note) btn.appendChild(h("span", "quote-choice-note", opt.note));
      btn.addEventListener("click", () => {
        data[key] = opt.value;
        grid.querySelectorAll(".quote-choice").forEach((b) => b.classList.remove("is-picked"));
        btn.classList.add("is-picked");
        q(".quote-error").textContent = "";
        // Picking is the answer — move on without a second click. Except on the
        // last step, where there is still an optional message box below.
        if (autoAdvance) setTimeout(() => next(), 240);
      });
      grid.appendChild(btn);
    });
    return grid;
  }

  function render() {
    const body = q(".quote-body");
    body.textContent = "";
    q(".quote-error").textContent = "";

    q(".quote-step-count").textContent = `Step ${step} of ${TOTAL_STEPS}`;
    q(".quote-title").textContent = STEP_TITLES[step - 1];
    q(".quote-sub").textContent = STEP_SUBS[step - 1];
    q(".quote-progress-fill").style.width = `${(step / TOTAL_STEPS) * 100}%`;
    q(".quote-back").style.visibility = step === 1 ? "hidden" : "visible";
    q(".quote-next").textContent = step === TOTAL_STEPS ? "Send my brief" : "Continue";
    q(".quote-nav").hidden = false;

    if (step === 1) {
      body.appendChild(field("name", "Your name", "text", "Taha Oulbacha", true));
      body.appendChild(field("email", "Email", "email", "you@company.com", true));
      body.appendChild(field("phone", "Phone / WhatsApp", "tel", "+212 6 12 34 56 78", false));
      body.appendChild(field("company", "Company", "text", "Where you work", false));
    } else if (step === 2) {
      body.appendChild(choices(PROJECT_TYPES, "projectType"));
    } else if (step === 3) {
      body.appendChild(choices(BUDGETS, "budget"));
    } else {
      body.appendChild(choices(TIMELINES, "timeline", false));
      const wrap = h("label", "quote-field");
      const top = h("span", "quote-label", "Anything else I should know?");
      top.appendChild(h("i", "quote-optional", "optional"));
      wrap.appendChild(top);
      const ta = document.createElement("textarea");
      ta.name = "details";
      ta.rows = 3;
      ta.placeholder = "What you're trying to build, links to sites you like…";
      ta.value = data.details;
      ta.addEventListener("input", () => { data.details = ta.value; });
      wrap.appendChild(ta);
      body.appendChild(wrap);
    }

    // Honeypot — hidden from people, tempting to bots.
    const hp = document.createElement("input");
    hp.type = "text";
    hp.name = "website";
    hp.className = "quote-hp";
    hp.tabIndex = -1;
    hp.autocomplete = "off";
    hp.setAttribute("aria-hidden", "true");
    body.appendChild(hp);

    const firstInput = body.querySelector("input:not(.quote-hp), button, textarea");
    if (firstInput) firstInput.focus({ preventScroll: true });
  }

  // ── Validation ─────────────────────────────────────────────
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

  function validateStep() {
    const err = q(".quote-error");
    if (step === 1) {
      if (data.name.trim().length < 2) return (err.textContent = "Please tell me your name."), false;
      if (!EMAIL_RE.test(data.email.trim()))
        return (err.textContent = "That email doesn't look right."), false;
      if (data.phone.trim() && data.phone.replace(/\D/g, "").length < 6)
        return (err.textContent = "That phone number looks too short."), false;
    }
    if (step === 2 && !data.projectType) return (err.textContent = "Pick what you want built."), false;
    if (step === 3 && !data.budget) return (err.textContent = "Pick a range — a rough one is fine."), false;
    if (step === 4 && !data.timeline) return (err.textContent = "Pick a timeline."), false;
    err.textContent = "";
    return true;
  }

  function go(n) {
    step = Math.min(TOTAL_STEPS, Math.max(1, n));
    render();
  }

  function next() {
    if (submitting) return;
    if (!validateStep()) return;
    if (step < TOTAL_STEPS) return go(step + 1);
    submit();
  }

  // ── Submit ─────────────────────────────────────────────────
  async function submit() {
    submitting = true;
    const btn = q(".quote-next");
    const err = q(".quote-error");
    btn.disabled = true;
    btn.textContent = "Sending…";
    err.textContent = "";

    const hpValue = q(".quote-hp") ? q(".quote-hp").value : "";

    try {
      const res = await fetch(`${API_BASE}/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, website: hpValue, source: lastSource }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const firstError =
          payload.errors && Object.values(payload.errors)[0];
        throw new Error(firstError || payload.error || "Something went wrong.");
      }

      success();
    } catch (ex) {
      // A TypeError from fetch means the request never left the browser —
      // wrong address, server down, blocked. "Failed to fetch" means nothing
      // to a visitor, so say what it actually means and give them a way out.
      const unreachable = ex instanceof TypeError;
      console.error("Brief submission failed:", `${API_BASE}/api/leads`, ex);

      err.textContent = unreachable
        ? "I couldn't reach my server just now — that's on my side, not yours. Please email me directly: "
        : `${ex.message} You can also email me directly: `;
      const mail = h("a", "quote-escape", "taha.oulbacha07@gmail.com");
      mail.href = "mailto:taha.oulbacha07@gmail.com";
      err.appendChild(mail);
    } finally {
      submitting = false;
      btn.disabled = false;
      btn.textContent = "Send my brief";
    }
  }

  function success() {
    const card = q(".quote-card");
    card.classList.add("is-done");
    q(".quote-progress-fill").style.width = "100%";
    q(".quote-step-count").textContent = "Received";
    q(".quote-title").textContent = `Thanks, ${data.name.split(" ")[0]}.`;
    q(".quote-sub").textContent =
      "I read every brief myself. Expect a reply within one working day, with a call link and my first thoughts on what you described.";

    const body = q(".quote-body");
    body.textContent = "";
    q(".quote-error").textContent = "";
    q(".quote-nav").hidden = true;

    body.appendChild(h("div", "quote-check", "✓"));

    const recap = h("div", "quote-recap");
    const line = (k, v) => {
      const row = h("div", "quote-recap-row");
      row.appendChild(h("span", null, k));
      row.appendChild(h("b", null, v));
      recap.appendChild(row);
    };
    line("Sent to", data.email);
    const chosen = PROJECT_TYPES.find((t) => t.value === data.projectType);
    if (chosen) line("Project", chosen.title);
    body.appendChild(recap);

    const done = h("button", "quote-book", "Close");
    done.type = "button";
    done.addEventListener("click", close);
    body.appendChild(done);
  }

  // ── Open / close ───────────────────────────────────────────
  const VALID_TYPES = PROJECT_TYPES.map((t) => t.value);

  function open(presetType, source) {
    if (!root) build();
    lastFocused = document.activeElement;
    step = 1;
    lastSource = source || "hero_cta";
    // A service card can say which project this is, so step 2 arrives
    // already answered and they only confirm it.
    if (presetType && VALID_TYPES.includes(presetType)) {
      data.projectType = presetType;
    }
    q(".quote-card").classList.remove("is-done");
    render();
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("is-open"));
    document.body.style.overflow = "hidden";
  }

  function close() {
    if (!root) return;
    root.classList.remove("is-open");
    document.body.style.overflow = "";
    setTimeout(() => { root.hidden = true; }, 300);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  // ── Wire the triggers ──────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    document
      .querySelectorAll(".hero-cta, .start-btn, .svc-cta, [data-quote]")
      .forEach((node) => {
        node.addEventListener("click", (e) => {
          e.preventDefault();
          const type = node.getAttribute("data-quote") || "";
          // Recording which card sent them means the dashboard shows
          // what actually sells, not just that the form was opened.
          const source = node.classList.contains("svc-cta")
            ? `service_card_${type || "unknown"}`
            : "hero_cta";
          open(type, source);
        });
      });
  });

  window.openQuoteForm = open;
})();
