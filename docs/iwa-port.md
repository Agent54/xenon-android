> **Experimental / WIP — IWA updates intentionally fail-closed (patch 0025); not a release build.**
> Patch 0025 was numbered 0026 before the public export renumbered the series.

# Experimental Android IWA overlay

**Patch numbering.** The public export renumbered `patches/iwa/series` to a
contiguous 0001–0065 (the old series had no 0006). Former patches 0007–0066
are now 0006–0065, and every patch number in these docs, the decision
records, `issues/` and `tools/emulator-probes/` uses the new numbering.
Disposable emulator probe patches moved from `tests/fixtures/` to
[`tools/emulator-probes/`](../tools/emulator-probes/README.md).

**Direct Sockets origin gate.** On desktop Android, patch 0051 checks the
requesting frame's committed *origin* (`GetLastCommittedOrigin()`), rejects
any non-`isolated-app` origin, and looks up `DIRECT_SOCKETS` for
`origin.GetURL()`. An earlier revision used the frame's URL, which let an
`about:blank` or `blob:isolated-app://…` subframe of a BLOCKed IWA be
evaluated under its own URL and escape the BLOCK. Patch 0052 adds
regression tests for both cases.

For a concise, standalone overview of the patch set, launch flow, verified
behavior, and remaining gaps, see the [HTML write-up](android-iwa-port.html).

The optional `patches/iwa/series` is applied **after** Helium and Xenon's
ordinary Android compatibility tier. It is being ported to the pinned
Chromium 154.0.8037.57 / Helium source, not replayed from the older tree.
The series keeps capabilities distinct: patches 0001–0033 establish core IWA
and its app-owned launch entry; 0034–0036 add Controlled Frame; 0051 is the
separate, optional Direct Sockets port. Patches 0037–0049 cover Android
activity/update-safety infrastructure, and 0050 adds portable entitlement
tests. Direct Sockets is not required to install or launch a packaged IWA.
The early patches expose existing IWA runtime and scheme code to Chromium's
desktop-Android configuration, adapt Helium's sync-vault API GN dependency
for extensions-core, and link the corresponding web-app code and resources.
Web-app test targets are temporarily excluded from the Android graph; this
also drops portable IWA tests and must be narrowed before sign-off.

This is an incomplete port. The patch series applies against the pinned
Helium-plus-Xenon source and builds `chrome_public_apk` for arm64 and x86-64
with `is_desktop_android=true`. Android-specific extension, OS-integration,
and UI boundaries deliberately reject unsupported operations. A signed bundle
installs, launches from a separate app-owned shim, and renders Controlled Frame
on an Android 16 emulator and both real test devices. Complete activity
lifecycle handling and security validation remain unfinished. Never replace
the working `org.agent54.xenon` browser with this experiment.

Run `scripts/build.sh CHROMIUM_SRC HELIUM_TREE --experimental-iwa` only in a
fresh isolated checkout. It uses `out/XenonAndroidIwa` and applies the IWA
series after the ordinary Android series. Its experimental package name is
`org.agent54.xenon.iwa`, so it cannot replace the working browser package.
Patch 0033 also gives this experimental build its own Android debug-flag file,
`/data/local/tmp/xenon-iwa-command-line`; it no longer reads the working
browser's `/data/local/tmp/chrome-command-line`. This is a lab install boundary,
not a release-time IWA installation design (see [decision 0002](decisions/0002-experimental-iwa-debug-flags.md)).
Without that option, the existing browser build and its GN arguments are
unchanged. IWA developer mode,
unmanaged installation, and the content IWA feature retain Chromium's
disabled defaults in the experimental overlay; lab tests must opt in
explicitly rather than shipping untrusted installation by default.

## Source and review boundary

The prior Android IWA work is `agent54/android-iwa` at repository commit
`9817bed` (183 patches on stock Chromium 151 base
`e6a3b1b1e9f09b1504099c299fb3e9b05ef1a883`). It achieved standalone IWA
and Controlled Frame behavior on its emulator, but it is **reference
material**, not a drop-in dependency: a dry-run replay against this Helium
154 tree already fails at patch 0003, and 60-plus later patches have rejected
hunks or changed contexts. Many of those are intermediate build experiments
that later patches reverse. Xenon's overlay ports final behavior deliberately
instead of importing the entire historical sequence.

The earlier stock-Chromium build also displayed the packaged IWA Kitchen Sink
on the Samsung tablet and Pixel through a separate launcher APK. That launcher
sent a hard-coded `isolated-app://` VIEW intent to Chromium. Those device
screenshots establish that the prior Chromium route worked; they do not
validate this newer Helium-based Xenon port or its app-ID-only launch entry.

Independent review of the older series found these gates for the port:

- Keep untrusted developer install disabled by default. The old patch 0175
  enabled it automatically on desktop Android.
- Track real Android IWA activity windows before enabling update application.
  Old patch 0168 always reported zero windows even after patch 0183 created
  standalone windows, allowing updates while an app remained open.
- Replace the old patch 0173 eight-second delayed install task holding a raw
  `Profile*` with a provider-ready, lifetime-bound operation.
- Do not cancel a browser navigation until standalone launch has actually
  succeeded; old patch 0183 reported success before the Java activity result.
- Finish install/uninstall callbacks, packaged-bundle install UI, and an
  independent app shim. The old standalone activity alone is not a launcher.
- Review old patch 0178's shared URL-loading failure path before porting it;
  a parser failure must not forward a response lacking parsed headers.
- The older Chromium 151 series opened full `app_service`, publishers, and
  link-capturing targets. The current APK dependency graph contains none of
  those targets, so this port leaves their Android assertions intact. If a
  later runtime slice requires them, inspect the exact dependency path and
  prefer a narrow shared target over importing desktop publishers wholesale.
- The Android UI boundary completes unsupported-operation callbacks with
  failure. Patch 0032 counts live IWA document activities by installed app ID,
  including backgrounded activities. Patch 0038 requests `finish()` only for
  matching activities. Patch 0039 reserves pending launches across registry
  lookup and Android handoff. Destination recreation and deferred close
  notifications remain unimplemented. The scheduler still rejects IWA update
  application until the complete lifecycle is verified.
- Chromium 154's web-app storage garbage collector waits for extension
  readiness, holds an extension-install gate, and preserves registered extension
  storage paths. An empty extension-manager stub could delete live extension
  partitions. The experimental Android overlay now disables that collector;
  keep it disabled until the adapter preserves those guarantees.
- The temporary Android guard around web-app test targets also suppresses
  portable IWA trust, URL-loader, and update tests. Restore an Android-safe
  subset before calling the port validated.

Before this APK could replace the working baseline, validate bundle install
and cold app-shim launch, `crossOriginIsolated`, Controlled Frame, uninstalled
and malformed `isolated-app://` origins, ordinary-web/cross-app isolation,
incognito/custom-tab/guest-frame routing, failed launch recovery, update
deferral with an open IWA, and ordinary Helium browser/privacy behavior.

## Runtime smoke test, 2026-09-24

