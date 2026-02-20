---
title: Workflow Patterns
slug: workflow-patterns
status: idea
size: unknown
tags: [feature]
created: 2026-02-20T03:47:16Z
updated: 2026-02-20T03:47:16Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# Workflow Patterns (Proactive Behaviors)

**Status**: Backlog  
**Priority**: Medium  
**Related**: Temporal Memory PRD (completed), Preference Model (related), Agent Memory Research (2026-02-14)

---

## Summary

Detect common sequences and behaviors to enable proactive suggestions and graduated autonomy. Transform the agent from "waits for instructions" to "anticipates your needs."

## Problem

Users have consistent workflows:
- After drafting a PRD, they always ask for devil's advocate
- Before stakeholder meetings, they always want a prep brief
- End of week, they always run week review
- After saving meetings, they always run process-meetings

The agent doesn't learn these patterns. Users must explicitly request each step, every time.

## Goals

1. **Workflow Logging** — Track what skills/actions in what sequence
2. **Pattern Detection** — Identify consistent behaviors
3. **Proactive Suggestions** — "Want me to run devil's advocate? You usually ask for this."
4. **Graduated Autonomy** — Suggest → Ask → Do automatically (based on trust)

## Key Deliverables

- **Workflow Logging**
  - Track skill invocations with context (time, trigger, outcome)
  - Track sequences (what follows what)
  - Store in `.arete/activity/workflows/`

- **Pattern Detection**
  - Identify repeated sequences (A → B happens 80% of time)
  - Identify time-based patterns (Friday → week-review)
  - Identify context-based patterns (stakeholder meeting → prep brief)

- **Suggestion Engine**
  - After pattern detected 3+ times, offer suggestion
  - "You usually run devil's advocate after PRD. Want me to do that?"
  - User can: Accept, Decline, "Always do this", "Never suggest this"

- **Graduated Autonomy**
  - Level 0: Never suggest (user explicitly disabled)
  - Level 1: Suggest and wait (default)
  - Level 2: Ask briefly ("Running devil's advocate. Stop?")
  - Level 3: Do automatically (user explicitly enabled)

## Success Criteria

After consistent usage, agent proactively offers devil's advocate on PRDs without being asked.

After 4 consecutive Friday week reviews, agent suggests "Time for week review?" on Friday.

## Dependencies

- **Temporal Memory System** — Foundation for activity tracking
- **Preference Model** — User can set autonomy levels per pattern

## Implementation Notes

### Workflow Log Schema

`.arete/activity/workflows/YYYY-MM.md`:

```markdown
# Workflow Log — February 2026

## 2026-02-14

### 10:15 — create-prd
- Trigger: "Create PRD for notifications"
- Duration: 45 min
- Outcome: PRD created at projects/active/notifications-prd/
- **Followed by**: review-plan (10:52), [gap], devil's advocate request (11:30)

### 11:30 — devil's advocate (manual)
- Trigger: "Can you play devil's advocate on this PRD?"
- Context: After create-prd (same project)
- **Pattern candidate**: create-prd → devil's advocate

## 2026-02-13

### 14:00 — save-meeting
- Trigger: "Save this meeting"
- **Followed by**: process-meetings (14:05)

### 14:05 — process-meetings
- Trigger: "Process my meetings"
- **Pattern candidate**: save-meeting → process-meetings
```

### Pattern Detection

```typescript
interface WorkflowPattern {
  id: string;                    // e.g., "create-prd-then-devil-advocate"
  trigger: string;               // Skill that starts the pattern
  follows: string;               // Skill that follows
  occurrences: number;           // How many times observed
  lastSeen: string;              // ISO date
  confidence: number;            // 0-1 based on consistency
  autonomyLevel: 0 | 1 | 2 | 3;  // User-set preference
}
```

Stored in `.arete/memory/summaries/workflow-patterns.md`:

```markdown
# Workflow Patterns

## Active Patterns

### create-prd → devil-advocate
- Occurrences: 8
- Confidence: 0.85 (happens 85% of time after PRD)
- Autonomy: Level 1 (suggest)
- Last seen: 2026-02-14

### save-meeting → process-meetings
- Occurrences: 12
- Confidence: 0.92
- Autonomy: Level 2 (ask briefly)
- Last seen: 2026-02-14

### friday → week-review
- Occurrences: 4
- Confidence: 1.0 (every Friday)
- Autonomy: Level 1 (suggest)
- Last seen: 2026-02-09

## Declined Patterns

### meeting-prep → create-agenda
- User said "Never suggest this" on 2026-02-10
- Reason: "I don't always need an agenda"
```

### Suggestion UX

After create-prd completes:

```
PRD created at projects/active/notifications-prd/outputs/prd.md

💡 You usually run devil's advocate after creating a PRD. Want me to do that?
   [Yes] [No] [Always] [Never]
```

- **Yes**: Run devil's advocate now
- **No**: Skip this time (pattern still tracked)
- **Always**: Set autonomy to Level 3
- **Never**: Add to declined patterns

### Graduated Autonomy Levels

| Level | Behavior | When to Use |
|-------|----------|-------------|
| 0 | Never suggest | User explicitly declined |
| 1 | Suggest and wait | Default for new patterns |
| 2 | Ask briefly, proceed if no response in 5s | High-confidence, low-risk |
| 3 | Do automatically | User explicitly enabled |

## Estimated Scope

- **Phase 1**: Workflow logging — 2-3 tasks
- **Phase 2**: Pattern detection — 3-4 tasks
- **Phase 3**: Suggestion engine — 3-4 tasks
- **Phase 4**: Graduated autonomy UI — 2-3 tasks

## Risks

- **Annoying suggestions** — Too many suggestions becomes noise
  - Mitigation: Only suggest after 3+ occurrences; easy "Never suggest" option
  
- **Wrong patterns detected** — Coincidental sequences misread as patterns
  - Mitigation: Require high confidence (80%+) and multiple occurrences

- **Autonomy creep** — Agent does too much without asking
  - Mitigation: Default to Level 1; explicit user action to increase

- **Context matters** — Same skill sequence might be wanted in one context, not another
  - Mitigation: Include context in pattern (project type, time of day, etc.)

## Future Enhancements

- **Complex sequences**: A → B → C patterns (not just pairs)
- **Conditional patterns**: "After create-prd for new features (not bugs)"
- **Team patterns**: Learn from team workspace behaviors
- **Pattern sharing**: Export/import patterns between workspaces

## References

- Agent Memory Research plan: `/Users/johnkoht/.cursor/plans/agent_memory_research_401237a5.plan.md`
- Temporal Memory PRD: `dev/prds/temporal-memory/prd.md`
- Proactive Recommendations System: `scratchpad.md` (Future Enhancements)
