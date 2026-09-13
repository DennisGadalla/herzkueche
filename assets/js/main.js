(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const GALLERY_BATCH_SIZE = 12;
  const GALLERY_MANIFEST_URL = "assets/img/galeries/galleries.json";
  const POSTER_HIRES_URL = "assets/img/events/supperclub-2027-01-16-hires.avif";
  let posterReadyPromise = Promise.resolve();

  function setFooterYear() {
    $$("#year").forEach((node) => {
      node.textContent = String(new Date().getFullYear());
    });
  }

  function prefersReducedMotion() {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  function scrollTargetIntoView(target, { focus = null, hash = "" } = {}) {
    if (!target) return;
    const headerHeight = $("header")?.getBoundingClientRect().height || 0;
    const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - headerHeight - 16);

    if (hash && window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }

    window.scrollTo({
      top,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });

    if (focus) {
      window.setTimeout(
        () => focus.focus({ preventScroll: true }),
        prefersReducedMotion() ? 0 : 420,
      );
    }
  }

  function initContactJumps() {
    $$('a[href="#kontakt"]:not([data-event-inquiry])').forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        scrollTargetIntoView($("#kontakt"), { hash: "#kontakt" });
      });
    });
  }

  function getEventState(startIso, endIso, now = Date.now()) {
    const start = Date.parse(startIso || "");
    const end = Date.parse(endIso || "");
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "invalid";
    if (now >= end) return "past";
    if (now >= start) return "live";
    return "upcoming";
  }

  function findOption(select, value) {
    if (!select || !value) return null;
    return Array.from(select.options || []).find((option) => option.value === value) || null;
  }

  function initEventLifecycle() {
    const card = $("[data-event-card]");
    if (!card) return;

    const state = getEventState(card.getAttribute("data-event-start"), card.getAttribute("data-event-end"));
    const currentSection = $("#supperclub");
    const pastSection = $("#vergangene-veranstaltungen");
    const pastList = $("#past-events-list");
    const navLink = $("[data-event-nav]");
    const tag = $("[data-event-status]", card);
    const cta = $("[data-event-inquiry]", card);
    const topicValue = card.getAttribute("data-event-topic");
    const topicOption = findOption($("#topic"), topicValue);

    card.dataset.eventState = state;
    if (state === "live") {
      if (tag) tag.textContent = "Heute";
      return;
    }
    if (state !== "past") return;

    card.classList.add("event-card--past");
    if (tag) tag.textContent = "Vergangen";
    cta?.remove();
    topicOption?.remove();

    if (pastList && pastSection) {
      pastList.appendChild(card);
      pastSection.hidden = false;
      if (currentSection) currentSection.hidden = true;
    }
    if (navLink) {
      navLink.href = "#vergangene-veranstaltungen";
      navLink.textContent = "Veranstaltungen";
    }
  }

  async function initHighResolutionPoster() {
    const poster = $(".event-poster");
    const posterLink = $("[data-poster-open]");
    const dialogPoster = $("#poster-dialog img");
    if (!poster || !posterLink) return;

    try {
      const dimensions = await new Promise((resolve, reject) => {
        const probe = new Image();
        probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
        probe.onerror = () => reject(new Error("High-resolution poster could not be decoded"));
        probe.src = POSTER_HIRES_URL;
      });
      if (dimensions.width < 1000 || dimensions.height < 1500) {
        throw new Error(`Poster source too small: ${dimensions.width}x${dimensions.height}`);
      }

      poster.src = POSTER_HIRES_URL;
      poster.dataset.fullSrc = POSTER_HIRES_URL;
      poster.dataset.posterQuality = "hires";
      posterLink.href = POSTER_HIRES_URL;
      if (dialogPoster) dialogPoster.src = POSTER_HIRES_URL;
    } catch (error) {
      console.error("High-resolution event poster unavailable", error);
    }
  }

  function initEventInquiry() {
    const eventButton = $("[data-event-inquiry]");
    const card = eventButton?.closest("[data-event-card]");
    const form = $("#contact-form");
    const topic = $("#topic");
    const subject = $("#contact-subject");
    const message = $("#message");
    const name = $("#name");
    if (!eventButton || !card || !form || !topic || !subject || !message) return;

    const topicValue = card.getAttribute("data-event-topic") || "Supperclub";
    const dateLabel = card.getAttribute("data-event-date-label") || "";

    eventButton.addEventListener("click", (event) => {
      event.preventDefault();
      if (findOption(topic, topicValue)) topic.value = topicValue;
      subject.value = `${topicValue} – Platzanfrage`;

      if (!message.value.trim()) {
        message.value = [
          "Hallo Sabine,",
          "",
          `ich interessiere mich für das Supperclub Dinner${dateLabel ? ` am ${dateLabel}` : ""} und möchte gerne Plätze anfragen.`,
          "",
          "Personenzahl: ",
          "",
          "Liebe Grüße",
        ].join("\n");
      }

      scrollTargetIntoView(form, { focus: name, hash: "#kontakt" });
    });
  }

  function initContactSubject() {
    const topic = $("#topic");
    const subject = $("#contact-subject");
    if (!topic || !subject) return;
    topic.addEventListener("change", () => {
      subject.value = `${topic.value} – Anfrage über Sabines Herzküche`;
    });
  }

  function initPosterDialog() {
    const posterLink = $("[data-poster-open]");
    const dialog = $("#poster-dialog");
    const closeButton = $("[data-poster-close]");
    if (!posterLink || !dialog || typeof dialog.showModal !== "function") return;

    posterLink.addEventListener("click", async (event) => {
      event.preventDefault();
      await posterReadyPromise;
      dialog.showModal();
    });
    closeButton?.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  let lightbox = null;
  let lightboxImage = null;
  let lightboxTitle = null;

  function ensureLightbox() {
    if (lightbox) return lightbox;
    lightbox = document.createElement("dialog");
    lightbox.className = "lightbox-dialog";
    lightbox.setAttribute("aria-labelledby", "lightbox-title");
    lightbox.innerHTML = `
      <div class="lightbox-dialog-inner">
        <div class="lightbox-dialog-head">
          <strong id="lightbox-title">Bildansicht</strong>
          <button type="button" class="lightbox-dialog-close" aria-label="Bildansicht schließen">×</button>
        </div>
        <img alt="" />
      </div>`;
    document.body.appendChild(lightbox);
    lightboxImage = $("img", lightbox);
    lightboxTitle = $("#lightbox-title", lightbox);
    $(".lightbox-dialog-close", lightbox)?.addEventListener("click", () => lightbox.close());
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) lightbox.close();
    });
    lightbox.addEventListener("close", () => {
      if (lightboxImage) lightboxImage.src = "";
    });
    return lightbox;
  }

  function openLightbox(image) {
    if (!(image instanceof HTMLImageElement)) return;
    const dialog = ensureLightbox();
    if (!lightboxImage || typeof dialog.showModal !== "function") return;
    lightboxImage.src = image.dataset.fullSrc || image.currentSrc || image.src;
    lightboxImage.alt = image.alt || "Bildansicht";
    if (lightboxTitle) lightboxTitle.textContent = image.alt || "Bildansicht";
    dialog.showModal();
  }

  function initStaticImageLightboxes() {
    $("#impressions-track")?.addEventListener("click", (event) => {
      const image = event.target.closest("img[data-impression]");
      if (image) openLightbox(image);
    });
  }

  function validRanges(ranges) {
    return Array.isArray(ranges) && ranges.length > 0 && ranges.every((range) =>
      Array.isArray(range) && range.length === 2 && Number.isInteger(range[0]) &&
      Number.isInteger(range[1]) && range[0] > 0 && range[1] >= range[0]
    );
  }

  function expandGalleryIndexes(gallery) {
    return gallery.ranges.flatMap(([start, end]) =>
      Array.from({ length: end - start + 1 }, (_, offset) => start + offset)
    );
  }

  async function loadGalleryManifest() {
    const response = await fetch(GALLERY_MANIFEST_URL, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Galerie-Manifest konnte nicht geladen werden (${response.status})`);
    const data = await response.json();
    if (!data || !Array.isArray(data.galleries)) throw new Error("Ungültiges Galerie-Manifest");
    return data.galleries.filter((gallery) =>
      gallery && typeof gallery.id === "string" && typeof gallery.title === "string" &&
      typeof gallery.pattern === "string" && gallery.pattern.includes("{}") &&
      typeof gallery.thumbnailPattern === "string" && gallery.thumbnailPattern.includes("{}") &&
      validRanges(gallery.ranges)
    );
  }

  async function initGalleryLinks() {
    const wrap = $("#gallery-links");
    if (!wrap) return;
    try {
      const galleries = await loadGalleryManifest();
      const fragment = document.createDocumentFragment();
      galleries.forEach((gallery) => {
        const link = document.createElement("a");
        link.className = "btn";
        link.href = `galerie.html?g=${encodeURIComponent(gallery.id)}&t=${encodeURIComponent(gallery.title)}`;
        link.textContent = gallery.title;
        fragment.appendChild(link);
      });
      wrap.replaceChildren(fragment);
    } catch (error) {
      console.error(error);
      wrap.innerHTML = '<p class="muted">Die Galerien konnten gerade nicht geladen werden.</p>';
    }
  }

  async function initGalleryPage() {
    const grid = $("#galerie-grid");
    const title = $("#galerie-title");
    const description = $("#galerie-desc");
    const moreWrap = $("#gallery-more-wrap");
    const moreButton = $("#gallery-more");
    if (!grid || !title || !description) return;

    const galleryId = new URLSearchParams(location.search).get("g");
    if (!galleryId) {
      title.textContent = "Galerie";
      description.textContent = "Bitte wähle auf der Startseite eine Galerie aus.";
      moreWrap?.setAttribute("hidden", "");
      return;
    }

    try {
      const galleries = await loadGalleryManifest();
      const gallery = galleries.find((entry) => entry.id === galleryId);
      if (!gallery) throw new Error("Unbekannte Galerie");

      const indexes = expandGalleryIndexes(gallery);
      title.textContent = gallery.title;
      description.textContent = `${indexes.length} Bilder · Weitere Bilder werden bei Bedarf nachgeladen.`;
      document.title = `${gallery.title} – Sabines Herzküche`;

      const images = indexes.map((number) => ({
        full: `assets/img/galeries/${encodeURIComponent(gallery.id)}/${gallery.pattern.replace("{}", String(number))}`,
        thumbnail: `assets/img/galeries/thumbs/${encodeURIComponent(gallery.id)}/${gallery.thumbnailPattern.replace("{}", String(number))}`,
      }));

      grid.addEventListener("click", (event) => {
        const image = event.target.closest("button")?.querySelector("img");
        if (image) openLightbox(image);
      });

      let rendered = 0;
      const renderNextBatch = () => {
        const end = Math.min(rendered + GALLERY_BATCH_SIZE, images.length);
        const fragment = document.createDocumentFragment();
        for (let index = rendered; index < end; index += 1) {
          const button = document.createElement("button");
          button.type = "button";
          button.setAttribute("aria-label", `${gallery.title}: Bild ${index + 1} groß anzeigen`);
          const image = document.createElement("img");
          image.src = images[index].thumbnail;
          image.dataset.fullSrc = images[index].full;
          image.alt = `${gallery.title} – Bild ${index + 1}`;
          image.loading = "lazy";
          image.decoding = "async";
          image.width = 720;
          image.height = 540;
          button.appendChild(image);
          fragment.appendChild(button);
        }
        grid.appendChild(fragment);
        rendered = end;
        if (moreWrap) moreWrap.hidden = rendered >= images.length;
        if (moreButton) {
          moreButton.textContent = rendered >= images.length
            ? "Alle Bilder geladen"
            : `Mehr Bilder laden (${images.length - rendered} übrig)`;
        }
      };

      moreButton?.addEventListener("click", renderNextBatch);
      renderNextBatch();
    } catch (error) {
      console.error(error);
      title.textContent = "Galerie";
      description.textContent = "Diese Galerie konnte nicht geladen werden.";
      moreWrap?.setAttribute("hidden", "");
    }
  }

  setFooterYear();
  initEventLifecycle();
  posterReadyPromise = initHighResolutionPoster();
  initEventInquiry();
  initContactJumps();
  initContactSubject();
  initPosterDialog();
  initStaticImageLightboxes();
  initGalleryLinks();
  initGalleryPage();
})();