Patches 0026–0030 start command-line install after Android profile
initialization, register IWA services before profile creation, and enable the
isolated-app loader, scheme, storage partition, navigation throttle, required
headers, and permissions-policy hooks for desktop Android. Chromium 154's
`MaybeInstallIwaFromCommandLine` owns profile keep-alives and waits for the
web-app registry; no fixed-delay task is used.

The separate `org.agent54.xenon.iwa` APK built for arm64 and x86-64. On the
Android 16 x86-64 emulator, the file-install switch successfully installed two
signed bundles from the experimental browser's own app storage. Both rendered
from their `isolated-app://` origins. The IWA Kitchen Sink bundle, whose
manifest requests `cross-origin-isolated`, reported `isSecureContext=true`,
`crossOriginIsolated=true`, and `SharedArrayBuffer` available. The simpler
`hello-xe` fixture rendered but reported `crossOriginIsolated=false` because
its manifest does not request that policy. This is an emulator smoke test, not
a security sign-off.

The arm64 experimental APK is installed beside the ordinary Xenon browser on
the Samsung SM-X710 tablet and Pixel 10 Pro XL. With the user's explicit
authorization, Helium's first-run Terms were accepted on both; the optional
notification permission was declined. The signed Kitchen Sink bundle then
installed successfully on both from their experimental private files, using
the one-time command-line installer. That installer switch was removed after
installation, leaving only the experimental IWA feature switches. The original
shared `/data/local/tmp/chrome-command-line` file was backed up and restored
on the tablet after an earlier attempted install. Its SHA-256 on both devices
remained `1c4df3c7d99afc27dc42245a6ee8c31e1ddb6ea1fe9a770919322494f461b76c`
after the dedicated-file test.

The exported Android VIEW intent does not open an installed IWA as a
standalone app. The emulator IWA opened through an internal DevTools target,
which proves rendering but not the app-shim flow. Patch 0031 introduces an
app-ID-only launch entry, with native registry resolution and first-run
gating (see [decision 0001](decisions/0001-android-iwa-launch-entry.md)).
The emulator has not completed Helium's first-run flow. On both real devices,
the app-ID-only intent cold-started Xenon's `WebappActivity` and rendered the
signed Kitchen Sink IWA without the one-time installer switch. A wrong action
and unknown app ID returned the Pixel to its launcher without opening a new
IWA activity. The separate home-screen Kitchen Sink shim also cold-launched
the IWA on both devices and the emulator. These checks verify the
experimental handoff, not the full Android activity lifecycle. Patch 0032 adds a count of
non-destroyed IWA `WebappActivity` instances keyed by the shim's app-ID marker;
the focused Java test covers foreground, stopped, destroyed, and unrelated
web-app activities. Patch 0038 adds a best-effort close request that calls
`finish()` only on matching activities. It does not synchronously destroy a
window, remove the task from Recents, or prevent a pending launch or
recreation. All-windows-closed notification still needs implementation and
runtime verification.

The focused Java test target compiles. Initially Chromium's full Robolectric
runner stopped in an unrelated `components/url_formatter` compile because its
Robolectric toolchain did not generate `device/vr/buildflags/buildflags.h`.
Patch 0037 adds that test-toolchain dependency. The runner then built and
`WebappActivityTest.iwaWindowCountTracksActivityUntilDestroyed` passed on the
lab builder (one test run, one pass). This covers the activity-count method,
not pending launches, close requests, or update handoff.
The patch 0032 `chrome_public_apk` builds completed for arm64 and x86-64,
including Java lint and Error Prone; both APK signatures verified with
Android APK Signature Scheme v2. The reviewer's read-only re-review found no blocking
issue while the update guard remains enabled.

On the emulator, the patch 0031 shim accepted the Android intent shape but
rejected launch before native startup because first run is incomplete. Both
the known installed Kitchen Sink app ID and an arbitrary ID reached this
gate; a wrong action was rejected as an invalid request. No standalone
`WebappActivity` appeared. This checks the pre-consent failure boundary only,
not successful launch or post-consent unknown-ID behavior.
The patched `chrome_public_apk` target built cleanly for both arm64 and
x86-64, including Java lint and Error Prone checks. The x86-64 APK was
installed as an upgrade on the emulator without clearing its app data.

## Current experimental status, 2026-09-24

First run is now complete on the emulator and both real devices, with the
user's authorization to accept Helium's terms; optional notifications were
declined. The signed Kitchen Sink bundle is installed in all three separate
experimental profiles. Patch 0033 gives `org.agent54.xenon.iwa` its own
command-line file. The normal browser's shared file was not changed during
testing. The ordinary `org.agent54.xenon` package remains installed beside
the experimental package on both real devices.

The home-screen shim in `launcher/kitchen-sink` is a third Android package,
`org.agent54.xenon.iwa.kitchensink`. It holds only the fixed Kitchen Sink app
ID and explicitly starts patch 0031's browser-owned launcher. It does not
pass an `isolated-app://` URL or install a bundle. Build it with
`scripts/build_iwa_shim.sh` and an external test keystore; never commit the
APK or signing key. A debug-key-signed shim was installed on the emulator,
Samsung SM-X710, and Pixel 10 Pro XL. Launching this package after force
stopping the experimental browser reached its installed-IWA `WebappActivity`
on all three. The Pixel's running IWA task was also moved onto its VITURE
Beast 1920×1080 external desktop display and visually verified there.

Kitchen Sink's initially blank Controlled Frame was a missing code port,
not a missing flag. The previous stock-Chromium build rendered the Google
guest with the same IWA feature switches. Optional patches 0034–0036 now
compile/register Controlled Frame and retain its Android permission, origin,
partition, media, teardown, and failure gates (see
[decision 0003](decisions/0003-android-controlled-frame-boundaries.md)).
The Android 16 emulator and both real devices now visibly render Google
inside the signed Kitchen Sink IWA's Controlled Frame. On the emulator,
`HTMLControlledFrameElement` and `insertCSS` are present in the IWA, while a
separate ordinary HTTPS page lacks the custom element. A valid relative
IWA script loads into the frame; cross-origin HTTPS, another IWA origin,
and a same-origin `blob:` wrapper fail without killing the browser. The reviewer
found no blocker for experimental device testing after the outer-scheme
guard was added.

On the emulator, disabling only the experimental browser package and opening
the separate shim returned safely to the launcher; the browser was then
re-enabled. The separately installed, signed `Hello Xe Computer` IWA has no
Controlled Frame manifest permission. Its isolated-app page reported no
`controlledframe` custom element and a created element was an ordinary
`HTMLElement`, despite being a secure context.
An audio `getUserMedia` request from Google inside the emulator guest returned
`NotAllowedError` while Android `RECORD_AUDIO` remained ungranted; this is a
denial check, not proof of the full embedder-consent flow. Navigating from
Controlled Frame back to Direct Sockets removed the guest's DevTools target.
In the same experimental browser profile, a temporary `localStorage` marker
set by the Google Controlled Frame was absent from an ordinary Google tab.
The marker was removed afterward. This checks one guest-to-tab partition
boundary on the emulator, not persistent or cross-app isolation.

