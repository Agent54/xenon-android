# Disposable real-browser Android smoke lane

`shim-browser-test.patch` is a **test-only** addition to Chromium's small
`chrome_smoke_test_apk` target. It is not in `patches/iwa/series` and must not
be included in a shipped APK. Unlike the broad Android test APK, this target
does not pull `testing_profile_impl` or `content/test:test_support` into its
GN dependency graph. The test APK instruments itself, launches the already
installed app-owned Kitchen Sink shim, and observes the real experimental
browser without replacing or clearing its profile.

Run only on the disposable lab Android emulator. Confirm that
`org.agent54.xenon.iwa` and `org.agent54.xenon.iwa.kitchensink` are installed,
that the signed Kitchen Sink IWA is registered, and that the dedicated
experimental command line has only the normal feature flags. Apply the patch
to the isolated Chromium checkout, build
`//chrome/android:chrome_smoke_test_apk`, then install **only**
`ChromeSmokeTest.apk` and run:

```sh
adb -s emulator-5554 shell am instrument -w \
  -e class org.chromium.chrome.test.smoke.XenonIwaShimSmokeTest \
  org.chromium.chrome.test.smoke/androidx.test.runner.AndroidJUnitRunner
```

The test force-stops only the experimental browser package (no data clear),
launches the shim's explicit exported activity, waits for the experimental
browser to become foreground, and checks that `WebappActivity` is present in
the Android activity record. It also waits for the packaged page's visible
“IWA Kitchen Sink” text, so a blank activity cannot pass. It does not test
the real IWA update manager or Controlled Frame browser policy. The first
version used
`getLaunchIntentForPackage()` and failed because a separate Android test APK
cannot see the shim package without a manifest query. The explicit component
entry then passed; the later cold-launch version also passed. Keep the
package/class names exact and scoped to the optional experimental browser.

After running, uninstall only the test package
`org.chromium.chrome.test.smoke`, reverse the test-only Chromium patch, and
verify the source patch can apply cleanly again. Do not uninstall either
Xenon browser or the shim. On 2026-09-25, the cold test reported
`OK (1 test)` in 7.434 seconds. The clean installed browser APK stayed at
SHA-256 `a6117a82b84816c9d5899290a0a15ea2e1dbc42988149c996be5bcf86845f0a3`,
the dedicated flags stayed at
`61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`,
the `helium_noise` exception map was `{}`, and Kitchen Sink remained at its
installed IWA URL.
The stricter version with the visible packaged-page assertion also passed
`OK (1 test)` in 6.614 seconds, and its test APK/source were again removed.

This demonstrates a small real-browser instrumentation carrier. By itself it
does not justify wiring the coordinator or enabling Android IWA updates.

## Disposable update-manager race probe

`update-manager-race-probe.patch` and `register-before-start-candidate.patch`
are **test-only**, are not in `patches/iwa/series`, and must never be included
in a physical-device or release APK. They use the real browser profile and
the public `ChromeIwaClient` → `PrioritizeUpdateAndWait()` path. The probe
queues a fake apply for an already installed Kitchen Sink IWA at startup and
holds normal queue start. When the resource loader prioritizes it, the fake
task completes synchronously with an error **before** calling the update
scheduler. It refuses injection if that app has real pending-update metadata.
The probe is selected by the dedicated experimental browser command-line
switch
`--xenon-test-iwa-update-callback-race=b7looprugym3zyxqffzqdz4mzc2vz4j6ge3arxg2ybbzwgb6ne2qaaic`.
The switch and fixture are only safe in a disposable emulator with the exact
experimental browser and signed test IWA. Do not use them on a physical
device, ordinary browser, or a profile with any real pending update.

