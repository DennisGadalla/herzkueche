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
  document.querySelectorAll(".card").forEach((el) => revealObserver.observe(el));

  /* =============== Auto year =============== */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* =============== Impressions: load images =============== */
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      const track = document.getElementById("impressions-track");
      const banner = track?.parentElement;
      if (!track || !banner) return;

      const base = "assets/img/impressions/";
      const maxImages = 120;
      const exts = ["jpg", "jpeg", "png", "webp"];
      const patterns = [
        (i, ext) => `impression-${i}.${ext}`,
        (i, ext) => `${i}.${ext}`,
        (i, ext) => `img-${i}.${ext}`,
        (i, ext) => `photo-${i}.${ext}`
      ];

      const loadImage = (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(src);
          img.onerror = () => resolve(null);
          img.src = src;
        });

      const findExistingForIndex = async (i) => {
        for (const ext of exts) {
          for (const pat of patterns) {
            // eslint-disable-next-line no-await-in-loop
            const ok = await loadImage(base + pat(i, ext));
            if (ok) return ok;
          }
        }
        return null;
      };

      (async () => {
        let sources = [];

        // 1) If user already placed <img> in the track, use those
        const presetImgs = Array.from(track.querySelectorAll("img"))
          .map((img) => img.getAttribute("src"))
          .filter(Boolean);
        if (presetImgs.length) {
          sources = presetImgs;
        } else {
          // 2) Probe filenames with multiple patterns
          const tasks = [];
          for (let i = 1; i <= maxImages; i++) tasks.push(findExistingForIndex(i));
          const results = await Promise.all(tasks);
          sources = results.filter(Boolean);
        }

        if (!sources.length) {
          // nothing found; bail out silently
          return;
        }

        // duplicate list for seamless loop
        const all = sources.concat(sources);

        // clear track (in case preset existed, we’ll rebuild for duplication)
        track.innerHTML = "";

        // append images
        const frag = document.createDocumentFragment();
        for (const src of all) {
          const img = document.createElement("img");
          img.src = src;
          img.decoding = "async";
          img.loading = "lazy";
          img.draggable = false;
          frag.appendChild(img);
        }
        track.appendChild(frag);

        setupImpressionsInteractions(banner, track);
      })();
    },
    { passive: true }
  );

  /* =============== Impressions: interactivity =============== */
  function setupImpressionsInteractions(banner, track) {
    // --- Auto-scroll via rAF ---
    let auto = { running: true, speed: 0.22 }; // px/frame (~13px/s @60fps)
    let rafId = null;

    const loop = () => {
      if (auto.running) {
        banner.scrollLeft += auto.speed;
        const half = track.scrollWidth / 2; // images are duplicated
        if (half > 0 && banner.scrollLeft >= half) banner.scrollLeft -= half;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    // --- Drag to scroll (mouse + touch via pointer events) ---
    let isDown = false;
    let startX = 0;
    let startLeft = 0;
    let moved = false;

    const onPointerDown = (e) => {
      isDown = true;
      moved = false;
      banner.classList.add("dragging");
      banner.setPointerCapture?.(e.pointerId);
      startX = e.clientX;
      startLeft = banner.scrollLeft;
      auto.running = false; // pause auto-scroll while user drags
    };

    const onPointerMove = (e) => {
      if (!isDown) return;
      const delta = e.clientX - startX;
      if (Math.abs(delta) > 3) moved = true;
      banner.scrollLeft = startLeft - delta;

      // seamless backwards loop
      const half = track.scrollWidth / 2;
      if (half > 0 && banner.scrollLeft < 0) banner.scrollLeft += half;

      // prevent page scroll on touch while dragging horizontally
      e.preventDefault?.();
    };

    const onPointerUp = (e) => {
      if (!isDown) return;
      isDown = false;
      banner.classList.remove("dragging");
      banner.releasePointerCapture?.(e.pointerId);
      // resume auto scroll after a short pause
      setTimeout(() => (auto.running = true), 180);
    };

    banner.addEventListener("pointerdown", onPointerDown);
    banner.addEventListener("pointermove", onPointerMove, { passive: false });
    banner.addEventListener("pointerup", onPointerUp);
    banner.addEventListener("pointercancel", onPointerUp);
    banner.addEventListener("pointerleave", onPointerUp);

    // Prevent image ghost-drag
    track.addEventListener("dragstart", (e) => e.preventDefault());

    // --- Click to open lightbox (ignore if it was a drag) ---
    track.addEventListener("click", (e) => {
      const img = e.target.closest("img");
      if (!img) return;
      if (moved) return; // don’t open on drag
      openLightbox(img.src);
    });

    // Wheel pause/resume
    banner.addEventListener(
      "wheel",
      () => {
        auto.running = false;
        clearTimeout(banner._wheelTimer);
        banner._wheelTimer = setTimeout(() => (auto.running = true), 300);
      },
      { passive: true }
    );
  }

  /* =============== Lightbox =============== */
  function openLightbox(src) {
    const lb = document.getElementById("impression-lightbox");
    const img = document.getElementById("lightbox-img");
    const closeBtn = lb?.querySelector(".lightbox-close");
    if (!lb || !img || !closeBtn) return;

    img.src = src;
    lb.classList.add("open");
    lb.setAttribute("aria-hidden", "false");
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const close = () => {
      lb.classList.remove("open");
      lb.setAttribute("aria-hidden", "true");
      document.body.style.overflow = prevOverflow;
      img.src = "";
      detach();
    };

    const onBackdrop = (e) => { if (e.target === lb) close(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };

    function detach() {
      lb.removeEventListener("click", onBackdrop);
      closeBtn.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    }

    lb.addEventListener("click", onBackdrop);
    closeBtn.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
  }

  /* =============== Header Scroll Effect =============== */
  const header = document.querySelector("header");
  if (header) {
    let ticking = false;
    const threshold = 10;
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (window.scrollY > threshold) header.classList.add("scrolled");
          else header.classList.remove("scrolled");
          ticking = false;
        });
        ticking = true;
      }
    };
    document.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
})();
