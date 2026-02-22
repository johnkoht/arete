# Pre-Mortem: Router Fix + Skill Rename

## Risk 1: ToolDefinition Type Missing — ToolService Has No Model

**Category**: Context Gaps

**Problem**: `SkillService` returns `SkillDefinition[]` (defined in `packages/core/src/models/`), but there is no `ToolDefinition` type anywhere in `@arete/core`. The ad-hoc `ToolInfo` interface in `packages/cli/src/commands/tool.ts` is CLI-local and missing fields the router needs (e.g., `type`, `primitives`, `category`). If the subagent creates `ToolService` without first creating a proper `ToolDefinition` model, it'll either invent an incompatible type or use `any`.

**Mitigation**: Task 1 must explicitly:
1. Create `ToolDefinition` type in `packages/core/src/models/` (or add to `skills.ts` alongside `SkillCandidate`)
2. Include all fields needed for routing: `id`, `name`, `description`, `path`, `triggers`, `lifecycle`, `duration`, `work_type`, `category`, `type: 'tool'`
3. Export from barrel file `packages/core/src/models/index.ts`
4. Subagent prompt must list files to read first: `packages/core/src/models/skills.ts` (for `SkillDefinition`), `packages/core/src/services/skills.ts` (for pattern), `packages/cli/src/commands/tool.ts` (for current ad-hoc fields)

**Verification**: After Task 1, `grep "ToolDefinition" packages/core/src/models/index.ts` returns a hit.

---

## Risk 2: Candidate Mapping Mismatch — Tools Score 0

**Category**: Integration

**Problem**: The `routeToSkill()` scoring in `IntelligenceService` relies on `SkillCandidate` fields like `triggers`, `description`, `work_type`, and `primitives`. When tools are mapped to `SkillCandidate[]` in route.ts/skill.ts, if the field mapping doesn't match (e.g., `ToolDefinition.triggers` is undefined because TOOL.md uses a different frontmatter key, or `work_type` is missing), tools will be in the pool but always lose to skills because their scores are 0.

**Mitigation**:
1. In Task 2, the mapping from `ToolDefinition` → `SkillCandidate` must be explicit and verified against `scoreMatch()` in `intelligence.ts` (line ~55)
2. Read the actual TOOL.md frontmatter of `packages/runtime/tools/onboarding/TOOL.md` to confirm field names match
3. Task 3 must include a test where a tool candidate and skill candidate compete for a query, and the tool wins — this catches silent scoring issues

**Verification**: Task 3 includes a test case: `"I'm starting a new job"` with both `onboarding` tool and `meeting-prep` skill in the pool → tool wins.

---

## Risk 3: Cross-Reference Miss in Rules — "onboarding" Is Overloaded

**Category**: Scope Creep / Integration

**Problem**: The grep in the plan shows `onboarding` appears 30+ times across rules (pm-workspace.mdc, routing-mandatory.mdc, qmd-search.mdc, project-management.mdc) and many are **tool** references that must NOT be changed. The word "onboarding" is heavily overloaded: it refers to the tool, the skill, user onboarding as a PM concept (example queries), and the `inputs/onboarding-dump/` folder. A subagent doing find-and-replace on "onboarding" will break tool references if not careful.

**Mitigation**:
1. Task 5 must distinguish between three categories:
   - **Change**: references to `onboarding` *skill* (e.g., "use `onboarding` skill Path B") → `getting-started`
   - **Keep**: references to `onboarding` *tool* (e.g., `.cursor/tools/onboarding/TOOL.md`) → no change
   - **Keep**: generic "onboarding" as a PM concept (e.g., "start a discovery project for improving onboarding") → no change
2. Subagent prompt for Task 5 must include explicit "DO NOT CHANGE" list: all tool paths, `inputs/onboarding-dump/`, example queries using "onboarding" as a PM topic
3. Post-task verification: `grep -rn "getting-started" packages/runtime/rules/` should only appear where the skill is referenced (intent table, skill routing); `grep -rn "onboarding" packages/runtime/rules/` should still have tool references intact

**Verification**: After Task 5, run both greps and manually verify no tool references were converted.

---

## Risk 4: syncCoreSkills Doesn't Remove Old Skills — Stale `onboarding/` in User Workspaces

**Category**: Platform Issues

**Problem**: `syncCoreSkills()` in `workspace.ts` iterates source skill directories and copies them to the target. It never deletes target directories that don't exist in source. After the rename, `arete update` will create `getting-started/` but leave `onboarding/` behind. Users will have both, and the router will see both — the old `onboarding` skill could still win over the `onboarding` tool, defeating the purpose of the rename.

**Mitigation**:
1. This is a known risk already flagged in the plan. The scope is correct: do NOT add skill removal to `syncCoreSkills()` (dangerous — could delete user customizations).
2. Document in LEARNINGS.md that this is a gap.
3. Consider adding a single-case cleanup: if `onboarding/` skill exists AND `getting-started/` skill exists in the same workspace, log a warning in `arete status`. (This is optional — flag for builder decision.)
4. The "both-candidates-present" test in Task 7 specifically covers this scenario.

