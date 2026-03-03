---
title: Remove Router
slug: remove-router
status: draft
size: medium
tags: [refactor, simplification]
created: 2026-03-02T05:55:00Z
updated: 2026-03-02T05:55:00Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 5
---

# Remove Router

## Problem

The skill router (`routeToSkill` + `arete route` / `arete skill route`) is actively harmful. It misroutes common PM queries — "competitive analysis" → `daily-plan`, "breadboard onboarding flow" → `onboarding` tool — forcing agents to override it every time. The `routing-mandatory.mdc` rule makes this worse by **requiring** agents to call the router before any PM action, adding a wasted CLI roundtrip and tokens to every interaction.

The agents are already better at intent matching. They read the skills table in `pm-workspace.mdc` or the AGENTS.md `[Skills]` section and match correctly. The router is a keyword scorer competing against an LLM — it will always lose on ambiguous queries.

## What stays

- **`IntelligenceService`** — `assembleBriefing()`, `prepareForSkill()`, meeting transcript search, project doc search. These are the valuable parts.
- **`classifyTask()` / `model-router.ts`** — model tier suggestion (fast/balanced/powerful). Independent, useful, stays.
- **`SkillCandidate` type** — used by `prepareForSkill()` → `SkillContext`. Stays.
- **`RoutedSkill` type** — can be removed (only returned by `routeToSkill`).
- **Intent table in `pm-workspace.mdc`** — becomes the primary matching mechanism (already the fallback today).
- **`SkillService.list()`** — agents can still discover skills programmatically.

## What goes

- **`routeToSkill()`** method on `IntelligenceService` (~50 lines)
- **`scoreMatch()`**, **`tokenize()`**, **`STOP_WORDS`**, **`WORK_TYPE_KEYWORDS`** in `intelligence.ts` (~70 lines)
- **`arete route` CLI command** (`packages/cli/src/commands/route.ts`, 92 lines)
- **`arete skill route` subcommand** in `skill.ts` (~80 lines)
- **`routing-mandatory.mdc`** rule (both `cursor/` and `claude-code/` versions)
- **`tool-candidates.ts`** lib helper (only used by route/skill route commands)
- **`routeToSkill` compat shim** in `compat/intelligence.ts`
- **`RoutedSkill` type** from `models/skills.ts`
- **Routing tests** (~470 of 620 lines in `intelligence.test.ts`, plus `golden/route.test.ts`)

## Out of Scope

- Replacing the router with an LLM-based router — the intent table + agent reasoning is the replacement
- Changing how `prepareForSkill()` works — it doesn't depend on routing
- Changing `classifyTask()` / model tier suggestion — independent feature
- Rewriting `pm-workspace.mdc` from scratch — just remove routing references

---

## Plan

### 1. Remove routing code from `intelligence.ts`

Delete from `packages/core/src/services/intelligence.ts`:
- `STOP_WORDS`, `WORK_TYPE_KEYWORDS`, `tokenize()`, `scoreMatch()` (lines 33–125)
- `routeToSkill()` method (lines 523–565)

Keep everything else: `assembleBriefing()`, `prepareForSkill()`, `extractEntityReferences()`, `formatBriefingMarkdown()`, meeting/project search helpers.

Remove `routeToSkill` from compat shim (`compat/intelligence.ts`) and compat barrel (`compat/index.ts`).

Remove `RoutedSkill` type from `models/skills.ts`. Remove exports from `models/index.ts` and `core/index.ts`.

Keep `SkillCandidate` — it's used by `SkillContext` / `prepareForSkill()`.

**AC**: `intelligence.ts` compiles with no `routeToSkill` method. `RoutedSkill` type removed. Compat shims updated. `npm run typecheck` passes.

### 2. Remove CLI routing commands

Delete `packages/cli/src/commands/route.ts` entirely.

Remove the `skill route` subcommand from `packages/cli/src/commands/skill.ts` (~lines 209–285).

Delete `packages/cli/src/lib/tool-candidates.ts` (only consumer was routing commands).

