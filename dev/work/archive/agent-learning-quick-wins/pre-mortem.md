# Pre-Mortem: Agent Learning Quick Wins

Plan size: **Medium** (5 steps, ~14 files)
Date: 2026-02-21

---

### Risk 1: `before_agent_start` Messages Accumulate in Session History

**Category**: Platform Issues / Integration

**Problem**: The pi `before_agent_start` hook fires on every user prompt, and returning `{ message }` creates a "persistent message stored in session, sent to LLM" (per pi docs). If the agent-memory extension returns `{ message: { content: collaborationMdContent } }` — following the same pattern as the plan-mode extension — every prompt adds another copy of collaboration.md to the session context. A 30-turn session would contain 30 injected copies (each ~1–2K tokens), expanding context by 30–60K tokens and defeating the purpose of lightweight injection.

The plan uses a two-step design (`session_start` caches, `before_agent_start` injects) but is silent on *how* to inject: `message` vs `systemPrompt` have different accumulation behavior.

**Mitigation**: Use `systemPrompt` modification instead of `message` in `before_agent_start`. The pi docs explicitly say `systemPrompt` is "chained across extensions" — it's applied per-turn without persisting in session history. The implementation should be:
```typescript
pi.on("before_agent_start", async (event) => {
  if (!collaborationContent) return;
  return {
    systemPrompt: event.systemPrompt + "\n\n## Builder Collaboration Profile\n\n" + collaborationContent,
  };
});
```
This is ~10 lines, avoids accumulation, and correctly adds the profile to every agent invocation without growing the session.

**Verification**: After implementing, read the actual `systemPrompt` value in `before_agent_start` (add a `ctx.ui.notify` in dev) to confirm the profile is present. Check that session history contains no injected `message` entries for the collaboration profile.

---

### Risk 2: Two Extensions Conflict on `before_agent_start` Messages

**Category**: Platform Issues / Integration

**Problem**: The plan-mode extension already returns `{ message }` from `before_agent_start` (plan context, execution context). If the agent-memory extension *also* returns `{ message }` from the same hook, the outcome is undefined: the pi docs state that `systemPrompt` is "chained across extensions" but make no such guarantee for `message`. In practice, only the last handler's message may be used, silently dropping the collaboration.md injection whenever plan mode is active. There is no test for multi-extension `before_agent_start` message behavior in this repo.

**Mitigation**: The fix for Risk 1 (using `systemPrompt` instead of `message`) resolves this automatically — `systemPrompt` is explicitly designed for multi-extension chaining. If the `message` approach is chosen despite Risk 1, add an explicit integration test that verifies collaboration.md content appears in system context when plan mode is active.

