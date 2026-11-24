# Android Controlled Frame boundaries

Status: experimental; basic rendering validated on emulator and two devices

Kitchen Sink's Controlled Frame rendered in the earlier stock-Chromium build,
but the first Xenon Android IWA build exposed `<controlledframe>` only as an
`HTMLUnknownElement`. Both builds used the same IWA command-line feature
switches. Chromium 154 keeps Controlled Frame's browser, common, and renderer
providers behind full-extensions build gates; its web-page API feature also
excludes desktop Android. Patches 0034–0036 adapt those gates only in the
optional experimental IWA tier.

Making the element available is not sufficient. The Android guest manager
must use the existing delegated availability check, so ordinary web pages and
IWAs without the controlled-frame permission remain excluded. Controlled
Frame storage partitions must be registered under the owning IWA, not under
the generic extension-host partition. Resource loading for file-backed
injection must be bound to the embedder's origin and fail without a loader.
Both the outer URL scheme and origin must match: a `blob:` URL can carry the
same inner origin while violating the IWA loader's required URL scheme.
Camera and microphone requests must use Controlled Frame's embedder-consent
handler instead of the generic page-permission handler. Guest teardown must
remove per-frame context-menu items. A queued persistent-partition request
must return no partition if its app was uninstalled before its lock was
acquired, rather than crash.

The older proof-of-concept branch implemented element registration and two
policy gates but did not close all these Android runtime paths. Its screenshots
prove frame rendering, not storage, media, or failure-path isolation. The
emulator confirms that an ordinary HTTPS page lacks the custom element, that
valid relative file injection works, and that HTTPS, another IWA origin, and
same-origin `blob:` file injection fail cleanly. Device screenshots confirm
Google renders inside Kitchen Sink on both real devices, including the Pixel's
external desktop display. The separately installed `Hello Xe Computer` IWA,
whose manifest lacks Controlled Frame permission, also has no custom element
on the emulator. On that emulator, a guest audio request was denied while the
OS microphone permission was ungranted, leaving the embedder-consent path
untested. Navigating away removed the guest DevTools target, and a temporary
guest `localStorage` marker was invisible to an ordinary tab at the same
Google origin; the marker was then removed. The experimental series still
lacks broader on-device checks for disallowed guest schemes, persistent and
cross-app isolation, context-menu cleanup, and app removal. File-injection
rejection has only been exercised on the emulator.
The IWA update guard remains in place independently of this work.

## Helium noise-setting isolation gate

A temporary Android-native run of Chromium's Controlled Frame permission-enum
audit failed on Helium's additional `ContentSettingsType::HELIUM_NOISE`.
Simply vetting it in the enum list would be premature: the pinned Helium
`patches/helium/core/noise/core.patch` implementation reads the site
exception from the profile's
`HostContentSettingsMap` and derives canvas/audio noise tokens from state on
`BrowserContext` plus origin. Neither path visibly keys on the guest storage
partition or owning IWA. Controlled Frame guests may themselves navigate to
HTTP(S), so the setting's HTTP(S)-only restriction does not settle this.
The first audit run was red and a green run with a temporary allowlist entry
is not accepted as security validation. The test runner and allowlist entry
are not in the ordered patch series.

An Android 16 emulator runtime probe then compared `https://www.google.com/`
in an ordinary experimental-browser tab, Kitchen Sink's default Controlled
Frame guest, and a second ephemeral Controlled Frame guest with a distinct
`partition` attribute. The same canvas drawing gave identical `getImageData`
and `toDataURL` hashes in all three contexts, stable across repeated reads.
The probe used a 120×40 canvas with the same fill and text in each context;
its FNV-1a hashes were:

| Context | Pixel bytes | Data URL |
| --- | ---: | ---: |
| Ordinary `www.google.com` tab | 2032514109 | 1572586913 |
| Default Google guest | 2032514109 | 1572586913 |
| Second-partition Google guest | 2032514109 | 1572586913 |
| Ordinary `example.com` tab | 1820439822 | 1884984754 |

