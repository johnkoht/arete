# Meeting Enhancements — Design Notes

## Discussion Summary (2026-03-07)

### The Core Question
How do we unify the meeting lifecycle while preserving flexibility for users who:
- A. Use external tools for agenda/notes (Notion, Asana, etc.)
- B. Want to export final notes to other systems (Linear, Notion, etc.)

### Design Decision: Separate Meeting Intelligence from Meeting Content

**Meeting Entity** (always in Areté):
- Metadata: title, date, attendees, calendar_id
- Relationships: project, people, goals
- State: `scheduled → prep → active → processed`
- Content source: `native | notion | linear | ...`

**Content** (pluggable):
- V1: Native markdown in `resources/meetings/`
- Future: Notion adapter, Linear adapter, etc.

### Key Architecture Insight

```
┌─────────────────────────────────────────────────────────┐
│  Meeting Entity (always in Areté)                       │
│  - metadata: title, date, attendees, calendar_id        │
│  - relationships: project, people, goals                │
│  - state: scheduled → prep → active → processed         │
│  - content_source: native | notion | linear | ...       │
└─────────────────────────────────────────────────────────┘
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
    ┌──────────────┐           ┌──────────────────┐
    │ Native Store │           │ External Adapter │
    │ (v1 - now)   │           │ (v2 - later)     │
    │              │           │                  │
    │ resources/   │           │ notion://page-id │
    │ meetings/    │           │ linear://doc-id  │
    └──────────────┘           └──────────────────┘
```

### Merge Agendas and Meetings

A meeting is **one lifecycle**, not separate artifacts:

| Phase | Content |
|-------|---------|
| **Pre** | Agenda, prep notes, context (auto-injected) |
| **During** | Live notes in same doc |
| **Post** | Transcript sync, processed summary, action items |

The agenda isn't a separate thing — it's the pre-meeting state of the meeting document.

### Solving the External Tools Problem

**A. Users use external tools for agenda/notes:**
- *Opinionated v1:* Areté is the working surface. Use our editor.
- *Future flexibility:* Content adapter pattern. Meeting entity has `content_source: notion://page-id`. When you prep or process, we pull from that source.

**B. Users want to export to other systems:**
- *Opinionated v1:* "Export to..." action after processing. Format output for target system (Linear doc, Notion page, Asana task).
- *Future flexibility:* Bidirectional sync where meeting is linked to a Notion page. Complex — defer until users scream for it.

### Meeting Frontmatter (enhanced)

```yaml
title: Customer Sync
date: 2026-03-07T10:00
attendees: [sarah-chen, mike-johnson]
calendar_id: abc123
project: customers/acme
state: processed
content_source: native  # or: notion://page-id
exports:
  - type: linear
    doc_id: LIN-456
    synced_at: 2026-03-07T11:30
```

### Dependencies on Reimagine v2

- **V2-5 (Markdown Editor)**: Already planned — TipTap integration. This becomes the meeting notes editor.
- Meeting page in web app needs the same treatment as Person detail page (V2-3): full page with rich layout.

### Open Questions

1. How does calendar pull create meetings? Currently just creates files — should it pre-populate the entity with `state: scheduled`?
2. Krisp sync flow: how does user match a recording to a meeting? Auto-match by time? Picker UI?
3. What's the minimum viable editor polish for v1 meetings? Is V2-5 sufficient?
