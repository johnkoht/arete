# Meeting Processing CLI Parity — PRD Learnings

**Date**: 2026-03-15
**PRD**: `dev/work/plans/meeting-processing/prd.md`
**Branch**: `feature/meeting-processing`

---

## Summary

Executed PRD to achieve CLI/UI interchangeability for meeting processing. All 5 tasks completed successfully with 100% first-attempt success rate (no iterations required).

**Commits**: 8 (5 implementation + 1 docs + 2 review fixes)
- `4e3cdf9` — feat(core): add processMeetingExtraction and extractUserNotes
- `3bb60a2` — refactor(backend): use processMeetingExtraction from core
- `fc88c3b` — feat(cli): add full metadata to meeting extract --stage
- `70384ec` — feat(cli): add meeting approve command
- `5ca735d` — feat(cli): add --clear-approved flag to meeting extract
- `49ca9fa` — docs: add meeting approve command to CLI docs
- `3ac6b66` — refactor: extract duplicated functions to core (review fix)
- `e335a96` — docs: update LEARNINGS.md and PROFILE.md (review fix)

**Tests Added**: 67 new tests (39 + 3 + 9 + 4 + 12)
**Code Impact**: +~400 lines core, +~250 lines CLI, -282 lines backend (net: ~370)

---

## What Worked Well

### 1. Pre-mortem Risk Identification
Identified 8 risks upfront. None materialized because mitigations were applied:
- Jaccard function duplication → explicitly stated "reuse existing" in prompts
- Backend regression → all 30 backend tests passed
- Gray-matter caching → documented clone pattern in prompts
- Typecheck gap → explicit AC for `npm run build:apps:backend`

### 2. Reviewer Pre-Work Sanity Checks
The reviewer caught issues before developers started:
- Task 1: Input type ambiguity (MeetingIntelligence vs MeetingExtraction)
- Task 1: Missing Jaccard test math warning
- Task 3: gray-matter not in CLI deps (uses yaml instead)
- Task 3: Body section format needed clarification (filtered vs unfiltered items)
- Task 4: Flag semantics unclear (--all, --items, --skip)
- Task 4: Missing --skip-qmd flag
- Task 5: Status reset behavior ambiguous

These catches prevented iteration cycles.

### 3. Additional Scope Discovery During Pre-Mortem
Identified that `extractUserNotes()` also needed to move to core for dedup consistency. Builder confirmed and scope was added to Task 1. This prevented CLI/backend divergence.

### 4. Context File References
Explicit line number references in prompts (e.g., "backend's agent.ts lines 100-350") helped developers navigate quickly.

---

## Pre-Mortem Analysis

| Risk | Materialized | Mitigation Applied | Effective |
|------|-------------|-------------------|-----------|
| Backend behavior regression | No | All 30 tests must pass | ✅ Yes |
| Type incompatibility | No | ProcessedMeetingResult type | ✅ Yes |
| Jaccard function duplication | No | "Reuse existing" in prompts | ✅ Yes |
| Gray-matter caching bug | No | Clone pattern documented | ✅ Yes |
| typecheck misses backend | No | Explicit build:apps:backend AC | ✅ Yes |
| Test isolation | No | Unique temp directories | ✅ Yes |
| Core API mismatch | No | Read staged-items.ts context | ✅ Yes |
| --json handling errors | No | "All error paths" in prompts | ✅ Yes |

---

## Collaboration Patterns Observed

- **Pre-mortem discussion worked**: Builder asked about extraction logic parity before execution, which surfaced the `extractUserNotes()` scope addition early.
- **Quick approvals**: Builder approved pre-mortem and scope addition quickly when trade-offs were clear.
- **Trust in subagent quality**: All 5 tasks completed without iteration; reviewer approved on first submission.

---

## Recommendations

### Continue
- Pre-mortem risk identification with specific mitigations
- Reviewer pre-work sanity checks (caught 8+ issues)
- Explicit line number references in context files
- Including LEARNINGS.md paths in "Context — Read These Files First"

### Start
- For refactoring PRDs: Include "before" and "after" function signatures explicitly
- For new CLI commands: Always include `--skip-qmd`, `--json` patterns in AC checklist
- Run reviewer sanity check → refine → dispatch developer (this sequence worked well)

### Stop
- Nothing to stop — execution was clean

---

## Documentation Updates

- `.agents/sources/shared/cli-commands.md` — Added `arete meeting approve` command and `--clear-approved` flag
- AGENTS.md rebuild pending (run `npm run build:agents:prod` before merge)

---

## Post-PRD Engineering Lead Review

Engineering lead review identified issues that developers missed:

**Code Duplication Found**:
- `clearApprovedSections()` — duplicated identically in backend and CLI
- `formatStagedSectionsFromFiltered()` — similar implementations in backend/CLI

**Documentation Gaps Found** (developers reported "None" but these were missing):
- `packages/core/src/services/LEARNINGS.md` — no mention of new meeting-processing.ts module
- `.pi/expertise/core/PROFILE.md` — Component Map missing meeting-processing.ts entry
- `.pi/expertise/cli/PROFILE.md` — missing approve command and --clear-approved flag
- Gotcha about decisions/learnings defaulting to 0.9 confidence

**All issues fixed** in commits `3ac6b66` and `e335a96`.

**Lesson**: Developer "Documentation Updated: None" responses should be skeptically reviewed when PRDs add new modules or commands. Significant functionality additions almost always need documentation.

---

## Next Steps

1. Review and merge `feature/meeting-processing` branch
2. Run `npm run build:agents:prod` to rebuild AGENTS.md with new CLI command
3. Manual verification: Process meeting via CLI → check in UI; process via UI → approve via CLI
