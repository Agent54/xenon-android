# Disposable browser-level BLOCK probe

This patch is **not** in `patches/iwa/series`. It is a temporary test-only
instrumentation of `ChromeDirectSocketsDelegate` for a disposable Android
emulator. Never ship an APK containing the `xenon-test-block-iwa-direct-sockets`
switch. Do not run it against the ordinary Xenon package or a physical device.

The switch briefly sets the requesting IWA's `DIRECT_SOCKETS` content setting
to BLOCK using Chromium's API, reads it back, invokes the browser's real
content-setting gate while BLOCK is active, resets it to DEFAULT, and returns
that gate's denial. It logs `XENON_IWA_DIRECT_SOCKETS_BLOCK_PROBE=1` only when
the setting held and the gate rejected it.
The intent is to test the real browser profile's scheme registration and public
socket denial after patches 0052–0053; it is not a user-facing permissions UI.

Use the checked-in public-API test with the installed Kitchen Sink origin:

```sh
node scripts/test_iwa_direct_sockets_block.mjs \
  http://127.0.0.1:9225 \
  isolated-app://b7looprugym3zyxqffzqdz4mzc2vz4j6ge3arxg2ybbzwgb6ne2qaaic/ \
  allow
```

The normal APK must open a `TCPServerSocket` listener. The same test with
`block` must fail before the diagnostic APK is installed; this verifies the
assertion is sensitive to an unblocked browser. After applying the test-only
patch, building/installing that APK and cold-starting it with the dedicated
test switch, run the same command with `block`. It must see a public
`InvalidAccessError`, and logcat must contain
`XENON_IWA_DIRECT_SOCKETS_BLOCK_PROBE=1` for that process. The script does
not set a content setting or touch profile preferences itself.

Before applying the patch, verify that the emulator's experimental profile has
no `direct_sockets` exception, back up its installed APK and dedicated
`/data/local/tmp/xenon-iwa-command-line`, and verify a Kitchen Sink
`TCPServerSocket` listener opens normally. Apply this patch only to the
isolated builder checkout, build and install the experimental APK in place,
add the switch only to the dedicated experimental command line, and cold
launch Kitchen Sink through its app-owned shim. A listener should reject with
`InvalidAccessError` and the probe log marker should be `1`.

After the test, restore the command line and the backed-up production APK,
reverse this patch, rebuild the normal APK, and confirm its SHA-256 equals its
pre-probe backup. Verify the experimental profile still has no
`direct_sockets` exception and that a listener opens again. If the test process
crashes while the setting is temporarily changed, do not assume cleanup;
inspect and recover the disposable emulator profile before further testing.

On 2026-09-25, the normal x86-64 APK first passed `allow` and failed `block`
with an opened listener. The diagnostic APK then passed `block` with
`InvalidAccessError` and the log marker. After the test, the restored source
matched its pre-probe SHA-256, the rebuilt and installed production APK both
matched the backup SHA-256
`aaacb74444499cee72aa37aed376bdbb8237b317b1a55e375482568429d4e1db`,
the dedicated command-line hash returned to
`61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`,
the profile had zero `direct_sockets` exceptions, and `allow` passed again.
This remains a disposable emulator fixture, not a production permissions UI
or a test of immediate revocation of existing sockets.

On 2026-09-25, review found that the first version reset BLOCK before the
production gate ran and returned a synthetic denial. The fixture was corrected
to call `IsContentSettingAllowedForUrl()` while BLOCK is active and return
that gate's denial. The revised x86-64 diagnostic APK produced the log marker
and the public listener rejected with `InvalidAccessError`. After reversing
the test-only patch, the production APK rebuilt to its original SHA-256
`aaacb74444499cee72aa37aed376bdbb8237b317b1a55e375482568429d4e1db`;
the emulator's installed APK matched, its dedicated command-line returned to
SHA-256 `61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`,
and a public TCP listener opened again. This remained a disposable fixture;
issue 009 requires an always-run test and cross-app isolation.

The public-API script was then extended to check TCP listen, TCP client, and
UDP under BLOCK. On the normal APK, `allow` opened a TCP listener and `block`
failed its assertion as expected: TCP listen and UDP opened, while a TCP
client to unused loopback port 1 failed with `NetworkError`, not permission
denial. On the revised diagnostic APK, all three socket forms rejected with
`InvalidAccessError`, and logcat recorded the real content-setting gate's
marker for each request. The test-only source was reversed; the rebuilt and
installed normal APK both matched SHA-256
`aaacb74444499cee72aa37aed376bdbb8237b317b1a55e375482568429d4e1db`,
the dedicated command line matched its original hash above, and `allow`
opened a TCP listener again. This does not establish cross-IWA isolation or
make the fixture always-run.

## Persistent per-IWA isolation probe

`persistent-browser-probe.patch` is another **test-only** emulator fixture,
not part of `patches/iwa/series`. Unlike the transient probe above, its
`--xenon-test-persist-block-iwa-direct-sockets=IWA_HOST` switch stores BLOCK
for that exact installed IWA origin before the browser's normal permission
gate runs. `--xenon-test-reset-block-iwa-direct-sockets=IWA_HOST` removes that
exact exception on the next request from the same app. Never use either switch
on a physical device or ordinary browser. Back up the experimental APK and
dedicated command line first, verify the profile's `direct_sockets` exception
map is empty, and do not leave the emulator until reset, source reversal, APK
and flag restoration have all been verified. If the test fails after storing
BLOCK, reinstall the diagnostic APK with the reset switch and request a socket
from the same IWA before restoring the production APK; do not hand-edit
Preferences.

On 2026-09-25, the lab Android 16 emulator's Kitchen Sink IWA
(`b7looprugym3zyxqffzqdz4mzc2vz4j6ge3arxg2ybbzwgb6ne2qaaic`) stored an
origin-scoped BLOCK and the public TCP listener, TCP client, and UDP requests
all rejected with `InvalidAccessError`. While that BLOCK entry was still in
the experimental profile, a second installed, signed and policy-entitled IWA
(`c6mopl2f4c2y7oha7vlvgjvtcwwvvvuk6odzcnojijcfpzyaa2oaaaic`) opened a
public TCP listener. With the reset switch, Kitchen Sink opened a listener
again and the `direct_sockets` exception map returned to `{}`. The diagnostic
patch was reversed, the rebuilt and on-device production x86 APK matched
SHA-256 `aaacb74444499cee72aa37aed376bdbb8237b317b1a55e375482568429d4e1db`,
the dedicated flags matched their original hash
`61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`,
and Kitchen Sink's normal listener opened again. This is a bounded same-profile
cross-IWA isolation check; it is not an automated release test or proof about
other profiles and all lifecycle races.
