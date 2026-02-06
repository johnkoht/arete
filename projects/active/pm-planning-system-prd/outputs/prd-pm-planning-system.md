# PRD: PM Planning System

**Version**: 1.0  
**Status**: Approved for implementation  
**Execution**: Autonomous agent loop (prd.json)

---

## 1. Problem & Goals

### Problem
PMs need a single place to see their high-level goals, align them with org strategy (`context/goals-strategy.md`), set quarterly goals, and run weekly plans to execute workload. Today Areté has org context and project-based roadmap planning but no PM-level execution cascade (quarter → week → day).

### Goals
- **View & align**: PM can view their goals and compare/roll up to org strategy.
- **Quarterly goals**: PM sets 3–5 outcomes per quarter with explicit links to org pillars/OKRs.
- **Weekly plans**: PM plans the week with top priorities linked to quarter goals; week review captures completion and carry-over.
- **arete update**: Running `arete update` creates `resources/plans/` and planning templates so existing workspaces get the feature.
- **Documentation**: AGENTS.md, SETUP.md, and pm-workspace rules updated; READMEs in place.

### Out of scope (Phase 2)
- Daily plan skill and daily plan files.
- Central task/backlog system or CLI for tasks.
- CLI commands for plans (`arete plans quarter`, etc.) — skills-only for v1.

---

## 2. User Stories (Summary)

1. As a PM I can run `arete update` and get `resources/plans/` and planning templates so I have a place for quarter/week plans.
2. As a PM I can use a **quarter-plan** skill to set quarterly goals with alignment to `context/goals-strategy.md`.
3. As a PM I can use a **goals-alignment** (view goals) skill to see org vs my quarter goals in one view.
4. As a PM I can use a **week-plan** skill to set weekly priorities linked to quarter goals.
5. As a PM I can use a **week-review** skill to close the week and capture carry-over and quarter progress.
6. As a PM I can find planning system documentation in AGENTS.md, SETUP.md, and READMEs.

---

## 3. Requirements

### 3.1 Workspace structure (arete update)
- Add to workspace structure (single source of truth): `resources/plans`, `resources/plans/archive`, `templates/plans`.
- Add default files (created when missing on install/update):
  - `resources/plans/README.md` — describes planning hierarchy (quarter → week → daily later), file naming (`quarter-YYYY-Qn.md`, `week-YYYY-Www.md`), and that org strategy lives in `context/goals-strategy.md`.
  - `templates/plans/quarter-goals.md` — structure: quarter dates, 3–5 outcomes with success criteria and org alignment (pillar/OKR), alignment table.
  - `templates/plans/week-priorities.md` — structure: week dates, top 3–5 outcomes with quarter goal links, commitments due, carried over.
- Ensure tests for workspace structure include the new dirs and files so regressions are caught.

### 3.2 Skills (markdown only; no new CLI or TS for v1)
- **quarter-plan**: When to use (set quarter goals, plan quarter, align to org). Workflow: read `context/goals-strategy.md` and last quarter if any; guide PM to 3–5 outcomes; for each outcome capture success criteria and link to pillar/OKR; write `resources/plans/quarter-YYYY-Qn.md` using template structure; include alignment table.
- **goals-alignment**: When to use (view goals, compare to org, roll up). Workflow: read `context/goals-strategy.md` and current quarter file; output alignment view (org pillars/OKRs vs PM quarter goals, optional gaps); no new file by default; optional save snapshot to `resources/plans/archive/alignment-YYYY-Qn.md`.
- **week-plan**: When to use (plan week, set weekly priorities). Workflow: read current quarter goals, last week file, projects/active, scratchpad/commitments; guide PM to top 3–5 week outcomes with quarter goal links; write `resources/plans/week-YYYY-Www.md`; include commitments due and carried over.
- **week-review**: When to use (review week, close week). Workflow: read current week file and quarter file; mark priorities done/partial/carried; brief quarter goal progress; optional one paragraph to `memory/summaries/sessions.md` or in week file.

### 3.3 Documentation
- **AGENTS.md**: Add a "Planning System" subsection under a suitable section (e.g. Key Systems or High-Level Features) describing: where plans live (`resources/plans/`), quarter and week file naming, alignment to `context/goals-strategy.md`, and which skills to use (quarter-plan, goals-alignment, week-plan, week-review). Mention daily as Phase 2.
- **SETUP.md**: Mention planning (resources/plans, templates/plans) in workspace layout and that `arete update` backfills them.
- **pm-workspace.mdc**: In PM Actions or "Before Starting Any Work", add entries for "view goals", "set quarter goals", "plan week" pointing to the relevant skills.

### 3.4 READMEs
- `resources/plans/README.md` (content in 3.1) — created as default file.
- No separate README for templates/plans required if the quarter/week templates are self-explanatory; the plans README can reference them.

---

## 4. Acceptance Criteria (Implementation)

- [ ] `WORKSPACE_DIRS` includes `resources/plans`, `resources/plans/archive`, `templates/plans`.
- [ ] `DEFAULT_FILES` includes `resources/plans/README.md`, `templates/plans/quarter-goals.md`, `templates/plans/week-priorities.md` with correct content.
- [ ] Workspace structure tests assert the new dirs and at least one new default file.
- [ ] Skill files exist: `.cursor/skills/quarter-plan/SKILL.md`, `.cursor/skills/goals-alignment/SKILL.md`, `.cursor/skills/week-plan/SKILL.md`, `.cursor/skills/week-review/SKILL.md` with When to Use and Workflow as specified.
- [ ] AGENTS.md updated with Planning System description and skill references.
- [ ] SETUP.md updated with planning in workspace layout and update behavior.
- [ ] pm-workspace.mdc updated with planning actions/skills.
- [ ] Running `npm run typecheck` and `npm test` passes after all changes.

---

## 5. Dependencies & References

- **Plan**: PM Planning System plan (plan file and summary in conversation).
- **Org context**: `context/goals-strategy.md` — unchanged; source for alignment.
- **Existing skills**: construct-roadmap (product roadmap, different from PM quarter goals); periodic-review (context health, can reference planning in suggestions).
- **Workspace structure**: `src/core/workspace-structure.ts` is single source of truth; install and update use it.

---

## 6. Success Metrics

- User runs `arete update` in an existing workspace and sees `resources/plans/` and `resources/plans/README.md` (and templates) created.
- User can invoke quarter-plan, goals-alignment, week-plan, week-review from Cursor and follow the skill workflows to create/update the correct files.
- Documentation allows a new user or agent to understand where plans live and how they align to org strategy.
