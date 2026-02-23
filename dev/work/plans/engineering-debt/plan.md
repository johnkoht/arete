---
title: Engineering Debt
slug: engineering-debt
status: idea
created: 2026-02-22T00:00:00Z
updated: 2026-02-22T09:23:00Z
---

# Engineering Debt

Consolidated set of small technical debt items. Each is self-contained (≤ small effort) and can be picked up independently. Sources noted per item.

---

## 1. SkillService.list() API Alignment with ToolService

**Source**: Engineering lead review of router-fix-skill-rename PRD (2026-02-22)  
**Effort**: Small (4 tasks)  
**Files**: `packages/core/src/services/skills.ts`, callers in `packages/cli/src/commands/`

`SkillService.list(workspaceRoot)` internally derives the skills dir path — baking in workspace layout knowledge. `ToolService.list(toolsDir)` takes the resolved path from the caller, which is cleaner and easier to test.

**Tasks**:
1. Change `list(workspaceRoot)` → `list(skillsDir)` and `get(name, workspaceRoot)` → `get(name, skillsDir)`
2. Update CLI callers (`route.ts`, `skill.ts`) to pass `paths.agentSkills` instead of `root`
3. Check compat shims in `packages/core/src/compat/` for any `skills.list()` calls
4. Update tests

---

## 2. syncCoreSkills Stale Directory Cleanup

**Source**: Engineering lead review of router-fix-skill-rename PRD (2026-02-22)  
**Effort**: Small (3-4 tasks)  
**Files**: `packages/core/src/services/workspace.ts` L470-510

`syncCoreSkills()` copies source → target but never removes stale target directories that no longer exist in source. When a skill is renamed, `arete update` creates the new dir but leaves the old one behind — both end up in the routing candidate pool.

**Tasks**:
1. After copying, identify target dirs with no corresponding source dir
2. Filter out user-installed and overridden skills (check override set / `arete-meta.yaml` sidecar)
3. Default behavior: log warning via `arete status` rather than auto-delete; add `--prune` flag for explicit removal
4. Tests: rename scenario, user-override preservation

---

## 3. Plan Mode Post-Merge Cleanup

**Source**: Identified during plan-lifecycle-system merge review  
**Effort**: Small (3 items)  
**Files**: `.pi/extensions/plan-mode/persistence.ts`

Three hardening items, none blocking:

**3a. Stale frontmatter in migrated plan files**  
Legacy fields (`backlog_ref`, `previous_status`, `blocked_reason`) and legacy status values still exist in some archived plan files. Parser handles them at runtime but files are stale. Consider a one-time migration script to rewrite all plan files with clean frontmatter.

**3b. `archiveItem` / `shelveToBacklog` basePath convention is fragile**  
`plansDir` is derived as `join(basePath, "../plans")` — assumes backlog dir is always a sibling of plans. Works for the default layout but would break for arbitrary `basePath` values. Make `plansDir`, `backlogDir`, and `archiveDir` independently configurable rather than deriving siblings.

**3c. `moveItem` directory moves are not atomic**  
For directories, `moveItem` uses `cpSync` + `rmSync` (copy then delete). If the process crashes between copy and delete, duplicates remain. No data loss risk, but could use `renameSync` for same-filesystem moves with a copy+delete fallback for cross-filesystem.

---

## 4. Migrate dev/autonomous/ Static Assets

**Source**: PRD refactor-subagents Phase 2, deferred during execution  
**Effort**: Small (5 tasks — mechanical file moves + reference updates)  
**Files**: `dev/autonomous/` (templates, schema.ts); 4 skills + 1 rule + 1 source file

`dev/autonomous/` is marked deprecated but still has live references:

