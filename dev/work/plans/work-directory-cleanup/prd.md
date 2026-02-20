# PRD: Work Directory Cleanup & Consolidation

**Version**: 1.0
**Status**: Ready for execution
**Date**: 2026-02-19
**Feature**: work-directory-cleanup

---

## 1. Problem & Goals

### Problem

Areté's development workspace has work items fragmented across 4 directories with no unified lifecycle:

- `dev/plans/` — 31 plan folders (most with only `plan.md`)
- `dev/prds/` — 6 PRD folders (separate from their plans)
- `dev/backlog/` — 22 items across 3 subcategories (features/, improvements/, decisions/)
- `dev/archive/prds/` — 17 archived PRD folders

This creates several pain points:
1. A plan's PRD lives in a different directory than the plan itself
2. Many "plans" are really just captured ideas (backlog items masquerading as plans)
3. The lifecycle `backlog → plan → prd → archive` crosses 4 directories
4. Backlog subcategories add friction without meaningful value
5. No unified frontmatter schema across work items
6. No commands for managing backlog or archive from plan mode

### Goals

1. **Consolidate** all work items under `dev/work/` with clear subdirectories: `backlog/`, `plans/`, `archive/`
2. **Co-locate PRDs** with their plans (PRD is an artifact of a plan, not a separate entity)
3. **Unified frontmatter** schema across all work items with consistent status tracking
4. **Lifecycle commands** for moving items between backlog ↔ plans ↔ archive
5. **Update all references** across skills, sources, rules, and code to point to new paths

### Success Criteria

- Zero work items in old directories (`dev/plans/`, `dev/prds/`, `dev/backlog/`, `dev/archive/`)
- All plan-mode commands work with new paths (`/plan list`, `/plan save`, `/plan open`, `/prd`, `/build`)
- New commands functional: `/plan backlog`, `/plan shelve`, `/plan archive`, `/plan backlog add`
- `grep -rn "dev/plans\b\|dev/prds\|dev/backlog\|dev/archive"` returns hits only in `memory/entries/` (historical) and `dev/work/archive/` (migrated content)
- `npm run typecheck` and `npm test` pass

### Out of Scope

- `dev/executions/` management (handled by another agent; `execution` frontmatter field added for future linking only)
- WORK.md auto-generated index (deferred; commands are the real interface)
- Backlog prioritization, sorting, or filtering
- `prd.json` location changes (stays at `dev/autonomous/prd.json` until executions agent work lands)

---

## 2. Architecture Decisions

### Directory Structure

```
dev/work/
├── backlog/          # status: idea
│   ├── foo.md        # Flat file (raw idea)
│   └── bar/          # Folder (shelved plan with artifacts)
│       ├── plan.md
│       └── prd.md
├── plans/            # status: draft, planned, building
│   └── baz/
│       ├── plan.md
│       ├── prd.md
│       ├── pre-mortem.md
│       └── review.md
└── archive/          # status: complete, abandoned
    └── qux/
        ├── plan.md
        └── prd.md
```

### Unified Frontmatter Schema

```yaml
title: string
slug: string
status: idea | draft | planned | building | complete | abandoned
size: tiny | small | medium | large | unknown
tags: [feature, improvement, integration, etc.]
created: ISO date
updated: ISO date
completed: ISO date | null
execution: string | null
has_review: boolean
has_pre_mortem: boolean
has_prd: boolean
```

### Backlog: Mixed Flat Files and Folders

- New ideas = flat `.md` files with frontmatter
- Shelved plans = folders (moved from plans/ with all artifacts intact)
- `listBacklog()` handles both: checks `isDirectory()` first, parses `plan.md` for folders, file itself for flat files
- Files without frontmatter get graceful defaults (title from filename, status: idea, tags: [], size: unknown)
- Slug collision (`foo.md` + `foo/`): prefer folder

### Command Design

| Command | Behavior |
|---------|----------|
| `/plan backlog` / `/plan backlog list` | List backlog items |
| `/plan backlog add <title>` | Create flat file with frontmatter |
| `/plan backlog edit <slug>` | Read into context, edit via write tool (stays in backlog) |
| `/plan backlog promote <slug>` | Move to plans/, flat file → folder, status → draft |
| `/plan shelve` | Move current plan to backlog/, status → idea |
| `/plan archive` | Archive current plan with confirmation |
| `/plan archive list` | List archived items |
| `/plan archive <slug>` | Archive specific plan |

