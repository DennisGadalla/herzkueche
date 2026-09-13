(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const GALLERY_BATCH_SIZE = 12;
  const GALLERY_MANIFEST_URL = "assets/img/galeries/galleries.json";

  function setFooterYear() {
    $$("#year").forEach((node) => { node.textContent = String(new Date().getFullYear()); });
  }

  function prefersReducedMotion() {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  function scrollTargetIntoView(target, { focus = null, hash = "" } = {}) {
    if (!target) return;
    const headerHeight = $("header")?.getBoundingClientRect().height || 0;
    const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - headerHeight - 16);
    if (hash && window.location.hash !== hash) window.history.replaceState(null, "", hash);
    window.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    if (focus) window.setTimeout(() => focus.focus({ preventScroll: true }), prefersReducedMotion() ? 0 : 420);
  }

  function findOption(select, value) {
    if (!select || !value) return null;
    return Array.from(select.options || []).find((option) => option.value === value) || null;
  }

  function addMeta(attributes) {
    const selector = Object.entries(attributes).filter(([key]) => key !== "content").map(([key, value]) => `[${key}="${CSS.escape(value)}"]`).join("");
    let node = document.head.querySelector(`meta${selector}`);
    if (!node) {
      node = document.createElement("meta");
      Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
      document.head.appendChild(node);
    } else if (attributes.content) {
      node.setAttribute("content", attributes.content);
    }
    return node;
  }

  function enhanceMetadata() {
    if (!$("#main")) return;
    document.title = "Sabines Herzküche | Privatköchin, Buffets & Kochkurse in Recklinghausen";
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = "https://www.sabines-herzkueche.de/";
    addMeta({ property: "og:type", content: "website" });
    addMeta({ property: "og:locale", content: "de_DE" });
    addMeta({ property: "og:title", content: "Sabines Herzküche | Kochen mit Herz und Charakter" });
    addMeta({ property: "og:description", content: "Private Cooking, Buffets, Kochkurse und Supperclubs von Sabine Gadalla in und um Recklinghausen." });
    addMeta({ property: "og:url", content: "https://www.sabines-herzkueche.de/" });
    addMeta({ property: "og:image", content: "https://www.sabines-herzkueche.de/assets/img/person/sabine-3.jpg" });
    addMeta({ name: "twitter:card", content: "summary_large_image" });

    if (!document.head.querySelector('script[data-site-schema]')) {
      const schema = document.createElement("script");
      schema.type = "application/ld+json";
      schema.dataset.siteSchema = "1";
      schema.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Person",
            "@id": "https://www.sabines-herzkueche.de/#sabine-gadalla",
            name: "Sabine Gadalla",
            url: "https://www.sabines-herzkueche.de/",
            image: "https://www.sabines-herzkueche.de/assets/img/person/sabine-3.jpg",
            jobTitle: "Privatköchin und Kursleiterin",
            sameAs: ["https://www.instagram.com/sabinethetasteallstars/", "https://www.youtube.com/@sabinegadalla9102"],
          },
          {
            "@type": "Event",
            "@id": "https://www.sabines-herzkueche.de/#supperclub-2027-01-16",
            name: "Supperclub Dinner – Sabines Herzküche",
            startDate: "2027-01-16T18:00:00+01:00",
            endDate: "2027-01-16T23:00:00+01:00",
            eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
            eventStatus: "https://schema.org/EventScheduled",
            image: "https://www.sabines-herzkueche.de/assets/img/events/supperclub-2027-01-16.avif",
            organizer: { "@id": "https://www.sabines-herzkueche.de/#sabine-gadalla" },
            offers: { "@type": "Offer", price: "109", priceCurrency: "EUR", url: "https://www.sabines-herzkueche.de/#kontakt" },
          },
        ],
      });
      document.head.appendChild(schema);
    }
  }

  function enhanceSkipLink() {
    if (!$("#main") || $(".skip-link")) return;
    const link = document.createElement("a");
    link.className = "skip-link";
    link.href = "#main";
    link.textContent = "Zum Inhalt springen";
    document.body.prepend(link);
  }

  function enhanceHero() {
    const content = $(".hero-content");
    const social = $(".hero-social");
    if (!content || !social || $(".hero-actions", content)) return;
    const actions = document.createElement("div");
    actions.className = "hero-actions";
    actions.setAttribute("aria-label", "Schnellzugriff");
    actions.innerHTML = '<a class="btn" href="#angebot">Angebot ansehen</a><a class="btn primary" href="#kontakt">Unverbindlich anfragen</a>';
    content.insertBefore(actions, social);
  }

  function enhanceImpressions() {
    const track = $("#impressions-track");
    if (!track) return;
    const unique = [];
    const seen = new Set();
    $$("img[data-impression]", track).forEach((image) => {
      const src = image.getAttribute("src");
      if (seen.has(src)) {
        image.remove();
        return;
      }
      seen.add(src);
      unique.push(image);
    });
    unique.forEach((image, index) => {
      if (image.closest("[data-impression-open]")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.impressionOpen = "1";
      button.setAttribute("aria-label", `Kulinarischen Eindruck ${index + 1} groß anzeigen`);
      image.replaceWith(button);
      button.appendChild(image);
    });
  }

  function enhanceOffer() {
    const card = $("#angebot .card");
    if (!card || $(".service-grid", card)) return;
    const title = $("#angebot-title", card);
    if (title) title.textContent = "So kommt meine Herzküche zu dir";
    const intro = card.querySelector("p");
    if (intro) {
      intro.className = "section-lead";
      intro.textContent = "Ob zuhause, beim gemeinsamen Kochen oder für eine größere Runde: Wir finden die Form, die zu deinem Anlass passt.";
    }
    card.querySelector("ul")?.remove();
    const paragraphs = $$(':scope > p', card);
    paragraphs.slice(1).forEach((node) => node.remove());
    card.querySelector(':scope > a.btn')?.remove();

    const grid = document.createElement("div");
    grid.className = "service-grid";
    const services = [
      ["Private Cooking", "Private Cooking", "Ein persönlicher Genussabend bei dir zuhause – entspannt, individuell und ohne Küchenstress.", "assets/img/galeries/thumbs/Dining/img-33.webp"],
      ["Kochkurse", "Kochkurs", "Gemeinsam kochen, Neues lernen und genießen – von international bis deutsch.", "assets/img/galeries/thumbs/Herzkueche/img-7.webp"],
      ["Buffets", "Buffet", "Warm oder kalt, klassisch oder ausgefallen – passend zu Gästen, Anlass und Geschmack.", "assets/img/galeries/thumbs/Buffets/img-1.webp"],
      ["Supperclubs", "Supperclub 16.01.2027", "Ein gemeinsamer Abend in kleiner Runde – kreative Gerichte, Gespräche und entspannte Atmosphäre.", "assets/img/events/supperclub-2027-01-16.avif"],
    ];
    services.forEach(([label, topic, description, imageSrc]) => {
      const article = document.createElement("article");
      article.className = "service-card";
      article.dataset.serviceCard = "1";
      article.innerHTML = `<img src="${imageSrc}" alt="${label} von Sabines Herzküche" width="720" height="540" loading="lazy" decoding="async" /><div class="service-card-body"><h3>${label}</h3><p>${description}</p><a class="btn service-cta" href="#kontakt" data-service-cta data-service-topic="${topic}">${label} anfragen</a></div>`;
      grid.appendChild(article);
    });
    card.appendChild(grid);
  }

  function enhanceContactForm() {
    const form = $("#contact-form");
    const message = $("#message");
    if (!form || !message) return;
    if (!$("#date", form)) {
      const context = document.createElement("div");
      context.className = "contact-context-grid";
      context.innerHTML = '<label for="date">Gewünschtes Datum <span class="optional">(optional)</span><input id="date" type="date" name="datum" /></label><label for="location">Ort <span class="optional">(optional)</span><input id="location" type="text" name="ort" autocomplete="address-level2" /></label><label for="party">Personenzahl <span class="optional">(optional)</span><input id="party" type="number" name="personenzahl" min="1" max="300" inputmode="numeric" /></label>';
      message.closest("label")?.before(context);
    }
    if (!$('input[name="botcheck"]', form)) {
      const bot = document.createElement("div");
      bot.className = "botcheck";
      bot.setAttribute("aria-hidden", "true");
      bot.innerHTML = '<label>Bitte nicht ausfüllen<input type="checkbox" name="botcheck" tabindex="-1" autocomplete="off" /></label>';
      form.prepend(bot);
    }
    if (!$(".form-privacy", form)) {
      const privacy = document.createElement("p");
      privacy.className = "form-privacy";
      privacy.innerHTML = 'Mit dem Absenden werden deine Angaben zur Bearbeitung der Anfrage an Web3Forms übermittelt. Details findest du in der <a href="datenschutz.html">Datenschutzerklärung</a>.';
      form.querySelector('button[type="submit"]')?.before(privacy);
    }
  }

  function enhanceFooter() {
    const footer = $("footer .container");
    if (!footer || $('a[href="datenschutz.html"]', footer)) return;
    footer.append(" · ");
    const link = document.createElement("a");
    link.className = "footer-link";
    link.href = "datenschutz.html";
    link.textContent = "Datenschutz";
    footer.appendChild(link);
  }

  function enhanceCalendarAction() {
    $$('[data-event-card]').forEach((card) => {
      if ($("[data-event-calendar]", card)) return;
      const inquiry = $("[data-event-inquiry]", card);
      if (!inquiry) return;
      let actions = inquiry.parentElement;
      if (!actions.classList.contains("event-actions")) {
        actions = document.createElement("div");
        actions.className = "event-actions";
        inquiry.replaceWith(actions);
        actions.appendChild(inquiry);
      }
      const calendar = document.createElement("a");
      calendar.className = "btn";
      calendar.href = "assets/events/supperclub-2027-01-16.ics";
      calendar.setAttribute("download", "");
      calendar.dataset.eventCalendar = "1";
      calendar.textContent = "Zum Kalender hinzufügen";
      actions.appendChild(calendar);
    });
  }

  function setInquiryTopic(topicValue, subjectValue = "") {
    const topic = $("#topic");
    const subject = $("#contact-subject");
    if (topic && findOption(topic, topicValue)) topic.value = topicValue;
    if (subject) subject.value = subjectValue || `${topicValue} – Anfrage über Sabines Herzküche`;
  }

  function initContactJumps() {
    $$('.links a[href="#kontakt"], .hero-actions a[href="#kontakt"], [data-sticky-contact]').forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        scrollTargetIntoView($("#kontakt"), { hash: "#kontakt" });
      });
    });
  }

  function initServiceInquiries() {
    const form = $("#contact-form");
    const name = $("#name");
    if (!form) return;
    $$('[data-service-cta]').forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const topicValue = button.getAttribute("data-service-topic") || "Allgemeine Anfrage";
        setInquiryTopic(topicValue);
        scrollTargetIntoView(form, { focus: name, hash: "#kontakt" });
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

  function initEventLifecycle() {
    const cards = $$('[data-event-card]');
    if (!cards.length) return;
    const currentSection = $("#supperclub");
    const currentContainer = $("[data-current-events]") || currentSection?.querySelector(".container");
    const pastSection = $("#vergangene-veranstaltungen");
    const pastList = $("#past-events-list");
    const navLink = $("[data-event-nav]");
    const topic = $("#topic");
    const active = [];
    const past = [];

    cards.forEach((card) => {
      const state = getEventState(card.getAttribute("data-event-start"), card.getAttribute("data-event-end"));
      const tag = $("[data-event-status]", card);
      card.dataset.eventState = state;
      if (state === "live") {
        if (tag) tag.textContent = "Heute";
        active.push(card);
      } else if (state === "upcoming") {
        active.push(card);
      } else if (state === "past") {
        card.classList.add("event-card--past");
        if (tag) tag.textContent = "Vergangen";
        $$('[data-event-inquiry], [data-event-calendar]', card).forEach((cta) => cta.remove());
        const option = findOption(topic, card.getAttribute("data-event-topic"));
        option?.remove();
        past.push(card);
      }
    });

    active.sort((a, b) => Date.parse(a.getAttribute("data-event-start")) - Date.parse(b.getAttribute("data-event-start")));
    active.forEach((card) => currentContainer?.appendChild(card));
    past.sort((a, b) => Date.parse(b.getAttribute("data-event-start")) - Date.parse(a.getAttribute("data-event-start")));
    past.forEach((card) => pastList?.appendChild(card));
    if (pastSection) pastSection.hidden = past.length === 0;
    if (currentSection) currentSection.hidden = active.length === 0;
    if (navLink && active.length === 0 && past.length > 0) {
      navLink.href = "#vergangene-veranstaltungen";
      navLink.textContent = "Veranstaltungen";
    }
  }

  function initEventInquiry() {
    const form = $("#contact-form");
    const message = $("#message");
    const name = $("#name");
    if (!form || !message) return;
    $$('[data-event-inquiry]').forEach((eventButton) => {
      const card = eventButton.closest("[data-event-card]");
      if (!card) return;
      const topicValue = card.getAttribute("data-event-topic") || "Supperclub";
      const dateLabel = card.getAttribute("data-event-date-label") || "";
      eventButton.addEventListener("click", (event) => {
        event.preventDefault();
        setInquiryTopic(topicValue, `${topicValue} – Platzanfrage`);
        if (!message.value.trim()) {
          message.value = ["Hallo Sabine,", "", `ich interessiere mich für das Supperclub Dinner${dateLabel ? ` am ${dateLabel}` : ""} und möchte gerne Plätze anfragen.`, "", "Personenzahl: ", "", "Liebe Grüße"].join("\n");
        }
        scrollTargetIntoView(form, { focus: name, hash: "#kontakt" });
      });
    });
  }

  function initContactSubject() {
    const topic = $("#topic");
    const subject = $("#contact-subject");
    if (!topic || !subject) return;
    topic.addEventListener("change", () => { subject.value = `${topic.value} – Anfrage über Sabines Herzküche`; });
  }

  function initPosterDialog() {
    const dialog = $("#poster-dialog");
    const dialogPoster = $("#poster-dialog img");
    const closeButton = $("[data-poster-close]");
    if (!dialog || typeof dialog.showModal !== "function") return;
    $$('[data-poster-open]').forEach((posterLink) => {
      posterLink.addEventListener("click", (event) => {
        event.preventDefault();
        const poster = $("img", posterLink);
        if (dialogPoster && poster) { dialogPoster.src = poster.currentSrc || poster.src; dialogPoster.alt = poster.alt; }
        dialog.showModal();
      });
    });
    closeButton?.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  }

  let lightbox = null;
  let lightboxImage = null;
  let lightboxTitle = null;
  let lastLightboxTrigger = null;

  function ensureLightbox() {
    if (lightbox) return lightbox;
    lightbox = document.createElement("dialog");
    lightbox.className = "lightbox-dialog";
    lightbox.setAttribute("aria-labelledby", "lightbox-title");
    lightbox.innerHTML = '<div class="lightbox-dialog-inner"><div class="lightbox-dialog-head"><strong id="lightbox-title">Bildansicht</strong><button type="button" class="lightbox-dialog-close" aria-label="Bildansicht schließen">×</button></div><img alt="" /></div>';
    document.body.appendChild(lightbox);
    lightboxImage = $("img", lightbox);
    lightboxTitle = $("#lightbox-title", lightbox);
    $(".lightbox-dialog-close", lightbox)?.addEventListener("click", () => lightbox.close());
    lightbox.addEventListener("click", (event) => { if (event.target === lightbox) lightbox.close(); });
    lightbox.addEventListener("close", () => {
      if (lightboxImage) lightboxImage.src = "";
      lastLightboxTrigger?.focus({ preventScroll: true });
      lastLightboxTrigger = null;
    });
    return lightbox;
  }

  function openLightbox(image, trigger = null) {
    if (!(image instanceof HTMLImageElement)) return;
    const dialog = ensureLightbox();
    if (!lightboxImage || typeof dialog.showModal !== "function") return;
    lastLightboxTrigger = trigger instanceof HTMLElement ? trigger : document.activeElement;
    lightboxImage.src = image.dataset.fullSrc || image.currentSrc || image.src;
    lightboxImage.alt = image.alt || "Bildansicht";
    if (lightboxTitle) lightboxTitle.textContent = image.alt || "Bildansicht";
    dialog.showModal();
  }

  function initStaticImageLightboxes() {
    $("#impressions-track")?.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-impression-open]");
      const image = trigger?.querySelector("img[data-impression]");
      if (image) openLightbox(image, trigger);
    });
  }

  function validRanges(ranges) {
    return Array.isArray(ranges) && ranges.length > 0 && ranges.every((range) => Array.isArray(range) && range.length === 2 && Number.isInteger(range[0]) && Number.isInteger(range[1]) && range[0] > 0 && range[1] >= range[0]);
  }

  function expandGalleryIndexes(gallery) {
    return gallery.ranges.flatMap(([start, end]) => Array.from({ length: end - start + 1 }, (_, offset) => start + offset));
  }

  async function loadGalleryManifest() {
    const response = await fetch(GALLERY_MANIFEST_URL, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Galerie-Manifest konnte nicht geladen werden (${response.status})`);
    const data = await response.json();
    if (!data || !Array.isArray(data.galleries)) throw new Error("Ungültiges Galerie-Manifest");
    return data.galleries.filter((gallery) => gallery && typeof gallery.id === "string" && typeof gallery.title === "string" && typeof gallery.pattern === "string" && gallery.pattern.includes("{}") && typeof gallery.thumbnailPattern === "string" && gallery.thumbnailPattern.includes("{}") && validRanges(gallery.ranges));
  }

  async function initGalleryLinks() {
    const wrap = $("#gallery-links");
    if (!wrap) return;
    try {
      const galleries = await loadGalleryManifest();
      wrap.replaceChildren();
      galleries.forEach((gallery) => {
        const cover = Number.isInteger(gallery.cover) ? gallery.cover : expandGalleryIndexes(gallery)[0];
        const link = document.createElement("a");
        link.className = "gallery-card";
        link.dataset.galleryId = gallery.id;
        link.href = `galerie.html?g=${encodeURIComponent(gallery.id)}`;
        link.innerHTML = `<img src="assets/img/galeries/thumbs/${encodeURIComponent(gallery.id)}/${gallery.thumbnailPattern.replace("{}", String(cover))}" alt="Vorschau der ${gallery.title}-Galerie" width="720" height="540" loading="lazy" decoding="async" /><span><strong>${gallery.title}</strong><small>${gallery.description || "Galerie ansehen"}</small></span>`;
        wrap.appendChild(link);
      });
    } catch (error) {
      console.warn("Galerie-Manifest nicht verfügbar.", error);
    }
  }

  async function initGalleryPage() {
    const grid = $("#galerie-grid");
    const title = $("#galerie-title");
    const description = $("#galerie-desc");
    const moreWrap = $("#gallery-more-wrap");
    const moreButton = $("#gallery-more");
    if (!grid || !title || !description) return;
    const params = new URLSearchParams(location.search);
    const galleryId = params.get("g");
    if (params.has("t")) {
      params.delete("t");
      const query = params.toString();
      history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
    }
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
      const images = indexes.map((number) => ({ full: `assets/img/galeries/${encodeURIComponent(gallery.id)}/${gallery.pattern.replace("{}", String(number))}`, thumbnail: `assets/img/galeries/thumbs/${encodeURIComponent(gallery.id)}/${gallery.thumbnailPattern.replace("{}", String(number))}` }));
      grid.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        const image = button?.querySelector("img");
        if (image) openLightbox(image, button);
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
        if (moreButton) moreButton.textContent = rendered >= images.length ? "Alle Bilder geladen" : `Mehr Bilder laden (${images.length - rendered} übrig)`;
      };
      moreButton?.addEventListener("click", renderNextBatch);
      renderNextBatch();
    } catch (error) {
      console.warn(error);
      title.textContent = "Galerie";
      description.textContent = "Diese Galerie konnte nicht geladen werden.";
      moreWrap?.setAttribute("hidden", "");
    }
  }

  function initStickyContact() {
    const hero = $(".hero-wrap");
    const contact = $("#kontakt");
    if (!hero || !contact || $("[data-sticky-contact]")) return;
    const sticky = document.createElement("a");
    sticky.className = "sticky-contact btn primary";
    sticky.href = "#kontakt";
    sticky.dataset.stickyContact = "1";
    sticky.hidden = true;
    sticky.textContent = "Unverbindlich anfragen";
    document.body.appendChild(sticky);
    sticky.addEventListener("click", (event) => { event.preventDefault(); scrollTargetIntoView(contact, { hash: "#kontakt" }); });
    let queued = false;
    const update = () => {
      queued = false;
      const mobile = window.innerWidth <= 620;
      const headerHeight = $("header")?.getBoundingClientRect().height || 0;
      const heroPassed = hero.getBoundingClientRect().bottom <= headerHeight;
      const rect = contact.getBoundingClientRect();
      const contactNear = rect.top < window.innerHeight * .8 && rect.bottom > headerHeight;
      sticky.hidden = !(mobile && heroPassed && !contactNear);
    };
    const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    update();
  }

  enhanceMetadata();
  enhanceSkipLink();
  enhanceHero();
  enhanceImpressions();
  enhanceOffer();
  enhanceContactForm();
  enhanceFooter();
  enhanceCalendarAction();
  setFooterYear();
  initEventLifecycle();
  initEventInquiry();
  initContactJumps();
  initServiceInquiries();
  initContactSubject();
  initPosterDialog();
  initStaticImageLightboxes();
  initGalleryLinks();
  initGalleryPage();
  initStickyContact();
})();
