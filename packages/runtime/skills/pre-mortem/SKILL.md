---
name: pre-mortem
description: Risk analysis before starting complex PM work. Identifies risks across 8 categories with actionable mitigations.
triggers:
  - pre-mortem
  - risk analysis
  - what could go wrong
  - before we start
work_type: planning
category: essential
profile: pm-advisor
requires_briefing: false
---

# Pre-Mortem Skill

Run a structured pre-mortem risk analysis before starting complex PM work. Surfaces risks across 8 categories and creates actionable mitigations.

## When to Use

- Before starting a multi-step project or initiative
- Before a major decision with cross-team impact
- Before launching something new (product, process, partnership)
- When something feels risky but you can't articulate why

## Workflow

### 1. Identify the Work

Ask: "What are we about to start?" If unclear, gather enough context to understand the scope, stakeholders, and timeline.

### 2. Review the 8 PM Risk Categories

Work through each category:

| Category | Key Question |
|----------|-------------|
| **Stakeholder Alignment** | Do all stakeholders agree on the problem and approach? |
| **Success Metrics** | Are success criteria defined and measurable? |
| **Cross-team Dependencies** | What other teams/systems are involved? |
| **Scope Boundaries** | Is this the minimum viable scope, or gold-plating? |
| **Decision Quality** | Are decisions evidence-based or assumption-driven? |
| **External Dependencies** | Market timing, partner readiness, regulatory? |
| **Market Readiness** | Is the market/audience ready for this? |
| **Progress Tracking** | How will we track progress and know when to course-correct? |

### 3. Identify Risks

For each category, ask: "What could go wrong in THIS work?"

- Be specific: "Stakeholder X hasn't weighed in on pricing model" not "stakeholders might disagree"
- Be concrete: "Legal review typically takes 3 weeks and we have 2" not "timeline might slip"
- If a category doesn't apply, skip it (don't force risks)

### 4. Create Mitigations

For each risk, define:

```markdown
### Risk: [Short descriptive name]

**Problem**: [What could go wrong and why]

**Mitigation**: [Specific, concrete action to prevent it]

**Verification**: [How to check mitigation was applied]
```

### 5. Present for Review

Output the complete pre-mortem with:
- All identified risks (typically 4-8)
- Concrete mitigations for each
- Verification criteria

Ask: "Do you see any other risks? Are these mitigations sufficient?"

### 6. Store for Reference

Save the analysis to the appropriate location:
- If tied to a project: `projects/active/{project}/pre-mortem.md`
- If standalone: `now/scratchpad.md` (append under a heading)

## Output Format

```markdown
## Pre-Mortem: [Work Name]

### Risk 1: [Name]

**Problem**: [Description]

**Mitigation**: [Action]

**Verification**: [How to check]

---

### Risk 2: [Name]

**Problem**: [Description]

**Mitigation**: [Action]

**Verification**: [How to check]

---

## Summary

Total risks identified: [N]
Categories covered: [List]

**Ready to proceed with these mitigations?**
```

## Tips

- **Be concrete**: "Schedule alignment meeting with Sarah before Thursday" beats "get alignment"
- **Be actionable**: Mitigations you can actually do this week
- **Be verifiable**: Know when the mitigation succeeded
- **Skip empty categories**: Not every category applies to every project

## References

- **Used by**: review-plan (pre-mortem gating for medium+ plans)
- **Related**: review-plan, wrap
