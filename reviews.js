/* About page: loads approved reviews from the API and runs the
   "leave a review" flow (client submits → email verify → Taha approves). */
(() => {
  "use strict";

  const CONFIG = window.PORTFOLIO_CONFIG || {};
  const API = (CONFIG.apiBase || "").replace(/\/$/, "");

  const LABEL = {
    website: "Website",
    ecommerce: "E-commerce",
    webapp: "Web app / SaaS",
    dashboard: "Dashboard",
    redesign: "Redesign",
    automation: "Automation",
    other: "Custom system",
  };
  const TYPES = Object.keys(LABEL);

  const h = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const initials = (name) =>
    name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

  // ── Render the approved reviews ────────────────────────────────
  const host = document.getElementById("apReviews");

  const stars = (n) => {
    const wrap = h("span", "ap-stars");
    wrap.setAttribute("aria-label", `${n} out of 5`);
    for (let i = 0; i < 5; i++) wrap.appendChild(h("i", i < n ? "on" : null, "★"));
    return wrap;
  };

  async function loadReviews() {
    if (!host) return;
    if (!API) {
      host.textContent = "";
      return;
    }
    try {
      const res = await fetch(`${API}/api/reviews`);
      const data = await res.json();
      host.textContent = "";

      if (!data.reviews || !data.reviews.length) {
        host.appendChild(
          h("p", "ap-reviews-empty", "The first review here could be yours.")
        );
        return;
      }

      data.reviews.forEach((r) => {
        const card = h("article", "ap-review");

        const head = h("div", "ap-review-head");
        if (r.avatar) {
          const img = document.createElement("img");
          img.className = "ap-review-avatar";
          img.src = `${API}${r.avatar}`;
          img.alt = r.name;
          img.loading = "lazy";
          head.appendChild(img);
        } else {
          head.appendChild(h("span", "ap-review-avatar ap-review-avatar--letters", initials(r.name)));
        }

        const who = h("div", "ap-review-who");
        who.appendChild(h("span", "ap-review-name", r.name));
        if (r.role) who.appendChild(h("span", "ap-review-role", r.role));
        head.appendChild(who);
        head.appendChild(h("span", "ap-review-tag", LABEL[r.projectType] || "Project"));
        card.appendChild(head);

        if (r.rating) card.appendChild(stars(r.rating));
        card.appendChild(h("p", "ap-review-body", r.body));
        host.appendChild(card);
      });
    } catch {
      host.textContent = "";
    }
  }

  // ── Leave-a-review modal ───────────────────────────────────────
  let root = null;
  let avatarData = "";

  function build() {
    root = h("div", "rev-modal");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Leave a review");
    root.hidden = true;
    root.innerHTML = `
      <div class="rev-backdrop" data-close></div>
      <div class="rev-card">
        <button class="rev-close" type="button" data-close aria-label="Close">&times;</button>
        <h2 class="rev-title">How was it to work together?</h2>
        <p class="rev-sub">Your review appears on this page once you confirm your email and Taha approves it.</p>
        <form class="rev-form" novalidate>
          <div class="rev-photo">
            <span class="rev-photo-preview" id="revPreview">+</span>
            <div>
              <label class="rev-photo-btn" for="revFile">Add your photo</label>
              <input type="file" id="revFile" accept="image/png,image/jpeg,image/webp" hidden>
              <span class="rev-photo-note">Optional. Square works best.</span>
            </div>
          </div>
          <label class="rev-field"><span>Your name</span>
            <input type="text" name="name" autocomplete="name" required></label>
          <label class="rev-field"><span>Role &amp; company <i>optional</i></span>
            <input type="text" name="role" placeholder="Founder, Sodfa"></label>
          <label class="rev-field"><span>Email <i>we only use it to verify you</i></span>
            <input type="email" name="email" autocomplete="email" required></label>
          <label class="rev-field"><span>What did I build for you?</span>
            <select name="projectType" required></select></label>
          <div class="rev-field"><span>Rating</span>
            <div class="rev-rating" id="revRating"></div></div>
          <label class="rev-field"><span>Your review</span>
            <textarea name="body" rows="4" placeholder="What changed for your business?" required></textarea></label>
          <input type="text" name="website" class="rev-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
          <p class="rev-error" role="alert"></p>
          <button type="submit" class="rev-submit">Send my review</button>
        </form>
      </div>`;
    document.body.appendChild(root);

    const sel = root.querySelector('select[name="projectType"]');
    TYPES.forEach((t) => {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = LABEL[t];
      sel.appendChild(o);
    });

    // rating
    let rating = 5;
    const rateBox = root.querySelector("#revRating");
    const paint = () => {
      [...rateBox.children].forEach((b, i) => b.classList.toggle("on", i < rating));
    };
    for (let i = 1; i <= 5; i++) {
      const b = h("button", null, "★");
      b.type = "button";
      b.setAttribute("aria-label", `${i} star${i > 1 ? "s" : ""}`);
      b.addEventListener("click", () => { rating = i; paint(); });
      rateBox.appendChild(b);
    }
    paint();
    root.getRating = () => rating;

    // photo → resized square data URL, so we never ship a 5MB phone photo
    root.querySelector("#revFile").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const S = 256;
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = S;
          const ctx = canvas.getContext("2d");
          const side = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
          avatarData = canvas.toDataURL("image/jpeg", 0.85);
          const prev = root.querySelector("#revPreview");
          prev.textContent = "";
          prev.style.backgroundImage = `url(${avatarData})`;
          prev.classList.add("has-photo");
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });

    root.querySelectorAll("[data-close]").forEach((n) => n.addEventListener("click", close));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !root.hidden) close();
    });
    root.querySelector(".rev-form").addEventListener("submit", submit);
  }

  async function submit(e) {
    e.preventDefault();
    const form = e.target;
    const err = root.querySelector(".rev-error");
    const btn = root.querySelector(".rev-submit");
    err.textContent = "";

    const fd = new FormData(form);
    const payload = {
      name: fd.get("name"),
      role: fd.get("role"),
      email: fd.get("email"),
      projectType: fd.get("projectType"),
      body: fd.get("body"),
      rating: root.getRating(),
      website: fd.get("website"),
      avatar: avatarData || undefined,
    };

    if (!API) {
      err.textContent = "Reviews aren't connected yet. Please email Taha directly.";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Sending…";
    try {
      const res = await fetch(`${API}/api/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const first = data.errors && Object.values(data.errors)[0];
        throw new Error(first || data.error || "Something went wrong.");
      }
      done(data.message || "Thank you — check your inbox to confirm.");
    } catch (ex) {
      console.error("Review submission failed:", `${API}/api/reviews`, ex);
      err.textContent = ex instanceof TypeError
        ? "Couldn't reach the server just now. Please try again in a moment."
        : ex.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Send my review";
    }
  }

  function done(message) {
    const card = root.querySelector(".rev-card");
    card.innerHTML = `
      <button class="rev-close" type="button" data-close aria-label="Close">&times;</button>
      <div class="rev-done">
        <span class="rev-tick">&check;</span>
        <h2 class="rev-title">Thank you</h2>
        <p class="rev-sub">${message}</p>
        <button type="button" class="rev-submit" data-close>Close</button>
      </div>`;
    card.querySelectorAll("[data-close]").forEach((n) => n.addEventListener("click", close));
  }

  function open() {
    if (!root) build();
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("is-open"));
    document.body.style.overflow = "hidden";
  }

  function close() {
    if (!root) return;
    root.classList.remove("is-open");
    document.body.style.overflow = "";
    setTimeout(() => { root.hidden = true; }, 280);
  }

  const trigger = document.getElementById("apReviewBtn");
  if (trigger) trigger.addEventListener("click", open);

  loadReviews();
})();
