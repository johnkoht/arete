---
title: Router Fix + Skill Rename
slug: getting-started-update
status: building
size: medium
tags: [router, skills, tools, naming]
created: 2026-02-22T19:00:56.294Z
updated: 2026-02-22T19:23:26.996Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 10
---

# Router Fix + Skill Rename

## Problem

The skill/tool router misroutes queries when items share names. Two root causes:
1. **Tools aren't in the routing candidate pool** — both `arete route` and `arete skill route` only load skills from `.agents/skills/`. Tools in `.cursor/tools/` are never candidates, even though `SkillCandidate` already supports `type: 'tool'`.
2. **Naming collision** — the Areté activation skill and the 30/60/90 new-job tool are both called `onboarding`, causing the wrong one to win.

## Success Criteria

- `arete skill route "I'm starting a new job"` → onboarding **tool**
- `arete skill route "help me setup arete"` → getting-started **skill**
- `arete skill route "onboarding at my new company"` → onboarding **tool**
- `arete skill route "give me a tour"` → workspace-tour **skill** (no regression)
- All existing routing tests pass
- `npm run typecheck` + `npm test` green

## Out of Scope

- Scoring algorithm improvements (Part C — deferred until after A+B)
- Renaming the onboarding **tool** (it's correctly named)
- Renaming the `inputs/onboarding-dump/` workspace folder (would break existing users)

---

## Plan

### Part A: Add tools to the routing candidate pool

**1. Create `ToolService` in `@arete/core`**
- New file: `packages/core/src/services/tools.ts`
- Mirrors `SkillService.list()` — reads from `WorkspacePaths.tools`, parses TOOL.md frontmatter
- Returns tool definitions (name, description, triggers, lifecycle, duration, work_type, category)
- Must accept tools dir path from `WorkspacePaths.tools` (IDE-agnostic — handles `.cursor/tools/` and `.claude/tools/`)
- Export from `packages/core/src/services/index.ts` and `packages/core/src/index.ts`
- Wire into `createServices()` in `packages/core/src/factory.ts` (adds `tools: ToolService` to `AreteServices` type)

**2. Merge tools into route commands**
- `packages/cli/src/commands/route.ts`: After `services.skills.list()`, call `services.tools.list()`, map to `SkillCandidate[]` with `type: 'tool'`, merge into candidates
- `packages/cli/src/commands/skill.ts` (route subcommand): Same merge
- Refactor `packages/cli/src/commands/tool.ts`: Replace ad-hoc `getToolsList()` in `list` subcommand and `getToolInfo()` in `show` subcommand with `services.tools.list()` and `services.tools.get()`. Remove the ad-hoc functions once all consumers migrate.

**3. Tests for Part A**
- `packages/core/test/services/tools.test.ts` — ToolService with mock storage:
  - Happy path: tools dir with 2+ tools, returns correct metadata
  - Missing dir: returns `[]`
  - Malformed TOOL.md (missing frontmatter): returns tool with name-only defaults
  - Subdir with no TOOL.md: returns tool with id from dirname
- Update `packages/core/test/services/intelligence.test.ts` — mixed skills + tools candidates, tool should win for job-related queries
- Update `packages/cli/test/golden/route.test.ts` — tool queries route to tools
- Run `npm run typecheck` + `npm test` — must pass before starting Part B

### Part B: Rename onboarding skill → getting-started

**4. Rename directory + update frontmatter**
- `packages/runtime/skills/onboarding/` → `packages/runtime/skills/getting-started/`
- Frontmatter: `name: getting-started`, `description: "Get started with Areté..."`
- Fix `work_type: activation` → `work_type: operations` (activation is not a valid WorkType)
- Triggers (lenient for natural variants):
  - "Let's get started"
  - "Help me set up Areté" / "Help me setup arete"
  - "Help me set up my workspace"
  - "Set up Areté"
  - "I'm new to Areté"
  - "Get started"
  - "Onboard me to Areté"
  - "Getting started"

**5. Update cross-references in skills**
- `packages/runtime/skills/rapid-context-dump/SKILL.md` — "onboarding skill" → "getting-started skill", "onboarding skill Path B" → "getting-started skill Path B"
- Keep `inputs/onboarding-dump/` folder references as-is

**6. Update rules**
- `packages/runtime/rules/cursor/pm-workspace.mdc` — intent table, skill references
- `packages/runtime/rules/claude-code/pm-workspace.mdc` — same
- `packages/runtime/rules/cursor/routing-mandatory.mdc` — PM action list, clarify "onboarding" refers to the tool
- `packages/runtime/rules/claude-code/routing-mandatory.mdc` — same

**7. Update documentation: GUIDE.md + AGENTS.md sources**
- `packages/runtime/GUIDE.md`:
  - "Getting Started" section: `onboarding` skill → `getting-started` skill
  - Skills table: `| **Setup** | onboarding, rapid-context-dump |` → `| **Setup** | getting-started, rapid-context-dump |`
  - Tool references to `onboarding` tool stay unchanged
- `.agents/sources/guide/skills-index.md`: Add `getting-started` to the skills table (currently missing — the onboarding skill was never listed here)
- `.agents/sources/guide/workflows.md`: Tool references to `onboarding` tool stay unchanged (all references are to the tool, not the skill)
- `.agents/sources/guide/tools-index.md`: No changes needed (correctly references onboarding tool)
- `.agents/sources/guide/intelligence.md`: No changes needed (generic "user onboarding" context example)
- Rebuild: `npm run build` (GUIDE AGENTS.md) + `npm run build:agents:dev` (BUILD AGENTS.md)

**8. Tests for Part B**
- Update test fixtures referencing onboarding skill by name
- Add routing disambiguation tests:
  - "help me setup arete" → `getting-started` skill
  - "I'm starting a new job" → `onboarding` tool
  - "onboarding at my new company" → `onboarding` tool
  - Both-candidates-present test: stale `onboarding` skill + `getting-started` skill + `onboarding` tool all in candidates → verify correct routing

**9. Update LEARNINGS.md files**
- `packages/core/src/services/LEARNINGS.md`: Add entry about ToolService (new service, mirrors SkillService pattern, wired via `createServices()`)
- `packages/runtime/rules/LEARNINGS.md`: Add note about skill rename (`onboarding` → `getting-started`) and why — naming collision with onboarding tool caused misrouting
- `packages/runtime/tools/LEARNINGS.md`: Add note that tools are now routable via `arete route`/`arete skill route` (previously only skills were in the candidate pool)
- `packages/cli/src/commands/LEARNINGS.md`: Add note that route commands now merge tools + skills into candidate pool

**10. Memory entry + final verification**
- Create `memory/entries/2026-02-22_router-fix-skill-rename.md` documenting: what changed, why, files affected, the naming collision lesson
- Update `memory/MEMORY.md` index with the new entry
- Final quality gates: `npm run typecheck` + `npm test`
- Verify success criteria queries manually if in a workspace

---

## Execution Order

A before B. Tools must be in the candidate pool before we can verify the rename resolves disambiguation.

## Risks

- **Cross-reference miss**: Run `grep -rn "skills/onboarding\|onboarding.*skill" packages/runtime/` before committing Part B. Also run `grep -rn "onboarding" .agents/sources/` to catch all AGENTS.md source references.
- **Existing user workspaces**: `arete update` via `syncCoreSkills()` copies new skills but doesn't remove old ones. Renamed skill will appear as new `getting-started/`; old `onboarding/` will linger. Flagged for builder manual testing. Document in LEARNINGS.md.
- **Trigger overlap**: "Get started" is generic — could match other skills. Mitigated by Areté-specific triggers scoring higher via description tokens ("Areté", "workspace", "setup").
- **Silent scoring degradation**: If ToolService maps frontmatter differently than SkillService, tools could be in the pool but score 0. Mitigated by explicit ToolService test cases (Step 3) and disambiguation tests (Step 8).

## Engineering Lead Review Feedback (incorporated)

- ✅ Clarified `tool.ts` refactor scope (Step 2): list + show, with `services.tools.get()`
- ✅ Specified ToolService test edge cases (Step 3): missing dir, malformed TOOL.md, no TOOL.md
- ✅ Added barrel export files to Step 1: `index.ts` and `factory.ts` explicitly listed
- ✅ Added both-candidates-present test (Step 8): stale skill + renamed skill + tool
- ✅ Fixed `work_type: activation` → `operations` (Step 4)
- ✅ Broadened `.agents/sources/` grep scope (Step 7): all source files checked
