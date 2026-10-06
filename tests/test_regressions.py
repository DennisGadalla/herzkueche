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

    def test_event_poster_is_not_rendered_or_referenced_from_homepage(self):
        self.assertNotIn("supperclub-2027-01-16", self.html)
        self.assertNotIn("supperclub-2027-01-16", self.js)
        self.assertNotIn("event-poster", self.html)
        self.assertNotIn("poster-dialog", self.html)
    def test_event_specific_lifecycle_and_prefill_are_absent(self):
        for token in ("getEventState", "initEventLifecycle", "initEventInquiry", "Supperclub Dinner", "16.01.2027"):
            self.assertNotIn(token, self.js + self.html)

    def test_inquiry_jump_uses_fixed_header_offset_hash_and_focus(self):
        self.assertIn("target.getBoundingClientRect().top - headerHeight - 16", self.js)
        self.assertIn('scrollTargetIntoView(form, { focus: name, hash: "#kontakt" })', self.js)
        self.assertIn('window.history.replaceState(null, "", hash)', self.js)


if __name__ == "__main__":
    unittest.main()
