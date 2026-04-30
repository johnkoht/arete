# Skills — Cross-Cutting Learnings

Patterns and gotchas that apply across multiple skills. Read when working on skills that share common patterns.

---

## Gotchas

### 1. Reviewer and final review subagents must receive expertise profiles (key sections only)

**Problem**: The 4-layer context stack defines expertise profiles (Layer 4) for domain knowledge. Developers were receiving profiles, but reviewers were not — meaning reviewers couldn't verify code against domain invariants.

**Fix**: All reviewer subagents (pre-work sanity check, code review, final holistic review) must receive the same expertise profiles as the developer. Include key sections only to avoid context bloat.

**Source**: build-context-injection plan (2026-03-28) — discovered reviewer.md says "When loaded with an expertise profile..." but execute-prd never passed profiles to reviewers.

### 2. Reference developer's profile selection — don't duplicate heuristics

**Problem**: Profile selection logic (which packages → which profiles) exists in execute-prd Step 10. Duplicating this logic in reviewer steps creates maintenance burden and risks inconsistency.

**Fix**: Reviewer steps should say "use the same profile(s) selected for the developer" rather than re-specifying the file-to-profile mapping. The orchestrator carries profile selection from Step 10 to all subagent prompts for that task.

**Source**: build-context-injection pre-mortem Risk 1 (2026-03-28)

### 3. Profiles have different structures — use section mapping

**Problem**: Not all profiles have the same sections. Core profile has `## Invariants`, `## Anti-Patterns`, `## Key Abstractions`. CLI profile has `## Purpose & Boundaries`, `## Command Architecture`. Assuming all profiles have the same structure causes silent failures.

**Fix**: Use profile-specific section mapping:
- **Core** (`packages/core/`): `## Invariants`, `## Anti-Patterns & Common Mistakes`, `## Key Abstractions & Patterns`
- **CLI** (`packages/cli/`): `## Purpose & Boundaries`, `## Command Architecture` + first 100 lines of `## Command Map`
- **Fallback** (unknown profile): first 150-200 lines of the profile

**Source**: build-context-injection review (2026-03-28) — discovered CLI profile lacks Invariants/Anti-Patterns sections.

### 4. Profiles are point-in-time snapshots

**Problem**: If expertise profiles are updated mid-PRD execution, reviewers may be checking against stale invariants. This is a known trade-off.

**Mitigation**: If profiles change during a long PRD execution, re-run final review with updated context. For most PRDs this isn't an issue — profiles change infrequently.

**Source**: build-context-injection pre-mortem Risk 3 (2026-03-28) — accepted as low-probability, documented for awareness.

### 5. In constrained environments where subagents can't dispatch sub-subagents, parent must orchestrate per-task while playing reviewer

**Problem**: The /ship Phase 4 build pattern assumes a parent orchestrator dispatches both a developer subagent AND a reviewer subagent per task. When the runtime sandbox restricts subagent depth (sub-subagents not allowed), the developer subagent has no way to spawn its own reviewer — it must return to the parent. This breaks the canonical "parallel developer + reviewer" pattern that /ship documents.

**Fix**: Parent orchestrator dispatches the developer subagent for a task, reads the resulting diff + commits when the subagent returns, then runs the reviewer prompt itself (or as a fresh subagent invocation, in series rather than parallel) before allowing the next task's dispatch. Trade-offs:
- **Pro**: Stricter context control — the parent sees every diff before approving the next task, catches cross-task inconsistencies (e.g., line-number drift in PRD ACs after Task 5's flag wiring shifts Task 7's expected callsites).
- **Con**: Parent context grows linearly with tasks; for 8+ task builds this matters. Mitigate with `--continue` resumption from the build log if context fills.
- **Con**: Per-task reviews are scoped to one PRD task and can miss cross-cutting invariants. **Compensate with a profile-driven holistic review at the end** — that's the load-bearing review for cross-package branches in this constrained mode.

**When to detect**: If your subagent dispatch fails with a "cannot spawn nested subagents" error, or if the developer subagent's task definition includes a "now spawn the reviewer" step that returns failure, you're in the constrained mode. Switch the parent into reviewer-as-well duty for the rest of the build.

**What to instrument**: The build log should record both the developer-dispatch outcome AND the parent's reviewer pass for each task — they're separate gates even when run by the same agent.

**Source**: slack-digest-topic-wiki build (2026-04-29) — entire 8-task build executed in this mode. Worked cleanly; final review (loaded with backend + core + cli profiles) caught a backend dark-code gap that per-task reviews missed (`packages/apps/backend/src/routes/meetings.ts:244` rename was typecheck-only verified, no integration test). Per-task reviews don't have the cross-package profile context to catch this class.

---

## References

- **4-layer context stack**: See `.pi/agents/reviewer.md` § Composition
- **Profile selection heuristic**: See `.pi/skills/execute-prd/SKILL.md` Step 10
- **Expertise profiles**: `.pi/expertise/{domain}/PROFILE.md`