Remove `registerRouteCommand` from `packages/cli/src/index.ts`.

**AC**: `arete route` and `arete skill route` no longer exist. `npm run typecheck` passes. No orphan imports.

### 3. Remove `routing-mandatory.mdc` rule and update `pm-workspace.mdc`

Delete:
- `packages/runtime/rules/cursor/routing-mandatory.mdc`
- `packages/runtime/rules/claude-code/routing-mandatory.mdc`

Update `packages/runtime/rules/cursor/pm-workspace.mdc`:
- Remove all "run the router first" instructions (the mandatory routing flow)
- Make the intent table the **primary** skill-matching mechanism (it's currently labeled "fallback")
- Keep the intent table, tool table, and intelligence services table unchanged
- Update the workflow checklist: Step 2 changes from "Run the router" → "Match intent to skill from the table above"
- Remove "routing-mandatory.mdc" cross-references

Mirror changes to `packages/runtime/rules/claude-code/pm-workspace.mdc`.

**AC**: No references to `arete route`, `arete skill route`, or `routing-mandatory` in either rule file. The intent table is clearly the primary mechanism. Workflow checklist still guides agents through: identify PM action → match to skill → load skill → execute.

### 4. Update documentation (GUIDE.md, AGENTS.md, dist/AGENTS.md, expertise profiles)

**GUIDE.md** (`packages/runtime/GUIDE.md`):
- Remove `arete route` from CLI reference
- Remove `arete skill route` from CLI reference  
- Remove the "Routing" section under Intelligence Services
- Keep `arete skill list` (discovery still works)

**AGENTS.md** (root, hand-written):
- Remove `arete route` and `arete skill route` from `[CLI]` section

**`.agents/sources/shared/cli-commands.md`** (source for dist/AGENTS.md):
- Remove `arete route` and `arete skill route` entries

**Rebuild dist/AGENTS.md**: `npm run build:agents:prod`

**`.pi/expertise/core/PROFILE.md`**:
- Update IntelligenceService section: remove `routeToSkill()` from key exports
- Note that routing was removed — agents match via intent table

**`.pi/expertise/cli/PROFILE.md`**:
- Remove `route.ts` from command map
- Update `skill.ts` section: remove `skill route` subcommand
- Remove `tool-candidates.ts` from shared utilities

**`dev/catalog/capabilities.json`**: Update if there's a routing capability entry.

**AC**: No documentation references `arete route` or `arete skill route` as available commands. dist/AGENTS.md rebuilt. Expertise profiles accurate.

### 5. Remove routing tests and run quality gates

Delete `packages/cli/test/golden/route.test.ts` entirely.

In `packages/core/test/services/intelligence.test.ts`:
- Remove all `describe('routeToSkill', ...)` blocks (~lines 150–670)
- Keep `describe('assembleBriefing', ...)` tests (lines 80–148)
- Verify remaining tests still pass

Run quality gates:
- `npm run typecheck`
- `npm test`

**AC**: All tests pass. No routing tests remain. Test count drops (expected: ~900 from 1051, losing ~150 routing tests). Zero failures.

---

## Risks

1. **User workspaces with `routing-mandatory.mdc` installed** — users who ran `arete install` have this rule. On next `arete update`, the rule will be removed. Between now and their next update, the rule will tell agents to call `arete route` which no longer exists. **Mitigation**: Low impact — agents will get "command not found" and fall back to the intent table (which is what they should be doing anyway). The `arete update` command already handles rule file sync.

2. **Third-party integrations calling `arete route --json`** — unlikely but possible. **Mitigation**: If anyone is using the JSON API, `arete skill list --json` gives them skill metadata. But this is an Areté-internal tool; external consumers are extremely unlikely.

3. **`pm-workspace.mdc` edit is the highest-risk step** — it's the most-read rule file and defines the entire agent workflow. **Mitigation**: Edit surgically (remove routing steps, promote intent table), don't restructure the entire file.
