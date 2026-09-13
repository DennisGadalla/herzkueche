const assert = require("assert");
const { chromium } = require("playwright");
const axe = require("axe-core");

const BASE = process.env.SITE_URL || "http://127.0.0.1:4173";
const ROUTES = [
  "/index.html",
  "/galerie.html?g=Buffets",
  "/galerie.html?g=Herzkueche",
  "/galerie.html?g=Dining",
  "/impressum.html",
  "/datenschutz.html",
];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of VIEWPORTS) {
      for (const route of ROUTES) {
        const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
        const page = await context.newPage();
        const response = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
        assert.ok(response?.ok(), `${route}/${viewport.name}: page failed to load`);
        if (route.includes("galerie.html")) {
          await page.waitForFunction(() => document.querySelectorAll("#galerie-grid button").length === 12);
        }
        await page.addScriptTag({ content: axe.source });
        const result = await page.evaluate(async () => window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
          resultTypes: ["violations"],
        }));
        const serious = result.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
        assert.deepEqual(
          serious.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            targets: violation.nodes.map((node) => node.target.join(" ")),
          })),
          [],
          `${route}/${viewport.name}: serious accessibility violations`,
        );
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`Accessibility audit PASS: ${ROUTES.length * VIEWPORTS.length} route/viewport states checked`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
