# Review: Unify Plans & Backlog

**Date**: 2026-02-20
**Type**: Plan + PRD (pre-execution)
**Audience**: Builder (internal dev tooling)
**Verdict**: Approve with suggestions

## Concerns

### 1. Documentation scope larger than A8 captures (MUST FIX)

Backlog references found in files NOT listed in Task A8:
- `.agents/sources/shared/workspace-structure.md` (3 refs)
- `.agents/sources/builder/conventions.md` (refactor backlog item path)
- `.agents/sources/builder/memory.md` (backlog as destination for future work)
- `.agents/skills/execute-prd/SKILL.md` (3 refs to `dev/work/backlog/`)

**Suggestion**: Add these to A8 scope explicitly.

### 2. execute-prd refactor backlog pattern needs replacement (MUST FIX)

The execute-prd skill tells orchestrators to create refactor items in `dev/work/backlog/`. After migration, this should point to `dev/work/plans/` with status `idea`. The example template also needs updating.

**Suggestion**: Update execute-prd SKILL.md in A8.

### 3. /plan delete confirmation

Plan discussion agreed on confirmation. No task explicitly adds it. May already exist.

**Suggestion**: Verify existing `handlePlanDelete` has confirmation.

### 4. /plan new without name — three code paths

Need clear AC for: name provided, no name + editor provides, no name + editor cancelled.

**Suggestion**: Clarify in A2 AC.

### 5. A6 depends on A2 for planTitle

Dependency graph says A6 is "independent" but it needs `state.planTitle` from A2.

**Suggestion**: Note dependency; execution order already handles it.

### 6. PlanSize null handling

New ideas use `size: null` but `PlanSize` type is `"tiny" | "small" | "medium" | "large"`. Need `PlanSize | null` or keep current handling.

**Suggestion**: Verify type before executing.

## Strengths

- Strong problem definition born from real usage frustration
- Thorough pre-mortem with 8 risks and concrete mitigations
- Clear, testable acceptance criteria on every task
- Smart execution order (A6 before A5 de-risks)
- Well-defined out of scope
- Builder-requested extra review pass addresses pattern of post-refactor breakage

## Devil's Advocate

**If this fails, it will be because...** the auto-save behavior interacts badly with the `response` event handler's `extractTodoItems`. The text extraction pipeline is fragile (requires specific `Plan:` header format). Auto-save writes a stub, response handler fires, doesn't find a valid header → planText stays empty or overwrites stub with nothing.

**The worst outcome would be...** migration deletes `dev/work/backlog/`, then the new system has a subtle bug (list doesn't show all items, status doesn't persist) — and rollback is harder. Mitigation: commit migration separately, git tag before migration.

## Required Changes Before /build

1. Add execute-prd SKILL.md and `.agents/sources/` files to A8 scope
2. Update refactor backlog item pattern in execute-prd to use `dev/work/plans/`
3. Verify `PlanFrontmatter.size` accepts `null`
