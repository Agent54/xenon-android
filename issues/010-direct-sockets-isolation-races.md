# [P1] Test Direct Sockets worker, guest, policy and consent races

Status: queued
Depends on: #10
Blocked by: none
AFK: yes

Observable behavior: only a frame-owned, installed, policy-entitled IWA can
open Direct Sockets; denied contexts remain responsive and cannot borrow its
grant during navigation or pending consent.

Acceptance criteria:
- Extend the signed worker fixture to dedicated, shared, and service workers;
  classify each as denied/unsupported on this Android tier and verify no
  working browser binder is exposed.
- Verify ordinary HTTPS, non-entitled IWA, policy-disabled child, Controlled
  Frame guest, another IWA, and invalid/local address/port constraints.
- Exercise simultaneous local-network prompts, navigation during consent,
  listener creation/teardown, permission changes, and app removal on a
  disposable emulator without scanning unrelated LAN hosts.

Tests: public API signed fixtures with bounded loopback/host endpoints and
repeatable negative assertions. Safety: keep worker sockets disabled unless
separately designed/reviewed; no physical deployment before emulator gates.

References: `docs/decisions/0005-android-iwa-direct-sockets.md`.