This is not production sign-off. Embedder-consent media behavior, broader
partition isolation, context-menu cleanup, and app-removal races still need
runtime coverage; the launcher failure path should also be checked on a real
device if safe. Track pending and live activity windows, close requests, and
all-windows-closed notifications before removing the IWA update guard. The old
navigation-capture patch's premature tab cancellation must not be ported.
General navigation capture remains a later slice.

The patch 0038 close-request test failed first because the method did not
exist, then passed after implementation. The full `WebappActivityTest` class
passed all seven cases under Robolectric, including count-until-destroyed,
repeat close, and isolation from ordinary and other-app activities. The reviewer
found no blocking source issue for this narrow best-effort request with the
update guard retained; the review did not verify device behavior. The
`chrome_public_apk` target built for x86-64 and arm64, including Java lint and
Error Prone. This APK revision has not been installed on the real devices.

Patch 0039 reserves an app ID before asynchronous registry resolution, marks
the private Android activity handoff, and retains that reservation until the
destination `WebappActivity` accepts it. UUID tokens avoid a restored launcher's
old token aliasing a new process's reservation. A restored launcher whose
reservation is already handed off or missing ends its request rather than
duplicating the launch. Nine focused `WebappActivityTest` cases pass under
Robolectric, including two pending-launch tests; the full Java build passed
without a NullAway warning. The reviewer found no blocker for this narrow slice,
but destination recreation and update-waiter coordination remain unresolved.
Patch 0039 is not installed on either real device, and the update guard stays
enabled.

Patch 0040 counts an IWA activity's configuration-change replacement between
the old activity's destruction and the new activity's `CREATED` notification.
It restores a UUID from saved instance state through Chromium's pre-create
hook, so the matching replacement alone consumes the reservation. The focused
test was red before implementation and now covers the destroy/create gap,
automatic listener consumption, and a wrong-app replacement. This is a
fail-closed in-process count, not an update-ready quiescence lease; the
all-windows-closed callback and update coordination are still absent. The
patch 0040 x86-64 APK upgraded the emulator in place and the app-owned shim
still launched the packaged Kitchen Sink IWA. Emulator rotation kept the IWA
visible, but the activity handles rotation itself, so that did not verify
recreation. A per-app locale switch instead triggered Chromium's intentional
process kill on OS locale change; the original empty locale override and
portrait orientation were restored, and a fresh shim launch worked. Real
Android recreation remains to be verified with an appropriate trigger.
Both x86-64 and arm64 `chrome_public_apk` builds passed, including Java lint
and Error Prone; all ten focused `WebappActivityTest` Robolectric cases and
all fourteen repository tests passed. The patch 0040 APK has not been
installed on either physical device.

Patch 0041 introduces an app-ID-specific Java close waiter that counts
pending launches, recreation reservations, and all non-destroyed IWA
activities. It holds the listener while waiters exist, destroys a cancelled
one-shot JNI callback, and rechecks each waiter after earlier callback
reentrancy. It does not yet replace the native UI manager's immediate
`NotifyOnAllAppWindowsClosed()` callback or the update waiter's zero-window
shortcut. Registration can complete synchronously; the future native bridge
must own a preassigned waiter ID before calling Java, cancel outstanding IDs
at shutdown, and test that synchronous callback reentrancy. All sixteen
focused `WebappActivityTest` Robolectric cases and fourteen repository tests
passed for this Java-only slice. The update guard remains enabled.

Patch 0042 gives the native Android UI manager preassigned waiter IDs and
owns each user callback before Java registration. It cancels unused Java JNI
wrappers on shutdown; Java rejects duplicate IDs without replacing the
original callback. The new Java tests were red before implementation and
cover synchronous completion and duplicate-ID rejection. Direct native
manager self-destruction and shutdown tests remain to be added, so this is
experimental lifecycle plumbing rather than release validation. The update
waiter's zero-window shortcut and patch 0025's update guard remain unchanged.
All eighteen focused `WebappActivityTest` Robolectric cases and fourteen
repository tests pass. Both x86-64 and arm64 `chrome_public_apk` builds pass,
including Java lint and Error Prone; the arm64 APK verifies with v2 signing.
The x86-64 APK upgraded the lab Android 16 emulator in place, where a cold
app-owned Kitchen Sink shim launch again reached `WebappActivity`. Patch 0042
has not been installed on either physical device.

Patch 0043 extracts the native close-callback ownership into a small
Android-only bridge with injectable registration and cancellation boundaries.
Seven native tests pass on the lab Android 16 emulator: synchronous
completion destroying its owner, shutdown and destructor cancellation, late
completion after destruction, independent multiple waiters, cancellation
reentrancy (including owner destruction and attempted registration), and
registration rejection after shutdown. This is focused native evidence, not
a full JNI/UI-manager integration test. Both x86-64 and arm64 browser APKs
build; the arm64 APK verifies with v2 signing. The x86-64 APK upgraded the
lab Android 16 emulator in place, and a cold app-owned shim launch rendered
Kitchen Sink again (screenshot `$TMPDIR/xenon-iwa-0043-emulator.png`).
No physical device was changed for this slice. The update guard and
zero-window shortcut remain.

The next update slice needs a nonblocking Java launch/update lease at the
common scheduler admission point, not merely removal of the zero-window
shortcut. Persisted startup applies bypass that waiter, and waiting inside a
queued apply can deadlock an IWA resource load. See decision 0004 for the
deferral and staged-update preservation contract.

Patch 0044 adds the Java side of the app-ID update lease but does not enable
updates. The first four lease behavior tests failed to compile before the API
was added; all twenty-four focused `WebappActivityTest` cases then passed under
Robolectric, including app-specific launch rejection, pending handoff and
recreation, stopped/finishing activities, stale-token release, close-callback
reentrancy, and a launcher-level check that a leased app exits before browser
startup. Native
lease ownership, scheduler admission, deferral, and real-device deployment
remain future work.
Both x86-64 and arm64 `chrome_public_apk` builds passed Java lint and Error
Prone; the arm64 APK verified with v2 signing. The x86-64 APK upgraded the lab
Android 16 emulator in place, and a cold app-owned shim launch again rendered
Kitchen Sink in `WebappActivity` (screenshot
`$TMPDIR/xenon-iwa-0044-emulator.png`).

Patch 0045 adds a testable native RAII update-lease owner. Its focused native
tests failed at the missing-header seam before implementation. A later
acquisition-mutation regression failed before copying the app ID at method
entry. All six native tests then passed on the lab Android 16 emulator,
including denial, exact-once release, other-app independence, reentrant
destruction, and caller storage mutation. The existing twenty-four focused
Java lifecycle tests also passed. The reviewer found no source-level blocker for
this guarded slice. Java exposes the same lease operations to
generated JNI, but no native update command calls them yet. The focused
standalone target deliberately keeps the JNI adapter out to avoid linking
the entire browser JNI registration set. Update guard patch 0025 remains.
Both x86-64 and arm64 `chrome_public_apk` builds passed Java lint and Error
Prone; the arm64 APK verified with v2 signing. The x86-64 APK upgraded the
lab emulator in place, and a cold shim launch again rendered
Kitchen Sink in `WebappActivity` (screenshot
`$TMPDIR/xenon-iwa-0045-emulator.png`). No 0045 APK has been installed
on a physical device.

