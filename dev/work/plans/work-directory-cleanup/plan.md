---
title: Work Directory Cleanup & Consolidation
slug: work-directory-cleanup
status: building
size: large
created: 2026-02-19T14:39:00Z
updated: 2026-02-20T03:41:28.066Z
completed: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 7
tags: []
---

# Work Directory Cleanup & Consolidation

## Problem

Work items are scattered across 4 directories (`dev/plans/`, `dev/prds/`, `dev/backlog/`, `dev/archive/prds/`) with no unified lifecycle. Plans and their PRDs live in separate trees. Backlog categories (features/improvements/decisions) add friction without value. Status tracking is fragmented across locations.

## Target Structure

```
dev/work/
├── backlog/
│   ├── slack-integration.md       # Raw idea (flat file)
│   └── multi-ide-v2/              # Shelved plan with artifacts (folder)
│       ├── plan.md
│       ├── prd.md
│       └── review.md
├── plans/
│   └── plan-cleanup/
│       ├── plan.md                # status: draft → planned → building
│       ├── prd.md
│       ├── pre-mortem.md
│       └── review.md
└── archive/
    └── multi-ide-support/
        ├── plan.md                # status: complete
        ├── prd.md
        └── ...
```

## Key Design Decisions

1. **Backlog items are flat files OR folders.** New ideas start as flat `.md` files. If a fleshed-out plan (with PRD, review, etc.) gets shelved, the whole folder moves to backlog — no artifact loss.

2. **PRDs live inside the plan folder**, not separately. A PRD is an artifact *of* a plan: `dev/work/plans/slack-integration/prd.md`.

3. **No backlog subcategories.** Tags in frontmatter replace features/improvements/decisions folders.

4. **Unified frontmatter** across all work items (backlog files and plan.md files). Files without frontmatter are handled gracefully (derive title from filename, default status/tags).

5. **Status drives location**: `idea` → backlog/, `draft`/`planned`/`building` → plans/, `complete`/`abandoned` → archive/.

6. **Execution link**: `execution` field in frontmatter connects to `dev/executions/<slug>` (managed separately).

7. **Backlog items stay in place when edited.** `/plan backlog edit` reads content into chat context; user edits via write tool. No state machine changes needed — simple approach.

8. **Once a folder, always a folder.** A flat file gets upgraded to a folder on promote, but shelving a plan back to backlog keeps the folder structure.

## Unified Frontmatter Schema

```yaml
title: string
slug: string
status: idea | draft | planned | building | complete | abandoned
size: tiny | small | medium | large | unknown
tags: [feature, improvement, integration, etc.]
created: ISO date
updated: ISO date
completed: ISO date | null
execution: string | null  # e.g., dev/executions/slack-integration
has_review: boolean
has_pre_mortem: boolean
has_prd: boolean
```

Status semantics:
- `idea` — raw concept, lives in backlog/
- `draft` — being actively shaped in plans/
- `planned` — plan is refined, ready for execution
- `building` — execution in progress
- `complete` — done, archived
- `abandoned` — dropped, archived

## Command Design

### Existing commands (updated paths)

| Command | Behavior |
|---------|----------|
| `/plan list` | List active plans from `dev/work/plans/` only |
| `/plan open <slug>` | Open active plan from `dev/work/plans/` |
| `/plan save [slug]` | Save to `dev/work/plans/` |
| `/plan new` | Start new plan session |
| `/plan delete <slug>` | Delete from wherever it lives |
| `/plan status` | Show current plan status + recommendations |
| `/plan rename <name>` | Rename active plan |
| `/plan shelve` | Shelve current active plan → move folder to backlog/; status → idea |
| `/approve` | Mark plan as planned (ready) |
| `/review` | Run cross-agent review |
| `/pre-mortem` | Run pre-mortem analysis |
| `/prd` | Create PRD inside plan folder (`dev/work/plans/{slug}/prd.md`) |
| `/build` | Start execution |

### New backlog commands

