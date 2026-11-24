# [P0] Build a focused runnable Android IWA update-manager test harness

Status: in progress
Depends on: none
Blocked by: none
AFK: yes

Observable behavior: a test calls the real `IsolatedWebAppUpdateManager`
public API and observes synchronous completion, shutdown, and reentrancy.
The 0047–0049 coordinator tests do not prove manager behavior. Full Linux
`unit_tests` and the first Android `TestingProfile` target failed in unrelated
Helium test dependencies before this suite ran.

2026-09-25 follow-up: a second temporary Android `TestingProfile` target
advanced after a test-only fix for Blink's missing `HeliumNoiseTokenMap`
argument, but failed before linking in
`components/search_engines/search_engines_test_environment.cc`: its
`TemplateURLService` construction is also out of sync with Helium. No manager
test compiled or ran. The temporary GN target, test source, and Blink edit
were removed/restored byte-for-byte; neither workaround belongs in the IWA
patch series. Do not repeat this broad graph unchanged. The next harness
should use the running browser's real profile with a narrow test-only manager
entry point, or extract a production-used manager boundary that can be tested
without `TestingProfile` and the desktop test-support graph.

2026-09-25 smaller graph check: the existing
`//chrome/android:chrome_smoke_test_apk` built cleanly for the pinned Android
x86-64 configuration, including Java lint/Error Prone, and its transitive GN
dependencies contain neither `testing_profile_impl` nor
`content/test:test_support`. This is an **external instrumentation APK** that
drives a real, uninstrumented browser; its current tab-switcher test hardcodes
Chrome's upstream `IntentDispatcher` and does not exercise Xenon's update
manager. The build is a promising carrier for a separate thin real-browser
test, not evidence that the public manager regression compiles or passes. A
manager test here would need a reviewed test-only browser boundary using the
real profile plus a deterministic queued-apply completion seam; it must not
silently substitute the already-tested coordinator for the manager or remove
the Android update guard. No smoke test was installed or run on devices.

That carrier has now been exercised in a narrower way: a disposable test-only
GN/Java patch added one external instrumentation case that cold-force-stopped
only `org.agent54.xenon.iwa`, launched its exact app-owned Kitchen Sink shim,
and observed the real browser's `WebappActivity`. It compiled with Error
Prone/lint and passed on the lab Android 16 emulator (`OK (1 test)`). The
test APK was uninstalled, the test-only Chromium patch reversed, and browser
APK, profile exception map, and dedicated flags verified unchanged. The
fixture is under `tools/emulator-probes/iwa-real-browser-smoke/`. It proves the
carrier can run against a real profile; it does **not** supply a queued-update
injection seam or test `PrioritizeUpdateAndWait()`. Those remain issue #2's
release-blocking work.

2026-09-25 real-browser red/green: the smoke fixture now requires visible
packaged “IWA Kitchen Sink” text, not merely a `WebappActivity`. A separate,
**disposable and unshipped** manager probe queued a synthetic apply for the
installed Kitchen Sink in the real profile and synchronously completed it
before the update scheduler. The exact bundle-host test switch and absence of
pending update for that app gated injection; the synthetic path did not invoke
the scheduler, `ReportFailure()`, or modify staged metadata. With the current
start-before-register manager, log markers confirmed queue and synchronous
completion, but the cold shim test failed after 30.832 seconds because the
packaged text never appeared. A test-only register-before-start candidate
passed the same public browser-path test in 7.294 seconds, with both markers
still present. After restoring the clean browser APK and dedicated flags, the
same visible-content test passed in 5.166 seconds. The smoke APK was removed,
the diagnostic Chromium source patches were reversed, and on-device clean
APK/flag hashes matched their backups. See
`tools/emulator-probes/iwa-real-browser-smoke/README.md`.

This is evidence of the real lost-callback race through `ChromeIwaClient` and
`PrioritizeUpdateAndWait()`. Patch 0057 now applies the narrow
register-before-start fix in the ordered IWA series. Both ABI APK builds pass,
and the same disposable real-browser probe passed with patch 0057: synthetic
queue/completion markers appeared and the visible packaged-page smoke test
finished in 7.067 seconds. The browser-side probe is still manually invoked,
not an always-run regression, and its synthetic error is a bounded test of
callback ordering rather than an update-lifecycle sign-off. Add
owner-deletion, shutdown, observer/caller-callback reentrancy, and
post-shutdown tests before wiring the coordinator or enabling updates. Keep
Android update guard 0025.

