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
     3) Image lightbox (in-page, no separate button)
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

    // Close on backdrop or image click
    modal.addEventListener("click", (e) => {
      const isBackdrop = e.target.matches("[data-close='img-modal']");
      const isImg = e.target === modalImg;
      if (isBackdrop || isImg) closeLightbox();
    });

    // Close on ESC
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") closeLightbox();
      },
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
     4) Impressions banner: discover images, animate track, click → lightbox
     =============================================================== */
  document.addEventListener("DOMContentLoaded", async () => {
    const track = $("#impressions-track");
    const banner = track?.parentElement;
    if (!track || !banner) return;

    const base = "assets/img/impressions/";
    const maxImages = 120;
    const exts = ["jpg", "jpeg", "png", "webp"];
    const patterns = [
      (i, ext) => `impression-${i}.${ext}`,
      (i, ext) => `${i}.${ext}`,
      (i, ext) => `img-${i}.${ext}`,
      (i, ext) => `photo-${i}.${ext}`,
    ];

    const probe = (src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(src);
        img.onerror = () => resolve(null);
        img.src = src;
      });

    const findExisting = async (i) => {
      for (const ext of exts) {
        for (const pat of patterns) {
          // eslint-disable-next-line no-await-in-loop
          const ok = await probe(base + pat(i, ext));
          if (ok) return ok;
        }
      }
      return null;
    };

    // Prefer preset <img> elements inside the track
    let sources = Array.from(track.querySelectorAll("img"))
      .map((el) => el.getAttribute("src"))
      .filter(Boolean);

    // Else discover files by probing patterns
    if (!sources.length) {
      const tasks = [];
      for (let i = 1; i <= maxImages; i++) tasks.push(findExisting(i));
      const results = await Promise.all(tasks);
      sources = results.filter(Boolean);
    }
    if (!sources.length) return;

    // Build track: one set + duplicate for seamless loop
    track.innerHTML = "";
    const appendSet = (srcs) => {
      const frag = document.createDocumentFragment();
      for (const src of srcs) {
        const img = document.createElement("img");
        img.src = src;
        img.decoding = "async";
        img.loading = "lazy";
        frag.appendChild(img);
      }
      track.appendChild(frag);
    };
    appendSet(sources);
    appendSet(sources);

    // Tune animation duration to real width
    const halfWidth = track.scrollWidth / 2;
    if (halfWidth > 0) {
      const pxPerSec = 90;
      const secs = Math.max(40, Math.round(halfWidth / pxPerSec));
      track.style.animationDuration = `${secs}s`;
    }

    // Click → open in-page lightbox
    track.addEventListener("click", (e) => {
      const img = e.target.closest("img");
      if (!img) return;
      openLightbox(img);
    });
  });
})();
