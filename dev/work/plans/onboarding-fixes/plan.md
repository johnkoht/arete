---
title: Onboarding Fixes
slug: onboarding-fixes
status: building
size: small-medium
tags: []
created: 2026-02-21T21:13:54.383Z
updated: 2026-02-21T23:58:16.802Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 5
---

# Plan: Onboarding Tool Fixes

**Audience**: User (TOOL.md, templates, resources are end-user product; `workspace.ts` fix is infrastructure delivering it)
**Size**: Small-medium — Steps 1, 2, 4 are content-only; Step 3 is ~20 lines of code + 2 tests
**Reviewed**: ✓ (review-plan skill — two gaps found and incorporated below)

## Problem

Three gaps in the onboarding tool:
1. 13 curated research sources (ProductPlan, Ant Murphy, Shreyas Doshi, Deb Liu, Ken Norton, etc.) are buried in `dev/work/archive/` — never surfaced to users
2. Template files (`30-60-90-plan.md`, `stakeholder-map.md`, `weekly-plan.md`, `1-1-note.md`) exist in the tool directory but TOOL.md never references them — agents create files from scratch from inline content instead
3. `arete update` backfill is directory-level only — if `onboarding/` dir already exists (even partially, e.g. missing `templates/`), the entire tool dir is skipped and missing files are never added

## Plan

### Step 1 — Create `resources/reading-list.md`

Create `packages/runtime/tools/onboarding/resources/reading-list.md` with the 13 source URLs + one-liner descriptions, pulled from `dev/work/archive/enhance-onboarding-tool/research.md`.

Add a path-agnostic reference in TOOL.md's Phase 1 activation step: "see `resources/reading-list.md` in this tool's directory" — **no hardcoded `.cursor/` or `.claude/` prefix**. TOOL.md content is copied verbatim (not transformed by the IDE adapter), so any hardcoded IDE path would break for the other IDE.

**AC**: File exists at `packages/runtime/tools/onboarding/resources/reading-list.md` with all 13 sources and one-liner descriptions. TOOL.md Phase 1 activation references it with a relative, path-agnostic pointer.

---

### Step 2 — Wire templates into TOOL.md activation workflow

Update the Activation Workflow (step 4) to tell the agent to copy each template into the project structure:
- `templates/30-60-90-plan.md` → `plan/30-60-90.md`
- `templates/weekly-plan.md` → `plan/weekly/week-01.md`
- `templates/stakeholder-map.md` → `working/stakeholders.md`
- `templates/1-1-note.md` → `inputs/1-1s/` as a blank starter

In the "Working File Templates" section: **keep the guidance prose and context** for each file (why it exists, how to use it, key fields) but **remove the raw inline markdown** that duplicates what's now in the template files. Agents should be directed to the template files; the section provides framing only. Do not remove the section entirely — it serves as agent fallback context.

**AC**: Activation Workflow step 4 explicitly names each template-to-destination mapping. "Working File Templates" section retains guidance prose but no longer contains full duplicate markdown content. Agents reading TOOL.md can find and use the templates.

---

### Step 3 — Fix `workspace.ts` update backfill to file-level

**File**: `packages/core/src/services/workspace.ts`

Change the tools backfill in `update()` from directory-level to file-level: instead of skipping the whole tool dir if it exists, walk individual source files within each tool dir using `storage.list({ recursive: true })` and add any that are missing at the destination. This mirrors the existing template backfill pattern already in the method.

Add 2 regression tests to `packages/core/test/services/workspace.test.ts`:
1. Missing files inside an existing tool dir get backfilled on `update()`
2. Existing files inside a tool dir are **not** overwritten on `update()`

Run `npm run typecheck && npm test` — full suite must pass.

**AC**: Running `arete update` on a workspace where `.cursor/tools/onboarding/` exists but `templates/` subdirectory is absent will add the missing templates. Existing `TOOL.md` and any user-modified files are untouched. Both new tests pass. Full suite passes (no regressions).

---

### Step 4 — Mirror content changes to `dist/`

**Why**: `getSourcePaths()` resolves to `dist/` when `useRuntime = false` (the default for npm installs). `dist/tools/onboarding/` is a committed directory — not auto-generated. Changes to `packages/runtime/tools/onboarding/` are invisible to npm users unless also mirrored to `dist/`.

After Steps 1 and 2: copy the updated `TOOL.md`, new `resources/reading-list.md`, and any template file changes to `dist/tools/onboarding/` so they match `packages/runtime/tools/onboarding/` exactly.

**AC**: `dist/tools/onboarding/` contains `resources/reading-list.md` and matches the updated `TOOL.md` from Step 1+2. A fresh `arete install` from npm would deliver the resources file and updated TOOL.md to a user workspace.

---

### Step 5 — Create `packages/runtime/tools/LEARNINGS.md`

The `packages/runtime/tools/` directory has no LEARNINGS.md despite being the home of two bugs found in quick succession (copy regression, templates never wired). The rules and services directories both have LEARNINGS.md files — tools should too.

Seed it with the two key invariants surfaced during this work:

1. **`dist/` must always be manually mirrored**: Any content change to `packages/runtime/tools/` must also be applied to `dist/tools/` — there is no build script that does this automatically. `getSourcePaths()` reads from `dist/` for npm installs. Verify with `diff -r packages/runtime/tools/ dist/tools/`.

2. **TOOL.md content is never IDE-transformed**: `transformRuleContent()` (`.cursor/` → `.claude/`) only runs on rule files (`.mdc`). TOOL.md is copied verbatim. Never use hardcoded `.cursor/tools/` or `.claude/tools/` paths inside a TOOL.md — use path-agnostic relative references only (e.g., "see `resources/reading-list.md` in this tool's directory").

3. **Tool directory copy regression (2026-02-21)**: Tools were dropped from `WorkspaceService.create()` during the CLI refactor (`e3bc217`). Fixed in the same session. When porting "copy assets" logic, enumerate all asset types (skills, tools, rules, templates, guide) and confirm each has a corresponding implementation.

**AC**: File exists at `packages/runtime/tools/LEARNINGS.md` with the three invariants documented. Follows the LEARNINGS.md 7-section template from `.cursor/rules/dev.mdc`.

---

## Dependencies

- Steps 1, 2, 3 are independent — can be done in any order
- Step 4 depends on Steps 1 and 2 being complete (it mirrors their output)
- Step 5 is independent — can be done at any point, best done last to capture final learnings

## Out of Scope

- No changes to the onboarding SKILL.md (Areté setup skill — separate from the job onboarding tool)
- No changes to seed-context tool
- No changes to routing or skill router