Patch 0046 adds the production Android JNI adapter for the update lease to
the browser's `web_applications` target. Both x86-64 and arm64 APKs compile
and link; the arm64 APK verifies with v2 signing. The x86-64 APK upgraded the
lab emulator in place, and a cold shim launch still rendered Kitchen Sink
in `WebappActivity` (screenshot `$TMPDIR/xenon-iwa-0046-emulator.png`).
The adapter is not called by an update command. A temporary emulator-only
probe in `AndroidWebAppUiManager::Start()` exercised native acquisition,
same-app denial, release, and reacquisition through generated JNI and Java;
its `XENON_IWA_JNI_PROBE_PASS` log marker was observed. The probe was removed,
the normal x86-64 APK rebuilt and reinstalled, and a cold app-owned shim launch
again rendered Kitchen Sink in `WebappActivity` (screenshot
`$TMPDIR/xenon-iwa-0046-restored.png`); the probe marker was absent from
that launch. An `Unknown API browserAction` extension-renderer fatal appeared
on both probe and restored launches while Kitchen Sink remained visible. A
separate cold launch of the experimental browser's ordinary
`ChromeTabbedActivity` on the same emulator also logged the fatal without the
IWA shim; the shim subsequently reopened Kitchen Sink in `WebappActivity`.
This narrows the symptom to browser startup rather than the JNI probe or IWA
launch path, but its cause and impact remain unestablished. This JNI round trip
is not an update-command or update-lifetime test. Patch 0025 continues to
reject Android update application.

Patch 0047 adds a standalone, testable prioritized-update callback
coordinator. A focused Android-native test reproduced the lost synchronous
completion callback before the ordering fix, then passed; all four focused
cases pass on the lab Android 16 emulator. Both x86-64 and arm64 browser APKs
build. It is not yet connected to the update manager after review found
additional observer-reentrancy and shutdown lifetime hazards. It has not been
installed on physical devices and does not enable updates; patch 0025 remains.

Patch 0048 adds detached callback batches and shutdown cancellation to that
still-unwired helper. The added native behavior tests failed to compile before
implementation; a callback-destructor reentrancy case then crashed before the
shutdown fix. All ten focused cases pass on the lab Android 16 emulator.
The arm64 helper target compiles and the x86-64 browser APK builds. This does
not fix the live update-manager race or enable Android IWA updates, and no
physical device was changed.

## Physical-device launcher recheck, 2026-09-25

Both the Samsung SM-X710 and Pixel 10 Pro XL remained reachable over ADB Wi-Fi
with the ordinary browser, experimental browser, and app-owned Kitchen Sink
shim installed. Both retained the original shared
`/data/local/tmp/chrome-command-line` SHA-256
`1c4df3c7d99afc27dc42245a6ee8c31e1ddb6ea1fe9a770919322494f461b76c`.
With the tablet launcher foregrounded, an explicit intent to the experimental
`IwaLauncherActivity` with a wrong action returned to the launcher. A valid
action with an unknown, well-formed app ID did the same. The pre-existing
`WebappActivity` record remained the only IWA activity record; neither request
created another. Launching the separate Kitchen Sink shim then resumed the
installed IWA's `WebappActivity` on the tablet and Pixel. The tablet screen
visibly showed Kitchen Sink with Google's Controlled Frame. The Pixel was at
its biometric lock screen when woken, so this recheck establishes its Android
activity state but does not establish visible rendering there; earlier unlocked
Pixel checks did. No package, app data, or shared flag file was changed. These
are bounded checks of the older APK already installed on the physical devices,
**not** validation of patches 0043–0048, cold-start behavior, or update safety.

Patch 0049 closes a reviewer-identified destructor path in the still-unwired
update callback coordinator. A focused emulator test failed before the fix
(`starts=2`, no shutdown error), then all eleven coordinator tests passed after
the destructor called its existing `Shutdown()` method. The x86-64 and arm64
helper targets compile. No production update-manager integration or physical
APK was changed, and patch 0025 still rejects Android update application.

Patch 0050 restores a narrow Android-native runner for Chromium's existing
portable IWA entitlement tests. The source-set test compiled on the lab, then
the standalone x86-64 and arm64 test APKs built, and both
`IwaEntitlementsTest` cases passed on the x86-64 Android 16 emulator. They
cover Controlled Frame's entitlement
mapping and whether permissions-policy features require an isolated context.
This is test coverage only; it does not restore the broader web-app or
Controlled Frame browser-test targets excluded by patches 0008 and 0034.
The physical browser APKs and update guard were not changed.

An attempted Android-native runner for Chromium's Controlled Frame
permission-enum audit built on the lab but failed on the Android 16 emulator:
Helium adds `ContentSettingsType::HELIUM_NOISE`, which the upstream vetted
list does not include. A temporary allowlist entry made the one audit pass
and both x86-64 and arm64 test APKs build, but an independent review found its stated
isolation justification unsound. Helium reads that setting from the profile's
`HostContentSettingsMap` and derives noise tokens from browser-context-wide
state and origin, without an evident guest-partition or owning-IWA key. At
that point the guest-visible behavior was untested, so this was a
source-supported cross-context linkage risk rather than a proven exploit.
The allowlist and runner were withdrawn from the patch series; patch 0050
remains the last committed test slice. See
[the Controlled Frame boundary decision](decisions/0003-android-controlled-frame-boundaries.md).

An emulator CDP follow-up reproduced the canvas part of that risk: an ordinary
Google tab and two same-origin Controlled Frame guests (default and a second
ephemeral partition) returned identical, repeatable canvas pixel and data-URL
hashes, while an ordinary `example.com` tab differed. The ephemeral guest's
`localStorage` marker was invisible to the default guest and ordinary Google
tab, so this was not simply a shared storage partition. The marker, added
guest, and ordinary tabs were removed. Profile exception propagation and
audio-token linkage are still untested; see decision 0003 for the boundary.

## Physical-device experimental APK refresh, 2026-09-25

The current arm64 `chrome_public_apk` target was rebuilt on the lab with no
remaining Ninja work. Its v2 signer certificate SHA-256
`32a2fc74d731105859e5a85df16d95f102d85b22099b8064c5d8915c61dad1e0`
matched the experimental APK previously installed on both physical devices.
The candidate APK SHA-256 was
`495a27f4b50c5b882d8a7bb6e11a20032472b0054d79665acf87ff783758904b`.
The previous APKs were backed up outside the repository, then the candidate
was installed with `adb install -r` as an in-place upgrade of only
`org.agent54.xenon.iwa` on the Samsung SM-X710 and Pixel 10 Pro XL. The
installed `base.apk` hash matched the candidate on each device. The ordinary
`org.agent54.xenon` browser and separate
`org.agent54.xenon.iwa.kitchensink` shim remained installed; the shared
`/data/local/tmp/chrome-command-line` SHA-256 remained
`1c4df3c7d99afc27dc42245a6ee8c31e1ddb6ea1fe9a770919322494f461b76c`
on both. No package data was cleared.

