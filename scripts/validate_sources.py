#!/usr/bin/env python3
"""Validate pinned, clean inputs before mutating an isolated Chromium tree."""

import argparse
import json
import re
import subprocess
from pathlib import Path


SHA = re.compile(r"[0-9a-f]{40}\Z")
VERSION = re.compile(r"[0-9]+(?:\.[0-9]+){3}\Z")


def load_lock(path: Path) -> dict[str, str]:
    lock = json.loads(path.read_text(encoding="utf-8"))
    for key in ("chromium_commit", "helium_commit"):
        if not isinstance(lock.get(key), str) or not SHA.fullmatch(lock[key]):
            raise ValueError(f"invalid {key} in {path}")
    if not isinstance(lock.get("chromium_version"), str) or not VERSION.fullmatch(
        lock["chromium_version"]
    ):
        raise ValueError(f"invalid chromium_version in {path}")
    return lock


def parse_chromium_version(contents: str) -> str:
    fields = {}
    for line in contents.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            fields[key.strip()] = value.strip()
    return ".".join(fields[key] for key in ("MAJOR", "MINOR", "BUILD", "PATCH"))


def series_paths(contents: str) -> list[Path]:
    paths = []
    seen = set()
    for raw in contents.splitlines():
        line = raw.split(" #", 1)[0].strip()
        if not line or line.startswith("#"):
            continue
        path = Path(line)
        if path.is_absolute() or ".." in path.parts or path in seen:
            raise ValueError(f"unsafe or duplicate patch path: {line}")
        paths.append(path)
        seen.add(path)
    if not paths:
        raise ValueError("empty Helium patch series")
    return paths


def git_head(tree: Path) -> str:
    return subprocess.check_output(
        ["git", "-C", str(tree), "rev-parse", "HEAD"], text=True
    ).strip()


def validate(chromium: Path, helium: Path, lock: dict[str, str]) -> int:
    for label, tree, key in (
        ("Chromium", chromium, "chromium_commit"),
        ("Helium", helium, "helium_commit"),
    ):
        actual = git_head(tree)
        if actual != lock[key]:
            raise ValueError(f"{label} HEAD {actual} does not match pin {lock[key]}")
    actual_version = parse_chromium_version(
        (chromium / "chrome/VERSION").read_text(encoding="utf-8")
    )
    if actual_version != lock["chromium_version"]:
        raise ValueError(
            f"Chromium version {actual_version} does not match {lock['chromium_version']}"
        )
    helium_version = (helium / "chromium_version.txt").read_text(
        encoding="utf-8"
    ).strip()
    if helium_version != lock["chromium_version"]:
        raise ValueError(
            f"Helium expects Chromium {helium_version}, not {lock['chromium_version']}"
        )
    patches = helium / "patches"
    paths = series_paths((patches / "series").read_text(encoding="utf-8"))
    missing = [str(path) for path in paths if not (patches / path).is_file()]
    if missing:
        raise ValueError(f"missing Helium patches: {', '.join(missing[:5])}")
    if not (helium / "utils/patches.py").is_file():
        raise ValueError("missing Helium patch applicator")
    if not (helium / "utils/downloads.py").is_file() or not (helium / "deps.ini").is_file():
        raise ValueError("missing Helium pinned dependency manifest or downloader")
    return len(paths)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", type=Path, required=True)
    parser.add_argument("--helium", type=Path, required=True)
    parser.add_argument(
        "--lock", type=Path, default=Path(__file__).resolve().parents[1] / "source.lock.json"
    )
    args = parser.parse_args()
    try:
        count = validate(args.chromium, args.helium, load_lock(args.lock))
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as exc:
        parser.exit(1, f"source validation failed: {exc}\n")
    print(f"Validated pinned Chromium/Helium inputs and {count} ordered patches")


if __name__ == "__main__":
    main()
