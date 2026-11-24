import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.validate_sources import load_lock, parse_chromium_version, series_paths, validate


class SourceValidationTests(unittest.TestCase):
    def test_parse_chromium_version(self):
        self.assertEqual(
            parse_chromium_version("MAJOR=154\nMINOR=0\nBUILD=8037\nPATCH=57\n"),
            "154.0.8037.57",
        )

    def test_series_preserves_order_and_skips_comments(self):
        self.assertEqual(
            series_paths("# comment\na.patch\n\nb/c.patch # reason\n"),
            [Path("a.patch"), Path("b/c.patch")],
        )

    def test_series_rejects_duplicate_and_traversal(self):
        for contents in ("a.patch\na.patch\n", "../outside.patch\n", "/absolute.patch\n"):
            with self.subTest(contents=contents), self.assertRaises(ValueError):
                series_paths(contents)

    def test_repository_lock_is_well_formed(self):
        lock = load_lock(Path(__file__).resolve().parents[1] / "source.lock.json")
        self.assertEqual(lock["chromium_version"], "154.0.8037.57")

    def test_pinned_fixture_trees_validate_through_public_interface(self):
        with tempfile.TemporaryDirectory() as root:
            chromium = Path(root) / "chromium"
            helium = Path(root) / "helium"
            (chromium / "chrome").mkdir(parents=True)
            (helium / "patches").mkdir(parents=True)
            (helium / "utils").mkdir()
            (chromium / "chrome/VERSION").write_text(
                "MAJOR=154\nMINOR=0\nBUILD=8037\nPATCH=57\n", encoding="utf-8"
            )
            (helium / "chromium_version.txt").write_text(
                "154.0.8037.57\n", encoding="utf-8"
            )
            (helium / "patches/series").write_text("base.patch\n", encoding="utf-8")
            (helium / "patches/base.patch").write_text("fixture", encoding="utf-8")
            (helium / "utils/patches.py").write_text("# fixture\n", encoding="utf-8")
            (helium / "utils/downloads.py").write_text("# fixture\n", encoding="utf-8")
            (helium / "deps.ini").write_text("[fixture]\n", encoding="utf-8")

            def commit_fixture(tree):
                subprocess.run(["git", "init", "-q", str(tree)], check=True)
                subprocess.run(["git", "-C", str(tree), "add", "."], check=True)
                subprocess.run(
                    [
                        "git", "-C", str(tree), "-c", "user.name=Fixture",
                        "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture",
                    ],
                    check=True,
                )
                return subprocess.check_output(
                    ["git", "-C", str(tree), "rev-parse", "HEAD"], text=True
                ).strip()

            lock = {
                "chromium_version": "154.0.8037.57",
                "chromium_commit": commit_fixture(chromium),
                "helium_commit": commit_fixture(helium),
            }
            self.assertEqual(validate(chromium, helium, lock), 1)
            lock["chromium_commit"] = "0" * 40
            with self.assertRaisesRegex(ValueError, "does not match pin"):
                validate(chromium, helium, lock)


if __name__ == "__main__":
    unittest.main()
