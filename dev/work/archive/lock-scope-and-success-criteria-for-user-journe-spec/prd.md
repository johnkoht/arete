# PRD: Template Architecture & GUIDE.md Shipping

**Version**: 1.0
**Status**: In Progress
**Date**: 2026-02-17
**Plan**: `dev/plans/lock-scope-and-success-criteria-for-user-journe-spec/`

---

## 1. Problem & Goals

### Problem

Three related gaps exist in how Areté delivers templates and documentation to end-user workspaces:

1. **Templates are never shipped.** `workspace.create()` accepts `sourcePaths.templates` but never copies anything from it. `create-prd` references `templates/outputs/prd-simple.md` etc. — paths that don't exist in user workspaces. Users who run `arete install` get no default templates.

2. **GUIDE.md never reaches users.** `GUIDE.md` exists in `packages/runtime/` but `install` never copies it to workspace root and `update` never backfills it. Users have no PM reference guide.

3. **Skill templates are decoupled from skills.** The `create-prd` skill's templates live in a flat `templates/outputs/` directory, not co-located with the skill. This makes it harder to discover, override, and maintain them as the skill set grows.

### Goals

1. **Ship templates on install**: `arete install` copies all default templates from `packages/runtime/templates/` into the user's workspace.
2. **Ship GUIDE.md on install**: `arete install` copies `GUIDE.md` to workspace root.
3. **Backfill on update**: `arete update` backfills missing `GUIDE.md` and missing templates without clobbering user-customized files. Policy: "only write if the file does not exist."
4. **Skill-local templates**: Move `create-prd`'s templates (`prd-simple.md`, `prd-regular.md`, `prd-full.md`) into `packages/runtime/skills/create-prd/templates/` co-located with the skill. Keep legacy copies in `templates/outputs/` for backward compat.
5. **Template resolution order**: Establish and document a clear 3-level resolution order: workspace override → skill-local → legacy fallback. Implement as a `resolveTemplatePath()` utility and document in `create-prd` SKILL.md for agents.

### Out of Scope

- `arete.yaml` template default key (descoped — see pre-mortem Risk 6; add to backlog if needed)
- Migrating templates for skills other than `create-prd` (establish pattern; other skills follow later)
- Checksum-based update detection (backlogged; "exists = preserved" is sufficient for v1)
- Any changes to template variable substitution (`renderTemplate()` is unchanged)

---

## 2. Architecture Decisions

### Template Resolution Order

Three-level resolution, checked in order:

```
1. Workspace override:  {workspace}/templates/outputs/{skill-id}/{variant}.md
2. Skill-local default: {workspace}/.agents/skills/{skill-id}/templates/{variant}.md
3. Legacy fallback:     {workspace}/templates/outputs/{variant}.md
```

This order means:
- Users can drop a file at level 1 to override without touching the skill
- Skill-local templates (level 2) are the new default location going forward
- Legacy path (level 3) preserves backward compat for existing workspaces

**Important**: `create-prd` is AI-agent-driven (an LLM reads SKILL.md and follows instructions). The resolution logic must be documented in plain language in SKILL.md — not just implemented in TypeScript. Both consumers need updating.

### GUIDE.md Delivery

`GUIDE.md` is a static file — no templating, no IDE adaptation. It's copied from `packages/runtime/GUIDE.md` to `{workspace}/GUIDE.md` during install. On update, it's backfilled only if missing.

Source path flows through `sourcePaths.root` (the runtime package root), so no new path entry is needed in `SourcePaths`.

### Backfill Policy

**"Only write if the file does not exist."** No checksums, no content comparison. If a file exists at the target path, it is preserved — always. This applies to GUIDE.md and all template files during update. Documented in code comments and verified by tests.

---

## 3. User Stories

1. As a PM running `arete install` for the first time, I get default PRD templates in `templates/outputs/` so the `create-prd` skill works immediately without manual setup.
2. As a PM running `arete install`, I get `GUIDE.md` at my workspace root so I have a reference guide from day one.
3. As a PM running `arete update`, any missing templates or `GUIDE.md` are backfilled automatically — without overwriting my customizations.
4. As a PM who has customized `templates/outputs/create-prd/my-prd.md`, running `arete update` leaves my file untouched.
5. As an agent following `create-prd` SKILL.md, I know exactly where to look for templates — in priority order — so I always find the right one regardless of which workspace layout I'm in.

