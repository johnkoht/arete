---
title: People Intelligence
slug: people-intelligence
status: building
size: medium
tags: [feature]
created: 2026-02-20T03:47:16Z
updated: 2026-03-02T03:44:49.711Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 9
---

# People Intelligence

**Status**: Planned — ready for PRD  
**Priority**: High  
**Size**: Large (9 tasks)  
**Updated**: 2026-03-01 — final plan after pre-mortem + review + decisions

---

## Summary

Enrich people profiles with stances, bidirectional action items, and relationship health metrics extracted from meeting transcripts. Transform "prep for my meeting" from file matching to genuine intelligence about the person.

## Problem

"Prep for my meeting with Sarah" today returns: her role, recent meetings, and mention-frequency memory highlights. It does NOT return: what she cares about, what concerns she's raised, what you owe her, or how healthy the relationship is. The gap is **synthesis and extraction** — turning raw meeting data into structured person intelligence.

## Key Decisions (2026-03-01)

1. **LLM extraction in separate module** — `person-signals.ts` exports standalone functions accepting `LLMCallFn` as a parameter. EntityService stays LLM-free. `LLMCallFn` passed via `RefreshPersonMemoryOptions`, not class constructor.
2. **Workspace owner via profile.md** — Read `context/profile.md` frontmatter `name` field for "I" identity. Fallback: first-person language heuristics. Already read by `suggestPeopleIntelligence()`.
3. **Communication Preferences cut from v1** — Persona Council: Harvester harmed by false positives, Preparer sees marginal delta. Backlog for post-v1 with LLM + user validation.
4. **Task 1 (refactor) is mandatory first step** — Extract person-memory module before any new features.
5. **No separate LLM cache** — Rely on existing `ifStaleDays` stale-awareness across invocations + in-memory `Map` within a single refresh call. No on-disk cache.
6. **Single auto-managed marker pair** — All new subsections (stances, open items, health) render inside existing `AUTO_PERSON_MEMORY:START/END` block. No new markers.

## Stance Extraction LLM Prompt Specification

**JSON output schema:**
```json
{
  "stances": [
    {
      "topic": "string — what the stance is about (2-8 words)",
      "direction": "supports | opposes | concerned | neutral",
      "summary": "string — one sentence capturing the stance",
      "evidence_quote": "string — direct quote or close paraphrase from transcript"
    }
  ]
}
```

**Prompt rules:**
- Extract stances only for the named person — ignore other speakers
- A stance requires a clear position, opinion, or preference — NOT a question or neutral statement
- If uncertain whether something is a stance, **omit it** — precision over recall
- Evidence quote must come from the actual transcript text
- Omit `stances` key entirely if no clear stances found
- Return ONLY valid JSON, no markdown, no code fences

---

## Plan

### Task 1: Extract person-memory module from entity.ts

Move signal collection, aggregation, rendering, and upsert functions into `packages/core/src/services/person-memory.ts`. Zero behavior change, pure refactor.

**Functions to extract:** `collectSignalsForPerson()`, `aggregateSignals()`, `renderPersonMemorySection()`, `upsertPersonMemorySection()`, `extractPersonMemorySection()`, `getPersonMemoryLastRefreshed()`, `isMemoryStale()`, `normalizeSignalTopic()`, types `PersonMemorySignal`, `AggregatedPersonSignal`, `RefreshPersonMemoryInternalOptions`, constants `AUTO_PERSON_MEMORY_START/END`.

**AC:**
- `entity.ts` drops to ~1,200 lines
- `person-memory.ts` exists with all extracted functions exported
- Direct unit tests for `collectSignalsForPerson()`, `aggregateSignals()`, `upsertPersonMemorySection()` added
- All existing `person-memory.test.ts` integration tests pass unchanged
- `npm run typecheck && npm test` pass

### Task 2: Build LLM stance extraction module

Create `packages/core/src/services/person-signals.ts`. Export `buildStancePrompt(content, personName)`, `parseStanceResponse(response)`, `extractStancesForPerson(content, personName, callLLM)` following `extractInsights()` pattern from `conversations/extract.ts`.

