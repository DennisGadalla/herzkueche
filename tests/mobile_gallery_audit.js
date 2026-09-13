const assert = require("assert");
const { chromium } = require("playwright");

const BASE = process.env.SITE_URL || "http://127.0.0.1:4173";
const VIEWPORT = { width: 390, height: 844 };
const ROUTES = [
  "/galerie.html?g=Buffets&t=Buffets",
  "/galerie.html?g=Herzkueche&t=Herzk%C3%BCche",
  "/galerie.html?g=Dining&t=Dining",
];

async function waitForGallery(page) {
  await page.waitForSelector("#galerie-grid button");
  await page.waitForFunction(() => document.querySelectorAll("#galerie-grid button").length === 12);
  await page.evaluate(async () => {
    await Promise.all([...document.images].map((image) => image.decode?.().catch(() => undefined)));
  });
}

async function assertMobileGalleryGeometry(page, route) {
  const geometry = await page.evaluate(() => {
    const grid = document.querySelector("#galerie-grid");
    const card = document.querySelector(".gallery-page-card");
    const head = document.querySelector(".gallery-head");
    const title = document.querySelector("#galerie-title");
    const back = document.querySelector(".gallery-actions .btn");
    const tiles = [...document.querySelectorAll("#galerie-grid button")].slice(0, 6);
    const gridStyle = getComputedStyle(grid);
    const cardStyle = getComputedStyle(card);
    const rects = tiles.map((tile) => {
      const rect = tile.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    const headRect = head.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const backRect = back.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    return {
      rects,
      rowGap: parseFloat(gridStyle.rowGap),
      columnGap: parseFloat(gridStyle.columnGap),
      cardPaddingLeft: parseFloat(cardStyle.paddingLeft),
      cardPaddingRight: parseFloat(cardStyle.paddingRight),
      gridInsetLeft: gridRect.left - cardRect.left,
      gridInsetRight: cardRect.right - gridRect.right,
      headHeight: headRect.height,
      titleCenter: titleRect.top + titleRect.height / 2,
      backCenter: backRect.top + backRect.height / 2,
      backHeight: backRect.height,
    };
  });

  assert.equal(geometry.rects.length, 6, `${route}: expected six visible gallery tiles`);
  geometry.rects.forEach(({ width, height }, index) => {
    const ratio = width / height;
    assert.ok(ratio > 0.95 && ratio < 1.05, `${route}: tile ${index} is not square (${width}x${height})`);
  });
  assert.ok(geometry.rowGap <= 8 && geometry.columnGap <= 8, `${route}: gallery gap is too large`);
  assert.ok(geometry.cardPaddingLeft <= 14 && geometry.cardPaddingRight <= 14, `${route}: gallery card wastes mobile width`);
  assert.ok(geometry.gridInsetLeft <= 14 && geometry.gridInsetRight <= 14, `${route}: gallery grid is too inset`);
  assert.ok(Math.abs(geometry.titleCenter - geometry.backCenter) <= 12, `${route}: gallery title and back action should share one compact row`);
  assert.ok(geometry.backHeight >= 44, `${route}: back action is too small for touch`);
}

async function assertMobileLightbox(page, route) {
  await page.locator("#galerie-grid button").first().click();
  const metrics = await page.locator(".lightbox-dialog").evaluate((dialog) => {
    const rect = dialog.getBoundingClientRect();
    const close = dialog.querySelector(".lightbox-dialog-close").getBoundingClientRect();
    const image = dialog.querySelector("img").getBoundingClientRect();
    return {
      open: dialog.open,
      width: rect.width,
      height: rect.height,
      closeWidth: close.width,
      closeHeight: close.height,
      imageWidth: image.width,
      imageHeight: image.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    };
  });

  assert.equal(metrics.open, true, `${route}: lightbox did not open`);
  assert.ok(metrics.width >= metrics.viewportWidth - 2, `${route}: lightbox is not edge-to-edge on mobile`);
  assert.ok(metrics.height >= metrics.viewportHeight - 2, `${route}: lightbox does not use the full mobile viewport`);
  assert.ok(metrics.closeWidth >= 44 && metrics.closeHeight >= 44, `${route}: lightbox close target is too small`);
  assert.ok(metrics.imageWidth > 0 && metrics.imageHeight > 0, `${route}: lightbox image is not visible`);
  await page.locator(".lightbox-dialog-close").click();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const route of ROUTES) {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      const response = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      assert.ok(response?.ok(), `${route}: page load failed`);
      await waitForGallery(page);
      await assertMobileGalleryGeometry(page, route);
      await assertMobileLightbox(page, route);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log("Mobile gallery audit PASS: 3 galleries checked");
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