2026-09-25 nested-completion red: a second disposable real-browser probe
queued synthetic applies for Kitchen Sink and another installed signed IWA.
While the first completion was notifying callbacks, a test callback
prioritized the second app, whose task also completed synchronously. Both
completions occurred before the update scheduler; the probe refused any app
with real pending metadata. The browser logged both completions and return
from the nested callback, then crashed with SIGSEGV inside
`OnUpdateApplyTaskCompleted`; the visible-page smoke failed. The manager uses
an iterator into `on_update_finished_callbacks_` after `Notify()`, although
the callback can re-enter and mutate that `base::flat_map`. Patch 0057 does
not address this. The diagnostic patch is under
`tools/emulator-probes/iwa-real-browser-smoke/`, not the ordered series. Clean APK,
flags and smoke test were restored/verified; no physical device changed.
Patch 0058 now detaches the callback batch before invoking observers/callers
and checks a weak manager reference after each notification. The exact
two-IWA disposable probe passed with 0058: both synthetic completions and
ENTER/SECOND_DONE/RETURN markers appeared, and packaged Kitchen Sink rendered
in 7.383 seconds. Both ABI APK builds and arm64 v2 signing passed; the clean
x86-64 APK was restored on the emulator and a normal-flags cold shim smoke
passed in 6.000 seconds after Chromium formatting. This closes the
demonstrated nested-map-iterator crash only. The probe is not always-run, and
Shutdown(), owner deletion,
waiter callback destruction, and post-shutdown scheduling still lack a
real-manager green test. Do not enable updates from this narrow fix.

2026-09-26 shutdown red: a third disposable real-browser probe called the
manager's real `Shutdown()` at the completion notification boundary, after
patch 0058 had detached its app callback batch. The callback still ran after
shutdown (`SHUTDOWN_BEFORE_CALLBACK` then `CALLBACK_AFTER_SHUTDOWN` in one
process), although the external visible-page smoke passed. This is not yet an
observer implementation: the test-only hook sits at the same boundary to
isolate callback ownership. A production change needs an explicit shutdown
contract for detached callbacks, destructor/reentry coverage, and an actual
observer-triggered shutdown case. The diagnostic APK, switches, and source
were removed; emulator's clean APK/flag hashes were restored. The ordered
patch series contains no shutdown fix. Keep guard 0025.

The actual observer case is now red too: a disposable
`IsolatedWebAppUpdateManager::Observer` removed itself and called `Shutdown()`
inside `OnUpdateApplyTaskCompleted`. The same PID logged
`OBSERVER_SHUTDOWN` before `CALLBACK_AFTER_SHUTDOWN`; the external visible
Kitchen Sink smoke nevertheless passed. The test-only variant and restoration
steps are in the real-browser fixture README. This is a deterministic
manager-level failure and still not an always-run test. Next decide whether
detached callbacks are canceled silently or completed with a typed shutdown
error. The unwired coordinator currently discards callbacks on shutdown;
the real manager and `ChromeIwaClient` callback chain need a compatible
contract. Add callback-destructor and post-shutdown reentry coverage before
changing production teardown; leave update guard 0025 in place.

Patch 0059 now invalidates manager weak pointers at the beginning of
`Shutdown()`. The observer-triggered diagnostic test failed red with 0058 and
passed green with 0059; the browser process stayed alive. A clean 0059
x86-64 APK under normal flags also passed the packaged-page smoke, and both
ABI APK builds passed with arm64 v2 signing. This only stops the completion
path at the existing weak check **after an observer shuts down the manager**.
An independent review found no blocker for that narrow change, but highlighted that
`OnceCallbackList::Notify()` is not interrupted between individual callbacks:
if callback A calls `Shutdown()`, callback B may still run. Also test captured
state destruction, repeated shutdown, delayed-start cancellation and
post-shutdown reentry. Do not call issue #2 complete or remove guard 0025.

2026-09-26 two-callback follow-up: a test-only real-manager probe registered
two callbacks for the installed Kitchen Sink app. Callback A called
`Shutdown()`; callback B still ran on 0059, failing the external lab emulator
assertion. Patch 0060 dispatches the detached batch one callback at a time
and checks lifetime between callbacks. The same assertion passed green;
clean x86-64 and arm64 browser APKs built, arm64 v2 signing passed, and clean
x86-64 still rendered packaged Kitchen Sink. The test-only patches/APK/switch
were removed and original flags restored; no physical device changed. The reviewer
found no blocker for this narrow fix, but it is not always-run and applies to
the shared manager across platforms. Captured-state destructor shutdown,
owner deletion, repeated/post-shutdown entry, other-app callback retention,
and real update admission remain open. Keep guard 0025 and the coordinator
unwired.

