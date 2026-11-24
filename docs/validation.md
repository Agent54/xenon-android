# Android baseline validation — 2026-09-24

This is a lab browser baseline, not an IWA build or a release-signed artifact.

- Source: Chromium `73c14f6228d7cd537c855007e8f88678969cc0eb` at
  154.0.8037.57; Helium `3eb149f54bc5b7db3bf61b1db6303d5c773d04bd`;
  Xenon Android platform `e8637b5` (privacy-default patch included).
- Builder: isolated Linux build VM, with source and generated output outside Git.
  `autoninja -C out/XenonAndroid chrome_public_apk` passed after applying the
  ordered Helium and Android compatibility patches. Seven platform unit tests
  passed locally.
- APK: `org.agent54.xenon`, arm64, version 154.0.8037.57, SHA-256
  `8f6b178623c50fc3fc5bebc7472c300bbb79e3b142aa5837857a0f35e02ee908`.
  This is an unsigned-for-release lab build, installed by ADB; the APK is not
  committed to Git.
- Pixel 10 Pro XL (Android 16): ADB install succeeded, launcher resolved to
  `com.google.android.apps.chrome.Main`, browser process remained alive, and
  `https://example.com` loaded visibly in a browser tab.
- Samsung SM-X710 tablet (Android 15): ADB install succeeded, launcher opened
  a separate browser window, and `https://example.com` loaded visibly. An
  earlier first-run screen showed the inherited Google usage/crash reporting
  switch on; it was manually turned off and the final APK changes the default
  to off. After the final upgrade, the app advanced to the browser without an
  agent tap on Continue. This test therefore does **not** establish what
  consent state a fresh installation would reach. The inherited Google-centric
  first-run text and actual reporting behavior still need review before any
  release.

These checks do not establish packaged IWA installation, independent IWA shim
launch, Controlled Frame behavior, signing, or unattended device unlock.