---

## 4. Requirements

### 4.1 Template Copy in Install (`packages/core/src/services/workspace.ts`)

**Changes to `WorkspaceService.create()`:**
- Add a template copy loop after the skills and rules copy blocks
- Source: `sourcePaths.templates` (already passed in, currently unused)
- Destination: `{targetDir}/templates/`
- Copy behavior: recursive, all files, skip files that already exist at destination
- Result tracking: add copied template paths to `result.files`
- Error handling: individual file copy failures go to `result.errors`; do not abort entire install

**Invariants:**
- Templates from `packages/runtime/templates/` are present in new workspace after install
- Existing files at destination are never overwritten

### 4.2 GUIDE.md Copy in Install (`packages/core/src/services/workspace.ts`)

**Changes to `WorkspaceService.create()`:**
- After template copy, copy `GUIDE.md` from source runtime root to workspace root
- Source: `join(sourcePaths.root, 'GUIDE.md')` — for npm installs this is the package root; for symlink/local it's `packages/runtime/`
- Actually: since `getSourcePaths()` sets base to `packages/runtime/` (useRuntime) or `dist/`, GUIDE.md lives at `join(base, '../GUIDE.md')` (for npm) — simplest: add a `guide` field to `SourcePaths`, OR read `GUIDE.md` from the same `base` directory (i.e. `join(basePaths.root, 'packages/runtime/GUIDE.md')` in dev, `join(basePaths.root, 'dist/GUIDE.md')` in prod). **Decision**: extend `SourcePaths` with a `guide` field pointing to the GUIDE.md file path. Set in `getSourcePaths()`.
- Only write if `{targetDir}/GUIDE.md` does not already exist
- Add to `result.files` on success

### 4.3 GUIDE.md Backfill in Update (`packages/core/src/services/workspace.ts`)

**Changes to `WorkspaceService.update()`:**
- After skills sync, check if `{workspaceRoot}/GUIDE.md` exists
- If missing and `options.sourcePaths.guide` is set: copy source GUIDE.md to workspace root
- If exists: skip (never overwrite)
- Add to `result.added` on backfill

### 4.4 Template Backfill in Update (`packages/core/src/services/workspace.ts`)

**Changes to `WorkspaceService.update()`:**
- After GUIDE.md backfill, iterate source template files from `options.sourcePaths.templates`
- For each source file, compute destination path relative to templates source dir → `{workspaceRoot}/templates/{relative}`
- If destination does not exist: copy and add to `result.added`
- If destination exists: skip (never overwrite)
- Recursive: handles subdirectory structure (e.g. `templates/outputs/`, `templates/inputs/`, etc.)

### 4.5 SourcePaths Extension (`packages/core/src/compat/workspace.ts`)

**Changes:**
- Add `guide: string` field to `SourcePaths` type (path to GUIDE.md file)
- Update `getSourcePaths()` to set `guide: join(base, 'GUIDE.md')` — GUIDE.md lives alongside skills/rules in the base directory
- Update callers in `install.ts` and `update.ts` to pass `sourcePaths.guide` through

### 4.6 Skill-Local Templates for create-prd (`packages/runtime/skills/create-prd/`)

**New directory and files:**
```
packages/runtime/skills/create-prd/
├── SKILL.md                  (existing — update template selection section)
└── templates/
    ├── prd-simple.md         (copy from packages/runtime/templates/outputs/prd-simple.md)
    ├── prd-regular.md        (copy from packages/runtime/templates/outputs/prd-regular.md)
    └── prd-full.md           (copy from packages/runtime/templates/outputs/prd-full.md)
```

**Keep originals** at `packages/runtime/templates/outputs/prd-*.md` — do not delete. They serve as the legacy fallback for existing workspaces.

### 4.7 resolveTemplatePath() Utility (`packages/core/src/utils/templates.ts`)