A temporary
`localStorage` marker set in the second guest was absent from the first guest
and ordinary tab, confirming their storage partitions were distinct in this
probe. The marker, added guest, and ordinary test tabs were removed. No
physical device or shared browser flags changed.

This reproduces same-origin canvas fingerprint linkage across those separate
storage contexts. It is consistent with the source-level browser-context and
origin token derivation; it does not by itself prove an ordinary-profile site
exception affects guests, that audio output is linked, or that a permission
or protected storage value leaked. The Controlled Frame enum must remain
unvetted until the broader boundary is understood and corrected.

A follow-up `OfflineAudioContext` oscillator probe was inconclusive: the same
ordinary tab produced different output hashes on repeated renders. Equal
hashes observed across contexts in one render round therefore cannot be used
as evidence of audio-token linkage. Use a deterministic lower-level test for
that path. The temporary audio guest and tabs were also removed.

Before vetting this setting, test the same HTTP(S) origin in an ordinary tab
and separate Controlled Frame guest partitions/apps. Check whether an
ordinary-profile noise exception changes guest behavior and whether canvas
and audio noise outputs share tokens across those contexts. If they do, key
guest-specific noise settings and tokens to the owning partition/app while
retaining stable behavior within one guest, then rerun the audit. Do not
disable noise merely to make the test green.

### Source trace and minimal repair contract, 2026-09-25

The pinned source shows why an ordinary site exception is a real boundary to
test, independently of the canvas probe. `WebViewGuest::CreateInnerPage()`
asserts its browser context is the owner render process's browser context;
it then selects a distinct `StoragePartitionConfig` for the guest and creates
the guest `SiteInstance` in that same browser context. At a main-frame
navigation, `NavigationRequest::ReadyToCommitNavigation()` asks
`ChromeContentBrowserClient::HeliumNoiseEnabled()` about that browser context
and committed URL. `GetHeliumNoiseState()` reads the profile-wide
`HostContentSettingsMap` using the URL and an empty secondary URL. It receives
no guest, partition, or owning-IWA identity. When enabled,
`HeliumNoiseTokenData::GetTokens()` reads session tokens attached to the
browser context and derives each feature token from the origin alone. Thus
these two code paths cannot distinguish same-origin guests in different
storage partitions from an ordinary tab. This is a source-level conclusion;
we have not mutated an emulator site exception to measure its runtime effect.

The smallest acceptable repair should preserve ordinary-tab behavior while
giving each Controlled Frame guest an identity derived from the **full trusted
storage-partition configuration and owning IWA**, not merely its renderer-
supplied `partition` attribute. An ordinary-tab site exception must not
silently disable guest noise. The global noise preference should retain its
documented meaning; decide explicitly whether guest-specific exceptions are
supported before adding UI or settings storage. Both policy and token
derivation need the same guest/ordinary distinction.

Tests should compare the returned token maps directly, rather than infer
token equality solely from canvas pixels: same guest/partition/origin should
be stable within a session; distinct partitions and owning IWAs at one origin
should differ; an ordinary tab should differ from each guest. With an
ordinary-profile site exception, only the ordinary-tab policy should change.
Then rerun canvas and deterministic audio checks, the permission-enum audit,
and guest teardown/recreation checks. Keep the current enum audit red and the
experimental Android IWA update guard in place until the relevant boundaries
are validated.

### Trusted navigation identity seam, 2026-09-25

The Chromium 154 navigation path has enough browser-owned information to
distinguish these cases, but the present Helium callback discards it.
`NavigationRequest::ReadyToCommitNavigation()` has the prospective
`site_info_.GetStoragePartitionConfig()`. A diagnostic emulator trace found
that the current Android Controlled Frame is a legacy GuestView WebContents:
its navigation reports `kPrimaryMainFrame`, **not** `kGuestMainFrame`, even
though `FrameTreeNode::GetParentOrOuterDocumentOrEmbedder()` finds an embedder.
`GuestViewBase::FromNavigationHandle()` resolves this browser-owned
association in both legacy and MPArch modes; its Controlled Frame ownership
check avoids classifying an ordinary page or extension WebView by partition
shape alone.
`WebViewGuest::CreateInnerPage()` gets the guest config from
`ChromeExtensionsBrowserClient::GetWebViewStoragePartitionConfig()`; the IWA
branch uses `GetControlledFramePartitionWithLock()` rather than trusting the
renderer-supplied `partition` attribute alone.

