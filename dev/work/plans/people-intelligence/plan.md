---
title: People Intelligence
slug: people-intelligence
status: idea
size: medium
tags: [feature]
created: 2026-02-20T03:47:16Z
updated: 2026-03-01T19:30:00Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# People Intelligence

**Status**: Backlog — partially implemented  
**Priority**: High  
**Updated**: 2026-03-01 — audit of what's built vs. remaining

---

## Summary

Enrich people profiles with preferences, stances, and meeting history to dramatically improve meeting prep and stakeholder interactions. Transform "prep for my meeting" from file matching to genuine intelligence about the person.

## What's Already Built ✅

Significant infrastructure exists. Audit as of 2026-03-01:

### People Service (`packages/core/src/services/entity.ts`)
- `listPeople()`, `getPersonBySlug()`, `getPersonByEmail()`, `buildPeopleIndex()`
- Person schema: name, slug, email, role, team, company, category
- Entity resolution: `resolve()`, `resolveAll()` — fuzzy name matching via `arete resolve "Jane"`

### People Intelligence / Classification
- `suggestPeopleIntelligence()` — batch classification with confidence scores, rationale, evidence, unknown queue, feature toggles (extraction tuning, enrichment), KPI metrics
- CLI: `arete people intelligence digest --input <path>` with full output formatting
- Skill: `packages/runtime/skills/people-intelligence/SKILL.md` — uncertainty-safe classification

### Person Memory & Meeting History
- `refreshPersonMemory()` — scans meetings for person mentions, generates auto memory highlights
- CLI: `arete people memory refresh --person <slug> --if-stale-days N`
- `arete people show <slug> --memory` — displays auto-generated memory highlights
- Auto-writes `<!-- AUTO_PERSON_MEMORY:START -->` sections into person files

### Meeting Prep Integration
- `meeting-prep` skill uses `get_meeting_context` pattern
- Lazy-refreshes person memory (stale-aware) before prep
- Includes QMD queries for decisions/learnings involving attendees
- Calendar integration for meeting identification

### CLI
- `arete people list [--category] [--json]`
- `arete people show <slug> [--memory] [--json]`
- `arete people index`

---

## What's NOT Built ❌ (Remaining Work)

The infrastructure is solid. What's missing is the **insight extraction layer** — the features that turn raw meeting data into genuine people intelligence.

### 1. Stances Extraction & Tracking
- No extraction of stances from meetings ("Sarah is skeptical of AI features")
- No structured `## Stances` section on person profiles
- No auto-update pipeline from meeting processing → person stances

### 2. Communication Preferences
- No structured `## Communication Preferences` section
- No extraction of communication patterns from meetings
- Currently manual-only if a user writes it

### 3. Bidirectional Action Item Tracking
- No structured `## Open Items` section (I owe them / they owe me)
- No extraction of action items from meetings tied to specific people
- Meeting prep mentions "outstanding action items" but there's no persistent tracking

### 4. Relationship Health Metrics
- Memory refresh tracks meeting mentions but doesn't compute:
  - Meeting frequency trends
  - Last interaction recency
  - Open loop count
  - Sentiment indicators

---

## Remaining Problem

"Prep for my meeting with Sarah" today returns: her role, recent meetings she appeared in, and memory highlights (mention frequency). It does NOT return: what she cares about, what concerns she's raised, what you owe her, or how healthy the relationship is.

The gap is **synthesis and extraction** — turning meeting transcripts into structured person intelligence.

## Remaining Scope

### Phase A: Enhanced Person Schema + Stances (3-4 tasks)
1. Add optional structured sections to person profile schema (Stances, Communication Preferences, Open Items)
2. Build extraction patterns for stances from meeting transcripts
3. Integrate extraction into meeting processing pipeline (process-meetings skill or `arete pull`)
4. Update `arete people show` to display new sections

### Phase B: Action Item Tracking (2-3 tasks)
1. Extract bidirectional action items from meetings tied to people
2. Persist in person profiles under `## Open Items`
3. Surface in meeting prep ("You owe Sarah X")

### Phase C: Relationship Health (2 tasks)
1. Compute relationship metrics from meeting history (frequency, recency, open loops)
2. Include relationship health in meeting prep output

### Phase D: Meeting Prep Enhancement (1-2 tasks)
1. Update meeting-prep skill to consume stances, action items, relationship health
2. Generate talking points from stances + open items

---

## Success Criteria

"Prep for my meeting with Sarah" returns:
- ✅ Her role, context (already works)
- ✅ Recent meetings and memory highlights (already works)
- ❌ Her recent concerns and stances on relevant topics
- ❌ Open action items in both directions
- ❌ Suggested talking points based on stances + open items
- ❌ Relationship health indicator

## Dependencies

- Existing people service and entity resolution (✅ built)
- Meeting processing pipeline (✅ built)
- Person memory refresh (✅ built)

## References

- People service: `packages/core/src/services/entity.ts`
- People CLI: `packages/cli/src/commands/people.ts`
- People intelligence skill: `packages/runtime/skills/people-intelligence/SKILL.md`
- Meeting prep skill: `packages/runtime/skills/meeting-prep/SKILL.md`
- Process meetings skill: `packages/runtime/skills/process-meetings/SKILL.md`
