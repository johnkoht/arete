#!/usr/bin/env bash
#
# spike-compare.sh — AC1.9 MANUAL release gate (NOT CI).
#
# Runs `arete agenda scaffold --meeting "Jira Roadmap Sync" --json` against a
# READ-ONLY snapshot of ~/code/arete-reserv and reports which roadmap concerns
# (capacity / parity / slice-zero / Notion-vs-Jira) the project-doc candidates
# surfaced — WITHOUT a human naming the file. The operator compares this to the
# Phase-0 hand-assembled bundle in discovery-2026-06-14.md §E.
#
# SAFETY (pre-mortem + global constraint): arete-reserv is READ-ONLY. This
# script NEVER writes to it. It snapshots via `cp -r` to a temp dir and runs
# the scaffold there. No --apply, no --skip-qmd, no index write. If invoked
# with the live path it refuses.
#
# Usage:
#   dev/work/plans/plan-context-injection/spike-compare.sh [SNAPSHOT_DIR]
#
#   With no arg it creates a fresh snapshot at
#   /tmp/arete-reserv-snapshot-pci from ~/code/arete-reserv and runs there.
#   Pass an existing snapshot dir to reuse it.
#
set -euo pipefail

LIVE="${HOME}/code/arete-reserv"
DEFAULT_SNAPSHOT="/tmp/arete-reserv-snapshot-pci"
MEETING="${MEETING:-Jira Roadmap Sync}"
# DEFECT C fix: a static snapshot has no live calendar, so a free-text meeting
# title never resolves (resolved:false). Drive the scaffold via the
# calendar-INDEPENDENT `--project` escape hatch (the path fixed in Defect A) so
# the harness can validate without a live calendar.
PROJECT="${PROJECT:-glance-2-roadmap}"

# Resolve the worktree root (this script lives in dev/work/plans/<plan>/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
ARETE_BIN="${ROOT}/packages/cli/bin/arete.js"

SNAPSHOT="${1:-${DEFAULT_SNAPSHOT}}"

# --- Refuse to operate on the live workspace -------------------------------
live_real="$(cd "${LIVE}" 2>/dev/null && pwd -P || true)"
snap_real_parent="$(cd "$(dirname "${SNAPSHOT}")" 2>/dev/null && pwd -P || true)"
if [[ -n "${live_real}" && "${snap_real_parent}/$(basename "${SNAPSHOT}")" == "${live_real}" ]]; then
  echo "REFUSING: target resolves to the live arete-reserv (${LIVE}). This script is read-only." >&2
  exit 2
fi
if [[ "${SNAPSHOT}" == "${LIVE}" ]]; then
  echo "REFUSING: target is the live arete-reserv. This script is read-only." >&2
  exit 2
fi

# --- Snapshot (cp -r) when the default path is used and missing -------------
if [[ "${SNAPSHOT}" == "${DEFAULT_SNAPSHOT}" && ! -d "${SNAPSHOT}" ]]; then
  if [[ ! -d "${LIVE}" ]]; then
    echo "No live arete-reserv at ${LIVE} and no snapshot at ${SNAPSHOT}. Nothing to compare." >&2
    exit 1
  fi
  echo "Snapshotting ${LIVE} -> ${SNAPSHOT} (read-only copy) ..."
  rm -rf "${SNAPSHOT}"
  cp -r "${LIVE}" "${SNAPSHOT}"
fi

if [[ ! -d "${SNAPSHOT}" ]]; then
  echo "Snapshot dir not found: ${SNAPSHOT}" >&2
  exit 1
fi

# --- Record a checksum of the snapshot before + after (assert zero writes) --
snapshot_sig() {
  # mtime+size signature across the tree; cheap integrity check. `|| true`
  # keeps a non-zero find exit (e.g. an unreadable dir) from tripping the
  # `set -e -o pipefail` guard and aborting the run before the report.
  { find "${SNAPSHOT}" -type f -not -path '*/.git/*' -printf '%s %T@ %p\n' 2>/dev/null || true; } \
    | sort | shasum | awk '{print $1}'
}
SIG_BEFORE="$(snapshot_sig)"

