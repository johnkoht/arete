# PRD: Unify Plans & Backlog

**Version**: 1.0
**Status**: Draft
**Date**: 2026-02-20
**Branch**: `feature/plan-and-backlog-ux-updates`

---

## 1. Problem & Goals

### Problem

The plan-mode extension has two parallel systems — plans (`dev/work/plans/`) and backlog (`dev/work/backlog/`) — that share the identical data model (`PlanFrontmatter`) but have different storage locations, different command surfaces (`/plan *` vs `/plan backlog *`), and inconsistent UX:

- `/plan backlog new` silently fell through to list (fixed, but symptomatic)
- `/plan backlog open` doesn't exist
- Selecting from backlog list just shows a hint — doesn't open anything
- `/plan new` doesn't save to disk — the plan vanishes if the session ends
- `/plan save` fails when the extension doesn't capture plan text (bold formatting breaks `extractTodoItems`)
- Footer bar shows minimal info (slug + status only)
- Builder must learn two command surfaces for one lifecycle

### Goals

1. **Unify plans and backlog** into a single system — one folder (`dev/work/plans/`), one command surface (`/plan`), status replaces location
2. **Auto-save on `/plan new`** — no more phantom plans that exist in memory but not on disk
3. **Rich `/plan list`** — bordered, scrollable SelectList showing status, slug, size, and steps
4. **Improved footer widget** — show title, slug, status, size, steps, and all three gate statuses
5. **Add `/plan status`** — view and set status (replaces `/plan shelve` use case)
6. **Migrate existing backlog** — move ~35 items from `dev/work/backlog/` to `dev/work/plans/` without data loss

### Out of Scope

- Grouped section headers in list (⚡ BUILDING / 💡 IDEAS visual sections)
- Auto-transition from `idea` → `draft` based on content detection
- Contextual `/promote` command
- Footer bar during non-plan-mode
- Changes to archive behavior (stays at `dev/work/archive/`)

---

## 2. Design Decisions

### Unified Storage

All plans live in `dev/work/plans/{slug}/plan.md` as folders. No flat files. Status field determines lifecycle stage:

```
dev/work/plans/                      dev/work/archive/
├── mobile-app/                      ├── old-completed-thing/
│   └── plan.md          (idea)      │   ├── plan.md
├── slack-integration/               │   └── prd.md
│   ├── plan.md          (building)  └── ...
│   ├── prd.md
│   └── pre-mortem.md
├── onboarding-mvp/
│   └── plan.md          (draft)
└── ...
```

### Lifecycle

```
idea → draft → planned → building → complete/abandoned
```

| Status | Meaning | Trigger |
|--------|---------|---------|
| `idea` | Quick capture, not fleshed out | `/plan new`, `/plan status idea` |
| `draft` | Being shaped, has content | Manual or auto |
| `planned` | Approved, ready to build | `/approve` |
| `building` | Actively executing | `/build` |
| `complete` | Done | `/plan archive` → Complete |
| `abandoned` | Dropped | `/plan archive` → Abandoned |

### Commands (final)

| Command | Description |
|---------|-------------|
| `/plan` | Toggle plan mode |
| `/plan new [name]` | Create plan (status `idea`), auto-save to disk, enter plan mode |
| `/plan list` | Rich SelectList. Select → open |
| `/plan list --ideas` | Filter to `idea` only |
| `/plan list --active` | Filter to `draft`/`planned`/`building` |
| `/plan open <slug>` | Open a plan |
| `/plan save` | Save current plan |
| `/plan rename [new-name]` | Rename current plan |
| `/plan status [status]` | View or set status |
| `/plan delete <slug>` | Delete with confirmation |
| `/plan archive [slug]` | Archive plan |
| `/plan archive list` | List archived plans |

**Removed**: `/plan backlog *` (all subcommands), `/plan shelve`

---

## 3. Pre-Mortem Risks (from analysis)

### ⚠️ HIGH PRIORITY — Orchestrator must attend to these:

