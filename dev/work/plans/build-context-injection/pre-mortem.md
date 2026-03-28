# Pre-Mortem: Build Context Injection

## Risk 1: Inconsistent Profile Selection Logic

**Problem**: Step 10 in execute-prd has specific logic for selecting profiles based on files-to-touch. If we don't reference this exact logic in Steps 11 and 13, the reviewer might get different profiles than the developer, or we might duplicate the heuristics (violating DRY).

**Mitigation**: 
- In Step 11 and 13 edits, explicitly reference "use the profiles selected in Step 10" — don't re-specify the heuristics
- Add a note: "The orchestrator carries profile selection from Step 10 to all subagent prompts for this task"

**Verification**: After editing, grep for any new occurrences of `packages/core → core profile` patterns. Should only exist in Step 10.

---

## Risk 2: Ship Phase 4.2 Lacks Access to Task-Level Profile Info

**Problem**: Ship's Phase 4.2 runs after execute-prd completes. It needs to know which profiles to inject, but it doesn't have access to per-task profile selections. We need to aggregate "which packages did the PRD touch" without re-implementing the selection logic.

**Mitigation**:
- In Phase 4.2, add step: "Scan prd.json for all `filesAffected` or task descriptions mentioning packages/core, packages/cli, etc."
- OR: Check execution state for files changed: `git diff --name-only main...HEAD | grep packages/`
- Choose git diff approach — it's authoritative (shows what actually changed, not what was planned)

**Verification**: Phase 4.2 edit includes a concrete method for determining profiles (git diff or prd.json scan), not vague "determine which packages were touched."

---

## Risk 3: Profile Content Becomes Stale in Long Reviews

**Problem**: If profiles are injected as text into prompts, and profiles change during a long PRD execution, reviewers could be checking against outdated invariants. This is low-probability for this plan (markdown-only changes) but a design consideration.

**Mitigation**:
- Document in LEARNINGS.md: "Profiles are point-in-time snapshots. If profiles change mid-PRD, re-run final review with updated context."
- This is acceptable for now — over-engineering to fix.

**Verification**: LEARNINGS.md entry mentions this trade-off.

---

## Risk 4: Reviewer Prompt Becomes Too Long

**Problem**: Expertise profiles can be substantial (500+ lines). Adding full profiles to reviewer prompts for every task could:
- Hit context limits
- Bury the actual review request in profile text
- Increase token costs significantly

**Mitigation**:
- In Step 11/13 edits, specify: "Include the **key sections** from profiles: Invariants, Anti-Patterns, Key Abstractions — not the full profile"
- Keep profile injection to ~100-200 lines max per review prompt

**Verification**: Edit specifies which profile sections to include, not "include the full profile."

---

## Risk 5: Edit Location Ambiguity

**Problem**: execute-prd has numbered steps, but the numbers might drift if the skill is edited elsewhere. "Step 11" and "Step 13" are specific today but may not be stable references.

**Mitigation**:
- When editing, search for the step by content, not number: "Reviewer: Pre-Work Sanity Check" and "Reviewer: Code Review"
- After editing, verify step numbers still match the plan (they may have shifted)

**Verification**: Use `grep -n "Reviewer: Pre-Work"` and `grep -n "Reviewer: Code Review"` to find actual locations.

---

## Summary

| Risk | Severity | Likelihood | Category |
|------|----------|------------|----------|
| Inconsistent profile selection logic | Medium | Medium | Integration |
| Ship Phase 4.2 lacks profile info | Medium | High | Context Gaps |
| Profile content becomes stale | Low | Low | Integration |
| Reviewer prompt too long | Medium | Medium | Scope Creep |
| Edit location ambiguity | Low | Medium | Dependencies |

**Total risks identified**: 5
**Categories covered**: Integration (2), Context Gaps (1), Scope Creep (1), Dependencies (1)

---

## Mitigations Summary

1. **Reference Step 10 profile selection** — don't duplicate heuristics
2. **Use git diff for Phase 4.2** — determine profiles from actual changes
3. **Document staleness trade-off** — acceptable for now
4. **Specify key profile sections** — not full profiles (~100-200 lines max)
5. **Search by step name** — not step number

**Ready to proceed with these mitigations.**