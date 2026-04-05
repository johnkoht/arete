# BUILD Skills Tighten-Up — Learnings

**Date**: 2026-04-05
**Slug**: build-skills-tighten
**Phases**: A (Foundation), B (Process), C (Agent Experience), D (Cleanup)
**Steps**: 16/16

---

## Metrics

- Steps executed: 16/16
- Eng lead reviews: 4 (one per phase + final holistic)
- Real issues caught by reviews: 7 (all fixed)
- False positives: 4
- Commits: 12
- Files created: 3 new (build-log-protocol.md, multi-phase-protocol.md, standards/working-memory.md structure)
- Files deleted: 1 (engineering-lead.md)
- Ship.md: 2363 → ~375 lines

---

## Pre-Mortem Effectiveness

| Risk | Materialized? | Mitigation effective? |
|------|-------------|----------------------|
| Dead links after extraction | Partially — 1 stale archive path, 1 stale tree entry | Fixed immediately on review |
| Engineering-lead merge scope creep | No | Testing Requirements section uniquely valuable — clear what to move |
| ship.md context loss | No | Multi-phase-protocol.md preserved all content structurally |
| Signal tag consistency | No — pre-mortem prompted careful cascade | Tags flow cleanly developer → execute-prd → prd-post-mortem → orchestrator |

---

## What Worked / What Didn't

**+** Per-phase eng lead reviews caught real issues early — 7 real fixes across 4 reviews before a holistic pass
**+** Extracting build-log-protocol.md first gave a clean model for every other extraction
**+** Signal tag cascade (all 4 files updated in one pass per tag) kept the system coherent
**+** Explicit "not a real issue" analysis on false positives saved re-work (4 of 11 reviewer flags were wrong)
**+** Multi-phase-protocol.md as a separate file kept ship/SKILL.md at target length while preserving all detail
**+** Working memory section structure (4 named sections) gives developers concrete update targets vs "write whatever"

**-** No typecheck/npm test run — this was a documentation/skills refactor so no code changes, but the /wrap check for memory entry was skipped until prompted
**-** DEVELOPER.md tree diagram wasn't scanned during engineering-lead deletion — found in holistic review
**-** Collaboration.md update happened in Phase C but memory entry creation was deferred to end (Phase 5 steps)

---

## Recommendations

**Continue**:
- Per-phase reviews before proceeding — they catch real issues without slowing the build much
- Extracting shared reference files as step 1 of any skills refactor (creates clean foundation)
- Explicit false-positive analysis rather than just accepting every reviewer finding

**Stop**:
- Deferring memory entry + CHANGELOG to the very end — these should be built into the commit flow, not an afterthought

**Start**:
- Scanning ALL `.md` files (not just `.pi/`) for role references when deleting/renaming an agent
- Verifying tree diagrams in docs files during agent file deletions

---

## Follow-Ups

- Consider adding `DEVELOPER.md` tree diagram to audit skill's manifest so it's checked periodically
- `patterns.md` now has 2 patterns (fallback-first migration, and prior entries) — could benefit from a 3rd: working-memory cross-task pattern
- Three-track routing (Express/Standard/Full) is new — monitor whether agents correctly select their track in next 3 PRD executions
