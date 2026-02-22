# PRD: Router Fix + Skill Rename

**Version**: 1.0
**Status**: Ready
**Date**: 2026-02-22
**Branch**: `feature/router-fix-skill-rename`

---

## 1. Problem & Goals

### Problem

The skill/tool router misroutes queries when items share names. Two root causes:

1. **Tools aren't in the routing candidate pool** — both `arete route` and `arete skill route` only load skills from `.agents/skills/`. Tools in `.cursor/tools/` (or `.claude/tools/`) are never candidates, even though `SkillCandidate` already supports `type: 'tool'`.
2. **Naming collision** — the Areté activation skill and the 30/60/90 new-job tool are both called `onboarding`, causing the wrong one to win.

### Goals

1. Add tools to the routing candidate pool so `arete route` and `arete skill route` consider both skills and tools
2. Rename the `onboarding` skill to `getting-started` to eliminate the naming collision
3. Update all cross-references (rules, docs, AGENTS.md sources) to reflect the rename

### Success Criteria

- `arete skill route "I'm starting a new job"` → onboarding **tool**
- `arete skill route "help me setup arete"` → getting-started **skill**
- `arete skill route "onboarding at my new company"` → onboarding **tool**
- `arete skill route "give me a tour"` → workspace-tour **skill** (no regression)
- All existing routing tests pass
- `npm run typecheck` + `npm test` green

### Out of Scope

