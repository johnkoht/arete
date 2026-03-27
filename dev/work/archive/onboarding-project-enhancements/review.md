# Review: Onboarding Project Enhancements

**Type**: Plan (pre-execution)
**Audience**: User — This changes the onboarding experience for PMs using Areté
**Reviewed**: 2026-02-27

---

## Checklist Analysis

| Concern | Assessment |
|---------|------------|
| **Audience** | ✅ Clear — This is user-facing onboarding workflow |
| **Scope** | ✅ Appropriate — Focused refactor of existing templates, not a rewrite |
| **Risks** | ⚠️ See concerns below |
| **Dependencies** | ⚠️ Step ordering needs attention |
| **Patterns** | ✅ Follows existing project/tool patterns |
| **Multi-IDE** | ✅ N/A — Template content, not rule/source files |
| **Backward compatibility** | ⚠️ See concerns below |
| **Catalog** | ✅ N/A — No tooling/extensions/services changes |
| **Completeness** | ⚠️ See concerns below |

---

## Concerns

### 1. Backward Compatibility: What happens to existing onboarding projects?

Users who already started onboarding have the old structure (30-60-90-plan.md, working-tracker.md, etc.). The plan doesn't address migration or whether we leave them alone.

**Suggestion**: Add explicit decision — "Existing projects keep old structure; changes only affect new projects" OR "Provide migration path"

### 2. Step Ordering / Dependencies: Step 5 depends on decisions from Steps 1-3

"Clean up templates directory" says to move weekly-plan.md and working-tracker.md to on-demand. But we need to know what content from those gets absorbed into notes.md vs generated on-demand.

**Suggestion**: Step 5 should reference explicit mapping: "working-tracker.md → absorbed into notes.md (learning backlog, burning problems sections)" and "weekly-plan.md → generated on-demand, no default template needed"

### 3. Missing Step: On-demand generation instructions

Plan says weekly plans, structured notes, working/ folder will be "generated on-demand." But no step creates the agent instructions for HOW to generate these.

**Suggestion**: Either add a step "Document on-demand generation patterns in TOOL.md" or clarify this is covered under Step 4

### 4. Acceptance Criteria Testability

Some ACs are vague:
- "Reads as a coaching document" — How do we test this?
- "Harvester-compatible" — What's the test?

**Suggestion**: Reframe ACs as observable behaviors: "No tables in notes.md template" or "Playbook includes all 6 principles from TOOL.md"

### 5. Phase reflections (day-30, day-60, day-90): Unclear placement

Current plan says "keep as outputs/" but these aren't currently in outputs/ — they're in templates/ as templates. Are they generated at project creation or on-demand?

**Suggestion**: Clarify: are these templates copied to outputs/ at project creation, or generated on-demand when user asks?

---

## Strengths

- **Clear mental model**: playbook (read) + plan (track) + notes (write) is clean and memorable
- **Council-validated**: Persona council check already done; concerns incorporated
- **On-demand philosophy**: Avoids overwhelming users with structure they won't use
- **Permission slip in notes.md**: Explicitly signals flexibility, which serves all personas

---

## Devil's Advocate

**If this fails, it will be because...** the playbook content extraction from TOOL.md loses the contextual nuance that makes the principles actionable. TOOL.md has rich "when to use" and "how to apply" guidance woven throughout — if playbook.md just extracts bullet points without the surrounding context, users will read "Listen more than talk" but not internalize the 80/20 → 70/30 → 50/50 progression that makes it practical. The playbook could become platitudes instead of coaching.

**The worst outcome would be...** users create onboarding projects, find the playbook too abstract and the notes.md too sparse, and disengage. They end up with a worse experience than the (admittedly clunky) current 30-60-90-plan.md that at least gave them concrete tasks. We'd have traded specificity for elegance and lost both.

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

### Recommended changes before building:

1. Add explicit backward compatibility decision (new projects only vs migration)
2. Clarify what content from working-tracker.md goes into notes.md vs on-demand
3. Clarify where phase reflections (day-30, day-60, day-90) live in new structure
4. Ensure playbook extraction preserves practical application, not just principles
