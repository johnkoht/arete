# Pre-Mortem: Agent Experts

Plan size: Large (10 steps, 4 phases)
Analysis date: 2026-03-02

---

### Risk 1: Plan-Mode Extension Hardcodes `.agents/skills/` Paths

**Problem**: The plan-mode extension (`.pi/extensions/plan-mode/commands.ts`) hardcodes `.agents/skills/` paths in three places — the `/review`, `/pre-mortem`, and `/prd` commands. These send user messages telling the agent to "Load `.agents/skills/review-plan/SKILL.md`". After Step 1 moves skills to `.pi/skills/` and deletes `.agents/skills/`, these three commands will point to non-existent files. Every `/review`, `/pre-mortem`, and `/prd` command will silently fail or the agent will hallucinate the skill content.

**Mitigation**: Step 1 must update `.pi/extensions/plan-mode/commands.ts` — change all three path references from `.agents/skills/` to `.pi/skills/`. This is TypeScript code, not markdown, so it needs `npm run typecheck` verification after the change.

**Verification**: After Step 1, run `/pre-mortem` on a test plan. Verify it loads the skill from `.pi/skills/run-pre-mortem/SKILL.md`. Check `grep -r "agents/skills" .pi/extensions/` returns nothing.

---

### Risk 2: DEVELOPER.md Has ~20 References to Deleted Paths

**Problem**: `DEVELOPER.md` references `.agents/skills/` (10+ times), `.cursor/rules/dev.mdc` (5+ times), `.cursor/rules/testing.mdc` (3+ times), and `build:agents:dev` (2 times). Step 9 mentions updating DEVELOPER.md but only in the context of cursor rules deletion. The skills path changes happen in Step 1 and build script changes in Step 4 — DEVELOPER.md won't be updated until Step 9, leaving it broken for most of the execution.

**Mitigation**: Add DEVELOPER.md updates to Steps 1 and 4 as well, not just Step 9. Each step that changes a path should update DEVELOPER.md references for that path in the same step. Step 9 handles the final cursor rules references.

**Verification**: After each step, run `grep -n "\.agents/skills\|build:agents:dev\|cursor/rules" DEVELOPER.md` and confirm only references for not-yet-completed steps remain.

---

### Risk 3: capabilities.json References Will Go Stale

**Problem**: `dev/catalog/capabilities.json` has a capability entry `pi-append-system-dev-rules` that lists `.cursor/rules/dev.mdc` and `.cursor/rules/testing.mdc` in both `implementationPaths` and `readBeforeChange`. It also notes "Keep both in sync when rules/workflows change." After Steps 2-3 rewrite APPEND_SYSTEM.md and Step 9 deletes cursor rules, this capability entry will reference non-existent files and contain obsolete guidance.

**Mitigation**: Update `dev/catalog/capabilities.json` during Step 9 (or whichever step completes last). Update the capability to reference `build-standards.md` instead of cursor rules. Remove the sync note. Per AGENTS.md convention: "Update capability metadata if behavior, paths, owner, or status changed."

**Verification**: After Step 9, validate that all paths in `capabilities.json` `implementationPaths` and `readBeforeChange` arrays point to files that exist.

---

### Risk 4: AGENTS.md and APPEND_SYSTEM.md Content Overlap

**Problem**: Steps 3 and 4 both rewrite context files that the planner receives. Both say "keep workflow" and "keep routing" — but the boundary between what goes in AGENTS.md vs APPEND_SYSTEM.md isn't precisely defined. If the implementer puts plan lifecycle in both, or puts skills index in both, or puts LEARNINGS.md rules in both, we recreate the duplication problem we're trying to solve.

**Mitigation**: Define the boundary explicitly before implementation:
- **AGENTS.md**: Static product/system awareness — vision, what exists (expertise, roles, skills), memory references, BUILD vs GUIDE. Things that rarely change.
- **APPEND_SYSTEM.md**: Dynamic process rules — how to behave (workflow, routing, composition instructions, LEARNINGS.md rules, execution path). Things that evolve with the dev process.
- Rule of thumb: if it answers "what is available?" → AGENTS.md. If it answers "how should I work?" → APPEND_SYSTEM.md.

**Verification**: After Steps 3-4, check: `grep -c "plan\|workflow\|LEARNINGS\|skill" AGENTS.md .pi/APPEND_SYSTEM.md` — no concept should appear as a detailed section in both files.

---

### Risk 5: Profile Accuracy — Writing From Memory vs Source

**Problem**: Steps 5-6 create expertise profiles describing the architecture of core and CLI packages. If the implementer writes these from general knowledge or the plan description rather than reading the actual source code, the profiles could describe things that aren't true (wrong service names, incorrect dependency chains, outdated patterns). Inaccurate profiles are actively harmful — they'll cause experts to make wrong decisions with high confidence.

