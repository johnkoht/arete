---
title: Plan and Backlog UX Updates
slug: plan-and-backlog-ux-updates
status: building
size: large
tags: [plan-mode, ux, refactor]
created: 2026-02-20T17:12:00.000Z
updated: 2026-02-20T18:32:30.866Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 8
---

# Plan: Unify Plans & Backlog

**Size**: Large (8 steps)
**Type**: Refactor + UX improvement

## Problem

The plan-mode extension has two parallel systems — plans and backlog — with the same data model but different storage locations, different commands, and inconsistent UX. This causes confusion: commands don't work as expected (`/plan backlog new`, `/plan backlog open`), selecting from lists does nothing useful, and the builder must learn two command surfaces for what is conceptually one lifecycle. Additionally, `/plan new` doesn't save to disk, the footer bar shows minimal info, and `/plan save` fails silently when the extension doesn't capture plan text.

## Success Criteria

- Single unified command surface for all plan lifecycle stages
- Builder can capture an idea, shape it, build it, and archive it — all with `/plan` commands
- `/plan list` shows a rich, selectable, scrollable list with status, slug, size, and steps
- `/plan new` immediately saves to disk (no more phantom plans)
- Footer bar shows title, slug, status, size, steps, and gate statuses
- No `dev/work/backlog/` folder — all items live in `dev/work/plans/`
- Existing backlog items migrated without data loss
- All existing tests pass + new tests for changed behavior

## Commands (final)

| Command | Description |
|---------|-------------|
| `/plan` | Toggle plan mode |
| `/plan new [name]` | Create plan (status `idea`), auto-save to disk, enter plan mode |
| `/plan list` | Rich SelectList of all plans grouped by status. Select → open |
| `/plan list --ideas` | Filter to `idea` status only |
| `/plan list --active` | Filter to `draft`/`planned`/`building` only |
| `/plan open <slug>` | Open a plan, load into state, enter plan mode |
| `/plan save` | Save current plan state to disk |
| `/plan rename [new-name]` | Rename current plan |
| `/plan status [status]` | Show current status, or set it (`idea`/`draft`/`planned`) |
| `/plan delete <slug>` | Delete a plan (with confirmation) |
| `/plan archive [slug]` | Archive current or specified plan → `dev/work/archive/` |
| `/plan archive list` | List archived plans |
| `/review` | Run cross-model review |
| `/pre-mortem` | Run pre-mortem analysis |
| `/prd` | Convert plan to PRD |
| `/approve` | Mark plan as `planned` |
| `/build` | Start execution (status → `building`) |
| `/build status` | Show build progress |

**Removed**: `/plan backlog *`, `/plan shelve`

## Lifecycle

```
idea → draft → planned → building → complete/abandoned
```

- `idea`: Quick capture. `/plan new` or `/plan status idea`
- `draft`: Being shaped. Auto when plan has content, or manual
- `planned`: Approved. `/approve`
- `building`: Executing. `/build`
- `complete`/`abandoned`: Archived. `/plan archive`

## Storage

- Live: `dev/work/plans/{slug}/plan.md` (all folders, no flat files)
- Archive: `dev/work/archive/{slug}/`
- No more: `dev/work/backlog/`

## Plan

### Step 1: Persistence layer — unify storage

Remove backlog-specific persistence functions and unify on plans-only storage.

**Changes to `persistence.ts`**:
- Remove `listBacklog()`, `createBacklogItem()`, `DEFAULT_BACKLOG_DIR`
- Remove flat-file support from `listPlans()` (everything is folders now)
- Remove `shelveToBacklog()` and `promoteBacklogItem()`
- Add `migrateBacklogToPlans()` — moves `dev/work/backlog/*` into `dev/work/plans/{slug}/plan.md`, converting flat files to folders
- Update `moveItem()` to remove backlog path references
- Ensure `savePlan()` works for new plans with status `idea`

**AC**:
- `listPlans()` returns all items including former backlog items (after migration)
- No functions reference `dev/work/backlog/`
- `migrateBacklogToPlans()` handles flat files, folders, and slug collisions
- Existing persistence tests pass

### Step 2: Auto-save on /plan new

Make `/plan new [name]` immediately write to disk.

**Changes to `commands.ts`**:
- In `handlePlanNew`: after setting `state.currentSlug`, call `savePlan()` with status `idea` and minimal content (`# {title}\n`)
- If no name provided: prompt for one (existing editor flow), then save
- Set `state.planText` to the initial content so `/plan save` works on subsequent calls

**AC**:
- `/plan new my-idea` creates `dev/work/plans/my-idea/plan.md` on disk immediately
- File has valid frontmatter with status `idea`
- Plan appears in `/plan list` immediately
- `/plan save` works after `/plan new` without error

### Step 3: Remove backlog and shelve commands

Clean up the command router.

**Changes to `commands.ts`**:
- Remove `"backlog"` case from `handlePlan` switch
- Remove `"shelve"` case from `handlePlan` switch
- Remove `handleBacklog`, `handleBacklogList`, `handleBacklogAdd`, `handleBacklogEdit`, `handleBacklogPromote`, `handleShelve` functions
- Update default error message to remove `backlog` and `shelve` from available commands
- Update `/plan` command description in `index.ts`

**AC**:
- `/plan backlog` shows "Unknown subcommand"
- `/plan shelve` shows "Unknown subcommand"
- No dead code remaining
- Extension loads without errors

### Step 4: Add /plan status command

Add ability to view and set plan status.

