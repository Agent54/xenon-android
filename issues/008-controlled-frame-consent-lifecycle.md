# [P1] Test Controlled Frame media consent, storage and guest lifecycle

Status: queued
Depends on: #8
Blocked by: none
AFK: yes

Observable behavior: a policy-entitled Controlled Frame is isolated from the
ordinary tab and other IWA guests, honors Android media consent, and tears
down cleanly on navigation or app removal.

Acceptance criteria:
- Test allowed and denied camera/microphone flows with OS permission and
  embedder consent separately; a denial must not leave a live capture stream.
- Test persistent/default and explicitly partitioned guest storage, another
  IWA, same-origin ordinary tab, guest navigation, context-menu cleanup,
  resource/script policy, and guest destruction/recreation.
- Include a safe uninstall/launch race on a disposable emulator profile and
  a bounded physical-device consent canary only after emulator negatives pass.

Tests: signed fixture through public APIs, guest DevTools targets, focused
native/Java coverage. Safety: no device data wipe or permanent OS permission
change without a rollback record; no privacy-noise allowlist workaround.

References: `docs/decisions/0003-android-controlled-frame-boundaries.md`.
