# Android IWA window quiescence

Status: design gate; do not enable IWA update application

Chromium's IWA update waiter takes a zero-window shortcut: if
`GetNumWindowsForApp()` returns zero, it signals immediately without calling
`NotifyOnAllAppWindowsClosed()`. Android's current count in patch 0032 sees
non-destroyed, marked `WebappActivity` instances, but it cannot see the gaps
between a launch request and activity creation or between destruction for a
configuration change and replacement creation. Patch 0038's `finish()` is
asynchronous. A timer around the existing count or a truthful notification
method alone would still let the zero shortcut race an in-flight app.

Patch 0039 reserves launches during registry resolution and Android handoff.
Its UUID token is process-unique, and a launcher restored after process death
abandons the stale request rather than aliasing or duplicating a new launch.
Once a launch is handed to Android, an unacknowledged destination remains
counted instead of timing out optimistically. This is intentionally
fail-closed, not transparent recovery, and may require a future explicit
reconciliation path. Patch 0040 additionally reserves a configuration-change
replacement before the old `WebappActivity` is destroyed. It retains a UUID
in saved instance state and consumes the reservation only when the matching
replacement reaches Android's `CREATED` registry callback. If restoration
does not occur, the count remains nonzero in this process rather than claiming
closure.

Patch 0041 adds a Java-side, one-shot close waiter keyed by IWA app ID. It
rechecks launch reservations, recreation reservations, and Android's live
activity registry before each callback, including after earlier callbacks
re-enter the tracker. Cancellation destroys an unconsumed JNI callback wrapper.
This is a foundation for the native UI-manager bridge, not yet a truthful
implementation of `NotifyOnAllAppWindowsClosed()`.

Patch 0042 connects the Android UI manager to the Java waiter with a
native-preassigned UUID. Native callback ownership is recorded before calling
Java because the waiter can complete synchronously. Completion removes the
native callback before invoking user code; shutdown invalidates weak callbacks
and cancels remaining Java wrappers. It asserts a single native sequence.
The zero-window shortcut in the IWA update waiter and the missing launch/update
coordination lease still prevent update application.

Patch 0043 moves native callback ownership into an Android-only component
with injected Java registration/cancellation boundaries. Its focused native
tests cover synchronous completion and owner destruction, pending-waiter
shutdown and destructor cancellation, late completion, independent waiters,
and cancellation reentrancy. They do not run the production JNI glue; a
full handoff test remains necessary before enabling updates.

Remaining implementation should coordinate closure notification with update
application using patch 0039's launch reservations, patch 0040's recreation
reservations, and patch 0032's live activities. A timeout must not
turn an uncertain handoff into proof of closure. Observe
`ApplicationStatus` for the full tracker lifetime, not just while a callback
waits, and include stopped and finishing activities until `DESTROYED`.

For a close waiter, register its callback before checking quiescence and
complete it exactly once only when pending, recreating, and live counts are
all zero. Chromium's `ToJniCallback` can carry a native one-shot closure to
Java, but the owning UI manager must explicitly destroy unconsumed Java JNI
callback wrappers on shutdown. Remove a callback from tracker ownership
before invoking it, because the callback may re-enter registration or
shutdown. Keep registration, completion, and cancellation on the UI thread.
The Android update waiter must not bypass this predicate through its current
zero-window shortcut.

Even this predicate is only momentary quiescence. Before removing patch 0025's
update guard, coordinate new launches with the update apply operation so an
IWA cannot open after the waiter signals but before update commit. Account for
IWA content outside the standalone activity and verify the update-failure
path. Until then, reject update application rather than report a premature
success.

The update waiter is not a sufficient enforcement boundary. It has a
zero-window shortcut, and the update manager queues persisted pending updates
at startup without using a waiter. Every route reaches
`WebAppCommandScheduler::ApplyPendingIsolatedWebAppUpdate()`, so admission must
also be checked there. Do not wait for windows to close *inside* a queued apply
task or while holding its `AppLock`: `ChromeIwaClient` can hold an IWA resource
load while `IsUpdateBeingApplied()` is true for a queued task, creating a
deadlock with an already-admitted window. A busy app must leave the apply
queue and be retried when ready. It is not an ordinary apply failure:
`IsolatedWebAppApplyUpdateCommand::ReportFailure()` clears pending-update
metadata and can remove the staged bundle.