Captured-state destruction is now also boundedly tested through the real
manager: callback A's captured object called `Shutdown()` in its destructor.
The disposable external assertion failed on 0059 because callback B still
ran, and passed on 0060 with B suppressed. The diagnostic source/APK/flags
were removed and the clean x86-64 APK hash matched its pre-probe backup.
This narrows one lifetime gap but is not an always-run regression. Actual
owner deletion, post-shutdown entry and other-app callback teardown remain
open; do not remove guard 0025.

Next test seam, from pinned Chromium source inspection: `Shutdown()` clears
the task queue and waiters but neither marks the manager permanently stopped
nor detaches `on_update_finished_callbacks_` for other apps.
`PrioritizeUpdateAndWaitImpl()` currently posts a generic no-task error after
the queue is cleared, while public `DiscoverAndPrepareUpdate()` can push and
start a fresh task if re-entered on the still-alive manager. Treat these as
separate contracts: (1) pending callbacks for another app are canceled and
their captured state is destroyed at shutdown without reentrant scheduling;
(2) calls after shutdown cannot start new network/update work, with an
explicit typed callback result where the API requires one; (3) a callback
destructor that re-enters any public entry point cannot repopulate a torn-down
queue. Reproduce each through the running-browser fixture before changing
production teardown. Do not infer safety merely from a synthetic callback
that returns an error after shutdown.

The first retained-callback test is red on 0060. A disposable exact-host
real-manager probe registered a callback under an unrelated app ID with a
capture that logs on destruction; callback A for Kitchen Sink then called
`Shutdown()`. The external lab emulator assertion failed in 4.684 seconds:
`CALLER_SHUTDOWN` appeared, but the unrelated capture was not discarded while
the browser process lived. No update task or pending metadata was created for
the unrelated ID. Diagnostic code/APK/flags were restored, and no physical
device changed. A fix must mark shutdown before detaching the callback map,
discard captured state after other member teardown, and test destructor
reentry plus post-shutdown public calls before it ships. Do not treat this red
result as license to simply `clear()` the member map during teardown.

The provider shutdown order makes the reentry gate important: it shuts down
the command scheduler and command manager before the IWA update manager.
`DiscoverAndPrepareUpdate()` currently calls that scheduler after pushing a
task, with no manager shutdown latch. A retained callback's destructor must
not be allowed to reach that path while its map is discarded. A disposable
post-shutdown scheduling probe should verify no task is pushed or started,
then a typed cancellation result should be tested for callback-bearing APIs.

2026-09-26 post-shutdown bulk-discovery slice: a disposable real-browser
probe called public `DiscoverAndPrepareUpdatesNow()` after callback A shut
down the manager. Under 0060 it reached the test-only queue boundary (red),
without starting a real task. Revised patch 0061 sets a shutdown latch before
teardown and returns zero from this one public API; the enhanced probe
verified CALL_ENTERED, CALL_RETURNED_0, and no queue-boundary marker (green).
The first candidate's early return from repeated `Shutdown()` was removed
after the reviewer found it could skip cleanup following reentry through another
unguarded API. The reviewer found no blocker in the revised narrow patch. Both ABI
browser APKs built, arm64 v2 signing verified, and the clean x86-64 browser
loaded signed Kitchen Sink via its app-owned shim. This does **not** close
issue #2: all other scheduling APIs, retained callbacks, callback-bearing
typed cancellation, owner deletion, and an always-run regression remain.
Update guard 0025 and the unwired coordinator remain unchanged.

The next single-app public path is also red/green: a disposable lab emulator
probe called `DiscoverAndPrepareUpdate()` after callback A shut down the real
manager and marked the exact pre-`TaskQueue::Push` boundary without enqueuing
anything. On 0061 the external test failed in 4.744 seconds because that
boundary was reached. Patch 0062 returns immediately on the shutdown latch;
the same test passed in 5.020 seconds with positive call-entry/return markers
and no would-push marker. The reviewer found no blocker for this void API's narrow
guard. Both clean ABI APKs built, arm64 v2 signing verified, and a normal-flags
emulator shim launch visibly loaded signed Kitchen Sink. Still unresolved:
`DiscoverUpdate`, `MaybeDiscoverAndPrepareUpdate`, local-dev discovery,
unrelated callback captures, typed cancellation, owner deletion, and an
always-run real-manager regression. Keep update guard 0025.

