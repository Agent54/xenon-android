#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: scripts/build_iwa_shim.sh OUTPUT_APK" >&2
  exit 2
fi

: "${ANDROID_SDK_ROOT:?Set ANDROID_SDK_ROOT to an Android SDK}"
: "${JAVA_HOME:?Set JAVA_HOME to a JDK}"
: "${SHIM_KEYSTORE:?Set SHIM_KEYSTORE to an existing test keystore}"
: "${SHIM_KEY_ALIAS:?Set SHIM_KEY_ALIAS}"
: "${SHIM_KS_PASS:?Set SHIM_KS_PASS for the apksigner env provider}"
export PATH="$JAVA_HOME/bin:$PATH"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
shim_root="$repo_root/launcher/kitchen-sink"
build_tools="$ANDROID_SDK_ROOT/build-tools/37.0.0"
android_jar="$ANDROID_SDK_ROOT/platforms/android-36/android.jar"
output_apk="$1"

if [[ -e "$output_apk" ]]; then
  echo "Output already exists: $output_apk" >&2
  exit 1
fi
build_dir="$(mktemp -d)"
trap 'rm -rf "$build_dir"' EXIT
mkdir -p "$build_dir/classes" "$build_dir/dex"

"$JAVA_HOME/bin/javac" -source 8 -target 8 -Xlint:-options -cp "$android_jar" \
  -d "$build_dir/classes" \
  "$shim_root/src/org/agent54/xenon/iwa/kitchensink/LauncherActivity.java"
"$build_tools/d8" --min-api 26 --lib "$android_jar" \
  --output "$build_dir/dex" \
  "$build_dir/classes/org/agent54/xenon/iwa/kitchensink/LauncherActivity.class"
"$build_tools/aapt2" link --manifest "$shim_root/AndroidManifest.xml" \
  -I "$android_jar" -o "$build_dir/unsigned.apk"
(cd "$build_dir/dex" && "$build_tools/aapt" add "$build_dir/unsigned.apk" classes.dex)
"$build_tools/zipalign" -f 4 "$build_dir/unsigned.apk" "$build_dir/aligned.apk"
"$build_tools/apksigner" sign --ks "$SHIM_KEYSTORE" \
  --ks-key-alias "$SHIM_KEY_ALIAS" --ks-pass env:SHIM_KS_PASS \
  --out "$output_apk" "$build_dir/aligned.apk"
"$build_tools/apksigner" verify --verbose "$output_apk"