**Changes to `commands.ts`**:
- Add `"status"` case to `handlePlan` switch (replace current `handlePlanStatus` if it exists, or add new)
- With no args: show current plan status info (name, slug, status, size, steps, gates)
- With status arg: validate against allowed values (`idea`, `draft`, `planned`), update frontmatter, save
- `building`, `complete`, `abandoned` are not settable manually (use `/build`, `/plan archive`)
- Confirm with user before status change

**AC**:
- `/plan status` shows current plan info
- `/plan status idea` changes status to `idea` (the "shelve" use case)
- `/plan status draft` changes status to `draft`
- `/plan status building` shows error ("use /build to start execution")
- Status change persists to disk

### Step 5: Rich /plan list with SelectList UI

Replace simple select with a rich, bordered SelectList.

**Changes to `commands.ts`**:
- Replace `handlePlanList` with `ctx.ui.custom` implementation using `SelectList` from `@mariozechner/pi-tui`
- Sort plans by status priority: `building` → `planned` → `draft` → `idea`
- Each item: label = `{emoji} {title} ({slug})`, description = `{size}, {steps} steps`
- Status emoji: ⚡ building, ✅ planned, 📝 draft, 💡 idea
- Support `--ideas` flag (filter to status `idea` only)
- Support `--active` flag (filter to `draft`/`planned`/`building`)
- On select → call `handlePlanOpen`
- Bordered, scrollable, with help text

**AC**:
- `/plan list` shows bordered SelectList with all plans
- Slugs visible in each item
- Items sorted by status (active first, ideas last)
- `--ideas` and `--active` filters work
- Selecting an item opens it
- Scrollable when list is long (10+ items)
- Esc cancels

### Step 6: Improved footer widget

Show more context in the status bar.

**Changes to `widget.ts`**:
- Add `title` and `stepsCount` fields to `WidgetState`
- Update `renderFooterStatus` to show: `📋 {Title} ({slug}) • {status}, {size}, {steps} steps • ☑pm ☐rv ☐prd`
- Show all three gates (checked ☑ or unchecked ☐), not just completed ones
- Keep execution mode footer as-is (`⚡ {slug} — X/Y steps`)

**Changes to `index.ts`**:
- Pass `title` and `stepsCount` to widget state from `state.planTitle` / `state.todoItems.length`
- Add `planTitle` to `PlanModeState` (populated from frontmatter on open/new)

**AC**:
- Footer shows title, slug, status, size, step count
- All three gate statuses visible (☑ or ☐)
- Footer updates when status changes
- Execution mode footer unchanged

### Step 7: Migrate existing backlog items

Run migration on this repo's actual data.

**Actions**:
- Call `migrateBacklogToPlans()` to move all ~35 items from `dev/work/backlog/` to `dev/work/plans/`
- Verify no slug collisions (handle any that exist)
- Verify all migrated items appear in `/plan list`
- Remove empty `dev/work/backlog/` directory
- Commit migration result

**AC**:
- All backlog items now in `dev/work/plans/` as folders
- No `dev/work/backlog/` folder exists
- No data loss (diff check: same number of items before/after)
- All items have valid frontmatter

### Step 8: Update docs and tests

**Docs**:
- Update `APPEND_SYSTEM.md` command table — remove backlog commands, add `/plan status`, update descriptions
- Update `.agents/sources/` if they reference backlog → rebuild AGENTS.md with `npm run build:agents:dev`
- Search for backlog references in all `.md` files and update

**Tests**:
- Remove backlog tests from `commands.test.ts`
- Update `handlePlanNew` tests for auto-save behavior
- Add tests for `/plan status` (view, set valid, reject invalid)
- Add tests for migration function (flat files, folders, collisions)
- Add tests for rich list sorting and filtering
- Update widget tests for new footer format
- Verify: `npm run typecheck` passes, `npm test` passes

**AC**:
- No references to `/plan backlog` in docs or AGENTS.md
- All new behavior has test coverage
- `npm run typecheck` and `npm test` pass
- AGENTS.md rebuilt

## Out of Scope

- Grouped section headers in list (⚡ BUILDING / 💡 IDEAS visual sections) — start with sorted flat list
- Auto-transition from `idea` → `draft` based on content detection
- `/plan list` search/filter by text (SelectList has type-to-filter built in, but no custom search)
- Contextual `/promote` command
- Footer bar during non-plan-mode (only shows when plan mode is active)

## Risks

1. **Slug collisions during migration**: Same slug in both `plans/` and `backlog/`. Mitigation: check before moving, suffix with `-backlog` if conflict.
2. **Auto-save on new changes behavior**: Users accustomed to `/plan new` being ephemeral. Mitigation: low risk — current behavior is a bug, not a feature.
3. **SelectList import**: Need to import from `@mariozechner/pi-tui`. Mitigation: verify package is available in the extension context (it's used by pi internally).
4. **Breaking existing worktree sessions**: Active pi sessions with backlog references. Mitigation: single-user dev tooling, low risk.
5. **Large change surface**: 8 steps touching persistence, commands, widget, docs. Mitigation: steps are independently testable; run quality gates after each.

## Dependencies

- Steps 1-2 are independent foundations
- Step 3 depends on step 1 (backlog functions removed)
- Step 4 depends on step 1 (status updates via persistence)
- Step 5 depends on step 1 (unified `listPlans()`)
- Step 6 is independent (widget changes only)
- Step 7 depends on steps 1-3 (migration uses new persistence, backlog commands gone)
- Step 8 depends on all previous steps