**AC:**
- `buildStancePrompt()` tested independently — prompt includes person name, JSON schema, omission instruction
- `parseStanceResponse()` tested independently — handles valid JSON, malformed JSON, missing fields, empty stances array, code-fenced responses
- Integration test with mock `LLMCallFn` returning known stances — structured output matches `PersonStance` type
- Mock LLM returning empty/uncertain — graceful empty result
- `PersonStance` type exported: `{ topic, direction, summary, evidenceQuote, source, date }`

### Task 3: Build action item extraction with lifecycle

Add `extractActionItemsForPerson(content, personName, ownerName?)` to `person-signals.ts`. Regex-based (action items have clearer surface forms). Read owner name from `context/profile.md` frontmatter `name` field. Include lifecycle management.

**Extraction:**
- Match patterns: "[Person] will [verb]", "I'll send [person]", "action item: [text]", "TODO: [text]", "- [ ] [text]" near person name
- Classify direction: owner name in actor position → "I owe them"; person name in actor position → "they owe me"
- Fallback when no owner name: first-person language ("I'll", "I need to") → "I owe them"
- Content-normalized hash: `hash(normalize(text) + personSlug + direction)` for dedup

**Lifecycle:**
- Auto-stale items older than 30 days (based on source meeting date)
- Cap at 10 open items per person per direction (keep most recent)
- Stale items excluded from meeting prep; visible in `people show --memory` as "(stale)"
- Dedup: same hash across refreshes → don't re-add

**AC:**
- Extracts action items tied to specific people with direction
- Direction correct with profile.md name; falls back to first-person heuristics
- Items age out after 30 days
- Cap enforced at 10 per direction
- Re-extraction doesn't duplicate or resurrect stale items
- Tests: happy path, aging, capping, dedup, no-owner-fallback

### Task 4: Integrate extraction into refreshPersonMemory()

Update `EntityService.refreshPersonMemory()` to call stance and action item extraction. Add `callLLM?: LLMCallFn` to `RefreshPersonMemoryOptions`. Without it, only regex signals (asks/concerns) and action items run — stances are skipped (graceful degradation).

**Cache strategy:** In-memory `Map<string, PersonStance[]>` keyed by `${meetingPath}:${personName}` within a single refresh call. Prevents duplicate LLM calls for same meeting+person. Cross-invocation caching handled by existing `ifStaleDays`.

**AC:**
- `refreshPersonMemory()` with `callLLM` produces stances alongside asks/concerns
- Without `callLLM`, existing behavior unchanged — all current tests pass
- `RefreshPersonMemoryResult` updated with `stancesExtracted`, `actionItemsExtracted`, `itemsAgedOut` counts
- In-memory cache prevents duplicate LLM calls within single refresh
- No new external dependencies

### Task 5: Render enriched auto-memory sections

Extend `renderPersonMemorySection()` to include `### Stances`, `### Open Items (I owe them)`, `### Open Items (They owe me)`, `### Relationship Health` subsections inside the existing `AUTO_PERSON_MEMORY:START/END` block. Every item has source citation `(from: [Meeting Title], [Date])`.

**AC:**
- Single auto-memory block contains all subsections
- Source citations on every stance and action item
- Existing asks/concerns rendering unchanged
- Round-trip test: render → upsert → extract → verify content preserved
- Empty sections render as "None detected yet." (consistent with existing pattern)
- JSON output backward compatible: existing `asks`/`concerns` fields unchanged, new fields additive

### Task 6: Compute relationship health metrics

New `packages/core/src/services/person-health.ts`. Export `computeRelationshipHealth(meetingDates, openItemCount)`. Computed on-demand during refresh, rendered into auto-memory section. Not separately persisted.

**Metrics:**
- Meeting frequency: count in last 30 / 60 / 90 days
- Last interaction: date + "N days ago"
- Open loops: count of non-stale action items
- Health indicator: "Active" (met in last 14 days) / "Regular" (last 30) / "Cooling" (last 60) / "Dormant" (60+)

