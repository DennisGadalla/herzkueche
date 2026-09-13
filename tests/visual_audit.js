const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.env.SITE_URL || "http://127.0.0.1:4173";
const OUT = path.join("artifacts", "visual");
fs.mkdirSync(OUT, { recursive: true });

const routes = [
  ["home", "/index.html"],
  ["gallery-buffets", "/galerie.html?g=Buffets&t=Buffets"],
  ["gallery-herzkueche", "/galerie.html?g=Herzkueche&t=Herzk%C3%BCche"],
  ["gallery-dining", "/galerie.html?g=Dining&t=Dining"],
  ["impressum", "/impressum.html"],
];

const viewports = [
  ["desktop", { width: 1440, height: 1000 }],
  ["tablet", { width: 820, height: 1000 }],
  ["mobile", { width: 390, height: 844 }],
];

const EXPECTED_EVENT_MESSAGE = [
  "Hallo Sabine,",
  "",
  "ich möchte gerne für das Supperclub Dinner am 16.01.2027 anfragen.",
  "",
  "Personenzahl: ",
  "Unverträglichkeiten / Wünsche (optional): ",
  "",
  "Liebe Grüße",
].join("\n");

async function activateWholePage(page) {
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const step = Math.max(260, Math.floor(innerHeight * 0.62));
    let max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    for (let y = 0; y <= max; y += step) {
      scrollTo(0, y);
      await wait(40);
      max = Math.max(max, document.documentElement.scrollHeight - innerHeight);
    }
    scrollTo(0, max);
    await wait(90);
    scrollTo(0, 0);
    await wait(90);
  });
}

async function settle(page) {
  await page.waitForTimeout(180);
  await activateWholePage(page);
  // Never let a browser decode promise hang the CI job. Each image gets a bounded wait.
  await page.evaluate(async () => {
    const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await Promise.all([...document.images].map(async (image) => {
      if (!image.decode) return;
      await Promise.race([image.decode().catch(() => undefined), timeout(900)]);
    }));
  });
  await page.waitForTimeout(100);
}

async function pageHealth(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const brokenImages = [...document.images]
      .filter((image) => visible(image) && image.complete && image.naturalWidth === 0)
      .map((image) => image.getAttribute("src"));
    const smallControls = [...document.querySelectorAll("button, .btn")]
      .filter(visible)
      .map((node) => ({ text: (node.textContent || "").trim(), height: node.getBoundingClientRect().height }))
      .filter((item) => item.height < 40);
    return {
      innerWidth,
      scrollWidth: root.scrollWidth,
      brokenImages,
      smallControls,
      height: root.scrollHeight,
    };
  });
}

async function stableGeometry(page) {
  const selectors = [
    "header .container", ".hero", "#about .card", "#angebot .card",
    "#supperclub .event-card", "#impressionen .card", "#kontakt .card",
  ];
  const sample = () => page.evaluate((items) => Object.fromEntries(items.map((selector) => {
    const node = document.querySelector(selector);
    if (!node || getComputedStyle(node).display === "none") return [selector, null];
    const rect = node.getBoundingClientRect();
    return [selector, { left: rect.left, top: rect.top + scrollY, width: rect.width, height: rect.height }];
  })), selectors);

  const first = await sample();
  await page.waitForTimeout(650);
  const second = await sample();
  for (const selector of selectors) {
    if (!first[selector] || !second[selector]) continue;
    for (const key of ["left", "top", "width", "height"]) {
      const delta = Math.abs(first[selector][key] - second[selector][key]);
      assert.ok(delta <= 1.5, `${selector}: ${key} drifted by ${delta.toFixed(2)}px after load`);
    }
  }
}

async function assertSectionAlignment(page, label) {
  const rows = await page.evaluate(() => [...document.querySelectorAll("main > section:not([hidden]) > .container")]
    .filter((node) => getComputedStyle(node).display !== "none")
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, width: rect.width };
    }));
  assert.ok(rows.length >= 5, `${label}: expected aligned main section containers`);
  const lefts = rows.map((row) => row.left);
  const widths = rows.map((row) => row.width);
  assert.ok(Math.max(...lefts) - Math.min(...lefts) <= 1.5, `${label}: section left edges drift`);
  assert.ok(Math.max(...widths) - Math.min(...widths) <= 1.5, `${label}: section widths drift`);
}

