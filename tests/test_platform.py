from html.parser import HTMLParser
from pathlib import Path
import json
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags = []

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

    def handle_startendtag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


def parse(path):
    parser = Parser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def matches(parser, tag, **expected):
    out = []
    for current, attrs in parser.tags:
        if current != tag:
            continue
        if all((key in attrs if value is None else attrs.get(key) == value) for key, value in expected.items()):
            out.append(attrs)
    return out


class PlatformQualityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index_path = ROOT / "index.html"
        cls.index = cls.index_path.read_text(encoding="utf-8")
        cls.index_parser = parse(cls.index_path)
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

        for page_name in ("index.html", "galerie.html", "impressum.html", "datenschutz.html"):
            html = (ROOT / page_name).read_text(encoding="utf-8")
            self.assertIn('href="impressum.html"', html, page_name)
            self.assertIn('href="datenschutz.html"', html, page_name)

    def test_home_has_search_and_social_metadata(self):
        self.assertEqual(len(matches(self.index_parser, "link", rel="canonical", href="https://www.sabines-herzkueche.de/")), 1)
        required_meta = {
            ("property", "og:title"),
            ("property", "og:description"),
            ("property", "og:url"),
            ("property", "og:image"),
            ("name", "twitter:card"),
        }
        present = {(key, attrs.get(key)) for _, attrs in self.index_parser.tags for key in ("property", "name") if attrs.get(key)}
        for item in required_meta:
            self.assertIn(item, present)

        scripts = re.findall(r'<script\s+type="application/ld\+json">(.*?)</script>', self.index, flags=re.S)
        self.assertGreaterEqual(len(scripts), 1)
        payloads = [json.loads(script) for script in scripts]
        flattened = []
        for payload in payloads:
            if isinstance(payload, dict) and "@graph" in payload:
                flattened.extend(payload["@graph"])
            else:
                flattened.append(payload)
        types = {item.get("@type") for item in flattened if isinstance(item, dict)}
        self.assertIn("Person", types)
        self.assertIn("Event", types)
        event = next(item for item in flattened if isinstance(item, dict) and item.get("@type") == "Event")
        self.assertEqual(event.get("startDate"), "2027-01-16T18:00:00+01:00")
        self.assertEqual(event.get("endDate"), "2027-01-16T23:00:00+01:00")
        self.assertEqual(event.get("offers", {}).get("price"), "109")
        self.assertEqual(event.get("offers", {}).get("priceCurrency"), "EUR")

    def test_robots_and_sitemap_are_consistent(self):
        robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
        sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        self.assertIn("Sitemap: https://www.sabines-herzkueche.de/sitemap.xml", robots)
        self.assertIn("https://www.sabines-herzkueche.de/", sitemap)
        self.assertNotIn("impressum.html", sitemap)
        self.assertNotIn("datenschutz.html", sitemap)
        self.assertNotIn("galerie.html", sitemap)

    def test_offer_is_four_actionable_service_cards(self):
        cards = matches(self.index_parser, "article", **{"data-service-card": None})
        self.assertEqual(len(cards), 4)
        expected_topics = {"Private Cooking", "Kochkurs", "Buffet", "Supperclub 16.01.2027"}
        ctas = matches(self.index_parser, "a", **{"data-service-cta": None})
        self.assertEqual({cta.get("data-service-topic") for cta in ctas}, expected_topics)
        for cta in ctas:
            self.assertEqual(cta.get("href"), "#kontakt")

    def test_contact_form_collects_structured_inquiry_context_and_privacy_notice(self):
        for field_id, name in (("date", "datum"), ("location", "ort"), ("party", "personenzahl")):
            self.assertEqual(len(matches(self.index_parser, "input", id=field_id, name=name)), 1)
        self.assertEqual(len(matches(self.index_parser, "input", name="botcheck", type="checkbox")), 1)
        self.assertIn('class="form-privacy"', self.index)
        self.assertIn('href="datenschutz.html"', self.index)

    def test_home_gallery_has_no_javascript_dependency_for_navigation(self):
        links = [attrs for tag, attrs in self.index_parser.tags if tag == "a" and "gallery-card" in (attrs.get("class") or "")]
        self.assertEqual(len(links), 3)
        expected = {"Buffets", "Herzkueche", "Dining"}
        found = set()
        for link in links:
            href = link.get("href", "")
            self.assertNotIn("&t=", href)
            match = re.search(r"[?&]g=([^&]+)", href)
            self.assertIsNotNone(match)
            found.add(match.group(1))
        self.assertEqual(found, expected)

    def test_motion_and_keyboard_semantics_are_intentional(self):
        self.assertNotIn("impressions-scroll", self.css)
        impression_buttons = matches(self.index_parser, "button", **{"data-impression-open": None})
        self.assertEqual(len(impression_buttons), 3)
        self.assertIn("lastLightboxTrigger", self.js)
        self.assertIn("lastLightboxTrigger?.focus", self.js)
        self.assertIn('class="skip-link"', self.index)

    def test_primary_cta_uses_accessible_action_tone(self):
        self.assertIn("--action: #ad4327", self.css.lower())
        self.assertRegex(self.css, r"\.btn\.primary\s*\{[^}]*background:\s*var\(--action\)")

    def test_event_and_gallery_architecture_are_generalized(self):
        self.assertIn('$$('["'"'][data-event-card]["'"']')', self.js)
        self.assertNotIn('const card = $("[data-event-card]")', self.js)
        self.assertNotIn("&t=${encodeURIComponent", self.js)
        self.assertIn("data-event-calendar", self.index)
        self.assertIn("assets/events/supperclub-2027-01-16.ics", self.index)

    def test_gallery_manifest_has_visual_entry_metadata(self):
        manifest = json.loads((ROOT / "assets/img/galeries/galleries.json").read_text(encoding="utf-8"))
        for gallery in manifest["galleries"]:
            self.assertTrue(gallery.get("description"))
            cover = gallery.get("cover")
            self.assertIsInstance(cover, int)
            thumb = ROOT / "assets/img/galeries/thumbs" / gallery["id"] / gallery["thumbnailPattern"].replace("{}", str(cover))
            self.assertTrue(thumb.is_file(), str(thumb))


if __name__ == "__main__":
    unittest.main()
