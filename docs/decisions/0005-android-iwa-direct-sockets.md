# Android IWA Direct Sockets boundary

Status: optional patch 0051 is under emulator validation; not production-ready

The signed Kitchen Sink IWA requests `direct-sockets` and
`direct-sockets-private` for `self`. On the lab Android 16 emulator, its
packaged page was a secure, cross-origin-isolated context and
`document.featurePolicy.allowsFeature('direct-sockets')` returned true, yet
`TCPSocket`, `TCPServerSocket`, and `UDPSocket` were all `undefined`.
`scripts/probe_iwa_direct_sockets.mjs` reproduces this through the page's
public JavaScript API and exits nonzero. This is a missing implementation,
not a manifest or extra command-line-flag problem.

Pinned Chromium 154 explicitly excludes Direct Sockets on Android at several
separate boundaries:

- `NavigationRequest::ReadyToCommitNavigation()` does not enable the
  per-context Blink `DirectSockets` feature under `IS_ANDROID`.
- `content/browser/BUILD.gn` excludes `DirectSocketsServiceImpl`, and
  `browser_interface_binders.cc` excludes its frame and worker binders.
- `chrome/browser/direct_sockets/BUILD.gn` asserts `!is_android`; the browser
  dependency, delegate include, and `GetDirectSocketsDelegate()` override are
  likewise desktop-only.

Port this only in the optional `is_desktop_android` IWA tier. The first slice
should expose **frame-owned** sockets to an installed IWA with the manifest
policy, compile/bind the browser service, and retain the delegate's content
setting, protocol, address, and port checks. Ordinary pages, IWAs without the
policy, and Controlled Frame guests must remain unable to use the API. Leave
shared- and service-worker sockets disabled until their lifecycle and policy
paths have separate tests. Keep the ordinary `org.agent54.xenon` build
unchanged.

The behavior sequence is:

1. Make the checked-in CDP probe green on the emulator without changing its
   manifest or enabling a global flag.
2. Against a controlled loopback/LAN echo fixture, exchange bytes over TCP
   and UDP; verify a TCP listener, error closure, and cleanup on app shutdown.
   Do not scan or contact unrelated LAN devices.
3. Check denial for an ordinary HTTPS tab, the signed Hello Xe IWA without
   `direct-sockets`, a Controlled Frame guest, disallowed private/multicast
   requests, and invalid/bound privileged ports. Add lower-level tests for
   permission and URL checks rather than treating a missing constructor as a
   sufficient denial test.
4. Build both ABIs, then repeat the positive and denial flows on the tablet
   and Pixel without replacing the ordinary browser. Test backgrounding,
   screen lock, process restart, and network loss/recovery.

This API is independent of the Android IWA update-lifecycle guard. Do not
remove patch 0025 to make socket tests pass.

## Experimental patch 0051

Patch 0051 is separate from core IWA and Controlled Frame. On the lab
Android 16 emulator, the first x86-64 build made the public API probe green.
Kitchen Sink exchanged bytes over TCP and UDP loopback and accepted a local
TCP connection. An ordinary HTTPS tab and Google's Controlled Frame guest had
no constructors; the signed Hello Xe IWA had constructors but opening a TCP
socket was rejected because it lacked the manifest policy. Restricted bind
ports were rejected. These checks did not scan or contact other LAN hosts.
On the revised x86-64 build, a same-origin Kitchen Sink child frame inherited
the permitted API; a child frame with `allow="direct-sockets 'none'"` still had
the constructor but its TCP construction failed with `NotAllowedError` before
opening a socket. An ordinary HTTPS page still had no constructors, and the
signed Hello Xe IWA without the manifest policy still rejected opening one.

The reviewed revision also removes an obsolete private-network content-setting
registration and prevents a dedicated worker from inheriting the frame API:
the Android worker Mojo binder remains absent and invoking it would report a
bad message. A separate signed IWA from
`tests/fixtures/iwa-worker-probe/build.mjs` was installed on the lab Android
16 emulator to test that boundary through the public API. Its top-level page
reported `function` for `TCPSocket`, `TCPServerSocket`, and `UDPSocket`; its
same-origin dedicated worker reported `undefined` for all three and returned
the result to the still-running page. No worker bad-message or crash appeared
in the checked log window. The bundle was generated with an ephemeral signing
key and is not committed. Two initial fixture revisions were rejected for
invalid primary-URL metadata and a missing icon; the corrected fixture
installed successfully. The temporary installer switch was removed from the
experimental emulator command line immediately afterward. This does not
exercise shared/service workers, which remain unsupported.

