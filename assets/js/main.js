(() => {
  "use strict";

  /* ========================= Helpers & probe ========================= */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);

  // Detect whether HEAD works; else fallback to Image()
  let PROBE_MODE = (location.protocol === "file:") ? "img" : "head";
  async function detectProbeMode(sampleUrl) {
    if (PROBE_MODE === "img") return "img";
    try {
      const res = await fetch(sampleUrl, { method: "HEAD", cache: "no-store" });
      if (!res.ok) throw 0;
      PROBE_MODE = "head";
    } catch {
      PROBE_MODE = "img";
    }
    return PROBE_MODE;
  }
  async function probeExists(url) {
    if (PROBE_MODE === "head") {
      try {
        const r = await fetch(url, { method: "HEAD", cache: "no-store" });
        return r.ok;
      } catch { return false; }
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  /* ========================= Small persistent cache ========================= */
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  function getCache(key) {
    try {
      const obj = JSON.parse(localStorage.getItem(key) || "null");
      if (!obj || typeof obj !== "object") return null;
      if (typeof obj.t !== "number" || !Array.isArray(obj.v)) return null;
      if (Date.now() > obj.t) return null;
      return obj.v;
    } catch { return null; }
  }
  function setCache(key, arr, ttl = CACHE_TTL_MS) {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ t: Date.now() + ttl, v: arr || [] })
      );
    } catch { /* ignore */ }
  }
  function setCacheScalar(key, val, ttl = CACHE_TTL_MS) {
    try {
      localStorage.setItem(key, JSON.stringify({ t: Date.now() + ttl, v: val }));
    } catch { /* ignore */ }
  }
  function getCacheScalar(key) {
    try {
      const obj = JSON.parse(localStorage.getItem(key) || "null");
      if (!obj || typeof obj !== "object") return null;
      if (typeof obj.t !== "number") return null;
      if (Date.now() > obj.t) return null;
      return obj.v;
    } catch { return null; }
  }

  /* ========================= Reveal cards ========================= */
  const revealObserver = new IntersectionObserver(
    (entries, obs) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("reveal"); obs.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll(".card").forEach((el) => revealObserver.observe(el));

  /* ========================= Footer year ========================= */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ========================= Header hide/show ========================= */
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

    const TOP_PIN = 80, TOL = 8;
    let lastY = window.scrollY || 0, ticking = false;

    const apply = () => {
      const y = Math.max(0, window.scrollY || 0);
      if (y <= TOP_PIN) { headerEl.classList.remove("nav-hidden"); lastY = y; ticking = false; return; }
      if (y > lastY + TOL) { headerEl.classList.add("nav-hidden"); lastY = y; }
      else if (y < lastY - TOL) { headerEl.classList.remove("nav-hidden"); lastY = y; }
      ticking = false;
    };
    apply();
    window.addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(apply); }
    }, { passive: true });
    window.addEventListener("resize", () => { lastY = window.scrollY || 0; });
  });

  /* ========================= Lightbox ========================= */
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
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeLightbox();
    }, { passive: true });
  }
  function openLightbox(src) {
    ensureLightbox();
    const abs = src instanceof HTMLImageElement
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

  /* ========================= Numbered image discovery =========================
     Minimizes requests:
     - quick sniff to find first hit (small range),
     - then NARROWS to that pattern + extension,
     - stops after small gaps,
     - caches result in localStorage.
  ========================================================================= */
  const DEFAULT_EXTS = ["webp", "jpg", "jpeg", "png"];
  const DEFAULT_PATS = [
    (i, ext) => `impression-${i}.${ext}`,
    (i, ext) => `img-${i}.${ext}`,
    (i, ext) => `photo-${i}.${ext}`,
    (i, ext) => `${i}.${ext}`,
  ];
  function inferFromUrl(url, base) {
    // returns {patFn, ext} if we can infer a pattern
    try {
      const name = url.replace(base, "");
      const m = /^(impression-|img-|photo-)?(\d+)\.(webp|jpg|jpeg|png)$/i.exec(name);
      if (!m) return null;
      const prefix = m[1] || "";
      const ext = m[3].toLowerCase();
      const patFn = (i, e) => `${prefix}${i}.${e}`;
      return { patFn, ext };
    } catch { return null; }
  }
  async function discoverNumberedImages(base, {
    maxIndex = 120,
    sniffMaxIndex = 12,
    stopAfterGap = 4,
    cacheKey = `imglist:${base}:v3`,
    ttl = CACHE_TTL_MS,
  } = {}) {
    // cache
    const cached = getCache(cacheKey);
    if (cached && cached.length) return cached;

    await detectProbeMode("assets/img/logo/logo.png");

    // Sniff a first hit quickly
    let firstHit = null, firstI = null, firstPat = null, firstExt = null;
    outer: for (let i = 1; i <= sniffMaxIndex; i++) {
      for (const ext of DEFAULT_EXTS) {
        for (const pat of DEFAULT_PATS) {
          const url = base + pat(i, ext);
          // eslint-disable-next-line no-await-in-loop
          if (await probeExists(url)) {
            firstHit = url; firstI = i; firstPat = pat; firstExt = ext;
            break outer;
          }
        }
      }
    }
    if (!firstHit) { setCache(cacheKey, [], 5 * 60 * 1000); return []; }

    // Narrow to inferred pattern & ext for the rest
    const inferred = inferFromUrl(firstHit, base);
    const patterns = inferred ? [inferred.patFn] : [firstPat];
    const exts = inferred ? [inferred.ext] : [firstExt];

    const out = [firstHit];
    let misses = 0;
    for (let i = firstI + 1; i <= maxIndex; i++) {
      let hit = null;
      for (const ext of exts) {
        for (const pat of patterns) {
          const url = base + pat(i, ext);
          // eslint-disable-next-line no-await-in-loop
          if (await probeExists(url)) { hit = url; break; }
        }
        if (hit) break;
      }
      if (hit) { out.push(hit); misses = 0; }
      else { misses += 1; if (misses >= stopAfterGap) break; }
    }

    setCache(cacheKey, out, ttl);
    return out;
  }

  /* ========================= Impressions banner ========================= */
  document.addEventListener("DOMContentLoaded", () => {
    const track = $("#impressions-track");
    const banner = track?.parentElement;
    if (!track || !banner) return;

    const MAX_VISIBLE = 24;
    const base = "assets/img/impressions/";

    const build = async () => {
      obs && obs.disconnect();

      // Use any preset <img> first (0 extra requests)
      let sources = Array.from(track.querySelectorAll("img"))
        .map((el) => el.getAttribute("src"))
        .filter(Boolean);

      if (!sources.length) {
        sources = await discoverNumberedImages(base, {
          maxIndex: 60,
          sniffMaxIndex: 10,
          stopAfterGap: 5,
          cacheKey: `impr:${base}:v3`,
        });
      }
      if (!sources.length) return;

      // slice to visible amount and duplicate for loop
      const subset = sources.slice(0, MAX_VISIBLE);

      track.innerHTML = "";
      const addSet = (srcs) => {
        const frag = document.createDocumentFragment();
        for (const src of srcs) {
          const img = document.createElement("img");
          img.src = src;
          img.decoding = "async";
          img.loading = "lazy";
          img.width = 188;
          img.height = 188;
          frag.appendChild(img);
        }
        track.appendChild(frag);
      };
      addSet(subset);
      addSet(subset);

      requestAnimationFrame(() => {
        const half = track.scrollWidth / 2;
        if (half > 0) {
          const pxPerSec = 90;
          const secs = Math.max(40, Math.round(half / pxPerSec));
          track.style.animationDuration = `${secs}s`;
        }
      });

      track.addEventListener("click", (e) => {
        const img = e.target.closest("img");
        if (img) openLightbox(img);
      }, { passive: true });
    };

    let obs;
    const startWhenNear = () => {
      obs = new IntersectionObserver(
        (entries) => {
          for (const e of entries) if (e.isIntersecting) { build(); return; }
        },
        { root: null, rootMargin: "600px 0px", threshold: 0.01 }
      );
      obs.observe(banner);
    };

    const rect = banner.getBoundingClientRect();
    const visible = rect.top < innerHeight + 600 && rect.bottom > -600;
    if (visible) build(); else startWhenNear();
  });

  /* ========================= Impressionen card (index.html) ========================= */
  document.addEventListener("DOMContentLoaded", async () => {
    const linksWrap = $("#gallery-links");
    if (!linksWrap) return;

    // Try both spellings to load manifest if present (optional convenience)
    const CANDIDATE_PATHS = [
      "assets/img/galeries/galleries.json",
      "assets/img/galleries/galleries.json",
    ];
    const prettify = (s) =>
      String(s || "")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());

    const parseGalleries = (data) => {
      try {
        let arr = [];
        if (Array.isArray(data)) arr = data;
        else if (data && Array.isArray(data.galleries)) arr = data.galleries;
        else return [];
        return arr
          .map((g) => typeof g === "string"
            ? { id: g, title: prettify(g) }
            : (g && typeof g.id === "string")
              ? { id: g.id, title: g.title || prettify(g.id) }
              : null)
          .filter(Boolean);
      } catch { return []; }
    };

    let galleries = [];
    for (const url of CANDIDATE_PATHS) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;
        const data = await res.json();
        const parsed = parseGalleries(data);
        if (parsed.length) { galleries = parsed; break; }
      } catch { /* ignore */ }
    }

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
  });

  /* ========================= galerie.html loader ========================= */
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

    // Ensure "Zurück" button
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

    await detectProbeMode("assets/img/logo/logo.png");

    // Prefer a remembered root per gallery to avoid probing both
    const rootKey = `gal:root:${g}:v1`;
    let root = getCacheScalar(rootKey);

    const roots = root
      ? [root] // already known
      : ["assets/img/galeries", "assets/img/galleries"];

    let files = [];
    for (const r of roots) {
      const base = `${r}/${encodeURIComponent(g)}/`;
      // Try cached list first
      const list = await discoverNumberedImages(base, {
        maxIndex: 180,
        sniffMaxIndex: 12,
        stopAfterGap: 5,
        cacheKey: `gal:list:${base}:v3`,
      });
      if (list.length) {
        files = list;
        // remember working root (for future loads)
        if (!root) setCacheScalar(rootKey, r);
        break;
      }
      // if we had a remembered root but found nothing (moved?), drop it
      if (root && !list.length) setCacheScalar(rootKey, null, 1);
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