After force-stopping only the experimental browser, its app-owned Kitchen
Sink shim cold-launched `WebappActivity` on each device. The tablet visibly
rendered Kitchen Sink and Google's Controlled Frame (screenshot
`$TMPDIR/xenon-iwa-device-upgrade.lTkQaU/tablet-latest-controlled-frame.png`).
The Pixel's activity record showed the installed Kitchen Sink app ID, but
Android's keyguard covered the screen, so fresh visible rendering and
Controlled Frame on the upgraded Pixel were **not** verified. Earlier unlocked
Pixel and external-display checks used an older experimental APK. This
upgrade does not validate the still-unwired update coordinator or lift patch
0025's Android update guard.

## Direct Sockets red test, 2026-09-25

The installed Kitchen Sink manifest requests `direct-sockets` and
`direct-sockets-private` for `self`. On the lab Android 16 emulator, CDP
confirmed that the packaged page was secure and cross-origin isolated, and
its document policy allowed `direct-sockets`. Nevertheless `TCPSocket`,
`TCPServerSocket`, and `UDPSocket` were all `undefined`. The new
`scripts/probe_iwa_direct_sockets.mjs` reproduced this as a failing public-API
smoke check (exit 1). No sockets were opened, no external network target was
contacted, and no physical device was changed.

This is an Android source/build boundary, not a missing manifest key or
additional runtime flag: Chromium excludes the per-context feature,
`DirectSocketsServiceImpl`, its interface binders, and the Chrome delegate
from Android. See [decision 0005](decisions/0005-android-iwa-direct-sockets.md)
for the narrow frame-only port and positive/negative test sequence. This was
the red baseline before patch 0051.

Patch 0051 now ports frame-owned sockets as a separate optional capability.
On the lab Android 16 emulator, its first x86-64 test build made the same
public API probe green and Kitchen Sink exchanged TCP and UDP loopback bytes.
An ordinary HTTPS page and Controlled Frame guest had no constructors; the
signed Hello Xe IWA without policy rejected opening a TCP socket. The reviewer
review found a worker-exposure hazard in the first draft; the revised patch
prevents workers from inheriting the frame API while leaving worker binders
disabled. The revised x86-64 APK builds and still cold-launches Kitchen Sink,
A separate signed IWA worker fixture now confirms that the top-level page has
all three Direct Sockets constructors while its same-origin dedicated worker
has none and remains responsive. Permission/lifecycle negatives remain before
physical-device deployment or a support claim.
No physical APK was changed for this Direct Sockets work. See
[decision 0005](decisions/0005-android-iwa-direct-sockets.md).

A focused Android-native content-settings test then found that an explicit
`DIRECT_SOCKETS` BLOCK did not stick for an `isolated-app://` origin. The
browser startup scheme list had omitted `isolated-app` on Android, so the
origin could not form a valid content-settings pattern. Patches 0052–0053
add the red/green native test and register that scheme only in the optional
desktop-Android build. The test now passes, both ABI APKs build, and the
updated x86-64 emulator APK still launches Kitchen Sink through its shim with
Direct Sockets and Controlled Frame available. A temporary emulator-only
browser probe then set BLOCK through `HostContentSettingsMap`, confirmed the
delegate denied a public TCP listener with `InvalidAccessError`, reset the
setting, and restored the original flags and normal APK. The profile has no
leftover exception and the normal APK rebuilt byte-for-byte equal to its
pre-probe backup. This is bounded evidence, not a permanent regression harness
or a revocation test. The physical devices still run the earlier APK without
patches 0051–0054.

An additional emulator lifecycle probe held an accepted TCP connection open,
verified a byte marker reached the IWA, navigated its document to
`about:blank`, and observed the connection close within ten seconds. It
removed its temporary ADB forward. That probe exposed a separate warm-launch
bug: the app-owned shim focused the blank `WebappActivity` instead of
reopening the installed IWA. Optional activity-safety patch 0054 now uses a
registry-verified handoff token to navigate only when the current page is
outside the IWA scope. Its focused test and all 25 `WebappActivityTest` cases
pass. On the upgraded lab emulator, the shim reopened Kitchen Sink from
`about:blank`; tapping it again while Kitchen Sink was already in scope
preserved a page-local marker. No physical device received patch 0054.

A separate disposable-emulator content-setting probe then clarified what
"revocation" means for Direct Sockets. With an accepted TCP connection active,
setting `DIRECT_SOCKETS` to BLOCK through the browser content-settings API
denied a new listener but did **not** close the existing connection; it still
transferred a marker. The probe reset the setting, verified a new listener
opened, and restored the original experimental APK, dedicated command line,
and source byte-for-byte. The active-socket behavior matches the port's
open-time delegate check and needs an explicit production policy decision:
BLOCK currently prevents new sockets, not ongoing traffic. The test hook is
kept outside the patch series under
`tools/emulator-probes/iwa-direct-sockets-revocation/`. Physical devices were not
involved.

Two more disposable-emulator lifecycle probes covered outbound sockets. A
controlled host-loopback endpoint accepted a live `TCPSocket` from Kitchen
Sink; its connection closed when the IWA navigated to `about:blank`, and the
app-owned shim reopened the packaged page. Separately, a fresh signed IWA
fixture with explicit cross-origin-isolated and Direct Sockets policies began
an outbound request while Android's local-network consent prompt was visible.
Navigating away dismissed the prompt without a connection reaching the host;
the browser remained responsive and its app-ID launcher reopened the fixture.
The temporary installer switch was removed and the experimental emulator's
dedicated command line restored. These checks do not cover every simultaneous
permission race or any physical device.

## Direct Sockets Samsung tablet canary, 2026-09-25

The reviewed arm64 experimental APK (SHA-256
`10965c7a78cf467d35ba692cd32fae239d8e5a54379f4b112130aca8b2d79bab`)
was installed in place on the Samsung SM-X710 only. The immediately preceding
APK is backed up outside Git at
`$TMPDIR/xenon-iwa-device-upgrade.lTkQaU/ChromePublic-latest.apk` and its
hash matches the tablet's pre-upgrade `base.apk`. The candidate's v2 signer
matched the previously installed experimental signer, and its on-device
`base.apk` hash matched the candidate. Neither the ordinary browser nor the
Kitchen Sink shim was replaced; no package data was cleared. Both shared and
experimental command-line hashes remained unchanged. The Pixel retained its
prior experimental APK.

