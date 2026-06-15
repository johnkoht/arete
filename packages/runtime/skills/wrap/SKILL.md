---
name: wrap
description: "Close out completed work: assess outcomes, extract decisions and learnings."
triggers:
  - wrap up
  - close out
  - post-mortem
  - what did we learn
work_type: analysis
category: essential
profile: pm-orchestrator
requires_briefing: false
---

# Wrap Skill

Close out completed work: assess outcomes against goals, extract decisions and learnings. Lightweight post-mortem for any completed project, plan, or initiative. For the full close-out of an **active project** (context reconciliation, dated archive, closed-project retro), use `finalize-project` instead — `wrap` deliberately does not archive active projects.

## When to Use

- After completing a project or initiative
- "What did we learn from this?"
- "Let's close this out"
- End of a quarter or major milestone

## Workflow

### 1. Identify What Was Completed

Ask: "What are we wrapping up?" Determine the scope:
- A project in `projects/active/`
- A plan or initiative
- A quarter goal
- Ad-hoc work

**Active-project hand-off**: If the scope is a directory under `projects/active/`, surface this offer up front before going further:

> "This is an active project. For the full close-out (context reconciliation, dated archive, closed-project retro), run `finalize-project` instead. Continue with a lightweight wrap (decisions/learnings only, NO archive)? (y/n)"

This early nudge is layered on top of the step-6 refusal below: the refusal is the backstop (wrap will not archive an active project even if this offer is skipped), and this nudge catches the case early so the user can switch to `finalize-project` before doing any work.

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

### 6. Archive (Optional, non-projects only)

**If the scope is a directory under `projects/active/`: do NOT archive it here.** `wrap` deliberately does not move or archive active projects — that would produce a second, divergent archive path (no dated `YYYY-MM_` prefix, no context `_history`, no activity-log entry, no closed-project retro). Instead, hard-redirect:

> "Wrapping up an active project? `wrap` doesn't archive it — run `finalize-project` for the full close-out (dated archive, context reconciliation, `_history`, activity log, and the closed-project retro). I've captured the decisions and learnings above; `finalize-project` will pick those up and complete the archival."

Stop here for active projects — point the user to `finalize-project` rather than moving the directory.

**For non-project work only** (a plan, a quarter goal, or ad-hoc work that is NOT a `projects/active/` project), the lightweight archive still applies:

> "Would you like to archive this work? This moves it to its archive location."

If yes:
- Move the directory/file to its archive location
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
- For active projects, route archival to `finalize-project` -- wrap only does the lightweight retro

## References

- **Memory items**: `.arete/memory/items/decisions.md`, `.arete/memory/items/learnings.md`
- **Projects**: `projects/active/`, `projects/archive/`
- **Related**: pre-mortem (before work), review-plan (during work)
