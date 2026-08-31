// ——— Fit the giant hero role line to the viewport width ———
const heroRole = document.querySelector(".hero-role");

const fitHeroRole = () => {
  if (!heroRole) return;
  const box = heroRole.parentElement;
  const cs = getComputedStyle(box);
  const avail =
    box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  if (avail <= 0) return;

  const spans = heroRole.querySelectorAll("span");
  const stacked = spans.length && getComputedStyle(spans[0]).display === "block";

  heroRole.style.fontSize = "100px";
  let widest = 0;
  if (stacked) {
    spans.forEach((s) => {
      widest = Math.max(widest, s.getBoundingClientRect().width);
    });
  } else {
    widest = heroRole.scrollWidth;
  }
  if (!widest) return;

  heroRole.style.fontSize = Math.min(100 * (avail / widest), 260) + "px";
};

if (heroRole) {
  heroRole.classList.add("fitted");
  fitHeroRole();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitHeroRole);
  }
  window.addEventListener("load", fitHeroRole);
  let fitTimer;
  window.addEventListener("resize", () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fitHeroRole, 120);
  });
}

// Loader
const loader = document.querySelector(".loader");

window.addEventListener("load", () => {
  setTimeout(() => {
    loader.classList.add("hidden");
    document.querySelectorAll(".hero .reveal").forEach((el) => {
      el.classList.add("active");
    });
  }, 3200);
});

// ——— Navbar → floating pill transition ———
const header = document.querySelector("header");
const navToggle = document.querySelector(".nav-toggle");
const overlayMenu = document.querySelector(".overlay-menu");
const overlayClose = document.querySelector(".overlay-close");
const heroSection = document.querySelector(".hero");

const closeOverlay = () => {
  overlayMenu.classList.remove("open");
  header.classList.remove("menu-open");
  navToggle.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
};

const openOverlay = () => {
  overlayMenu.classList.add("open");
  header.classList.add("menu-open");
  navToggle.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
};

const handleNavScroll = () => {
  const heroBottom = heroSection.getBoundingClientRect().bottom;
  const pastHero = heroBottom < 120;

  header.classList.toggle("scrolled", pastHero);

  // On desktop the toggle only exists in the pill state, so close on scroll back
  if (!pastHero && window.innerWidth > 900 && overlayMenu.classList.contains("open")) {
    closeOverlay();
  }
};

window.addEventListener("scroll", handleNavScroll, { passive: true });
handleNavScroll();

navToggle.addEventListener("click", () => {
  if (overlayMenu.classList.contains("open")) {
    closeOverlay();
  } else {
    openOverlay();
  }
});

overlayClose.addEventListener("click", closeOverlay);

// Click the dimmed backdrop to close
overlayMenu.addEventListener("click", (e) => {
  if (e.target === overlayMenu) closeOverlay();
});

// Esc to close
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && overlayMenu.classList.contains("open")) closeOverlay();
});

// Close overlay when clicking a link
document.querySelectorAll(".overlay-nav a, .overlay-cta").forEach((link) => {
  link.addEventListener("click", closeOverlay);
});

// Scroll reveal
const revealElements = document.querySelectorAll(".reveal");

const revealOnScroll = () => {
  revealElements.forEach((el) => {
    if (el.closest(".hero")) return;

    const rect = el.getBoundingClientRect();
    const windowHeight = window.innerHeight;

    if (rect.top < windowHeight * 0.88) {
      const delay = el.closest(".services-grid, .pricing-grid")
        ? Array.from(el.parentElement.children).indexOf(el) * 120
        : 0;

      setTimeout(() => {
        el.classList.add("active");
      }, delay);
    }
  });
};

window.addEventListener("scroll", revealOnScroll);
setTimeout(revealOnScroll, 3400);

// ——— Stacked service cards: shrink + dim each card as the next covers it ———
const svcCards = Array.from(document.querySelectorAll(".svc-card"));

if (svcCards.length && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  let ticking = false;

  const updateStack = () => {
    ticking = false;
    const vh = window.innerHeight;

    svcCards.forEach((card, i) => {
      const next = svcCards[i + 1];
      if (!next) {
        card.style.setProperty("--p", "0");
        return;
      }
      const cardTop = card.getBoundingClientRect().top;
      const nextTop = next.getBoundingClientRect().top;

      // The next card travels from the bottom of the viewport up to this
      // card's resting position. That journey is this card's 0 → 1.
      const travel = Math.max(vh - cardTop, 1);
      const p = Math.min(Math.max((vh - nextTop) / travel, 0), 1);

      card.style.setProperty("--p", p.toFixed(3));
    });
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateStack);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  updateStack();
}

// ——— FAQ Accordion ———
document.querySelectorAll(".faq-question").forEach((btn) => {
  btn.addEventListener("click", () => {
    const item = btn.parentElement;
    const isOpen = item.classList.contains("open");

    // Close all items first
    document.querySelectorAll(".faq-item").forEach((el) => {
      el.classList.remove("open");
    });

    // Toggle the clicked one
    if (!isOpen) {
      item.classList.add("open");
    }
  });
});

// ——— Contact form (AJAX via FormSubmit) ———
const contactForm = document.getElementById("contactForm");
const submitBtn = document.getElementById("submitBtn");
const formStatus = document.getElementById("formStatus");

contactForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Loading state
  submitBtn.classList.add("loading");
  submitBtn.textContent = "SENDING...";
  formStatus.textContent = "";
  formStatus.className = "form-status";

  const formData = new FormData(contactForm);
  // Add FormSubmit config
  formData.append("_captcha", "false");
  formData.append("_subject", "New contact from portfolio");
  formData.append("_template", "table");

  try {
    const res = await fetch("https://formsubmit.co/ajax/taha.oulbacha07@gmail.com", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData,
    });

    const data = await res.json();

    if (data.success === "true" || data.success === true) {
      formStatus.textContent = "Message sent successfully!";
      formStatus.className = "form-status success";
      contactForm.reset();
    } else {
      throw new Error("Submission failed");
    }
  } catch (err) {
    formStatus.textContent = "Something went wrong. Please try again.";
    formStatus.className = "form-status error";
  } finally {
    submitBtn.classList.remove("loading");
    submitBtn.textContent = "SUBMIT";
  }
});