Before running, back up the emulator's installed experimental APK and exact
dedicated command-line bytes, verify their hashes, and verify no real update
is pending. Apply the shim smoke patch and manager probe to the isolated
Chromium checkout, build `chrome_public_apk` and `chrome_smoke_test_apk`,
install both in place, and add only the test switch to the experimental
command line. Run the instrumentation command above and inspect **test output**
(Android's `am instrument` may exit zero even when JUnit reports `FAILURES`).
Require `XENON_IWA_MANAGER_PROBE_QUEUED` and
`XENON_IWA_MANAGER_PROBE_SYNCHRONOUS_COMPLETE` in logcat. The old manager
failed its visible packaged-page assertion after 30.832 seconds. Apply the
register-before-start candidate, rebuild/install only the experimental
browser, and rerun the same instrumentation: it passed in 7.294 seconds.
The candidate intentionally performs no member access after task start;
reentrancy/destruction coverage is still missing, so this is not a shippable
manager fix.

Finally restore the backed-up command line and APK, uninstall only the
disposable smoke test package, reverse both browser-side probe patches and
the shim smoke patch, and verify forward patch checks, installed APK hash,
flag hash, and a fresh clean-browser packaged-page smoke test. On 2026-09-25
the clean APK hash was
`a6117a82b84816c9d5899290a0a15ea2e1dbc42988149c996be5bcf86845f0a3`,
the restored command-line hash was
`61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`,
and the final clean smoke test passed in 5.166 seconds. The synthetic test
did not call the update scheduler or touch staged update metadata; the
Android update guard remains in force.

Patch 0057 later put this narrow ordering fix into the ordered experimental
series. Repeating the disposable probe against patch 0057 passed the visible
Kitchen Sink smoke test in 7.067 seconds with both QUEUED and
SYNCHRONOUS_COMPLETE markers. Both ABI browser APKs compiled, and arm64 v2
signing verified. The test-only probe and smoke code were reversed afterward;
the probe switch was removed. The clean x86-64 APK was rebuilt and installed
on the emulator (SHA-256
`ea3f88b0f5ce25ffb0967038e061d64f1725c6f9a975926b8130f55dfac37c42`),
and the same visible-page smoke passed without the probe in 6.012 seconds.
The smoke APK was uninstalled; the original dedicated command line hash
`61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`
and pre-existing `tcp:9225` forward were verified. This confirms callback
ordering but does not exercise shutdown, owner deletion, or real update
application, and is not an always-run test.

## Disposable nested-completion regression

`update-manager-reentrant-callback-probe.patch` is a **test-only** patch to
apply after `update-manager-race-probe.patch`. It queues synthetic apply tasks
for the installed Kitchen Sink and a second signed IWA, refusing either app
with real pending-update metadata. It registers a callback for Kitchen Sink
that prioritizes the second app during the first completion; both tasks return
synthetic errors before the scheduler. The test switch for the second bundle
is `--xenon-test-iwa-update-reentrant-app=<installed-bundle-host>`. Use only
the disposable lab emulator, with the same backup, exact-host, smoke-test,
and restoration precautions above. Never put either probe in the ordered
series or on a physical device.

On 2026-09-25, with patch 0057 plus both disposable probes, the lab Android
16 emulator logged QUEUED twice, READY, the first and second synchronous
completions, ENTER, SECOND_DONE, and RETURN. Immediately after RETURN the
experimental browser process received SIGSEGV; the external visible-page
smoke failed after 20.213 seconds. Symbolizing the crash PC against the
diagnostic `lib.unstripped/libchrome.so` placed it in
`IsolatedWebAppUpdateManager::OnUpdateApplyTaskCompleted`. The source's
`base::flat_map` iterator is used after `Notify()`, which allows the callback
to re-enter and mutate that map; this is the likely invalidation mechanism,
not yet a line-level proof. The separate production 0057 ordering fix is
insufficient for this nested-completion path.

The original 58-byte dedicated flags were restored (SHA-256
`61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`),
the clean production 0057 APK was reinstalled with matching on-device hash
`ea3f88b0f5ce25ffb0967038e061d64f1725c6f9a975926b8130f55dfac37c42`,
the test APK was uninstalled, and all three diagnostic source patches were
reversed. A fresh clean-browser visible-page smoke passed in 4.794 seconds.
The pre-existing `tcp:9225` forward was preserved. This was the red baseline
for the narrow patch 0058 below.

Patch 0058 then detached the completion callback list from the manager's map
before observer/caller notification and checked the manager weak pointer after
each callback. With 0058 plus the same two-app disposable probe, both
synthetic completions and ENTER/SECOND_DONE/RETURN markers appeared, and the
visible Kitchen Sink smoke passed in 7.383 seconds without that crash. The
diagnostic patches and switch were removed; a clean 0058 x86-64 APK was
rebuilt and installed on the emulator (on-device SHA-256
`aba82574ce5cf9348fde9e2a89c6c42adffbd06c81d08027b1d3daa46618f300`),
and a normal-flags cold shim smoke passed in 6.000 seconds after Chromium
formatting. Both ABI builds
passed and arm64 verified with v2 signing. No physical APK was upgraded for
0058. This bounded green check does not cover Shutdown(), owner deletion,
waiter teardown, or real update application; the update guard stays enabled.

## Disposable shutdown-during-completion regression

`update-manager-shutdown-callback-probe.patch` applies **after**
`update-manager-race-probe.patch` and is test-only. It registers a diagnostic
completion callback for the exact installed Kitchen Sink app and calls the
real manager's `Shutdown()` after detaching callbacks but before observer and
caller notification. This is a narrow lifecycle hook at the notification
boundary, not yet an actual observer-owned shutdown test. The same exact-host
and no-real-pending-update precautions above apply. Select it with
`--xenon-test-iwa-update-shutdown-before-callback` in addition to the race
probe switch, only on the disposable lab emulator.

On 2026-09-26, patch 0058 plus both test-only probes compiled in the x86-64
browser APK and the external smoke APK. The visible Kitchen Sink smoke passed
in 7.035 seconds, but logcat recorded `SHUTDOWN_BEFORE_CALLBACK` followed by
`CALLBACK_AFTER_SHUTDOWN` from the same browser process. The latter is the
**red** assertion: a visible page alone cannot detect it. There is no green
production fix yet. A safe fix must define whether shutdown cancels detached
callers with a typed error or suppresses them, and must cover callback
destruction/reentry before changing the manager. Do not make the smoke test
pass by accepting post-shutdown callback delivery.

After the red run, the original 58-byte dedicated command line was restored
with SHA-256 `61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`.
The previous clean APK was reinstalled in place, and its on-device SHA-256
matched `aba82574ce5cf9348fde9e2a89c6c42adffbd06c81d08027b1d3daa46618f300`.
The disposable smoke APK was uninstalled, all three test-only source patches
were reversed, and the probe strings were absent from the source. No physical
device changed. The browser test code and probe switches must not ship.

`update-manager-observer-shutdown-probe.patch` is a separate, stronger
test-only variant to apply after the base race probe (not together with the
direct-hook shutdown probe). It registers a real
`IsolatedWebAppUpdateManager::Observer` for the exact installed Kitchen Sink
task. The observer removes itself and calls the real `Shutdown()` inside
`OnUpdateApplyTaskCompleted`; a second diagnostic callback records whether
caller notification still occurs. Select only with the base exact-host switch
and `--xenon-test-iwa-update-observer-shutdown` on the disposable lab
emulator. The observer instance is deliberately process-lifetime test state,
not production code.

On 2026-09-26, the x86-64 browser and external smoke APKs built. Logcat from
one browser PID recorded `PROBE_QUEUED`, `PROBE_SYNCHRONOUS_COMPLETE`,
`OBSERVER_SHUTDOWN`, then `CALLBACK_AFTER_SHUTDOWN`. The visible-page smoke
still passed in 6.259 seconds. This confirms the shutdown bug through a real
observer callback, not merely the direct hook. The clean experimental APK was
reinstalled in place with matching before/after SHA-256
`aba82574ce5cf9348fde9e2a89c6c42adffbd06c81d08027b1d3daa46618f300`;
the original dedicated command line was restored at SHA-256
`61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`.
The test APK was uninstalled and all diagnostic source patches were reversed.
No physical device changed. The ordered series still has no shutdown fix.

The smoke APK now also has an emulator-only
`testObserverShutdownCancelsDetachedCallback` assertion. It clears stale
emulator logs, waits for the observer marker, then rejects any subsequent
`CALLBACK_AFTER_SHUTDOWN` marker while requiring the browser process to stay
alive. Against patch 0058, that test failed red in 7.698 seconds. With narrow
patch 0059, which invalidates the manager's weak callbacks at the start of
`Shutdown()`, the same test passed in 5.532 seconds. This is observer-triggered
shutdown *before* detached caller notification; it does not test shutdown
inside callback A of a multi-callback batch. A normal-flags, probe-free 0059
APK separately passed the visible Kitchen Sink smoke in 9.841 seconds.
The test APK remains disposable and must be uninstalled after use.

`update-manager-caller-shutdown-probe.patch` is another **test-only** variant
applied after the base exact-host race probe, not alongside the observer or
notification-boundary probes. It registers two callbacks with the real manager
for the installed Kitchen Sink app. Callback A calls `Shutdown()`; callback B
logs `SECOND_CALLBACK_AFTER_SHUTDOWN` if dispatch wrongly continues. Select
with the base exact-host switch and
`--xenon-test-iwa-update-caller-shutdown`, then run only
`XenonIwaShimSmokeTest#testCallerShutdownStopsRemainingCallbacks` in the
disposable external smoke APK. The assertion requires A's marker, rejects B's
marker, and requires the browser process to survive. It uses synthetic
completion before the scheduler, never `ReportFailure()` or real pending
metadata. Clear the test-only switch, reverse every diagnostic source patch,
restore the exact dedicated command line, and uninstall the smoke APK after
each run. Do not run on a physical device.

On 2026-09-26 the test failed red against patch 0059: callback B ran after
callback A shut down the manager. Patch 0060 changes the private callback
container to a detached vector with a lifetime check after each invocation.
When testing 0060 with the diagnostic probe, apply the **test-only**
`update-manager-caller-shutdown-vector-adapter.patch` after 0060 to adapt the
probe's callback-registration syntax. The same external assertion then passed
green in 4.895 seconds. All test-only source and the switch were reversed;
clean x86-64 and arm64 browser APK builds passed, the clean x86-64 APK loaded
visible Kitchen Sink in 5.433 seconds, and the original 58-byte dedicated
flags were restored. The smoke APK was uninstalled and the pre-existing CDP
forward remained. This is bounded regression evidence, not an always-run
suite or full update-lifecycle sign-off.

`update-manager-captured-destructor-probe.patch` is a **test-only** variant
applied after the base race probe and caller-shutdown probe. It changes
callback A to hold a unique captured state whose destructor calls the real
manager's `Shutdown()` as A returns. Use the same exact-host and
`--xenon-test-iwa-update-caller-shutdown` switches and the same external
`testCallerShutdownStopsRemainingCallbacks` assertion; it accepts either the
direct shutdown or capture-destructor marker but still rejects callback B.
For patch 0060, apply the separate **test-only**
`update-manager-captured-destructor-vector-adapter.patch` after 0060, instead
of the direct-caller vector adapter. Never ship either diagnostic patch.

On 2026-09-26 the captured-destructor test failed red on 0059 in 4.979
seconds: one browser PID logged callback A returning, capture destruction and
shutdown, then callback B after shutdown. It passed green on 0060 in 5.205
seconds with A and the destructor marker but no B marker. The test-only
patches, switch and APK were removed. A clean 0060 x86-64 rebuild matched
the pre-probe APK SHA-256
`f6dbce23616ec4b5c101ceebe0def2835a04797deac9371a2cc1f1f4b24cbf1f`,
the on-device APK matched, the original dedicated flags hash was restored,
and the pre-existing `tcp:9225` forward remained. This is a bounded manual
real-manager regression; it is not yet an always-run test or an update
release sign-off.

`update-manager-retained-callback-probe.patch` is a **test-only** extension
applied after the base race probe, direct caller-shutdown probe, and its 0060
vector adapter. It registers an unrelated app-ID callback whose captured
state logs only when destroyed. The separate
`shim-retained-callback-test.patch` adds an assertion that this capture is
discarded when callback A shuts down the real manager. Both patches are
disposable and must never enter the ordered browser series. They do not queue
an update for the unrelated ID or touch staged metadata.

On 2026-09-26 that assertion failed red on clean production patch 0060: the
browser logged `CALLER_SHUTDOWN` but no
`OTHER_APP_CAPTURE_DISCARDED` before the assertion, while the process lived.
This is a teardown gap, not a proposed behavior change. No production fix was
applied. All diagnostic source, APK and flags were removed afterward; the
clean 0060 APK and original dedicated command line were restored. Before a
green fix, define cancellation and post-shutdown reentry semantics so a
discarded capture cannot start new work during teardown.

`update-manager-post-shutdown-probe.patch` extends the exact-host race and
caller-shutdown probes (with the 0060 vector adapter). Its test-only queue
boundary returns zero without starting a task or touching update metadata.
`shim-post-shutdown-test.patch` requires the public bulk-discovery call to
enter and return zero, and requires that it never reach that boundary. The
probe switch is `--xenon-test-iwa-post-shutdown-reentry` and is safe only in
the disposable lab emulator. The 0060 manager reached the queue boundary
after `Shutdown()` (red, 5.138 seconds). A first 0061 candidate passed the
narrow test but the reviewer found that its new early return from repeated
`Shutdown()` could skip cleanup if another unguarded API reentered. That
candidate was withdrawn. Revised 0061 retains repeated cleanup, latches
shutdown before teardown, and rejects only `DiscoverAndPrepareUpdatesNow()`.
The stronger external assertion passed on the lab Android 16 in 4.920 seconds:
the same browser PID logged CALLER_SHUTDOWN, CALL_ENTERED, CALL_RETURNED_0,
with no QUEUE_REACHED marker. Both ABI APKs built, arm64 v2 signing verified,
and the clean x86-64 APK under original flags passed visible Kitchen Sink
launch in 7.198 seconds. Diagnostic source and test APK were removed; the
clean installed x86-64 APK SHA-256 was
`001d9f2a62143390d6e007d1b0d09f4caf446d1632497836b896cf1586416fc3`
and dedicated flags remained
`61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`.
This is a narrow bulk-discovery gate, not a complete post-shutdown contract:
other discovery APIs can still schedule, unrelated callback captures are
retained, and the disposable test is not an always-run regression.

`update-manager-post-shutdown-single-probe.patch` adds a second **disposable**
public-API check after the base race/caller-shutdown/vector probes, separate
from the bulk-discovery probe. Callback A calls `Shutdown()` and then
`DiscoverAndPrepareUpdate()` with the installed IWA's URL info. The test-only
marker sits immediately before `TaskQueue::Push` and returns without creating
a task, so no scheduler, network request, pending update, or staged metadata
is touched. Select it with `--xenon-test-iwa-post-shutdown-single` and the
existing exact-host/caller-shutdown switches. Apply
`shim-post-shutdown-single-test.patch` to the external test APK; it requires
CALL_ENTERED and CALL_RETURNED and rejects SINGLE_WOULD_PUSH. On clean 0061,
that assertion failed red in 4.744 seconds with SINGLE_WOULD_PUSH in the
same browser PID. Patch 0062 adds a narrow early return to the void
`DiscoverAndPrepareUpdate()` API; the identical external assertion passed
green in 5.020 seconds. The reviewer found no blocker for that narrow guard. The
diagnostic code, test APK and switch were removed. Both clean ABI APKs built,
arm64 v2 signing verified, and a normal-flags x86-64 packaged Kitchen Sink
smoke passed in 7.684 seconds. The installed clean x86-64 APK SHA-256 was
`b81c9b745ad343e1dde24e15b38926ea6e8a68d04fd4740c024313dccefea6bd`;
dedicated flags remained
`61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`.
Other update entry points and callback teardown remain open; this manual
fixture is not a production update test.

`update-manager-post-shutdown-bool-probe.patch` tests the two boolean public
entry points after the real manager's `Shutdown()` in callback A. Its
`--xenon-test-iwa-post-shutdown-bool` switch, exact-host synthetic apply and
external `shim-post-shutdown-bool-test.patch` are disposable lab-emulator
fixtures only. The test-only markers sit immediately before the authorization
lookups and return `true` without consulting options or queueing tasks. On
0062 the external test failed red in 4.793 seconds: both lookup markers
appeared in the same browser PID and the sentinel results were `1_1`. Patch
0063 returns `false` early from `DiscoverUpdate()` and
`MaybeDiscoverAndPrepareUpdate()` once shutdown is latched. The same test
passed green in 4.871 seconds with CALL_ENTERED and RETURNED_0_0, and neither
lookup marker. The reviewer found no blocker in this narrow guard. Test-only source,
APK and switch were removed; clean x86-64 and arm64 browser APKs built,
arm64 v2 signing verified, and normal-flags Kitchen Sink smoke passed in
6.048 seconds. The installed clean x86-64 APK SHA-256 was
`9e1dd20fd6f46064986729c0734dbd889705889e8edf0c3a2880e968b91d7ddc`;
dedicated flags remained
`61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`.
The red sentinel proves entry past the prospective guard, **not** actual
task scheduling. Local-dev updates and callback retention remain unguarded.

`update-manager-post-shutdown-local-dev-probe.patch` exercises the callback-
bearing local-dev public API after callback A shuts down the real manager.
It passes a dummy local source that is never read: the test-only discoverer
marker returns an error before registrar/scheduler access. The switch is
`--xenon-test-iwa-post-shutdown-local-dev`, alongside the exact-host and
caller-shutdown switches. `shim-post-shutdown-local-dev-test.patch` requires
CALL_ENTERED and CALL_RETURNED, one CALLBACK_SHUTDOWN marker, and no
DISCOVERER_REACHED marker. On 0063 it failed red in 4.799 seconds: the
discoverer marker fired and the callback received the fixture's other error.
Patch 0064 makes the public API synchronously complete its existing
`expected<IwaVersion, std::string>` callback with the string
`IWA update manager has shut down.` and return before discoverer access.
The identical external test passed green in 4.862 seconds. The reviewer found no
blocker for that narrow callback path, but it does not test a callback that
destroys the manager or cancellation of already-pending local-dev work.
Test-only source, APK and switch were removed. Both clean ABI APKs built,
arm64 v2 signing verified, and a normal-flags x86-64 Kitchen Sink smoke
passed in 6.227 seconds. The clean installed x86-64 APK SHA-256 was
`398435bddb95d8fe0afaef6e4c7d62957477a15d002bafddd443043fe02187fb`;
dedicated flags remained
`61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`.
Retained callbacks for other apps and broader shutdown ownership remain open.
