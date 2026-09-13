from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class RegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.js = (ROOT / "assets/js/main.js").read_text(encoding="utf-8")

    def test_header_height_has_no_measure_write_feedback_loop(self):
        self.assertNotIn("ResizeObserver", self.js)
        self.assertNotIn('setProperty("--header-h"', self.js)
        self.assertNotIn("setProperty('--header-h'", self.js)

    def test_high_resolution_poster_asset_is_present_and_guarded(self):
        poster = ROOT / "assets/img/events/supperclub-2027-01-16-hires.avif"
        self.assertTrue(poster.is_file())
        self.assertGreater(poster.stat().st_size, 10_000)
        self.assertLess(poster.stat().st_size, 500_000)
        self.assertIn('POSTER_HIRES_URL = "assets/img/events/supperclub-2027-01-16-hires.avif"', self.js)
        self.assertIn('poster.dataset.posterQuality = "hires"', self.js)
        self.assertIn("poster.naturalWidth < 1000", self.js)
        self.assertIn("poster.naturalHeight < 1500", self.js)

    def test_event_expires_at_exact_end_time(self):
        self.assertIn('if (now >= end) return "past";', self.js)

    def test_supperclub_prefill_is_natural_and_short(self):
        self.assertIn("ich interessiere mich für das Supperclub Dinner", self.js)
        self.assertIn("und möchte gerne Plätze anfragen.", self.js)
        self.assertIn('"Personenzahl: "', self.js)
        self.assertNotIn("Unverträglichkeiten / Wünsche (optional)", self.js)

    def test_inquiry_jump_uses_fixed_header_offset_and_focus(self):
        self.assertIn("target.getBoundingClientRect().top - headerHeight - 16", self.js)
        self.assertIn('scrollTargetIntoView(form, { focus: name, hash: "#kontakt" })', self.js)


if __name__ == "__main__":
    unittest.main()
