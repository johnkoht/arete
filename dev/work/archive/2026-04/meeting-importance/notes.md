# Meeting Importance: Smarter Processing for High-Volume Days

## Problem

With 7-9 meetings/day, processing overhead is unsustainable. Current extraction treats all meetings equally, producing noise:
- Observing-only meetings generate action items you don't care about
- Jira setup details get extracted as "decisions"
- 2-4 truly important meetings get the same treatment as background meetings

## Solution

**Importance-aware meeting processing** that:
1. Auto-infers importance from calendar signals (organizer, attendee count, speaking ratio)
2. Processes light meetings with minimal extraction (summary + domain learnings only)
3. Auto-approves light meetings, showing them in triage as "done" unless you reprocess
4. Gives important meetings full attention with quality extraction

## Importance Tiers

| Tier | When | Extraction | Triage |
|------|------|------------|--------|
| `skip` | Manual only | None | Badge: "skipped" (same list) |
| `light` | Large audience, not organizer, low engagement | Summary + 2 domain learnings | Auto-approved |
| `normal` | Default | Full extraction | Pending review |
| `important` | Organizer, 1:1, high speaking ratio, has agenda | Full + quality focus | Pending review |

## Inference Rules

### At Calendar Pull Time
```
if is_organizer → important
elif attendee_count == 2 (1:1) → important  
elif attendee_count <= 3 → normal
elif attendee_count >= 5 and not is_organizer → light
else → normal

if has_linked_agenda → at least normal (agenda = effort signal)
if agenda.importance set → use that override
```

### At Processing Time (transcript available)
```
if speaking_ratio > 0.4 → upgrade light → normal
```

If speaker data unavailable (no speaker labels in transcript), gracefully degrade to inferred importance. Agent can ask if unsure.

## Key Behaviors

### Light Extraction
- Summary only
- Up to 2 learnings, filtered to **domain/goal-relevant** (skip operational details like "Jira has initiatives")
- No action items
- No decisions (unless strategic)

### Recurring 1:1 Dedup
- Track `recurring_series_id` in meeting frontmatter
- More aggressive Jaccard threshold for same series
- Longer lookback window (across weeks, not just batch)
- Note: We have batch dedup via `priorItems` already, but not series-aware dedup

### Skipped Status
- New `status: skipped` in frontmatter
- Shows in triage UI with badge (same list as processed, not separate section)
- Does not require attention

### Reprocessing
- Manual reprocess always uses **thorough** mode (full extraction, no limits)
- `arete meeting extract <file>` on already-processed file → thorough
- `--importance light` flag available to override

---

## Technical Discovery

### Google Calendar API
The API returns these fields we're not capturing:
- `organizer: { email, displayName, self }` — `self: true` means you're the organizer
- `recurringEventId` — links instances to master event
- `recurrence` — RRULE for master events

**Change needed**: Update `GoogleEvent` type and `mapGoogleEvent()` to capture these.

### ical-buddy
Standard output doesn't include organizer. Would need:
- Add `-ip` flag to include properties
- Parse `organizer:` line from output

**Lower priority** — Google Calendar is the primary integration.

### Speaking Ratio
Transcripts from Fathom/Krisp have speaker labels like:
```
**John Koht | 01:18**
So weird.

**Dave Wiedenheft | 09:29**
Hey, John...
```

Can calculate ratio by:
1. Regex match speaker turns: `/^\*\*(.+?)\s*\|/gm`
2. Count characters/words per speaker
3. Compare owner's share to total

---

## Success Criteria

- [ ] Light meetings process in <5 seconds, no staging review needed
- [ ] Important meetings get cleaner extraction (fewer noise items)
- [ ] Batch processing 7-9 meetings takes <5 minutes total attention
- [ ] Can always reprocess a light meeting for full extraction
- [ ] Recurring 1:1s don't repeat the same learnings week over week

## Out of Scope (for now)

- Agenda importance recommendations in meeting-prep skill (separate enhancement)
- ical-buddy organizer detection (lower priority, Google Calendar first)
- Configurable thresholds (start with sensible defaults, tune later)
- Importance inference for manually-added meetings (no calendar data)
