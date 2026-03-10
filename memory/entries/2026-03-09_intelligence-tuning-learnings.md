# Intelligence Tuning PRD Execution Learnings

**Date**: 2026-03-09
**PRD**: Intelligence Tuning (INT-1 through INT-5)
**Status**: Complete

---

## Metrics

| Metric | Value |
|--------|-------|
| Tasks completed | 6/6 (100%) |
| First-attempt success | 6/6 (100%) |
| Total iterations | 2 (Task 0 needed test additions) |
| Tests added | ~100 new tests |
| Tests passing | 1627/1627 |
| Commits | 8 |
| Token usage | ~90K (orchestrator ~30K + subagents ~60K) |

---

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| INT-1 ↔ INT-3 confusion | No | Yes (explicit roles in prompts) | Yes |
| INT-2 schema dependency | No | Yes (Task 0 completed first) | Yes |
| Frontend auto-approve conflict | No | Yes (removed in Task 3) | Yes |
| INT-5 code duplication | No | Yes (reused reconcile()) | Yes |
| Signal loss | No | Yes (rawItems for debugging) | Yes |
| Context gaps for subagents | No | Yes (file reading lists) | Yes |
| Test coverage gaps | Partial | Yes (caught in Task 0 review) | Yes |
| Unmeasurable ACs | No | Yes (baseline captured) | Yes |

---

## What Worked Well

### 1. Pre-mortem mitigations were effective
All 8 identified risks were mitigated successfully. The explicit INT-1 vs INT-3 separation (filter vs rank) prevented confusion. The schema prerequisite (Task 0) ensured subsequent tasks had the foundation they needed.

### 2. Reviewer pre-work sanity checks caught issues early
Every task had refinements from the reviewer before developer work started:
- Task 1: Trivial patterns, filter order, category cap priority clarified
- Task 2: Backend extraction architecture identified (agent.ts has separate flow)
- Task 3: Backend schema mismatch caught (TypeBox schema didn't have confidence)
- Task 4: Scoring formula and specificity definition added
- Task 5: Completion signal extraction logic clarified

### 3. Existing patterns accelerated development
- Jaccard similarity reused from Task 1 throughout (dedup, reconciliation)
- `staged_item_source` pattern extended to `staged_item_confidence`
- CommitmentsService.reconcile() reused for INT-5
- computeRelationshipHealth() reused for priority scoring

### 4. LEARNINGS.md caught a gotcha
The Jaccard similarity test gotcha (need to mathematically verify thresholds) was documented in Task 1 and referenced in subsequent tasks.

---

## What Didn't Work Well

### 1. Dual extraction flows (core vs backend)
The backend `agent.ts` has its own extraction schema and prompt, separate from `packages/core/src/services/meeting-extraction.ts`. This required:
- Updating backend schema/prompt separately for confidence (Task 3)
- Understanding the split architecture before each task

**Recommendation**: Consider unifying extraction flows in future work, or document the split in expertise profiles.

### 2. Session timeouts during subagent work
Two subagent calls timed out mid-execution, requiring manual recovery. The work was largely done but not committed.

**Recommendation**: For long-running tasks, consider checkpointing more frequently.

---

## Subagent Reflections (Synthesized)

### Developer Insights
- Expertise profiles and file reading lists were essential for navigating the codebase
- Existing patterns (staged_item_source, Jaccard functions, Dialog components) made implementation faster
- Test mock updates were tedious when schema changed (Task 3 required updating many aiResponse mocks)

### Reviewer Insights
- Pre-work sanity checks consistently improved task clarity
- Backend/core architecture split was the most common source of refinement needs
- Documentation updates were rarely needed — patterns were already documented

---

## Recommendations

### Continue
- Pre-work sanity checks for every task (high value)
- Explicit file reading lists in subagent prompts
- Jaccard functions as reusable infrastructure
- LEARNINGS.md updates for test gotchas

### Stop
- Assuming core extraction is used by backend (check agent.ts first)
- Lengthy subagent calls without intermediate commits

### Start
- Document dual extraction architecture in expertise profiles
- Consider checkpoint commits during complex tasks
- Add backend expertise profile (currently missing, unlike core/cli/web)

---

## Documentation Gaps Identified

1. **Backend expertise profile missing**: No `.pi/expertise/backend/PROFILE.md` exists. Created Task 2-5 friction.
2. **Dual extraction architecture undocumented**: `agent.ts` vs `meeting-extraction.ts` split not explained anywhere.

---

## Files Changed (Summary)

### Core Package
- `packages/core/src/services/meeting-extraction.ts` — prompt, confidence, filters, Jaccard exports
- `packages/core/src/services/commitments.ts` — priority scoring function
- `packages/core/src/models/integrations.ts` — source/confidence fields

### Backend Package  
- `packages/apps/backend/src/services/agent.ts` — schema, prompt, dedup, confidence thresholds
- `packages/apps/backend/src/services/workspace.ts` — confidence/source parsing
- `packages/apps/backend/src/routes/intelligence.ts` — priority, reconcile endpoint

### Web Package
- `packages/apps/web/src/pages/CommitmentsPage.tsx` — priority badge, sort, filter, reconcile modal
- `packages/apps/web/src/pages/MeetingDetail.tsx` — removed auto-approve transform
- `packages/apps/web/src/components/ReviewItems.tsx` — "from your notes" badge

---

## Outcome

The Intelligence Tuning PRD is complete. Meeting extraction now:
1. Produces fewer, higher-quality items (selectivity, confidence filtering)
2. Auto-approves user-documented items (dedup with "from your notes" badge)
3. Pre-selects high-confidence items (backend-driven status)
4. Scores commitments by priority (staleness, health, direction, specificity)
5. Suggests completed commitments for resolution (reconciliation from recent meetings)
