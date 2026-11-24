# [P0] Isolate Helium fingerprint-noise state for Controlled Frame guests

Status: in progress; patch 0055 is experimental, not release sign-off
Depends on: none
Blocked by: none
AFK: yes

Observable behavior: same-site ordinary tabs and storage-distinct
Controlled Frame guests do not share a fingerprint-noise token or permission
exception merely because they use one profile and origin.

Acceptance criteria:
- Reproduce the current same-origin canvas linkage with a deterministic
  ordinary-tab/default-guest/second-partition fixture; also test an ordinary
  profile noise exception and audio output without overstating inference.
- Key guest noise settings/tokens to the owning IWA and guest partition (or
  a reviewed equivalent) while maintaining stable behavior within one guest.
- Prove no cross-app, cross-partition, or ordinary-tab linkage and no privacy
  weakening. Only then consider the `HELIUM_NOISE` Controlled Frame enum.

Tests: red/green public canvas/audio fixture plus focused native/renderer
tests on emulator. Safety: do not globally allowlist `HELIUM_NOISE`, disable
noise, or modify the ordinary browser profile to conceal the issue.

References: `docs/decisions/0003-android-controlled-frame-boundaries.md`.

2026-09-25 source trace: the browser-owned `NavigationRequest` has both the
prospective full storage-partition config and guest/embedder relationship at
ReadyToCommit; IWA Controlled Frame partition creation validates the owner and
uses the IWA partition domain. Helium's current noise callback throws away
those inputs. Decision 0003 records the narrow identity contract and tests to
establish before any policy/token change. No noise logic or permission enum was
changed by this trace.

The repair has **two independent gates**. `GetHeliumNoiseState()` checks the
profile-wide `HELIUM_NOISE` site exception by HTTP(S) URL, without guest or
partition identity. `HeliumNoiseTokenData::GetTokens()` then derives each
feature token from BrowserContext session state and origin alone. A token-only
change would still let an ordinary-tab exception disable guest noise; a
policy-only change would still let same-origin ordinary and guest pages share
canvas/audio token identity. Neither partial change meets this issue.

Test matrix before allowing the Controlled Frame permission enum entry:

| Context at one HTTP(S) origin | Default policy | Ordinary-site BLOCK | Token identity |
| --- | --- | --- | --- |
| Ordinary tab | Noise enabled | Noise disabled | Stable ordinary token |
| Guest A in IWA 1, partition X | Noise enabled | Still enabled | Stable within X; distinct from tab |
| Guest A in IWA 1, partition Y | Noise enabled | Still enabled | Distinct from X and tab |
| Guest A in IWA 2, partition X | Noise enabled | Still enabled | Distinct from IWA 1 and tab |

Also test global noise-pref disable across all contexts, guest reload and
teardown, and an ordinary extension WebView. Derive guest identity only after
checking the browser-owned embedder IWA origin against the prospective full
partition config; do not trust a renderer-supplied partition name or prefix.
The current source establishes the missing inputs, but this matrix has **not**
run and no noise fix has landed.

2026-09-25 focused test-harness result: a temporary Android-native target
compiled only Helium's `noise_token_data.cc` plus a small behavior test, without
the broken broad `TestingProfile` graph. With one user-data host and one
HTTP(S) origin, the test requested ordinary, partition-X, partition-Y, and
second-IWA token maps. It failed against the old origin-only derivation (all
maps equal), then passed when a nonempty guest-scope input was separated from
the ordinary origin and included in the hash domain. This validates a narrow
token-derivation seam **only**: the production navigation path still supplies
no browser-validated guest scope, and the ordinary site-exception policy is
unchanged. The experiment was not added to the ordered patch series or to
either device. Lab source files and GN graph were restored to their exact
pre-test hashes; staged experiment files remain at
`$TMPDIR/xenon-noise-test.bb1uqd/` for the next vertical slice. Do not
ship an optional scope parameter without trusted embedder/config validation
and the independent policy test.

