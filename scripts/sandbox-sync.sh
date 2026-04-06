#!/usr/bin/env bash
set -euo pipefail

# sandbox-sync.sh — One-way sync from arete-reserv → arete-reserv-test
# Safe to re-run. Never syncs in reverse.
# Called by the /sandbox skill (Phase 3) before running test scenarios.

SRC="${HOME}/code/arete-reserv/"    # trailing slash = contents of dir, not dir itself
DST="${HOME}/code/arete-reserv-test/"

if [[ ! -d "${HOME}/code/arete-reserv" ]]; then
  echo "❌ Source workspace not found: ${HOME}/code/arete-reserv"
  exit 1
fi

# Guard: SRC and DST must be different directories
src_real=$(realpath "${SRC%/}" 2>/dev/null || echo "${SRC%/}")
dst_real=$(realpath "${DST%/}" 2>/dev/null || echo "${DST%/}")
if [[ "$src_real" == "$dst_real" ]]; then
  echo "❌ SRC and DST resolve to the same directory — refusing to sync."
  exit 1
fi

echo "Syncing: ${SRC} → ${DST}"
echo ""

rsync \
  --archive \
  --delete \
  --stats \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.claude/' \
  --exclude='.cursor/' \
  --exclude='dev/' \
  "${SRC}" "${DST}"

echo ""
echo "✅ Sync complete. Test workspace ready at ${DST}"