**Risk 1: `ctx.ui.custom` Not in CommandContext** (affects Task A5)
The `CommandContext` interface only exposes `select`, `confirm`, `notify`, `editor`. The SelectList requires `ctx.ui.custom()` from the full pi context. Mitigation: check how command handlers receive context in `index.ts` — the `(args, ctx)` handler receives the full pi `CommandHandlerContext`, not the abstracted `CommandContext`. May need to pass full ctx or extend `CommandContext` interface. Verify with `preset.ts` example before implementing.

**Risk 5: Auto-Save Race with Plan Text Extraction** (affects Task A2)
The extension's `response` event handler populates `state.planText` by scanning for `Plan:` headers via `extractTodoItems`. If auto-save writes a stub on `/plan new`, then the response handler could overwrite it with poorly-extracted text (bold formatting breaks the regex). Mitigation: auto-save on `/plan new` writes initial stub only. Subsequent auto-saves only trigger when `extractTodoItems` successfully finds items. Don't overwrite with empty content.

### Other risks:

- **Risk 2**: Tests reference backlog heavily — remove tests in same commit as functions
- **Risk 3**: Slug collisions during migration — dry-run first, report collisions
- **Risk 4**: `handlePlanStatus` already exists — extend, don't replace
- **Risk 6**: SelectList import — verify `@mariozechner/pi-tui` exports it
- **Risk 7**: Footer width overflow — implement truncation based on `render(width)`
- **Risk 8**: Docs reference backlog everywhere — comprehensive grep before updating

---

## 4. Tasks

### Task A1: Persistence Layer — Unify Storage

Remove backlog-specific persistence functions and unify on plans-only storage.

**Files**: `.pi/extensions/plan-mode/persistence.ts`, `.pi/extensions/plan-mode/persistence.test.ts`

**Changes**:
- Remove: `listBacklog()`, `createBacklogItem()`, `DEFAULT_BACKLOG_DIR`, `shelveToBacklog()`, `promoteBacklogItem()`
- Remove flat-file support from `listPlans()` (second pass scanning `.md` files)
- Add `migrateBacklogToPlans(basePath?)` — moves items from backlog dir to plans dir, converts flat files to folders, handles slug collisions by suffixing with `-idea`
- Update `moveItem()` to remove backlog-specific path references
- Remove corresponding test suites: `listBacklog`, `createBacklogItem`, `promoteBacklogItem`, `shelveToBacklog` describe blocks
- Add test suite for `migrateBacklogToPlans`: flat file migration, folder migration, slug collision handling, empty backlog dir

**Acceptance Criteria**:
- `listPlans()` returns only folder-based plans (no flat file scanning)
- No exported functions reference `dev/work/backlog/`
- `DEFAULT_BACKLOG_DIR` export removed
- `migrateBacklogToPlans()` converts flat `.md` files to `{slug}/plan.md` folders
- `migrateBacklogToPlans()` moves existing backlog folders as-is (renaming inner file to `plan.md` if needed)
- `migrateBacklogToPlans()` suffixes with `-idea` on slug collision and logs the decision
- `migrateBacklogToPlans()` returns `{ moved: string[], collisions: { slug: string, resolution: string }[], skipped: string[] }`
- All removed test suites deleted; new migration tests added
- `npm run typecheck` passes
- `npm test` passes (extension tests)

---

### Task A2: Auto-Save on `/plan new`

Make `/plan new [name]` immediately write to disk so plans are never ephemeral.

**Files**: `.pi/extensions/plan-mode/commands.ts`, `.pi/extensions/plan-mode/commands.test.ts`

**⚠️ Pre-mortem Risk 5 applies**: Do NOT let the response event handler's auto-save overwrite the initial stub with empty/malformed content. The `savePlan()` call here creates the initial file; the response handler's auto-save should only update if `extractTodoItems` finds real content.

