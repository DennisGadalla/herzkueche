from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class RegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.js = (ROOT / "assets/js/main.js").read_text(encoding="utf-8")
        cls.html = (ROOT / "index.html").read_text(encoding="utf-8")

    def test_header_height_has_no_measure_write_feedback_loop(self):
        self.assertNotIn("ResizeObserver", self.js)
        self.assertNotIn("syncHeaderHeight", self.js)
        self.assertNotIn('setProperty("--header-h"', self.js)

    def test_restored_poster_asset_is_directly_used(self):
        poster = ROOT / "assets/img/events/supperclub-2027-01-16.avif"
        self.assertTrue(poster.is_file())
        self.assertGreaterEqual(poster.stat().st_size, 40_000)
        self.assertLess(poster.stat().st_size, 100_000)
        self.assertGreaterEqual(self.html.count("assets/img/events/supperclub-2027-01-16.avif"), 3)
        self.assertIn('class="event-poster" width="640" height="960" loading="eager"', self.html)

    def test_event_expires_at_exact_end_time(self):
        self.assertIn('if (now >= end) return "past";', self.js)

    def test_supperclub_prefill_is_natural_and_short(self):
        self.assertIn("ich interessiere mich für das Supperclub Dinner", self.js)
        self.assertIn("und möchte gerne Plätze anfragen.", self.js)
        self.assertIn('"Personenzahl: "', self.js)
        self.assertNotIn("Unverträglichkeiten / Wünsche (optional)", self.js)

    def test_inquiry_jump_uses_fixed_header_offset_hash_and_focus(self):
        self.assertIn("target.getBoundingClientRect().top - headerHeight - 16", self.js)
        self.assertIn('scrollTargetIntoView(form, { focus: name, hash: "#kontakt" })', self.js)
        self.assertIn('window.history.replaceState(null, "", hash)', self.js)


if __name__ == "__main__":
    unittest.main()
