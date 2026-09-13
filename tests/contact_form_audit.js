const assert = require("assert");
const { chromium } = require("playwright");

const BASE = process.env.SITE_URL || "http://127.0.0.1:4173";
const SUBMIT_URL = "https://api.web3forms.com/submit";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const submissions = [];

  try {
    await page.route(SUBMIT_URL, async (route) => {
      const request = route.request();
      submissions.push({
        method: request.method(),
        body: request.postData() || "",
      });
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><title>Form test</title><p>OK</p>",
      });
    });

    const response = await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    assert.ok(response?.ok(), "contact form audit: homepage failed to load");

    const form = page.locator("#contact-form");
    const submit = form.locator('button[type="submit"]');
    await form.scrollIntoViewIfNeeded();

    assert.equal(await form.evaluate((node) => node.checkValidity()), false, "blank required form must be invalid");
    await submit.click();
    await page.waitForTimeout(100);
    assert.equal(submissions.length, 0, "blank form must not submit");

    await page.locator("#name").fill("Test Person");
    await page.locator("#email").fill("not-an-email");
    await page.locator("#message").fill("Testnachricht");
    assert.equal(await form.evaluate((node) => node.checkValidity()), false, "invalid email must be rejected");
    await submit.click();
    await page.waitForTimeout(100);
    assert.equal(submissions.length, 0, "invalid email must not submit");

    await page.locator("#email").fill("test@example.com");
    await page.locator("#topic").selectOption("Buffet");
    assert.equal(
      await page.locator("#contact-subject").inputValue(),
      "Buffet – Anfrage über Sabines Herzküche",
      "topic change must update subject",
    );
    assert.equal(await form.evaluate((node) => node.checkValidity()), true, "completed form should be valid");

    const [request] = await Promise.all([
      page.waitForRequest((candidate) => candidate.url() === SUBMIT_URL && candidate.method() === "POST"),
      submit.click(),
    ]);

    const data = new URLSearchParams(request.postData() || "");
    assert.ok(data.get("access_key"), "submission must include Web3Forms access key");
    assert.equal(data.get("from_name"), "Sabines Herzküche Website");
    assert.equal(data.get("subject"), "Buffet – Anfrage über Sabines Herzküche");
    assert.equal(data.get("anliegen"), "Buffet");
    assert.equal(data.get("name"), "Test Person");
    assert.equal(data.get("email"), "test@example.com");
    assert.equal(data.get("message"), "Testnachricht");
    assert.equal(submissions.length, 1, "valid form should submit exactly once");

    console.log("Contact form audit PASS: validation, subject wiring and POST payload checked without external submission");
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