**New function:**
```typescript
/**
 * Resolve a skill template path using 3-level precedence:
 * 1. Workspace override: templates/outputs/{skillId}/{variant}.md
 * 2. Skill-local:        .agents/skills/{skillId}/templates/{variant}.md
 * 3. Legacy fallback:    templates/outputs/{variant}.md
 *
 * Returns the first path that exists, or null if none found.
 */
export async function resolveTemplatePath(
  workspaceRoot: string,
  skillId: string,
  variant: string  // e.g. 'prd-simple', 'prd-regular', 'prd-full'
): Promise<string | null>
```

- Uses `fs/promises.access()` to check existence (not `readFile`)
- Returns the full absolute path to the resolved template
- Returns `null` if no template found at any level
- Export from `packages/core/src/utils/index.ts`

### 4.8 create-prd SKILL.md Update (`packages/runtime/skills/create-prd/SKILL.md`)

**Changes to Template Selection section (Step 4):**
- Replace hardcoded `templates/outputs/prd-*.md` paths with explicit 3-level resolution instructions
- New instructions (plain language for agents):

```
Template resolution order — check each path in order, use the first one that exists:
1. Workspace override:  templates/outputs/create-prd/{variant}.md
2. Skill-local:         .agents/skills/create-prd/templates/{variant}.md
3. Legacy fallback:     templates/outputs/{variant}.md

Where {variant} is one of: prd-simple, prd-regular, prd-full
```

- Preserve all other SKILL.md content unchanged

---

## 5. Task Breakdown

### Task 1: Extend SourcePaths + fix template copy in install

**Files**: `packages/core/src/compat/workspace.ts`, `packages/core/src/services/workspace.ts`, `packages/cli/src/commands/install.ts`, `packages/cli/src/commands/update.ts`

**Steps**:
- Add `guide: string` to `SourcePaths` type
- Update `getSourcePaths()` to set `guide: join(base, 'GUIDE.md')`
- Add template copy loop to `WorkspaceService.create()` (source: `sourcePaths.templates`, dest: `{targetDir}/templates/`, skip-if-exists)
- Add GUIDE.md copy to `WorkspaceService.create()` (source: `sourcePaths.guide`, dest: `{targetDir}/GUIDE.md`, skip-if-exists)
- Update CLI commands to pass `guide` through `sourcePaths`

**Acceptance Criteria**:
- `arete install` copies all files from `packages/runtime/templates/` into `{workspace}/templates/`
- `arete install` copies `GUIDE.md` to `{workspace}/GUIDE.md`
- Existing files are never overwritten
- `result.files` includes template and GUIDE.md paths on success
- No crash if `sourcePaths.guide` is missing or file doesn't exist

### Task 2: Add backfill to update (GUIDE.md + templates)

**Files**: `packages/core/src/services/workspace.ts`

**Steps**:
- Add GUIDE.md backfill to `WorkspaceService.update()`: if `{workspaceRoot}/GUIDE.md` missing and source guide exists → copy; else skip
- Add template backfill loop to `WorkspaceService.update()`: iterate source templates recursively; for each file, if dest doesn't exist → copy; else skip
- Add backfilled paths to `result.added`

**Acceptance Criteria**:
- `arete update` on a workspace missing `GUIDE.md` → GUIDE.md is created
- `arete update` on a workspace with existing `GUIDE.md` → file is untouched
- `arete update` on a workspace missing `templates/outputs/prd-simple.md` → file is created
- `arete update` on a workspace with existing template file → file is untouched
- `result.added` reflects what was backfilled

### Task 3: Add skill-local templates for create-prd

**Files**: `packages/runtime/skills/create-prd/templates/` (new)

**Steps**:
- Create `packages/runtime/skills/create-prd/templates/` directory
- Copy `prd-simple.md`, `prd-regular.md`, `prd-full.md` from `packages/runtime/templates/outputs/` into it
- Do NOT delete the originals in `templates/outputs/` (backward compat)

**Acceptance Criteria**:
- All three template files exist at `packages/runtime/skills/create-prd/templates/`
- All three original files still exist at `packages/runtime/templates/outputs/`
- Content of skill-local copies matches originals

### Task 4: Implement resolveTemplatePath() utility