2026-09-25 owner/partition validator experiment: a second narrow Android-native
target used the real `IwaOrigin` and `StoragePartitionConfig` types. Its test
failed red when no scope was returned, then passed when the validator required
the IWA embedder's derived partition domain, rejected an ordinary HTTPS
embedder, a foreign-IWA domain, default storage, and the IWA's persistent base
partition. It returned stable, distinct scopes for different partition names,
memory modes, blob-fallback modes, and owning IWAs; an unnamed in-memory guest
remained valid. The native test needed a scoped `isolated-app` URL scheme
registration because this tiny runner does not initialize Chrome's scheme
registry. This is a **pure validator experiment**, not proof that
`NavigationRequest` passes the true browser-owned embedder and prospective
partition or that Helium's profile site exception is isolated. No validator
was added to the ordered series or installed on devices. Lab source/GN were
restored to pre-test state; staged files are at
`$TMPDIR/xenon-noise-scope.c7k8lN/` for a reviewed navigation handoff.

2026-09-25 integrated emulator slice: patch 0055 combines both previously
separate tests with a navigation callback. The initial `IsGuestViewMainFrame`
handoff failed a public same-origin canvas probe because this Android guest
uses the legacy GuestView WebContents path and reports a primary main frame.
The revised callback resolves `GuestViewBase` from the navigation handle,
requires Controlled Frame ownership and attachment, then checks the owner's
IWA origin against the full prospective partition config. The clean emulator
APK produced different ordinary-tab and guest Google canvas hashes; repeated
reads were stable. Both focused Android-native tests passed. A disposable
emulator build briefly set a real ordinary-site BLOCK exception at the policy
boundary and observed ordinary `ENABLED=0`, guest `ENABLED=1`; it restored
the exact exception and confirmed the profile exception map was empty.
Diagnostic mutation/logging are not in patch 0055. No physical device was
upgraded. The persistent-exception, global-pref, cross-app,
audio, teardown/recreation, and extension-WebView matrix remains open; do not
allowlist `HELIUM_NOISE` yet.

Follow-up on the same clean emulator APK: the repeatable
`scripts/test_iwa_controlled_frame_noise_partitions.mjs` created a second
ephemeral Google Controlled Frame partition under Kitchen Sink. Ordinary tab,
first guest, and second guest gave three distinct, repeatable canvas hashes;
the extra guest and its DevTools target were removed after each run. This
closes the *one-IWA, two-actual-partitions* slice, not the second-owner,
persistent-exception, audio, or lifecycle slices.

Cross-owner follow-up: a separate disposable signed IWA with its own manifest
`controlled-frame` policy was installed in the experimental emulator profile.
The public `scripts/test_iwa_controlled_frame_noise_cross_app.mjs` probe
compared its Google guest to Kitchen Sink's Google guest and an ordinary Google
tab at the same HTTP(S) origin. All three canvas hashes differed and each
guest result was stable on repeat. The original one-time installer flag was
restored before testing. This closes the emulator cross-owner canvas-identity
slice, but not persistent ordinary-site exceptions across navigation, global
preference, audio, teardown/recreation, extension WebView, or real devices.
The disposable guest's canvas hash also stayed stable across one document
reload after its DevTools target was replaced. Guest deletion/recreation and
browser-process restart remain open.

A named in-memory Google guest under Kitchen Sink was removed and recreated
with the same partition name. Its DevTools target disappeared and was replaced,
while the canvas hash remained the same. The temporary guest and its target
were removed; Kitchen Sink returned to its original page. This closes one
emulator same-partition teardown/recreation slice, not browser restart.

Global-preference follow-up: a disposable emulator-only browser build set the
real Helium noise preference to false just for ordinary/guest Google policy
checks and restored it synchronously. Both checks reported disabled, and the
public ordinary-tab/two-IWA-guest canvas probe returned one common raw hash.
The original clean APK was rebuilt/reinstalled and distinct guest hashes
returned. A test-created explicit `true` preference was cleared through the
browser's `PrefService`, restoring the original unset/default state; source,
APK, preference, and command-line hashes were checked. No diagnostic code or
APK reached the patch series or physical devices. This closes a bounded
emulator global-pref behavior slice, not an always-run regression test.

