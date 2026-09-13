from html.parser import HTMLParser
from pathlib import Path
import json
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
PAGES = [ROOT / "index.html", ROOT / "galerie.html", ROOT / "impressum.html"]

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


def parse(path):
    parser = AuditParser()
    parser.feed(path.read_text(encoding="utf-8"))
    parser.close()
    parser.finish()
    return parser


def find(parser, tag, **expected):
    matches = []
    for current_tag, attrs in parser.attrs_by_tag:
        if current_tag != tag:
            continue
        if all((key in attrs if value is None else attrs.get(key) == value)
               for key, value in expected.items()):
            matches.append(attrs)
    return matches


def expand_ranges(ranges):
    numbers = []
    for start, end in ranges:
        numbers.extend(range(start, end + 1))
    return numbers


class SiteStructureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.index_parser = parse(ROOT / "index.html")
        cls.index_text = " ".join(cls.index_parser.text_parts)
        cls.css = (ROOT / "assets/css/style.css").read_text(encoding="utf-8")
        cls.js = (ROOT / "assets/js/main.js").read_text(encoding="utf-8")

    def test_all_html_pages_are_balanced_and_ids_unique(self):
        for page in PAGES:
            with self.subTest(page=page.name):
                parser = parse(page)
                self.assertEqual(parser.errors, [])
                self.assertEqual(len(parser.ids), len(set(parser.ids)))

    def test_all_pages_share_one_stylesheet_and_one_script(self):
        for page in PAGES:
            with self.subTest(page=page.name):
                parser = parse(page)
                styles = find(parser, "link", rel="stylesheet")
                scripts = find(parser, "script", src="assets/js/main.js")
                self.assertEqual([x.get("href") for x in styles], ["assets/css/style.css"])
                self.assertEqual(len(scripts), 1)
                html = page.read_text(encoding="utf-8")
                self.assertNotIn("site-polish.css", html)
                self.assertNotIn("site-polish.js", html)

    def test_favicon_exists_and_is_valid_on_every_page(self):
        expected = "assets/img/logo/logo.png"
        self.assertTrue((ROOT / expected).is_file())
        for page in PAGES:
            parser = parse(page)
            icons = find(parser, "link", rel="icon", href=expected)
            self.assertEqual(len(icons), 1, page.name)

    def test_core_sections_exist(self):
        for section_id in (
            "about", "angebot", "supperclub", "vergangene-veranstaltungen",
            "impressionen", "kontakt"
        ):
            self.assertTrue(find(self.index_parser, "section", id=section_id), section_id)

    def test_hero_image_is_eager_and_high_priority(self):
        hero = find(self.index_parser, "img", src="assets/img/person/sabine-3.jpg")
        self.assertEqual(len(hero), 1)
        self.assertEqual(hero[0].get("loading"), "eager")
        self.assertEqual(hero[0].get("fetchpriority"), "high")
        self.assertTrue(hero[0].get("width"))
        self.assertTrue(hero[0].get("height"))

    def test_home_impression_strip_is_static_and_lightweight(self):
        imgs = [attrs for tag, attrs in self.index_parser.attrs_by_tag
                if tag == "img" and attrs.get("data-impression") is not None]
        self.assertEqual(len(imgs), 6)
        unique_sources = {img.get("src") for img in imgs}
        self.assertEqual(unique_sources, {
            "assets/img/impressions/impression-4.jpg",
            "assets/img/impressions/impression-9.jpg",
            "assets/img/impressions/impression-10.jpg",
        })
        for src in unique_sources:
            path = ROOT / src
            self.assertTrue(path.is_file())
            self.assertLess(path.stat().st_size, 250_000, src)

    def test_event_has_explicit_lifecycle_and_archive_target(self):
        event = find(
            self.index_parser,
            "article",
            **{
                "data-event-card": None,
                "data-event-start": "2027-01-16T18:00:00+01:00",
                "data-event-end": "2027-01-16T23:00:00+01:00",
            },
        )
        self.assertEqual(len(event), 1)
        past = find(self.index_parser, "section", id="vergangene-veranstaltungen")
        self.assertEqual(len(past), 1)
        self.assertIn("hidden", past[0])
        self.assertTrue(find(self.index_parser, "div", id="past-events-list"))
        self.assertIn("Vergangene Veranstaltungen", self.index_text)

    def test_event_content_and_cta(self):
        self.assertIn("16. Januar 2027", self.index_text)
        self.assertIn("109 € pro Person", self.index_text)
        cta = find(self.index_parser, "a", href="#kontakt", **{"data-event-inquiry": None})
        self.assertEqual(len(cta), 1)
        event_time = find(self.index_parser, "time", datetime="2027-01-16")
        self.assertEqual(len(event_time), 1)

    def test_event_poster_asset_is_reasonably_sized(self):
        poster = ROOT / "assets/img/events/supperclub-2027-01-16.jpg"
        self.assertTrue(poster.is_file())
        self.assertGreater(poster.stat().st_size, 20_000)
        self.assertLess(poster.stat().st_size, 500_000)

    def test_contact_form_wiring(self):
        forms = find(
            self.index_parser,
            "form",
            id="contact-form",
            action="https://api.web3forms.com/submit",
            method="POST",
        )
        self.assertEqual(len(forms), 1)
        self.assertEqual(len(find(self.index_parser, "input", name="access_key", type="hidden")), 1)
        self.assertEqual(len(find(self.index_parser, "input", id="contact-subject", name="subject", type="hidden")), 1)
        self.assertEqual(len(find(self.index_parser, "input", id="email", name="email", type="email")), 1)
        self.assertEqual(len(find(self.index_parser, "input", id="phone", name="telefon", type="tel")), 1)
        self.assertEqual(len(find(self.index_parser, "textarea", id="message", name="message")), 1)
        self.assertEqual(len(find(self.index_parser, "select", id="topic", name="anliegen")), 1)
        self.assertEqual(len(find(self.index_parser, "a", href="tel:+491723614800")), 1)

    def test_gallery_manifest_lists_only_real_images(self):
        manifest = json.loads((ROOT / "assets/img/galeries/galleries.json").read_text(encoding="utf-8"))
        rows = manifest["galleries"]
        expected_counts = {"Buffets": 62, "Herzkueche": 46, "Dining": 38}
        self.assertEqual({row["id"] for row in rows}, set(expected_counts))

        for row in rows:
            self.assertEqual(row["pattern"], "img-{}.jpg")
            self.assertEqual(row["thumbnailPattern"], "img-{}.webp")
            numbers = expand_ranges(row["ranges"])
            self.assertEqual(len(numbers), expected_counts[row["id"]])
            self.assertEqual(len(numbers), len(set(numbers)))
            for number in numbers:
                source = ROOT / "assets/img/galeries" / row["id"] / f"img-{number}.jpg"
                self.assertTrue(source.is_file(), str(source))

        dining = next(row for row in rows if row["id"] == "Dining")
        dining_numbers = set(expand_ranges(dining["ranges"]))
        self.assertTrue(set(range(23, 33)).isdisjoint(dining_numbers))

    def test_gallery_thumbnails_exist_and_are_lightweight(self):
        manifest = json.loads((ROOT / "assets/img/galeries/galleries.json").read_text(encoding="utf-8"))
        checked = 0
        for row in manifest["galleries"]:
            for number in expand_ranges(row["ranges"]):
                thumb = ROOT / "assets/img/galeries/thumbs" / row["id"] / f"img-{number}.webp"
                self.assertTrue(thumb.is_file(), str(thumb))
                self.assertLess(thumb.stat().st_size, 250_000, str(thumb))
                checked += 1
        self.assertEqual(checked, 146)

    def test_javascript_has_no_runtime_file_probing_or_localstorage_cache(self):
        forbidden = [
            'method: "HEAD"', "probeExists", "discoverNumberedImages",
            "localStorage", "sniffPatternAt", "MISS_LIMIT"
        ]
        for token in forbidden:
            self.assertNotIn(token, self.js)
        self.assertIn("GALLERY_BATCH_SIZE", self.js)
        self.assertIn("thumbnailPattern", self.js)
        self.assertIn("data-event-end", self.js)
        self.assertIn("past-events-list", self.js)

    def test_css_avoids_rendering_and_compositor_shortcuts_that_can_pop_in(self):
        self.assertNotIn("will-change:", self.css)
        self.assertNotIn("content-visibility:", self.css)
        self.assertNotIn("contain-intrinsic-size:", self.css)
        self.assertNotRegex(self.css, r"\.card\s*\{[^}]*opacity\s*:\s*0")
        self.assertIn("prefers-reduced-motion", self.css)
        self.assertNotIn(".galerie-grid { grid-template-columns: 1fr; }", self.css)

    def test_no_root_absolute_local_asset_paths(self):
        for page in PAGES:
            html = page.read_text(encoding="utf-8")
            self.assertNotIn('src="/assets/', html)
            self.assertNotIn('href="/assets/', html)


if __name__ == "__main__":
    unittest.main()