| Command | Behavior |
|---------|----------|
| `/plan backlog` (no args) | List all backlog items (same as `/plan backlog list`) |
| `/plan backlog list` | List all backlog items (flat files + folders) |
| `/plan backlog add <title>` | Create new backlog item as flat file with proper frontmatter |
| `/plan backlog edit <slug>` | Read content into chat context for discussion/editing via write tool (stays in backlog/) |
| `/plan backlog promote <slug>` | Move item from backlog/ to plans/; upgrade flat file → folder if needed; status → draft |

### New archive commands

| Command | Behavior |
|---------|----------|
| `/plan archive` (no args) | Archive current active plan with confirmation prompt; status → complete |
| `/plan archive list` | List archived items |
| `/plan archive <slug>` | Archive a specific plan by slug; status → complete or abandoned |

### Backlog editing flow

When using `/plan backlog edit <slug>`:
1. Read the item's content into chat context (agent reads file/folder contents)
2. User discusses, refines — edits happen via write tool directly to backlog/
3. At any point: `/plan backlog promote <slug>` to activate, or just move on

No state machine changes needed. The agent simply reads the file and the user/agent can edit it in place.

### Creating new backlog items

`/plan backlog add "Slack integration"` creates:
```
dev/work/backlog/slack-integration.md
```
With frontmatter:
```yaml
---
title: Slack Integration
slug: slack-integration
status: idea
size: unknown
tags: []
created: 2026-02-19T00:00:00Z
updated: 2026-02-19T00:00:00Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
---

# Slack Integration

<!-- Describe the idea, problem, and any initial thoughts -->
```

### Promote behavior (flat file → folder)

```
# Before promote:
backlog/slack-integration.md       → content has frontmatter + body

# After promote:
plans/slack-integration/plan.md    → content migrated, status updated to draft
```

### Shelve behavior (folder stays folder)

```
# Before shelve (/plan shelve):
plans/slack-integration/           → folder with plan.md, maybe prd.md, review.md

# After shelve:
backlog/slack-integration/         → entire folder moved, status updated to idea
```

## Phase 1: Structure & Migration

### Step 1: Define unified frontmatter schema

- Update `PlanStatus` type in `persistence.ts`: `idea | draft | planned | building | complete | abandoned`
- Update `PlanFrontmatter` interface: add `tags: string[]`, `execution: string | null`; remove `backlog_ref`
- Update `migrateStatus()` to map old → new (`ready` → `planned`, etc.)
- Update `serializeFrontmatter()` to handle arrays (tags: `[a, b]` syntax)
- Update `parseFrontmatter()` to parse arrays (detect `[...]`, split by comma)
- Handle files without frontmatter: derive title from filename, default `status: idea`, `tags: []`, `size: unknown`
- **AC**: Frontmatter type compiles; existing plans parse correctly with migration; tags serialize/parse correctly; files without frontmatter return sensible defaults

### Step 2: Audit and migrate existing items (BEFORE code path changes)

**Note**: This step runs before updating code paths so the extension continues working against `dev/plans/` during migration. The new `dev/work/` structure is populated first, then code is updated to point there.

- Define triage rules:
  - **Archive**: plan with `status: complete`, or PRD already executed (exists in `dev/archive/prds/`), or untouched 30+ days with no PRD
  - **Active**: plan with `status: building` or `status: ready`, or this plan (`work-directory-cleanup`)
  - **Backlog**: everything else
- Present triage table to builder for approval before moving anything
- Create `dev/work/plans/`, `dev/work/backlog/`, `dev/work/archive/` directories
- Migrate 6 PRDs from `dev/prds/` — move PRD files into corresponding plan folders (merge with plan folder if it exists, create new folder if not)
- Move `dev/archive/prds/` contents to `dev/work/archive/`
- Migrate `dev/backlog/` items to `dev/work/backlog/` (flatten subcategories, add `tags` based on former category: `features/` → `[feature]`, `improvements/` → `[improvement]`, `decisions/` → `[decision]`)
- Move triaged plans to their destinations in `dev/work/`
- Add minimal frontmatter to migrated backlog items that lack it (title from filename, status: idea, tags from category)
- Remove old directories: `dev/plans/`, `dev/prds/`, `dev/backlog/`, `dev/archive/`
- **AC**: Old directories no longer exist; all items in `dev/work/`; frontmatter present on all items; triage approved by builder