Persistent ordinary-site exception follow-up: a disposable emulator-only
browser build used Helium's setting API to store a Google BLOCK entry in the
experimental profile. After a browser-process restart in no-mutation observe
mode, the ordinary Google navigation still reported noise disabled, while two
signed IWAs' Google guests reported enabled. A public probe returned one raw
ordinary hash and two distinct stable guest hashes. The exact exception was
then cleared via Helium's API; the profile's `helium_noise` exceptions returned
to `{}`. Clean source/APK/flags were restored and a cold public probe again
gave three distinct stable hashes. No diagnostic shipped or reached physical
devices. This closes a bounded persisted-exception runtime slice, not the
always-run security regression or production sign-off.

Clean-process follow-up: after the disposable exception test was removed, the
clean APK underwent another cold app-owned launch and browser-process restart.
The ordinary Google tab and two different IWA Google guests again had three
distinct stable hashes; session values changed, but isolation remained. The
user noise preference was unset, the site-exception map `{}`, and the normal
flags/APK hashes matched the baseline. Audio, extension WebView, physical
canaries, review, and always-run coverage remain.

Audio-output follow-up: the public offline-audio probe renders 8192 constant
samples in an ordinary Google tab and Google guests owned by two separately
signed IWAs. With normal features, all three are non-raw and their many-sample
means are distinct and stable within each context; exact buffer hashes vary
because Helium adds per-render coordinate jitter. With only
`HeliumNoiseAudio` disabled on the emulator, all three return exact raw 0.5
samples and identical hashes. Normal flags were restored and the distinct
means returned; profile noise pref remained unset and exceptions `{}`. This
closes a bounded offline-audio output slice, not device-audio consent or
physical privacy sign-off. Extension WebView, always-run browser policy tests,
physical canaries, and review remain.

An independent source review of patch 0055 found no demonstrated isolation bypass or
blocker to retaining the experimental patch. It verified the browser-owned
GuestView association, signed IWA origin/partition-domain validation, full
partition identity in token scope, and ordinary-page fallback against pinned
Chromium source. Its one defensive finding was that the owner frame should be
null-checked before `IsOwnedByControlledFrameEmbedder()`, which can dereference
the owner; patch 0055 now does so. This is not production sign-off: always-run
browser-level navigation/policy tests, extension WebView fallback,
detach/owner-navigation and MPArch coverage remain. Physical canaries are
recorded below.

Physical canary after an independent narrow review: the reviewed arm64 v2-signed APK
(SHA-256 `630492c6cbc668bdd8dbce627206a15706117573c1d36ddffff95d502e3b2ed6`)
upgraded only `org.agent54.xenon.iwa` in place on Samsung SM-X710, then Pixel
10 Pro XL. Both installed APK hashes matched. The app-owned Kitchen Sink shim
resumed `WebappActivity`, and screenshots show its Google Controlled Frame:
`$TMPDIR/xenon-iwa-0055-physical.iaVC1I/tablet-controlled-frame.png`
and `pixel-controlled-frame.png` in the same directory. A temporary ordinary
Google tab in each experimental profile plus the existing Google guest and a
second ephemeral guest partition were probed twice through the public canvas
API. Tablet hashes were `3754744346`, `4101386221`, `4070538747`; Pixel
hashes were `4156226191`, `38377092`, `1319478978`, respectively. Each set
had three distinct values, identical across its two runs. Temporary tabs and
guests were closed/removed, the app-owned shim returned to foreground, and
the test ADB forwards and screenshot files on devices were removed. Both
shared and dedicated command-line hashes remained unchanged, as did the
ordinary browser and shim packages. Prior APKs are backed up at
`$TMPDIR/xenon-iwa-0055-physical.iaVC1I/{tablet,pixel}-previous.apk`.
This is bounded physical canary evidence, not an always-run security
regression or production sign-off.

