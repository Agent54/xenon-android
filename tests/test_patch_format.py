import unittest
from pathlib import Path

from scripts.check_patch_format import check_patch


ROOT = Path(__file__).resolve().parents[1]


class PatchFormatTests(unittest.TestCase):
    def test_all_patch_hunk_headers_match_bodies(self):
        paths = sorted(
            list((ROOT / "patches").rglob("*.patch"))
            + list((ROOT / "tools/emulator-probes").rglob("*.patch"))
        )
        self.assertTrue(paths)
        for path in paths:
            with self.subTest(patch=str(path.relative_to(ROOT))):
                self.assertEqual(check_patch(path.read_text(encoding="utf-8")), [])

    def test_detects_wrong_hunk_counts(self):
        good = "--- a/f\n+++ b/f\n@@ -1,2 +1,3 @@\n a\n+b\n c\n"
        self.assertEqual(check_patch(good), [])
        bad = good.replace("+1,3", "+1,4")
        self.assertTrue(check_patch(bad))
        bad_old = good.replace("-1,2", "-1,1")
        self.assertTrue(check_patch(bad_old))


if __name__ == "__main__":
    unittest.main()
