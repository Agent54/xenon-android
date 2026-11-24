#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: scripts/build.sh CHROMIUM_SRC HELIUM_TREE" >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
chromium_src="$(cd "$1" && pwd)"
helium_tree="$(cd "$2" && pwd)"

python3 "$repo_root/scripts/validate_sources.py" \
  --chromium "$chromium_src" --helium "$helium_tree"

for command_name in patch gn autoninja; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done
if ! python3 -c 'from PIL import Image' >/dev/null 2>&1; then
  echo "Missing Pillow; install requirements-build.txt in an isolated Python environment" >&2
  exit 1
fi

if ! git -C "$chromium_src" diff --quiet || \
   ! git -C "$chromium_src" diff --cached --quiet; then
  echo "Chromium checkout has tracked modifications; use a clean isolated checkout" >&2
  exit 1
fi

out_dir="$chromium_src/out/XenonAndroid"
if [[ -e "$out_dir" ]]; then
  echo "Output directory already exists: $out_dir" >&2
  exit 1
fi
generated_resources="$repo_root/build/generated-resources"
if [[ -e "$generated_resources" ]]; then
  echo "Generated resources already exist: $generated_resources" >&2
  exit 1
fi

deps_cache="$repo_root/build/download-cache"
mkdir -p "$deps_cache"
python3 "$helium_tree/utils/downloads.py" retrieve \
  -i "$helium_tree/deps.ini" -c "$deps_cache"
python3 "$helium_tree/utils/downloads.py" unpack \
  -i "$helium_tree/deps.ini" -c "$deps_cache" "$chromium_src"

python3 "$helium_tree/utils/patches.py" apply \
  "$chromium_src" "$helium_tree/patches" --no-fuzz
PYTHONPATH="$repo_root${PYTHONPATH:+:$PYTHONPATH}" \
  python3 -m scripts.apply_platform_patches \
  "$chromium_src" "$repo_root/patches"
python3 "$helium_tree/utils/domain_substitution.py" apply \
  -r "$helium_tree/domain_regex.list" \
  -f "$helium_tree/domain_substitution.list" "$chromium_src"
python3 "$helium_tree/utils/name_substitution.py" --sub \
  -t "$chromium_src" --workers "${XENON_WORKERS:-$(nproc)}"
python3 "$helium_tree/utils/i18n_apply.py" -t "$chromium_src"
python3 "$helium_tree/utils/helium_version.py" \
  --tree "$helium_tree" --chromium-tree "$chromium_src"
mkdir -p "$repo_root/build"
cp -a "$helium_tree/resources" "$generated_resources"
python3 "$helium_tree/utils/generate_resources.py" \
  "$generated_resources/generate_resources.txt" "$generated_resources"
python3 "$helium_tree/utils/replace_resources.py" \
  "$generated_resources/helium_resources.txt" \
  "$generated_resources" "$chromium_src"

mkdir -p "$out_dir"
cp "$helium_tree/flags.gn" "$out_dir/args.gn"
printf '\n' >> "$out_dir/args.gn"
cat "$repo_root/android/args.gn" >> "$out_dir/args.gn"

cd "$chromium_src"
gn gen out/XenonAndroid --fail-on-unused-args
autoninja -C out/XenonAndroid chrome_public_apk

echo "Build complete. Inspect out/XenonAndroid/apks before lab installation."