The proposed narrow contract is an app-ID-scoped, UI-thread-only Java lease.
Acquisition atomically checks pending launch, recreation, and live activity
counts and records an opaque owner token before returning success. The
app-owned launcher rejects new reservations while that lease exists; an
already-admitted handoff remains counted. Only the matching token can release
the lease. Native ownership must last through validation, downgrade data
removal, finalization, failure cleanup, and command shutdown. Lease release
must not launch a cached URL or name: any deferred launch resolves the current
installed registry again. Keep scope process-wide until profile-specific
activity ownership is available.

The lease's first vertical slice should test Java acquisition/release and
launch rejection while patch 0025 stays active. A later slice can wire the
common scheduler boundary and a typed *deferred* outcome that removes the
apply task from its queue, preserves the pending update, and rearms a readiness
waiter outside that queue. Readiness must account for both windows and lease
ownership, and atomic acquisition must be retried after notification. Avoid a
synchronous deferred callback through `PrioritizeUpdateAndWaitImpl()` until its
completion-listener ordering is fixed; it currently registers that listener
after starting a queued task. In the current source,
`TaskQueue::EnsureQueuedUpdateApplyTaskHasStarted()` calls
`StartUpdateApplyTask()`, which passes the scheduler callback through
`IsolatedWebAppUpdateApplyTask::OnUpdateApplied()` back to
`OnUpdateApplyTaskCompleted()`. A synchronous scheduler completion can remove
the task and notify listeners before `PrioritizeUpdateAndWaitImpl()` adds its
listener, leaving that caller without a result. The fix should check that the
task is queued, register the one-shot listener, then start the task, with no
member access after a synchronous completion could destroy the manager. A
focused regression should queue an apply behind a held task, make the second
app's scheduler callback complete synchronously when prioritized, and assert
the public `PrioritizeUpdateAndWait()` callback fires exactly once. The
upstream update-manager unit test is absent from the Android x86-64 build
graph, so use a runnable target before claiming this behavior tested.
An initial attempt to generate a Linux `//chrome/test:unit_tests` target on
the lab builder succeeded only with `safe_browsing_mode=0`; its cold build stopped in
unrelated WebUI TypeScript tests (`cr_profile_avatar_selector_test.ts` and
`history_routing_test.ts`) before the update-manager suite linked. Building
the update-manager unit-test object alone still pulled WebUI test resources and
stopped in the same dependency graph. A proposed regression test was removed
from the lab source after this failed build attempt; no scheduler fix was
applied. Do not label that regression red/green until a focused runnable target
exists or the desktop test graph is repaired without importing unrelated
changes into the Android patch series.
A second temporary Linux `unit_tests` attempt removed the WebUI test-resource
dependency path and generated with `safe_browsing_mode=0` and
`enable_service_discovery=false`. It advanced into C++ compilation but exposed
unrelated Helium desktop test incompatibilities in Blink page creation and
`PageBroadcast`, Safe Browsing test helpers, `TemplateURLService`, browser
process test scaffolding, mDNS mocks, and Omnibox. Enabling Safe Browsing is
not a drop-in fix: Helium's disabled Safe Browsing target body makes its GN
`public +=` undefined. All temporary source and GN workarounds were restored
to their pre-attempt content. The proposed synchronous-completion regression
did not compile or run; no production scheduler change was made. Prefer a
narrower runnable test graph over further unrelated desktop test repairs.
Persisted startup updates, races, stale-token
release, failure cleanup, and shutdown must have explicit tests before the
update guard can be removed.

