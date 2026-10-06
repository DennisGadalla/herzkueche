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

async function activateWholePage(page) {
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const step = Math.max(260, Math.floor(innerHeight * 0.62));
    let max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    for (let y = 0; y <= max; y += step) {
      scrollTo(0, y);
      await wait(35);
      max = Math.max(max, document.documentElement.scrollHeight - innerHeight);
    }
    scrollTo(0, max);
    await wait(80);
    scrollTo(0, 0);
    await wait(80);
  });
}

async function settle(page) {
  await page.waitForTimeout(180);
  await activateWholePage(page);
  await page.evaluate(async () => {
    const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await Promise.all([...document.images].map(async (image) => {
      if (!image.decode) return;
      await Promise.race([image.decode().catch(() => undefined), timeout(900)]);
    }));
  });
  await page.waitForTimeout(100);
}

async function stableGeometry(page, waits = [650]) {
  const selectors = [
    "header",
    "header .container",
    ".hero",
    "#about .card",
    "#angebot .card",
    "#impressionen .card",
    "#kontakt .card",
  ];

  const sample = () => page.evaluate((items) => ({
    documentHeight: document.documentElement.scrollHeight,
    geometry: Object.fromEntries(items.map((selector) => {
      const node = document.querySelector(selector);
      if (!node || getComputedStyle(node).display === "none") return [selector, null];
      const rect = node.getBoundingClientRect();
      return [selector, {
        left: rect.left,
        top: rect.top + scrollY,
        width: rect.width,
        height: rect.height,
      }];
    })),
  }), selectors);

  const first = await sample();
  for (const wait of waits) {
    await page.waitForTimeout(wait);
    const current = await sample();
    assert.ok(
      Math.abs(current.documentHeight - first.documentHeight) <= 1.5,
      `document height kept changing: ${first.documentHeight} -> ${current.documentHeight}`
    );
    for (const selector of selectors) {
      if (!first.geometry[selector] || !current.geometry[selector]) continue;
      for (const key of ["left", "top", "width", "height"]) {
        const delta = Math.abs(first.geometry[selector][key] - current.geometry[selector][key]);
        assert.ok(delta <= 1.5, `${selector}: ${key} drifted by ${delta.toFixed(2)}px`);
      }
    }
  }
}

async function assertHealth(page, label) {
  const result = await page.evaluate(() => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    return {
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      broken: [...document.images]
        .filter((image) => visible(image) && image.complete && image.naturalWidth === 0)
        .map((image) => image.getAttribute("src")),
      small: [...document.querySelectorAll("button, .btn")]
        .filter(visible)
        .map((node) => ({ text: node.textContent.trim(), height: node.getBoundingClientRect().height }))
        .filter((item) => item.height < 40),
    };
  });

  assert.ok(
    result.scrollWidth <= result.innerWidth + 1,
    `${label}: horizontal overflow ${result.scrollWidth}px > ${result.innerWidth}px`
  );
  assert.deepEqual(result.broken, [], `${label}: broken visible images`);
  assert.deepEqual(result.small, [], `${label}: undersized controls`);
}

async function assertHome(page, viewportName) {
  for (const selector of ["#about", "#angebot", "#impressionen", "#kontakt"]) {
    assert.equal(await page.locator(selector).isVisible(), true, "home/" + viewportName + ": " + selector);
  }

  for (const selector of ["#supperclub", "#vergangene-veranstaltungen", ".event-card", ".event-poster", "#poster-dialog"]) {
    assert.equal(await page.locator(selector).count(), 0, "home/" + viewportName + ": removed event remains at " + selector);
  }
  assert.equal(await page.getByText("Supperclub Dinner", { exact: true }).count(), 0, "home/" + viewportName + ": event title remains");
  assert.deepEqual(await page.locator('[data-service-card] h3').allTextContents(), ["Private Cooking", "Kochkurse", "Buffets", "Supperclubs"]);

  const rows = await page.evaluate(() => [...document.querySelectorAll("main > section:not([hidden]) > .container")]
    .filter((node) => getComputedStyle(node).display !== "none")
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, width: rect.width };
    }));
  assert.ok(rows.length >= 4, "home/" + viewportName + ": aligned section containers missing");
  assert.ok(
    Math.max(...rows.map((row) => row.left)) - Math.min(...rows.map((row) => row.left)) <= 1.5,
    "home/" + viewportName + ": section left edges drift"
  );
  assert.ok(
    Math.max(...rows.map((row) => row.width)) - Math.min(...rows.map((row) => row.width)) <= 1.5,
    "home/" + viewportName + ": section widths drift"
  );

  const contactHeights = await page.evaluate(() =>
    [...document.querySelectorAll("#contact-form input:not([type=hidden]), #contact-form select")]
      .map((node) => node.getBoundingClientRect().height));
  assert.ok(
    contactHeights.length >= 4 && contactHeights.every((height) => height >= 44),
    "home/" + viewportName + ": contact controls too small"
  );
}
async function auditRoute(browser, routeName, route, viewportName, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", (request) => failed.push(`${request.method()} ${request.url()}`));

  const response = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  assert.ok(response?.ok(), `${routeName}/${viewportName}: HTTP load failed`);
  await settle(page);
  if (routeName === "home") await assertHome(page, viewportName);
  await assertHealth(page, `${routeName}/${viewportName}`);
  assert.deepEqual(errors, [], `${routeName}/${viewportName}: browser errors: ${errors.join(" | ")}`);
  assert.deepEqual(failed, [], `${routeName}/${viewportName}: failed requests: ${failed.join(" | ")}`);
  await stableGeometry(page, routeName === "home" ? [600, 900, 1200] : [650]);

  if (routeName.startsWith("gallery-")) {
    assert.equal(await page.locator("#galerie-grid button").count(), 12, `${routeName}: first batch`);
    assert.equal(await page.locator("#gallery-more-wrap").isVisible(), true, `${routeName}: load more`);
  }

  const screenshot = path.join(OUT, `${routeName}-${viewportName}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();
  return { routeName, viewportName, screenshot };
}

async function auditInquiry(browser, viewportName, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await settle(page);

  await page.locator('[data-service-cta][data-service-topic="Supperclub"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator("#topic").inputValue(), "Supperclub", viewportName + ": topic");
  assert.equal(
    await page.locator("#contact-subject").inputValue(),
    "Supperclub – Anfrage über Sabines Herzküche",
    viewportName + ": subject"
  );
  assert.equal(await page.locator("#message").inputValue(), "", viewportName + ": stale event message prefill");
  assert.equal(new URL(page.url()).hash, "#kontakt", viewportName + ": hash");

  const position = await page.evaluate(() => {
    const name = document.querySelector("#name").getBoundingClientRect();
    const header = document.querySelector("header").getBoundingClientRect();
    return {
      nameTop: name.top,
      nameBottom: name.bottom,
      headerBottom: header.bottom,
      viewportHeight: innerHeight,
      active: document.activeElement && document.activeElement.id,
    };
  });
  assert.ok(
    position.nameBottom > position.headerBottom + 20 && position.nameTop < position.viewportHeight - 20,
    viewportName + ": name field is not visible after inquiry jump"
  );
  assert.equal(position.active, "name", viewportName + ": name field not focused");

  const screenshot = path.join(OUT, "home-supperclub-inquiry-" + viewportName + ".png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();
  return { routeName: "home-supperclub-inquiry", viewportName, screenshot };
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
    report.push(await auditInquiry(browser, "desktop", viewports[0][1]));
    report.push(await auditInquiry(browser, "mobile", viewports[2][1]));
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Visual audit PASS: ${report.length} states checked`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
