# [P0] Restore an Android-safe IWA and Controlled Frame security test subset

Status: queued
Depends on: none
Blocked by: none
AFK: yes

Observable behavior: the Android build runs focused entitlement, navigation,
scheme, partition, and guest-creation tests rather than broadly excluding
web-app/Controlled Frame targets.

Acceptance criteria:
- Audit broad exclusions in patches 0008 and 0034; replace each with narrow
  unsupported-platform gates and keep runnable security tests in an Android
  target. Do not import unrelated desktop test fixes into IWA patches.
- Include installed-IWA origin/policy entitlement, ordinary-page denial,
  guest scheme/resource loading, partition ownership, script URL rejection,
  teardown, and manifest-policy negatives.
- Run both ABI compile checks and x86-64 emulator tests; document every
  intentionally skipped desktop-only case and its replacement evidence.

Tests: focused Android-native or instrumentation target plus existing two
portable entitlement tests and repo tests. Safety: leave physical devices and
update guard unchanged; this is test coverage, not feature broadening.

References: `docs/iwa-port.md`, `docs/decisions/0003-android-controlled-frame-boundaries.md`.
