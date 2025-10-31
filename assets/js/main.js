(() => {
  "use strict";

  /* ===============================================================
     0) Small helpers
     =============================================================== */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);

  /* ===============================================================
     1) Reveal cards on scroll (IntersectionObserver)
     =============================================================== */
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
  document.querySelectorAll(".card").forEach((el) => revealObserver.observe(el));

  /* ===============================================================
     2) Auto-set year in footer
     =============================================================== */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ===============================================================
     2.5) Header: hide on scroll down, show on scroll up
     =============================================================== */
  const headerEl = document.querySelector("header");
  const TOP_PIN = 80;
  const TOL = 8;
  let lastY = window.scrollY || 0;
  let ticking = false;

  function updateHeaderOnScroll() {
    if (!headerEl) {
      ticking = false;
      return;
    }
    const y = Math.max(0, window.scrollY || 0);
    if (y <= TOP_PIN) {
      headerEl.classList.remove("nav-hidden");
      lastY = y;
      ticking = false;
      return;
    }
    if (y > lastY + TOL) {
      headerEl.classList.add("nav-hidden");   // down → hide
      lastY = y;
    } else if (y < lastY - TOL) {
      headerEl.classList.remove("nav-hidden"); // up → show
      lastY = y;
    }
    ticking = false;
  }
  updateHeaderOnScroll();
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateHeaderOnScroll);
      }
    },
    { passive: true }
  );

  /* ===============================================================
     3) Image lightbox (in-page, no button)
     =============================================================== */
  let modal, modalImg, previousOverflow;

  function ensureLightbox() {
    if (modal) return;
    modal = document.createElement("div");
    modal.className = "img-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-label", "Bildvorschau");
    modal.setAttribute("aria-hidden", "true");

    const backdrop = document.createElement("div");
    backdrop.className = "img-modal__backdrop";
    backdrop.setAttribute("data-close", "img-modal");

    const dialog = document.createElement("figure");
    dialog.className = "img-modal__dialog";

    modalImg = document.createElement("img");
    modalImg.className = "img-modal__img";
    modalImg.alt = "Impression";
    modalImg.decoding = "async";

    dialog.appendChild(modalImg);
    modal.appendChild(backdrop);
    modal.appendChild(dialog);
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      const isBackdrop = e.target.matches("[data-close='img-modal']");
      const isImg = e.target === modalImg;
      if (isBackdrop || isImg) closeLightbox();
    });
    window.addEventListener(
      "keydown",
      (e) => { if (e.key === "Escape") closeLightbox(); },
      { passive: true }
    );
  }

  function openLightbox(src) {
    ensureLightbox();
    const abs =
      src instanceof HTMLImageElement
        ? src.currentSrc || src.src
        : String(src || "");
    modalImg.src = abs;
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    modal.setAttribute("aria-hidden", "false");
    modal.classList.add("is-open");
  }

  function closeLightbox() {
    if (!modal) return;
    modal.setAttribute("aria-hidden", "true");
    modal.classList.remove("is-open");
    modalImg.src = "";
    document.documentElement.style.overflow = previousOverflow || "";
  }

  /* ===============================================================
     4) Faster impressions banner
        - Build only when near viewport
        - Limit image count
        - Concurrency-limited loading
        - Eager first few, lazy rest
        - Width/height attrs for CLS
     =============================================================== */
  document.addEventListener("DOMContentLoaded", () => {
    const track = $("#impressions-track");
    const banner = track?.parentElement;
    if (!track || !banner) return;

    // ------ Tunables (adjust if you like) ------
    const MAX_VISIBLE = 24;       // total unique images shown
    const MAX_DISCOVER = 60;      // how many indices to probe at most
    const CONCURRENCY = 6;        // parallel loads
    const EAGER_COUNT = 4;        // first N images eager/high priority
    const IMG_W = 188;            // must match CSS
    const IMG_H = 188;            // must match CSS

    // Discovery config: prefer webp, then jpg/jpeg/png
    const base = "assets/img/impressions/";
    const exts = ["webp", "jpg", "jpeg", "png"];
    const patterns = [
      (i, ext) => `impression-${i}.${ext}`,
      (i, ext) => `img-${i}.${ext}`,
      (i, ext) => `photo-${i}.${ext}`,
      (i, ext) => `${i}.${ext}`,
    ];

    const probe = (src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(src);
        img.onerror = () => resolve(null);
        img.src = src;
      });

    const findExisting = async (i) => {
      // Try fewer combos first to cut requests
      for (const ext of exts) {
        for (const pat of patterns) {
          // eslint-disable-next-line no-await-in-loop
          const ok = await probe(base + pat(i, ext));
          if (ok) return ok;
        }
      }
      return null;
    };

    // Build logic is triggered only when banner nears viewport
    const build = async () => {
      obs && obs.disconnect();

      // Prefer preset <img> inside the track (zero probes)
      let sources = Array.from(track.querySelectorAll("img"))
        .map((el) => el.getAttribute("src"))
        .filter(Boolean);

      // Else, probe a limited range
      if (!sources.length) {
        const tasks = [];
        const limit = Math.max(MAX_VISIBLE, Math.min(MAX_DISCOVER, 120));
        for (let i = 1; i <= limit; i++) tasks.push(findExisting(i));
        const results = await Promise.all(tasks);
        sources = results.filter(Boolean);
      }

      if (!sources.length) return;

      // Take a subset to keep the DOM light
      const unique = Array.from(new Set(sources));
      const subset = unique.slice(0, MAX_VISIBLE);

      track.innerHTML = "";

      // Concurrency-limited loader
      const loadQueue = (srcs, onReady) =>
        new Promise((resolve) => {
          let idx = 0;
          let inFlight = 0;

          const pump = () => {
            while (inFlight < CONCURRENCY && idx < srcs.length) {
              const src = srcs[idx++];
              inFlight += 1;

              const img = new Image();
              img.decoding = "async";
              img.loading = idx <= EAGER_COUNT ? "eager" : "lazy";
              try { img.fetchPriority = idx <= EAGER_COUNT ? "high" : "auto"; }
              catch (_) {}
              img.width = IMG_W;
              img.height = IMG_H;

              img.onload = () => {
                onReady(img);
                inFlight -= 1;
                if (idx >= srcs.length && inFlight === 0) resolve();
                else pump();
              };
              img.onerror = () => {
                inFlight -= 1;
                if (idx >= srcs.length && inFlight === 0) resolve();
                else pump();
              };
              img.src = src;
            }
          };
          pump();
        });

      // Append first set as they load
      const firstSet = [];
      await loadQueue(subset, (img) => {
        // Wrap in element consistent with existing CSS
        const el = document.createElement("img");
        el.src = img.src;
        el.decoding = img.decoding;
        el.loading = img.loading;
        el.width = IMG_W;
        el.height = IMG_H;
        track.appendChild(el);
        firstSet.push(el);
      });

      // Duplicate for seamless loop (cache hit; fast)
      const secondSetFrag = document.createDocumentFragment();
      for (const el of firstSet) {
        secondSetFrag.appendChild(el.cloneNode(true));
      }
      track.appendChild(secondSetFrag);

      // Tune animation after layout
      requestAnimationFrame(() => {
        const halfWidth = track.scrollWidth / 2;
        if (halfWidth > 0) {
          const pxPerSec = 90;
          const secs = Math.max(40, Math.round(halfWidth / pxPerSec));
          track.style.animationDuration = `${secs}s`;
        }
      });

      // Click → open lightbox
      track.addEventListener("click", (e) => {
        const img = e.target.closest("img");
        if (!img) return;
        openLightbox(img);
      }, { passive: true });
    };

    // Only build when near viewport (improves initial load)
    let obs;
    const startWhenNear = () => {
      obs = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              build();
              return;
            }
          }
        },
        { root: null, rootMargin: "600px 0px", threshold: 0.01 }
      );
      obs.observe(banner);
    };

    // If already visible, build immediately; else observe
    const rect = banner.getBoundingClientRect();
    const alreadyVisible =
      rect.top < window.innerHeight + 600 && rect.bottom > -600;
    if (alreadyVisible) build();
    else startWhenNear();
  });
})();
