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

  /* =============== Self-closing popup tab for images =============== */
  function openImagePopupTab(src) {
    const w = window.open("", "_blank");
    if (!w) {
      // Fallback if blocked
      const a = document.createElement("a");
      a.href = src;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    // Minimal themed viewer that closes on click/Escape
    const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bild</title>
  <style>
    :root{
      --bg:#121015; --text:#f4efe9; --muted:#c6bfb6;
      --accent:#ff7043; --border:#dfa79a; --radius:12px;
      --shadow:0 10px 40px rgba(0,0,0,.35);
    }
    @media (prefers-color-scheme: light){
      :root{
        --bg:#ffffff; --text:#211b17; --muted:#6b5c55;
        --accent:#f16832; --border:#dfa79a;
      }
    }
    html,body{height:100%}
    body{
      margin:0; background:var(--bg); color:var(--text);
      display:grid; place-items:center;
      font:16px/1.5 system-ui,Segoe UI,Roboto,sans-serif;
    }
    .wrap{position:fixed; inset:0; display:grid; place-items:center;}
    img{
      max-width:min(96vw,1400px);
      max-height:96vh;
      border-radius:12px;
      box-shadow:0 20px 60px rgba(0,0,0,.5);
      cursor:zoom-out; user-select:none;
    }
    /* === match Kontakt button (.btn) style === */
    .back{
      position:fixed; top:12px; right:12px;
      padding:9px 14px; border-radius:12px;
      border:0 solid var(--border);
      background:var(--border); color:var(--text);
      font-weight:600; cursor:pointer;
      box-shadow:var(--shadow);
      transition:transform .06s ease, opacity .2s ease;
    }
    .back:hover{ transform:translateY(-1px); opacity:.95; }
    .hint{
      position:fixed; bottom:12px; right:12px;
      color:var(--muted); font-size:12px; opacity:.85;
    }
    @media (prefers-reduced-motion: reduce){
      .back{ transition:none; }
    }
  </style>
</head>
<body>
  <div class="wrap" id="backdrop" role="button" aria-label="Fenster schließen">
    <img src="\${src}" alt="Impression" id="img">
    <button class="back" id="closeBtn" aria-label="Zurück">Zurück</button>
    <div class="hint">Klick aufs Bild oder ESC schließt</div>
  </div>
  <script>
    (function(){
      const closeNow = () => { try { window.close(); } catch(e) {} };
      document.getElementById('img').addEventListener('click', closeNow);
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
    w.document.write(html.replace("\\${src}", src));
    w.document.close();
  }

  /* =============== Header: show 0–300px, hide afterwards =============== */
  (() => {
    const header = document.querySelector("header");
    if (!header) return;

    const NAV_HIDE_AFTER_PX = 300;
    let raf = 0;
    let hidden = null;

    const update = () => {
      raf = 0;
      const y =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;

      const shouldHide = y > NAV_HIDE_AFTER_PX;
      if (hidden !== shouldHide) {
        header.classList.toggle("nav-hidden", shouldHide);
        hidden = shouldHide;
      }
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    document.addEventListener("DOMContentLoaded", update);
    update();
  })();
})();
