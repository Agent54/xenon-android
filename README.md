# Xenon for Android

Android platform build for Xenon. The first milestone is a Helium-derived
Android browser that installs and opens independently. Xenon's own branding and
IWA/Controlled Frame patches are later milestones. A lab APK has been built
and installed on both devices; browser launch and page load are verified on
the Pixel and tablet. See
[`docs/validation.md`](docs/validation.md).

## Source and trust boundary

The first build is pinned in [`source.lock.json`](source.lock.json) to Chromium
154.0.8037.57 and the matching Helium patch stack. Chromium source, Android
dependencies, build outputs, APKs, and signing keys are generated outside Git.
No code is pushed to `imputnet` repositories. The existing `agent54/xenon`
desktop patch tier is not silently applied to Android.

The [Titanium Android project](https://github.com/jqssun/android-titanium-browser)
is a reference for Android target and toolchain choices, not a source of
trusted patches. It builds from Vanadium and makes many extra source edits;
those changes are not imported here. See [`docs/architecture.md`](docs/architecture.md).

## Builder workflow

Use a clean, isolated Linux Chromium checkout. The repo expects `git`, Python 3
with Pillow from `requirements-build.txt`, GNU `patch`, Chromium `depot_tools`
(`gclient`, `gn`, `autoninja`), and Android build dependencies already
provisioned. Run the build against a dedicated clean checkout rather than a
dirty or shared source tree.
Install Pillow into an isolated Python environment or target directory (for
example, `python3 -m pip install --target /path/to/python-deps -r
requirements-build.txt` and set `PYTHONPATH=/path/to/python-deps`).

1. Check out the exact Chromium and Helium commits from `source.lock.json` in
   separate directories. Configure the Chromium checkout's `.gclient` with
   `target_os = ["android"]`, then run `gclient sync` and `gclient runhooks`.
2. Run `python3 scripts/validate_sources.py --chromium /path/to/src
   --helium /path/to/helium`.
3. Run `scripts/build.sh /path/to/src /path/to/helium` once on the clean,
   pinned checkout. The script first retrieves and hash-checks the three
   assets declared in Helium's `deps.ini`, then applies its ordered patch series
   followed by this repository's small Android compatibility patch tier,
   naming, translations, versioning, and resources; generates GN files; and
   builds `chrome_public_apk` for arm64.
4. Inspect the generated APK and install it on a lab device with `adb install`.
   Device installation and launch verification are separate, explicit steps.

The script fails rather than downloading dependencies, editing global Git
configuration, deleting a checkout, or handling release signing secrets.
Use a disposable lab build identity; production signing is not configured.

## Status

- [x] Pinned Android platform repository and reproducible source/build design
- [x] Helium patch series applies cleanly to Android checkout
- [x] GN generation and arm64 APK build pass
- [x] APK installs and launches on tablet and Pixel
- [ ] Xenon Android branding and IWA patch integration

## License

Original project orchestration, build scripts, and patches extending Helium are
licensed under GPL-3.0 (see [`LICENSE`](LICENSE)). Patches modifying upstream
Chromium source files under `patches/xenon/android/` are licensed under
Chromium's BSD-3-Clause license; imported third-party code retains its original
license.
