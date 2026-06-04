#!/usr/bin/env bash
#
# Phase 9 AC8a — F1 rollback companion script.
#
# Restores AUTO_PERSON_MEMORY blocks from a snapshot file written by
# `arete people memory refresh --snapshot-path <path>` BEFORE any
# refreshed content was written.
#
# Usage:
#   ./restore-memory-blocks.sh <snapshot.json>
#
# The snapshot JSON shape (written by writePreRefreshSnapshot in
# packages/cli/src/commands/people.ts) is:
#   {
#     "snapshotAt": "<ISO timestamp>",
#     "blocks": [
#       { "path": "<absolute path>", "relativePath": "...", "block": "<...>" | null },
#       ...
#     ]
#   }
#
# For each entry where `block` is non-null, this script replaces the
# current AUTO_PERSON_MEMORY block at `path` with the snapshotted block.
# When `block` is null (no block existed pre-refresh), the script removes
# any block that may now exist post-refresh.
#
# Dependencies: jq, sed (BSD or GNU). Tested on macOS + Linux.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <snapshot.json>" >&2
  exit 2
fi

SNAPSHOT="$1"
if [[ ! -f "$SNAPSHOT" ]]; then
  echo "error: snapshot file not found: $SNAPSHOT" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required" >&2
  exit 1
fi

START_MARKER='<!-- AUTO_PERSON_MEMORY:START -->'
END_MARKER='<!-- AUTO_PERSON_MEMORY:END -->'

snapshot_at=$(jq -r '.snapshotAt' "$SNAPSHOT")
total=$(jq -r '.blocks | length' "$SNAPSHOT")

echo "Restoring from snapshot taken at $snapshot_at ($total entries)"

restored=0
removed=0
unchanged=0
missing=0

# Iterate via index — keeps jq pulls cheap and supports null blocks.
for i in $(seq 0 $((total - 1))); do
  path=$(jq -r ".blocks[$i].path" "$SNAPSHOT")
  block=$(jq -r ".blocks[$i].block // \"\"" "$SNAPSHOT")
  has_block=$(jq -r ".blocks[$i].block != null" "$SNAPSHOT")

  if [[ ! -f "$path" ]]; then
    echo "  skip (file missing): $path"
    missing=$((missing + 1))
    continue
  fi

  current=$(cat "$path")

  if [[ "$has_block" == "true" ]]; then
    # We want to replace any existing block with the snapshotted one.
    # If no block exists currently, append the snapshotted block at the end.
    if grep -qF "$START_MARKER" "$path"; then
      tmp=$(mktemp)
      awk -v start="$START_MARKER" -v end="$END_MARKER" -v repl="$block" '
        BEGIN { in_block=0 }
        $0 ~ start { print repl; in_block=1; next }
        $0 ~ end && in_block { in_block=0; next }
        !in_block { print }
      ' "$path" > "$tmp"
      mv "$tmp" "$path"
      restored=$((restored + 1))
    else
      printf "\n%s\n" "$block" >> "$path"
      restored=$((restored + 1))
    fi
  else
    # Snapshot had no block — remove any block that may exist now.
    if grep -qF "$START_MARKER" "$path"; then
      tmp=$(mktemp)
      awk -v start="$START_MARKER" -v end="$END_MARKER" '
        BEGIN { in_block=0 }
        $0 ~ start { in_block=1; next }
        $0 ~ end && in_block { in_block=0; next }
        !in_block { print }
      ' "$path" > "$tmp"
      mv "$tmp" "$path"
      removed=$((removed + 1))
    else
      unchanged=$((unchanged + 1))
    fi
  fi
done

echo "restored=$restored  removed=$removed  unchanged=$unchanged  missing=$missing"
