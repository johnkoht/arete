# Pre-Mortem: Unify Plans & Backlog

Date: 2026-02-20

## Risk 1: `ctx.ui.custom` Not Available in CommandContext

**Problem**: The current `CommandContext` interface in commands.ts only exposes `select`, `confirm`, `notify`, and `editor`. Step 5 (rich SelectList) requires `ctx.ui.custom()` which is on the full pi context, not the abstracted `CommandContext`. The test helpers mock `CommandContext`, not the full pi context.

**Mitigation**: Before starting step 5, verify how `ctx.ui.custom` is accessed in the command handler. Check `index.ts` line ~237 where commands are registered — the handler receives `(args, ctx)` where `ctx` is the full pi context. May need to pass the full ctx through, or add `custom` to `CommandContext`. Check `preset.ts` example for the pattern.

**Verification**: Confirm that `ctx.ui.custom` is callable from within a command handler before writing the SelectList implementation.

---

## Risk 2: Existing Tests Reference Backlog Functions Heavily

**Problem**: `persistence.test.ts` has dedicated test suites for `listBacklog`, `createBacklogItem`, `promoteBacklogItem`, `shelveToBacklog`. `commands.test.ts` has backlog tests. Removing functions without updating tests creates broken test suites.

**Mitigation**: Catalog every import and test reference to backlog functions. Remove tests in the same commit as function removal so tests stay green. Don't remove functions in step 1 and tests in step 8.

**Verification**: After step 1, `npm test` passes. After step 3, `npm test` passes. No orphaned imports.

---

## Risk 3: Migration Slug Collisions Are Real

**Problem**: `dev/work/backlog/slack-integration/` exists and worktrees may have active plans with the same slug. Naive rename overwrites active plan data.

**Mitigation**: Enumerate both directories and check for overlap. For collisions: (a) if both have content, suffix backlog item with `-idea`, (b) if plan is stub, prefer backlog version, (c) log every decision. Dry-run before executing.

**Verification**: Migration returns a report: `{ moved[], collisions[{ slug, resolution }], skipped[] }`. Builder reviews before committing.

---

## Risk 4: `handlePlanStatus` Already Exists with Different Behavior

**Problem**: `"status"` case already exists in `handlePlan` switch (line 180). Replacing it carelessly could break existing behavior other commands depend on.

**Mitigation**: Read existing implementation fully. Understand what it displays and what depends on it. Extend rather than replace — add "set" while preserving "view."

**Verification**: After step 4, `/plan status` (no args) shows same info as before plus new fields. Existing tests pass.

---

## Risk 5: Auto-Save Creates Race with Plan Text Extraction

**Problem**: Extension populates `state.planText` by scanning assistant messages for `Plan:` headers. If `/plan new` auto-saves, then assistant responds, the auto-save handler might overwrite disk with extracted text — but extraction is fragile (bold formatting breaks it). Could corrupt saved plans.

**Mitigation**: Auto-save on `/plan new` writes initial stub only. Subsequent saves only via explicit `/plan save` or when `extractTodoItems` successfully extracts steps (planText non-empty AND has items). Don't auto-save every response.

**Verification**: Create plan, have assistant respond with non-standard formatting, verify disk file not corrupted.

---

## Risk 6: `@mariozechner/pi-tui` SelectList Import

**Problem**: Extension imports `Key` from `@mariozechner/pi-tui` but hasn't imported `SelectList`, `Container`, `Text`, `SelectItem`. Version mismatch could cause runtime failure.

**Mitigation**: Verify imports work before implementing step 5. Check installed package exports. Reference `preset.ts` which uses exact same imports.

**Verification**: Add imports early in step 5 and test extension loads without errors.

---

## Risk 7: Footer Width Overflow

**Problem**: Proposed footer is ~90 chars. Terminal widths of 80 columns would truncate. Long plan titles make it worse.

**Mitigation**: Implement truncation in widget. `render(width)` receives terminal width. Priority: truncate title first (keep slug), abbreviate size, drop step count as last resort.

**Verification**: Test `renderFooterStatus` with `width: 60` and `width: 120`.

---

## Risk 8: Docs Reference Backlog in Many Places

**Problem**: AGENTS.md (generated), APPEND_SYSTEM.md, skill files, memory entries reference backlog. Missing updates creates stale docs.

**Mitigation**: Run `rg "backlog|/plan backlog|dev/work/backlog" -g "*.md" --no-ignore` before step 8. Update every hit. Rebuild AGENTS.md. Check `.agents/skills/` and `.pi/skills/`.

**Verification**: After step 8, `rg "backlog" -g "*.md"` returns zero results in source files (historical references in memory/archive are fine).

---

## Summary

| # | Risk | Severity | Step | Category |
|---|------|----------|------|----------|
| 1 | ctx.ui.custom not in CommandContext | High | 5 | Context Gaps |
| 2 | Tests reference backlog heavily | Medium | 1, 3 | Test Patterns |
| 3 | Migration slug collisions | Medium | 7 | Dependencies |
| 4 | handlePlanStatus already exists | Low | 4 | Integration |
| 5 | Auto-save race with text extraction | High | 2 | State Tracking |
| 6 | SelectList import availability | Medium | 5 | Platform |
| 7 | Footer width overflow | Low | 6 | Code Quality |
| 8 | Docs reference backlog everywhere | Medium | 8 | Dependencies |

**Highest severity**: Risk 5 (auto-save race) and Risk 1 (ctx.ui.custom) — both could block steps.

**Recommended**: Validate Risk 1 and 6 as a spike before step 5. Address Risk 5 carefully in step 2 design.