**Files**: `packages/core/src/utils/templates.ts`, `packages/core/src/utils/index.ts`

**Steps**:
- Add `resolveTemplatePath(workspaceRoot, skillId, variant)` to `templates.ts`
- Implement 3-level resolution using `fs/promises.access()`
- Export from `utils/index.ts`

**Acceptance Criteria**:
- Returns workspace override path when it exists
- Returns skill-local path when override doesn't exist but skill-local does
- Returns legacy fallback path when neither override nor skill-local exists
- Returns `null` when no template found at any level
- No `any` types; async with proper error handling

### Task 5: Update create-prd SKILL.md

**Files**: `packages/runtime/skills/create-prd/SKILL.md`

**Steps**:
- Update Template Selection section (Step 4) to document 3-level resolution order in plain language
- Reference all three paths explicitly with the `{variant}` placeholder

**Acceptance Criteria**:
- SKILL.md Template Selection section lists all three resolution levels in order
- Legacy fallback path is still present (agents on old workspaces can still find templates)
- No other content in SKILL.md is changed

### Task 6: Tests

**Files**: `packages/cli/test/integration/install-update.integration.test.ts`, `packages/core/test/utils/templates.test.ts` (new)

**Unit tests** (`packages/core/test/utils/templates.test.ts`):
- `resolveTemplatePath()` returns workspace override when it exists
- `resolveTemplatePath()` returns skill-local when only that exists
- `resolveTemplatePath()` returns legacy fallback when only that exists
- `resolveTemplatePath()` returns `null` when nothing exists
- `resolveTemplatePath()` prefers override over skill-local (both exist)
- `resolveTemplatePath()` prefers skill-local over legacy (both exist)

**Integration tests** (add to `packages/cli/test/integration/install-update.integration.test.ts`):
- `arete install` → `GUIDE.md` exists at workspace root
- `arete install` → `templates/outputs/prd-simple.md` exists in workspace
- `arete install` → `templates/outputs/prd-regular.md` exists in workspace
- `arete install` → `templates/outputs/prd-full.md` exists in workspace
- `arete update` on workspace without `GUIDE.md` → `GUIDE.md` is created
- `arete update` on workspace with existing `GUIDE.md` → content is unchanged
- `arete update` on workspace without template → template is backfilled
- `arete update` on workspace with existing template → content is unchanged

---

## 6. Dependencies Between Tasks

```
Task 1 (SourcePaths + install copy)
  └─→ Task 2 (update backfill) — needs SourcePaths.guide
  └─→ Task 6 (integration tests) — tests call install

Task 3 (skill-local templates)
  └─→ Task 4 (resolveTemplatePath) — resolution logic needs files to resolve to
  └─→ Task 5 (SKILL.md update) — SKILL.md references skill-local path

Task 4 (resolveTemplatePath)
  └─→ Task 6 (unit tests)

Task 5 (SKILL.md update) — no dependents, can run after Task 3
```

**Execution order**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6

Tasks 3 and 4 can run in parallel after Task 1 is done.

---

## 7. Testing Strategy

- **Unit tests**: `resolveTemplatePath()` uses a real temp directory (not mocked fs) — create the files being tested, check the function returns the right path
- **Integration tests**: use existing `createIntegrationSandbox()` and `installWorkspace()` helpers from `packages/cli/test/integration/helpers.js`; assert file existence with `existsSync()`
- **Backfill tests**: manually remove a file after install, then run update, assert it's back; and assert existing file content is unchanged
- **No mock filesystem**: these are install/update path tests — real temp dirs are appropriate and match existing pattern
- Run `npm run typecheck` and `npm test` after each task

---

## 8. Success Criteria

- `arete install` produces a workspace where `GUIDE.md` and all default templates are present — no manual setup needed
- `arete update` on any workspace backfills `GUIDE.md` and any missing templates without touching user-modified files
- `create-prd` SKILL.md resolution instructions are explicit and work for agents on new workspaces (skill-local path) and old workspaces (legacy path)
- `resolveTemplatePath()` correctly implements 3-level precedence with no false positives
- All existing tests pass (`npm run typecheck` + `npm test`)
- New integration tests cover install outputs and update backfill behavior