Patch 0044 implements that first Java-only lease slice. Lease acquisition
atomically rejects a busy app, launch reservations reject a leased app, and
release requires the current owner token. The app-owned launcher exits before
profile startup if its reservation is rejected. No native update command
acquires a lease yet; patch 0025 still rejects Android update application.

Patch 0045 adds a native RAII owner for an acquired app-ID/token pair and a
generated JNI surface for acquisition/release. The native owner has injected
callbacks for focused lifetime tests; the production JNI adapter and update
command do not use it yet. The update guard remains, and this patch does not
establish update safety.

Patch 0046 compiles a production JNI adapter into Android's web-app browser
target. It asserts the browser UI thread, calls Java acquisition/release, and
returns the patch 0045 owner. A temporary emulator-only call-site probe
verified native acquisition, same-app denial, release, and reacquisition via
generated JNI; it was removed before restoring the normal APK. No production
update command calls the factory yet, and the update guard remains.

Patch 0047 adds a focused Android-native callback coordinator and moves the
apply-result type into a small standalone target. Its synchronous-completion
test failed with the original start-before-register order (`notification_count
== 0`), then passed when registration moved before start. Three additional
tests cover an absent task, owner destruction during callback dispatch, and
same-app reentrant registration. All four passed on the lab Android 16
emulator; x86-64 and arm64 browser APKs built. The coordinator is deliberately
not wired into `IsolatedWebAppUpdateManager`: an initial integration review
found observer reentrancy, shutdown, and delayed-start lifetime hazards. The
public manager regression has therefore still not run or been fixed, and
patch 0025 continues to block Android IWA update application.

Patch 0048 extends that still-unwired coordinator with an explicit detached
completion batch and shutdown cancellation. The new behavior tests failed to
compile before the API existed. A further destructor-reentrancy test crashed
under `callbacks_.clear()` before shutdown detached the callback map. All ten
focused Android-native tests now pass,
including observer-style same-app reentry after detachment, shutdown with a
detached batch, shutdown during callback dispatch, registration after shutdown,
and synchronous start/completion destroying the owner. The arm64 helper target
compiles; the x86-64 browser APK builds. Neither result exercises the actual
update manager, whose observer ordering and shutdown guards still need a
separate reviewed integration. Patch 0025 remains in force.

The next manager integration was sketched but deliberately not applied to the
Chromium checkout. A source review found that simply replacing the old
completion-listener map would leave manager-owned teardown unsafe: waiter and
task destruction during `Shutdown()` can run bound caller destructors while
their member containers are being cleared. Those containers need to be
detached before destruction, with callback cancellation as the final member
operation. The same review identified synchronous-start continuation points in
`DelayedStart()`, key-rotation discovery, discovery-completion observer
notification, update-apply waiter creation, and post-shutdown public scheduling
that require explicit guards. Discovery completion may call the same observer
twice; a self-removing observer must not receive its second call. These are
manager-level behavior requirements, not properties proved by the ten
coordinator tests. Keep the integration uncommitted until a runnable focused
manager test covers owner deletion/shutdown from an observer, caller callback
destruction during waiter teardown, synchronous start continuation, and
post-shutdown reentry. The upstream manager test fixture has extensive desktop
test-support dependencies, so first establish a narrow Android test graph or
extract a smaller public manager boundary without changing update behavior.

An independent audit then found that the coordinator's default destructor bypassed
its reentrancy-safe `Shutdown()` path. Patch 0049 adds a destructor-path test:
with the old destructor, discarding a pending callback registered another
start instead of receiving a shutdown error. The destructor now invokes
`Shutdown()` before member destruction. All eleven focused coordinator tests
pass on the lab Android 16 emulator, and the helper target compiles for
x86-64 and arm64. The coordinator remains unwired; this does not test or fix
the actual update manager.