Physical offline-audio follow-up used the public probe's explicit
`--single-iwa` mode, which fails closed unless exactly one Google guest is
present. In an ordinary Google tab and Kitchen Sink's Google guest on each
device, 8192 constant 0.5 samples were rendered with `OfflineAudioContext`
twice. Tablet mean offsets were `0.5000044607149903` (ordinary) and
`0.5000135262271215` (guest); Pixel values were `0.49998043517553015` and
`0.5000193096893781`. All outputs were non-raw and each context's mean was
identical across its two renders, while exact buffer hashes changed due
per-render jitter. The emulator-only feature-disabled control previously
returned exact raw samples. No microphone, speaker, recording permission, or
network audio was used. Temporary ordinary tabs and ADB forwards were
removed, both shims restored to foreground, and command-line hashes
rechecked unchanged. This closes a bounded physical offline-output check, not
consent, playback, or always-run policy coverage.

Extension WebView scope check: the pinned x86-64 Android build reports
`enable_extensions=false` and `enable_extensions_core=true` via GN. The latter
is needed for Controlled Frame, but the full extension platform—and therefore
an ordinary extension-owned WebView page—is not an exposed runtime surface in
this APK. Source review still requires `GetHeliumNoiseGuestScope()` to return
no guest scope whenever browser-owned `IsOwnedByControlledFrameEmbedder()` is
false; the existing check does that before owner/partition scope derivation.
Keep an extension-WebView runtime regression conditional on enabling full
Android extensions in a future build, rather than claiming it ran here. This
does not waive the current browser-level GuestView/navigation and policy
regressions, detach/owner-navigation, or applicable MPArch tests.

Repeatable persisted-site-policy follow-up: a checked-in disposable emulator
fixture now probes the production `ChromeContentBrowserClient::HeliumNoiseEnabled`
decision with Helium's real site-setting API. Its public canvas script failed
unless the ordinary Google tab returned the pinned raw-control hash while the
same-origin Kitchen Sink Controlled Frame stayed distinct and stable. The
ordinary BLOCK entry survived a cold browser restart; the guest remained
enabled. Reset through Helium's API restored a noisy ordinary page and the
profile exception map to `{}`. Test-only source, flags and diagnostic APK were
removed; the installed APK and rebuilt clean source matched their pre-probe
hashes. See `tests/fixtures/iwa-controlled-frame-noise/README.md`. This is a
manual browser-level regression, not an always-run target. Next turn it into
an automated setup/cleanup gate and test owner detach/navigation rather than
claiming privacy sign-off.

Owner-navigation follow-up: `scripts/test_iwa_controlled_frame_owner_navigation.mjs`
uses the clean experimental APK and public CDP targets to enter Kitchen Sink's
Controlled Frame page, record the Google guest's canvas hash, navigate the
owning IWA activity to `about:blank`, and require the old guest target to
disappear. The app-owned shim then recovers the installed IWA URL; a new
Google guest target under the same partition gets the same hash. The script
passed twice on the earlier clean x86 emulator APK and once on the latest
clean x86 build after the owner-null fix. On that latest build the before and
after hash was `1661238301`; it is session-specific and must not be compared
across browser restarts. The script restores Kitchen Sink home in `finally`.
This covers normal owner navigation and guest teardown, not a race between
detach and a concurrent new navigation, process death, or MPArch paths.

