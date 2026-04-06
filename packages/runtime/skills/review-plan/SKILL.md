---
name: review-plan
description: Structured review for plans, PRDs, or completed work. Validates acceptance criteria, applies devil's advocate, outputs actionable refinements.
triggers:
  - review this
  - second opinion
  - critique this
  - does this look good
  - review plan
  - review prd
work_type: review
category: essential
profile: plan-reviewer
requires_briefing: true
---

# Review Plan Skill

Provide a rigorous quality gate for plans, PRDs, or completed work. Validates acceptance criteria, applies devil's advocate thinking, and outputs actionable refinements.

## When to Use

- "Review this plan"
- "Second opinion on this?"
- "Critique this PRD"
- "Does this look good?"
- Before committing to medium+ complexity work

## Workflow

### 1. Assess Complexity

Determine **Quick Review** or **Full Review**:

| Aspect | Quick Review | Full Review |
|--------|-------------|-------------|
| When | Simple, 1-3 steps, low risk | 4+ steps, cross-team, or high stakes |
| AC validation | Basic check | Full rubric with anti-pattern detection |
| Pre-mortem gating | Optional mention | Required for large, recommended for medium |
| Duration | 2-3 minutes | 5-10 minutes |

### 2. Identify Review Type

- **Plan** -- Proposed approach before execution
- **PRD** -- Requirements document before implementation
- **Completed work** -- Outcomes after execution

If unclear, ask.

### 3. Apply the Checklist

| Concern | Question |
|---------|----------|
| Problem clarity | Is the problem well-defined with evidence? |
| User impact | Who benefits and how? Is this validated? |
| Scope | Minimum viable scope, or over-engineered? |
| Success criteria | Specific, measurable, time-bound? |
| Dependencies | Stakeholder, team, or market dependencies clear? |
| Risks | Unidentified risks? (See pre-mortem categories) |
| Completeness | Missing steps or implicit assumptions? |
| Evidence | Are decisions backed by data, research, or user feedback? |

### 4. AC Validation Rubric

For each acceptance criterion, verify:

- [ ] **Independently verifiable**: Can be checked without checking other criteria
- [ ] **Specific**: States exactly what must be true, not a vague direction
- [ ] **Testable**: You could write a verification step for this
- [ ] **Single concern**: Tests one thing, not multiple things combined
- [ ] **No vague language**: Free of anti-pattern phrases (see below)

#### Anti-Pattern Phrases

| Phrase | Problem | Better Alternative |
|--------|---------|-------------------|
| "should work" | Untestable | "returns success response with status 200" |
| "properly handles" | Vague | "returns error message when input is null" |
| "as expected" | Undefined | "matches the format defined in schema X" |
| "appropriately" | Subjective | "within 2 business days" or "following process X" |
| "etc." | Incomplete | List all cases explicitly |
| "and/or" | Ambiguous | Split into separate criteria |

### 5. Devil's Advocate (Mandatory)

After the checklist, actively argue against the work. Do not skip this.

- **"If this fails, it will be because..."** -- The most likely failure mode. What assumption is wrong? What dependency will break?
- **"The worst outcome would be..."** -- The highest-stakes risk. What happens if this goes wrong?

### 6. Determine Verdict

| Verdict | When to Use |
|---------|-------------|
| **Approve** | No concerns, all checks pass |
| **Approve with suggestions** | Minor improvements, not blocking |
| **Approve pending pre-mortem** | Medium+ plan without pre-mortem |
| **Revise** | Significant concerns that must be addressed |

#### Pre-Mortem Gating

| Complexity | Pre-Mortem Requirement |
|------------|----------------------|
| Simple | Optional |
| Medium | Recommend: "Approve pending pre-mortem" if not done |
| Large | Required: Cannot approve without pre-mortem |

### 7. Output the Review

```markdown
## Review: [Artifact Name]

**Type**: Plan / PRD / Completed Work
**Complexity**: Simple / Medium / Large

### Concerns
1. **[Category]**: [Specific concern]
   - Suggestion: [How to address]

### AC Validation Issues (if any)
| Criterion | Issue | Suggested Fix |
|-----------|-------|---------------|
| "works properly" | Vague | "Achieves X measured by Y" |

### Strengths
- [What's good about this work]

### Devil's Advocate
**If this fails, it will be because...** [Most likely failure mode]
**The worst outcome would be...** [Highest-stakes risk]

### Verdict
[Approve / Approve with suggestions / Approve pending pre-mortem / Revise]
```

Present the review, discuss concerns, and if "Revise," specify what must change before re-review.

## Tips

- **Be specific**: "Success criteria 2 is unmeasurable" beats "criteria are vague"
- **Be constructive**: Every concern should have a suggestion
- **Be honest**: The value is in catching problems, not validating work
- **Argue against it**: The devil's advocate section should feel uncomfortable

## References

- **Related**: pre-mortem (risk analysis), wrap (close-out)
