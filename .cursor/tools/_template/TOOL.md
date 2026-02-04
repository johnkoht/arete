---
name: [tool-name]
description: [One-line description of what this tool does]
lifecycle: [time-bound | condition-bound | cyclical]
duration: [Expected duration, e.g., "90 days", "until launch", "quarterly"]
---

# [Tool Name] Tool

[2-3 sentence description of the tool's purpose and what success looks like]

## When to Use

- "[Trigger phrase 1]"
- "[Trigger phrase 2]"
- "[Trigger phrase 3]"

## When NOT to Use

- [Situation where this tool is overkill]
- [Situation where a skill would be better]

## Scope Options

### Comprehensive (Default)

[Description of the full experience]

- Full [X]-day/week structured plan
- Detailed tracking of all activities
- Complete outputs and deliverables

### Streamlined

[Description of the lighter version]

- Focused [shorter] plan
- Essential tracking only
- Core deliverables

---

## Phases

### Phase 1: [Name] (Days/Weeks X-Y)

**Goal**: [What success looks like for this phase]

**Key Activities**:
- [ ] [Activity 1]
- [ ] [Activity 2]
- [ ] [Activity 3]

**Outputs**:
- [Deliverable 1]
- [Deliverable 2]

**Phase Complete When**:
- [Criterion 1]
- [Criterion 2]

---

### Phase 2: [Name] (Days/Weeks X-Y)

**Goal**: [What success looks like for this phase]

**Key Activities**:
- [ ] [Activity 1]
- [ ] [Activity 2]
- [ ] [Activity 3]

**Outputs**:
- [Deliverable 1]
- [Deliverable 2]

**Phase Complete When**:
- [Criterion 1]
- [Criterion 2]

---

### Phase 3: [Name] (Days/Weeks X-Y)

**Goal**: [What success looks like for this phase]

**Key Activities**:
- [ ] [Activity 1]
- [ ] [Activity 2]
- [ ] [Activity 3]

**Outputs**:
- [Deliverable 1]
- [Deliverable 2]

**Phase Complete When**:
- [Criterion 1]
- [Criterion 2]

---

## Project Structure

When activated, create this structure in `projects/active/[tool-instance]/`:

```
projects/active/[tool-instance]/
├── README.md              # Status, current phase, progress
├── plan/
│   ├── [main-plan].md     # High-level plan
│   └── [detail-plans]/    # Detailed/periodic plans
├── inputs/
│   ├── [input-type-1]/    # Category of inputs
│   └── [input-type-2]/    # Category of inputs
├── working/
│   ├── [working-doc-1].md # In-progress work
│   └── [working-doc-2].md # In-progress work
└── outputs/
    ├── [output-1].md      # Final deliverable
    └── [output-2].md      # Final deliverable
```

## Activation Workflow

When user activates this tool:

1. **Confirm scope**: "Would you like comprehensive or streamlined?"
2. **Gather context**: [What information is needed to start?]
3. **Create project**: Set up the project structure
4. **Initialize plan**: Create the main plan document
5. **Start Phase 1**: Guide user through first activities

## Progress Tracking

Track progress in the project README.md:

```markdown
## Current Status

**Phase**: [1/2/3] - [Phase Name]
**Week**: [X] of [Y]
**Started**: YYYY-MM-DD
**Target Completion**: YYYY-MM-DD

## Progress

### Phase 1: [Name]
- [x] Completed activity
- [ ] Pending activity

### Phase 2: [Name]
- [ ] Not started

### Phase 3: [Name]
- [ ] Not started
```

## Graduation Criteria

The tool is complete when:

- [ ] [Criterion 1 - specific and measurable]
- [ ] [Criterion 2 - specific and measurable]
- [ ] [Criterion 3 - specific and measurable]
- [ ] User confirms ready to graduate

## Graduation Workflow

When graduation criteria are met:

1. **Review outputs**: Ensure all deliverables are complete
2. **Capture learnings**: Log key insights to `memory/items/learnings.md`
3. **Promote artifacts**: Move any outputs that belong elsewhere (e.g., context files)
4. **Archive project**: Use `finalize-project` skill
5. **Celebrate**: Acknowledge completion and success

## Weekly Check-in Template

Use for periodic progress reviews:

```markdown
## Week [X] Check-in

**Phase**: [Current phase]
**Energy/Momentum**: [High/Medium/Low]

### Accomplished
- [What got done]

### Learned
- [Key insights]

### Blockers
- [What's in the way]

### Next Week Focus
- [Top priorities]

### Adjustments Needed
- [Any plan changes]
```

## Resources

[Optional: Curated resources to support the tool]

- [Resource 1]: [Why it's helpful]
- [Resource 2]: [Why it's helpful]