An Android-only native manager-fixture probe was then attempted using
`TestingProfile` and a dedicated one-test GN target. It generated and advanced
through the build graph but stopped before the test linked on an unrelated
Helium/Chromium `third_party/blink/renderer/core/testing/dummy_page_holder.cc`
signature mismatch (five arguments supplied, six required). The dependency
comes from `testing_profile_impl` through `content/test:test_support` and
Blink's test-support target. The probe test never ran. Its temporary GN change
and untracked source were removed from the Chromium checkout; the exact test
source was retained outside it at
an unpublished scratch file on the lab builder. Do not repair
unrelated Blink test scaffolding inside the Android IWA patch series.

A smaller real-browser Android smoke APK now provides a runnable public-path
regression without that test-support graph. A disposable browser-side probe
queued a synthetic apply for the already installed Kitchen Sink IWA and
completed it synchronously before the scheduler. The original manager's
start-before-register order missed the completion: the cold app-owned shim
opened `WebappActivity`, but packaged Kitchen Sink text did not render within
the test timeout. A test-only register-before-start candidate rendered it on
the same path; restoring the clean APK and flags also restored the baseline
green smoke test. This establishes the callback-order race in the real
`ChromeIwaClient` → `PrioritizeUpdateAndWait()` flow. The candidate and probe
were initially outside the ordered patch series. Narrow patch 0057 now
registers before starting; the same disposable real-browser probe passed with
0057, and a clean APK/flags rebuild also passed the visible-page smoke. The
probe remains test-only and manual, and the narrow fix proves neither safe
shutdown, observer reentrancy, callback destruction, nor scheduler update
admission. The Android update guard stays on. See
`tools/emulator-probes/iwa-real-browser-smoke/README.md` and issue #2.

A second disposable real-browser probe then exposed a separate reentrancy
failure even with patch 0057: a completion callback prioritized another
installed IWA, whose synthetic task completed synchronously before the
scheduler. The nested callback returned, then the browser process crashed in
`OnUpdateApplyTaskCompleted`. The source retains a `base::flat_map` iterator
across `OnceCallbackList::Notify`, which can re-enter and mutate the same map.
This is a red test, not a fix. Detach the callback batch before calling
observers/callers, guard manager lifetime and shutdown after each callback,
and rerun the exact two-app probe green before wiring the coordinator. The
test-only probe was removed; clean emulator APK/flags and visible-page smoke
were restored. The update guard remains mandatory.

Patch 0058 implements the narrow detach-before-notify part and checks a weak
manager reference after each observer/caller notification. The same two-IWA
disposable real-browser probe passed with both nested synthetic completions
and visible packaged Kitchen Sink, where the prior build crashed. Clean
x86-64 and arm64 APKs built, arm64 v2 signing verified, and the clean x86-64
APK/normal flags again passed a cold shim smoke. This does not establish
shutdown cancellation, post-shutdown reentry, owner-deletion or waiter
destructor safety; the coordinator is still unwired and update guard remains.

A further disposable real-browser probe on 2026-09-26 called `Shutdown()`
immediately after callback-batch detachment in the real manager. The detached
callback still ran after shutdown; a visible-page smoke passed, so the
diagnostic log marker exposed a failure that the UI assertion missed. The
probe did not use a real observer and no production fix was added. The next
slice must specify cancellation/error delivery for already-detached callbacks,
test callback destruction and actual observer reentry, then guard continuation
after shutdown. Keep the update guard until this and update admission are
tested end to end.

A follow-up disposable probe registered a real manager observer and called
`Shutdown()` from its `OnUpdateApplyTaskCompleted` method. The same browser
process logged observer shutdown followed by detached caller callback
delivery; the visible-page smoke still passed. This confirms the direct-hook
finding at the public observer boundary. The separate, unwired coordinator's
`Shutdown()` discards callbacks, but the real resource-loader caller also
needs a defined completion/cancellation contract. Do not wire or enable
updates by merely suppressing a callback without testing what happens to an
in-flight IWA source request.