async function auditRoute(browser, routeName, route, viewportName, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  const failedRequests = [];

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));

  const response = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  assert.ok(response && response.ok(), `${routeName}/${viewportName}: HTTP load failed`);
  await settle(page);

  const health = await pageHealth(page);
  assert.ok(health.scrollWidth <= health.innerWidth + 1,
    `${routeName}/${viewportName}: horizontal overflow ${health.scrollWidth}px > ${health.innerWidth}px`);
  assert.deepEqual(health.brokenImages, [], `${routeName}/${viewportName}: broken visible images`);
  assert.deepEqual(health.smallControls, [], `${routeName}/${viewportName}: undersized controls`);
  assert.deepEqual(errors, [], `${routeName}/${viewportName}: browser errors: ${errors.join(" | ")}`);
  assert.deepEqual(failedRequests, [], `${routeName}/${viewportName}: failed requests: ${failedRequests.join(" | ")}`);
  await stableGeometry(page);

  if (routeName === "home") {
    await assertSectionAlignment(page, `home/${viewportName}`);
    const contactHeights = await page.evaluate(() =>
      [...document.querySelectorAll("#contact-form input:not([type=hidden]), #contact-form select")]
        .map((node) => node.getBoundingClientRect().height));
    assert.ok(contactHeights.length >= 4, "home: expected contact controls");
    assert.ok(contactHeights.every((height) => height >= 44), "home: contact controls must be at least 44px high");
    for (const selector of ["#about", "#angebot", "#supperclub", "#impressionen", "#kontakt"]) {
      assert.equal(await page.locator(selector).isVisible(), true, `home: ${selector} must render`);
    }

    const poster = await page.locator(".event-poster").evaluate((image) => ({
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }));
    assert.ok(poster.naturalWidth >= 1000 && poster.naturalHeight >= 1500,
      `home/${viewportName}: event poster source is too low resolution (${poster.naturalWidth}x${poster.naturalHeight})`);
    const posterBytes = await page.evaluate(async () => {
      const response = await fetch("assets/img/events/supperclub-2027-01-16.jpg", { cache: "no-store" });
      return (await response.arrayBuffer()).byteLength;
    });
    assert.ok(posterBytes >= 250000, `home/${viewportName}: event poster is over-compressed (${posterBytes} bytes)`);

    if (viewportName === "desktop") {
      const eventWidths = await page.evaluate(() =>
        [...document.querySelectorAll(".event-facts > div")].map((node) => node.getBoundingClientRect().width));
      assert.equal(eventWidths.length, 3, "home: three event fact cards expected");
      assert.ok(Math.max(...eventWidths) - Math.min(...eventWidths) < 2, "home: event fact cards must have equal widths");
    }
  }

  if (routeName.startsWith("gallery-")) {
    const count = await page.locator("#galerie-grid button").count();
    assert.equal(count, 12, `${routeName}: only the first 12 thumbnails should render initially`);
    assert.ok(await page.locator("#gallery-more-wrap").isVisible(), `${routeName}: load-more control should be visible`);
  }

  const screenshot = path.join(OUT, `${routeName}-${viewportName}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();
  return { routeName, viewportName, screenshot, health };
}

async function auditInquiryInteraction(browser, viewportName, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await settle(page);

  await page.locator("[data-event-inquiry]").click();
  await page.waitForTimeout(500);

  assert.equal(await page.locator("#topic").inputValue(), "Supperclub 16.01.2027", `${viewportName}: topic prefill`);
  assert.equal(await page.locator("#contact-subject").inputValue(), "Supperclub 16.01.2027 – Platzanfrage", `${viewportName}: subject prefill`);
  assert.equal(await page.locator("#message").inputValue(), EXPECTED_EVENT_MESSAGE, `${viewportName}: message prefill`);
  assert.equal(new URL(page.url()).hash, "#kontakt", `${viewportName}: inquiry CTA should set #kontakt`);

  const position = await page.evaluate(() => {
    const form = document.querySelector("#contact-form").getBoundingClientRect();
    const header = document.querySelector("header").getBoundingClientRect();
    return { formTop: form.top, headerBottom: header.bottom, viewportHeight: innerHeight, active: document.activeElement?.id || "" };
  });
  assert.ok(position.formTop >= position.headerBottom + 8,
    `${viewportName}: contact form is hidden under sticky header (${position.formTop} < ${position.headerBottom})`);
  assert.ok(position.formTop < Math.min(position.viewportHeight * 0.42, position.headerBottom + 140),
    `${viewportName}: inquiry jump did not land on the form (${position.formTop}px)`);
  assert.equal(position.active, "name", `${viewportName}: inquiry jump should focus the name field`);

  await page.locator("[data-poster-open]").click();
  assert.equal(await page.locator("#poster-dialog").evaluate((dialog) => dialog.open), true, `${viewportName}: poster dialog opens`);
  const dialogPoster = await page.locator("#poster-dialog img").evaluate((image) => ({ w: image.naturalWidth, h: image.naturalHeight }));
  assert.ok(dialogPoster.w >= 1000 && dialogPoster.h >= 1500, `${viewportName}: enlarged poster must stay sharp`);

  const screenshot = path.join(OUT, `home-inquiry-${viewportName}.png`);
  await page.locator("[data-poster-close]").click();
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();
  return { routeName: "home-inquiry", viewportName, screenshot };
}

async function auditExpiredEvent(browser) {
  // At the configured end instant the event is no longer bookable and belongs in the archive.
  const now = Date.parse("2027-01-16T23:00:00+01:00");
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.addInitScript((mockNow) => {
    const NativeDate = Date;
    class MockDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [mockNow])); }
      static now() { return mockNow; }
    }
    MockDate.parse = NativeDate.parse;
    MockDate.UTC = NativeDate.UTC;
    window.Date = MockDate;
  }, now);

  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await settle(page);
  assert.equal(await page.locator("#supperclub").isVisible(), false, "expired current-event section should be hidden");
  assert.equal(await page.locator("#vergangene-veranstaltungen").isVisible(), true, "past-events section should be visible");
  assert.equal(await page.locator("#past-events-list [data-event-card]").count(), 1, "expired event should move into archive");
  assert.equal(await page.locator("#past-events-list [data-event-inquiry]").count(), 0, "expired event must not keep booking CTA");
  assert.equal(await page.locator('#topic option[value="Supperclub 16.01.2027"]').count(), 0, "expired event must leave contact options");
  assert.equal(await page.locator("[data-event-nav]").getAttribute("href"), "#vergangene-veranstaltungen");

  const screenshot = path.join(OUT, "home-expired-event-desktop.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();
  return { routeName: "home-expired-event", viewportName: "desktop", screenshot };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = [];
  try {
    for (const [routeName, route] of routes) {
      for (const [viewportName, viewport] of viewports) {
        report.push(await auditRoute(browser, routeName, route, viewportName, viewport));
      }
    }
    report.push(await auditInquiryInteraction(browser, "desktop", viewports[0][1]));
    report.push(await auditInquiryInteraction(browser, "mobile", viewports[2][1]));
    report.push(await auditExpiredEvent(browser));
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Visual audit PASS: ${report.length} states checked, including layout stability and inquiry interactions`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
