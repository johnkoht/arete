---
title: Contextual Memory Retrieval in Planning Skills
slug: enforce-intelligence
status: complete
size: small-medium
tags: [skills, memory, intelligence]
created: 2026-03-26T04:20:42.847Z
updated: 2026-03-26T05:10:00.000Z
completed: 2026-03-26T05:10:00.000Z
execution: null
has_review: true
has_pre_mortem: false
has_prd: false
steps: 5
---

# Contextual Memory Retrieval in Planning Skills

**Problem**: Skills declare `memory_retrieval` in frontmatter, but this is decorative — agents don't actually search memory unless explicitly instructed in workflow steps. Decisions and learnings are captured but rarely surfaced during planning workflows (daily-plan, week-plan, meeting-prep), missing the opportunity to inform prioritization and preparation with institutional knowledge.

**Success Criteria**:
- Agent searches memory based on user's stated priorities (not static keywords)
- Agent searches memory based on confirmed meeting titles and attendees
- Relevant decisions/learnings are surfaced before task lists are built
- User can see how past decisions inform current planning

---

## Plan (5 Steps)

### 1. Create `contextual_memory_search` pattern in PATTERNS.md

**File**: `packages/runtime/skills/PATTERNS.md`

Define the gather → confirm → enrich pattern for memory retrieval.

**AC**:
- [ ] Pattern describes the flow: gather context → user confirms priorities/meetings → search based on confirmed items → surface relevant memory
- [ ] Relationship to `context_bundle_assembly` stated: "This is a lightweight alternative for planning skills that need memory context without full bundle assembly."
- [ ] Lists valid search term sources: user input, meeting titles, attendees, goal keywords
- [ ] Includes example `arete search` commands with `--scope memory --limit`
- [ ] Guidance on relevance filtering (max 3-5 items surfaced, only if genuinely relevant)
- [ ] Empty-result handling: "If memory search returns no relevant results, skip the 'does this change anything' question. Note: 'No directly relevant past decisions found.' Proceed without delay."
- [ ] Example agent exchange showing memory being surfaced

---

### 2. Update week-plan with contextual memory search

**File**: `packages/runtime/skills/week-plan/SKILL.md`

Add memory retrieval step after priorities and meetings are confirmed.

**Changes**:
- Add Step 2.5: Surface key meetings for user confirmation
  - Purpose: Meeting titles and attendees are inputs for memory search
  - Present prep-worthy meetings (QBRs, customer calls, key 1:1s from calendar pull)
- Add Step 2.6: Memory-informed context
  - Extract search terms from: user's priority keywords + confirmed meeting titles + key attendees
  - Run searches: `arete search "<term>" --scope memory --limit 2`
  - Surface relevant decisions/learnings (max 5 total)
  - Empty-result case handled gracefully

**AC**:
- [ ] Step 2.5 explains purpose: "Meeting confirmation enables targeted memory search"
- [ ] Step 2.5 presents prep-worthy meetings for user confirmation
- [ ] Step 2.6 explicitly instructs agent to derive search terms from conversation context
- [ ] Search commands use `--scope memory --limit` flags
- [ ] Surfaced items are brief (1-2 sentences each)
- [ ] Empty-result case handled gracefully (no awkward question)
- [ ] References `contextual_memory_search` pattern

---

### 3. Update daily-plan with contextual memory search

**File**: `packages/runtime/skills/daily-plan/SKILL.md`

Add memory retrieval after meetings are identified.

**Changes**:
- After Step 4 (meetings resolved), add Step 4.5: Memory-informed meeting context
- Search based on: today's meeting titles + key attendees
- Surface inline with meeting: "For your 2pm sync, note: [relevant decision]"
- Empty results = silent skip

**AC**:
- [ ] Memory search occurs after meetings are identified (Step 4.5)
- [ ] Search terms derived from meeting titles and attendee names
- [ ] Relevant items surfaced inline with meeting context
- [ ] Keeps output concise (1 item per meeting max)
- [ ] Empty results = no note (silent skip)
- [ ] References `contextual_memory_search` pattern

---

### 4. Update meeting-prep with explicit memory search step

**File**: `packages/runtime/skills/meeting-prep/SKILL.md`

Make the soft QMD mention into an explicit required step with **inline prose** (not a pattern reference).

**Changes**:
- Add Step 4.5: Memory search (after attendee resolution and area context)
- Inline instructions (not pattern reference to reduce cognitive load)
- Surface in prep brief under "Related Memory" section
- Empty results = omit section

**AC**:
- [ ] Memory search is explicit numbered step (Step 4.5)
- [ ] Instructions are inline prose, NOT a pattern reference
- [ ] Search terms include meeting topic and each attendee name
- [ ] Results appear in prep brief under "Related Memory" section
- [ ] Empty results = section omitted

---

### 5. Clarify frontmatter semantics in authoring guide

**File**: `packages/runtime/skills/_authoring-guide.md`

Document that `intelligence:` is declaration only, not enforcement.

**Changes**:
- Add note: "`memory_retrieval` in frontmatter declares capability but does not auto-execute"
- Add section "Adding Memory Search to Your Skill"
- Cross-reference examples for pattern vs. inline approach

**AC**:
- [ ] `intelligence:` field documented as "metadata/declaration, not enforcement"
- [ ] `requires_briefing` documented as "convention, not runtime-enforced"
- [ ] New section "Adding Memory Search to Your Skill" with guidance
- [ ] Cross-reference example shows pattern reference vs. inline steps
- [ ] Links to `contextual_memory_search` pattern

---

## Size Estimate: **Small-Medium** (5 markdown file edits, no code changes)

## Out of Scope

- Runtime enforcement of `requires_briefing`
- Auto-injection of steps from frontmatter
- Changes to the briefing service itself
- week-review (already has memory search)

## Risks

| Risk | Mitigation |
|------|------------|
| Agent ignores new steps | Explicit command examples |
| Too much memory surfaced | Max 5 items, only if relevant |
| Slows down planning flow | Keep searches brief (limit 2-3) |
| Inconsistency across skills | Single pattern in PATTERNS.md |
| Awkward UX on empty results | Silent skip, don't announce "nothing" |