The app-owned shim visibly cold-launched Kitchen Sink. Its secure,
cross-origin-isolated page reported TCP, TCP Server, and UDP constructors.
An accepted TCP connection closed when the IWA navigated to `about:blank`,
and the shim reopened it. Google's Controlled Frame still rendered; its guest
had no socket constructors. A bounded Mac-host echo test exchanged TCP and
UDP markers over the tablet Wi-Fi path. The Mac listener bound only to its own
Wi-Fi address, and Android's local-network prompt was allowed only for this
experimental IWA. A final force-stop of that browser followed by the shim
again rendered Kitchen Sink. The probe removed its temporary ADB forwards;
screenshots and APK are under `$TMPDIR/xenon-iwa-tablet-canary.olQ9GJ/`.
See [decision 0005](decisions/0005-android-iwa-direct-sockets.md) for exact
hashes and limits. This is a canary, not production sign-off; the Pixel,
network-loss/background paths, update lifecycle, and privacy boundary still
need work.

## Direct Sockets Pixel canary, 2026-09-25

After the Samsung canary, the same reviewed arm64 experimental APK (SHA-256
`10965c7a78cf467d35ba692cd32fae239d8e5a54379f4b112130aca8b2d79bab`)
was installed in place on the Pixel 10 Pro XL as `org.agent54.xenon.iwa`.
Its pre-upgrade on-device `base.apk` matched the rollback copy at
`$TMPDIR/xenon-iwa-device-upgrade.lTkQaU/ChromePublic-latest.apk`
(SHA-256 `495a27f4b50c5b882d8a7bb6e11a20032472b0054d79665acf87ff783758904b`),
and the upgraded on-device `base.apk` matched the candidate. The ordinary
`org.agent54.xenon` browser, the Kitchen Sink shim, and package data were
not replaced or cleared. The shared and experimental command-line hashes
remained `1c4df3c7d99afc27dc42245a6ee8c31e1ddb6ea1fe9a770919322494f461b76c`
and `61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`.

With the Pixel unlocked, the app-owned shim visibly opened the packaged IWA.
Its page was secure and cross-origin isolated, with manifest and document
policy allowing Direct Sockets and all three TCP/TCP Server/UDP constructors
present. Google's Controlled Frame visibly rendered; its HTTPS guest had
all three socket constructors `undefined`. A bounded TCP and UDP echo test
against this Mac's Wi-Fi address (`<host-wifi-ip>`) passed. Android's
local-network prompt was allowed for this experimental IWA. An accepted
TCP connection closed when the page navigated to `about:blank`, and a warm
shim launch reopened the packaged page. A final experimental-browser
force-stop followed by the shim visibly cold-launched Kitchen Sink again.
The temporary ADB forward was removed, leaving pre-existing forwards intact.
Screenshots are under `$TMPDIR/xenon-iwa-pixel-canary.typBsM/`.

Both real-device canaries passed these bounded checks, but this is not a
production sign-off. Permanent browser-level BLOCK regression coverage,
network-loss/background behavior, broader permission races, safe IWA updates,
and Helium Controlled Frame fingerprint-noise isolation still need work.

A separate repeatable Android 16 emulator test,
`scripts/test_iwa_direct_sockets_background.mjs`, passed twice. A loopback
TCP connection accepted by Kitchen Sink transferred data while the page was
hidden after HOME; the app-owned shim then resumed the same page-local state.
The test removed its temporary ADB forward. This only checks a short live
background interval, not process reclamation, locked-screen idle, or network
loss.

The disposable BLOCK fixture gained a public-API assertion in
`scripts/test_iwa_direct_sockets_block.mjs`. On the lab emulator, the
normal APK opened a TCP listener and deliberately failed the `block`
expectation; the temporary test-only delegate patch then made that same
expectation pass with `InvalidAccessError` and its browser log marker.
The test-only source and flags were removed, the normal x86-64 APK was
rebuilt byte-for-byte equal to its backup and reinstalled, the profile had
zero `direct_sockets` exceptions, and the listener opened again. See
[decision 0005](decisions/0005-android-iwa-direct-sockets.md) for the
rollback hash. This is reproducible emulator evidence, not an always-run
production test target or a user-facing permissions control.

## Controlled Frame noise-isolation candidate, 2026-09-25

Patch 0055 is a separate experimental Controlled Frame privacy slice. The
Android 16 emulator exposed a legacy GuestView detail: its Google guest
navigated as a primary main frame, so a first implementation keyed on
`IsGuestViewMainFrame()` did nothing and ordinary/guest canvas hashes still
matched. Resolving the browser-owned GuestView from the navigation handle,
checking Controlled Frame ownership, and validating the owning IWA against
the prospective full partition config reached that guest. The clean x86-64
APK then gave different ordinary-tab and guest hashes at the same Google
origin. Both focused Android-native owner/partition and token tests passed.
The repeatable two-guest probe then gave three distinct, stable same-origin
canvas hashes for the ordinary tab and two actual guest partitions; the
ephemeral extra guest was removed after each run.
A separately signed disposable IWA from
`tests/fixtures/iwa-controlled-frame-noise/` then owned a second Google
Controlled Frame in the same emulator profile. The cross-app public probe
reported distinct, repeatable Google canvas hashes for the ordinary tab and
the guests owned by each IWA. The original dedicated emulator command line was
restored immediately after one-time fixture installation. This is bounded
cross-owner evidence, not a physical-device or privacy sign-off.
The same disposable Google guest retained its canvas hash across a document
reload; the probe reacquired the changed DevTools target ID. Full guest
teardown/recreation and browser restart remained untested at that point. A
subsequent named in-memory guest test removed the first Google Controlled
Frame, observed its DevTools target vanish, recreated a guest with the same
partition name, and got the same canvas hash with a new target. The temporary
guest was removed and Kitchen Sink returned to its original page. Browser
restart was tested separately below.
An emulator-only global-preference diagnostic temporarily set Helium noise off
inside the real browser preference check and restored it immediately. Logs
showed both ordinary and guest checks disabled noise, and the public probe
observed the same raw canvas hash in the ordinary Google tab and two Google
guests. The clean APK was rebuilt and reinstalled; distinct stable hashes
returned. The test-created explicit preference value was cleared through
`PrefService::ClearPref`, leaving the user preference unset as before. Both
diagnostic builds were removed; the clean APK and dedicated flags hashes were
verified. This is not an always-run regression or physical-device sign-off.
A separate emulator-only site-exception diagnostic stored a real Google
`HELIUM_NOISE` BLOCK in the experimental profile, restarted the browser in
no-mutation observe mode, and found the ordinary Google tab still disabled
noise while Google Controlled Frames in two signed IWAs still enabled it.
The public canvas probe confirmed one raw ordinary hash and two distinct,
stable guest hashes. The diagnostic cleared the exact exception through
Helium's API; the `helium_noise` map returned to `{}`. Normal flags and the
clean APK were restored, and a cold public probe again returned three distinct
hashes. No test-only code or setting remains on the emulator or physical
devices; this is not an always-run release test. See
[decision 0003](decisions/0003-android-controlled-frame-boundaries.md) for
the remaining security matrix. Patch 0055 is not a privacy sign-off.
Another clean-APK browser-process restart, with the normal flags and no site
exception, again produced three distinct, stable same-origin canvas hashes
for the ordinary Google tab and the two IWA guests. The user noise preference
remained unset and the exception map remained `{}`. Session hashes changed,
but the cross-context separation held.
An offline-audio public probe then rendered constant samples in the ordinary
Google tab and in Google Controlled Frames owned by two signed IWAs. Normal
features produced non-raw audio with three distinct, repeatable mean offsets.
Exact buffer hashes changed between renders because Helium adds coordinate
jitter, so the probe does not assert hash stability. Disabling only
`HeliumNoiseAudio` on the emulator made all three outputs exactly raw and
identical; restoring normal flags brought back the distinct offsets. The
original flags were reverified, and no microphone, speaker, recording
permission, or physical device was involved.

