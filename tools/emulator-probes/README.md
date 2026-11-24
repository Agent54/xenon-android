# Disposable emulator probes (not production code)

Everything under `tools/emulator-probes/` is **test-only, disposable
instrumentation** that was used to collect red/green evidence on a throwaway
Android 16 emulator while the experimental IWA series was developed. None of
it is listed in `patches/iwa/series` or `patches/series`, none of it is applied
by `scripts/build.sh` or `scripts/apply_platform_patches.py`, and none of it
may ship in any APK, including lab builds installed on physical devices.

| Directory | Contents | Applies on top of |
| --- | --- | --- |
| `iwa-controlled-frame-noise/` | 3 browser probe patches for Controlled Frame noise policy/scope (the IWA bundle builder stays in `tests/fixtures/iwa-controlled-frame-noise/`) | 0055 / 0056 |
| `iwa-direct-sockets-block/` | 2 browser probe patches that force a DIRECT_SOCKETS BLOCK from a test switch | 0051 |
| `iwa-direct-sockets-revocation/` | 1 browser probe patch plus `probe.mjs` CDP driver for setting changes on live sockets | 0051 |
| `iwa-real-browser-smoke/` | 20 smoke-test, vector-adapter and update-manager probe patches for the update-callback work | 0057-0065 |

Rules for using a probe:

1. Use a disposable emulator and a separate Chromium checkout; never a
   physical device and never the checkout used for a lab or release APK.
2. Apply the experimental series first, then exactly the probe(s) named in the
   directory README, then rebuild.
3. Remove the probe patch, its switches and the resulting APK afterwards.
   Rebuild from the clean series before installing anything else.

Patch numbers in these READMEs use the renumbered series (see
`docs/iwa-port.md`). The Direct Sockets probes were written against the
pre-fix form of patch 0051; their hunks only use unchanged context
(`#else` / `GetMainFrame()->GetLastCommittedURL()` / `#endif`), so they apply
with a line offset, but they now run after the committed-origin gate.

`python3 scripts/check_patch_format.py` checks hunk headers here as well as in
`patches/`.