2026-09-26 boolean discovery slice: a disposable public-call probe made
`DiscoverUpdate()` and `MaybeDiscoverAndPrepareUpdate()` from callback A
after manager shutdown. On 0062 both reached test-only pre-authorization
lookup markers (red, 4.793 seconds); the markers returned sentinel `true`
without reading policy or creating tasks. Patch 0063 makes both return
`false` before profile/registrar access after shutdown. The identical
external test passed green in 4.871 seconds with positive call-entry and
`0_0` return markers and no lookup markers. The reviewer found no blocker for this
narrow platform-neutral guard. Both clean ABI browser APKs built, arm64 v2
signing verified, and normal-flags signed Kitchen Sink cold launch passed on
the lab emulator. Do not mistake this sentinel probe for an actual queued
update test. Local-dev discovery, retained captures, typed cancellation,
owner deletion, and always-run manager coverage still block issue closure.

2026-09-26 local-dev callback slice: a disposable real-manager probe called
`DiscoverApplyAndPrioritizeLocalDevModeUpdate()` after callback A invoked
`Shutdown()`. On 0063 it reached a test-only discoverer boundary and completed
with the fixture's other error (red, 4.799 seconds), without reading a file
or invoking the scheduler. Patch 0064 instead completes the existing
`expected<IwaVersion, std::string>` callback once with a shutdown error
string and returns before discoverer access; the identical external test
passed green in 4.862 seconds. The reviewer found no blocker in this narrow path.
Both clean ABI APKs built, arm64 v2 signing verified, and a normal-flags
Kitchen Sink shim smoke passed. The string is not a dedicated typed error
enum. Pending local-dev callback cancellation, callback-driven owner deletion,
unrelated-app capture teardown, destructor reentry, and always-run coverage
still block issue closure and update-guard removal.

2026-09-26 lifecycle reentry slice: review of callback-capture disposal found
that `Start()`, `DelayedStart()`, and install-observer callbacks could recreate
observation, queued work, or a timer after shutdown. A disposable real-manager
lab Android 16 test called the three entry points from callback A after its
`Shutdown()` and failed red on 0064: all three test-only pre-side-effect
markers fired, while the browser survived. Patch 0065 returns on the shutdown
latch in those paths and the uninstall observer callback. The identical public
test passed green in 4.734 seconds: callback A fired, none of the three
markers appeared, and the browser process stayed alive. Clean x86-64 and
arm64 browser APK builds passed, arm64 v2 signing verified, and the clean
emulator APK loaded the packaged IWA through its app-owned shim. The reviewer found
no blocker for calls that begin after shutdown. The diagnostic
sentinels returned before real scheduling; this proves the guarded entry
boundary, not a queued update. Retained callback disposal had a separate
green candidate test, including bulk-discovery/repeated-shutdown destructor
reentry, but it was withheld after review found these additional entry paths
and an unguarded `PrioritizeUpdateAndWaitImpl()`/owner-deletion path. A
`DelayedStart()` call already in progress may synchronously shut down during
`MaybeStartNextTask()` and then continue; the entry guard does not cover that
continuation. Keep
callback-disposal code out of the ordered series pending those tests.

Acceptance criteria:
- A narrowly scoped Android/emulator target compiles and runs a real manager
  behavior test without importing unrelated Helium fixes into the IWA series.
- Reproduce the public `PrioritizeUpdateAndWait()` lost-callback race red and
  green (done manually with the disposable real-browser fixture, including
  patch 0057 green); make it an always-run regression before considering issue
  002 complete.
- Cover owner deletion/shutdown from an observer, destruction of a caller
  callback during waiter teardown, synchronous-start continuation, and
  post-shutdown reentry. Report actual test results, not helper-only passes.

Tests: focused native target on the lab Android 16 emulator; both ABI compile
where relevant; repo tests. Safety: no device APK upgrade or update-guard
removal. Existing Chromium C++/GN runtime is intentional; do not add Python
or TypeScript orchestration to the Chromium source tree.

References: `docs/decisions/0004-android-iwa-window-quiescence.md`.