**Still referenced** (must migrate before deleting):
- `dev/autonomous/templates/PRE-MORTEM-TEMPLATE.md` → referenced by `run-pre-mortem/SKILL.md`, `review-plan/SKILL.md`, `plan-pre-mortem.mdc`, `conventions.md`
- `dev/autonomous/PRE-MORTEM-AND-ORCHESTRATION-RECOMMENDATIONS.md` → referenced by `plan-pre-mortem.mdc`
- `dev/autonomous/schema.ts` → referenced by `execute-prd/SKILL.md`, `prd-to-json/SKILL.md`, `plan-to-prd/SKILL.md`

**Tasks**:
1. Move `dev/autonomous/templates/` → `dev/templates/` (or `.agents/templates/`)
2. Move `dev/autonomous/schema.ts` → `dev/templates/prd-schema.ts`
3. Update all references: `run-pre-mortem`, `review-plan`, `execute-prd`, `prd-to-json`, `plan-to-prd`, `plan-pre-mortem.mdc`, `conventions.md`
4. Delete remaining legacy files in `dev/autonomous/` (README, prd-task-agent.md, QUICK-START, TESTING, test files, archive/)
5. Remove `dev/autonomous/` directory entirely

**Grep to confirm all refs cleared**:
```bash
grep -rn "dev/autonomous" .agents/skills/ .pi/ .cursor/rules/ .agents/sources/ --include="*.md" --include="*.mdc" --include="*.ts"
```

---

## 5. Capabilities Registry Hardening

**Source**: Identified 2026-02-18  
**Effort**: Small-medium (needs scoping into a small PRD before building)  
**Files**: `dev/catalog/capabilities.json`, `dev/catalog/README.md`

The capabilities registry exists (`dev/catalog/capabilities.json`) but is seed-only. Agents can still misclassify local customizations as built-in platform behavior.

**Outstanding work**:
1. **Coverage expansion** — Inventory all build-time tooling (Pi extensions, rules systems, agent configs, key integrations, external packages). Mark provenance (`built | customized | external`) and usage (`active | occasional | dormant`).
2. **Schema hardening** — Add `lastVerified`, `owner`, and `readBeforeChange` fields. Define deprecation lifecycle.
3. **Workflow integration** — Add checklist step in plan execution/review flow: consult registry before changing tools/services/extensions. Add periodic audit cadence.
4. **Drift prevention** — Add checks for known drift pairs (e.g., `.cursor/rules/*` vs `.pi/APPEND_SYSTEM.md`).

> **Note**: Convert to a small PRD before executing — this needs design decisions on schema and workflow hooks before building.

---

## 6. `/build` Non-PRD Execution Path Is Ad Hoc

**Source**: Identified 2026-02-22 during `/build` usage  
**Effort**: Small-medium (needs design decision before building)  
**Files**: `.pi/extensions/plan-mode/commands.ts` (L1280-1300)

`/build` has two execution paths:
- **Has PRD** (`has_prd: true`): Full orchestrator/subagent workflow via `execute-prd` skill — structured execution, code review, progress tracking.
- **No PRD** (`has_prd: false`): Sends a plain message to the current agent saying "Execute the plan. Start with: {firstStep}" — no orchestrator, no subagents, no reviewer, no progress tracking.

The non-PRD path is effectively ad hoc. For small fixes this might be fine, but the user gets no indication of what execution model they're getting. A plan with 5 todos gets the same treatment as a 1-line fix.

**Design questions to resolve**:
1. Should non-PRD plans get a lightweight orchestrated execution (extract todos → subagent loop with review)?
2. Should `/build` warn or prompt when a non-PRD plan has 3+ steps, suggesting `/prd` first?
3. Should the naming make it clearer — e.g., `/build` always requires PRD, a different command (or flag) for ad-hoc execution?
4. What's the minimum viable structure for small plans that don't warrant a full PRD but still deserve more than "go do it"?

**Options considered**:
- **Require PRD for `/build`** — clean but adds friction for small fixes
- **Lightweight orchestrated path** — extract todos, feed to orchestrator/subagents without full PRD machinery
- **Size-based routing** — tiny/small plans execute directly, medium+ prompt for `/prd` first
- **Better messaging** — at minimum, make the direct path explicit about what the user is getting
