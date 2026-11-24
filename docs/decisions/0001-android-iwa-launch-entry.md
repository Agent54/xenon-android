# Android IWA launch entry

Status: experimental, app-ID handoff validated on two real devices; lifecycle incomplete

The experimental `org.agent54.xenon.iwa` package exposes
`org.chromium.chrome.browser.webapps.IwaLauncherActivity` with action
`org.agent54.xenon.iwa.LAUNCH` and one extra,
`org.agent54.xenon.iwa.APP_ID`. Callers supply only an installed web-app ID;
the browser never accepts a URL, scope, bundle path, name, or display mode
from the external launch intent. The browser resolves those fields from its
profile's ready web-app registry, checks that the entry is an installed IWA,
and then constructs a fresh intent to its non-exported `WebappActivity`.

The entry refuses launch until Helium's first-run flow has been completed.
It refuses off-the-record profiles, a disabled IWA feature, unknown or
uninstalled IDs, and identity/scope mismatches. A registry wait is bounded,
and a failed activity handoff is logged rather than counted as a successful
launch. The Java activity is weakly held across the native registry wait.

This entry is deliberately separate from Android VIEW navigation. A failed
standalone launch must not cancel an ordinary browser navigation. The
existing Android IWA update-application guard stays in place. Patch 0032
counts non-destroyed `WebappActivity` instances carrying this entry's app-ID
marker, patch 0038 requests `finish()` only for matching activities, and patch
0039 reserves pending launches across registry resolution and Android handoff.
Recreation and closure notifications still need end-to-end tests;
posting an intent or calling `finish()` is not proof that a window opened or
closed. See [decision 0004](0004-android-iwa-window-quiescence.md).
On the Samsung SM-X710 and Pixel 10 Pro XL, a signed Kitchen Sink IWA installed
in the separate experimental package and this entry cold-started its private
`WebappActivity`. On Pixel, an unknown app ID and wrong action returned to the
Android launcher without opening a new IWA activity. These checks do not
verify pending-launch tracking or closure notifications. The separate
`org.agent54.xenon.iwa.kitchensink` home-screen shim now points only to this
app-ID-only entry and cold-launched on both devices and the emulator.
