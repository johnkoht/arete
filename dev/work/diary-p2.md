# Product Simplification — Phases 2-4 Meta-Orchestration Diary

**Branch**: worktree-product-simplification-p2  
**Date started**: 2026-04-04  
**Meta-orchestrator**: Claude Opus 4.6  

---

## Scope

Building remaining phases from `product-simplification-assessment/plan.md`:

| Phase | What | Domain | Dependencies |
|---|---|---|---|
| **2** | Plumbing gaps (dedup, context, threshold) | core, cli, runtime | None |
| **3** | Tighten hierarchy (goals→area, projects→goals, auto-tag) | runtime, cli | Phase 2 preferred first |
| **4** | Review UX (approve-all, batch, auto-approve) | web, backend | None (runs parallel with Phase 2) |
| **5** | Evaluate task/commitment unification | — | Gate: only if 2-3 don't resolve |

## Execution Strategy

- Phase 2 and Phase 4 run in parallel (different domains: core/cli vs. web)
- Phase 3 launches after Phase 2 completes (shares core/runtime)
- Phase 5 is assessment-only — no build planned unless gap persists

---

## Log

### 2026-04-04 — Session start

- [x] Created worktree `product-simplification-p2` from main
- [x] Wrote diary
- [x] Spawned Phase 2 sub-orchestrator (core/cli/runtime — plumbing) — complete ✓
- [x] Spawned Phase 4 sub-orchestrator (web/backend — review UX) — complete ✓
- [x] Phase 2 complete → spawn Phase 3
- [ ] Phase 4 complete
- [ ] Phase 3 complete
- [ ] Integration: cherry-pick all into this branch, rebuild dist, full test suite
- [ ] Engineering-lead review
- [ ] Wrap: memory entry, index

---

## Sub-Orchestrator Reports

*(filled in as agents complete)*

### Phase 2 — Plumbing Gaps
Status: **complete** ✓

**Branch**: `worktree-agent-a1506182`  
**Completed**: 2026-04-04

**Tasks**:
- [x] Jaccard dedup in `TaskService.addTask()` — exact @from match + ≥0.8 similarity, returns existing task
- [x] week.md + tasks.md open tasks injected into meeting extraction context (capped at 20, "do not duplicate" prompt)
- [x] daily-plan skill: dedup check before writing Today section
- [x] week-plan skill: shows "(already a task)" label for commitment-linked tasks, prevents double-creation
- [x] Confidence include threshold 0.5 → 0.65

**Metrics**: ~25 new tests, ~25 files changed, typecheck ✓, 2437 tests passing

**Key learnings**:
- Reused existing `jaccardSimilarity` from `meeting-extraction.ts` — consistent tokenization across codebase
- Return existing task on dedup (not an error) — idempotent write API design
- Optional field spread pattern: `...(arr.length > 0 && { field })` preserves backward compat
- Threshold change cascades to tests — always grep for affected confidence values before changing constants
- Skill instructions are advisory; `addTask()` Jaccard dedup is the hard backstop

### Phase 4 — Review UX
Status: **complete** ✓

**Branch**: `worktree-agent-a6584b92`  
**Completed**: 2026-04-04

**Tasks**:
- [x] Global "Approve All" with confidence filter (configurable threshold, default 80%)
- [x] Meeting-level batch approval (group items by meetingSlug, Approve/Skip Meeting buttons)
- [x] Smart auto-approve (opt-in banner — shows qualifying meetings, user confirms, not silent)
- [x] Review summary (approved/skipped/undecided counts + auditable auto-approve list)

**Metrics**: 26 new tests, 17 files changed, typecheck ✓, all builds ✓

**Key learnings**:
- Auto-approve must be opt-in (banner pattern) — user sees what qualifies before committing
- Review summary must use local state — cache invalidation on completion clears derived data
- Meeting title dedup: `getAllByText()` needed when title appears in group header + item metadata

### Phase 3 — Hierarchy Tightening
Status: **complete** ✓

**Branch**: `worktree-agent-aa4e0093`  
**Completed**: 2026-04-04

**Tasks**:
- [already done] Tasks inherit scope — meeting approval already passes `area` to `addTask()`. Verified, skipped.
- [already done] Commitment inherits goal/area — meeting approval already passes `meetingArea` + `selectedGoalSlug` to `commitments.create()`. Verified, skipped.
- [x] Goals require area — `quarter-plan/SKILL.md` Step 1.5: discovers areas, prompts for area on each goal, flags unlinked goals on close. Soft constraint.
- [x] Projects link to goals — `general-project/SKILL.md` Step 1.5: asks "Which goal does this project advance?" with active goal list. Graceful skip if no goals.
- [x] Week planning scopes by area — `week-plan/SKILL.md` Step 1.5: user selects focus areas, goals shown grouped by area. Auto-selects if 1 area, skips if none.

**Metrics**: 0 new tests (skill-only changes), 8 files changed, typecheck ✓, 2654 tests passing

**Key learnings**:
- 2/5 tasks already implemented in TypeScript — data model was ahead of UX prompting
- Skills-only is correct for UX gaps: data model supported area/goalSlug, agent behavior (prompting) was the gap
- Worktree branches from p2 base, not from prior phase branches — Phase 2 Jaccard not available here
