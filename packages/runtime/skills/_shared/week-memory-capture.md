# Week-memory capture rule

Shared spec referenced by week-plan, daily-plan, and daily-winddown via a `## Capture Rule` link. Week memory is the small, agent-managed store of *interpretive overrides* for the current week — corrections, deprioritizations, and week-shape constraints. It is written and pruned by agents through `arete week-memory`, lives in `now/week-memory.md`, and is NOT the sacred user-owned `## Notes` section and NOT part of `week.md`.

## The test

Capture a correction ONLY when it changes how the system should interpret or surface something going forward — not when it merely edits the plan's text.

**"Would a fresh daily-plan agent, reading only the vault, re-derive this wrong tomorrow?"** Yes → capture. No → do not.

Capture on **correction, not on importance.** Importance is subjective and is exactly how junk drawers form. Corrections are self-selecting: rare, high-signal, already made explicitly in conversation. Record "John told me my read was wrong, here's the corrected version and why."

## The three entry types (the only things that qualify)

- `framing-override` — corrects the system's inference about an item (e.g. "not overdue — it's a proactive Wednesday update"). Carries a `suppresses` target (preferably the commitment id, free text as fallback) so daily-plan knows what NOT to surface.
- `deprioritization` — a punt/defer with a reason and an owner (e.g. "analytics → Josiah's court, OK to slip past PTO").
- `week-constraint` — a fact that shapes the whole week's lens (e.g. "3-day pre-PTO sprint, OOO 6/25–30, Lindsay back 6/29 — leave nothing that stalls").

## Non-examples (do NOT capture)

- **"Reword priority 3"** — a plain plan-text edit. It lives in `week.md` and dies with it; a fresh agent reads the reworded text directly. The "re-derivable wrong?" test fails → do not capture.
- **"Call it 'Liability PRD', not 'liability doc'"** — a terminology/vocabulary preference with no interpretive override. A fresh agent reading `week.md` already sees the correct term, so there is nothing to suppress. This is the most likely over-capture drift path into `framing-override`, so it is named explicitly: do NOT capture.

## Worked example — 6/22 week-plan (exactly 4 entries)

| type | statement | suppresses |
|------|-----------|------------|
| `framing-override` | Lindsay email is NOT overdue — it's a proactive Wednesday update | the Lindsay commitment (id; free-text "Lindsay email" fallback) |
| `deprioritization` | Analytics is in Josiah's court — fine to slip past PTO | — |
| `deprioritization` | Liability PRD punts to my return from PTO | — |
| `week-constraint` | 3-day pre-PTO sprint; OOO 6/25–30; Lindsay back 6/29 — leave nothing that stalls | — |

The Lindsay reword, a "rename liability doc" vocabulary note, or any priority-text edit from the same session do NOT become entries.
