# [P0] Add an always-run Direct Sockets BLOCK regression and settle revocation policy

Status: queued
Depends on: none
Blocked by: none
AFK: yes

Observable behavior: an entitled IWA with an explicit origin-scoped
`DIRECT_SOCKETS` BLOCK cannot open TCP, TCP Server, or UDP through the public
API; another IWA's default grant is unaffected.

Acceptance criteria:
- Promote the disposable red/green BLOCK fixture into an always-run browser
  test target or equivalent non-shipping test seam; do not ship its temporary
  switch or hand-edit Chromium Preferences.
- Cover default ALLOW, per-IWA BLOCK, reset to default, and no bleed into
  ordinary browser/guest profiles. Check all three socket forms.
- Decide and document whether BLOCK is admission-only (current behavior) or
  actively closes existing sockets; if active closure is chosen, implement
  and test it as a separate reviewed change. Do not claim current revocation.

Tests: native map test, public API emulator fixture, both ABI builds. Safety:
test only the experimental profile; restore diagnostic APK/flags and verify
hashes. Existing C++/JS boundary is intentional.

2026-09-25: The disposable emulator fixture was tightened after review: its
original version reset BLOCK before the production gate ran and synthesized
denial. The revised fixture invokes the real `IsContentSettingAllowedForUrl()`
gate under BLOCK; the public TCP listener rejected, then opened again after
the production APK and flags were restored with matching hashes. This is
useful evidence, but the fixture is not always-run. A follow-up red/green
emulator pass covered all three public socket forms: TCP listener, TCP client,
and UDP each rejected with `InvalidAccessError` under BLOCK. The normal build
failed the BLOCK assertion before the diagnostic build and passed its ALLOW
listener check again after full restoration. Cross-app/profile isolation,
permanent CI integration, and revocation policy remain open.

The temporary browser probe resets BLOCK inside each request, so a second
app's successful request during that probe would not prove isolation from a
persistently blocked first app. Patch 0052 already tests distinct IWA origins
in `HostContentSettingsMap`; the remaining public-browser cross-app test needs
a separate disposable fixture that keeps one app blocked while probing another,
then clears that exact exception and verifies the profile was restored.

2026-09-25: the separate `persistent-browser-probe.patch` did this bounded
same-profile check on the lab emulator. Kitchen Sink's stored origin-scoped
BLOCK denied all three public socket forms; a second signed, policy-entitled
IWA still opened a TCP listener. Reset removed the exact exception, then the
test-only source/APK/flags were restored and verified by hashes. The fixture
is not in the shipped series. Remaining for this issue: make this always-run
with safe setup/cleanup, broaden profile isolation, and settle active-socket
revocation semantics.

References: `docs/decisions/0005-android-iwa-direct-sockets.md`.