After an independent source review found no demonstrated bypass, its defensive
owner-null-check finding was fixed and the reviewed v2-signed arm64 APK was
installed in place on Samsung SM-X710, then Pixel 10 Pro XL. Both devices
cold-launched signed Kitchen Sink via the app-owned shim and rendered Google
inside Controlled Frame. A public canvas probe on each device measured an
ordinary Google tab, the existing Google guest, and a second ephemeral guest
partition twice: each device produced three distinct hashes, unchanged on
the second run. The installed APK SHA-256 was
`630492c6cbc668bdd8dbce627206a15706117573c1d36ddffff95d502e3b2ed6`
on both; prior APKs, screenshots, and exact probe outputs are recorded in
[issue 006](../issues/006-controlled-frame-noise-isolation.md). The ordinary
browser, app data, shim, and original shared flags were preserved; temporary
test tabs, guests, and ADB forwards were removed. This is a physical canary,
not production privacy sign-off. Always-run browser policy, extension WebView,
detach/owner-navigation, and applicable MPArch regressions remain.

The same arm64 build also passed the public offline-audio probe on both
physical devices in `--single-iwa` mode. Each ordinary Google tab and the
Kitchen Sink Google guest rendered 8192 constant samples twice. All outputs
were non-raw, and ordinary/guest mean offsets were distinct and repeatable
within each device; exact hashes varied with Helium's per-render jitter.
The emulator's `HeliumNoiseAudio`-disabled control had returned exact raw
samples. This test used no microphone or speaker, and it changed no profile
setting. Temporary ordinary tabs and ADB forwards were removed; both shims
returned to foreground and both shared/dedicated flag hashes remained
unchanged. See [issue 006](../issues/006-controlled-frame-noise-isolation.md)
for exact values and limitations.

## Controlled Frame pre-attach noise regression, 2026-09-25

The bounded owner-teardown race reproduced an intermittent privacy failure in
patch 0055. The recreated Google guest had the same text and font-free canvas
hashes as an ordinary Google tab in the same browser process, while the prior
guest was distinct. A disposable browser trace showed the replacement
navigation still had a browser-owned WebView, live IWA owner, Controlled Frame
entitlement and nondefault partition, but attachment had not completed.
Because 0055 required `attached()`, it fell back to ordinary-origin noise
tokens. The trace logged no tokens or scope values and was removed afterward.

Patch 0056 retains the trusted WebView/owner/partition checks without requiring
attachment to be complete. On the lab Android 16 emulator, two instrumented
20-iteration teardown/recovery runs, an uninstrumented 20-iteration run, and
ordinary-tab/two-guest same-origin comparisons passed. Both x86-64 and arm64
browser APKs built; arm64 v2 signing verified. The clean x86 APK is installed
on the emulator. The reviewer found no source-level blocker, and the signed arm64 APK
(SHA-256 `a9123e85c847702b6fc653fc9dba251049468a2a1a2d549383ce380906418c42`)
was installed in place on tablet then Pixel; both on-device hashes matched.
Rollback copies are under `$TMPDIR/xenon-iwa-0056-physical.LaDBKZ/`.
The tablet visibly cold-launched Kitchen Sink and rendered Google Controlled
Frame. The Pixel reached experimental WebappActivity but was biometrically
locked, so fresh visible rendering and privacy output were not checked.
Original shared/dedicated flags, ordinary browser, shim, and app data were
preserved. An always-run browser integration regression and broader
owner-loss/MPArch coverage remain required before privacy sign-off. See
[issue 006](../issues/006-controlled-frame-noise-isolation.md).

## Update callback-order regression, 2026-09-25

Patch 0057 registers the real update manager's completion callback before
starting a queued apply task. This is the minimal fix for a reproducible
synchronous-completion race; it does not connect the separate callback
coordinator or enable update application. The existing disposable real-browser
probe had failed with the old ordering (the signed Kitchen Sink page stayed
blank), while the test-only candidate passed. With patch 0057 in the ordered
experimental series, the same lab Android 16 emulator probe logged the
synthetic queue/completion markers and its visible-page smoke passed in 7.067
seconds. Both ABI browser APKs built, arm64 v2 signing verified, and 15 repo
tests passed. After removing the probe, the clean x86 APK was rebuilt and
installed with SHA-256
`ea3f88b0f5ce25ffb0967038e061d64f1725c6f9a975926b8130f55dfac37c42`;
the normal cold shim smoke passed in 6.012 seconds. The original dedicated
flags and pre-existing ADB forward were preserved. No physical APK was
upgraded for 0057. The probe remains a manually invoked, test-only fixture;
manager shutdown/observer reentrancy, persisted updates, and scheduler lease
coordination are still unproven. Android update guard 0025 remains.

A follow-up disposable two-IWA emulator probe found a distinct reentrancy
crash with 0057: while notifying a Kitchen Sink update callback, a test
callback prioritized a second signed IWA and its synthetic apply completed
synchronously. Both completions were pre-scheduler and refused real pending
metadata. The browser logged the nested callback's return, then SIGSEGV in
`OnUpdateApplyTaskCompleted`; the visible-page smoke failed after 20.213
seconds. A stale iterator across callback notification is the source-supported
likely cause. The test-only code was reversed, original flags restored, clean
0057 APK reinstalled with matching on-device hash, and a fresh cold shim smoke
passed in 4.794 seconds. No physical APK changed. See [issue 001](../issues/001-update-manager-test-harness.md)
and the disposable fixture; do not enable updates.

Patch 0058 detaches the per-app callback list before notifying observers and
callers, then checks the manager's weak lifetime after each callback. The
same disposable two-IWA emulator probe logged both synthetic completions and
nested callback return, and the visible-page smoke passed in 7.383 seconds
instead of crashing. The test-only code and switch were removed; the clean
0058 x86-64 APK was rebuilt and installed with matching on-device SHA-256
`aba82574ce5cf9348fde9e2a89c6c42adffbd06c81d08027b1d3daa46618f300`,
and a normal-flags cold shim smoke passed in 6.000 seconds after Chromium
formatting. The arm64 APK
built and verified v2 signing; no physical APK was upgraded. This is a
bounded callback-reentrancy fix, not shutdown or update-lifecycle sign-off.

## Update observer shutdown regression, 2026-09-26

A disposable lab Android 16 emulator probe first called the real update
manager's `Shutdown()` after detaching a completion callback batch. That batch
still ran afterward, even though the external visible-page smoke passed. A
stronger probe registered a real manager observer, which removed itself and
called `Shutdown()` inside `OnUpdateApplyTaskCompleted`; logcat again showed
observer shutdown followed by the detached caller callback. No real pending
update was present and synthetic completion happened before the scheduler.

