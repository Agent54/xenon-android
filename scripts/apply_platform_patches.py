#!/usr/bin/env python3
"""Apply Xenon platform patches in series order to a Chromium git checkout."""

import argparse
import subprocess
from pathlib import Path

from scripts.validate_sources import series_paths


def apply_patches(chromium: Path, patches: Path) -> int:
    root = patches.resolve()
    paths = series_paths((root / "series").read_text(encoding="utf-8"))
    for relative_path in paths:
        patch = (root / relative_path).resolve()
        if not patch.is_relative_to(root) or not patch.is_file():
            raise ValueError(f"missing or unsafe platform patch: {relative_path}")
        command = ["git", "-C", str(chromium), "apply"]
        subprocess.run(command + ["--check", str(patch)], check=True)
        subprocess.run(command + [str(patch)], check=True)
    return len(paths)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("chromium", type=Path)
    parser.add_argument("patches", type=Path)
    args = parser.parse_args()
    count = apply_patches(args.chromium, args.patches)
    print(f"Applied {count} Xenon platform patches")


if __name__ == "__main__":
    main()
