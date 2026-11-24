# [P1] Validate Direct Sockets through network loss, lock and process lifecycle

Status: queued
Depends on: #11
Blocked by: #11
AFK: no

Observable behavior: a Direct Sockets IWA fails or recovers predictably when
the network changes, Android backgrounds/kills the process, or the screen
locks; it never leaves a listener or permission prompt attached to dead UI.

Acceptance criteria:
- On a disposable emulator, test short and long idle, network loss/restore,
  screen lock/unlock, process death, pending outbound connection, accepted
  listener, and shim relaunch with bounded timeouts and cleanup.
- Record which sockets intentionally survive a short background interval
  versus close on process death; distinguish platform behavior from a bug.
- After emulator checks, run safe reversible canaries on tablet then Pixel;
  do not disable their Wi-Fi or sever ADB without a separate explicit plan.

Tests: public TCP/UDP echo and lifecycle scripts; final package/flag/hash
verification. Safety: preserve ordinary browser and user data, remove only
test-created forwards, and never bypass a lock screen.

References: `docs/decisions/0005-android-iwa-direct-sockets.md`.