**AC:**
- Given meeting dates, computes correct frequency/recency
- Edge cases tested: no meetings, single meeting, daily meetings, no open items
- Health indicator labels correct for each threshold
- Rendered in auto-memory section under `### Relationship Health`

### Task 7: Update `arete people show` CLI + `--dry-run`

Display stances, open items, and relationship health from auto-memory section. Add `--dry-run` flag to `arete people memory refresh` that shows extraction preview without writing.

**AC:**
- `arete people show sarah --memory` displays all enriched sections
- `--dry-run` on refresh shows what would be extracted, writes nothing
- `--json` output includes new fields alongside existing ones (non-breaking)
- CLI test coverage for new display and dry-run flag

### Task 8: Update meeting-prep, process-meetings skills + PATTERNS.md

Edit `meeting-prep/SKILL.md`: include stances, open items, relationship health in brief format template. Edit `PATTERNS.md` `get_meeting_context`: add step for reading enriched auto-memory sections. Edit `process-meetings/SKILL.md`: add person memory refresh step after attendee processing with correct ordering.

**AC:**
- meeting-prep SKILL.md brief template includes stances, open items, health sections
- PATTERNS.md get_meeting_context references new auto-memory subsections
- process-meetings ordering: (1) create person files → (2) write attendee_ids → (3) refresh person memory
- Post-processing summary line format: "Sarah: 2 stances, 1 action item"
- Multi-IDE check passes: `rg "\.cursor.*or.*\.claude|\.claude.*or.*\.cursor" packages/runtime/skills/meeting-prep/ packages/runtime/skills/process-meetings/` returns nothing

### Task 9: Quality gates + documentation

Run full test suite. Update documentation and verify no regressions.

**AC:**
- `npm run typecheck && npm test` pass with zero failures
- `packages/core/src/services/LEARNINGS.md` updated: LLM extraction via options pattern, in-memory caching strategy, action item lifecycle design, person-memory module extraction seam
- `dev/catalog/capabilities.json` entries verified current for people service, people CLI, meeting-prep skill
- AGENTS.md sources updated if CLI surface changed (new `--dry-run` flag)
- No leftover console.log, commented-out code, or temp files

---

## Out of Scope

- **Communication Preferences** — cut per Persona Council (backlog for post-v1 with LLM + user validation)
- **LLM confidence scores displayed to user** — show item with source, or don't show it
- **Interactive confirmation prompts** during extraction — auto-extract, no gates
- **Sentiment analysis** beyond stance direction (supports/opposes/concerned/neutral)
- **Real-time extraction** — only during explicit refresh or process-meetings
- **On-disk LLM cache** — rely on stale-awareness + in-memory cache

## Dependencies

| Task | Depends On | Can Parallel With |
|------|-----------|-------------------|
| 1 | — | — |
| 2 | 1 | 3, 6 |
| 3 | 1 | 2, 6 |
| 4 | 2, 3 | — |
| 5 | 4 | 6 |
| 6 | 1 | 2, 3 |
| 7 | 5, 6 | — |
| 8 | 5 | 7 |
| 9 | all | — |

## Success Criteria

"Prep for my meeting with Sarah" returns:
- ✅ Her role, context (already works)
- ✅ Recent meetings and memory highlights (already works)
- ✅ Her stances on relevant topics with source citations
- ✅ Open action items in both directions with source citations
- ✅ Relationship health indicator (active/regular/cooling/dormant)
- ✅ Suggested talking points from stances + open items

## References

- People service: `packages/core/src/services/entity.ts`
- People CLI: `packages/cli/src/commands/people.ts`
- Conversation extraction pattern: `packages/core/src/integrations/conversations/extract.ts`
- People intelligence skill: `packages/runtime/skills/people-intelligence/SKILL.md`
- Meeting prep skill: `packages/runtime/skills/meeting-prep/SKILL.md`
- Process meetings skill: `packages/runtime/skills/process-meetings/SKILL.md`
- Pre-mortem: `dev/work/plans/people-intelligence/pre-mortem.md`
- Review: `dev/work/plans/people-intelligence/review.md`
- Planning notes: `dev/work/plans/people-intelligence/notes.md`