---

## 3. Tasks

### Task 1: Unified Frontmatter Schema

Update the persistence layer's type system and serialization to support the new schema.

**Files to modify:**
- `.pi/extensions/plan-mode/persistence.ts`

**Implementation:**
- Update `PlanStatus` type: `"idea" | "draft" | "planned" | "building" | "complete" | "abandoned"`
- Update `PlanFrontmatter` interface: add `tags: string[]`, `execution: string | null`; remove `backlog_ref`
- Update `migrateStatus()`: map `ready` → `planned`, keep existing mappings, add `idea` and `abandoned`
- Update `serializeFrontmatter()`: serialize `tags` as `[a, b, c]` format
- Update `parseFrontmatter()`: detect `[...]` values and split by comma into string array
- Add `parseFrontmatterFromFile(filePath)`: reads a file, returns frontmatter + content; if no `---` delimiters, returns defaults derived from filename (title = titleCase(filename), slug = filename without .md, status = "idea", tags = [], size = "unknown")

**Acceptance Criteria:**
- `PlanStatus` type includes all 6 statuses
- `PlanFrontmatter` has `tags: string[]` and `execution: string | null`; no `backlog_ref`
- `migrateStatus("ready")` returns `"planned"`; `migrateStatus("idea")` returns `"idea"`
- `serializeFrontmatter()` outputs `tags: [feature, integration]` for array values
- `parseFrontmatter()` parses `tags: [feature, integration]` into `["feature", "integration"]`
- `parseFrontmatter()` parses `tags: []` into `[]`
- `parseFrontmatterFromFile()` returns sensible defaults for files without `---` delimiters
- `npm run typecheck` passes
- Existing tests updated to compile with new types

### Task 2: Audit and Migrate Existing Items

Move all work items from old directories to `dev/work/`. This runs BEFORE code path changes so the extension continues working during migration.

**Triage Rules:**
- **Archive**: plan with `status: complete`, or PRD already executed (exists in `dev/archive/prds/`), or untouched 30+ days with no PRD
- **Active**: plan with `status: building` or `status: ready`, or `work-directory-cleanup`
- **Backlog**: everything else

**Implementation:**
1. Create `dev/work/plans/`, `dev/work/backlog/`, `dev/work/archive/`
2. Present triage table to builder for approval
3. Merge PRDs from `dev/prds/` into corresponding plan folders
4. Move `dev/archive/prds/` contents to `dev/work/archive/`
5. Move `dev/backlog/` items to `dev/work/backlog/` (flatten subcategories; add tags: `features/` → `[feature]`, `improvements/` → `[improvement]`, `decisions/` → `[decision]`)
6. Add minimal frontmatter to migrated items that lack it
7. Move triaged plans to `dev/work/plans/`, `dev/work/backlog/`, or `dev/work/archive/`
8. Remove old directories: `dev/plans/`, `dev/prds/`, `dev/backlog/`, `dev/archive/`

**Acceptance Criteria:**
- Triage table presented and approved by builder before any moves
- `dev/plans/`, `dev/prds/`, `dev/backlog/`, `dev/archive/` no longer exist
- All items in `dev/work/` with correct subdirectory based on triage
- PRDs from `dev/prds/` merged into their plan folders (e.g., `dev/work/archive/persona-council/prd.md`)
- All migrated backlog items have frontmatter (at minimum: title, slug, status, tags)
- No data loss — every item accounted for

### Task 3: Update Persistence Layer Paths

Update the plan-mode extension code to use `dev/work/plans/` and add new persistence functions.

**Files to modify:**
- `.pi/extensions/plan-mode/persistence.ts`
- `.pi/extensions/plan-mode/commands.ts`
- `.pi/extensions/plan-mode/index.ts`

**3a. Path constants and notifications:**
- Change `DEFAULT_PLANS_DIR` from `"dev/plans"` to `"dev/work/plans"`
- Add `DEFAULT_BACKLOG_DIR = "dev/work/backlog"` and `DEFAULT_ARCHIVE_DIR = "dev/work/archive"`
- Update 6 hardcoded notification strings in `commands.ts` (save, list, rename, artifact save messages)
- Update notification in `index.ts` (artifact save)

