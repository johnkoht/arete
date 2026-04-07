---
name: wrap
description: Close out completed work with outcomes assessment, decision/learning extraction, and archival.
triggers:
  - wrap up
  - close out
  - post-mortem
  - what did we learn
  - archive this project
work_type: review
category: essential
profile: pm-orchestrator
requires_briefing: false
---

# Wrap Skill

Close out completed work: assess outcomes against goals, extract decisions and learnings, archive if applicable. Lightweight post-mortem for any completed project, plan, or initiative.

## When to Use

- After completing a project or initiative
- "What did we learn from this?"
- "Let's close this out"
- "Archive this project"
- End of a quarter or major milestone

## Workflow

### 1. Identify What Was Completed

Ask: "What are we wrapping up?" Determine the scope:
- A project in `projects/active/`
- A plan or initiative
- A quarter goal
- Ad-hoc work

Read relevant context:
- Project README, goals, success criteria
- Related memory entries
- Week/quarter files that reference this work

### 2. Assess Outcomes

Compare results against original goals or success criteria:

```markdown
## Outcomes Assessment

| Goal/Criteria | Status | Evidence |
|---------------|--------|----------|
| [Original goal 1] | Met / Partially met / Not met | [What happened] |
| [Original goal 2] | Met / Partially met / Not met | [What happened] |
```

If no formal success criteria existed, assess: "What was the intent? Did we achieve it?"

### 3. Extract Decisions and Learnings

Surface candidates for the user to approve, edit, or skip:

```markdown
## Candidate Decisions
1. [Decision made during this work] -- Approve / Edit / Skip
2. [Another decision] -- Approve / Edit / Skip

## Candidate Learnings
1. [What we learned] -- Approve / Edit / Skip
2. [What surprised us] -- Approve / Edit / Skip
```

Focus on:
- **Decisions**: Choices that affect future work ("We chose X over Y because Z")
- **Learnings**: Insights that change how we work ("Next time, do X earlier")
- **Surprises**: Things that were unexpected (positive or negative)

### 4. What Worked, What Didn't

Ask the user:
- "What worked well that we should repeat?"
- "What didn't work that we should change?"
- "Any surprises -- good or bad?"

Capture responses concisely.

### 5. Write to Memory

For approved items, write to `.arete/memory/items/`:
- **Decisions**: Append to `.arete/memory/items/decisions.md`
- **Learnings**: Append to `.arete/memory/items/learnings.md`

Format:
```markdown
- YYYY-MM-DD: [Item text] (from: [project/work name])
```

### 6. Archive (Optional)

If this was a project in `projects/active/`:

> "Would you like to archive this project? This moves it from `projects/active/` to `projects/archive/`."

If yes:
- Move the project directory
- Update any references in week.md or goals

### 7. Summarize and Close

```markdown
## Wrap: [Work Name]

**Status**: Complete
**Outcomes**: [X of Y goals met]

### Decisions Captured
- [Decision 1]
- [Decision 2]

### Learnings Captured
- [Learning 1]
- [Learning 2]

### What's Next
- [Suggested follow-up work]
- [Open questions to revisit]
```

Suggest next steps if applicable:
- Follow-up projects or plans
- Items to add to next week-plan
- People to update

## Tips

- Don't skip the "what didn't work" question -- that's where the best learnings live
- Keep decisions and learnings specific enough to be useful later
- Archive promptly -- stale active projects create noise

## References

- **Memory items**: `.arete/memory/items/decisions.md`, `.arete/memory/items/learnings.md`
- **Projects**: `projects/active/`, `projects/archive/`
- **Related**: pre-mortem (before work), review-plan (during work)
