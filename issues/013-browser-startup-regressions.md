# [P1] Resolve renderer startup fatal and verify ordinary-browser parity

Status: queued
Depends on: none
Blocked by: none
AFK: yes

Observable behavior: cold startup of the experimental browser and packaged
IWA does not emit the recurring `Unknown API browserAction` renderer fatal,
and the ordinary Xenon browser's core flows remain unchanged by the optional
IWA tier.

Acceptance criteria:
- Reproduce the fatal in the ordinary experimental `ChromeTabbedActivity`
  without the IWA shim; isolate whether it affects page function or recovery.
- Add a focused regression if the cause is in Xenon/Helium integration; do
  not suppress a fatal log without fixing or classifying its impact.
- Smoke ordinary browser startup, browsing, permissions, profile data,
  SharedArrayBuffer policy, and command-line isolation across ABI/device
  builds; document any intentional difference.

Tests: red/green startup log + public page checks, both ABI builds,
disposable emulator first. Safety: do not replace or clear the working
ordinary browser on physical devices.

References: `docs/iwa-port.md`, `docs/prd.md`.
