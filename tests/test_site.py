from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"

VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr"
}

class AuditParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errors = []
        self.ids = []
        self.attrs_by_tag = []
        self.text_parts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.attrs_by_tag.append((tag, attrs))
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag not in VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        attrs = dict(attrs)
        self.attrs_by_tag.append((tag, attrs))
        if "id" in attrs:
            self.ids.append(attrs["id"])

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append(f"unexpected closing tag </{tag}>")
            return
        if self.stack[-1] == tag:
            self.stack.pop()
            return
        self.errors.append(f"mismatched closing tag </{tag}>; open={self.stack[-1]}")
        if tag in self.stack:
            while self.stack and self.stack[-1] != tag:
                self.stack.pop()
            if self.stack:
                self.stack.pop()

    def handle_data(self, data):
        self.text_parts.append(data)

    def finish(self):
        if self.stack:
            self.errors.append("unclosed tags: " + ", ".join(self.stack))


def load_parser():
    parser = AuditParser()
    parser.feed(INDEX.read_text(encoding="utf-8"))
    parser.close()
    parser.finish()
    return parser


def find(parser, tag, **expected):
    matches = []
    for t, attrs in parser.attrs_by_tag:
        if t != tag:
            continue
        if all(attrs.get(k) == v for k, v in expected.items()):
            matches.append(attrs)
    return matches


class SiteStructureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = INDEX.read_text(encoding="utf-8")
        cls.parser = load_parser()
        cls.text = " ".join(cls.parser.text_parts)

    def test_html_is_balanced(self):
        self.assertEqual(self.parser.errors, [])

    def test_ids_are_unique(self):
        self.assertEqual(len(self.parser.ids), len(set(self.parser.ids)))

    def test_core_sections_exist(self):
        for section_id in ("about", "angebot", "supperclub", "impressionen", "kontakt"):
            self.assertTrue(find(self.parser, "section", id=section_id), section_id)

    def test_hero_image_is_eager_and_high_priority(self):
        hero = find(self.parser, "img", src="assets/img/person/sabine-3.jpg")
        self.assertEqual(len(hero), 1)
        self.assertEqual(hero[0].get("loading"), "eager")
        self.assertEqual(hero[0].get("fetchpriority"), "high")

    def test_event_content_and_cta(self):
        self.assertIn("16. Januar 2027", self.text)
        self.assertIn("109 € pro Person", self.text)
        cta = find(self.parser, "a", href="#kontakt", **{"data-event-inquiry": None})
        self.assertTrue(cta)
        event_time = find(self.parser, "time", datetime="2027-01-16")
        self.assertEqual(len(event_time), 1)

    def test_event_poster_asset_exists(self):
        poster = ROOT / "assets/img/events/supperclub-2027-01-16.jpg"
        self.assertTrue(poster.is_file())
        self.assertGreater(poster.stat().st_size, 50_000)
        self.assertLess(poster.stat().st_size, 500_000)

    def test_contact_form_wiring(self):
        forms = find(
            self.parser,
            "form",
            id="contact-form",
            action="https://api.web3forms.com/submit",
            method="POST",
        )
        self.assertEqual(len(forms), 1)

        access_keys = find(self.parser, "input", name="access_key", type="hidden")
        self.assertEqual(len(access_keys), 1)
        self.assertTrue(access_keys[0].get("value"))

        subjects = find(self.parser, "input", id="contact-subject", name="subject", type="hidden")
        self.assertEqual(len(subjects), 1)

        email = find(self.parser, "input", id="email", name="email", type="email")
        self.assertEqual(len(email), 1)
        self.assertIn("required", email[0])

        phone = find(self.parser, "input", id="phone", name="telefon", type="tel")
        self.assertEqual(len(phone), 1)

        message = find(self.parser, "textarea", id="message", name="message")
        self.assertEqual(len(message), 1)
        self.assertIn("required", message[0])

        topic = find(self.parser, "select", id="topic", name="anliegen")
        self.assertEqual(len(topic), 1)
        self.assertIn("required", topic[0])

    def test_phone_number_is_clickable(self):
        links = find(self.parser, "a", href="tel:+491723614800")
        self.assertEqual(len(links), 1)

    def test_progressive_enhancement_assets_are_loaded(self):
        styles = find(self.parser, "link", rel="stylesheet", href="assets/css/site-polish.css")
        scripts = find(self.parser, "script", src="assets/js/site-polish.js")
        self.assertEqual(len(styles), 1)
        self.assertEqual(len(scripts), 1)
        self.assertTrue((ROOT / "assets/css/site-polish.css").is_file())
        self.assertTrue((ROOT / "assets/js/site-polish.js").is_file())

    def test_event_js_prefills_form_but_cta_still_works_without_js(self):
        js = (ROOT / "assets/js/site-polish.js").read_text(encoding="utf-8")
        self.assertIn('topic.value = "Supperclub 16.01.2027"', js)
        self.assertIn('subject.value = "Supperclub 16.01.2027 – Platzanfrage"', js)
        self.assertIn("Personenzahl:", js)
        self.assertIn('href="#kontakt"', self.html)

    def test_no_root_absolute_local_asset_paths(self):
        self.assertNotIn('src="/assets/', self.html)
        self.assertNotIn('href="/assets/', self.html)

if __name__ == "__main__":
    unittest.main()
