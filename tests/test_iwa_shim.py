import unittest
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
SHIM = ROOT / "launcher/kitchen-sink"
ANDROID = "{http://schemas.android.com/apk/res/android}"


class IwaShimTests(unittest.TestCase):
    def test_launcher_is_separate_and_has_home_screen_entry(self):
        manifest = ElementTree.parse(SHIM / "AndroidManifest.xml").getroot()
        self.assertEqual(manifest.attrib["package"], "org.agent54.xenon.iwa.kitchensink")
        activity = manifest.find("application/activity")
        self.assertEqual(activity.attrib[ANDROID + "exported"], "true")
        actions = [node.attrib[ANDROID + "name"] for node in activity.findall("intent-filter/action")]
        self.assertEqual(actions, ["android.intent.action.MAIN"])

    def test_launcher_uses_only_explicit_app_id_entry(self):
        source = (
            SHIM / "src/org/agent54/xenon/iwa/kitchensink/LauncherActivity.java"
        ).read_text(encoding="utf-8")
        self.assertIn("new ComponentName(BROWSER_PACKAGE, BROWSER_ACTIVITY)", source)
        self.assertIn("launch.putExtra(EXTRA_APP_ID, KITCHEN_SINK_APP_ID)", source)
        self.assertIn('"idgjjoiemckfcohgjoaafbninphmambh"', source)
        self.assertNotIn("isolated-app://", source)
        self.assertNotIn("Intent.ACTION_VIEW", source)


if __name__ == "__main__":
    unittest.main()