**Verification**: Start a session in plan mode (`/plan`). Verify collaboration profile content is visible to the agent (e.g., ask the agent to describe the builder's working style; it should cite specifics from collaboration.md). If it returns generic answers, the injection is being dropped.

---

### Risk 3: LEARNINGS.md Files Seeded with Narrative Summaries, Not Component Gotchas

**Category**: Context Gaps / Scope Creep

**Problem**: Memory entries are organized by session, not by component. An agent reading `2026-02-15_monorepo-intelligence-refactor-learnings.md` to produce `packages/core/src/search/LEARNINGS.md` will be extracting session-level lessons ("parallel subagent execution worked well", "full-suite quality gates caught ripple effects") rather than component-specific technical gotchas ("QMD provider requires the `qmd` binary in PATH; the test suite mocks this via `testDeps` in `qmd.test.ts`; skipping this pattern causes test failures"). The AC says "concrete gotchas from actual past incidents" — but without a clear example of what separates a LEARNINGS.md entry from a memory entry, the first-pass output will skew toward the latter.

The plan includes builder review as the backstop, but the review AC says "builder has reviewed and approved each file" without specifying review criteria. This makes the gate ambiguous: a builder who trusts the agent's output will approve shallow files.

**Mitigation**: Before executing step 2, establish a concrete quality bar with a negative example side-by-side:

- **Not acceptable** (memory-entry style): "The monorepo refactor showed that clean interfaces pay off. Keep SearchProvider swappable."
- **Acceptable** (LEARNINGS.md style): "**Gotcha**: `createQmdProvider()` requires the `qmd` binary installed via Homebrew. CI environments and fresh installs will silently fall back to token search without an error — check `packages/core/src/search/providers/qmd.ts` L34 `execa('qmd')` for the binary call. See `SETUP.md §Prerequisites`."

Add this example pair to the task prompt for step 2. The builder review gate should explicitly ask: "Are these component-specific and incident-anchored, or could any of them appear in a generic coding guide?"

**Verification**: For each LEARNINGS.md file, confirm at least 3 entries reference a specific file path, line range, or named past incident (entry filename). If entries contain no file paths, they are too abstract.

---

### Risk 4: Orchestrator LEARNINGS.md Inclusion in Subagent Prompts Is Not Actionable

**Category**: Integration / Context Gaps

**Problem**: Step 4 updates execute-prd's SKILL.md to say: "include 'Read LEARNINGS.md in the working directory (if it exists)' in the Context section provided to subagents." This instruction has a structural problem: the "working directory" of a subagent is the worktree root, but the relevant LEARNINGS.md files live in component subdirectories (`packages/core/src/services/LEARNINGS.md`, `.pi/extensions/plan-mode/LEARNINGS.md`). An orchestrator following this instruction literally will tell subagents to look for `./LEARNINGS.md` (which doesn't exist at the root) and move on.

For the instruction to work, the orchestrator would need to: (1) inspect the task's target files, (2) infer their component directories, (3) check for LEARNINGS.md in each, and (4) include any found paths explicitly. That's dynamic reasoning that a one-line addition to the template doesn't support.

**Mitigation**: Change the SKILL.md instruction from a general directive to a concrete prompt pattern:

```markdown
**Pre-task LEARNINGS.md check** (Orchestrator, before crafting subagent prompt):
For each file the subagent will edit, check for LEARNINGS.md in the same directory and one level up.
If found, add to "Context - Read These Files First":
  `packages/core/src/services/LEARNINGS.md` — component gotchas and invariants
```

This makes the orchestrator's job explicit: inspect target directories before writing the prompt, not after. It also belongs in the "Prepare Context" step (step 9 of the execution loop), not as a generic note in the template footer.

**Verification**: After updating SKILL.md, run one task in execute-prd against a file in `packages/core/src/services/`. Confirm the generated subagent prompt includes `packages/core/src/services/LEARNINGS.md` in the "Context - Read These Files First" list.

---

### Risk 5: dev.mdc and APPEND_SYSTEM.md Diverge After First Edit

**Category**: Multi-IDE Consistency

**Problem**: Step 1 adds identical rules to both `dev.mdc` (Cursor context) and `.pi/APPEND_SYSTEM.md` (pi context). `capabilities.json` already documents this pair as having a "Potential drift risk" — and the note predates this plan adding more shared rules. There is no source-of-truth file, no build step, and no lint check to detect divergence. The first time a future maintainer updates a LEARNINGS.md rule in one file and forgets the other, agents running in Cursor will behave differently from agents running in pi. Given that the LEARNINGS.md reading rule is the primary enforcement mechanism for this whole plan, drift here is especially costly.

**Mitigation**: In step 1, add a comment to both files pointing to the other as "keep in sync":
```
<!-- SYNC: This section mirrors .cursor/rules/dev.mdc §LEARNINGS.md. Update both together. -->
```
Additionally, add one line to the Skill/Rule Changes checklist in dev.mdc:
```
- [ ] **APPEND_SYSTEM.md sync**: If changing LEARNINGS.md rules, update .pi/APPEND_SYSTEM.md to match (and vice versa)
```
This doesn't eliminate drift but makes it a visible, named procedure rather than an implicit expectation.

**Verification**: After step 1, diff the LEARNINGS.md rule sections in both files character-by-character. They must be identical. Add this to the step 1 AC: "Diff of LEARNINGS.md rule sections in dev.mdc and APPEND_SYSTEM.md shows no differences."

---

