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

  /* ===============================================================
     4) Impressions banner: low-request discovery + caching
     =============================================================== */
  document.addEventListener("DOMContentLoaded", () => {
    const track = $("#impressions-track");
    const banner = track?.parentElement;
    if (!track || !banner) return;

    const MAX_VISIBLE = 24;   // how many to show
    const MAX_INDEX = 80;     // highest number to try
    const MISS_LIMIT = 20;    // stop after N consecutive misses
    const IMG_W = 188, IMG_H = 188;

    const base = "assets/img/impressions/";
    const exts = ["webp", "jpg", "jpeg", "png"];
    const patterns = [
      (i, ext) => `impression-${i}.${ext}`,
      (i, ext) => `img-${i}.${ext}`,
      (i, ext) => `photo-${i}.${ext}`,
      (i, ext) => `${i}.${ext}`,
    ];

    const ssKey = "impr-srcs:v1"; // bump v# if you change logic

    const headExists = async (url) => {
      try {
        const res = await fetch(url, { method: "HEAD", cache: "no-store" });
        return res.ok;
      } catch {
        return false;
      }
    };

    const discoverSequential = async () => {
      // if developer prefilled <img> in markup, use those (0 extra requests)
      let preset = Array.from(track.querySelectorAll("img"))
        .map((el) => el.getAttribute("src"))
        .filter(Boolean);
      if (preset.length) return Array.from(new Set(preset)).slice(0, MAX_VISIBLE);

      // sessionStorage cache
      try {
        const cached = JSON.parse(sessionStorage.getItem(ssKey) || "null");
        if (Array.isArray(cached) && cached.length) return cached;
      } catch {}

      const found = [];
      let miss = 0;
      for (let i = 1; i <= MAX_INDEX; i++) {
        let hitUrl = null;
        for (const ext of exts) {
          for (const pat of patterns) {
            const url = base + pat(i, ext);
            // eslint-disable-next-line no-await-in-loop
            const ok = await headExists(url);
            if (ok) { hitUrl = url; break; }
          }
          if (hitUrl) break;
        }
        if (hitUrl) {
          found.push(hitUrl);
          miss = 0;
          if (found.length >= MAX_VISIBLE) break;
        } else {
          miss += 1;
          if (miss >= MISS_LIMIT && found.length) break;
        }
      }

      try { sessionStorage.setItem(ssKey, JSON.stringify(found)); } catch {}
      return found;
    };

    const build = async () => {
      obs && obs.disconnect();

      const sources = await discoverSequential();
      if (!sources.length) return;

      // Build track (one set + duplicate for loop)
      track.innerHTML = "";
      const addSet = (srcs) => {
        const frag = document.createDocumentFragment();
        for (const src of srcs) {
          const img = document.createElement("img");
          img.src = src;
          img.decoding = "async";
          img.loading = "lazy";
          img.width = IMG_W;
          img.height = IMG_H;
          frag.appendChild(img);
        }
        track.appendChild(frag);
      };
      addSet(sources);
      addSet(sources);

      // Tune animation speed by real width
      requestAnimationFrame(() => {
        const half = track.scrollWidth / 2;
        if (half > 0) {
          const pxPerSec = 90;
          const secs = Math.max(40, Math.round(half / pxPerSec));
          track.style.animationDuration = `${secs}s`;
        }
      });

      track.addEventListener(
        "click",
        (e) => {
          const img = e.target.closest("img");
          if (img) openLightbox(img);
        },
        { passive: true }
      );
    };

    // Lazy build when banner near viewport
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
    const visible = rect.top < innerHeight + 600 && rect.bottom > -600;
    if (visible) build(); else startWhenNear();
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
  /* ================= Galerie page loader (galerie.html) ============== */
  document.addEventListener("DOMContentLoaded", async () => {
    const grid = $("#galerie-grid");
    const titleEl = $("#galerie-title");
    const descEl = $("#galerie-desc");
    if (!grid || !titleEl) return;

    const params = new URLSearchParams(location.search);
    const g = params.get("g");
    const tParam = params.get("t");

    if (!g) {
      titleEl.textContent = "Galerie";
      if (descEl) descEl.textContent = "Keine Galerie gewählt.";
      return;
    }

    const prettify = (s) =>
      String(s || "")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());

    const finalTitle = tParam ? decodeURIComponent(tParam) : prettify(g);
    titleEl.textContent = `Galerie: ${finalTitle}`;

    // "Zurück" button (styled like other .btn)
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

    // ---- Low-request discovery with HEAD + caching & early stop ----
    const exts = ["webp", "jpg", "jpeg", "png"];
    const patterns = [
      (i, ext) => `img-${i}.${ext}`,
      (i, ext) => `photo-${i}.${ext}`,
      (i, ext) => `impression-${i}.${ext}`,
      (i, ext) => `${i}.${ext}`,
    ];
    const MAX_INDEX = 300;   // upper bound to try
    const MISS_LIMIT = 30;   // stop after N consecutive misses
    const perPageKey = (root) => `gal:${root}:${g}:v1`;

    const headExists = async (url) => {
      try {
        const res = await fetch(url, { method: "HEAD", cache: "no-store" });
        return res.ok;
      } catch {
        return false;
      }
    };

    const discoverFromRoot = async (root) => {
      // session cache per root (galeries/ or galleries/)
      try {
        const cached = JSON.parse(sessionStorage.getItem(perPageKey(root)) || "null");
        if (Array.isArray(cached) && cached.length) return cached;
      } catch {}

      const base = `${root}/${encodeURIComponent(g)}/`;
      const found = [];
      let miss = 0;
      let seenAny = false;

      for (let i = 1; i <= MAX_INDEX; i++) {
        let urlHit = null;
        for (const ext of exts) {
          for (const pat of patterns) {
            const url = base + pat(i, ext);
            // eslint-disable-next-line no-await-in-loop
            const ok = await headExists(url);
            if (ok) { urlHit = url; break; }
          }
          if (urlHit) break;
        }
        if (urlHit) {
          seenAny = true;
          found.push(urlHit);
          miss = 0;
          // allow large galleries; remove this cap if you like
          if (found.length >= 120) break;
        } else {
          miss += 1;
          if (miss >= MISS_LIMIT && seenAny) break;
        }
      }

      try {
        sessionStorage.setItem(perPageKey(root), JSON.stringify(found));
      } catch {}

      return found;
    };

    // Try both spellings; first with your current one
    const roots = [
      "assets/img/galeries",
      "assets/img/galleries",
    ];

    let files = [];
    for (const r of roots) {
      // eslint-disable-next-line no-await-in-loop
      const arr = await discoverFromRoot(r);
      if (arr.length) { files = arr; break; }
    }

    if (!files.length) {
      if (descEl) descEl.textContent = "Keine Bilder gefunden.";
      return;
    }

    if (descEl) descEl.textContent = `${files.length} Bilder`;

    const frag = document.createDocumentFragment();
    for (const src of files) {
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
