(() => {
  "use strict";

  const $ = (sel, ctx = document) => ctx.querySelector(sel);

  /* ================= Reveal cards ================= */
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

  /* ================= Footer year ================= */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ================= Header hide/show ================= */
  document.addEventListener("DOMContentLoaded", () => {
    const headerEl = document.querySelector("header");
    if (!headerEl) return;

    const setHeaderHeight = () => {
      const h = headerEl.offsetHeight || 0;
      document.documentElement.style.setProperty("--header-h", `${h}px`);
    };
    setHeaderHeight();
    window.addEventListener("resize", setHeaderHeight, { passive: true });
    window.addEventListener("load", setHeaderHeight);

    const TOP_PIN = 80;
    const TOL = 8;
    let lastY = window.scrollY || 0;
    let ticking = false;

    const apply = () => {
      const y = Math.max(0, window.scrollY || 0);
      if (y <= TOP_PIN) {
        headerEl.classList.remove("nav-hidden");
        lastY = y; ticking = false; return;
      }
      if (y > lastY + TOL) {
        headerEl.classList.add("nav-hidden");
        lastY = y;
      } else if (y < lastY - TOL) {
        headerEl.classList.remove("nav-hidden");
        lastY = y;
      }
      ticking = false;
    };

    apply();
    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(apply);
        }
      },
      { passive: true }
    );
    window.addEventListener("resize", () => { lastY = window.scrollY || 0; });
  });

  /* ================= Lightbox ================= */
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

  /* ================= Fast impressions banner ================= */
  document.addEventListener("DOMContentLoaded", () => {
    const track = $("#impressions-track");
    const banner = track?.parentElement;
    if (!track || !banner) return;

    const MAX_VISIBLE = 24;
    const MAX_DISCOVER = 60;
    const CONCURRENCY = 6;
    const EAGER_COUNT = 4;
    const IMG_W = 188;
    const IMG_H = 188;

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
      for (const ext of exts) {
        for (const pat of patterns) {
          // eslint-disable-next-line no-await-in-loop
          const ok = await probe(base + pat(i, ext));
          if (ok) return ok;
        }
      }
      return null;
    };

    const build = async () => {
      obs && obs.disconnect();

      let sources = Array.from(track.querySelectorAll("img"))
        .map((el) => el.getAttribute("src"))
        .filter(Boolean);

      if (!sources.length) {
        const tasks = [];
        const limit = Math.max(MAX_VISIBLE, Math.min(MAX_DISCOVER, 120));
        for (let i = 1; i <= limit; i++) tasks.push(findExisting(i));
        const results = await Promise.all(tasks);
        sources = results.filter(Boolean);
      }
      if (!sources.length) return;

      const unique = Array.from(new Set(sources));
      const subset = unique.slice(0, MAX_VISIBLE);

      track.innerHTML = "";

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
              img.width = IMG_W; img.height = IMG_H;

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

      const firstSet = [];
      await loadQueue(subset, (img) => {
        const el = document.createElement("img");
        el.src = img.src; el.decoding = img.decoding; el.loading = img.loading;
        el.width = IMG_W; el.height = IMG_H;
        track.appendChild(el);
        firstSet.push(el);
      });

      const secondSetFrag = document.createDocumentFragment();
      for (const el of firstSet) secondSetFrag.appendChild(el.cloneNode(true));
      track.appendChild(secondSetFrag);

      requestAnimationFrame(() => {
        const halfWidth = track.scrollWidth / 2;
        if (halfWidth > 0) {
          const pxPerSec = 90;
          const secs = Math.max(40, Math.round(halfWidth / pxPerSec));
          track.style.animationDuration = `${secs}s`;
        }
      });

      track.addEventListener(
        "click",
        (e) => {
          const img = e.target.closest("img");
          if (!img) return; openLightbox(img);
        },
        { passive: true }
      );
    };

    let obs;
    const startWhenNear = () => {
      obs = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) { build(); return; }
          }
        },
        { root: null, rootMargin: "600px 0px", threshold: 0.01 }
      );
      obs.observe(banner);
    };

    const rect = banner.getBoundingClientRect();
    const alreadyVisible =
      rect.top < window.innerHeight + 600 && rect.bottom > -600;
    if (alreadyVisible) build(); else startWhenNear();
  });

  /* ================= Impressionen card (index.html) ================= */
  document.addEventListener("DOMContentLoaded", async () => {
    const linksWrap = $("#gallery-links");
    if (!linksWrap) return;

    try {
      const res = await fetch("assets/img/galeries/galleries.json", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("No galleries.json");
      const data = await res.json();

      const galleries = (data.galleries || [])
        .filter(g => g && g.id)
        .map(g => ({
          id: g.id,
          title: g.title || g.id.replace(/[-_]/g, " ").replace(/\b\w/g, c =>
            c.toUpperCase()
          ),
          cover: g.cover || null
        }));

      if (!galleries.length) {
        linksWrap.innerHTML = "<p>Keine Galerien verfügbar.</p>";
        return;
      }

      const frag = document.createDocumentFragment();
      for (const g of galleries) {
        const a = document.createElement("a");
        a.className = "btn";
        a.href = `galerie.html?g=${encodeURIComponent(g.id)}&t=${
          encodeURIComponent(g.title)
        }`;
        a.textContent = g.title;
        frag.appendChild(a);
      }
      linksWrap.innerHTML = "";
      linksWrap.appendChild(frag);
    } catch (e) {
      linksWrap.innerHTML = "<p>Keine Galerien verfügbar.</p>";
    }
  });

  /* ================= Galerie page loader (galerie.html) ============== */
  document.addEventListener("DOMContentLoaded", async () => {
    const grid = $("#galerie-grid");
    const titleEl = $("#galerie-title");
    const descEl = $("#galerie-desc");
    if (!grid || !titleEl) return;

    const params = new URLSearchParams(location.search);
    const g = params.get("g");
    const tParam = params.get("t"); // clean title passed from button

    if (!g) {
      titleEl.textContent = "Galerie";
      if (descEl) descEl.textContent = "Keine Galerie gewählt.";
      return;
    }

    // Fallback prettifier when no clean title is provided
    const prettify = (s) =>
      String(s || "")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());

    // Use clean title from ?t= if present, else prettify folder id
    const finalTitle = tParam ? decodeURIComponent(tParam) : prettify(g);
    titleEl.textContent = `Galerie: ${finalTitle}`;

    // Ensure a "Zurück" button exists directly under the title
    let actions = document.querySelector(".gallery-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "gallery-actions";
      titleEl.insertAdjacentElement("afterend", actions);
    }
    if (!actions.querySelector("a[data-back]")) {
      const backLink = document.createElement("a");
      backLink.className = "btn";
      backLink.href = "index.html#impressionen";
      backLink.setAttribute("data-back", "1");
      backLink.textContent = "Zurück";
      actions.appendChild(backLink);
    }

    if (descEl) descEl.textContent = "Bilder werden geladen …";

    // ---- Image discovery (supports both galeries/ and galleries/) ----
    const exts = ["webp", "jpg", "jpeg", "png"];
    const patterns = [
      (i, ext) => `img-${i}.${ext}`,
      (i, ext) => `photo-${i}.${ext}`,
      (i, ext) => `impression-${i}.${ext}`,
      (i, ext) => `${i}.${ext}`,
    ];
    const MAX = 200;
    const CONCURRENCY = 8;

    const probe = (src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(src);
        img.onerror = () => resolve(null);
        img.src = src;
      });

    const discoverFromBase = async (base) => {
      const discoverOne = async (i) => {
        for (const ext of exts) {
          for (const pat of patterns) {
            // eslint-disable-next-line no-await-in-loop
            const ok = await probe(base + pat(i, ext));
            if (ok) return ok;
          }
        }
        return null;
      };

      const tasks = [];
      for (let i = 1; i <= MAX; i++) tasks.push(discoverOne(i));
      const chunks = [];
      for (let i = 0; i < tasks.length; i += CONCURRENCY) {
        chunks.push(tasks.slice(i, i + CONCURRENCY));
      }

      const foundLocal = [];
      for (const chunk of chunks) {
        // eslint-disable-next-line no-await-in-loop
        const res = await Promise.all(chunk);
        for (const s of res) if (s) foundLocal.push(s);
        if (foundLocal.length >= 120) break; // enough images
      }
      return foundLocal;
    };

    const baseCandidates = [
      `assets/img/galeries/${encodeURIComponent(g)}/`,
      `assets/img/galleries/${encodeURIComponent(g)}/`,
    ];

    let found = [];
    for (const base of baseCandidates) {
      // eslint-disable-next-line no-await-in-loop
      const arr = await discoverFromBase(base);
      if (arr.length) {
        found = arr;
        break;
      }
    }

    if (!found.length) {
      if (descEl) descEl.textContent = "Keine Bilder gefunden.";
      return;
    }

    if (descEl) descEl.textContent = `${found.length} Bilder`;
    const frag = document.createDocumentFragment();
    for (const src of found) {
      const img = document.createElement("img");
      img.src = src;
      img.decoding = "async";
      img.loading = "lazy";
      img.width = 320;
      img.height = 240;
      img.addEventListener("click", () => openLightbox(img));
      frag.appendChild(img);
    }
    grid.appendChild(frag);
  });
})();