**Changes**:
- In `handlePlanNew`: after setting `state.currentSlug`, immediately call `savePlan()` with frontmatter (status `idea`, size `"unknown"`) and content `# {Title}\n`
- **Note**: `PlanFrontmatter.size` is typed as `PlanSize | "unknown"` — use `"unknown"` for new ideas, NOT `null`
- Set `state.planText` to the initial content (`# {Title}\n`) so `/plan save` doesn't fail with "No plan to save"
- Add `state.planTitle` field (populated from name argument, used by footer widget later)
- If no name provided and user dismisses the editor prompt: still enter plan mode but notify "Plan not saved — use /plan save <name> to persist"
- Update existing `handlePlanNew` tests for auto-save: verify file exists on disk after call, verify frontmatter status is `idea`, verify size is `"unknown"`
- Add edge case tests: name provided (auto-save), no name + editor provides name (auto-save), no name + editor cancelled (no save, notification), slug collision with existing plan

**Acceptance Criteria**:
- `/plan new my-idea` creates `dev/work/plans/my-idea/plan.md` with valid frontmatter (status `idea`)
- File has `# My Idea` as content body
- `state.planText` is set (not empty) after `/plan new`
- `state.planTitle` is set to the title-cased name
- Plan appears in `listPlans()` immediately after creation
- `/plan save` works without error after `/plan new`
- If no name and editor cancelled: plan mode active but no file on disk, user notified
- `npm run typecheck` passes
- `npm test` passes

---

### Task A3: Remove Backlog and Shelve Commands

Clean up the command router — remove all backlog and shelve command handling.

**Files**: `.pi/extensions/plan-mode/commands.ts`, `.pi/extensions/plan-mode/commands.test.ts`, `.pi/extensions/plan-mode/index.ts`

**Changes**:
- Remove `"backlog"` case from `handlePlan` switch
- Remove `"shelve"` case from `handlePlan` switch
- Remove functions: `handleBacklog`, `handleBacklogList`, `handleBacklogAdd`, `handleBacklogEdit`, `handleBacklogPromote`, `handleShelve`
- Remove `handleBacklog` from exports
- Remove backlog-related imports from commands.ts (`listBacklog`, `createBacklogItem`, `promoteBacklogItem`, `shelveToBacklog` from persistence)
- Update default error message: remove `backlog`, `shelve` from available subcommands list
- Update `/plan` command description in `index.ts` to: `"Plan mode — toggle or subcommands: new, list, open, save, rename, status, delete, archive"`
- Remove `handleBacklog` import and all backlog tests from `commands.test.ts`

**Acceptance Criteria**:
- `/plan backlog` shows "Unknown subcommand: backlog. Available: new, list, open, save, rename, status, delete, archive"
- `/plan shelve` shows "Unknown subcommand: shelve"
- No dead `handleBacklog*` or `handleShelve` functions in codebase
- No imports of `listBacklog`, `createBacklogItem`, `promoteBacklogItem`, `shelveToBacklog` in commands.ts
- Extension loads without errors
- `npm run typecheck` passes
- `npm test` passes

---

### Task A4: Add `/plan status` Command

Add ability to view current plan status and set it manually.

**Files**: `.pi/extensions/plan-mode/commands.ts`, `.pi/extensions/plan-mode/commands.test.ts`

**Note (Pre-mortem Risk 4)**: A `"status"` case already exists in the `handlePlan` switch. Read its current implementation before modifying. Extend it — don't replace blindly.

**Changes**:
- Read existing `handlePlanStatus` (or equivalent) to understand current behavior
- With no args: display current plan info via `ctx.ui.notify` — title, slug, status, size, steps, gate statuses (pre-mortem ✓/✗, review ✓/✗, PRD ✓/✗)
- With a status arg (e.g., `/plan status idea`): validate against allowed set (`idea`, `draft`, `planned`), confirm with user, update frontmatter via `updatePlanFrontmatter()`, save
- For `building`/`complete`/`abandoned`: show error with guidance ("Use /build to start execution" or "Use /plan archive")
- Add tests: view with no active plan (warning), view with active plan (shows info), set valid status, set invalid status, set restricted status (building/complete/abandoned shows error)

**Acceptance Criteria**:
- `/plan status` (no args, no active plan) shows warning "No active plan"
- `/plan status` (no args, active plan) shows title, slug, status, size, steps, gates
- `/plan status idea` changes status to `idea`, confirms with user first, persists to disk
- `/plan status draft` changes status to `draft`, persists to disk
- `/plan status planned` changes status to `planned`, persists to disk
- `/plan status building` shows error "Use /build to start execution"
- `/plan status complete` shows error "Use /plan archive to complete a plan"
- `/plan status invalid-thing` shows error with valid options
- Status change updates `state` in memory
- `npm run typecheck` passes
- `npm test` passes