On the final x86-64 emulator build, deliberately selecting **Block** for
both the on-device-services and local-network permission prompts caused TCP
and UDP loopback opens to reject with `InvalidAccessError: Access to local
network is blocked.` The IWA page remained open. This tests the user-prompt
denial path, not an explicit `DIRECT_SOCKETS` content-setting exception.

This is not sign-off. A permanent explicit-BLOCK regression harness,
permission revocation, pending connection navigation/destruction, and
physical-device behavior remain to be tested. TCP listening has a separate
upstream path from outbound
connection consent, so listener permission behavior also needs its own check. Updates
remain guarded independently.

The Chrome delegate checks `ContentSettingsType::DIRECT_SOCKETS`, whose default
is ALLOW on this experimental Android build, before accepting an IWA request.
Chromium's Android site settings has no UI group for this hidden type, and
CDP `Browser.setPermission` rejects the name `direct-sockets` as an invalid
permission descriptor. The local-network prompt Block test above exercises a
different setting. The focused native test and bounded temporary browser
probe below exercise explicit BLOCK without hand-editing profile Preferences;
an always-run production test target and revocation test remain open.

## Content-setting origin regression

A focused Android-native `HostContentSettingsMap` test exposed a real scheme
registration gap: setting `DIRECT_SOCKETS` to BLOCK for one `isolated-app://`
origin still returned ALLOW. `ChromeMainDelegate` registered the IWA scheme as
a non-wildcard, portless content-settings pattern only on desktop platforms,
not desktop Android. The focused test was red before registering that scheme
in its isolated harness and green afterward: BLOCK applied to the first IWA
while a second IWA retained the default ALLOW setting. Patch 0052 keeps the
test in the optional series; patch 0053 registers `isolated-app` on the
optional desktop-Android tier at real browser startup. The ordinary Android
build's scheme list remains unchanged.

Both x86-64 and arm64 browser APKs and the narrow native test target built.
The x86-64 APK upgraded the disposable emulator in place; the app-owned shim
still launched Kitchen Sink, whose page reported Direct Sockets and Controlled
Frame constructors in a secure, cross-origin-isolated context. The arm64 APK
verified with APK Signature Scheme v2.

A temporary **emulator-only** browser probe then exercised the actual delegate
path. Before the probe, Kitchen Sink opened a `TCPServerSocket` listener.
The probe used `HostContentSettingsMap::SetContentSettingDefaultScope()` to
set `DIRECT_SOCKETS` to BLOCK for the requesting IWA origin, read the setting
back as BLOCK, immediately reset it to DEFAULT, and let the delegate deny the
request. The public listener attempt failed with `InvalidAccessError: Access
to the requested host or port is blocked.` The probe was not added to the
patch series. Its switch and APK were removed, the source change was reversed,
the command line restored to its original 58-byte content, and the normal
x86-64 APK rebuilt byte-for-byte equal to its pre-probe backup (SHA-256
`94f2e9c7cb7631c690ee9e1ae6d6f65ae43a0224ba6b6ef8b22732eeb580b06e`).
The experimental profile's `direct_sockets` exceptions remained empty. With
the normal APK and flags restored, the same public listener opened again.
This is a bounded browser-level BLOCK check, not a user-facing permission UI
or a revocation test for already-open sockets. The disposable source probe and
its required backup/restore procedure are kept in
`tools/emulator-probes/iwa-direct-sockets-block/`; it is deliberately excluded from
the build patch series.

The fixture now has a repeatable public-API assertion,
`scripts/test_iwa_direct_sockets_block.mjs`. On 2026-09-25 the current
production x86-64 APK passed its `allow` case and failed its `block` case
with an opened listener, establishing a sensitive red check. The disposable
diagnostic APK then passed `block` with `InvalidAccessError` and the browser
log marker `XENON_IWA_DIRECT_SOCKETS_BLOCK_PROBE=1`. After reversing the
test-only patch, rebuilding and reinstalling production, its on-device APK
matched the pre-probe backup SHA-256
`aaacb74444499cee72aa37aed376bdbb8237b317b1a55e375482568429d4e1db`,
the original experimental command-line hash was restored, the profile had
zero `direct_sockets` exceptions, and `allow` passed again. This is a
reproducible disposable-emulator regression fixture, not a shipped test hook
or a complete production-facing permission UI.

