# [P0] Prove signed IWA update success and failure before lifting the guard

Status: queued
Depends on: #3, #4, #5
Blocked by: #3, #4, #5
AFK: no

Observable behavior: a signed packaged IWA updates without applying over an
open instance, losing a pending bundle, or breaking independent app launch.

Acceptance criteria:
- Emulator tests cover valid update, invalid signature/version, busy deferred
  update, restart with persisted pending update, cancellation, uninstall race,
  rollback/failure cleanup, and unchanged old app during deferral.
- Verify launch/update isolation and no stale executable content after commit;
  exercise activity handoff/recreation and all-windows-closed notification.
- Only after reviewed emulator evidence, run bounded in-place experimental
  package canaries on Samsung then Pixel with APK backups and no data wipe.
- Remove patch 0025's guard in a separately reviewed slice only after all
  conditions above pass; document remaining unsupported update routes.

Tests: public installed-IWA behavior, focused manager/scheduler tests, both
ABI builds, APK signature checks, ordinary-browser regression. Safety: no
ordinary package replacement, shared flag edits, or physical update test
before emulator gates; generated bundles/keys remain outside Git.

References: `docs/prd.md`, `docs/decisions/0004-android-iwa-window-quiescence.md`.
