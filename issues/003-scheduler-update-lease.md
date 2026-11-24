# [P0] Admit Android IWA updates with an app-scoped lease and typed deferral

Status: queued
Depends on: #2, #3
Blocked by: #2
AFK: yes

Observable behavior: an update apply acquires a per-app lease only when no
launch, recreation, or activity is active; a busy apply leaves the queue for
a later retry without discarding its pending metadata or staged bundle.

Acceptance criteria:
- Wire the 0044–0046 Java/JNI/native RAII lease through command completion,
  error cleanup, cancellation, and shutdown. Only its exact token releases it.
- Put admission at common `ApplyPendingIsolatedWebAppUpdate`, including
  persisted startup applies; reject new same-app launch reservations during
  the lease without blocking other apps.
- Use a typed deferred result outside the apply queue, not `ReportFailure()`.
  Recheck atomic acquisition on readiness; no queued wait under `AppLock` or
  `IsUpdateBeingApplied()` deadlock.
- Prove busy, stale token, launch race, shutdown, persisted startup, and
  pending-bundle preservation paths with behavior tests.

Tests: focused manager/scheduler tests on emulator before any physical
upgrade. Safety: patch 0025 remains until issue 005; no profile or staged
bundle deletion in a busy path. Chromium C++/Java/JNI is the existing boundary.

References: `docs/decisions/0004-android-iwa-window-quiescence.md`.