One bounded lifecycle check passed on the lab Android 16 emulator: Kitchen
Sink opened a `TCPServerSocket` on `127.0.0.1:39675`, a controlled local
connection succeeded, and then its document navigated to `about:blank`. A
direct emulator-side connection to the same port returned connection refused.
The browser remained responsive and the app-owned shim launched Kitchen Sink
again. This shows teardown of that listener on document navigation; it does
not cover an in-flight outbound connection, a permission change after opening,
or every activity/process shutdown race. The temporary ADB port-forward was
removed and no physical device was involved.

`scripts/test_iwa_direct_sockets_active_teardown.mjs` extends this check to an
accepted, live TCP connection. On the same emulator, the Kitchen Sink page
accepted a controlled host connection and read its marker; navigation to
`about:blank` then closed that host connection within ten seconds. The script
removed its ADB forward. This verifies an active accepted socket's document
teardown, not an outbound socket or permission revocation.

`scripts/test_iwa_direct_sockets_outbound_teardown.mjs` separately exercises
an active outbound `TCPSocket`. Its server binds only to the lab host's
loopback address; the Android emulator reaches it through its documented
`10.0.2.2` host-loopback gateway. The first run exposed the on-device-services
and local-network consent prompts, which were allowed on the disposable
emulator. With those grants, the signed Kitchen Sink IWA opened the socket,
the host accepted it, and navigation to `about:blank` closed the connection.
The script's second run passed with the server still bound only to loopback.
The app-owned shim then reopened the packaged IWA. No physical device or
unrelated LAN peer was contacted. This does not cover an outbound connection
*pending* at navigation, a consent-dialog race, or network loss.

A separate signed fixture with a fresh app origin then exercised that pending
case. The first fixture revision was secure but not cross-origin isolated, so
`TCPSocket` rejected before consent; its manifest now explicitly requests
`cross-origin-isolated` plus the direct-sockets and local/loopback-network
policies. After installing a new ephemeral-key bundle on the disposable
emulator, the page reported `isSecureContext=true`,
`crossOriginIsolated=true`, and the Direct Sockets policy enabled.
`scripts/test_iwa_direct_sockets_pending_navigation.mjs` initiated an outbound
request to a host-loopback listener without awaiting it. The Android local
network consent dialog was visibly open, the promise remained pending, and
the host saw no connection. Navigating the IWA to `about:blank` dismissed the
dialog and still produced no connection; the browser stayed responsive and
the verified app-ID launcher reopened the fixture. A second run passed with
the dialog captured at `$TMPDIR/xenon-pending-consent.png`. No permission
was granted to that fixture. The one-time installer switch was removed and
the dedicated experimental command line restored to its original 58-byte
SHA-256 `61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`.
This bounds one navigation-while-consent-pending case, not every callback or
simultaneous permission race.

An emulator-only setting-change probe in
`tools/emulator-probes/iwa-direct-sockets-revocation/` clarified the latter boundary.
With one accepted TCP connection active, the test hook set the IWA origin's
`DIRECT_SOCKETS` setting to BLOCK through `HostContentSettingsMap` and read
back BLOCK. A second listener request rejected with `InvalidAccessError`, but
the already accepted connection still transferred bytes. The hook then reset
the setting to DEFAULT; a fresh listener opened. This is consistent with the
source: the Chrome delegate checks the content setting on new requests, while
neither the delegate nor service subscribes to later setting changes for
socket teardown. Therefore, BLOCK is an **admission gate**, not immediate
revocation of existing sockets in this port. Production policy must state that
semantics explicitly or add separately reviewed active-socket revocation; do
not claim the setting kills already-open connections. The probe's profile
exception returned to `{}`, and its APK, dedicated flags, and source were
restored; it is not in the production patch series.

The teardown probe also exposed an independent launch failure. After the
document became `about:blank`, launching the app-owned Kitchen Sink shim—or
directly starting the verified `IwaLauncherActivity` without force-stopping
the browser—brought the existing blank `WebappActivity` forward instead of
navigating it back to the installed IWA. A cold start using `am start -S`
restored the packaged page. The browser's generic webapp handler rejects the
`isolated-app://` URL on a warm intent even when asked to force navigation.

Separate activity-safety patch 0054 makes the already verified warm handoff
navigate through the existing browser navigation controller only when the
current page is outside the installed IWA's scope. Its token, app ID, launch
URL, and scope are checked before doing so; a normal in-scope resume remains
untouched. One focused Java behavior test first failed to compile before the
new guard, then passed; all 25 `WebappActivityTest` cases passed on the lab
Android 16 test runner. On an upgraded disposable emulator APK, a shim tap
after `about:blank` reopened the packaged Kitchen Sink; a shim tap while its
page was already in scope preserved a page-local marker. This is not physical
device sign-off or general navigation-capture support.