Bounded detach-race follow-up: the new emulator-only
`scripts/test_iwa_controlled_frame_detach_race.mjs` requires Kitchen Sink home
with no existing Google guests and an `emulator-*` serial. It alternates an
outstanding guest-renderer promise with a same-origin Google guest navigation,
then navigates the owning IWA to `about:blank` before the guest work settles.
Each iteration requires every old guest target to disappear, the experimental
browser main PID to stay unchanged, the app-owned shim to recover the installed
IWA, and the recreated partition's canvas hash to match the pre-detach hash.
Five busy-renderer-only iterations and an initial ten alternating
busy-renderer/navigation iterations passed on the clean lab Android 16
emulator. A later ungated rerun observed one hash mismatch when the first
guest was sampled at `document.readyState=loading` and the replacement at
`interactive`; the browser PID stayed unchanged and a second replacement
sample kept the new hash. Two subsequent 20-iteration alternating runs passed
with ready-page hash `4005775893` stable in that session. A new self-contained
same-origin probe in that same process/session measured the ordinary Google
tab's text-canvas hash as **`154558272`**, exactly equal to the anomalous
replacement guest hash; the normal first and second guest partition hashes
were `4005775893` and `2922656546`. This is evidence of possible temporary
ordinary-scope fallback, although the original mismatch lacked a simultaneous
ordinary-tab control and its cause is still unproven. Do not dismiss it as
font loading or claim privacy sign-off. The scripts now require two stable
samples after loading and check a font-free geometric canvas hash as well as
the text hash. A ten-iteration follow-up passed with both hashes stable. The
script returned Kitchen Sink to home; original dedicated flags and the
pre-existing CDP forward were unchanged. A later 20-iteration diagnostic run
reproduced the mismatch at iteration 11: the recreated guest held text/shape
hashes `4165250360`/`523475756`, while the original guest held
`2667760300`/`115530355`. The ordinary Google tab created immediately
afterward in that same browser process/session had exactly
`4165250360`/`523475756`. Browser log for the failing navigation reported a
browser-owned guest, live owner and Controlled Frame ownership, but
`attached=0`; the extra attachment gate returned no guest scope. This is a
demonstrated ordinary-scope fallback, not a font-loading artifact. A focused
fix must preserve trusted guest/owner/partition checks while allowing the
pre-attach commit, then pass the same race and ordinary/partition checks
before physical deployment. The diagnostic logs contain no noise tokens or
scope values, and the probe must be removed after testing. This remains a
public browser canary, not deterministic coverage of every
`ReadyToCommitNavigation` interleaving, a physical-device stress test, an
always-run policy gate, or MPArch coverage.

Patch 0056 is that narrow candidate: it requires the browser-owned guest to
be a `WebViewGuest`, a live owning frame, Controlled Frame entitlement and the
existing owning-IWA/full-partition validator, without depending on the
attachment-complete flag. Two diagnostic 20-iteration races and a clean APK
20-iteration race passed; so did same-origin ordinary-tab/first-guest/
second-guest text and shape comparisons. The clean x86-64 APK is on the lab
emulator only (SHA-256
`37789bb587d078bdbd00cfcc52e84ce31de70877b4e433c951fc3fc745c952f9`).
Both ABI APK builds passed and the arm64 APK v2 signer verified. The reviewer's
pinned-source review found no source-level blocker, while calling for an
always-run browser regression and owner-loss/changed-owner negative cases.
The v2-signed arm64 APK (SHA-256
`a9123e85c847702b6fc653fc9dba251049468a2a1a2d549383ce380906418c42`)
was then installed in place on the Samsung SM-X710 and Pixel 10 Pro XL;
on-device hashes matched, and both previous APKs (SHA-256
`630492c6cbc668bdd8dbce627206a15706117573c1d36ddffff95d502e3b2ed6`)
were backed up under `$TMPDIR/xenon-iwa-0056-physical.LaDBKZ/`.
The tablet cold shim launch visibly rendered Kitchen Sink and Google inside
Controlled Frame (screenshot `tablet-controlled-frame.png` in that directory).
The Pixel was biometrically locked: its activity record reached experimental
`WebappActivity`, but fresh visible rendering and a physical privacy probe
could not be verified without unlocking. Neither ordinary browser, app data,
shim nor shared/dedicated command-line hashes changed; no physical profile
setting or guest exception was edited. This is not security sign-off: an
always-run browser integration regression, owner-loss/changed-owner and
MPArch negative coverage, and an unlocked Pixel privacy canary remain.
