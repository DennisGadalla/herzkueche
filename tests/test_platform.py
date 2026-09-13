from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]


class PlatformQualityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.css = (ROOT / "assets/css/style.css").read_text(encoding="utf-8")
        cls.js = (ROOT / "assets/js/main.js").read_text(encoding="utf-8")
        cls.impressum = (ROOT / "impressum.html").read_text(encoding="utf-8")

    def test_privacy_and_current_legal_surface_exist(self):
        privacy = ROOT / "datenschutz.html"
        self.assertTrue(privacy.is_file(), "Datenschutz page is required for the contact form")
        privacy_text = privacy.read_text(encoding="utf-8")
        self.assertIn("Datenschutzerklärung", privacy_text)
        self.assertIn("GitHub Pages", privacy_text)
        self.assertIn("Web3Forms", privacy_text)
        self.assertIn("Art. 6", privacy_text)
        self.assertIn("Betroffenenrechte", privacy_text)
        self.assertIn("§ 5 DDG", self.impressum)
        self.assertNotIn("TMG", self.impressum)

        for page_name in ("galerie.html", "impressum.html", "datenschutz.html"):
            html = (ROOT / page_name).read_text(encoding="utf-8")
            self.assertIn('href="impressum.html"', html, page_name)
            self.assertIn('href="datenschutz.html"', html, page_name)
        self.assertIn("enhanceFooter", self.js)

    def test_search_discovery_files_are_consistent(self):
        robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
        sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        self.assertIn("Sitemap: https://www.sabines-herzkueche.de/sitemap.xml", robots)
        self.assertIn("https://www.sabines-herzkueche.de/", sitemap)
        self.assertNotIn("impressum.html", sitemap)
        self.assertNotIn("datenschutz.html", sitemap)
        self.assertNotIn("galerie.html", sitemap)

    def test_runtime_seo_and_structured_data_are_present(self):
        self.assertIn("enhanceMetadata", self.js)
        for token in ("og:title", "og:description", "og:url", "og:image", "twitter:card", '"@type": "Person"', '"@type": "Event"'):
            self.assertIn(token, self.js)
        self.assertIn('startDate: "2027-01-16T18:00:00+01:00"', self.js)
        self.assertIn('endDate: "2027-01-16T23:00:00+01:00"', self.js)
        self.assertIn('price: "109"', self.js)
        self.assertIn('priceCurrency: "EUR"', self.js)

    def test_conversion_enhancements_are_defined(self):
        self.assertIn("enhanceHero", self.js)
        self.assertIn("enhanceOffer", self.js)
        self.assertIn("enhanceContactForm", self.js)
        self.assertIn("enhanceCalendarAction", self.js)
        self.assertIn("initStickyContact", self.js)
        for topic in ("Private Cooking", "Kochkurs", "Buffet", "Supperclub 16.01.2027"):
            self.assertIn(topic, self.js)
        for field in ('id="date"', 'id="location"', 'id="party"', 'name="botcheck"', 'datenschutz.html'):
            self.assertIn(field, self.js)

    def test_motion_and_keyboard_semantics_are_intentional(self):
        self.assertNotIn("impressions-scroll", self.css)
        self.assertIn("enhanceImpressions", self.js)
        self.assertIn("data-impression-open", self.js)
        self.assertIn("lastLightboxTrigger", self.js)
        self.assertIn("lastLightboxTrigger?.focus", self.js)
        self.assertIn("enhanceSkipLink", self.js)
        self.assertIn("skip-link", self.css)

    def test_primary_cta_uses_accessible_action_tone(self):
        self.assertIn("--action: #ad4327", self.css.lower())
        self.assertIn("background: var(--action)", self.css)

    def test_event_architecture_is_generalized(self):
        self.assertIn("const cards = $$('[data-event-card]')", self.js)
        self.assertIn("cards.forEach", self.js)
        self.assertNotIn('const card = $("[data-event-card]")', self.js)
        self.assertIn("active.sort", self.js)
        self.assertIn("past.sort", self.js)

    def test_calendar_asset_matches_visible_event_times(self):
        calendar = (ROOT / "assets/events/supperclub-2027-01-16.ics").read_text(encoding="utf-8")
        self.assertIn("DTSTART:20270116T170000Z", calendar)
        self.assertIn("DTEND:20270116T220000Z", calendar)
        self.assertIn("109 EUR", calendar)
        self.assertIn("assets/events/supperclub-2027-01-16.ics", self.js)

    def test_gallery_manifest_has_visual_entry_metadata(self):
        manifest = json.loads((ROOT / "assets/img/galeries/galleries.json").read_text(encoding="utf-8"))
        for gallery in manifest["galleries"]:
            self.assertTrue(gallery.get("description"))
            cover = gallery.get("cover")
            self.assertIsInstance(cover, int)
            thumb = ROOT / "assets/img/galeries/thumbs" / gallery["id"] / gallery["thumbnailPattern"].replace("{}", str(cover))
            self.assertTrue(thumb.is_file(), str(thumb))
        self.assertNotIn("&t=${encodeURIComponent", self.js)


if __name__ == "__main__":
    unittest.main()