The focused external instrumentation assertion failed red against patch 0058
and passed green after patch 0059 invalidated manager weak callbacks at the
start of `Shutdown()`. The browser process stayed alive. With all diagnostic
source and switches removed, a clean 0059 x86-64 APK passed normal-flags
packaged Kitchen Sink launch in 9.841 seconds. Both ABI browser APKs built;
arm64 v2 signing verified. The clean x86-64 APK SHA-256 is
`be6c6d0d844850a47c9c7e6fa288a213b4d7b93c079c28a6dff0c20ef4f71215`;
arm64 is
`4be154891408f793c50b7292ef91b4b28dba27aa701e109557f5933d80448eac`.
The original experimental command-line SHA-256 remains
`61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`.
No physical APK changed. The disposable test APK was uninstalled after use.

An independent review found no blocking issue in 0059's narrow observer-shutdown
path, but it does not stop a second caller callback if the first callback
itself calls `Shutdown()` inside `OnceCallbackList::Notify`. Pending captured
state destruction and post-shutdown scheduling also remain untested. Keep
Android update guard 0025 and the coordinator unwired; see [issue 001](../issues/001-update-manager-test-harness.md).

## Caller shutdown inside an update callback batch, 2026-09-26

A second disposable real-manager probe registered two callbacks for the exact
installed Kitchen Sink app. Callback A called `Shutdown()`; on patch 0059,
callback B still ran inside `OnceCallbackList::Notify()`. The external
instrumentation assertion failed red. Patch 0060 detaches a vector of
callbacks and checks manager lifetime after each invocation. The identical
lab Android 16 emulator test passed green: callback A ran, callback B did
not, and the browser survived. The probe used synthetic completion before the
scheduler and did not touch pending-update metadata or staged bundles.

After reversing all diagnostic source and restoring the 58-byte dedicated
command line, clean x86-64 and arm64 APK builds passed, arm64 v2 signing
verified, and the clean x86-64 APK passed cold app-owned shim launch with
visible packaged Kitchen Sink in 5.433 seconds. The clean APK SHA-256 values
are `f6dbce23616ec4b5c101ceebe0def2835a04797deac9371a2cc1f1f4b24cbf1f`
(x86-64) and `73a3cb44e04b6acda12f58e7d420419d85e9bfe864b9f51c775c10abb7249814`
(arm64); the installed emulator APK matched the x86-64 hash. The disposable
test APK was uninstalled, original dedicated flags still hash to
`61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`,
and the pre-existing CDP forward remained. No physical APK changed.

The reviewer found no blocker for this narrow dispatch fix, but it changes the
manager's private callback container across platforms; Android builds do not
establish desktop/ChromeOS compilation. A follow-up disposable real-manager
test made callback A's captured-state destructor call `Shutdown()` as A
returned. On 0059, callback B still ran (red, 4.979 seconds); on 0060, B was
suppressed (green, 5.205 seconds). Test code, APK and switches were removed;
the clean x86-64 rebuild and installed APK matched the pre-probe hash above,
with original dedicated flags and the pre-existing CDP forward preserved.
This is still not always-run coverage. Owner deletion, post-shutdown entry,
and other apps' retained callbacks need tests and an explicit cancellation
contract. The coordinator remains unwired, and update guard 0025 stays
enabled.

The next disposable real-manager test is red on 0060: an unrelated app-ID
callback's captured state was not discarded when Kitchen Sink's callback
called `Shutdown()`. The external emulator assertion failed in 4.684 seconds
with `CALLER_SHUTDOWN` present and no capture-destruction marker. The test
created no update task or pending metadata for that unrelated ID. All
diagnostic source/APK/flags were restored; a green production teardown fix is
not yet in the ordered series. See [issue 001](../issues/001-update-manager-test-harness.md).

Patch 0061 now rejects the public bulk-discovery request after manager
shutdown without skipping repeated teardown. A disposable real-browser probe
was red on 0060 (post-shutdown call reached the queue boundary), then green
on revised 0061 with explicit call-entry/zero-return assertions and no queue
entry. Clean x86-64/arm64 APKs built, arm64 v2 signature verified, and the
normal-flags emulator loaded visible signed Kitchen Sink after the test-only
code was removed. The reviewer found no blocker for this **one API**. Other manager
entry points and unrelated callback retention remain unsafe/unverified; keep
guard 0025 and the coordinator unwired.

Patch 0062 extends that latch only to the explicit single-app discovery API.
The disposable real-browser test called it after shutdown and failed on 0061
at a test-only pre-push marker; it passed on 0062 with entry and return markers
but no would-push marker. Both clean ABI builds, arm64 v2 signing, and a fresh
normal-flags emulator packaged-IWA shim smoke passed. This is still **not**
safe IWA update lifecycle: other entry points, callback retention, update
admission and persisted-startup behavior remain open; guard 0025 stays.

Patch 0063 also makes the two boolean discovery APIs return `false` after
shutdown. A disposable real-manager probe was red on 0062 at both pre-lookup
sentinels, then green on 0063 with both public calls returning `false` before
profile/registrar access. Clean x86-64/arm64 APK builds, arm64 v2 signing,
and a normal-flags packaged Kitchen Sink cold shim smoke passed. This does
not exercise real task scheduling or settle local-dev updates and retained
callbacks. Guard 0025 remains in place.

Patch 0064 closes the new-request local-dev entry path after shutdown: its
public callback receives a shutdown error string without entering the
discoverer. A disposable real-manager emulator test was red at the discoverer
boundary on 0063 and green on 0064; clean x86-64/arm64 APKs built, arm64 v2
signing verified, and normal-flags signed Kitchen Sink still launched via
the shim. Already-pending callbacks, unrelated app captures, owner deletion,
and actual update admission remain open; guard 0025 stays.

Patch 0065 guards manager `Start()`, delayed task start, and install/uninstall
observer callbacks after shutdown. A disposable lab emulator real-manager
test reached pre-side-effect markers for Start, DelayedStart, and install on
0064 (red), then reached none on 0065 (green). This does not release retained
callbacks or make update application safe; the separate callback-disposal
candidate remains withheld pending waiter/owner-deletion and reentry checks.

## Screen capture boundary, 2026-09-25

The installed Kitchen Sink bundle requests `all-screens-capture`, but on the
lab Android 16 emulator its document policy reports that feature disabled,
and `navigator.mediaDevices.getAllScreensMedia` is undefined. Pinned Blink
marks that API stable on ChromeOS and test-only by default elsewhere; the
Android build has not opted in. `getDisplayMedia` exists, but Kitchen Sink does
not request `display-capture`, so calling it rejects `NotAllowedError` at the
permissions-policy gate. These are availability/denial observations, not a
working screen-capture test or proof that Android's MediaProjection flow is
wired for IWAs. A separate policy-entitled signed fixture and consent/lifecycle
checks are needed before making that claim. See
[decision 0006](decisions/0006-android-iwa-screen-capture.md).
