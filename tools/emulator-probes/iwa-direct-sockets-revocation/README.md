# Disposable Direct Sockets setting-change probe

This is **not** a production patch. Never add `temporary-browser-probe.patch`
to `patches/iwa/series`, and never install its APK on a physical device or the
ordinary browser package. It is a bounded lab Android 16 emulator fixture.

The temporary switch `xenon-test-revoke-iwa-direct-sockets` lets the first
Kitchen Sink TCP listener open. A second listener request sets the requesting
IWA origin's `DIRECT_SOCKETS` content setting to BLOCK and rejects that new
request. A request for `127.0.0.2` resets the setting to DEFAULT and is also
rejected. `probe.mjs` keeps an accepted connection from the first listener
alive across the setting change, checks whether it can still transfer bytes,
then sends the reset request. The diagnostic logs mark both transitions.

Before running, verify the experimental profile has no `direct_sockets`
exception. Back up the installed experimental APK, dedicated
`/data/local/tmp/xenon-iwa-command-line` byte-for-byte, and the delegate source.
Apply the temporary source patch only to the isolated builder checkout; build
and install its x86-64 experimental APK on the emulator; add the test switch
only to the dedicated experimental command-line file; cold-start Kitchen Sink.
Run:

```sh
node probe.mjs http://127.0.0.1:9225 \
  $CHROMIUM_SRC/third_party/android_sdk/public/platform-tools/adb \
  emulator-5554 isolated-app://<the-installed-kitchen-sink-bundle-id>/
```

The script attempts a reset in `finally`, closes its page sockets, and removes
its temporary ADB forward. Still verify the profile exception is `{}` through
the experimental package's `run-as` Preferences read, and check the reset log.
If the browser or script crashes before reset, restart the *temporary* APK
with the test switch, launch the IWA, and request `127.0.0.2` to reset before
removing the hook. Do not hand-edit Preferences as an unreviewed shortcut.

Always restore the original dedicated command-line file, installed APK and
delegate source, then rebuild the normal APK and verify that no diagnostic
switch or log marker remains. Preserve the ordinary browser and all physical
devices. This probe distinguishes new-socket admission from already-open
socket lifetime; it does not establish Android user-facing revocation policy.
