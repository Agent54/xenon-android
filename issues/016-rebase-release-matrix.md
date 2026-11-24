# [P1] Rebase pinned Chromium/Helium and complete the release verification matrix

Status: queued
Depends on: #6, #7, #8, #10, #11, #14
Blocked by: #6, #7, #8, #10, #11, #14
AFK: no

Observable behavior: the optional IWA, Controlled Frame, and Direct Sockets
tiers apply cleanly to reviewed pinned source revisions and produce signed
Android artifacts whose public behavior matches the release matrix.

Acceptance criteria:
- Verify current Chromium/Helium releases and intentionally update
  `source.lock.json`; review and minimize each Xenon patch, keeping core IWA,
  Controlled Frame, Direct Sockets, and activity/update safety separable.
- Build arm64 and x86-64 with lint/Error Prone, verify APK signatures and
  reproducible patch application, and run all focused tests plus normal
  browser regression checks.
- Run the agreed emulator/device matrix with rollback artifacts and no
  ordinary-browser replacement; record feature support and known omissions.
- Obtain final security/safety review, then decide whether the private WIP PR
  is releasable. Do not merge or open an upstream PR as part of this issue.

Tests: `python3 -m unittest discover -s tests`, focused Android suites,
public IWA/guest/socket fixtures, both physical canaries. Safety: no live
device upgrade until a reviewed build, backup, and explicit test window.

References: `docs/prd.md`, `docs/validation.md`, `source.lock.json`.
