// Mobile menu (hero section, small screens)
const menuBtn = document.querySelector(".menu-btn");
const mobileMenu = document.querySelector(".mobile-menu");
const closeMenu = document.querySelector(".close-menu");

menuBtn.addEventListener("click", () => {
  mobileMenu.classList.add("active");
});

closeMenu.addEventListener("click", () => {
  mobileMenu.classList.remove("active");
});

document.querySelectorAll(".mobile-menu a").forEach((link) => {
  link.addEventListener("click", () => {
    mobileMenu.classList.remove("active");
  });
});

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

// ——— Navbar ↔ Floating button transition ———
const header = document.querySelector("header");
const fabMenu = document.querySelector(".fab-menu");
const overlayMenu = document.querySelector(".overlay-menu");
const heroSection = document.querySelector(".hero");

const handleNavScroll = () => {
  const heroBottom = heroSection.getBoundingClientRect().bottom;
  const pastHero = heroBottom < 80;

  if (pastHero) {
    header.classList.add("nav-hidden");
    fabMenu.classList.add("visible");
  } else {
    header.classList.remove("nav-hidden");
    fabMenu.classList.remove("visible");
    // Close overlay if scrolling back to hero
    overlayMenu.classList.remove("open");
    fabMenu.classList.remove("active");
  }
};

window.addEventListener("scroll", handleNavScroll);

// Floating button → open/close overlay
fabMenu.addEventListener("click", () => {
  const isOpen = overlayMenu.classList.contains("open");

  if (isOpen) {
    overlayMenu.classList.remove("open");
    fabMenu.classList.remove("active");
  } else {
    overlayMenu.classList.add("open");
    fabMenu.classList.add("active");
  }
});

// Close overlay when clicking a link
document.querySelectorAll(".overlay-nav a").forEach((link) => {
  link.addEventListener("click", () => {
    overlayMenu.classList.remove("open");
    fabMenu.classList.remove("active");
  });
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