### Risk 6: "Nearest Parent" LEARNINGS.md Traversal Is Undefined

**Category**: Context Gaps / Code Quality

**Problem**: The rule says: "check for LEARNINGS.md in the same directory or nearest parent." There is no definition of how far up to traverse, no tooling to support the traversal, and no standard pattern in this codebase. An agent editing `packages/core/src/services/memory.ts` might: (a) only check `packages/core/src/services/` and miss a future `packages/core/LEARNINGS.md`, or (b) traverse all the way to root and find an unrelated file, or (c) skip the traversal entirely because the rule is ambiguous.

With only 6 seeded files at known paths, this ambiguity has low impact now. But as LEARNINGS.md files are created organically after regressions, agents will disagree on the traversal depth — and the most-specific file (closest to the edited code) might be missed if an agent stops at an upper level first.

**Mitigation**: Define "nearest parent" precisely in the rule text: "Check for LEARNINGS.md in the same directory as the file being edited, then each parent directory up to (but not including) the repository root. Stop at the first LEARNINGS.md found; read it. If editing files in multiple directories, check each." Also add: "The six seeded paths are: `.pi/extensions/plan-mode/`, `packages/core/src/search/`, `packages/core/src/services/`, `packages/core/src/integrations/`, `packages/cli/src/commands/`, `packages/runtime/rules/`."

**Verification**: The rule in dev.mdc should contain the phrase "same directory as the file being edited, then each parent" — not just "nearest parent."

---

### Risk 7: New Pi Extension Not Registered in capabilities.json

**Category**: Dependencies / Platform Issues

**Problem**: `dev.mdc` §Capability Registry Check says: "Before changing developer tooling or platform behavior (extensions, tools, services, rules integration): Read `dev/catalog/capabilities.json`... Update capability metadata if behavior, paths, owner, or status changed." A new pi extension at `.pi/extensions/agent-memory/index.ts` is exactly this category. The plan's step 3 AC lists: "extension loads without errors; if collaboration.md missing, does nothing" — but doesn't include `capabilities.json` update. The first agent to change the extension in the future will not find it registered, defeating the catalog's purpose as "current-state source of truth."

**Mitigation**: Add to step 3's acceptance criteria: "Add `pi-agent-memory-extension` entry to `dev/catalog/capabilities.json` with `type: extension`, `provenance: built`, `implementationPaths: ['.pi/extensions/agent-memory/index.ts']`, and `readBeforeChange` pointing to `memory/collaboration.md` and `APPEND_SYSTEM.md`."

**Verification**: `cat dev/catalog/capabilities.json | grep agent-memory` returns a matching entry.

---

## Summary

**Total risks identified**: 7

| Risk | Category | Severity | Primary Mitigation |
|------|----------|----------|--------------------|
| `before_agent_start` message accumulation | Platform | 🔴 High | Use `systemPrompt` return, not `message` |
| Multi-extension `before_agent_start` conflict | Platform | 🟡 Medium | Resolved by systemPrompt fix; test with plan-mode active |
| LEARNINGS.md seeded with generic content | Quality | 🟡 Medium | Concrete quality bar + negative example in step 2 prompt |
| Orchestrator LEARNINGS.md inclusion not actionable | Integration | 🟡 Medium | Move to "Prepare Context" step with explicit inspection logic |
| dev.mdc vs APPEND_SYSTEM.md drift | Multi-IDE | 🟡 Medium | Sync comment + checklist item; diff in step 1 AC |
| "Nearest parent" traversal undefined | Context Gap | 🟠 Low-Medium | Precise definition in rule text; enumerate known paths |
| capabilities.json not updated | Dependencies | 🟠 Low | Add to step 3 AC |

**Highest-leverage action**: Resolve Risks 1+2 together before writing a single line of the extension. The choice of `systemPrompt` vs `message` determines the extension's token footprint and multi-extension compatibility. Getting this wrong produces a subtly broken extension that's hard to diagnose in production sessions.

**Lowest risk steps**: Steps 1 and 4 (markdown editing). Step 2 quality depends entirely on the source material reading instructions and builder review gate.
