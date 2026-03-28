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

---

## References

- **4-layer context stack**: See `.pi/agents/reviewer.md` § Composition
- **Profile selection heuristic**: See `.pi/skills/execute-prd/SKILL.md` Step 10
- **Expertise profiles**: `.pi/expertise/{domain}/PROFILE.md`
