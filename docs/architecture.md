# Android build architecture and reference review

## Selection

Use the same two-layer model as Helium's platform repos: a pinned generic
Helium source/patch tree and a small Android-specific platform repository.
Apply Helium's `patches/series` in its declared order with Helium's own
`utils/patches.py`; then apply Android-only patches from this repository when
they are needed and tested. Do not vendor a modified Chromium tree.

The first milestone uses upstream Helium directly because `agent54/xenon`
currently targets Chromium 150.0.7871.46, while the selected Helium patch stack
targets 154.0.8037.57. Porting Xenon's desktop IWA tier at the same time would
conflate the Android baseline with the IWA feature work. Once the Android
baseline is proven, Xenon-specific changes belong in an Android platform
patch tier, and the separate IWA port can be adapted and tested there.

## How Helium builds

The Helium source repository is patch/configuration code, not a checked-in
Chromium tree. Its `patches/series` orders ungoogled-chromium, privacy, core,
and UI patches. Platform repos such as `helium-linux` prepend that generic
series to a platform-local quilt series. Their build then applies domain and
name substitutions, translations, version fields, and resources before GN
generation. This repository follows the same order without mutating the
Helium source checkout.

Helium's `deps.ini` supplies three hash-pinned assets (search-engine data,
onboarding, and uBlock). They must be retrieved and unpacked before applying
the patch series, because the uBlock patch modifies files in that unpacked
asset. The first Android patch attempt established this prerequisite: patches
1–159 applied cleanly and patch 160 stopped on absent uBlock files.

GN generation then found that Helium's Safe Browsing-disabled patch wraps the
original `deps` and `allow_circular_includes_from` declarations in a false
guard, while Chromium's Android block still appends to those arrays. The first
Android-specific patch initializes those lists on Android only, preserving
Helium's disabled Safe Browsing mode.

The remaining GN blockers were desktop-only onboarding/WebUI targets leaking
into Android and Java bindings for Helium's fingerprinting-noise Mojo types.
The Android patch tier guards the desktop targets and enables the required
Android Java bindings. GN generation now succeeds; these patches do not import
Titanium code or relax Chromium security checks.

The first compiler pass found a desktop-only passkey policy in Helium's policy
provider. Chromium does not generate that policy key for Android, so the Android
patch tier excludes only that policy assignment there; the cross-platform
password-manager policy remains in place.

Helium also extends `TemplateURLService::ResetTemplateURL` with a suggestions
URL argument. Two Android callers in Chromium still used the old signature;
the compatibility patch supplies each search engine's existing suggestions URL
so editing or migrating it does not silently clear that field.

Helium's setup page is desktop-only, but three shared URL checks referenced its
host constant on Android. Their Android paths now omit those checks while
desktop behavior is unchanged. Xenon's ordered compatibility series is applied
with `git apply` after the Helium series; its public runner has fixture tests for
ordering and missing-patch safety.

With Helium's Safe Browsing mode disabled, Android still builds the JNI bridge
but `BrowserProcess` has no Safe Browsing service. The bridge retains its JNI
method while omitting the external-app redirect report when that service is
unavailable.

Deep-scan debug logging in the enterprise connector also calls methods that
exist only with Safe Browsing download protection. Its logging branch is now
conditional on that build flag; the upload service is otherwise unchanged.

A custom-avatar placeholder helper is only used by the desktop profile picker.
It referenced a desktop settings string while being compiled on Android, so
the helper definition is now guarded for non-Android builds.

Android's APK-download warning helper uses `base::FilePath` directly. With
Helium's Safe Browsing includes absent, the transitive declaration disappears;
the compatibility tier adds an explicit include.

Chromium's Android locale loader has a special case that swaps a built-in
Google engine with a regional China engine and later restores Google. Helium
does not prepopulate Google, so that special case cannot compile or perform
its intended transition. Xenon keeps regional engine loading and keyword
deduplication, but the Google-specific default swaps are no-ops; it does not
silently map those requests to another provider.

The ordinary Android build has Extensions Core disabled. A download source
included an Extensions utility header unconditionally even though its only use
was correctly build-flagged, which pulled in an ungenerated Mojo header. The
include now follows the same Extensions Core condition as the use.

