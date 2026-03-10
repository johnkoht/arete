# Pre-Mortem: Web Fast Follow

## Overview

**Work Type**: UI polish and feature work across web frontend
**Execution Model**: Phase 1 (foundation) → Phase 2 (3 parallel sub-orchestrators)
**Size**: Large (12 items across 4 foundation + 3 tracks)

---

## Risk 1: Parallel Track Style Divergence

**Problem**: Three sub-orchestrators implement UI changes in parallel without seeing each other's work. Each makes "reasonable" styling decisions, but results in inconsistent badge colors, spacing, or component usage across tracks.

**Mitigation**:
- Phase 1 MUST complete badge system audit (F1) and PageHeader standardization (F2) BEFORE any Phase 2 work begins
- Create explicit style reference in Phase 1: list exact Tailwind classes for badges, spacing values, max-widths
- Each sub-orchestrator prompt must reference: "Use badge styles from F1, PageHeader from F2"

**Verification**: Before spawning any Phase 2 sub-orchestrator, verify F1 and F2 are complete with documented style decisions.

---

## Risk 2: File Ownership Conflicts

**Problem**: Multiple tracks edit the same file simultaneously. Track B touches pagination in CommitmentsPage while Track C is redesigning CommitmentsPage — merge conflicts or overwritten work.

**Mitigation**:
- Explicit file ownership defined in plan:
  - Track A: `ReviewItems.tsx`, `packages/runtime/skills/`
  - Track B: `MeetingDetail.tsx`, `PeopleIndex.tsx`, `MemoryFeed.tsx`
  - Track C: `PersonDetailPage.tsx`, `CommitmentsPage.tsx`
- Track B does NOT add pagination to CommitmentsPage — that's Track C's responsibility
- Verify no overlap before spawning parallel tracks

**Verification**: Check plan's file ownership table before each track starts. If overlap detected, sequence the tracks.

---

## Risk 3: Projects API Data Shape Mismatch

**Problem**: SearchableSelect component and project picker assume Projects API returns `{ id, label }` format, but actual API returns different shape. Track A fails or builds wrong integration.

**Mitigation**:
- In Phase 1 (F4: Data Model), verify projects endpoint response shape
- Document expected format: `GET /api/projects` returns `{ projects: [{ slug, name, ... }] }`
- If format differs, adjust SearchableSelect to handle it OR update API

**Verification**: Before Phase 2 Track A starts, confirm projects API works with `curl http://localhost:3847/api/projects`.

---

## Risk 4: PageHeader Refactor Breaks Existing Pages

**Problem**: F2 changes PageHeader component, but some pages rely on current behavior (specific padding, height, etc.). Changes break pages that weren't tested.

**Mitigation**:
- Audit all 10+ pages that could use PageHeader before modifying
- Run full `npm run build` after PageHeader changes
- Visually check MeetingsIndex, PeopleIndex, CommitmentsPage, MemoryFeed before declaring F2 complete

**Verification**: After F2, open each list page in browser and verify header looks correct.

---

## Risk 5: Backend Pagination Not Implemented

**Problem**: Plan assumes backend supports `limit` and `offset` for pagination. If backend doesn't support this, Track B pagination work fails or requires scope expansion.

**Mitigation**:
- Before Phase 2, verify backend routes support pagination:
  - `GET /api/meetings?limit=25&offset=0`
  - `GET /api/people?limit=25&offset=0`
  - `GET /api/commitments?limit=25&offset=0`
  - `GET /api/memory?limit=25&offset=0`
- If any don't support it, add backend pagination to Track B scope

**Verification**: Test each API endpoint with limit/offset params before Track B starts.

---

## Risk 6: People Detail Page Scope Creep

**Problem**: C1 (People Detail redesign) is the largest item — 4 sub-tasks including markdown drawer. Risk of over-implementing or getting stuck on edge cases (markdown parsing, drawer animations, etc.).

**Mitigation**:
- Strict acceptance criteria: "drawer opens and shows markdown" — not "perfect Notion-like experience"
- Use existing MarkdownEditor component; don't build new one
- Time-box drawer work: if >2 hours, simplify (modal instead of drawer)
- Skip: custom animations, auto-save, collaborative editing

**Verification**: After C1, check: "Does it meet ACs? Did we add anything not in ACs?"

---

## Risk 7: ReviewItems.tsx Test Breakage

**Problem**: Track A modifies ReviewItems.tsx which has existing tests (`ReviewItems.test.tsx`). Changes break tests, track proceeds without fixing them.

**Mitigation**:
- Track A prompt must include: "Run `npm test packages/apps/web/src/components/ReviewItems.test.tsx` after changes"
- Any test failures must be fixed before task is marked complete
- If tests are flaky or outdated, note in completion but don't delete tests

**Verification**: After Track A completes, `npm test` passes.

---

## Risk 8: Sub-Orchestrator Context Loss

**Problem**: Each sub-orchestrator is a fresh context. They don't know about Phase 1 decisions, badge colors, or PageHeader API. They implement things incorrectly.

**Mitigation**:
- Each sub-orchestrator prompt includes:
  1. Link to plan.md
  2. Explicit Phase 1 outputs: "Badge styles are in StatusBadge.tsx. PageHeader takes `title`, `description?`, `action?` props."
  3. File ownership reminder
  4. Quality gates: "Run npm run typecheck && npm test before reporting complete"
- Me-orchestrator reviews each track's first task before approving rest

**Verification**: First task from each track reviewed before proceeding.

---

## Summary

**Total risks identified**: 8
**Categories covered**: Integration, Scope Creep, Dependencies, Code Quality, Context Gaps, Test Patterns

**Highest-stakes risks**:
1. Style divergence (visual inconsistency)
2. Scope creep on People Detail (time sink)
3. Backend pagination missing (blocks Track B)

**Ready to proceed with these mitigations.**
