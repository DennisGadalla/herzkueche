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
      if (y <= TOP_PIN) {
        headerEl.classList.remove("nav-hidden"); lastY = y; ticking = false;
        return;
      }
      if (y > lastY + TOL) { headerEl.classList.add("nav-hidden"); lastY = y; }
      else if (y < lastY - TOL) {
        headerEl.classList.remove("nav-hidden"); lastY = y;
      }
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
     - caches result in localStorage,
     - **caps total finds/requests via targetCount**.
  ========================================================================= */
  const DEFAULT_EXTS = ["webp", "jpg", "jpeg", "png"];
  const DEFAULT_PATS = [
    (i, ext) => `impression-${i}.${ext}`,
    (i, ext) => `img-${i}.${ext}`,
    (i, ext) => `photo-${i}.${ext}`,
    (i, ext) => `${i}.${ext}`,
  ];
  function inferFromUrl(url, base) {
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
    targetCount = Infinity,                // cap results + requests
    cacheKey = `imglist:${base}:v4`,       // bump to v4
    ttl = CACHE_TTL_MS,
  } = {}) {
    const cached = getCache(cacheKey);
    if (cached && cached.length) return cached.slice(0, targetCount);

    await detectProbeMode("assets/img/logo/logo.png");

    const sniffMax = Math.min(
      sniffMaxIndex, maxIndex, Math.max(1, targetCount)
    );
    let firstHit = null, firstI = null, firstPat = null, firstExt = null;
    outer: for (let i = 1; i <= sniffMax; i++) {
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

    if (targetCount <= 1) {
      setCache(cacheKey, [firstHit], ttl);
      return [firstHit];
    }

    const inferred = inferFromUrl(firstHit, base);
    const patterns = inferred ? [inferred.patFn] : [firstPat];
    const exts = inferred ? [inferred.ext] : [firstExt];

    const out = [firstHit];
    let misses = 0;
    for (let i = firstI + 1; i <= maxIndex; i++) {
      if (out.length >= targetCount) break;
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
      else {
        misses += 1;
        if (misses >= stopAfterGap) break;
      }
    }

    setCache(cacheKey, out, ttl);
    return out;
  }

  /* ========================= Impressions banner ========================= */
  document.addEventListener("DOMContentLoaded", () => {
    const track = $("#impressions-track");
    const banner = track?.parentElement;
    if (!track || !banner) return;

    const MAX_VISIBLE = 10; // fixed cap
    const base = "assets/img/impressions/";

    const build = async () => {
      obs && obs.disconnect();

      // Use preset <img> if present (0 requests)
      let sources = Array.from(track.querySelectorAll("img"))
        .map((el) => el.getAttribute("src"))
        .filter(Boolean);

      if (!sources.length) {
        sources = await discoverNumberedImages(base, {
          maxIndex: 60,
          sniffMaxIndex: Math.min(6, MAX_VISIBLE),
          stopAfterGap: 3,
          targetCount: MAX_VISIBLE,          // cap requests & results
          cacheKey: `impr:${base}:v4`,
        });
      }
      if (!sources.length) return;

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

  /* ================= Galerie page loader (galerie.html) ============== */
  document.addEventListener("DOMContentLoaded", async () => {
    const grid = $("#galerie-grid");
    const titleEl = $("#galerie-title");
    const descEl = $("#galerie-desc");
    if (!grid || !titleEl) return;

    // Inject mild hover zoom effect for gallery images (scoped)
    const styleId = "gallery-hover-zoom-style";
    if (!document.getElementById(styleId)) {
      const s = document.createElement("style");
      s.id = styleId;
      s.textContent = `
        #galerie-grid img{
          transition: transform .18s ease;
          transform-origin: center;
          will-change: transform;
        }
        #galerie-grid img:hover{
          transform: scale(1.04);
        }
      `;
      document.head.appendChild(s);
    }

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

    // ---- Back button: reuse if present, dedupe, no visual change ----
    let actions = document.querySelector(".gallery-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "gallery-actions";
      titleEl.insertAdjacentElement("afterend", actions);
    }
    // Find existing back links by attribute/id or visible text
    const byAttr = Array.from(
      document.querySelectorAll('a[data-back], a#galerie-back')
    );
    const byText = Array.from(document.querySelectorAll("a.btn")).filter((a) =>
      (a.textContent || "").trim().toLowerCase() === "zurück"
    );
    const seen = new Set();
    const candidates = [...byAttr, ...byText].filter((a) => {
      if (seen.has(a)) return false; seen.add(a); return true;
    });

    let backLink = candidates[0];
    if (!backLink) {
      backLink = document.createElement("a");
      backLink.className = "btn";
      backLink.id = "galerie-back";
      backLink.setAttribute("data-back", "1");
      backLink.href = "index.html#impressionen";
      backLink.textContent = "Zurück";
    } else {
      // Ensure it looks like the standard button
      if (!backLink.classList.contains("btn")) backLink.classList.add("btn");
      backLink.setAttribute("data-back", "1");
      if (!backLink.getAttribute("href")) {
        backLink.href = "index.html#impressionen";
      }
    }
    actions.appendChild(backLink);
    // Remove duplicates elsewhere
    candidates.slice(1).forEach((el) => el.remove());
    // -----------------------------------------------------------------

    if (descEl) descEl.textContent = "Bilder werden geladen …";

    // ---- Manifest with count/pattern to avoid probing ----
    const manifestUrls = [
      "assets/img/galeries/galleries.json",
      "assets/img/galleries/galleries.json",
    ];
    const loadManifest = async () => {
      for (const url of manifestUrls) {
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) continue;
          return await res.json();
        } catch {}
      }
      return null;
    };

    const parseManifest = (data) => {
      if (!data) return [];
      const arr = Array.isArray(data) ? data
        : Array.isArray(data.galleries) ? data.galleries
        : [];
      return arr.map((x) => {
        if (typeof x === "string") {
          return { id: x, title: prettify(x) };
        }
        if (x && typeof x.id === "string") {
          return {
            id: x.id,
            title: x.title || prettify(x.id),
            count: Number.isFinite(x.count) ? x.count : null,
            pattern: typeof x.pattern === "string" ? x.pattern : null,
            start: Number.isFinite(x.start) ? x.start : 1,
          };
        }
        return null;
      }).filter(Boolean);
    };

    const manif = parseManifest(await loadManifest());
    const cfg = manif.find((r) => r.id === g) || {};

    // Build URLs with zero/one probe depending on manifest info
    const roots = ["assets/img/galeries", "assets/img/galleries"];
    let baseRoot = roots[0];
    for (const r of roots) { baseRoot = r; break; } // quick pick; failover later
    const base = `${baseRoot}/${encodeURIComponent(g)}/`;

    const LOCAL_DEFAULT_EXTS = ["webp", "jpg", "jpeg", "png"];
    const LOCAL_DEFAULT_PATS = [
      (i, ext) => `impression-${i}.${ext}`,
      (i, ext) => `img-${i}.${ext}`,
      (i, ext) => `photo-${i}.${ext}`,
      (i, ext) => `${i}.${ext}`,
    ];

    async function probeExistsLocal(url) {
      if (typeof probeExists === "function") return probeExists(url);
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      });
    }

    async function sniffPatternAt(startIdx) {
      for (const root of roots) {
        const b = `${root}/${encodeURIComponent(g)}/`;
        for (const ext of LOCAL_DEFAULT_EXTS) {
          for (const pat of LOCAL_DEFAULT_PATS) {
            const url = b + pat(startIdx, ext);
            // eslint-disable-next-line no-await-in-loop
            const ok = await probeExistsLocal(url);
            if (ok) return { root, pat, ext };
          }
        }
      }
      return null;
    }

    let files = [];
    if (Number.isFinite(cfg.count) && cfg.count > 0) {
      const start = cfg.start || 1;

      if (cfg.pattern && /\{\}/.test(cfg.pattern)) {
        for (let i = 0; i < cfg.count; i++) {
          files.push(base + cfg.pattern.replace("{}", String(start + i)));
        }
      } else {
        // ONE sniff at "start", then build all
        // eslint-disable-next-line no-await-in-loop
        const hit = await sniffPatternAt(start);
        if (hit) {
          const realBase = `${hit.root}/${encodeURIComponent(g)}/`;
          for (let i = 0; i < cfg.count; i++) {
            files.push(realBase + hit.pat(start + i, hit.ext));
          }
        }
      }
    }

    // Fallback: bounded discovery if no manifest info
    if (!files.length) {
      const exts = ["webp", "jpg", "jpeg", "png"];
      const pats = [
        (i, ext) => `img-${i}.${ext}`,
        (i, ext) => `photo-${i}.${ext}`,
        (i, ext) => `impression-${i}.${ext}`,
        (i, ext) => `${i}.${ext}`,
      ];
      const MAX = 200;
      const MISS_LIMIT = 30;

      const tryRoot = async (root) => {
        const b = `${root}/${encodeURIComponent(g)}/`;
        const out = [];
        let miss = 0, seenAny = false;
        for (let i = 1; i <= MAX; i++) {
          let url = null;
          for (const ext of exts) {
            for (const pat of pats) {
              // eslint-disable-next-line no-await-in-loop
              const ok = await probeExistsLocal(b + pat(i, ext));
              if (ok) { url = b + pat(i, ext); break; }
            }
            if (url) break;
          }
          if (url) { out.push(url); seenAny = true; miss = 0; }
          else { miss += 1; if (miss >= MISS_LIMIT && seenAny) break; }
          if (out.length >= 120) break;
        }
        return out;
      };

      for (const r of roots) {
        // eslint-disable-next-line no-await-in-loop
        const arr = await tryRoot(r);
        if (arr.length) { files = arr; break; }
      }
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