To regenerate the worker fixture, run `npm ci --ignore-scripts` in
`tests/fixtures/iwa-worker-probe`, then `node build.mjs /tmp/worker-probe.swbn`.
The printed bundle ID is new on every run because the test key is ephemeral.
Install only in a disposable experimental profile; do not commit the output.

## Samsung tablet canary

After the emulator safety checks above, the reviewed arm64 experimental APK
(SHA-256 `10965c7a78cf467d35ba692cd32fae239d8e5a54379f4b112130aca8b2d79bab`,
v2 signer certificate SHA-256
`32a2fc74d731105859e5a85df16d95f102d85b22099b8064c5d8915c61dad1e0`)
upgraded **only** `org.agent54.xenon.iwa` on the Samsung SM-X710 with
`adb install -r`. The prior APK is preserved at
`$TMPDIR/xenon-iwa-device-upgrade.lTkQaU/ChromePublic-latest.apk`
(SHA-256 `495a27f4b50c5b882d8a7bb6e11a20032472b0054d79665acf87ff783758904b`).
The on-device `base.apk` hash matched the candidate. The ordinary browser and
app-owned Kitchen Sink shim remained installed; no data was cleared. The
shared `chrome-command-line` hash stayed
`1c4df3c7d99afc27dc42245a6ee8c31e1ddb6ea1fe9a770919322494f461b76c`,
and the experimental-only command line stayed
`61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`.

The shim launched the packaged IWA visibly. Its page was secure and
cross-origin isolated, reported all three Direct Sockets constructors, and
retained the `direct-sockets` manifest policy. An accepted TCP connection
closed when the page navigated away; the shim reopened the IWA. Google's
Controlled Frame rendered, while its HTTPS guest reported all three socket
constructors `undefined`. `scripts/test_iwa_direct_sockets_device_echo.mjs`
then bound TCP and UDP echo servers only to the Mac's own Wi-Fi interface
(`<host-wifi-ip>`); the tablet exchanged the expected marker over both
protocols. Android showed a local-network permission prompt, which was
allowed for the experimental IWA to perform this test. The script rejects a
host address not assigned to the running Mac and contacts no other peer.
Only temporary ADB forwards created for this canary were removed. A final
force-stop of the experimental package followed by the app-owned shim again
rendered Kitchen Sink. Screenshots are under
`$TMPDIR/xenon-iwa-tablet-canary.olQ9GJ/`.

## Pixel canary

The same signed APK then upgraded only `org.agent54.xenon.iwa` on the
Pixel 10 Pro XL in place. Its prior on-device APK matched the rollback copy
above; the new on-device APK matched the candidate SHA-256. The ordinary
browser, Kitchen Sink shim, package data, shared command line, and dedicated
experimental command line were preserved. Once the phone was unlocked, the
shim visibly opened the packaged IWA and Google's Controlled Frame rendered.
The IWA reported secure and cross-origin-isolated context, the
`direct-sockets` manifest/document entitlement, and all TCP/TCP Server/UDP
constructors. The Google guest reported all three constructors `undefined`.
The bounded Mac Wi-Fi TCP and UDP echo test passed after Android's
local-network prompt was allowed for the experimental IWA. An accepted TCP
connection closed on navigation to `about:blank`; the shim recovered the
packaged page, and a final force-stop/shim launch visibly cold-started it.
Only the temporary Pixel ADB forward was removed. Screenshots are under
`$TMPDIR/xenon-iwa-pixel-canary.typBsM/`.

Both physical canaries passed these bounded checks. They do not validate
background/lock or network-loss lifecycle, all permission races, a permanent
browser-level BLOCK regression, the IWA update path, or Helium's separate
Controlled Frame fingerprint-noise isolation issue. Keep the WIP PR unmerged
and patch 0025's update guard in place.

## Brief background/foreground lifecycle

`scripts/test_iwa_direct_sockets_background.mjs` ran twice on the lab
Android 16 emulator with the signed Kitchen Sink IWA. It opened a loopback
TCP listener in the page, accepted a host connection through a temporary ADB
forward, and received a marker before backgrounding. After `KEYCODE_HOME`,
the page reported `document.visibilityState === "hidden"` and the same
accepted connection received another marker. Launching the app-owned shim
resumed the same packaged page and preserved its page-local probe. The script
removed only its temporary forward; the emulator's pre-existing DevTools
forward remained. This shows a short, live background interval, not survival
under Android process reclamation, screen lock, long idle, or network loss.