---

### Task A5: Rich `/plan list` with SelectList UI

Replace the simple `ctx.ui.select` with a rich, bordered `SelectList` component.

**Files**: `.pi/extensions/plan-mode/commands.ts`, `.pi/extensions/plan-mode/commands.test.ts`, `.pi/extensions/plan-mode/index.ts`

**⚠️ Pre-mortem Risk 1 applies**: The `CommandContext` interface doesn't include `ctx.ui.custom`. Before implementing, check how command handlers in `index.ts` receive context. The handler signature is `(args, ctx)` where `ctx` is the full pi `CommandHandlerContext`. You need to either pass this through to `handlePlanList` or add `custom` to the `CommandContext` interface. Reference `.pi/extensions/plan-mode/index.ts` line ~237 and the preset.ts example at `~/.nvm/versions/node/v23.11.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/preset.ts`.

**⚠️ Pre-mortem Risk 6 applies**: Verify `SelectList`, `SelectItem`, `Container`, `Text` are importable from `@mariozechner/pi-tui` and `DynamicBorder` from `@mariozechner/pi-coding-agent` before writing the implementation. Add the imports first, test that the extension loads.

**Changes**:
- Add `custom` to `CommandContext` interface (or pass full ctx) — whatever pattern `preset.ts` uses
- Replace `handlePlanList` with `ctx.ui.custom` implementation:
  - `SelectList` with `SelectItem[]` built from `listPlans()`
  - Each item: label = `{emoji} {title} ({slug})`, description = `{size ?? "—"}, {steps} steps`
  - Sort by status priority: `building` (0) → `planned` (1) → `draft` (2) → `idea` (3)
  - Status emoji: ⚡ building, ✅ planned, 📝 draft, 💡 idea
  - Bordered with `DynamicBorder`, title "Plans", help text "↑↓ navigate • enter open • esc cancel"
  - Max visible items: `Math.min(items.length, 15)`
- Parse `--ideas` flag from args: filter to status `idea` only
- Parse `--active` flag from args: filter to `draft`/`planned`/`building`
- On select → call `handlePlanOpen` with selected slug
- On cancel → dismiss, no action
- Add tests: mock `ctx.ui.custom` in test helpers, verify items are sorted correctly, verify filter flags, verify select triggers open

**Acceptance Criteria**:
- `/plan list` shows a bordered, scrollable SelectList
- Each item shows: emoji, title, slug in parens, size, step count
- Items sorted by status (building first, ideas last)
- `/plan list --ideas` shows only `idea` status plans
- `/plan list --active` shows only `draft`/`planned`/`building` plans
- Selecting an item opens it (calls `handlePlanOpen`)
- Esc dismisses the list
- Empty state: "No plans found in dev/work/plans/" notification
- Imports from `@mariozechner/pi-tui` and `@mariozechner/pi-coding-agent` work
- `npm run typecheck` passes
- `npm test` passes

---

### Task A6: Improved Footer Widget

Show more context in the plan mode status bar.

**Depends on**: A2 (adds `state.planTitle` to `PlanModeState`)

**Files**: `.pi/extensions/plan-mode/widget.ts`, `.pi/extensions/plan-mode/widget.test.ts`, `.pi/extensions/plan-mode/index.ts`, `.pi/extensions/plan-mode/commands.ts`

**⚠️ Pre-mortem Risk 7 applies**: Footer can overflow narrow terminals. Implement truncation logic using the `width` parameter.

**Changes**:
- Add `title: string | null` and `stepsCount: number` to `WidgetState` interface
- Update `renderFooterStatus` for plan mode with loaded plan:
  - Full format: `📋 {Title} ({slug}) • {status}, {size}, {N} steps • ☑pm ☐rv ☐prd`
  - Show all three gates: ☑ if true, ☐ if false (currently only shows ✓ for completed)
  - Truncation: if string exceeds `width`, truncate title first (e.g., `Plan and Back…`), then drop step count, then abbreviate size