For IWAs, `IsolatedWebAppUrlInfo::storage_partition_config()` uses the owning
IWA's partition domain with empty name and persistent storage; its Controlled
Frame config uses that same domain plus a name/in-memory choice and rejects an
empty persistent guest name. The existing command test
`CorrectWithDifferentApps` verifies two IWAs get distinct domains and their
guest configs are distinct. A narrow Android repair can therefore pass the
prospective full `StoragePartitionConfig` and trusted embedder origin through
Helium's navigation policy/token path, validate the domain against
`IwaOrigin::GetPartitionDomain()` for that embedder, and derive guest tokens
from the full config plus requested HTTP(S) origin. Do not classify guests by
`partition_name` alone, an unverified domain prefix, or renderer-controlled
attributes. Ordinary tabs and the IWA's own base document must keep their
existing policy semantics.

Patch 0055 is an **experimental implementation** of both gates, not release
sign-off. A narrow Android-native token test failed on the original
origin-only derivation and passed with a browser-supplied guest scope. Another
test validates owner/domain/config matching and distinct scopes for owners,
partition names, memory modes, and blob fallback. On the Android 16 emulator,
the first navigation attempt using `IsGuestViewMainFrame()` left ordinary and
guest Google canvas hashes equal; after switching to the browser-owned
GuestView association, the same-origin hashes differed and remained stable on
repeat. A disposable, non-shipping build set a real ordinary Google site
exception to BLOCK during each policy check: the ordinary navigation disabled
noise while the IWA Controlled Frame remained enabled. It cleared the exact
exception and verified the profile exceptions map returned to `{}`. The
diagnostic logging and setting mutation are absent from patch 0055 and the
subsequent clean emulator APK.

The clean candidate also passed
`scripts/test_iwa_controlled_frame_noise_partitions.mjs`: an ordinary Google
tab, Kitchen Sink's existing Google guest, and a newly created ephemeral
second-partition Google guest returned three different canvas pixel hashes
(`1009754065`, `785800280`, `190738767`) in one session. Repeating the probe
produced the same three values. The extra guest was removed after each run,
and its DevTools target disappeared. This is direct runtime cross-partition
evidence for one owning IWA.

A separate disposable signed IWA from
`tests/fixtures/iwa-controlled-frame-noise/` was then installed into the same
experimental emulator profile. Its app-owned launch opened a Google Controlled
Frame. `scripts/test_iwa_controlled_frame_noise_cross_app.mjs` compared that
guest with Kitchen Sink's Google guest and an ordinary Google tab. All three
reported `https://www.google.com` as their origin, but their canvas pixel
hashes were respectively `233836692`, `247620981`, and `1942989182` for the
second IWA guest, Kitchen Sink guest, and ordinary tab. Each guest hash was
stable on a second read. The probe returned Kitchen Sink to its original URL.
This closes the cross-owner canvas-identity slice on the clean emulator APK,
not the exception, audio, lifecycle, or physical-device matrix.

The disposable IWA's Google guest also passed
`scripts/test_iwa_controlled_frame_noise_reload.mjs`: the canvas hash was
`233836692` before and after a document reload. Android replaced the guest's
DevTools target during reload, so the probe reacquired the sole Google guest
instead of relying on a stable target ID. This checks one guest document
reload, not guest deletion/recreation or browser process restart.

`scripts/test_iwa_controlled_frame_noise_recreation.mjs` then created a named
in-memory Google guest under Kitchen Sink, sampled its canvas output, removed
it and waited for its DevTools target to disappear, then created a new guest
with the same partition name. The target changed and the two hashes were both
`1801887984`. The script removed the probe and returned Kitchen Sink to its
original page. This checks one same-partition guest teardown/recreation on the
emulator, not browser restart or cross-profile persistence.

