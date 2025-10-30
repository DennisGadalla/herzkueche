// ================= Reveal cards =================
const io = new IntersectionObserver((entries) => {
  for (const e of entries)
    if (e.isIntersecting) {
      e.target.classList.add("reveal");
      io.unobserve(e.target);
    }
}, { threshold: 0.12 });
document.querySelectorAll(".card").forEach((el) => io.observe(el));

// ================= Auto year =================
document.getElementById("year").textContent =
  new Date().getFullYear().toString();

// ================= Scrolling Impressions Banner =================
document.addEventListener("DOMContentLoaded", () => {
  const track = document.getElementById("impressions-track");
  if (!track) return;

  const base = "assets/img/impressions/";
  const maxImages = 100;
  const extensions = ["jpg", "jpeg", "png", "webp"];

  const loadPromises = [];
  for (let i = 1; i <= maxImages; i++) {
    for (const ext of extensions) {
      const img = new Image();
      const src = `${base}impression-${i}.${ext}`;
      img.src = src;
      const promise = new Promise((resolve) => {
        img.onload = () => resolve(src);
        img.onerror = () => resolve(null);
      });
      loadPromises.push(promise);
    }
  }

  Promise.all(loadPromises).then((results) => {
    const valid = [...new Set(results.filter((r) => r !== null))];
    if (!valid.length) return;

    const allImages = [...valid, ...valid]; // Duplicate for seamless scroll
    allImages.forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      track.appendChild(img);
    });

    // const observer = new ResizeObserver(() => {
    //   const totalWidth = track.scrollWidth / 2;
    //   const duration = Math.max(40, totalWidth / 100); // slower = larger
    //   track.style.animationDuration = `${duration}s`;
    // });
    // observer.observe(track);
  });
});
