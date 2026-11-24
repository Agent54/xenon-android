# [P2] Decide whether Android IWAs support screen capture, then test consent

Status: queued
Depends on: none
Blocked by: product scope decision
AFK: yes

Observable behavior: the release documentation explicitly says whether
`getDisplayMedia` and `getAllScreensMedia` are unsupported or supported for
policy-entitled Android IWAs. Kitchen Sink's current denial is not support.

Acceptance criteria:
- Build a separate signed fixture with the relevant manifest policy; verify
  constructor/policy availability and Android MediaProjection consent path.
- If supporting a capability, test allow/deny, backgrounding, lock, rotation,
  process death, guest/ordinary-page denial, and no capture without consent.
- If not supporting it, keep the API gated and document the omission without
  weakening IWA or Android capture permissions.

Tests: emulator fixture first; physical canary only after product decision
and consent review. Safety: do not auto-accept screen-capture prompts or
capture unrelated user content. Existing Blink/Android runtime is intentional.

References: `docs/decisions/0006-android-iwa-screen-capture.md`.
