---
title: People Intelligence
slug: people-intelligence
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

# People Intelligence

**Status**: Backlog  
**Priority**: High  
**Related**: Temporal Memory PRD (prerequisite), Agent Memory Research (2026-02-14)

---

## Summary

Enrich people profiles with preferences, stances, and meeting history to dramatically improve meeting prep and stakeholder interactions. Transform "prep for my meeting" from file matching to genuine intelligence about the person.

## Problem

Product builders interact with many stakeholders — executives, customers, engineers, partners — each with their own priorities, communication styles, and history. Today's meeting prep finds recent meetings but doesn't synthesize:

- What does Sarah care about?
- What concerns has she raised before?
- What's our relationship health?
- What do I owe her / she owes me?

## Goals

1. **Rich People Profiles** — Preferences, stances, communication style, relationship history
2. **Meeting History Synthesis** — Not just "recent meetings" but insights from those meetings
3. **Action Item Tracking** — What you owe them, what they owe you
4. **Relationship Health** — Frequency, sentiment, open loops

## Key Deliverables

- Enhanced people profile schema with structured sections:
  - Preferences (communication style, decision factors)
  - Stances (positions on key topics, concerns)
  - History (meeting frequency, last interaction, relationship health)
  - Open items (action items in both directions)
  
- `process-meetings` extracts person insights (not just creates files):
  - Capture stances expressed in meetings ("Sarah is skeptical of AI features")
  - Track action items assigned to/from each person
  - Note communication patterns

- Meeting prep uses rich people context:
  - Surface relevant stances ("Sarah pushed back on timeline last time")
  - Show open items ("You owe her the updated estimate")
  - Suggest talking points based on history

- Improved entity resolution for fuzzy name matching

## Success Criteria

"Prep for my meeting with Sarah" returns:
- Her role, context, and communication preferences
- Her recent concerns and stances on relevant topics
- Open action items in both directions
- Suggested talking points based on history
- Relationship health indicator

## Dependencies

- **Temporal Memory System** — Topics provide cross-references for person ↔ topic associations
- **Existing people/ structure** — Build on current people profiles

## Implementation Notes

### People Profile Schema (Enhanced)

```markdown
---
name: Sarah Chen
slug: sarah-chen
email: sarah.chen@acme.com
role: VP Engineering
company: Acme Corp
category: internal
---

## About
[Existing content]

## Communication Preferences
- Prefers data-driven arguments
- Appreciates concise updates, not walls of text
- Responds well to visuals and diagrams

## Stances (Auto-Updated)
- **AI features** (2026-01-15): Skeptical — concerned about quality and support burden
- **Technical debt** (2025-12-01): Strong advocate — pushes for 20% time allocation
- **Checkout timeline** (2026-02-10): Concerned — thinks Feb 28 is aggressive

## Open Items
### I Owe Sarah
- [ ] Updated engineering estimate for checkout (2026-02-10)
- [ ] Security review findings summary (2026-02-05)

### Sarah Owes Me
- [ ] Design resource allocation decision (2026-02-08)

## Meeting History
- **Last met**: 2026-02-10 (Sprint Planning)
- **Frequency**: Weekly
- **Recent meetings**: 8 in last 30 days

## Relationship Notes
[Manual notes if any]
```

### Extraction Patterns

Add to PATTERNS.md:

```markdown
## extract_person_insights

**Purpose**: Extract preferences, stances, and insights about people from meetings.

**Steps**:
1. Scan for stance indicators: "X thinks", "X is concerned about", "X prefers"
2. Scan for action items: "X to do Y", "I'll send X the..."
3. Match to existing people profiles
4. Present candidates for review (approve/edit/skip)
5. Update person file with approved insights
```

## Estimated Scope

- **Phase 1**: Enhanced schema, manual population — 1-2 tasks
- **Phase 2**: Extraction from meetings — 3-4 tasks
- **Phase 3**: Meeting prep integration — 2-3 tasks
- **Phase 4**: Action item tracking — 2-3 tasks

## References

- Agent Memory Research plan: `/Users/johnkoht/.cursor/plans/agent_memory_research_401237a5.plan.md`
- Temporal Memory PRD: `dev/prds/temporal-memory/prd.md`
- Current people system: `src/core/people.ts`, `runtime/skills/process-meetings/SKILL.md`
