(() => {
  "use strict";

  const eventButton = document.querySelector("[data-event-inquiry]");
  const form = document.querySelector("#contact-form");
  const topic = document.querySelector("#topic");
  const subject = document.querySelector("#contact-subject");
  const message = document.querySelector("#message");

  if (eventButton && form && topic && subject && message) {
    eventButton.addEventListener("click", () => {
      topic.value = "Supperclub 16.01.2027";
      subject.value = "Supperclub 16.01.2027 – Platzanfrage";

      if (!message.value.trim()) {
        message.value = [
          "Hallo Sabine,",
          "",
          "ich interessiere mich für das Supperclub Dinner am 16.01.2027.",
          "Personenzahl: ",
          "",
          "Liebe Grüße"
        ].join("\n");
      }

      window.setTimeout(() => {
        form.scrollIntoView({ behavior: "smooth", block: "center" });
        const name = document.querySelector("#name");
        if (name) name.focus({ preventScroll: true });
      }, 80);
    });
  }

  const posterLink = document.querySelector("[data-poster-open]");
  const dialog = document.querySelector("#poster-dialog");
  const closeButton = document.querySelector("[data-poster-close]");

  if (posterLink && dialog && typeof dialog.showModal === "function") {
    posterLink.addEventListener("click", (event) => {
      event.preventDefault();
      dialog.showModal();
    });

    closeButton?.addEventListener("click", () => dialog.close());

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }
})();
