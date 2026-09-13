const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

function element(initial = {}) {
  const listeners = {};
  return {
    value: "",
    open: false,
    focused: false,
    scrolled: false,
    ...initial,
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
    dispatch(type, event = {}) {
      assert.ok(listeners[type], `missing listener for ${type}`);
      listeners[type](event);
    },
    scrollIntoView() {
      this.scrolled = true;
    },
    focus() {
      this.focused = true;
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    }
  };
}

const eventButton = element();
const form = element();
const topic = element();
const subject = element();
const message = element();
const name = element();
const posterLink = element();
const dialog = element();
const closeButton = element();

const map = new Map([
  ["[data-event-inquiry]", eventButton],
  ["#contact-form", form],
  ["#topic", topic],
  ["#contact-subject", subject],
  ["#message", message],
  ["#name", name],
  ["[data-poster-open]", posterLink],
  ["#poster-dialog", dialog],
  ["[data-poster-close]", closeButton],
]);

const document = {
  querySelector(selector) {
    return map.get(selector) || null;
  }
};

const context = {
  document,
  window: {
    setTimeout(fn) {
      fn();
      return 1;
    }
  },
  console
};

vm.createContext(context);
const source = fs.readFileSync("assets/js/site-polish.js", "utf8");
vm.runInContext(source, context);

// Supperclub CTA: progressive enhancement of the regular #kontakt anchor.
eventButton.dispatch("click");
assert.equal(topic.value, "Supperclub 16.01.2027");
assert.equal(subject.value, "Supperclub 16.01.2027 – Platzanfrage");
assert.ok(message.value.includes("Personenzahl:"));
assert.equal(form.scrolled, true);
assert.equal(name.focused, true);

// Existing message content must not be destroyed.
message.value = "Eigene Nachricht";
eventButton.dispatch("click");
assert.equal(message.value, "Eigene Nachricht");

// Poster dialog interactions.
let prevented = false;
posterLink.dispatch("click", { preventDefault() { prevented = true; } });
assert.equal(prevented, true);
assert.equal(dialog.open, true);

closeButton.dispatch("click");
assert.equal(dialog.open, false);

dialog.showModal();
dialog.dispatch("click", { target: dialog });
assert.equal(dialog.open, false);

console.log("site-polish browser behavior simulation: PASS");
