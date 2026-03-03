---
title: Remove Router
slug: remove-router
status: draft
size: medium
tags: [refactor, simplification]
created: 2026-03-02T05:55:00Z
updated: 2026-03-02T06:15:00Z
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

## Open Design Question: Intelligence Service Discovery

**Status: Needs resolution before building**

The router currently serves a second, accidental purpose: it's the **mandatory checkpoint** that forces agents to think about Areté tools before responding. Without it, agents may skip intelligence services entirely.

### The problem in detail

"What do we know about feature X" is not a PM action (not discovery, PRD, meeting prep). The current flow:
1. `routing-mandatory.mdc` asks "Is this a PM action?" — arguably NO for info queries
2. Agent calls `arete skill route` anyway (forced by rule) → gets some result
3. The act of calling the router keeps the agent in "Areté tool" mindset
4. Agent notices the "When to Use Intelligence Services" table and calls `arete context` + `arete memory search`

Without the router as a forcing mechanism, a Cursor agent would likely just grep around or answer from its own knowledge, completely bypassing the workspace intelligence.

### What already exists

**AGENTS.md `tool_selection` line** (loaded at conversation start):
```
"What do you know about X?"→context --for; "What decisions about X?"→memory search; "Who is X?"→resolve; "History of X?"→memory timeline; "Prep for X"→brief --for
```

**pm-workspace.mdc "When to Use Intelligence Services" table:**
```
| When the user says "what do we know about X" | arete context + arete memory search |
```

Both exist but are passive — agents read them once and may forget.

### Proposed solution

Rewrite the `pm-workspace.mdc` checklist from a two-path model to a three-path model:

**Current:**
```
Step 1: Is this a PM action?
  → YES: Run router → Load skill → Execute
  → NO: Proceed normally (supplemental context-gathering)
```

**Proposed:**
```
Step 1: What type of request is this?
  → PM workflow (discovery, PRD, meeting prep, competitive analysis, etc.)
    → Match to skill from intent table → Load & execute skill
  → Information query ("what do we know", "who is", "history of", "decisions about")
    → Use intelligence services directly (context, memory, resolve, timeline)
  → General question (not PM-related)
    → Proceed normally
```

The intelligence services table moves from "supplemental reference" to **primary action for information queries**. This is the same mapping already in AGENTS.md `tool_selection` — we just need `pm-workspace.mdc` to enforce it with the same weight that the router currently has.

**This is the make-or-break design piece.** The code removal is clean. Getting the pm-workspace.mdc rewrite right determines whether agents keep using intelligence services.

**Next step**: Draft the new pm-workspace.mdc checklist section before building.

---

## What stays

- **`IntelligenceService`** — `assembleBriefing()`, `prepareForSkill()`, meeting transcript search, project doc search. These are the valuable parts.
- **`classifyTask()` / `model-router.ts`** — model tier suggestion (fast/balanced/powerful). Independent, useful, stays.
- **`SkillCandidate` type** — used by `prepareForSkill()` → `SkillContext`. Stays.
- **Intent table in `pm-workspace.mdc`** — becomes the primary matching mechanism (already the fallback today).
- **`SkillService.list()`** — agents can still discover skills programmatically.
- **Intelligence services table** — promoted from supplemental to primary for info queries.

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

### 3. Remove `routing-mandatory.mdc` and rewrite `pm-workspace.mdc` checklist

**⚠️ HIGHEST RISK STEP — requires design resolution first**

Delete:
- `packages/runtime/rules/cursor/routing-mandatory.mdc`
- `packages/runtime/rules/claude-code/routing-mandatory.mdc`

Rewrite `packages/runtime/rules/cursor/pm-workspace.mdc` Pre-Flight Checklist:
- Replace the two-path (PM action? → router / no → normal) with three-path model:
  1. **PM workflow** → match to skill via intent table → load & execute
  2. **Information query** → use intelligence services directly (context, memory, resolve, timeline)
  3. **General question** → proceed normally
- Intelligence services table becomes the **primary action** for path 2, not a supplemental reference
- Keep skill intent table, tool table, intelligence patterns (get_meeting_context, etc.) unchanged
- Remove all `arete route` / `arete skill route` / `routing-mandatory` references

Mirror changes to `packages/runtime/rules/claude-code/pm-workspace.mdc`.

**AC**: No references to `arete route`, `arete skill route`, or `routing-mandatory`. Three-path checklist clearly guides agents. Information queries explicitly routed to intelligence services. Agents never told to "proceed normally" for queries that should use `arete context` or `arete memory search`.

### 4. Update documentation (GUIDE.md, AGENTS.md, dist/AGENTS.md, expertise profiles)

**GUIDE.md** (`packages/runtime/GUIDE.md`):
- Remove `arete route` from CLI reference
- Remove `arete skill route` from CLI reference
- Remove the "Routing" section under Intelligence Services
- Keep `arete skill list` (discovery still works)

**AGENTS.md** (root, hand-written):
- Remove `arete route` and `arete skill route` from `[CLI]` section
- Keep `tool_selection` line (already has the right mapping)

**`.agents/sources/shared/cli-commands.md`** (source for dist/AGENTS.md):
- Remove `arete route` and `arete skill route` entries

**Rebuild dist/AGENTS.md**: `npm run build:agents:prod`

**`.pi/expertise/core/PROFILE.md`**:
- Update IntelligenceService section: remove `routeToSkill()` from key exports

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

1. **Intelligence service discovery regression** — Without the router as forcing mechanism, agents may skip `arete context` and `arete memory search` for information queries. **Mitigation**: Three-path checklist in pm-workspace.mdc makes information queries an explicit path with specific commands. AGENTS.md `tool_selection` already has the mapping. **This is the #1 risk — the pm-workspace.mdc rewrite must be right.**

2. **User workspaces with `routing-mandatory.mdc` installed** — On next `arete update`, the rule will be removed. Between now and update, agents will try `arete route` which no longer exists. **Mitigation**: Low impact — agents will get "command not found" and fall back naturally.

3. **`pm-workspace.mdc` is the most-read rule file** — Getting the rewrite wrong means all agent behavior degrades. **Mitigation**: Edit surgically. Keep intent table, tool table, intelligence patterns unchanged. Only rewrite the checklist flow.

---

## Session Notes

### Evidence: Router misroutes (from Cursor exports)
- "competitive analysis of meeting note tools" → router returned `daily-plan` (wrong). Agent overrode to `competitive-analysis`.
- "breadboard user onboarding flow" → router returned `onboarding` tool (wrong concept). Agent overrode to `shaping`/`breadboarding`.

### Key insight: Router serves two purposes
1. **Skill matching** — broken, agents override it
2. **Mandatory checkpoint** — forces agents into "Areté tool" mindset before responding

We're solving #1 (remove broken matcher) but must preserve #2's effect (keep agents using intelligence services). The three-path checklist is the proposed mechanism.

### What already maps info queries to intelligence services
- `AGENTS.md [CLI] tool_selection` line — loaded at conversation start
- `pm-workspace.mdc` "When to Use Intelligence Services" table — currently supplemental
- Individual skill workflows — some call `arete context`/`arete memory search` in their steps

### Next step when resuming
Draft the new pm-workspace.mdc checklist section (the three-path model). This is the design piece that needs to be right before code removal begins.