Patch 0059 is a narrow first guard: `Shutdown()` invalidates manager weak
callbacks before task/waiter teardown. The real-observer test was red on 0058
and green on 0059, while a clean 0059 APK still loaded packaged Kitchen Sink
under normal flags. The test artificially shuts down only the manager while
the profile remains alive, so its source request is deliberately not a normal
end-to-end browser shutdown. An independent review found no blocker for this narrow
change but identified a remaining batch-dispatch hole: if caller callback A
itself shuts down the manager, `OnceCallbackList::Notify()` may still run
callback B before the post-Notify weak check. Thus 0059 is not universal
callback cancellation or update readiness; issue #2 must cover that batch,
captured-state destruction, post-shutdown scheduling and actual source-request
teardown before a broader contract is claimed.

The follow-up real-manager two-callback probe reproduced that hole: callback
A called `Shutdown()` and callback B ran under 0059. Patch 0060 replaces the
private per-app `OnceCallbackList` with a detached vector, invokes callbacks
one at a time, and checks manager lifetime after each. The same external
lab emulator assertion was red on 0059 and green on 0060. This only fixes
batch continuation after shutdown; it does not define cancellation for other
apps' retained callbacks, guard entry after `Shutdown()`, or complete update
admission. Keep guard 0025 and the coordinator unwired.

A separate disposable real-manager probe moved the shutdown trigger into
callback A's captured-state destructor. The same assertion was red on 0059
and green on 0060, confirming the per-callback lifetime check runs after
bound state destruction. This does not establish owner-deletion safety or a
post-shutdown entry contract.

A subsequent disposable real-manager test registered an unrelated app-ID
callback with a destruction marker. After Kitchen Sink's callback shut down
the manager under 0060, the marker had not appeared: the member callback map
is retained past `Shutdown()`. This red test confirms the remaining teardown
gap without creating a second app update or changing pending metadata.
Mark shutdown before detaching callbacks, finish member teardown before
discarding captures, and block reentrant public scheduling before a green
fix. A bare `on_update_finished_callbacks_.clear()` is not sufficient because
bound-state destructors may call back into the manager.

Patch 0061 is a deliberately narrower gate: after a disposable lab emulator
probe showed public bulk discovery reaching its queue boundary following
`Shutdown()`, it latches shutdown and returns zero from
`DiscoverAndPrepareUpdatesNow()`. The enhanced external probe requires call
entry and zero return as well as no queue-boundary marker. A first candidate
also skipped repeated `Shutdown()` cleanup and was withdrawn after the reviewer
review; the final patch retains repeated cleanup. This does not gate the
single-app discovery APIs or cancel unrelated app callbacks. Their teardown
and destructor-reentry contracts still block update enablement.

Patch 0062 separately guards explicit single-app `DiscoverAndPrepareUpdate()`
after shutdown. A disposable public-call probe was red on 0061 because it
reached the pre-push boundary, green on 0062 because it returned before task
construction. The probe deliberately intercepted before queue mutation; it
does not prove update cancellation. `DiscoverUpdate`,
`MaybeDiscoverAndPrepareUpdate`, and local-dev update discovery still require
separate shutdown contracts and tests.

Patch 0063 applies the same latch to the two boolean discovery entry points.
The disposable real-manager probe called both after shutdown; its pre-lookup
sentinels fired on 0062 and were bypassed on 0063, with both public calls
returning `false`. The sentinel does not prove a real discovery task would
have queued for that app without the guard. Local-dev callback-bearing
discovery and unrelated callback capture teardown remain the next lifecycle
boundaries.

Patch 0064 handles only **new** post-shutdown local-dev requests: the
callback-bearing public method now returns one `expected` error string before
entering the local-dev discoverer. A disposable lab emulator test was red
on 0063 at a test-only discoverer boundary and green on 0064 with the
shutdown error callback. It does not cancel already-pending local-dev work
or clean up unrelated app callback captures held by the manager.

Behavior tests should cover pending launch with zero activities, successful
and failed handoff, stopped/finishing windows, final destruction, recreation,
`onNewIntent` reuse, multiple waiters and app IDs, ordinary webapp isolation,
shutdown cancellation, callback reentrancy, and the update waiter's zero
shortcut. Then run emulator handoff and recreation checks before touching
either real device.
