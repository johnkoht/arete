# Review: Agent Learning Quick Wins

**Type**: Plan (pre-execution)
**Audience**: Builder — internal tooling for developing Areté
**Reviewed by**: Product Manager, following review-plan skill workflow
**Date**: 2026-02-21

---

## Concerns

### 1. **Patterns**: Plan-mode extension uses `message` return, not `systemPrompt` — the plan's code example is correct but the developer has no local example to copy

The plan correctly specifies `systemPrompt` return from `before_agent_start` with a code example and rationale. However, the only local extension the developer can reference (`.pi/extensions/plan-mode/index.ts`) uses `return { message: { ... } }` at lines 413 and 425. The `systemPrompt` pattern has no local example in the repo.

I verified the pi API types (`BeforeAgentStartEventResult` at types.d.ts L601-605): both `message` and `systemPrompt` are valid returns. The pi docs include a canonical `systemPrompt` example in `examples/extensions/pirate.ts`. The type comment confirms: "If multiple extensions return this, they are chained."

- **Suggestion**: In step 3's implementation notes, add: "Reference pattern: `pirate.ts` in pi examples (`~/.nvm/.../pi-coding-agent/examples/extensions/pirate.ts`). Do NOT copy the plan-mode extension's `message` return — that's for conversation-visible context injection, not background profile injection."

### 2. **Completeness**: Step 2 source material may not exist on this worktree branch

Several memory entries referenced in step 2's source material table (`2026-02-18_plan-mode-ux-learnings.md`, `2026-02-18_planning-system-refinement-learnings.md`, `2026-02-07_phase-3-intelligence-services.md`) need to exist on the current branch. This is a worktree (`arete--agent-learning-improvements`). If these entries were created on other branches and not merged into this one, the developer executing step 2 will hit file-not-found errors.

- **Suggestion**: Before executing step 2, verify all referenced entries exist: `ls memory/entries/2026-02-18_plan-mode-ux-learnings.md memory/entries/2026-02-18_planning-system-refinement-learnings.md memory/entries/2026-02-15_monorepo-intelligence-refactor-learnings.md memory/entries/2026-02-11_calendar-provider-macos-alias.md memory/entries/2026-02-13_multi-ide-path-fix.md memory/entries/2026-02-12_rules-architecture-refactor-learnings.md memory/entries/2026-02-07_phase-3-intelligence-services.md`. If any are missing, either merge main first or adjust source material to available files + git log.

### 3. **Catalog**: `capabilities.json` entry for the new extension is specified but the `pi-append-system-dev-rules` entry also needs updating

Step 3 correctly adds a new `agent-memory-extension` entry to capabilities.json. But the existing `pi-append-system-dev-rules` entry (which covers `dev.mdc` and `APPEND_SYSTEM.md`) should also be updated — its `notes` already flag "Potential drift risk" and the new LEARNINGS.md rules increase that surface. At minimum, update `lastVerified` and add a note about the LEARNINGS.md sync requirement.

- **Suggestion**: In step 1's AC, add: "Update `pi-append-system-dev-rules` entry in `capabilities.json`: add note about LEARNINGS.md rules sync requirement; update `lastVerified`."

### 4. **Dependencies**: Step 4 modifies execute-prd SKILL.md but doesn't specify WHERE in the execution loop the LEARNINGS.md check goes

The execute-prd skill is a 631-line file with a complex execution loop (22 steps). Step 4 says to add the "Pre-task LEARNINGS.md check" to the "Prepare Context" step, but the skill doesn't have a step with that exact name. The relevant section is around steps 7-9 (task preparation and subagent dispatch). The developer needs to know the exact insertion point.

- **Suggestion**: In step 4, specify: "Insert the Pre-task LEARNINGS.md check in the execute-prd SKILL.md at the point where the orchestrator assembles the subagent prompt (search for 'Context' in the task dispatch template, around the 'Before spawning' or 'Pre-Work Sanity Check' section). The check should happen after the orchestrator identifies which files the subagent will edit."

### 5. **Scope**: `APPEND_SYSTEM.md` content overlaps heavily with `dev.mdc` — plan adds to both but doesn't address the root cause

The capabilities catalog explicitly flags this as a drift risk. This plan adds 4 more synchronized rules plus a SYNC comment and checklist item. While the mitigations are reasonable for a quick-wins plan, the plan could note that the `memory-system-refactor` backlog item should also evaluate a single-source approach for dev rules (APPEND_SYSTEM.md generated from dev.mdc, or vice versa). This isn't blocking but worth adding to the backlog item.

- **Suggestion**: Add one line to `dev/work/plans/memory-system-refactor/plan.md` ideas section: "Evaluate single-source approach for dev.mdc / APPEND_SYSTEM.md to eliminate sync drift."

---

## Strengths

- **The plan has been through extraordinary iteration**: Original large plan → pre-mortem → 2 independent subagent reviews (eng lead + orchestrator) → scope reduction → new pre-mortem (7 risks) → GPT-5.3 cross-model review → all findings incorporated. This is among the most thoroughly reviewed plans in the project.

- **The `systemPrompt` vs `message` decision is resolved in the plan itself**: The most dangerous implementation risk is fully documented with code example, rationale, and explicit "do NOT" guidance. A developer can implement step 3 correctly from the plan alone.

- **Content quality bar for step 2 is concrete**: The negative example pair (❌ memory-entry style vs ✅ LEARNINGS.md style) is exactly the kind of guidance that prevents generic output. The source material table per component is specific and actionable.

- **Accepted trade-offs are explicitly stated**: The plan doesn't hide its limitations — voluntary compliance for direct execution, sync drift, content staleness. These are named and bounded rather than glossed over.

- **Scope is correct**: Everything excluded should stay excluded. The plan resists the temptation to also fix the memory system, add qmd indexing, or write full docs.

---

## Devil's Advocate

**If this fails, it will be because...** the LEARNINGS.md convention becomes write-once-read-never — like the memory entries before it. The plan adds rules that tell agents to read LEARNINGS.md, but the only mechanical enforcement is in the execute-prd orchestrator path. For direct agent work (which is where many regressions actually happen — quick fixes, small tasks), an agent in a fresh session has to: (a) read dev.mdc, (b) notice the LEARNINGS.md rule, (c) check the directory for a LEARNINGS.md, (d) read it. That's 4 voluntary steps. The collaboration.md auto-injection solves this for the profile, but LEARNINGS.md has no automatic injection. The plan acknowledges this as an accepted trade-off and points to qmd indexing as the future fix — which is honest, but the gap remains until that work is done.

**The worst outcome would be...** six lovingly crafted LEARNINGS.md files that agents don't read, giving the team false confidence that regressions are being prevented when the underlying problem (agents don't read contextual knowledge at the point of edit) hasn't actually changed for non-PRD work. The collaboration.md injection WILL work (mechanical, not voluntary), so that part delivers value regardless. The question is whether LEARNINGS.md delivers value without mechanical enforcement.

---

## Verdict

- [x] **Approve with suggestions** — Minor improvements recommended

The plan is ready to build. The 5 concerns above are improvements, not blockers. The most important ones are #1 (add the pirate.ts reference so developers have a local `systemPrompt` example) and #4 (specify where in execute-prd the LEARNINGS.md check goes). These can be addressed during task prompt preparation without revising the plan itself.

The pre-mortem and two prior reviews have already hardened this plan significantly. The risks are well-understood, mitigated, and honestly stated. Build it.
