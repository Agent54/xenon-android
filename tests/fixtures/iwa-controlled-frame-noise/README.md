# Cross-IWA Controlled Frame noise fixture

> The disposable browser probe patches mentioned below (`policy-browser-probe.patch`, `scope-browser-probe.patch`,
> `scope-candidate-probe.patch`) live in [`tools/emulator-probes/iwa-controlled-frame-noise/`](../../../tools/emulator-probes/iwa-controlled-frame-noise/).
> They are not part of `patches/iwa/series`.

`npm ci` and `node build.mjs /path/outside/repo/cf-noise.swbn` create a disposable
signed IWA. The Ed25519 signing key is generated in memory, so each build has
a different bundle ID. Do not commit the generated bundle or a signing key.

Its manifest grants `controlled-frame` and `cross-origin-isolated`; its page
embeds `https://www.google.com/` in a Controlled Frame. Install it only in an
experimental browser profile with the one-time IWA installer switch, restore
that profile's command line immediately, then launch the installed app ID
through `IwaLauncherActivity`. Chromium's app ID is the double SHA-256 of the
manifest ID (`isolated-app://<bundle-id>/`), encoded from the first 16 bytes as
extension-ID letters `a`–`p`.

With an ordinary Google tab and Kitchen Sink installed in the same profile,
run `scripts/test_iwa_controlled_frame_noise_cross_app.mjs` against its CDP
endpoint and pass the fixture bundle ID. The script checks identical HTTP(S)
origins, distinct stable canvas outputs across the ordinary tab and the two
different IWA owners, then returns Kitchen Sink to its original URL. This is
a bounded identity check, not a full privacy or consent sign-off.

For a document-lifecycle check, pass the fixture guest's exact CDP target ID
to `scripts/test_iwa_controlled_frame_noise_reload.mjs`. The probe expects
exactly one Google guest, reloads it, reacquires Android's replacement CDP
target, and checks that the canvas result remains stable. It does not check
guest deletion/recreation or browser restart.

`scripts/test_iwa_controlled_frame_audio_noise.mjs` runs an offline constant
audio render in an ordinary Google tab and the two IWA-owned Google guests.
Its normal mode expects non-raw output and distinct, repeatable mean offsets;
the exact buffer hash can change because Helium also adds per-render jitter.
The `--expect-disabled` mode expects identical raw samples and is for a
disposable emulator launch with only `HeliumNoiseAudio` disabled. Restore the
normal experimental command line immediately afterward. This needs no
microphone, recording permission, speaker, or network audio device.

For owner-lifecycle coverage on a clean emulator APK, launch Kitchen Sink at
its home page with no Google guest, then run
`scripts/test_iwa_controlled_frame_owner_navigation.mjs CDP_URL ADB SERIAL`.
It requires the guest CDP target to disappear when its IWA owner navigates to
`about:blank`, relaunches the app-owned shim, and checks that a newly created
guest in the same partition retains its within-process canvas hash. It returns
Kitchen Sink to its home page. This does not cover a concurrent detach race or
browser-process death.

`scripts/test_iwa_controlled_frame_detach_race.mjs` adds bounded emulator-only
owner teardown during pending guest work/navigation. The companion
`scripts/test_iwa_controlled_frame_noise_partitions.mjs` creates and closes its
own ordinary Google tab and second ephemeral guest, comparing stable text and
font-free canvas outputs across all three same-origin contexts. Both restore
Kitchen Sink home. Never use the detach script against a physical device.

`scope-browser-probe.patch` and `scope-candidate-probe.patch` are **disposable
diagnostic patches**, not ordered production patches. The first logs only
browser-owned GuestView association, attach state, Controlled Frame ownership,
default-partition state and scope validity for Google navigations; it never
prints tokens or scope values. The second tests the narrow pre-attach fix on
top of the first. Apply them only to a backed-up experimental emulator APK,
then reverse the candidate and probe in that order, rebuild, and restore the
original flags and a clean production APK. On 2026-09-25, the unfixed race
logged `guest=1 attached=0 owner=1 controlled=1 default_partition=0` and
returned the ordinary tab's text and font-free canvas hashes. Two subsequent
20-iteration races passed with the diagnostic candidate, as did one with the
uninstrumented ordered patch 0056. This is not an always-run integration test
or physical privacy sign-off.

## Disposable persisted site-exception policy probe

`policy-browser-probe.patch` is test-only browser instrumentation, **not** an
ordered IWA patch. It adds `--xenon-test-helium-noise-policy=block|observe|reset`
only to the optional Android browser. Never install an APK containing it on a
physical device or the ordinary browser. The `block` and `reset` modes use
Helium's own site-setting API for the ordinary `https://www.google.com/` page;
the validated Controlled Frame policy branch is only observed. The probe logs
`XENON_NOISE_POLICY` with the branch and its enabled result.

Before applying it to a disposable emulator, verify the experimental profile's
`helium_noise` exception map is `{}`; back up the installed experimental APK
and dedicated command-line file. Apply/build/install the diagnostic APK in
place, use the matching `command-line.block`, and cold-launch Kitchen Sink and
an ordinary Google tab. Run:

```sh
node scripts/test_iwa_controlled_frame_noise_policy.mjs \
  http://127.0.0.1:9225 blocked 631344798
```

The final number is the raw hash from the pinned lab Android 16 emulator's
feature-disabled control. The script requires Kitchen Sink at its home page
and no pre-existing Google guest, navigates it to `/cf.html`, compares public
canvas outputs twice, and restores its home page. The ordinary page must match
the raw control; the guest must stay distinct and stable. Cold-stop the browser,
switch to `command-line.observe`, reopen the same pages and rerun `blocked` to
check the saved exception after process restart. Confirm the profile contains
the one intended Google BLOCK entry, and logs show ordinary `enabled=0` but
guest `enabled=1`.

To clean up, cold-stop, switch to `command-line.reset`, reopen the ordinary
Google page, and run the script with `reset`. Confirm the ordinary hash is no
longer raw. Cold-stop again and verify the `helium_noise` exception map is
`{}`. Restore the original dedicated command line and backed-up APK, reverse
the diagnostic source patch, rebuild the normal APK and compare its pre-probe
hash. Do not leave the test until all four—profile, flags, installed APK and
source—are restored. This is a repeatable manual browser-level probe, **not**
an always-run test target or privacy release sign-off.

On 2026-09-25, the pinned emulator returned ordinary/guest hashes
`631344798/635893350` under BLOCK, then `631344798/1811783776` after cold
restart in observe mode. After reset they were `3353302686/2504616220`.
Both reads within each page matched. The Google exception map returned to
`{}`; original dedicated flags SHA-256 returned to
`61fd4af007fce97f4f3fbadcd79fdf88abf9c83afe6f1971e1a126d9ce59a7ca`;
the installed APK matched its pre-probe SHA-256
`7f51562a94b88973a62bb4dec6a4b8c9faa54b29f11c5dc29a05589a64293fc7`;
and the rebuilt clean x86-64 APK matched its pre-probe hash
`a6117a82b84816c9d5899290a0a15ea2e1dbc42988149c996be5bcf86845f0a3`.
