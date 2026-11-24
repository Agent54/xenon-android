# [P2] Classify unframed, OAuth/extension, file and protocol IWA flows

Status: queued
Depends on: none
Blocked by: product scope decision
AFK: yes

Observable behavior: each Kitchen Sink link or desktop IWA integration has
an explicit Android support status backed by a public behavior test or a
fail-closed unsupported result.

Acceptance criteria:
- Inventory unframed app presentation, OAuth redirect/extension exchange,
  protocol handlers, file handlers, link capture, and OS integration against
  the pinned Chromium/Helium source and current patches.
- For each, classify supported, unsupported by design, or separate feature
  work. Do not silently map desktop handlers into Android intents.
- Add focused negative/positive fixtures for supported flows and create
  separate implementation issues for any approved new capability.

Tests: signed Kitchen Sink/second-IWA public behavior, ordinary-page denial,
intent spoofing/failure paths. Safety: keep app-owned app-ID-only launch and
do not expose arbitrary external URL intents or broad file access.

References: `docs/android-iwa-port.html`, `docs/architecture.md`.
