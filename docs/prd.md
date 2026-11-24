# Xenon Android IWA production-readiness gate

Status: WIP. The signed packaged Kitchen Sink IWA, its app-owned shim,
Controlled Frame, and frame-owned Direct Sockets work in bounded emulator,
Samsung SM-X710, and Pixel 10 Pro XL canaries. This is not a production
support claim.

Release requires all P0 issues in [the backlog](../issues/README.md) to be
closed with linked behavior tests and review evidence. Keep patch 0025's
Android IWA update-application guard until the update lifecycle issues prove
atomic launch/update admission, truthful window closure, persisted-startup
handling, and failure-path preservation of staged bundles. Do not merge the
private WIP PR or enable updates on real devices before that gate.

Controlled Frame isolation must include Helium fingerprint-noise settings and
tokens, not merely guest storage partitions. Direct Sockets support must have
an always-run permission-denial test and documented semantics for changing
BLOCK while a socket is active. Optional capabilities (screen capture,
unframed/extension/OAuth, file and protocol handlers) need explicit supported
or unsupported decisions; none should be inferred from Kitchen Sink links.

Physical-device checks use only the separate `org.agent54.xenon.iwa` package
and app-owned shims. Preserve the ordinary browser, package data, original
shared command-line flags, and recoverable APK backups. Generated bundles,
signing keys, APKs, and credentials stay outside Git. Final release evidence
includes arm64/x86-64 builds, signing verification, repeatable emulator tests,
device canaries, ordinary-browser regression checks, and a reviewed version
pin/rebase. The private WIP PR is the integration artifact, not upstream.

Source evidence: [running port log](iwa-port.md),
[HTML overview](android-iwa-port.html), and
[window-quiescence design](decisions/0004-android-iwa-window-quiescence.md).