**Verification**: Task 7 test passes with stale `onboarding` skill + new `getting-started` skill + `onboarding` tool all present.

---

## Risk 5: Test Pattern Mismatch — ToolService Tests Don't Follow Established Patterns

**Category**: Test Patterns

**Problem**: `SkillService` tests in `packages/core/test/services/` likely use specific mock patterns (MockStorageAdapter, fixture helpers). If the subagent for Task 3 doesn't read the existing test patterns first, it'll create tests with incompatible mocking that either fail or don't match the codebase style.

**Mitigation**:
1. Before Task 3, subagent must read:
   - `packages/core/test/services/intelligence.test.ts` (for `SkillCandidate` mock patterns, `SAMPLE_SKILLS`)
   - Any existing service test (e.g., `packages/core/test/services/skills.test.ts` if it exists) for `StorageAdapter` mocking
   - `packages/core/src/services/LEARNINGS.md` ("Tests mock StorageAdapter and SearchProvider")
2. Task 3 prompt should include: "Follow the established mock pattern from intelligence.test.ts"

**Verification**: Task 3 tests use the same helper functions and mock patterns as existing service tests.

---

## Risk 6: GUIDE.md Skill vs Tool Disambiguation — Confusing User Docs

**Category**: Context Gaps

**Problem**: GUIDE.md currently mentions "onboarding" in multiple contexts: the skill (Getting Started section, skills table), the tool (tools table, lifecycle examples), and as a PM concept (example queries). After the rename, users reading the docs might be confused if "onboarding" only appears as a tool but the Getting Started section now says "getting-started skill" without explaining the relationship.

**Mitigation**:
1. In Task 6, when updating GUIDE.md's Getting Started section, add a brief note: "The `getting-started` skill guides you through initial workspace setup." — making clear this is about Areté setup, not job onboarding.
2. Keep the tool table entry for `onboarding` clear: "30/60/90 day plan for thriving at a new job"
3. Do NOT rename the tool or change tool docs — the plan correctly scopes this out.

**Verification**: After Task 6, read the Getting Started section and tools table — a new user should understand the difference without confusion.

---

## Risk 7: AGENTS.md Build Script Failure — Missing Skill in Sources

**Category**: Dependencies

**Problem**: The plan notes that `getting-started` was never listed in `.agents/sources/guide/skills-index.md`. If the AGENTS.md build script (`npm run build`) expects skills listed in sources to exist in `packages/runtime/skills/`, adding `getting-started` to sources while the directory rename hasn't happened (or happened incorrectly) could cause a build failure.

**Mitigation**:
1. Task 4 (rename) must complete before Task 6 (docs update)
2. Task 6 should run `npm run build` and `npm run build:agents:dev` as its final step and verify no errors
3. If the build script does skill-existence validation, verify `packages/runtime/skills/getting-started/SKILL.md` exists before running the build

**Verification**: `npm run build` exits 0 after Task 6.

---

## Risk 8: Route Command Duplication — Tools Merged Twice

**Category**: Code Quality

**Problem**: Both `route.ts` and `skill.ts` (route subcommand) need identical tool-merging logic. If this logic is duplicated, future changes to tool mapping will need to be updated in two places. The plan says "Same merge" for skill.ts but doesn't specify whether to extract a shared helper.

**Mitigation**:
1. In Task 2, extract the tool-to-candidate mapping into a shared helper function (e.g., `mapToolsToCandidates()` in a shared utility or in `@arete/core`)
2. Both `route.ts` and `skill.ts` call the same helper
3. This is a minor code quality risk — even without extraction, it works. But flagging per conventions.

**Verification**: After Task 2, grep for the mapping logic — it should appear in one place (the helper), not duplicated.

---

## Summary

Total risks identified: **8**
Categories covered: Context Gaps (2), Integration (2), Test Patterns (1), Platform Issues (1), Dependencies (1), Code Quality (1)

| # | Risk | Severity | Likelihood | Mitigation Effort |
|---|------|----------|------------|-------------------|
| 1 | ToolDefinition type missing | High | High | Low (create type) |
| 2 | Candidate mapping mismatch | High | Medium | Low (explicit mapping + test) |
| 3 | Cross-reference miss in rules | High | Medium | Medium (careful grep + DO NOT CHANGE list) |
| 4 | Stale onboarding/ in user workspaces | Medium | Certain | Low (document + test edge case) |
| 5 | Test pattern mismatch | Medium | Medium | Low (read existing tests first) |
| 6 | GUIDE.md disambiguation | Low | Low | Low (brief note in docs) |
| 7 | AGENTS.md build failure | Medium | Low | Low (verify order) |
| 8 | Route command duplication | Low | Low | Low (extract helper) |

**Highest-risk items**: #1 (ToolDefinition type) and #3 (cross-reference miss). Both have concrete mitigations.

**Ready to proceed with these mitigations?**
