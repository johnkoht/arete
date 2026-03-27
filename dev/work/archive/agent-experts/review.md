# Review: Agent Experts Plan

**Type**: Plan (pre-execution)
**Audience**: Builder (internal BUILD mode infrastructure)

---

## Concerns

### 1. Dependencies: Steps 3-4 Are Not Parallel

The plan states "Steps 1-4 can be done in parallel" but this isn't true. Steps 3 (APPEND_SYSTEM.md) and 4 (AGENTS.md) share a content boundary — both answer "what does the planner know?" and they must not overlap. The pre-mortem (Risk 8) caught this too. If a subagent writes APPEND_SYSTEM.md referencing "see AGENTS.md for expertise map" while another subagent hasn't rewritten AGENTS.md yet, the system is broken.

- **Suggestion**: Revise dependency graph. Steps 1-2 are parallel. Step 3 then Step 4 (or combined into one task). Steps 5-6 depend on Step 2.

### 2. Completeness: Plan-Mode Extension Update Missing from Step 1

The pre-mortem (Risk 1) identified that `.pi/extensions/plan-mode/commands.ts` hardcodes `.agents/skills/` paths in 3 places. Step 1's AC says "update any references in documentation" but this is TypeScript code, not documentation. It needs to be explicit in the step description.

- **Suggestion**: Add to Step 1: "Update `.pi/extensions/plan-mode/commands.ts` — change all `.agents/skills/` path references to `.pi/skills/`. Run `npm run typecheck` to verify."

### 3. Completeness: DEVELOPER.md Updates Deferred Too Late

DEVELOPER.md has ~20 references to paths that change across Steps 1, 4, and 9. The plan only mentions DEVELOPER.md in Step 9. This leaves the file broken for most of the execution.

- **Suggestion**: Each step that changes a path should update DEVELOPER.md for that path. Step 1 updates skill path references. Step 4 updates build script references. Step 9 handles cursor rule references.

### 4. Scope: Subagent Context Size Is Actually Higher

The plan targets "planner context <150 lines" (Success Criteria #1). But subagents would load ~795 lines across all 4 layers (AGENTS.md ~100 + build-standards.md ~300 + role.md ~170 + PROFILE.md ~225). Today's total auto-loaded is ~846 lines. Subagents end up with roughly the same total context, just better organized. That's not necessarily a problem — the value is in *relevance* not *size* — but the plan should be honest about it. Context quality improves; total context size for subagents stays similar.

- **Suggestion**: Reframe Success Criteria #2 to emphasize relevance, not just "focused context": "Subagents get context relevant to their task (role + domain expertise), not everything."

### 5. Catalog: capabilities.json Needs Updating

`dev/catalog/capabilities.json` has entries referencing `.cursor/rules/` and the APPEND_SYSTEM.md ↔ cursor rules sync note. The pre-mortem (Risk 3) caught this. Step 9 should explicitly include capabilities.json update.

- **Suggestion**: Add to Step 9: "Update `dev/catalog/capabilities.json` — update `pi-append-system-dev-rules` entry to reference `build-standards.md`, remove cursor rules paths."

### 6. Patterns: No Verification That Skills Still Work After Move

Step 1 moves skills and says "pi discovers them correctly" as the AC, but doesn't specify HOW to verify. Pi's skill discovery mechanism isn't documented in the plan.

- **Suggestion**: Add concrete verification to Step 1 AC: "Run `pi` and verify the available_skills section in the system prompt shows correct `.pi/skills/` paths. Test `/pre-mortem` on a dummy plan to confirm skill loading works."

---

## Strengths

- **Clear problem definition**: The triple-duplication problem is well-documented with specific files and line counts. Not vague.
- **Behavioral Model section**: Documenting the Steps 1-7 workflow, context isolation principle, and synthesis pattern gives implementers the "why" behind each file. This is unusually thorough for a plan.
- **Phased approach**: Infrastructure → Profiles → Composition → Cleanup is the right order. Each phase is independently valuable if later phases are deferred.
- **Pre-mortem already completed**: 8 risks identified with concrete mitigations. Risk 1 (extension paths) and Risk 7 (GUIDE pipeline) are genuine catches that would have caused breakage.
- **Out of Scope is explicit**: GUIDE mode changes, additional profiles, automated testing, deep maintenance — all clearly deferred. Prevents scope creep.
- **Expertise profiles as maps, not encyclopedias**: The decision to orient agents with pointers (where to dig) rather than encyclopedic content is the right call. Agents have tools; profiles tell them where to point the tools.

---

## Devil's Advocate

**If this fails, it will be because...** the planner becomes too thin and can't have useful planning conversations without spawning experts for everything. The current monolithic system is bad for many reasons, but it has one advantage: the agent can discuss architecture, conventions, and features in a single conversation without round-trips. If the new planner constantly says "let me check with an expert" for questions it used to answer directly, the workflow gets slower and more frustrating. The boundary between "planner knows enough" and "needs an expert" is a judgment call encoded in AGENTS.md and APPEND_SYSTEM.md — and getting that boundary wrong in either direction is easy.

**The worst outcome would be...** the expertise profiles are inaccurate, leading experts to give confident but wrong answers. An agent with a profile that says "MemoryService handles timeline generation" but the code has since moved that to IntelligenceService would direct developers to the wrong file, causing bugs that are harder to debug because the agent was explicitly told where to look. Inaccurate profiles are worse than no profiles — they add a layer of misdirection with an air of authority.

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

### Required Before Execution

1. **Fix dependency graph**: Steps 3-4 sequential, not parallel
2. **Add plan-mode extension update to Step 1**: TypeScript code change, not just docs
3. **Add DEVELOPER.md incremental updates**: Steps 1, 4, and 9
4. **Add capabilities.json to Step 9**
5. **Add concrete verification to Step 1 AC**: Test skill discovery works

### Recommended (Not Blocking)

6. Reframe Success Criteria #2 for relevance over size
7. Note in Steps 5-6: "Must read actual source files, not write from memory" (pre-mortem Risk 5)