**3b. New persistence functions (in `persistence.ts`):**
- `listBacklog(basePath?)`: scan backlog dir; for each entry: if directory → parse `plan.md` inside; if `.md` file → parse file directly; handle missing frontmatter with defaults; prefer folder on slug collision; sort by updated date
- `listArchive(basePath?)`: scan archive dir (folders only); parse `plan.md` inside each; sort by updated date
- `moveItem(slug, fromDir, toDir)`: move file or directory; handle both flat file and folder cases
- `promoteBacklogItem(slug, basePath?)`: find item in backlog (file or folder); if flat file → create folder in plans, move content to `plan.md`; if folder → move to plans; update status to `"draft"`; delete source
- `shelveToBacklog(slug, basePath?)`: move folder from plans to backlog; update status to `"idea"`
- `archiveItem(slug, status, basePath?)`: move from plans to archive; update status (`"complete"` or `"abandoned"`); set `completed` date
- `createBacklogItem(title, basePath?)`: slugify title; create flat file in backlog with default frontmatter template; return slug

**3c. PRD and build flow:**
- Update `/prd` handler in `commands.ts`: PRD goes to `dev/work/plans/{slug}/prd.md` (use `savePlanArtifact`)
- Update `/build` handler: PRD is at `plans/{slug}/prd.md`, not `dev/prds/{slug}/prd.md`
- Simplify `resolvePrdFeatureSlug()`: feature slug = plan slug (PRD always co-located)
- Update the `sendUserMessage` in `/prd` handler to reference `dev/work/plans/{slug}/prd.md`
- Update the `sendUserMessage` in `/build` handler similarly

**Acceptance Criteria:**
- `savePlan()`, `loadPlan()`, `listPlans()` use `dev/work/plans/`
- `/plan list` shows plans from `dev/work/plans/`
- `/plan save` writes to `dev/work/plans/{slug}/plan.md`
- `listBacklog()` returns items from `dev/work/backlog/` (mixed files/folders, missing frontmatter handled)
- `listArchive()` returns items from `dev/work/archive/`
- `promoteBacklogItem()` converts flat file to folder when promoting
- `shelveToBacklog()` preserves folder structure
- `createBacklogItem("Slack integration")` creates `dev/work/backlog/slack-integration.md` with proper frontmatter
- `/prd` creates PRD at `dev/work/plans/{slug}/prd.md`
- `/build` references PRD in plan folder
- `npm run typecheck` passes

### Task 4: Update Skills and Documentation

Update all skill files, AGENTS.md sources, rules, and living documentation to reference new paths.

**Files to update (with old → new path mapping):**

| File | Change |
|------|--------|
| `.agents/skills/plan-to-prd/SKILL.md` | `dev/prds/{name}/prd.md` → `dev/work/plans/{slug}/prd.md`; update EXECUTE.md template |
| `.agents/skills/execute-prd/SKILL.md` | `dev/prds/{name}/prd.md` → `dev/work/plans/{slug}/prd.md`; `dev/backlog/improvements/` → `dev/work/backlog/` |
| `.agents/skills/prd-post-mortem/SKILL.md` | `dev/prds/{name}/prd.md` → `dev/work/plans/{slug}/prd.md` |
| `.agents/skills/prd-to-json/SKILL.md` | `dev/prds/{name}/prd.md` → `dev/work/plans/{slug}/prd.md` |
| `.agents/sources/shared/workspace-structure.md` | Update plan system of record + archive location |
| `.agents/sources/builder/memory.md` | `dev/backlog/` → `dev/work/backlog/` |
| `.agents/sources/builder/conventions.md` | `dev/backlog/improvements/` → `dev/work/backlog/` |
| `.agents/sources/README.md` | Archive PRD reference |
| `.pi/APPEND_SYSTEM.md` | Backlog grep path, plan save path |
| `.cursor/rules/dev.mdc` | Backlog grep path |
| `memory/collaboration.md` | Backlog references (living doc) |

**Do NOT update:** `memory/entries/*.md` — these are historical and document what happened at that time.