### Step 3: Update persistence layer to use `dev/work/plans/`

Now that files are in their new locations, update code to point there.

**3a. Path constants and notification strings:**
- Change `DEFAULT_PLANS_DIR` from `dev/plans` to `dev/work/plans`
- Add `DEFAULT_BACKLOG_DIR = "dev/work/backlog"` and `DEFAULT_ARCHIVE_DIR = "dev/work/archive"`
- Update all hardcoded notification strings in `commands.ts` (6 references: save, list, rename, artifact save)

**3b. New persistence functions:**
- Add `listBacklog()` — scans backlog/, handles flat files (parse frontmatter from file) and folders (parse from `plan.md` inside); gracefully handle files without frontmatter; prefer folder over flat file on slug collision
- Add `listArchive()` — scans archive/ folders
- Add `moveItem(slug, fromDir, toDir)` utility — moves file or folder between directories
- Add `promoteBacklogItem(slug)` — moves to plans/, upgrades flat file to folder (content → `plan.md`), status → `draft`
- Add `shelveToBacklog(slug)` — moves folder from plans/ to backlog/, status → `idea`
- Add `archiveItem(slug)` — moves to archive/, status → `complete` or `abandoned`
- Add `createBacklogItem(title)` — creates flat file in backlog/ with default frontmatter

**3c. PRD and build flow updates:**
- Update `/prd` command to write PRD to `dev/work/plans/{slug}/prd.md` (inside plan folder, not `dev/prds/`)
- Update `/build` handler to find PRD in plan folder
- Simplify `resolvePrdFeatureSlug()` — PRD is always at `plans/{slug}/prd.md` now; feature slug = plan slug

- **AC**: All CRUD operations work with new paths; `listBacklog()` handles mixed files/folders and missing frontmatter; move operations work without duplication; `/prd` creates PRD in plan folder; `/build` finds PRD in plan folder

### Step 4: Update skills and AGENTS.md sources

- Update `plan-to-prd/SKILL.md`: PRD goes to `dev/work/plans/{slug}/prd.md`; EXECUTE.md template updated
- Update `execute-prd/SKILL.md`: PRD location + backlog path (`dev/work/backlog/` replaces `dev/backlog/improvements/`); add note about frontmatter for new backlog items
- Update `prd-post-mortem/SKILL.md`: PRD location references
- Update `prd-to-json/SKILL.md`: PRD location references
- Update `.agents/sources/shared/workspace-structure.md`
- Update `.agents/sources/builder/memory.md` (backlog reference → `dev/work/backlog/`)
- Update `.agents/sources/builder/conventions.md` (backlog improvements → `dev/work/backlog/`)
- Update `.agents/sources/README.md` (archive PRD reference)
- Update `.pi/APPEND_SYSTEM.md` (backlog grep path, plan save path)
- Update `.cursor/rules/dev.mdc` (backlog grep path)
- Update `memory/collaboration.md` (backlog references — living doc, not historical)
- Do NOT update `memory/entries/` files (historical — they document what happened at that time)
- Rebuild AGENTS.md: `npm run build:agents:dev`
- **Final validation grep**: `grep -rn "dev/plans\b\|dev/prds\|dev/backlog\|dev/archive" --include="*.ts" --include="*.md" --include="*.mdc" .` — only `memory/entries/` and `dev/work/archive/` hits acceptable
- **AC**: All skill files reference new paths; AGENTS.md rebuilt; grep clean outside memory/entries/ and dev/work/archive/

## Phase 2: Extension Behavior

### Step 5: Add backlog commands

- Add `case "backlog"` to command dispatcher switch statement
- Implement `handleBacklog(args, ctx, pi, state)` with sub-routing:
  - No args or `list` → call `listBacklog()`, display with select UI
  - `add <title>` → call `createBacklogItem(title)`, confirm creation
  - `edit <slug>` → read content into context via `pi.sendUserMessage()`, no state changes
  - `promote <slug>` → call `promoteBacklogItem()`, then load into active plan state
