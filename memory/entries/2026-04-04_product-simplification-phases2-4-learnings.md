# Product Simplification — Phases 2-4 Learnings

**Date**: 2026-04-04  
**Plans**: phase2-plumbing (medium), phase3-hierarchy (medium), phase4-review-ux (medium)  
**Execution**: 3 parallel sub-orchestrators in worktrees, meta-orchestrator integration, engineering-lead review, post-review fixes

---

## What Was Built

### Phase 2 — Plumbing Gaps
- **Jaccard dedup in `TaskService.addTask()`** — fast-path `@from(commitment:id)` match + ≥0.8 text similarity; returns existing task on match (idempotent write)
- **Existing tasks injected into meeting extraction** — `existingTasks` field in `MeetingContextBundle`, reads `now/week.md` + `now/tasks.md`, capped at 20, rendered as "do not duplicate" section in LLM prompt
- **Confidence include threshold raised** 0.5 → 0.65 in `meeting-processing.ts`
- **Skill dedup instructions** added to daily-plan and week-plan
- **Commitment→task auto-promotion** — week-plan shows "(already a task)" label for commitment-linked items

### Phase 3 — Hierarchy Tightening (skills only)
- `quarter-plan/SKILL.md` — Step 1.5 discovers areas, prompts for area per goal, flags unlinked goals on close (soft constraint)
- `general-project/SKILL.md` — Step 1.5 asks which goal the project advances (graceful skip if no goals)
- `week-plan/SKILL.md` — Step 1.5 asks user to select focus areas; goals shown grouped by area in planning flow
- **2/5 tasks already implemented** — task scope inheritance and commitment area inheritance were already in the TypeScript; skills-only changes sufficient for the remaining UX gaps

### Phase 4 — Review UX
- **Global "Approve High Confidence"** — configurable threshold (default 80%), approves all pending items meeting threshold
- **Meeting-level batch approval** — items grouped by `meetingSlug`; Approve/Skip Meeting buttons per group
- **Opt-in auto-approve** — amber banner shows qualifying meetings; user explicitly confirms (not silent)
- **Review summary** — approved/skipped/undecided counts + auditable list of what was auto-approved

---

## Key Metrics

- 3/3 plans completed
- 4 new tests added post-review (existingTasks injection coverage)
- 2441/2443 tests pass, 0 fail
- 0 critical bugs in engineering review
- 9 minor issues (2 fixed, 7 noted/deferred)
- typecheck ✓, all builds ✓

---

## Key Learnings

### Execution

1. **MEMORY.md conflicts are predictable** — every integration produces conflicts on this file because all sub-orchestrators append to the same index. Pattern: keep HEAD, prepend the incoming entry above existing entries. Takes 30 seconds once you know what to expect.

2. **Phase 3 had 2/5 tasks already done** — the data model (area on Task, goalSlug on Commitment) was ahead of the UX prompting. Skills-only changes were sufficient for the remaining gaps. Always verify gaps in code before building TypeScript.

3. **Engineering review caught missing test coverage** — the `existingTasks` injection path in `meeting-context.ts` had zero test coverage (confirmed by reviewer). The 4 tests added post-review cover the key paths: reads tasks, strips @tags, caps at 20, graceful degradation on missing files.

4. **Auto-approve must be opt-in** — the reviewer flagged this design principle explicitly. An amber banner that shows what qualifies and requires explicit user confirmation is strictly better than silent approval. Audit trail is essential.

5. **Review summary must use local state** — `useCompleteReview.onSuccess` invalidates the query cache, causing `usePendingReview` to refetch (returning empty). Summary data stored in `useState` survives the cache invalidation. Cache-derived approaches would vanish.

### Architecture

6. **Jaccard dedup adds a full-file read on every `addTask()`** — `listTasks({ completed: false })` reads all task files on every insert. No functional bug; worth watching at scale.

7. **Jaccard utilities still live in `meeting-extraction.ts`** — imported by `tasks.ts`, which creates a conceptual dependency. Reviewer recommended a shared `utils/jaccard.ts` module. Deferred — valid cleanup for a future engineering-debt pass.

8. **`sessionId` frozen at ReviewPage mount** — a second review in the same browser session reuses the same `sessionId`. Low real-world impact (CLI generates unique session IDs); noted for future hardening.
