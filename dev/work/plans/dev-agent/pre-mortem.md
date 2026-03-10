# Pre-Mortem: Hotfix Skill

## Risk 1: Skill Discovery Gap

**Problem**: The hotfix skill relies on agents recognizing when to use it ("User reports a bug and asks to fix it"). But agents reading AGENTS.md might not load the skill before making ad-hoc fixes if the triggers aren't prominent enough or if they're in a hurry to be helpful.

**Mitigation**: 
- Add explicit guidance in `.pi/standards/build-standards.md` that says "For bug fixes, load `.pi/skills/hotfix/SKILL.md` first" — make it a hard requirement, not a suggestion
- Put the hotfix skill at the TOP of the [Skills] section in AGENTS.md so it's seen first
- In the skill triggers, include very broad patterns: "bug", "fix", "broken", "not working", "issue"

**Verification**: After building, test: "I found a bug in X" — does a fresh agent context mention the hotfix skill?

---

## Risk 2: Scope Creep in Skill Design

**Problem**: The skill could become overly complex trying to handle every edge case (multiple bugs, partial fixes, rollbacks, etc.) making it harder to follow than the problem it solves.

**Mitigation**:
- Keep the skill to 4 clear phases (Diagnose → Implement → Review → Close)
- No branching logic beyond "iterate if reviewer returns ITERATE"
- Explicitly scope OUT: multi-bug triage, refactor discovery, feature changes disguised as bugs

**Verification**: Final skill file should be <150 lines and have a single linear workflow.

---

## Risk 3: Reviewer Spawn May Not Work

**Problem**: The skill says "spawn reviewer agent" but subagent capability depends on the environment (pi-subagents package). If an agent follows the skill without subagent access, they'll fail at Phase 3.

**Mitigation**:
- Add a fallback in the skill: "If subagent tool is unavailable, perform self-review using reviewer.md checklist"
- Document this explicitly in the skill's Prerequisites section

**Verification**: Skill includes both the spawn path AND the self-review fallback.

---

## Risk 4: LEARNINGS.md Path Ambiguity

**Problem**: "Update LEARNINGS.md" in Phase 4 is vague. Which LEARNINGS.md? The one in the file's directory? The nearest ancestor? A new one?

**Mitigation**:
- Skill should say: "Check for LEARNINGS.md in the affected file's directory. If exists, add entry. If not, check parent directory. If still not found, create one in the directory of the primary changed file."
- Reference the existing convention from `.pi/standards/maintenance.md`

**Verification**: Skill has explicit LEARNINGS.md path resolution instructions.

---

## Risk 5: Integration with Existing Standards

**Problem**: Step 3 adds guidance to `build-standards.md`, but that file already has an execution path decision tree in the planner prompt (AGENTS.md context), not in build-standards.md. Could create duplicate or conflicting guidance.

**Mitigation**:
- Check where the execution path decision tree actually lives before editing
- If it's in AGENTS.md sources, update there instead of build-standards.md
- Or add a cross-reference rather than duplicating

**Verification**: grep for "execution path" and "User reports a bug" before implementing Step 3.

---

## Summary

**Total risks identified**: 5

**Categories covered**: Scope Creep, Dependencies, Integration, Code Quality, Context Gaps

**Key mitigations**:
1. Make hotfix skill requirement explicit and prominent
2. Keep skill simple with linear workflow
3. Add subagent fallback path
4. Specify LEARNINGS.md resolution rules
5. Verify where to add execution guidance before editing

---

**Ready to proceed with these mitigations?**