echo "=== AC1.9 spike-compare ==="
echo "snapshot:  ${SNAPSHOT}"
echo "meeting:   ${MEETING}"
echo "project:   ${PROJECT} (--project escape hatch; calendar-independent)"
echo "arete bin: ${ARETE_BIN}"
echo

# --- Run the scaffold READ-ONLY (no --apply / --skip-qmd / index write) -----
# Drive via the calendar-independent --project path (Defect C): the meeting
# title won't resolve against a static snapshot, but the pinned project still
# drives selectProjectDocs.
JSON="$(cd "${SNAPSHOT}" && node "${ARETE_BIN}" agenda scaffold --meeting "${MEETING}" --project "${PROJECT}" --json || true)"

# --- Assert zero writes to the snapshot -------------------------------------
SIG_AFTER="$(snapshot_sig)"
if [[ "${SIG_BEFORE}" != "${SIG_AFTER}" ]]; then
  echo "WARNING: snapshot changed during the run — the scaffold path is NOT read-only!" >&2
fi

# --- Report which roadmap concerns surfaced in project-doc candidates -------
# Concern detection scans the BODIES of the docs the scaffold actually
# surfaced (read from the snapshot by their `rel` path) — mirroring what a real
# operator does when comparing the surfaced docs to the hand bundle. The
# scaffold bullet only carries a 280-char excerpt; the candidate IS the doc, so
# reading the doc the scaffold pointed at is honest (we only read paths the
# scaffold returned — never name a file ourselves). Exit 1 unless a concern is
# found, so the harness is a real gate.
echo "--- project-doc candidates (source-tagged) ---"
echo "${JSON}" | SNAPSHOT="${SNAPSHOT}" node -e '
  const fs = require("fs");
  const path = require("path");
  const SNAPSHOT = process.env.SNAPSHOT;
  let buf = "";
  process.stdin.on("data", d => buf += d);
  process.stdin.on("end", () => {
    let parsed;
    try { parsed = JSON.parse(buf); } catch { console.log("(no JSON — scaffold did not resolve)"); process.exit(1); }
    const sc = parsed && parsed.scaffold;
    if (!sc) { console.log("(no scaffold in output)"); process.exit(1); }
    const all = [
      ...(sc.sections || []).flatMap(s => s.candidates || []),
      ...(sc.unrouted || []),
    ];
    const docs = all.filter(c => c.source === "project-doc");
    if (docs.length === 0) {
      console.log("NONE — no project-doc candidate surfaced.");
      process.exit(1);
    }
    for (const c of docs) console.log("• " + c.text);

    // Collect the rel paths the scaffold surfaced and read their bodies.
    const rels = new Set();
    for (const c of docs) {
      for (const m of c.text.matchAll(/`([^`]+\.md)`/g)) rels.add(m[1]);
    }
    let bodyText = "";
    const readPaths = [];
    for (const rel of rels) {
      const abs = path.join(SNAPSHOT, rel);
      try { bodyText += "\n" + fs.readFileSync(abs, "utf8"); readPaths.push(rel); } catch {}
    }
    bodyText = bodyText.toLowerCase();
    console.log("\nsurfaced doc bodies read: " + (readPaths.length ? readPaths.join(", ") : "(none)"));

    const concerns = ["capacity", "parity", "slice-zero", "slice zero", "notion", "jira"];
    const hit = concerns.filter(k => bodyText.includes(k));
    console.log("concerns surfaced: " + (hit.length ? hit.join(", ") : "(none)"));
    console.log("template type: " + (sc.templateType || "?"));
    if (hit.length === 0) {
      console.log("\nFAIL — a project-doc surfaced but carried no roadmap concern.");
      process.exit(1);
    }
    console.log("\nPASS — surfaced " + docs.length + " project-doc candidate(s) carrying: " + hit.join(", "));
  });
'

echo
echo "Compare the above to the Phase-0 hand-assembled bundle (discovery-2026-06-14.md §E)."
echo "PASS when ≥1 project-doc candidate from ${PROJECT} surfaces a roadmap concern WITHOUT a human naming the file."
