---
name: periodic-review
description: Quarterly context and workspace health check. Use when the user wants a quarterly review, context review, workspace health check, or to verify context is up to date.
primitives:
  - Problem
  - User
  - Solution
  - Market
  - Risk
work_type: operations
category: essential
intelligence:
  - context_injection
---

# Periodic Review Skill

Guide users through periodic reviews of context, memory, and workspace health.

## When to Use

- "Quarterly review"
- "Review my context"
- "Is my context up to date?"
- "Workspace health check"
- "Time for a review"

## When to Suggest Reviews

Proactively suggest a review when:
- User mentions it's a new quarter
- Context files have "Last Updated" dates > 90 days old
- User is starting a major new initiative
- User asks about outdated information

Prompt format:
```
It's been a while since your context was reviewed. Want to do a quick health check?
This helps ensure your business context is current and your memory is useful.
```

## Review Workflow

### 1. Context Health Check

Check each context file for:
- **Last Updated date**: Is it > 90 days old?
- **Completeness**: Are key sections filled in?
- **Relevance**: Has anything changed that makes this outdated?

```markdown
## Context Health Check

| File | Last Updated | Status |
|------|--------------|--------|
| business-overview.md | [Date] | ✅ Current / ⚠️ Review / ❌ Outdated |
| business-model.md | [Date] | |
| users-personas.md | [Date] | |
| products-services.md | [Date] | |
| goals/strategy.md | [Date] | |
| competitive-landscape.md | [Date] | |

### Recommended Updates
- [File]: [What needs updating]
```

### 2. Memory Review

Review memory files for:
- **Stale decisions**: Any decisions marked for review?
- **Applied learnings**: Have learnings been put into practice?
- **Activity gaps**: Any long gaps in activity log?

```markdown
## Memory Review

### Decisions to Revisit
- [Decision]: Was set for review on [date]

### Learnings to Apply
- [Learning]: Could be applied to [area]

### Recent Activity Summary
[Summary of last quarter's activity]
```

### 3. Project Cleanup

Check for:
- Stale active projects (no updates in 30+ days)
- Projects that should be finalized
- Archived projects with unlogged learnings

```markdown
## Project Status

### Active Projects
| Project | Last Updated | Status |
|---------|--------------|--------|
| [Name] | [Date] | Active / Stale / Ready to finalize |

### Recommendations
- [Project]: [Recommendation]
```

### 4. Scratchpad Cleanup

Review scratchpad for:
- Old items that should be moved to projects
- Completed TODOs to remove
- Ideas worth pursuing

```markdown
## Scratchpad Review

### Items to Move
- [Item]: Should become a project / Move to memory

### Items to Remove
- [Completed TODO]

### Ideas Worth Exploring
- [Idea]: Consider starting a project
```

### 5. QMD Index Health

If QMD is set up:
```bash
qmd status
```

Suggest:
- `qmd update` if files have changed
- `qmd embed` if it's been a while

### 6. Review Summary

Provide a summary and action items:

```markdown
## Review Summary

### Health Score
- Context: X/6 files current
- Memory: [Healthy/Needs attention]
- Projects: [X active, Y stale]

### Recommended Actions
1. [ ] Update [context file] - [what changed]
2. [ ] Finalize [project] - seems complete
3. [ ] Review decision: [decision] - marked for review
4. [ ] Clean up scratchpad - [X] items to process

### Next Review
Suggested: [Date 90 days from now]
```

## Quick Review Option

For a faster review, offer:

"Want a quick review or a thorough one?
- **Quick**: Just check context dates and flag obvious issues
- **Thorough**: Full review of context, memory, projects, and scratchpad"

## Scheduling Reminders

At end of review, suggest:
"Want me to remind you to review again next quarter? Add a note to your calendar or scratchpad:
```
Review PM workspace - [Date]
```"