- Add `planTitle` to `PlanModeState` in commands.ts
- In `index.ts`: populate widget state's `title` from `state.planTitle` and `stepsCount` from `state.todoItems.length` (or frontmatter `steps`)
- Set `state.planTitle` in `handlePlanNew` and `handlePlanOpen` (from frontmatter)
- Keep execution mode footer unchanged: `⚡ {slug} — X/Y steps`
- Update widget tests: test full format rendering, test truncation at width 60, test all gate combinations, test new fields

**Acceptance Criteria**:
- Footer shows: title, slug, status, size, step count, all three gate statuses
- Gates show ☑ for completed and ☐ for not completed
- Footer truncates gracefully at width 60 (title truncated first)
- Footer renders correctly at width 120 (full format)
- `planTitle` populated on `/plan new` and `/plan open`
- Execution mode footer unchanged
- Widget tests cover new format and truncation
- `npm run typecheck` passes
- `npm test` passes

---

### Task A7: Migrate Existing Backlog Items

Run the migration on this repo's actual data.

**Files**: Filesystem operations on `dev/work/backlog/` and `dev/work/plans/`

**Depends on**: A1 (migration function exists), A3 (backlog commands removed)

**Changes**:
- Write a small script or call `migrateBacklogToPlans()` to move all ~35 items
- Before migrating: count items in `dev/work/backlog/` (both flat files and folders)
- Run migration with dry-run logging first — review output
- Execute migration
- After migrating: count items in `dev/work/plans/`, verify counts match
- Verify all migrated items have valid frontmatter (status should be `idea` for items without explicit status)
- Remove empty `dev/work/backlog/` directory
- Commit all migration changes with message: `chore: migrate backlog items to unified plans directory`

**Acceptance Criteria**:
- All items from `dev/work/backlog/` are now in `dev/work/plans/` as folders
- Each migrated item has `{slug}/plan.md` with valid frontmatter
- No data loss: same number of items before and after (accounting for any collision resolution)
- Collision report reviewed and logged in commit message if any
- `dev/work/backlog/` directory no longer exists
- `listPlans()` returns all migrated items

---

### Task A8: Update Docs, Rebuild AGENTS.md, Final Tests

Update all documentation to reflect the unified system. Comprehensive test pass.

**Files**: `.pi/APPEND_SYSTEM.md`, `.agents/sources/builder/skills-index.md` (and any other sources referencing backlog), various `.md` files, `.pi/extensions/plan-mode/commands.test.ts`, `.pi/extensions/plan-mode/persistence.test.ts`, `.pi/extensions/plan-mode/widget.test.ts`

**Depends on**: All previous tasks (A1-A7)

**Changes — Documentation**:
- Update `.pi/APPEND_SYSTEM.md`: remove all backlog commands from tables, remove shelve, add `/plan status`, update lifecycle statuses, update command descriptions
- Search `.agents/sources/` for backlog references: `rg "backlog|/plan backlog|dev/work/backlog" .agents/sources/`
- **Specific files to update** (from review):
  - `.agents/sources/shared/workspace-structure.md` — 3 references to backlog dir/concept. Update to reflect unified plans dir
  - `.agents/sources/builder/conventions.md` — "create a refactor backlog item in `dev/work/backlog/`" → update to `dev/work/plans/` with status `idea`
  - `.agents/sources/builder/memory.md` — backlog as destination for "mature future work" → update to plans dir
- Rebuild AGENTS.md: `npm run build:agents:dev`
- **Update `.agents/skills/execute-prd/SKILL.md`** — 3 references to `dev/work/backlog/`:
  - Refactor backlog item example (line ~571): change path from `dev/work/backlog/` to `dev/work/plans/`, update example to use folder structure with `plan.md`, set status to `idea`
  - Report template (line ~442, ~495): change backlog paths to `dev/work/plans/`
  - Risk table (line ~182): update reference
- Search all `.md` files: `rg "backlog" -g "*.md"` — update source/doc files (leave historical references in memory/archive)
- Check `.pi/skills/` for any remaining backlog references

