// Reveal-on-scroll for cards
const io = new IntersectionObserver((entries) => {
  for (const e of entries)
    if (e.isIntersecting) {
      e.target.classList.add('reveal');
      io.unobserve(e.target);
    }
}, { threshold: .12 });

document.querySelectorAll('.card').forEach(el => io.observe(el));

// Auto year
document.getElementById('year').textContent =
  new Date().getFullYear().toString();
