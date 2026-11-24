# [P0] Wire prioritized-update callbacks into the real manager safely

Status: queued
Depends on: #2
Blocked by: #2
AFK: yes

Observable behavior: `PrioritizeUpdateAndWait()` calls its client exactly
once even if a queued apply completes synchronously, and teardown does not
call back into a destroyed manager.

Acceptance criteria:
- Register the listener before starting a queued task, with no member access
  after a synchronous completion can destroy the owner.
- Integrate the tested coordinator only after manager-level tests cover
  observer self-removal/reentry, shutdown from a callback, delayed-start
  continuation, and callback cancellation on destruction.
- Keep callback/error ordering explicit; multiple waiters for one app and
  independent apps do not alias or double-complete.

Tests: red/green real-manager public regression from 001 plus 0047–0049
coordinator suite and both ABI builds. Safety: retain patch 0025's update
guard; do not treat helper tests as production-manager verification.

2026-09-25: issue #2 now has a bounded **real-browser** red/green fixture:
the current manager missed a synthetic synchronous completion and Kitchen
Sink failed to render, while a test-only register-before-start candidate
rendered on the same cold app-owned launch path. Both changes were reversed
and the clean emulator restored. This makes callback ordering observable, but
the candidate is deliberately not in the shipped patch series. Next exercise
shutdown from an apply observer, callback destruction during waiter teardown,
post-shutdown reentry, and continuation after synchronous start through the
same small browser test lane (or another runnable manager-level boundary).
Only after those cases have a red/green contract should the coordinator be
wired and the broader Android lease/update design proceed.

References: `docs/decisions/0004-android-iwa-window-quiescence.md`.