- Scoring algorithm improvements (deferred)
- Renaming the onboarding **tool** (it's correctly named)
- Renaming the `inputs/onboarding-dump/` workspace folder (would break existing users)

---

## 2. Architecture Decisions

### ToolService Pattern

ToolService mirrors the existing SkillService pattern:
- New file: `packages/core/src/services/tools.ts`
- Reads from `WorkspacePaths.tools` (IDE-agnostic — handles `.cursor/tools/` and `.claude/tools/`)
- Parses TOOL.md frontmatter for metadata (name, description, triggers, lifecycle, duration, work_type, category)
- Exported from barrel files and wired into `createServices()` factory

### Routing Integration

Route commands merge tools into the existing `SkillCandidate[]` pool with `type: 'tool'`. The scoring algorithm is unchanged — tools compete on the same terms as skills.

### Tool CLI Refactor

The existing `tool.ts` CLI command has ad-hoc `getToolsList()` and `getToolInfo()` functions. These are replaced by `services.tools.list()` and `services.tools.get()` for consistency with the SkillService pattern.

---

## 3. Task Breakdown

### Task 1: Create ToolService in @arete/core

Create `packages/core/src/services/tools.ts` mirroring `SkillService.list()`:
- Reads from `WorkspacePaths.tools`, parses TOOL.md frontmatter
- Returns tool definitions (name, description, triggers, lifecycle, duration, work_type, category)
- Must accept tools dir path from `WorkspacePaths.tools` (IDE-agnostic)
- Export from `packages/core/src/services/index.ts` and `packages/core/src/index.ts`
- Wire into `createServices()` in `packages/core/src/factory.ts` (adds `tools: ToolService` to `AreteServices` type)

**Acceptance Criteria:**
- `ToolService` class exists with `list()` and `get(id)` methods
- Returns correct metadata from TOOL.md frontmatter
- Exported from barrel files (`services/index.ts`, `core/index.ts`)
- Wired into `createServices()` factory as `tools` property
- `npm run typecheck` passes

### Task 2: Merge tools into route commands

Update CLI route commands to include tools in the candidate pool:
- `packages/cli/src/commands/route.ts`: After `services.skills.list()`, call `services.tools.list()`, map to `SkillCandidate[]` with `type: 'tool'`, merge into candidates
- `packages/cli/src/commands/skill.ts` (route subcommand): Same merge
- Refactor `packages/cli/src/commands/tool.ts`: Replace ad-hoc `getToolsList()` in `list` subcommand and `getToolInfo()` in `show` subcommand with `services.tools.list()` and `services.tools.get()`. Remove the ad-hoc functions once all consumers migrate.

**Acceptance Criteria:**
- `arete route` and `arete skill route` include tools as candidates
- Tools appear with `type: 'tool'` in route output
- `tool.ts` list and show subcommands use `services.tools.list()` / `services.tools.get()`
- Ad-hoc `getToolsList()` and `getToolInfo()` removed
- `npm run typecheck` passes

### Task 3: Tests for ToolService and routing

Write tests for the new ToolService and updated routing:
- `packages/core/test/services/tools.test.ts` — ToolService with mock storage:
  - Happy path: tools dir with 2+ tools, returns correct metadata
  - Missing dir: returns `[]`
  - Malformed TOOL.md (missing frontmatter): returns tool with name-only defaults
  - Subdir with no TOOL.md: returns tool with id from dirname
- Update `packages/core/test/services/intelligence.test.ts` — mixed skills + tools candidates, tool should win for job-related queries
- Update `packages/cli/test/golden/route.test.ts` — tool queries route to tools
- Run `npm run typecheck` + `npm test` — must pass before starting Task 4

**Acceptance Criteria:**
- ToolService unit tests cover happy path, missing dir, malformed TOOL.md, no TOOL.md subdir
- Intelligence routing tests verify tools win for tool-appropriate queries
- Golden route tests include tool routing scenarios
- `npm run typecheck` + `npm test` green

### Task 4: Rename onboarding skill → getting-started

Rename directory and update frontmatter:
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

**Acceptance Criteria:**
- Directory renamed from `onboarding/` to `getting-started/`
- Frontmatter updated with new name, description, work_type, and triggers
- SKILL.md content unchanged (beyond frontmatter)
- `npm run typecheck` passes

### Task 5: Update cross-references in skills and rules

Update all references to the renamed skill:
- `packages/runtime/skills/rapid-context-dump/SKILL.md` — "onboarding skill" → "getting-started skill", "onboarding skill Path B" → "getting-started skill Path B"
- Keep `inputs/onboarding-dump/` folder references as-is
- `packages/runtime/rules/cursor/pm-workspace.mdc` — intent table, skill references
- `packages/runtime/rules/claude-code/pm-workspace.mdc` — same
- `packages/runtime/rules/cursor/routing-mandatory.mdc` — PM action list, clarify "onboarding" refers to the tool
- `packages/runtime/rules/claude-code/routing-mandatory.mdc` — same

**Pre-commit verification:** Run `grep -rn "skills/onboarding\|onboarding.*skill" packages/runtime/` and `grep -rn "onboarding" .agents/sources/` to catch all references.

**Acceptance Criteria:**
- All skill cross-references updated (rapid-context-dump)
- All rule files updated (pm-workspace, routing-mandatory — both cursor and claude-code variants)
- `inputs/onboarding-dump/` references preserved unchanged
- Grep verification finds no stale "onboarding skill" references in `packages/runtime/`
- `npm run typecheck` passes

### Task 6: Update documentation — GUIDE.md + AGENTS.md sources

Update docs to reflect the rename:
- `packages/runtime/GUIDE.md`:
  - "Getting Started" section: `onboarding` skill → `getting-started` skill
  - Skills table: `| **Setup** | onboarding, rapid-context-dump |` → `| **Setup** | getting-started, rapid-context-dump |`
  - Tool references to `onboarding` tool stay unchanged
- `.agents/sources/guide/skills-index.md`: Add `getting-started` to the skills table (currently missing — the onboarding skill was never listed)
- `.agents/sources/guide/workflows.md`: Tool references to `onboarding` tool stay unchanged
- `.agents/sources/guide/tools-index.md`: No changes needed
- `.agents/sources/guide/intelligence.md`: No changes needed
- Rebuild: `npm run build` (GUIDE AGENTS.md) + `npm run build:agents:dev` (BUILD AGENTS.md)

**Acceptance Criteria:**
- GUIDE.md updated with `getting-started` skill name
- `skills-index.md` includes `getting-started` entry
- AGENTS.md rebuilt via build scripts
- Tool references to `onboarding` tool preserved
- `npm run typecheck` + `npm test` green after rebuild

### Task 7: Routing disambiguation tests

Add tests verifying the rename resolves the disambiguation:
- "help me setup arete" → `getting-started` skill
- "I'm starting a new job" → `onboarding` tool
- "onboarding at my new company" → `onboarding` tool
- Both-candidates-present test: stale `onboarding` skill + `getting-started` skill + `onboarding` tool all in candidates → verify correct routing

**Acceptance Criteria:**
- Disambiguation tests pass for all 4 scenarios
- Both-candidates-present edge case covered
- `npm run typecheck` + `npm test` green

### Task 8: Update LEARNINGS.md files

Add entries to component-local LEARNINGS.md files:
- `packages/core/src/services/LEARNINGS.md`: Entry about ToolService (new service, mirrors SkillService pattern, wired via `createServices()`)
- `packages/runtime/rules/LEARNINGS.md`: Note about skill rename (`onboarding` → `getting-started`) and why — naming collision with onboarding tool caused misrouting
- `packages/runtime/tools/LEARNINGS.md`: Note that tools are now routable via `arete route`/`arete skill route` (previously only skills were in the candidate pool)
- `packages/cli/src/commands/LEARNINGS.md`: Note that route commands now merge tools + skills into candidate pool

**Acceptance Criteria:**
- All 4 LEARNINGS.md files updated with relevant entries
- Entries include what changed, why, and how to avoid related issues

### Task 9: Memory entry + final verification

- Create `memory/entries/2026-02-22_router-fix-skill-rename.md` documenting: what changed, why, files affected, the naming collision lesson
- Update `memory/MEMORY.md` index with the new entry
- Final quality gates: `npm run typecheck` + `npm test`
- Verify success criteria queries manually if in a workspace

**Acceptance Criteria:**
- Memory entry created with standard format (what, why, files, learnings)
- MEMORY.md index updated
- `npm run typecheck` + `npm test` green
- All success criteria queries verified

---

## 4. Dependencies

```
Task 1 → Task 2 (route commands need ToolService)
Task 1 + 2 → Task 3 (tests need implementation)
Task 3 must pass → Task 4 (Part A complete before Part B)
Task 4 → Task 5 (cross-refs need rename done)
Task 4 → Task 6 (docs need rename done)
Task 4 + 5 → Task 7 (disambiguation tests need rename + cross-refs)
Task 7 → Task 8 (LEARNINGS after all changes)
Task 8 → Task 9 (memory entry last)
```

Execution order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

---

## 5. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Cross-reference miss after rename | Run `grep -rn "skills/onboarding\|onboarding.*skill" packages/runtime/` and `grep -rn "onboarding" .agents/sources/` before committing Part B |
| Existing user workspaces keep old `onboarding/` skill | `arete update` via `syncCoreSkills()` copies new skills but doesn't remove old ones. Renamed skill appears as new `getting-started/`; old `onboarding/` lingers. Document in LEARNINGS.md |
| "Get started" trigger too generic | Mitigated by Areté-specific triggers scoring higher via description tokens ("Areté", "workspace", "setup") |
| ToolService maps frontmatter differently than SkillService, tools score 0 | Explicit ToolService test cases (Task 3) and disambiguation tests (Task 7) |

---

## 6. Testing Strategy

- ToolService tests mock StorageAdapter to avoid filesystem dependency
- Intelligence routing tests use mixed skill + tool candidate pools
- Golden route tests verify end-to-end routing output
- Disambiguation tests verify the naming collision is resolved
- All existing tests must continue to pass
- `npm run typecheck` and `npm test` after every task
