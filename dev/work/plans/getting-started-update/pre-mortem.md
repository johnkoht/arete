# Pre-Mortem: Router Fix + Skill Rename

## Risk 1: Stale `onboarding/` skill in existing user workspaces

**Problem**: `syncCoreSkills()` copies source skills to target but never removes target skills that no longer exist in source. After renaming `onboarding/` → `getting-started/`, existing users who run `arete update` will get a NEW `getting-started/` skill added, but the OLD `onboarding/` skill directory will remain. Both will be in the routing candidate pool — the old skill could still win for ambiguous queries.

**Mitigation**: This is flagged for manual testing by the builder. During implementation, do NOT add cleanup logic to `syncCoreSkills()` (scope creep). Instead: (1) document the known behavior in a LEARNINGS.md note, (2) ensure the renamed skill's triggers are specific enough that even if both exist, `getting-started` loses to the onboarding tool for job-related queries. Future: consider a `deprecated_skills` list in the update flow.

**Verification**: After build, builder tests `arete update` in a separate workspace and confirms behavior.

---

## Risk 2: `ToolService` wiring into `createServices()` changes the `AreteServices` type

**Problem**: Adding `tools: ToolService` to the `AreteServices` type in `factory.ts` is a **public API change**. Any code that destructures or type-checks `AreteServices` could break. The compat layer (`packages/core/src/compat/`) may also need updates.

**Mitigation**: 
- Before adding to `AreteServices`, grep for all consumers: `grep -rn "AreteServices" packages/`
- Check compat layer exports: `packages/core/src/compat/index.ts`
- `ToolService` follows identical pattern to `SkillService` (storage-only dependency, no search/config needed) — low risk of constructor issues
- Run full `npm run typecheck` after adding to confirm no downstream breaks

**Verification**: `npm run typecheck` passes. Grep for `AreteServices` shows all consumers handle the new field (or don't destructure exhaustively).

---

## Risk 3: Tool path inconsistency — `.cursor/tools/` vs IDE-agnostic path

**Problem**: Tools live at `.cursor/tools/` (Cursor) or `.claude/tools/` (Claude Code). `WorkspacePaths.tools` already handles this, but `ToolService` needs to use `WorkspacePaths.tools` not a hardcoded `.cursor/tools/` path. If we hardcode, Claude Code users won't have tools routed.

**Mitigation**: 
- `ToolService.list(workspaceRoot)` must accept `toolsDir: string` (from `WorkspacePaths.tools`) rather than constructing the path internally
- Follow `SkillService` pattern: it takes `workspaceRoot` and constructs `.agents/skills/` — but tools are IDE-specific, so the path must come from `WorkspacePaths`
- Check how `tool.ts` currently resolves the path: it uses `paths.tools` from `services.workspace.getPaths(root)`

**Verification**: Check `ToolService.list()` signature uses `WorkspacePaths.tools` path. Test with both Cursor and Claude paths if possible.

---

## Risk 4: Scoring tie between `getting-started` skill and `onboarding` tool for ambiguous queries

**Problem**: For a query like "help me get started with onboarding," both candidates could score similarly. The `getting-started` skill has "Get started" as a trigger (+18) and description matches. The `onboarding` tool has "onboarding" as a trigger (+18) and ID match (+20). Without scoring improvements (deferred to Part C), the tool might win even when the user means Areté setup.

**Mitigation**: 
- Ensure `getting-started` triggers include Areté-specific phrases ("set up Areté", "I'm new to Areté") that the onboarding tool won't match
- The onboarding tool's triggers are job-specific ("new job", "new role", "30/60/90") — these don't overlap with Areté setup triggers
- The word "onboarding" alone is ambiguous and will favor the tool (ID match +20) — this is acceptable since the tool is the more common user intent for that word
- Add disambiguation test cases in Step 8 to catch regressions

**Verification**: Run scoring manually for edge-case queries during test step. Verify the 5 success criteria queries all route correctly.

---

## Risk 5: Cross-reference miss in Part B rename

**Problem**: The word "onboarding" appears 100+ times across runtime/. Some refer to the skill, some to the tool, some to the concept generically (e.g., "user onboarding" in product context). A careless find-and-replace could corrupt tool references or generic usage.

**Mitigation**:
- Do NOT do a blanket find-and-replace on "onboarding"
- Only update references that specifically mean the **skill**: `skills/onboarding`, "onboarding skill", "the `onboarding` skill"
- Leave untouched: tool references (`tools/onboarding`), generic product usage ("user onboarding"), `inputs/onboarding-dump/`
- Before committing, run: `grep -rn "skills/onboarding\|onboarding.*skill\b" packages/runtime/` to verify no old skill references remain
- Run: `grep -rn "tools/onboarding" packages/runtime/` to verify tool references are intact

**Verification**: Post-change grep shows zero `skills/onboarding` references and all `tools/onboarding` references unchanged.

---

## Risk 6: Golden test breakage from changed routing behavior

**Problem**: `packages/cli/test/golden/route.test.ts` tests the route command output format. Adding tools to candidates changes what the router returns — existing golden tests may fail if they assert specific skill matches for queries that now match tools instead.

**Mitigation**:
- Read existing golden tests before making changes (Step 3)
- If a test asserts "meeting prep" routes to `meeting-prep` skill, this won't be affected (no competing tool)
- If any test uses a generic query like "help me with onboarding," it may now route to the tool — update the assertion
- Run `npm test` after Part A, before starting Part B, to catch routing changes early

**Verification**: `npm test` passes after Part A (step 3) and again after Part B (step 8).

---

## Risk 7: `rapid-context-dump` skill references to "onboarding skill Path B"

**Problem**: The `rapid-context-dump` skill has internal cross-references: "Called from onboarding skill Path A", "use `onboarding` skill Path B". These are agent instructions — if not updated, the agent may try to load a non-existent `onboarding` skill and fail or hallucinate.

**Mitigation**:
- Step 5 explicitly covers this: update `rapid-context-dump/SKILL.md` references
- Also check: does the `getting-started` skill itself reference paths by the old name? Read the full SKILL.md during Step 4
- Update: "onboarding skill" → "getting-started skill" in all instructional text
- Keep `inputs/onboarding-dump/` — it's a folder name, not a skill reference

**Verification**: `grep -n "onboarding" packages/runtime/skills/rapid-context-dump/SKILL.md` shows only folder path references, no skill name references.

---

## Summary

| # | Risk | Category | Severity |
|---|------|----------|----------|
| 1 | Stale skill in user workspaces | Integration | Medium (flagged for manual test) |
| 2 | AreteServices type change | Integration | Low (follow SkillService pattern) |
| 3 | Tool path IDE inconsistency | Platform | Medium (must use WorkspacePaths) |
| 4 | Scoring tie on ambiguous queries | Integration | Low (deferred to Part C) |
| 5 | Cross-reference miss in rename | Scope Creep | Medium (careful grep, no blanket replace) |
| 6 | Golden test breakage | Test Patterns | Low (run tests between parts) |
| 7 | rapid-context-dump stale references | Context Gaps | Low (explicitly in Step 5) |

Total risks: 7  
Categories covered: Integration, Platform, Scope Creep, Test Patterns, Context Gaps

**Highest risk**: #1 (stale skill in user workspaces) and #3 (tool path consistency). Both have clear mitigations.

**Ready to proceed with these mitigations?**