**Changes — Tests** (comprehensive):
- Verify all backlog test suites removed from persistence.test.ts and commands.test.ts
- Verify all new functionality has tests:
  - Migration: flat file, folder, collision, empty dir
  - Auto-save: with name, without name + cancelled, slug collision
  - Status: view, set valid, set invalid, set restricted
  - List: sorting, filtering (--ideas, --active), empty state, select → open
  - Widget: full format, truncation, all gate combos
- Run `npm run typecheck` — must pass
- Run `npm test` — full suite must pass, no skips related to this work
- Verify no orphaned imports referencing removed functions

**Changes — Final verification**:
- `rg "listBacklog|createBacklogItem|shelveToBacklog|promoteBacklogItem|DEFAULT_BACKLOG_DIR|handleBacklog|handleShelve" .pi/extensions/` returns zero results
- `rg "dev/work/backlog" .pi/ .agents/sources/ .cursor/` returns zero results (except archive/memory)
- All commands work: `/plan new`, `/plan list`, `/plan open`, `/plan save`, `/plan status`, `/plan delete`, `/plan archive`

**Acceptance Criteria**:
- `.pi/APPEND_SYSTEM.md` has no backlog commands, has `/plan status`, has updated lifecycle
- AGENTS.md rebuilt with `npm run build:agents:dev` and contains no backlog references in source sections
- No `.agents/sources/` or `.pi/skills/` files reference backlog commands or `dev/work/backlog/` path
- `.agents/skills/execute-prd/SKILL.md` refactor backlog example updated to use `dev/work/plans/` with status `idea`
- `.agents/sources/shared/workspace-structure.md` updated — no backlog dir references
- `.agents/sources/builder/conventions.md` updated — refactor item path corrected
- `.agents/sources/builder/memory.md` updated — future work destination corrected
- All test suites pass: `npm run typecheck && npm test`
- No orphaned imports or dead code referencing backlog
- Zero results from `rg "dev/work/backlog" .pi/ .agents/sources/ .agents/skills/`
- Every `/plan` subcommand verified working: new, list, open, save, rename, status, delete, archive

---

## 5. Orchestrator Instructions

### High-Priority Pre-Mortem Items

The orchestrator MUST ensure subagent prompts for Tasks A2 and A5 explicitly call out these risks:

- **Task A2 (auto-save)**: Include Risk 5 mitigation — auto-save writes stub only, response handler must not overwrite with empty content. Developer must verify the `response` event handler in `index.ts` doesn't clobber the initial save.
- **Task A5 (SelectList)**: Include Risk 1 and Risk 6 mitigations — verify `ctx.ui.custom` access pattern and `SelectList` imports BEFORE writing implementation. If `CommandContext` needs extending, do that first.

### Extra End-of-Build Review

After all tasks complete and the standard holistic review passes, the orchestrator MUST dispatch an **additional reviewer pass** focused on:

1. **Command end-to-end**: Does every `/plan` subcommand work? (new, list, open, save, rename, status, delete, archive)
2. **Documentation consistency**: Do APPEND_SYSTEM.md, AGENTS.md, and skill files all agree on the command surface?
3. **Dead code**: Any remaining references to backlog functions, backlog dir, or removed commands?
4. **Test coverage**: Are edge cases covered? (no active plan, empty list, invalid status, width overflow)

### Testing Emphasis

Developers should write thorough command tests including:
- Happy path for each command
- Error cases (no active plan, invalid args, missing slug)
- Edge cases (empty name, very long name, existing slug collision)
- Integration: create → list → open → modify → save → list again

---

## 6. Execution Order

```
A1 (persistence) ──┬── A2 (auto-save)     independent
                   ├── A3 (remove commands) depends on A1
                   ├── A4 (status command)  depends on A1
                   └── A5 (rich list)       depends on A1
A6 (widget)        ──── depends on A2 (planTitle in state)

A7 (migration)     ──── depends on A1, A3
A8 (docs + tests)  ──── depends on all
```

Suggested serial order: A1 → A2 → A3 → A4 → A6 → A5 → A7 → A8

(A6 before A5 because the widget is simpler and A5 has the highest technical risk — better to de-risk late)