**Mitigation**: The PRD task for Steps 5-6 must explicitly require:
1. Read every service file in `packages/core/src/services/` before writing the core profile
2. Read the CLI command files in `packages/cli/src/commands/` before writing the CLI profile
3. Cross-reference with existing LEARNINGS.md files
4. Use LSP to verify dependency chains (e.g., `lsp references` on service class names)
5. After writing, verify 3 random claims in the profile against actual source code

**Verification**: Spot-check: pick 3 statements from each profile. Use `grep` or LSP to confirm they're accurate. Any inaccuracy means the profile needs a full review.

---

### Risk 6: Scope Creep in Role Cleanup (Step 7)

**Problem**: Step 7 says "remove any duplicated coding standards baked into roles." The 5 role files total ~870 lines. Determining what's "duplicated coding standards" vs "role-specific behavioral guidance" requires careful judgment. An implementer could over-strip roles (removing guidance that's actually behavioral, not coding standards) or under-strip (leaving duplication). The existing roles have been refined over many PRD cycles — aggressive changes could break the orchestration model that currently works.

**Mitigation**: 
1. Before modifying any role, diff its content against `build-standards.md` — only remove text that's clearly duplicated (not paraphrased or adapted)
2. Preserve all behavioral guidance (how the role thinks, makes decisions, interacts)
3. The "add composition instructions" should be additive — a new section, not a replacement for existing content
4. Keep changes minimal: add composition section, add build-standards reference, remove only clear duplicates

**Verification**: After Step 7, each role file should still have its core behavioral sections intact. Run the smoke tests from Step 10 to verify roles still work correctly with expertise profiles.

---

### Risk 7: GUIDE Pipeline Regression

**Problem**: Step 4 removes `build:agents:dev` from the build script and deletes `.agents/sources/builder/`. The `build` npm script currently runs `build:agents:dev && build:agents:prod && build:packages`. If the script modification is done incorrectly (e.g., removing the wrong part, breaking the `&&` chain), the GUIDE pipeline (`build:agents:prod`) could stop running during `npm run build`. This would mean `dist/AGENTS.md` stops being generated, which breaks the npm package for all users.

**Mitigation**: 
1. Update the `build` script to `"build:agents:prod && build:packages"` (just remove the dev step)
2. Immediately run `npm run build` after the change
3. Verify `dist/AGENTS.md` exists and has the expected content (GUIDE sections, not BUILD)
4. Run `npm run typecheck` and `npm test` to catch any test that depends on the dev build

**Verification**: `ls -la dist/AGENTS.md` exists. `head -5 dist/AGENTS.md` shows the GUIDE header. `npm test` passes.

---

### Risk 8: Steps 3-4 Ordering Creates Temporary Broken State

**Problem**: The plan says Steps 1-4 "can be done in parallel." But Steps 3 (rewrite APPEND_SYSTEM.md) and 4 (rewrite AGENTS.md) both change files that are loaded into EVERY pi conversation. If Step 3 is done first and adds "see AGENTS.md for expertise map" but Step 4 hasn't rewritten AGENTS.md yet, the planner gets instructions pointing to content that doesn't exist. If done in parallel by subagents, both could be writing with assumptions about the other's output.

**Mitigation**: Steps 3 and 4 should be done together (same task or sequential with dependency). The implementer should draft both files, then write both. They share a content boundary (Risk 4) that requires coordinated design. Remove the "can be done in parallel" claim — instead: Steps 1-2 can be parallel, Steps 3-4 are sequential (4 depends on 3's content decisions).

**Verification**: After both are complete, start a fresh pi conversation. The planner should load coherently — no references to missing content, no duplicated sections.

---

## Summary

Total risks identified: **8**
Categories covered: Context Gaps, Integration, Scope Creep, Code Quality, Dependencies, State Tracking

**Highest severity:**
- **Risk 1** (plan-mode extension paths) — will immediately break `/review`, `/pre-mortem`, `/prd` commands
- **Risk 7** (GUIDE pipeline) — could break the npm package for all users
- **Risk 5** (profile accuracy) — inaccurate profiles are worse than no profiles

**Plan adjustments recommended:**
1. Add plan-mode extension update to Step 1
2. Add DEVELOPER.md updates to Steps 1 and 4 (not just Step 9)
3. Add capabilities.json update to Step 9
4. Define AGENTS.md vs APPEND_SYSTEM.md boundary before implementation
5. Change dependency: Steps 3-4 sequential, not parallel
6. Require source code reading for profile creation (Steps 5-6)

**Ready to proceed with these mitigations?**
