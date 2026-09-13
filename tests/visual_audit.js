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
  ["mobile", { width: 390, height: 844 }],
];

async function activateWholePage(page) {
  // Mimic a real visitor moving through the page. This deliberately activates
  // lazy images and content-visibility regions before screenshots are judged.
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const step = Math.max(280, Math.floor(innerHeight * 0.7));
    const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    for (let y = 0; y <= max; y += step) {
      scrollTo(0, y);
      await wait(45);
    }
    scrollTo(0, max);
    await wait(120);
    scrollTo(0, 0);
    await wait(120);
  });
}

async function settle(page) {
  await page.waitForTimeout(250);
  await activateWholePage(page);
  await page.evaluate(async () => {
    await Promise.all([...document.images].map((image) => image.decode?.().catch(() => undefined)));
  });
  await page.waitForTimeout(120);
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
  assert.ok(
    health.scrollWidth <= health.innerWidth + 1,
    `${routeName}/${viewportName}: horizontal overflow ${health.scrollWidth}px > ${health.innerWidth}px`
  );
  assert.deepEqual(health.brokenImages, [], `${routeName}/${viewportName}: broken visible images`);
  assert.deepEqual(health.smallControls, [], `${routeName}/${viewportName}: undersized controls`);
  assert.deepEqual(errors, [], `${routeName}/${viewportName}: browser errors: ${errors.join(" | ")}`);
  assert.deepEqual(failedRequests, [], `${routeName}/${viewportName}: failed requests: ${failedRequests.join(" | ")}`);

  if (routeName === "home") {
    const contactHeights = await page.evaluate(() =>
      [...document.querySelectorAll("#contact-form input:not([type=hidden]), #contact-form select")]
        .map((node) => node.getBoundingClientRect().height)
    );
    assert.ok(contactHeights.length >= 4, "home: expected contact controls");
    assert.ok(contactHeights.every((height) => height >= 44), "home: contact controls must be at least 44px high");
    assert.equal(await page.locator("#about").isVisible(), true, "home: about section must render");
    assert.equal(await page.locator("#angebot").isVisible(), true, "home: offer section must render");
    assert.equal(await page.locator("#impressionen").isVisible(), true, "home: gallery section must render");
    assert.equal(await page.locator("#kontakt").isVisible(), true, "home: contact section must render");

    if (viewportName === "desktop") {
      const eventWidths = await page.evaluate(() =>
        [...document.querySelectorAll(".event-facts > div")].map((node) => node.getBoundingClientRect().width)
      );
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

async function auditExpiredEvent(browser) {
  // One millisecond after the configured end time: the current-event slot must be gone.
  const now = Date.parse("2027-01-16T23:00:00.001+01:00");
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.addInitScript((mockNow) => {
    const NativeDate = Date;
    class MockDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [mockNow]));
      }
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
    report.push(await auditExpiredEvent(browser));
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Visual audit PASS: ${report.length} states checked after real scroll activation`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
