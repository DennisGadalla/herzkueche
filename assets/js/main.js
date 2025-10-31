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

  /* =============== Impressions: simple CSS-animated bar =============== */
  document.addEventListener("DOMContentLoaded", async () => {
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

    // 1) Use any preset <img> from HTML if present
    let sources = Array.from(track.querySelectorAll("img"))
      .map((el) => el.getAttribute("src"))
      .filter(Boolean);

    // 2) Else discover by probing
    if (!sources.length) {
      const tasks = [];
      for (let i = 1; i <= maxImages; i++) tasks.push(findExisting(i));
      const results = await Promise.all(tasks);
      sources = results.filter(Boolean);
    }
    if (!sources.length) return;

    // Build track: one set + duplicate (for seamless -50% keyframe loop)
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

    // Adjust animation speed based on actual width
    const halfWidth = track.scrollWidth / 2;
    if (halfWidth > 0) {
      const pxPerSec = 90; // slower idle scroll
      const secs = Math.max(40, Math.round(halfWidth / pxPerSec));
      track.style.animationDuration = `${secs}s`;
    }

    // Click → open image in a self-closing popup tab
    track.addEventListener("click", (e) => {
      const img = e.target.closest("img");
      if (!img) return;
      openImagePopupTab(img.src);
    });
  });

  /* =============== Self-closing popup tab for images (Zurück + click-to-close) =============== */
  function openImagePopupTab(src) {
    const w = window.open("", "_blank");
    if (!w) {
      const a = document.createElement("a");
      a.href = src;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bild</title>
  <style>
    :root{ --bg:#121015; --text:#f4efe9; --muted:#c6bfb6; --accent:#ff7043; --border:#2e2730; }
    @media (prefers-color-scheme: light){
      :root{ --bg:#ffffff; --text:#211b17; --muted:#6b5c55; --accent:#f16832; }
    }
    html,body{height:100%}
    body{
      margin:0; background:var(--bg); color:var(--text);
      display:grid; place-items:center; font:16px/1.5 system-ui,Segoe UI,Roboto,sans-serif;
    }
    .wrap{position:fixed; inset:0; display:grid; place-items:center;}
    img{
      max-width:min(96vw,1400px);
      max-height:96vh;
      border-radius:12px;
      box-shadow:0 20px 60px rgba(0,0,0,.5);
      cursor:zoom-out; user-select:none;
    }

    /* === Match your site .btn (Kontakt) style === */
    .btn{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      padding:9px 14px;
      border-radius:12px;
      font-weight:600;
      cursor:pointer;
      border:0;
      background:var(--border);
      color:var(--text);
      transition:transform .06s ease, box-shadow .3s ease;
      -webkit-tap-highlight-color:transparent;
      box-shadow:0 10px 40px rgba(0,0,0,.35);
    }
    .btn:hover{ transform:translateY(-1px); box-shadow:0 10px 40px rgba(0,0,0,.5); }

    /* Positioning for the popup's back button */
    .back{
      position:fixed; top:12px; right:12px; z-index:2;
    }

    .hint{
      position:fixed; bottom:12px; right:12px;
      color:var(--muted); font-size:12px; opacity:.85;
    }
  </style>
</head>
<body>
  <div class="wrap" id="backdrop" role="button" aria-label="Fenster schließen">
    <img src="${src}" alt="Impression" id="viewer-img">
    <button class="btn back" id="closeBtn" aria-label="Zurück">Zurück</button>
    <div class="hint">Klick aufs Bild oder ESC schließt</div>
  </div>
  <script>
    (function(){
      const closeNow = () => { try { window.close(); } catch(e) {} };
      document.getElementById('viewer-img').addEventListener('click', closeNow);
      document.getElementById('closeBtn').addEventListener('click', closeNow);
      document.getElementById('backdrop').addEventListener('click', (e)=>{
        if(e.target && (e.target.id === 'backdrop')) closeNow();
      });
      document.addEventListener('keydown', (e)=>{
        if(e.key === 'Escape' || e.key === 'Esc') closeNow();
      }, {passive:true});
    }());
  </script>
</body>
</html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  /* =============== Header Scroll Effect (existing) =============== */
  const header = document.querySelector("header");
  if (header) {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (window.scrollY > 10) header.classList.add("scrolled");
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

/* =============== FORCE-UNSTICK after ~10% page depth (robust) =============== */
(() => {
  const header = document.querySelector("header");
  if (!header) return;

  const STYLE_ID = "unstick-enforcer-style";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      header[data-unstuck="false"] { position: sticky !important; top: 0 !important; }
      header[data-unstuck="true"]  { position: static !important; top: auto !important; }
    `;
    document.head.appendChild(style);
  }

  const FRACTION = 0.10; // 10%
  let thresholdPx = 0;
  let lastUnstuck = null;
  let raf = 0;

  function computeThreshold() {
    const doc = document.documentElement;
    const totalScrollable = Math.max(0, doc.scrollHeight - window.innerHeight);
    thresholdPx = Math.round(totalScrollable * FRACTION);
    if (!thresholdPx || thresholdPx < Math.round(window.innerHeight * 0.08)) {
      thresholdPx = Math.round(window.innerHeight * 0.10);
    }
  }

  function applyState() {
    const y = window.scrollY || 0;
    const unstuck = y >= thresholdPx;
    if (unstuck !== lastUnstuck) {
      header.setAttribute("data-unstuck", unstuck ? "true" : "false");
      lastUnstuck = unstuck;
    }
  }

  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      applyState();
      raf = 0;
    });
  }

  const recalc = () => {
    computeThreshold();
    applyState();
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  ["load", "resize", "orientationchange", "pageshow"].forEach((ev) =>
    window.addEventListener(ev, recalc, { passive: true })
  );

  const mo = new MutationObserver(() => recalc());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  setTimeout(recalc, 300);
  setTimeout(recalc, 1200);
  recalc();
})();