Helium removes the RLZ financial endpoint. Android's JNI ping bridge had still
referenced that endpoint, so Xenon keeps the callback contract but returns
failure without constructing or sending a revenue-tracking request. The now
unused request/response state is removed from the bridge.
The stub still needs Android's JNI string and callback conversion headers for
the generated bridge, even though it no longer sends a request.

Enterprise interstitial reporting on Android also referenced a Safe Browsing
preference that is not available in Helium's disabled mode. It now reports
`proceed_anyway_disabled = false` when Safe Browsing is absent and preserves the
existing policy-pref behavior when it is present.

Download obfuscation depended on the deep-scan policy query even with Safe
Browsing download protection disabled. Its branch now requires that build
flag, so this configuration returns false rather than referring to an absent
deep-scan API.

Android's suspicious-notification “show original” action also requires Safe
Browsing content detection. The action now follows the same availability flag
as its implementation headers; it is a no-op when that feature is removed.

The final Android link exposed further references to components omitted by
Helium's disabled Safe Browsing configuration. The Android compatibility tier
keeps the Java/native bridge signatures but returns disabled or neutral values
for unavailable Safe Browsing settings; it also avoids linking the omitted
password-reuse controllers, notification telemetry, component updater, and
desktop-only shortcut preferences. Password autofill itself remains enabled.
These guards are scoped to the absent build feature, so they do not change a
build that includes Safe Browsing.

On both devices, the first built APK reached native startup but failed before
the first-run page appeared. Helium's native-bangs patch requests the profile
storage partition's URL loader while Android is still eagerly creating the
search service for content settings. That partition has not initialized its
factory yet. Android now gives the bangs service the browser-process shared
loader at this early stage; bang requests already omit credentials, and
desktop behavior remains unchanged. The resulting APK must be rebuilt and
device-tested before the launch gate can be marked complete.

That first runtime fix allowed startup to reach Android's device-account
callback. Ungoogled Chromium's sign-in removal deliberately omits OAuth
credential loading, but Android still offers its device accounts to the token
delegate. The delegate now ignores that callback only while credential loading
has never started, rather than re-enabling sign-in or weakening the normal
loaded-token path. The same native assertion was observed on tablet and Pixel.

Android's Java sign-in UI also queries the legacy `signin.allowed` preference.
The ungoogled patch removes its registration, so this would crash even when
credential loading is disabled. Android now registers that compatibility
preference with a false default; this does not restore token loading or
account seeding. Sign-in UI behavior beyond startup still needs explicit
review before any production release.

The first-run UI on the tablet showed metrics/crash uploading enabled by
default, despite Helium's privacy posture. Android's first-run constant and
unmanaged sign-in mediator now default that choice to false. This prevents
accidental opt-in during lab testing; managed-policy behavior is unchanged.
The inherited Google-centric wording is still a release UX issue to review.

## What Titanium demonstrates, and what it does not

Titanium was reviewed at commit `97a21b7a98e4446142a39bd38190023ebb34cd74`.
It pins a Vanadium submodule, checks out Chromium at Vanadium's version,
syncs Android dependencies, uses `chrome_public_apk`, and builds arm64. Those
are useful Android build facts. It is not a Helium patch-layer implementation:
its build applies Vanadium patches, and its large `patch.sh` performs many
in-place substitutions unrelated to a minimal Android browser. Examples
include bypassing an extension-safety branch, relaxing a modal-dialog touch
security property, and forcing an incognito condition to `true`. Its build
also rewrites branding, changes global Git configuration, installs packages
with `sudo`, deletes source files, and decodes signing secrets into the tree.
None of those changes are adopted here without a separate review, test, and
documented rationale.

Titanium currently opts into Chromium's desktop-Android mode for its extension
features. Xenon's first milestone deliberately builds the ordinary Android
browser path; whether desktop-Android mode is appropriate for IWA is a
separate integration decision, after the independently launchable APK is
verified. Titanium's broad substitutions are not evidence that its extension
or security behavior should be transplanted into Helium.

## Milestone gates

1. Clean, pinned source validation and complete Helium patch application.
2. Android GN generation, arm64 APK build, and APK identity inspection.
3. Installation and independent browser launch on both lab devices.
4. Xenon branding and Android-only compatibility patches.
5. IWA port, packaged installation, shim launch, and Controlled Frame tests.

Each gate records source SHAs and test evidence. A browser that merely starts
is not evidence that the later IWA flow works.