**After all updates:**
- Run `npm run build:agents:dev` to rebuild AGENTS.md
- Run validation grep: `grep -rn "dev/plans\b\|dev/prds\|dev/backlog\|dev/archive" --include="*.ts" --include="*.md" --include="*.mdc" .`
- Only acceptable hits: `memory/entries/` and `dev/work/archive/` content

**Acceptance Criteria:**
- All 11 files updated with correct new paths
- `execute-prd/SKILL.md` references `dev/work/backlog/` for refactor backlog items (not `dev/backlog/improvements/`)
- `plan-to-prd/SKILL.md` EXECUTE.md template uses `dev/work/plans/{slug}/prd.md`
- AGENTS.md rebuilt successfully via `npm run build:agents:dev`
- Validation grep returns zero hits outside `memory/entries/` and `dev/work/archive/`
- `memory/entries/` files untouched

### Task 5: Add Backlog Commands

Add `/plan backlog`, `/plan shelve` commands to the plan-mode extension.

**Files to modify:**
- `.pi/extensions/plan-mode/commands.ts`
- `.pi/extensions/plan-mode/index.ts` (if command registration needed)

**Implementation:**

Add to the `switch` statement in `handlePlan()`:
- `case "backlog"`: delegate to `handleBacklog(subcommand.slice(1).join(" "), ctx, pi, state)`
- `case "shelve"`: delegate to `handleShelve(ctx, pi, state)`

`handleBacklog(args, ctx, pi, state)`:
- Parse first word of args as sub-subcommand
- No args or `"list"` → call `listBacklog()`, display with `ctx.ui.select()`, show status emoji and title
- `"add"` + remaining text as title → call `createBacklogItem(title)`, notify: `"📝 Created backlog item: dev/work/backlog/{slug}.md"`
- `"edit"` + slug → read backlog item content, send to agent via `pi.sendUserMessage()` with context about the item; no state machine changes
- `"promote"` + slug → call `promoteBacklogItem(slug)`, then load the promoted plan into state (same as `handlePlanOpen`)

`handleShelve(ctx, pi, state)`:
- If no current plan: notify warning
- Confirm: `"Shelve '{title}' to backlog?"`
- Call `shelveToBacklog(state.currentSlug)`
- Clear plan state (slug, planText, todoItems, etc.)
- Notify: `"📦 Shelved to dev/work/backlog/{slug}/"`

Update the "Unknown subcommand" message to include `backlog`, `shelve`, `archive`.

**Acceptance Criteria:**
- `/plan backlog` shows list of backlog items (not shelve action)
- `/plan backlog list` shows list of backlog items with status emoji
- `/plan backlog add "Slack integration"` creates `dev/work/backlog/slack-integration.md`
- `/plan backlog edit some-item` reads content into chat context
- `/plan backlog promote some-item` moves to plans/ and loads as active plan
- `/plan shelve` moves current plan to backlog/ with confirmation
- `/plan shelve` with no active plan shows warning
- Promoting a flat file creates a folder with `plan.md`
- Shelving preserves folder structure (all artifacts kept)

### Task 6: Add Archive Commands

Add `/plan archive` commands to the plan-mode extension.

**Files to modify:**
- `.pi/extensions/plan-mode/commands.ts`

**Implementation:**

Add to the `switch` statement:
- `case "archive"`: delegate to `handleArchive(subcommand.slice(1).join(" "), ctx, pi, state)`

`handleArchive(args, ctx, pi, state)`:
- No args → archive current plan:
  - If no current plan: notify warning
  - Ask via `ctx.ui.select()`: `"Archive as:"` with options `["✅ Complete", "🚫 Abandoned"]`
  - Call `archiveItem(state.currentSlug, status)`
  - Clear plan state
  - Notify: `"📁 Archived to dev/work/archive/{slug}/"`
- `"list"` → call `listArchive()`, display with `ctx.ui.select()`, show status emoji
- Any other value → treat as slug, archive that specific plan (with confirmation)

**Acceptance Criteria:**
- `/plan archive` with active plan shows complete/abandoned choice, then archives
- `/plan archive` with no active plan shows warning
- `/plan archive list` shows archived items
- `/plan archive some-plan` archives a specific plan by slug
- Archived items have `status` updated and `completed` date set
- Plan state cleared after archiving current plan

