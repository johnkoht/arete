---
name: review-plan
description: Structured second-opinion review for plans, PRDs, or completed work. Use when you want a reviewer to evaluate work for risks, gaps, and improvements.
category: build
work_type: development
---

# Review Plan Skill

Provide a structured second-opinion review for plans, PRDs, or completed work. Applies a tailored checklist and devil's advocate perspective to surface risks, gaps, and improvements.

**INTERNAL TOOLING** — For developing Areté itself, not for end users.

## When to Use

- "Review this plan"
- "Can you give me a second opinion on this?"
- "Critique this PRD"
- "Does this implementation look good?"
- When one agent creates work and another should evaluate it

## Workflow

### 1. Identify Review Type

Determine what's being reviewed:

- **Plan** — A proposed approach before execution (steps, tasks, architecture)
- **PRD** — Requirements document before implementation
- **Implementation** — Completed work after execution

If unclear, ask: "Is this a plan (pre-execution), PRD (requirements), or implementation (completed work)?"

### 2. Clarify Audience

Before reviewing, confirm: **Who is this for?**

- **Builder** — Internal tooling for developing Areté (belongs in `dev/`)
- **User** — End-user functionality for PMs using Areté (belongs in `runtime/`, `src/`)

If the artifact doesn't make audience clear, **flag it as a concern**. Ambiguous audience leads to misplaced code, confusing docs, and scope creep.

Signs of unclear audience:
- File placed in `runtime/` but only useful for development
- Feature described without specifying who benefits
- Skill or tool that could serve either audience

### 3. Apply the Checklist

Use the appropriate checklist based on review type.

**Plan Review** (pre-execution):

| Concern | Question |
|---------|----------|
| Audience | Is it clear who this is for (builder vs user)? |
| Scope | Is the scope appropriate? Over-engineered or under-scoped? |
| Risks | Are there unidentified risks? (See pre-mortem categories) |
| Dependencies | Are task dependencies clear and correctly ordered? |
| Patterns | Does it follow existing patterns or introduce unnecessary novelty? |
| Backward compatibility | Will this break existing functionality? |
| Completeness | Are there missing steps or implicit assumptions? |

**PRD Review** (pre-implementation):

| Concern | Question |
|---------|----------|
| Audience | Is it clear who this is for (builder vs user)? |
| Problem clarity | Is the problem well-defined? |
| Acceptance criteria | Are criteria specific, measurable, testable? |
| Edge cases | Are edge cases and error states covered? |
| Scope boundaries | Is out-of-scope clearly defined? |
| Dependencies | Are external dependencies identified? |
| Test coverage | Are test requirements clear? |

**Implementation Review** (post-execution):

| Concern | Question |
|---------|----------|
| Audience | Is the code in the right location for its audience? |
| Intent match | Does the work match the original plan/PRD intent? |
| Acceptance criteria | Are all criteria met? |
| Code quality | Patterns followed, proper error handling, no shortcuts? |
| Test coverage | Are happy path and edge cases tested? |
| Backward compatibility | Did existing functionality survive? |
| Documentation | Are changes reflected in docs if needed? |

### 4. Devil's Advocate

After the checklist, actively argue against the work:

- **"If this fails, it will be because..."** — Articulate the most likely failure mode. What assumption is wrong? What dependency will break? What was underestimated?
- **"The worst outcome would be..."** — Surface the highest-stakes risk. What's the worst thing that could happen if this goes wrong?

This section is required. Don't skip it — adversarial thinking surfaces concerns that checklists miss.

### 5. Output the Review

```markdown
## Review: [Artifact Name]

**Type**: Plan / PRD / Implementation
**Audience**: Builder / User / Unclear

### Concerns

1. **[Category]**: [Specific concern]
   - Suggestion: [How to address]

2. **[Category]**: [Specific concern]
   - Suggestion: [How to address]

### Strengths

- [What's good about this work]

### Devil's Advocate

**If this fails, it will be because...** [Most likely failure mode]

**The worst outcome would be...** [Highest-stakes risk]

### Verdict

- [ ] **Approve** — Ready to proceed
- [ ] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding
```

### 6. Discuss and Close

- Present the review to the author
- Discuss any concerns that need clarification
- If verdict is "Revise," specify what must change before approval

## Tips for Reviewers

- **Be specific**: "Task 3 depends on Task 2 but they're listed in parallel" beats "dependencies unclear"
- **Be constructive**: Every concern should have a suggestion
- **Be honest**: The value is in catching problems, not validating work
- **Argue against it**: The devil's advocate section should feel uncomfortable — that's the point
- **Flag unclear audience**: If you can't tell who the work is for, that's a problem worth raising

## References

- **Risk categories**: See `dev/autonomous/templates/PRE-MORTEM-TEMPLATE.md` for the 8 pre-mortem risk categories
- **Code quality checklist**: See `.cursor/rules/dev.mdc` for the 6-point code review checklist
- **Related skills**: `.agents/skills/run-pre-mortem/SKILL.md` (risk identification before execution)
