# Router Fix + Skill Rename

**Date**: 2026-02-22
**Branch**: `getting-started-update`
**PRD**: `dev/work/plans/router-fix-skill-rename/prd.md`

## What Changed

Two issues fixed:

1. **Tools added to routing candidate pool**: Created `ToolService` in `@arete/core` (mirrors `SkillService`), wired into `createServices()` factory. Route commands (`arete route`, `arete skill route`) now merge both skills and tools into the `SkillCandidate[]` pool. Shared helper `packages/cli/src/lib/tool-candidates.ts` prevents duplication. Refactored `tool.ts` to use `services.tools.list()`/`get()` (removed ad-hoc functions).

2. **Skill rename**: `onboarding` skill → `getting-started` to eliminate naming collision with the `onboarding` tool (30/60/90 job plan). Updated: frontmatter (name, work_type `activation→operations`, expanded triggers), cross-references in rapid-context-dump SKILL.md, pm-workspace.mdc and routing-mandatory.mdc (both IDE variants), GUIDE.md, AGENTS.md sources.

## Files Affected

### New files
- `packages/core/src/services/tools.ts` — ToolService class
- `packages/cli/src/lib/tool-candidates.ts` — shared ToolDefinition→SkillCandidate mapper
- `packages/core/test/services/tools.test.ts` — ToolService unit tests

### Modified files
- `packages/core/src/models/skills.ts` — added `ToolDefinition` type
- `packages/core/src/models/index.ts` — barrel export
- `packages/core/src/services/index.ts` — barrel export
- `packages/core/src/factory.ts` — `AreteServices.tools`, `createServices()` wiring
- `packages/cli/src/commands/route.ts` — tool candidate merge
- `packages/cli/src/commands/skill.ts` — tool candidate merge
- `packages/cli/src/commands/tool.ts` — refactored to use ToolService
- `packages/core/test/services/intelligence.test.ts` — tool routing + disambiguation tests
- `packages/cli/test/golden/route.test.ts` — tool routing golden tests
- `packages/runtime/skills/getting-started/SKILL.md` — renamed from onboarding/
- `packages/runtime/skills/rapid-context-dump/SKILL.md` — cross-refs updated
- `packages/runtime/rules/cursor/pm-workspace.mdc` — skill name updated
- `packages/runtime/rules/cursor/routing-mandatory.mdc` — skill added to examples
- `packages/runtime/rules/claude-code/pm-workspace.mdc` — mirror
- `packages/runtime/rules/claude-code/routing-mandatory.mdc` — mirror
- `packages/runtime/GUIDE.md` — skill name updated
- `.agents/sources/guide/skills-index.md` — getting-started added
- LEARNINGS.md × 4 (services, rules, tools, commands)

## Metrics

- **Tasks**: 9/9 complete
- **Success rate**: 100% first-attempt
- **Iterations**: 0 (no reviewer ITERATE verdicts led to rework)
- **Tests**: 497 passing (+17 new: 8 ToolService, 3 routing, 3 golden, 5 disambiguation, -2 structure adjustments)
- **Commits**: 9

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| #1 ToolDefinition type missing | No | Yes (created type first) | Yes |
| #2 Candidate mapping mismatch | No | Yes (all scoring fields mapped) | Yes |
| #3 Cross-reference miss in rules | No | Yes (surgical edits + grep verification) | Yes |
| #4 Stale onboarding/ in workspaces | Known | Yes (documented in LEARNINGS) | Partial — no cleanup mechanism |
| #5 Test pattern mismatch | No | Yes (read existing tests first) | Yes |
| #6 GUIDE.md disambiguation | No | Yes (clear skill vs tool labeling) | Yes |
| #7 AGENTS.md build failure | No | Yes (build ran after rename) | Yes |
| #8 Route command duplication | No | Yes (shared helper extracted) | Yes |

**0/8 risks materialized.** Pre-mortem mitigations were effective across all categories.

## Learnings

- **Overloaded naming is the root cause**: When a skill and tool share the same name, the router can't distinguish them. This was a design gap — tools were added to `SkillCandidate` type (Phase 4) but never wired into the actual routing pipeline. The fix required both infrastructure (ToolService + routing merge) and naming (skill rename).

- **Surgical text edits need categorization first**: "onboarding" appeared 30+ times with 3 different meanings (skill, tool, PM concept). Pre-mortem Risk #3 flagged this and the developer received explicit "CHANGE / DO NOT CHANGE" lists for each file. Zero accidental changes to tool references.

- **ToolService.list(toolsDir) vs SkillService.list(workspaceRoot)**: Design difference — skills have a fixed path (`.agents/skills/`), tools are IDE-specific (`.cursor/tools/` vs `.claude/tools/`). ToolService takes the resolved path; the caller provides it via `WorkspacePaths.tools`. This keeps the service IDE-agnostic.

- **syncCoreSkills() gap**: Renamed skills leave stale directories in user workspaces. `syncCoreSkills()` only adds/updates, never removes. This is the correct behavior (don't delete user customizations), but means renamed skills need manual cleanup or a migration mechanism. Documented in LEARNINGS.md for future consideration.
