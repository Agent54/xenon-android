#!/usr/bin/env python3
"""Verify unified-diff hunk headers match their bodies in every patch file.

Usage: check_patch_format.py [PATCH ...]  (default: patches/**/*.patch and
tools/emulator-probes/**/*.patch). Exits non-zero on the first malformed file.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


def check_patch(text: str) -> list[str]:
    errors = []
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    i = 0
    while i < len(lines):
        m = HUNK.match(lines[i])
        if not m:
            i += 1
            continue
        want_old = int(m.group(2)) if m.group(2) is not None else 1
        want_new = int(m.group(4)) if m.group(4) is not None else 1
        old = new = 0
        j = i + 1
        while j < len(lines) and (old < want_old or new < want_new):
            line = lines[j]
            if line.startswith("\\"):
                j += 1
                continue
            tag = line[:1]
            if tag == " " or line == "":
                old += 1
                new += 1
            elif tag == "-":
                old += 1
            elif tag == "+":
                new += 1
            else:
                break
            j += 1
        while j < len(lines) and lines[j].startswith("\\"):
            j += 1
        if (old, new) != (want_old, want_new):
            errors.append(
                f"line {i + 1}: header {lines[i]!r} expects -{want_old}/+{want_new}, "
                f"body has -{old}/+{new}"
            )
        elif j < len(lines) and lines[j][:1] in ("+", "-", " ") and not (
            lines[j].startswith("--- ") or lines[j].startswith("+++ ")
        ):
            errors.append(f"line {j + 1}: hunk body continues past header count")
        i = j
    return errors


def main(argv: list[str]) -> int:
    paths = [Path(a) for a in argv] or sorted(
        list((ROOT / "patches").rglob("*.patch"))
        + list((ROOT / "tools/emulator-probes").rglob("*.patch"))
    )
    bad = 0
    for path in paths:
        for error in check_patch(path.read_text(encoding="utf-8")):
            print(f"{path}: {error}")
            bad += 1
    print(f"checked {len(paths)} patch files, {bad} error(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
