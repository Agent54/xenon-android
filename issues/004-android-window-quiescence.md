# [P0] Make Android IWA window closure truthful across launch and recreation

Status: queued
Depends on: #2, #4
Blocked by: #2
AFK: yes

Observable behavior: the update waiter reports all app windows closed only
after pending handoffs, configuration recreation, and live/finishing
`WebappActivity` instances have ended, with no zero-window shortcut bypass.

Acceptance criteria:
- Remove the Android waiter's zero-count shortcut only with the lease from
  003 or an equivalent atomic launch/update admission boundary.
- Test pending launch with zero activities, successful/failed handoff,
  stopped/finishing windows, recreation, `onNewIntent`, multiple app IDs,
  ordinary webapps, synchronous completion, cancellation, and shutdown.
- Account for IWA content outside standalone activities or explicitly fail
  closed until it can be counted; never use a timeout as proof of closure.
- Verify real Java/JNI/native close notification and emulator lifecycle,
  including process restart and stale reservations.

Tests: focused Java/native behavior suites plus emulator handoff/race checks.
Safety: retain update guard until issue 005. Do not clear app data to make a
test pass. Existing Android Java/C++ implementation is intentional.

References: `docs/decisions/0004-android-iwa-window-quiescence.md`.
