#!/usr/bin/env bash
# List vault markdown notes whose planner reminder matches a given local date and time.
# Matches plugin frontmatter: notify_minutes (0–1439, minutes from midnight on event day).
# Event day: single-date basename YYYY-MM-DD[-suffix], or range basename start date YYYY-MM-DD--YYYY-MM-DD.
#
# Usage:
#   ./query-planner-reminders.sh YYYY-MM-DD HH:MM [VAULT_ROOT]
#
# Examples:
#   ./query-planner-reminders.sh 2026-03-25 09:30
#   ./query-planner-reminders.sh 2026-03-25 09:30 "/path/to/vault"
#
# If VAULT_ROOT is omitted, defaults to the vault containing this plugin (scripts → plugin → plugins → .obsidian → vault).

set -euo pipefail

usage() {
	echo "Usage: $0 YYYY-MM-DD HH:MM [VAULT_ROOT]" >&2
	echo "  Lists .md files with notify_minutes matching that local time on that event date." >&2
	exit 1
}

[[ ${1:-} == "-h" || ${1:-} == "--help" ]] && usage
[[ $# -lt 2 ]] && usage

TARGET_DATE="$1"
TIME_RAW="$2"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_VAULT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
VAULT_ROOT="${3:-$DEFAULT_VAULT}"

if ! [[ "$TARGET_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
	echo "error: date must be YYYY-MM-DD" >&2
	exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
	echo "error: python3 is required" >&2
	exit 1
fi

export TARGET_DATE
export TIME_RAW
export VAULT_ROOT

python3 <<'PY'
import os
import re
import sys
from pathlib import Path

target_date = os.environ["TARGET_DATE"]
time_raw = os.environ["TIME_RAW"].strip()
vault = Path(os.environ["VAULT_ROOT"]).resolve()

m = re.fullmatch(r"(\d{1,2}):(\d{2})", time_raw)
if not m:
    print("error: time must be HH:MM (24h)", file=sys.stderr)
    sys.exit(1)
h, mi = int(m.group(1)), int(m.group(2))
if h > 23 or mi > 59:
    print("error: invalid time", file=sys.stderr)
    sys.exit(1)
target_minutes = h * 60 + mi

RANGE_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2})--(\d{4}-\d{2}-\d{2})(?:-.+)?$", re.IGNORECASE
)
SINGLE_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2})(?:-(.+))?$", re.IGNORECASE
)


def event_date_from_basename(stem: str):
    """stem = filename without .md"""
    rm = RANGE_RE.match(stem)
    if rm:
        return rm.group(1)
    sm = SINGLE_RE.match(stem)
    if not sm:
        return None
    rest = sm.group(2)
    if rest and "--" in stem:
        return None
    return sm.group(1)


def read_notify_minutes(text: str):
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end == -1:
        return None
    fm = text[3:end]
    for line in fm.splitlines():
        line = line.strip()
        if line.startswith("#") or not line:
            continue
        mm = re.match(r"notify_minutes:\s*(\d+)\s*$", line, re.IGNORECASE)
        if mm:
            return int(mm.group(1))
        mm = re.match(r"notify_minutes:\s*['\"]?(\d+)['\"]?\s*$", line, re.IGNORECASE)
        if mm:
            return int(mm.group(1))
    return None


matches = []
for path in vault.rglob("*.md"):
    rel = path.relative_to(vault)
    if ".obsidian" in rel.parts:
        continue
    stem = path.name
    if stem.lower().endswith(".md"):
        stem = stem[:-3]
    ed = event_date_from_basename(stem)
    if ed != target_date:
        continue
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        continue
    nm = read_notify_minutes(raw)
    if nm is None or nm != target_minutes:
        continue
    if nm < 0 or nm > 1439:
        continue
    matches.append((str(path), nm))

matches.sort(key=lambda x: x[0])
if not matches:
    print(f"No matching notes under {vault}")
    print(f"  date={target_date}  notify_minutes={target_minutes} (from {time_raw})")
    sys.exit(0)

print(f"Vault: {vault}")
print(f"Match: event date {target_date}, notify_minutes={target_minutes} ({time_raw})")
print()
for p, nm in matches:
    print(p)
PY
