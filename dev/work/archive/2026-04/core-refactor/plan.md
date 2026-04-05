---
title: Core Refactor
slug: core-refactor
status: idea
size: unknown
tags: []
created: 2026-03-18T03:51:29.319Z
updated: 2026-03-18T13:59:34.968Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 8
---

This is a significant scope. Let me create the formal Phase 2 plan:

---

# Phase 2: Goals Refactor

## Problem Statement

Current goals are stored in a single `goals/quarter.md` file. Users want individual goal files with frontmatter (status, quarter, type) and freeform body for flexibility and better tracking.

## Current State

- `goals/quarter.md` — all quarter goals in one file
- `goals/strategy.md` — org strategy (unchanged)
- 10+ skills reference `goals/quarter.md`
- Backend parses `goals/quarter.md` for web UI
- Context service includes `goals/quarter.md`

## Target State

- Individual goal files: `goals/2026-Q1-1-outcome-title.md`
- Frontmatter: `status` (active/complete/deferred), `quarter`, `type` (outcome/milestone), `orgAlignment`
- Freeform body for description, notes, progress
- Backward compatible: Skills work with both old and new formats
- Simple migration changelog for users

---

## Plan:

### Phase 2A: Core Infrastructure (Tasks 1-3)

1. **Create goal model and parser** — Add `Goal` type to entities.ts with frontmatter fields (status, quarter, type, orgAlignment, successCriteria). Create goal parser service in core that reads individual goal files from `goals/` directory, supports both new format (individual files) and legacy format (`goals/quarter.md`).

2. **Update backend goals route** — Modify `/api/goals/quarter` to use new goal parser. Return same response shape for backward compat. Add new `/api/goals/list` endpoint returning all goals with full metadata. Handle mixed format (some individual, some in quarter.md).

3. **Update context service** — Modify `packages/core/src/services/context.ts` to glob individual goal files in addition to `goals/quarter.md`. Ensure goal files are included in context injection.

### Phase 2B: Skill Updates (Tasks 4-7)

4. **Update quarter-plan skill** — Modify to write individual goal files instead of single `quarter.md`. Keep `quarter.md` as an index file that lists goals with links. Add frontmatter structure to template.

5. **Update goals-alignment skill** — Modify to read individual goal files. Build alignment view from frontmatter `orgAlignment` field. Maintain same output format.

6. **Update week-plan and week-review skills** — Modify to read goals from individual files. Link week priorities to goal slugs instead of inline references.

7. **Update prepare-meeting-agenda skill** — Modify goal context reading to use individual files.

### Phase 2C: Migration (Task 8)

8. **Create migration guide and changelog prompt** — Add migration instructions to user workspace (via `arete update`). Include changelog prompt that users can run to convert existing `quarter.md` to individual files.

---

## Size: Medium (8 tasks)
## Risk Level: Medium (touches core data model, multiple skills, backward compat required)
## Recommendation: Pre-mortem required, then /ship

---

Before executing, I should run **parallel PM + Eng Lead reviews** as we did for Phase 1, then refine the plan. Should I proceed with the full autonomous /ship process for Phase 2?