### Task 7: Update Tests

Update existing tests and add comprehensive tests for all new functionality.

**Files to modify:**
- `.pi/extensions/plan-mode/persistence.test.ts`
- `.pi/extensions/plan-mode/commands.test.ts`
- `.pi/extensions/plan-mode/utils.test.ts`

**Test cases for persistence.ts:**

Frontmatter schema:
- `migrateStatus("ready")` → `"planned"`
- `migrateStatus("idea")` → `"idea"`
- `migrateStatus("abandoned")` → `"abandoned"`
- `serializeFrontmatter()` with tags: `[feature, integration]`
- `parseFrontmatter()` with tags: `[feature, integration]` → `["feature", "integration"]`
- `parseFrontmatter()` with tags: `[]` → `[]`
- `parseFrontmatter()` with tags: `[feature]` → `["feature"]`
- `parseFrontmatter()` with no tags field → default `[]`
- `parseFrontmatterFromFile()` with valid frontmatter
- `parseFrontmatterFromFile()` with no frontmatter (graceful defaults)

Backlog operations:
- `listBacklog()` with only flat files
- `listBacklog()` with only folders
- `listBacklog()` with mixed flat files and folders
- `listBacklog()` with file without frontmatter (graceful defaults)
- `listBacklog()` slug collision: `foo.md` + `foo/` → prefer folder
- `createBacklogItem("Some Title")` creates correct file with frontmatter
- `promoteBacklogItem()` with flat file → creates folder with `plan.md`
- `promoteBacklogItem()` with folder → moves folder, updates status
- `shelveToBacklog()` moves folder, updates status to `idea`
- `archiveItem()` moves to archive, updates status and completed date

Move operations:
- `moveItem()` with flat file
- `moveItem()` with folder (all contents preserved)

**Test cases for commands.ts:**
- Updated path references in test fixtures
- `handlePlanSave` creates frontmatter without `backlog_ref`

**Test cases for utils.ts:**
- Update `isAllowedInPlanMode` test that references `dev/prds/plan-mode-ux`

**Acceptance Criteria:**
- `npm run typecheck` passes
- `npm test` passes (full suite, not just new tests)
- All new persistence functions have test coverage
- Tags parsing edge cases covered (empty, single, multiple, missing)
- Backlog mixed-format handling tested
- Move operations tested for both file and folder cases

---

## 4. Pre-Mortem Risks

See `dev/plans/work-directory-cleanup/pre-mortem.md` for full analysis. Key risks:

| Risk | Severity | Mitigation |
|------|----------|------------|
| Incomplete path migration (50+ refs) | High | File-by-file checklist in Task 4; validation grep |
| Step ordering (broken mid-migration) | High | Migrate files (Task 2) BEFORE code changes (Task 3) |
| Flat file vs. folder parsing | Medium | Shared `parseFrontmatterFromFile()`; test both paths |
| Command routing (`/plan backlog` = list, not shelve) | Medium | `/plan shelve` as separate command |
| Tags array parsing | Medium | Specific test cases in Task 7 |
| execute-prd backlog path | Medium | Update 4 refs in Task 4 |
| PRD path in /build | High | Trace full flow in Task 3c |

## 5. Task Dependencies

```
Task 1 (schema) ──→ Task 2 (migrate) ──→ Task 3 (code paths) ──→ Task 4 (docs/skills)
                                                                        ↓
                                         Task 5 (backlog cmds) ←── Task 3
                                         Task 6 (archive cmds) ←── Task 3
                                         Task 7 (tests) ←── Tasks 1, 3, 5, 6
```

- **Task 1** has no dependencies (pure type/schema changes)
- **Task 2** depends on Task 1 (needs new frontmatter schema for migration)
- **Task 3** depends on Task 2 (files must be in new locations first)
- **Task 4** depends on Task 2 (references should point to where files actually are)
- **Tasks 5 & 6** depend on Task 3 (need new persistence functions)
- **Task 7** depends on Tasks 1, 3, 5, 6 (tests the full system)

**Recommended execution order**: 1 → 2 → 3 → 4 → 5 → 6 → 7