- Add `case "shelve"` to command dispatcher → call `shelveToBacklog()` for current plan, clear active state, with confirmation prompt
- Update "Unknown subcommand" message to include `backlog`, `shelve`, `archive`
- **AC**: All backlog commands functional; promote upgrades flat files to folders; shelve preserves folder structure; no duplication; `/plan backlog` shows list (not shelve)

### Step 6: Add archive commands

- Add `case "archive"` to command dispatcher switch statement
- Implement `handleArchive(args, ctx, pi, state)` with sub-routing:
  - No args → archive current active plan with confirmation prompt (`"Archive '{title}' as complete or abandoned?"`)
  - `list` → call `listArchive()`, display with select UI
  - `<slug>` → call `archiveItem(slug)` for a specific plan
- **AC**: All archive commands functional; `/plan archive` with no args prompts for confirmation; archived items have status updated

### Step 7: Update tests

- Update existing tests in `commands.test.ts` and `persistence.test.ts` for new paths
- Update `utils.test.ts` path references (e.g., `mkdir -p dev/prds/plan-mode-ux` example)
- Add tests for frontmatter migration (old statuses → new, including legacy fields)
- Add tests for `listBacklog()`:
  - Backlog with only flat files
  - Backlog with only folders
  - Mixed flat files and folders
  - Files without frontmatter (graceful defaults)
  - Slug collision (foo.md + foo/ — prefer folder)
- Add tests for `promoteBacklogItem()` — flat file → folder conversion
- Add tests for `shelveToBacklog()` — folder preservation
- Add tests for `archiveItem()` and `moveItem()`
- Add tests for `createBacklogItem()` — proper frontmatter generation
- Add tests for tags serialization/parsing:
  - Empty tags `[]`
  - Single tag `[feature]`
  - Multiple tags `[feature, integration, refactor]`
  - No tags field (default to `[]`)
- **AC**: `npm run typecheck` passes; `npm test` passes; all new functions have test coverage

## Out of Scope

- `dev/executions/` management — handled by another agent; we add the `execution` frontmatter field for future linking only
- **WORK.md index** — deferred; commands (`/plan list`, `/plan backlog list`, `/plan archive list`) are the real interfaces. Follow-up: add auto-generated WORK.md when there's demand.
- Backlog prioritization, sorting, or filtering
- Archive search or browsing beyond `/plan archive list`
- `prd.json` location changes (stays at `dev/autonomous/prd.json` until executions agent work lands)

## Risks

See `pre-mortem.md` for full analysis (8 risks). Key mitigations:
- **Path migration**: file-by-file checklist + validation grep (Risk 1)
- **Step ordering**: migrate files FIRST (Step 2), then update code (Step 3) — avoids broken state (Review Concern 1)
- **Accidental shelve**: `/plan backlog` = list, not shelve; shelving via `/plan shelve` (Review Concern 3)
- **Backlog edit**: simple read-into-context approach, no state machine changes (Risk 4)
- **No-frontmatter files**: graceful defaults in parser (Review Concern 4)
- **WORK.md**: deferred to avoid staleness (Risk 7)
- **PRD path in /build**: trace full flow path-by-path before committing (Risk 8)

## Review Resolutions

All 7 review concerns addressed:
1. ✅ **Step ordering** — Migration now Step 2, before code changes (Step 3)
2. ✅ **Overloaded step** — Old Step 2 split into sub-steps (3a, 3b, 3c)
3. ✅ **Accidental shelve** — `/plan backlog` = list; `/plan shelve` for shelving
4. ✅ **No-frontmatter files** — Graceful defaults in Step 1 and Step 3b
5. ✅ **Archive no-args** — Archives current plan with confirmation prompt
6. ✅ **Create backlog items** — `/plan backlog add <title>` command added
7. ✅ **Tags parsing** — Specific test cases in Step 7
