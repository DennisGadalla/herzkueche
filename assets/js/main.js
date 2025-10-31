(() => {
  "use strict";

  /* =============== Reveal cards =============== */
  const revealObserver = new IntersectionObserver(
    (entries, obs) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("reveal");
          obs.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12 }
  );

  document
    .querySelectorAll(".card")
    .forEach((el) => revealObserver.observe(el));

  /* =============== Auto year =============== */
  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  /* =============== Scrolling Impressions Banner =============== */
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      const track = document.getElementById("impressions-track");
      if (!track) return;

      const base = "assets/img/impressions/";
      const maxImages = 100;
      const extensions = ["jpg", "jpeg", "png", "webp"];

      const loadImage = (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(src);
          img.onerror = () => resolve(null);
          img.src = src;
        });

      // Try extensions sequentially for each index to avoid 3x redundant failed requests
      const loadFirstExisting = async (i) => {
        for (const ext of extensions) {
          const src = `${base}impression-${i}.${ext}`;
          // eslint-disable-next-line no-await-in-loop
          const ok = await loadImage(src);
          if (ok) return ok;
        }
        return null;
      };

      (async () => {
        const tasks = [];
        for (let i = 1; i <= maxImages; i++) {
          tasks.push(loadFirstExisting(i));
        }

        const results = await Promise.all(tasks);
        const valid = results.filter(Boolean);
        if (!valid.length) return;

        // Duplicate list for seamless loop
        const allImages = valid.concat(valid);

        // Fill the track
        const frag = document.createDocumentFragment();
        for (const src of allImages) {
          const img = document.createElement("img");
          img.src = src;
          frag.appendChild(img);
        }
        track.appendChild(frag);
      })();
    },
    { passive: true }
  );

  /* =============== Header Scroll Effect =============== */
  const header = document.querySelector("header");
  if (header) {
    let ticking = false;

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (window.scrollY > 10) {
            header.classList.add("scrolled");
          } else {
            header.classList.remove("scrolled");
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    document.addEventListener("scroll", onScroll, { passive: true });
    // Run once on load (e.g., if page opens scrolled)
    onScroll();
  }
})();



