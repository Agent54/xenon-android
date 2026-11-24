import re
import unittest
from pathlib import Path

from scripts.validate_sources import series_paths


ROOT = Path(__file__).resolve().parents[1]


def gn_assignment(contents: str, name: str) -> str:
    match = re.search(rf"(?m)^{re.escape(name)}\s*=\s*(.+)$", contents)
    if match is None:
        raise ValueError(f"missing GN assignment: {name}")
    return match.group(1).strip()


class IwaTierTests(unittest.TestCase):
    def test_experimental_package_cannot_replace_working_browser(self):
        ordinary = (ROOT / "android/args.gn").read_text(encoding="utf-8")
        experimental = (ROOT / "android/args-iwa.gn").read_text(encoding="utf-8")

        self.assertEqual(gn_assignment(ordinary, "is_desktop_android"), "false")
        self.assertEqual(gn_assignment(experimental, "is_desktop_android"), "true")
        self.assertNotEqual(
            gn_assignment(ordinary, "chrome_public_manifest_package"),
            gn_assignment(experimental, "chrome_public_manifest_package"),
        )

    def test_iwa_patches_are_not_in_ordinary_android_series(self):
        ordinary = series_paths((ROOT / "patches/series").read_text(encoding="utf-8"))
        experimental = series_paths(
            (ROOT / "patches/iwa/series").read_text(encoding="utf-8")
        )

        self.assertFalse(any("iwa" in path.parts for path in ordinary))
        self.assertTrue(experimental)
        self.assertTrue(
            all((ROOT / "patches/iwa" / path).is_file() for path in experimental)
        )

    def test_experimental_command_line_patch_is_not_in_ordinary_series(self):
        ordinary = series_paths((ROOT / "patches/series").read_text(encoding="utf-8"))
        experimental = series_paths(
            (ROOT / "patches/iwa/series").read_text(encoding="utf-8")
        )
        patch_name = Path("0033-use-dedicated-experimental-command-line-file.patch")
        patch = (ROOT / "patches/iwa" / patch_name).read_text(encoding="utf-8")

        self.assertNotIn(patch_name, ordinary)
        self.assertIn(patch_name, experimental)
        self.assertIn('COMMAND_LINE_FILE = "xenon-iwa-command-line"', patch)
        self.assertIn('COMMAND_LINE_FILE = "chrome-command-line"', patch)
        self.assertEqual(patch.count("diff --git "), 1)

    def test_controlled_frame_safety_series_is_experimental_and_ordered(self):
        ordinary = series_paths((ROOT / "patches/series").read_text(encoding="utf-8"))
        experimental = series_paths(
            (ROOT / "patches/iwa/series").read_text(encoding="utf-8")
        )
        controlled_frame = [
            Path("0034-compile-controlled-frame-with-android-extension-core.patch"),
            Path("0035-enable-controlled-frame-only-for-eligible-android-iwas.patch"),
            Path("0036-preserve-controlled-frame-runtime-boundaries-on-android.patch"),
        ]
        noise_isolation = Path(
            "0055-isolate-helium-noise-in-android-controlled-frames.patch"
        )
        pre_attach_scope = Path(
            "0056-scope-pre-attach-controlled-frame-noise.patch"
        )

        self.assertTrue(all(patch not in ordinary for patch in controlled_frame))
        self.assertEqual(
            [experimental.index(patch) for patch in controlled_frame],
            sorted(experimental.index(patch) for patch in controlled_frame),
        )
        runtime = (ROOT / "patches/iwa" / controlled_frame[-1]).read_text(
            encoding="utf-8"
        )
        self.assertIn(
            "url_.scheme() != render_frame_host->GetLastCommittedOrigin().scheme()",
            runtime,
        )
        self.assertNotIn(noise_isolation, ordinary)
        self.assertLess(experimental.index(controlled_frame[-1]),
                        experimental.index(noise_isolation))
        noise_patch = (ROOT / "patches/iwa" / noise_isolation).read_text(
            encoding="utf-8"
        )
        self.assertIn("IsOwnedByControlledFrameEmbedder()", noise_patch)
        self.assertIn("guest_partition.partition_domain()", noise_patch)
        self.assertNotIn("diff --git a/content/browser/direct_sockets/", noise_patch)
        self.assertNotIn(pre_attach_scope, ordinary)
        self.assertLess(experimental.index(noise_isolation),
                        experimental.index(pre_attach_scope))
        pre_attach_patch = (ROOT / "patches/iwa" / pre_attach_scope).read_text(
            encoding="utf-8"
        )
        self.assertIn("guest->GetViewType() != extensions::WebViewGuest::Type",
                      pre_attach_patch)
        self.assertIn("-  if (!guest || !guest->attached()", pre_attach_patch)
        self.assertEqual(pre_attach_patch.count("diff --git "), 1)

    def test_direct_sockets_is_a_separate_optional_patch(self):
        ordinary = series_paths((ROOT / "patches/series").read_text(encoding="utf-8"))
        experimental = series_paths(
            (ROOT / "patches/iwa/series").read_text(encoding="utf-8")
        )
        sockets = Path("0051-enable-frame-direct-sockets-for-android-iwas.patch")
        controlled_frame = Path(
            "0036-preserve-controlled-frame-runtime-boundaries-on-android.patch"
        )

        self.assertNotIn(sockets, ordinary)
        self.assertLess(experimental.index(controlled_frame), experimental.index(sockets))
        patch = (ROOT / "patches/iwa" / sockets).read_text(encoding="utf-8")
        self.assertIn("direct_sockets/direct_sockets_service_impl.cc", patch)
        self.assertIn("SetDirectSocketsForceDisabled();", patch)
        self.assertNotIn("diff --git a/chrome/browser/controlled_frame/", patch)
        self.assertNotIn("diff --git a/chrome/browser/web_applications/", patch)

        setting_test = Path(
            "0052-test-android-iwa-direct-sockets-content-setting.patch"
        )
        scheme_fix = Path(
            "0053-register-isolated-app-content-setting-pattern-on-android.patch"
        )
        self.assertNotIn(setting_test, ordinary)
        self.assertNotIn(scheme_fix, ordinary)
        self.assertLess(experimental.index(sockets), experimental.index(setting_test))
        self.assertLess(experimental.index(setting_test), experimental.index(scheme_fix))
        test_patch = (ROOT / "patches/iwa" / setting_test).read_text(
            encoding="utf-8"
        )
        fix_patch = (ROOT / "patches/iwa" / scheme_fix).read_text(
            encoding="utf-8"
        )
        self.assertIn("ExplicitBlockAppliesOnlyToOneIwaOrigin", test_patch)
        self.assertIn("AboutBlankSubframeOfBlockedIwaIsBlocked", test_patch)
        self.assertIn("BlobSubframeOfBlockedIwaIsBlocked", test_patch)
        self.assertIn("NonIwaOriginIsRejected", test_patch)
        self.assertIn("BUILDFLAG(IS_DESKTOP_ANDROID)", fix_patch)
        self.assertIn("GetNonWildcardDomainNonPortSchemes", fix_patch)
        self.assertIn("webapps::kIsolatedAppScheme", fix_patch)
        self.assertNotIn("diff --git a/chrome/browser/controlled_frame/", fix_patch)
        self.assertNotIn(
            "xenon-test-block-iwa-direct-sockets",
            "".join(
                (ROOT / "patches/iwa" / path).read_text(encoding="utf-8")
                for path in experimental
            ),
        )


    def test_direct_sockets_delegate_checks_committed_origin(self):
        patch = (
            ROOT / "patches/iwa/0051-enable-frame-direct-sockets-for-android-iwas.patch"
        ).read_text(encoding="utf-8")
        delegate = patch.split(
            "diff --git a/chrome/browser/direct_sockets/chrome_direct_sockets_delegate.cc"
        )[1].split("\ndiff --git ")[0]
        added = [line[1:] for line in delegate.splitlines() if line.startswith("+")]
        self.assertIn(
            "  const url::Origin& origin = rfh.GetLastCommittedOrigin();", added
        )
        self.assertIn(
            "  if (origin.scheme() != webapps::kIsolatedAppScheme) {", added
        )
        self.assertIn("  const GURL url = origin.GetURL();", added)
        # The URL-based lookup let about:blank / blob: subframes bypass BLOCK.
        self.assertFalse(any("rfh.GetLastCommittedURL()" in line for line in added))
        self.assertLess(
            added.index("  if (origin.scheme() != webapps::kIsolatedAppScheme) {"),
            added.index("  const GURL url = origin.GetURL();"),
        )

    def test_iwa_series_is_contiguous_and_matches_files(self):
        experimental = series_paths(
            (ROOT / "patches/iwa/series").read_text(encoding="utf-8")
        )
        on_disk = sorted(p.name for p in (ROOT / "patches/iwa").glob("*.patch"))
        self.assertEqual(sorted(str(p) for p in experimental), on_disk)
        self.assertEqual(
            [str(p)[:4] for p in experimental],
            [f"{n:04d}" for n in range(1, len(experimental) + 1)],
        )
        self.assertEqual(len(experimental), 65)

    def test_disposable_probes_live_outside_tests_and_series(self):
        experimental = {
            str(p)
            for p in series_paths(
                (ROOT / "patches/iwa/series").read_text(encoding="utf-8")
            )
        }
        self.assertEqual(list((ROOT / "tests").rglob("*.patch")), [])
        probes = sorted((ROOT / "tools/emulator-probes").rglob("*.patch"))
        self.assertEqual(len(probes), 26)
        self.assertTrue((ROOT / "tools/emulator-probes/README.md").is_file())
        self.assertFalse(experimental & {p.name for p in probes})


if __name__ == "__main__":
    unittest.main()