An emulator-only diagnostic build exercised the real global preference gate
without shipping code: during Google navigation it saved
`prefs::kHeliumNoiseEnabled`, set it to false for the ordinary/guest policy
check, and immediately restored it. Browser logs reported `saved=1`,
`enabled=0`, `restored=1` for both guest and ordinary navigations. A public
same-origin canvas probe then returned the same raw hash (`631344798`) in an
ordinary tab and both IWA guests, as expected when noise is globally off.
After removing the diagnostic and reinstalling the original clean APK, the
three contexts again had distinct stable hashes. The temporary toggle had
written an explicit `true` preference; a second emulator-only cleanup build
used `PrefService::ClearPref` to restore the original default/unset state,
logged `absent=1 effective=1`, and was also removed. The clean source/APK
hashes, unset user preference, and dedicated command-line hash were verified.
Neither diagnostic is in the ordered patch series or on a physical device.
This is a bounded global-pref runtime check, not an always-run regression.

The ordinary-site exception was then tested across an actual browser-process
restart with a separate disposable emulator build. Its `block` mode used
Helium's `SetHeliumNoiseEnabledForOrigin()` once for Google, and the profile
stored a `helium_noise` BLOCK entry. After switching to a no-mutation
`observe` mode and restarting, the stored BLOCK still made the ordinary Google
navigation report `enabled=0`, while both signed IWAs' Google Controlled Frame
guests reported `enabled=1`. The public probe returned the raw ordinary hash
`631344798` and two distinct stable guest hashes (`672520020`, `1917780829`).
The diagnostic's `reset` mode cleared that exact Google exception through the
same Helium API; the `helium_noise` map returned to `{}`. The original command
line and clean source/APK hashes were restored, then a cold clean-APK probe
again returned three distinct stable hashes with the exception map still
empty. Diagnostic code and APK were excluded from the patch series and real
devices. This is reproducible emulator evidence, not an always-run test.

The clean APK was then cold-started through the app-ID-only shim a second
time, with no diagnostic flags or site exceptions. Its ordinary Google tab
and the two separately owned Google guests again produced three distinct,
stable hashes (`223333158`, `537614138`, `2351558172`). The values changed
from the previous browser process, as session noise can, but no cross-context
linkage appeared. The user noise preference remained unset, the site
exceptions map remained `{}`, and the normal dedicated flag/APK hashes were
unchanged. This closes a bounded clean-process-restart identity check.

The audio path was probed with
`scripts/test_iwa_controlled_frame_audio_noise.mjs` using only
`OfflineAudioContext`: each context rendered 8192 constant 0.5 samples. With
normal features, the ordinary Google tab and Google guests in two signed IWAs
all returned non-raw samples, and their many-sample mean offsets were distinct
and repeatable within each context. Exact full-buffer hashes changed between
renders, consistent with Helium's per-render coordinate jitter, so hash
stability is **not** the assertion. With only `HeliumNoiseAudio` disabled in a
disposable emulator command line, all three contexts returned exactly 0.5 for
every sample and identical raw hashes. Restoring the normal flags and cold
launching again restored distinct stable mean offsets. The user noise pref
remained unset, site exceptions `{}`, and the normal command-line hash was
verified. This is bounded public audio-output evidence plus a negative
feature control, not microphone, playback, consent, or physical-device proof.

This does not yet cover extension WebView regression, always-run browser-level
policy tests, or physical-device upgrade. Do not allowlist `HELIUM_NOISE` or
claim production isolation until those checks and review pass. The
experimental IWA update guard remains independently required.

An independent pinned-source review of patch 0055 found no demonstrated bypass of
the experimental owner/partition checks. It did identify a defensive ordering
issue: the owner frame must be null-checked before the delegated Controlled
Frame ownership check, which dereferences it. Patch 0055 was adjusted to do
that. The review still requires always-run production GuestView/navigation and
policy tests, extension WebView fallback, detach/owner-navigation and MPArch
coverage (where supported) before privacy sign-off; physical canary evidence
is recorded below.

