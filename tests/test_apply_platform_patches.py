import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.apply_platform_patches import apply_patches


class PlatformPatchTests(unittest.TestCase):
    def test_applies_ordered_patches_through_public_interface(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            chromium = root / "chromium"
            patches = root / "patches"
            chromium.mkdir()
            patches.mkdir()
            subprocess.run(["git", "init", "-q", str(chromium)], check=True)
            (chromium / "state.txt").write_text("alpha\nbeta\ngamma\n", encoding="utf-8")
            (patches / "series").write_text("first.patch\nsecond.patch\n", encoding="utf-8")
            (patches / "first.patch").write_text(
                "--- a/state.txt\n+++ b/state.txt\n@@ -1,3 +1,3 @@\n"
                " alpha\n-beta\n+middle\n gamma\n",
                encoding="utf-8",
            )
            (patches / "second.patch").write_text(
                "--- a/state.txt\n+++ b/state.txt\n@@ -1,3 +1,3 @@\n"
                " alpha\n-middle\n+omega\n gamma\n",
                encoding="utf-8",
            )

            self.assertEqual(apply_patches(chromium, patches), 2)
            self.assertEqual(
                (chromium / "state.txt").read_text(encoding="utf-8"),
                "alpha\nomega\ngamma\n",
            )

    def test_rejects_missing_patch(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            chromium = root / "chromium"
            patches = root / "patches"
            chromium.mkdir()
            patches.mkdir()
            (patches / "series").write_text("missing.patch\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                apply_patches(chromium, patches)


if __name__ == "__main__":
    unittest.main()
