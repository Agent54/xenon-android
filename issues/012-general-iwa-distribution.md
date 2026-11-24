# [P1] Add general signed-bundle install/uninstall and per-IWA app-owned launch

Status: queued
Depends on: none
Blocked by: none
AFK: yes

Observable behavior: a user can install a verified signed bundle and launch
that installed IWA independently without a Kitchen Sink-specific shim,
developer command-line installer switch, or caller-supplied launch URL.

Acceptance criteria:
- Define the supported install/uninstall UI or guarded developer workflow,
  bundle signature/version validation, installed-registry lookup, and a
  per-app ID-only launcher/shortcut lifecycle.
- Test two distinct signed IWAs, uninstall/reinstall, wrong app ID/action,
  stale shortcut, profile mismatch, app disabled, and no cross-app URL launch.
- Keep generated bundles, test keys, APKs, and launch metadata out of Git;
  no data deletion beyond the exact app explicitly uninstalled.

Tests: public install and cold-launch behavior on emulator, then bounded
device canary; repo manifest/shim tests. Safety: ordinary browser remains
untouched; no generic external VIEW URL capability is introduced, and patch
0025's update guard stays enabled until issue 005 is complete.

References: `docs/decisions/0001-android-iwa-launch-entry.md`.
