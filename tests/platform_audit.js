const assert = require("assert");
const { chromium } = require("playwright");

const BASE = process.env.SITE_URL || "http://127.0.0.1:4173";

async function open(page, route) {
  const response = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  assert.ok(response?.ok(), `${route}: failed to load`);
  await page.waitForTimeout(120);
}

async function auditHome(browser, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await open(page, "/index.html");

  assert.equal(await page.locator(".skip-link").count(), 1, "skip link missing");
  await page.keyboard.press("Tab");
  assert.equal(await page.locator(".skip-link").evaluate((node) => document.activeElement === node), true, "skip link must be first keyboard stop");

  assert.equal(await page.locator("[data-service-card]").count(), 4, "four service cards expected");
  assert.equal(await page.locator(".gallery-card").count(), 3, "three gallery entry cards expected");
  assert.equal(await page.locator("[data-impression-open]").count(), 3, "three static impression buttons expected");

  const firstImpression = page.locator("[data-impression-open]").first();
  await firstImpression.focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator(".lightbox-dialog").evaluate((dialog) => dialog.open), true, "keyboard should open impression lightbox");
  await page.locator(".lightbox-dialog-close").click();
  assert.equal(await firstImpression.evaluate((node) => document.activeElement === node), true, "lightbox close should return focus to trigger");

  for (const topic of ["Private Cooking", "Kochkurs", "Buffet", "Supperclub 16.01.2027"]) {
    await page.locator(`[data-service-cta][data-service-topic="${topic}"]`).click();
    assert.equal(await page.locator("#topic").inputValue(), topic, `service CTA should select ${topic}`);
  }

  for (const selector of ["#date", "#location", "#party"]) {
    assert.equal(await page.locator(selector).count(), 1, `${selector} missing`);
  }
  assert.equal(await page.locator('input[name="botcheck"]').count(), 1, "botcheck missing");
  assert.equal(await page.locator(".form-privacy a").getAttribute("href"), "datenschutz.html", "privacy notice must link to policy");
  assert.equal(await page.locator("[data-event-calendar]").getAttribute("download"), "", "calendar link should download");
  assert.ok((await page.locator("head link[rel=canonical]").getAttribute("href")).includes("sabines-herzkueche.de"));
  assert.equal(await page.locator('script[data-site-schema]').count(), 1, "structured data missing");

  if (viewport.width <= 620) {
    const sticky = page.locator("[data-sticky-contact]");
    assert.equal(await sticky.count(), 1, "mobile sticky CTA missing");
    assert.equal(await sticky.isVisible(), false, "sticky CTA should start hidden");
    await page.locator("#about").scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    assert.equal(await sticky.isVisible(), true, "sticky CTA should appear after hero");
    await page.locator("#kontakt").scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    assert.equal(await sticky.isVisible(), false, "sticky CTA should hide at contact section");
  }

  assert.deepEqual(errors, [], `home browser errors: ${errors.join(" | ")}`);
  await context.close();
}

async function auditNoJsBaseline(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const page = await context.newPage();
  await open(page, "/index.html");
  assert.equal(await page.locator("#angebot").isVisible(), true, "offer content must remain readable without JS");
  assert.equal(await page.locator("#kontakt").isVisible(), true, "contact section must remain available without JS");
  assert.equal(await page.locator("#contact-form").count(), 1, "contact form baseline missing");
  assert.equal(await page.locator('a[href="tel:+491723614800"]').count(), 1, "phone fallback missing");
  assert.equal(await page.locator('a[href^="mailto:"]').count() > 0, true, "email fallback missing");
  await context.close();
}

async function auditGalleryNetwork(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const requested = [];
  page.on("request", (request) => requested.push(new URL(request.url()).pathname));
  await open(page, "/galerie.html?g=Buffets&t=Legacy");
  await page.waitForFunction(() => document.querySelectorAll("#galerie-grid button").length === 12);
  assert.equal(new URL(page.url()).searchParams.has("t"), false, "legacy gallery title query should be removed");

  const originalsBefore = requested.filter((pathname) => /\/assets\/img\/galeries\/Buffets\/img-\d+\.jpg$/.test(pathname));
  assert.equal(originalsBefore.length, 0, "gallery originals must not load before lightbox interaction");
  assert.ok(requested.some((pathname) => pathname.includes("/assets/img/galeries/thumbs/Buffets/")), "thumbnail requests expected");

  const fullRequest = page.waitForRequest((request) => /\/assets\/img\/galeries\/Buffets\/img-1\.jpg$/.test(new URL(request.url()).pathname));
  const first = page.locator("#galerie-grid button").first();
  await first.focus();
  await first.click();
  await fullRequest;
  await page.locator(".lightbox-dialog-close").click();
  assert.equal(await first.evaluate((node) => document.activeElement === node), true, "gallery lightbox should restore focus");
  await context.close();
}

async function auditUnknownGallery(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await open(page, "/galerie.html?g=DoesNotExist");
  assert.equal(await page.locator("#galerie-title").textContent(), "Galerie");
  assert.match(await page.locator("#galerie-desc").textContent(), /konnte nicht geladen/);
  assert.equal(await page.locator("#gallery-more-wrap").isVisible(), false);
  await context.close();
}

async function auditLegalRoutes(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await open(page, "/datenschutz.html");
  assert.equal(await page.locator("h1").textContent(), "Datenschutzerklärung");
  assert.equal(await page.locator('a[href="index.html#kontakt"]').count(), 1);
  assert.equal(await page.locator('a[href="datenschutz.html"]').count() > 0, true);
  await open(page, "/impressum.html");
  assert.equal(await page.locator("h1").textContent(), "Impressum");
  assert.match(await page.locator(".legal-intro").textContent(), /§ 5 DDG/);
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await auditHome(browser, { width: 1440, height: 1000 });
    await auditHome(browser, { width: 390, height: 844 });
    await auditNoJsBaseline(browser);
    await auditGalleryNetwork(browser);
    await auditUnknownGallery(browser);
    await auditLegalRoutes(browser);
  } finally {
    await browser.close();
  }
  console.log("Platform audit PASS: accessibility, funnel, no-JS baseline, gallery network and legal routes checked");
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
