# Experimental Android IWA debug flags

Status: lab-only, validated on Samsung SM-X710 and Pixel 10 Pro XL

Only the optional IWA patch tier changes Chromium's Android command-line
basename from `chrome-command-line` to `xenon-iwa-command-line`. The ordinary
Xenon build continues to read its original file. This prevents experimental
IWA flags and the one-time bundle installer from being read by the working
browser package on the same device.

For these device tests, ADB staged the signed bundle inside
`org.agent54.xenon.iwa`'s private files and put the IWA feature switches plus
the one-time `--install-isolated-web-app-from-file` switch in
`/data/local/tmp/xenon-iwa-command-line`. Android's debug-app setting was
initially unset on both devices and was set to `org.agent54.xenon.iwa` so
Chromium would read that shell-writable file. After both installations
succeeded, the install switch was removed, while the feature switches and
debug-app setting remain for repeat launches. These are operator-managed lab
settings, not a release installation mechanism.

The working browser's shared `/data/local/tmp/chrome-command-line` was never
modified during this test; its SHA-256 remained identical on both devices.
The two browser packages and app data remain separate. Before using a device
for a different debug-app workflow, inspect its current global `debug_app`
setting and coordinate any change. Do not clear the experimental app's data,
remove its feature switches, or replace the ordinary browser package as part
of this port.