After that review, the arm64 v2-signed patch-0055 APK (SHA-256
`630492c6cbc668bdd8dbce627206a15706117573c1d36ddffff95d502e3b2ed6`)
was upgraded in place on the Samsung SM-X710 and Pixel 10 Pro XL, tablet
first. The app-owned shim launched Kitchen Sink and Google rendered inside
Controlled Frame on both. A temporary ordinary Google tab, the existing
guest, and a second ephemeral guest partition returned three distinct canvas
hashes per device, stable across two runs. Exact hashes and rollback APKs are
recorded in `issues/006-controlled-frame-noise-isolation.md`; screenshots are
under `$TMPDIR/xenon-iwa-0055-physical.iaVC1I/`. Test tabs/guests and
ADB forwards were removed, app/shim/data and original shared flags preserved.
This closes a physical canvas canary, **not** the always-run browser policy,
extension WebView, detach/owner-navigation, MPArch, or device-audio gates.

The physical offline-audio output gate was then checked with an explicit
single-IWA variant of the public probe. An ordinary Google tab and Kitchen
Sink's Google guest on each device returned non-raw 8192-sample output with
different, repeatable mean offsets. Exact hashes varied as expected from
per-render jitter; the earlier emulator feature-disabled control returned
exact raw samples. No microphone, speaker, recording permission, or network
audio was involved. Temporary tabs and forwards were removed, and original
flags verified. This still does not cover audio consent/playback or the
always-run browser-policy and extension-WebView regression gates.

The pinned Android GN configuration has `enable_extensions=false` and
`enable_extensions_core=true`: Controlled Frame uses the latter, but a full
extension-owned WebView is not part of this APK's runtime surface. Patch 0055
still returns no guest scope unless the browser-owned guest reports Controlled
Frame ownership. A runtime extension-WebView fallback test becomes mandatory
if full Android extensions are later enabled; it has not run here. The
currently reachable GuestView/navigation, policy, and detach boundaries still
need always-run tests before privacy sign-off.

## Pre-attach guest navigation race

A repeated Android 16 emulator teardown/recreation probe found a real gap in
patch 0055. In one run, the replacement Google Controlled Frame returned the
same text-canvas **and font-free shape-canvas** hashes as an ordinary Google
tab in the same browser process. Both outputs remained stable after the guest
reached `interactive`; the browser main process did not restart. A disposable
browser-only trace identified the cause at `ReadyToCommitNavigation`: the
browser-owned guest, owning frame, Controlled Frame entitlement, and nondefault
partition were present, but `GuestViewBase::attached()` was temporarily false.
The 0055 attachment gate therefore omitted the guest token scope and Helium
used its ordinary-origin scope for that document. The diagnostic logged only
association booleans and navigation IDs, never tokens or scope values.

Patch 0056 narrows this to the browser-owned `WebViewGuest` type, requires a
live owner and Controlled Frame entitlement, and retains the helper's full IWA
origin/partition validation; it does not require the attachment transition to
have completed. In a diagnostic emulator build, two 20-iteration races and an
ordinary-tab/two-guest-partition comparison passed. The same 20-iteration race
and three-context comparison passed again in an uninstrumented x86 build.
This addresses the reproduced path but does not replace an always-run browser
integration regression, MPArch coverage, or privacy sign-off. The reviewer's
pinned-source review found no source-level blocker but requires owner-loss,
changed-owner, ordinary/non-WebView and same-partition regression cases.
The v2-signed arm64 APK was upgraded in place on the tablet and Pixel, with
matching on-device hashes and rollback APKs. The tablet visibly rendered
Kitchen Sink and Google Controlled Frame. The Pixel reached WebappActivity but
was biometrically locked, so fresh visible rendering and physical privacy
output were not checked. Original shared and dedicated flags, app data, shim,
and ordinary browser were preserved. See issue 006 for hashes and evidence.
