/* ——— Custom cursor: lime dot + trailing ring, deep indigo on interactive
   elements. Injects its own markup, so every page only needs this script. ——— */
(() => {
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  if (!finePointer.matches) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const make = (cls) => {
    const el = document.createElement("div");
    el.className = cls;
    el.setAttribute("aria-hidden", "true");
    el.appendChild(document.createElement("i"));
    return el;
  };

  const ring = make("cursor-ring");
  const dot = make("cursor-dot");

  const start = () => {
    document.body.appendChild(ring);
    document.body.appendChild(dot);
    document.documentElement.classList.add("has-custom-cursor");
  };

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });

  const INTERACTIVE =
    'a, button, [role="button"], input, textarea, select, label, summary, .card, .faq-question, .pricing-card';

  let mx = window.innerWidth / 2;
  let my = window.innerHeight / 2;
  let rx = mx;
  let ry = my;
  let shown = false;

  const show = () => {
    if (shown) return;
    shown = true;
    rx = mx;
    ry = my;
    ring.classList.add("is-visible");
    dot.classList.add("is-visible");
  };

  const hide = () => {
    shown = false;
    ring.classList.remove("is-visible");
    dot.classList.remove("is-visible");
  };

  window.addEventListener(
    "mousemove",
    (e) => {
      mx = e.clientX;
      my = e.clientY;
      show();
    },
    { passive: true }
  );

  document.addEventListener("mouseleave", hide);
  window.addEventListener("blur", hide);

  document.addEventListener("mouseover", (e) => {
    const target = e.target instanceof Element ? e.target.closest(INTERACTIVE) : null;
    document.documentElement.classList.toggle("cursor-over", !!target);
  });

  document.addEventListener("mousedown", () =>
    document.documentElement.classList.add("cursor-down")
  );
  document.addEventListener("mouseup", () =>
    document.documentElement.classList.remove("cursor-down")
  );

  const ease = reduced ? 1 : 0.18;

  const loop = () => {
    rx += (mx - rx) * ease;
    ry += (my - ry) * ease;
    dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // Drop back to the native cursor if the user switches to touch
  finePointer.addEventListener("change", (e) => {
    if (!e.matches) {
      hide();
      document.documentElement.classList.remove("has-custom-cursor");
    } else {
      document.documentElement.classList.add("has-custom-cursor");
    }
  });
})();
