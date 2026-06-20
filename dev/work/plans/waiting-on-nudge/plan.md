# Waiting-On Nudge — surface outbound asks as ping tasks

**Status:** Exploration done, approach chosen, NOT yet built.
**Created:** 2026-06-10
**Owner:** John

## The problem (in one line)

When I ask someone a question (esp. Slack) and don't hear back quickly, I forget
about it. The system captures the ask but never turns it into something I'll act on.

## What I learned exploring (the actual state today)

The data is **not lost — it's stranded.** Capture already works:

- slack-digest extracts my outbound question as `kind: outgoing-ask`
  (`slack-digest/SKILL.md:699-711`).
- That maps to commitment direction **`they_owe_me`** (I asked → they owe me a reply)
  (`daily-winddown/SKILL.md:593-598`).
- On winddown approval it runs `arete commitments create --direction they_owe_me`,
  writing a real row to `.arete/commitments.json`
  (CLI: `packages/cli/src/commands/commitments.ts:161-175`;
  service: `packages/core/src/services/commitments.ts:950-1018`).
- slack-digest also adds a line to week.md under `## Waiting On`:
  `- [ ] <text> @person(<slug>) @from(commitment:<id>)` (`slack-digest/SKILL.md:435-438`).

**So half of the fix already exists.** The real gap: `## Waiting On` is a dead-end
list nothing acts on.

1. **week-plan ignores it** — only promotes `i_owe_them` >7d into priorities/tasks
   (`week-plan/SKILL.md:177-179`); `they_owe_me` is never surfaced as actionable.
2. **daily-plan can't even see it** — daily-plan only pulls incomplete tasks from the
   **Must/Should/Could** sections (`daily-plan/SKILL.md:139`) and scores
   `@from(commitment:)` +25 (`:140`). Waiting On lives in its own section, so it
   never enters daily scoring. Invisible to the daily flow.

Net: a `they_owe_me` row + a Waiting On line both exist, and neither plan ever turns
them into a thing I'll do.

## Chosen approach (the "easy" v1)

Extend the pattern week-plan *already* runs for `i_owe_them` (commitment → task with
`@from(commitment:)`, see `week-plan/LEARNINGS.md:80`, example `:292`) to cover
`they_owe_me`. Three pieces:

1. **Promotion rule** — for open `they_owe_me` commitments past an age threshold,
   emit a task into **Must/Should/Could** (NOT Waiting On) tagged `@from(commitment:id)`.
   Putting it in Tasks means daily-plan's existing +25 scoring surfaces it
   automatically — **no daily-plan change needed.** This is the elegant bit.
2. **Verb transform** — commitment text describes what *they* owe ("Anthony to send
   API spec"); the task must be the action *I* take: "ping Anthony re: API spec."
   New one-line prompt instruction (no action-verb mapping exists today).
3. **Age gate** — don't nudge day 1.

## Open decisions to make before building

- **Cadence ≠ 7 days.** The `i_owe_them` threshold is >7d; staleness scoring in
  `commitments.ts` is ≤7 low / 7–14 med / ≥14 high — tuned for the wrong rhythm.
  A Slack ask resolves in hours; "didn't hear back quickly" ≈ ~2 days. Pick the
  threshold for the waiting-on clock.
- **Capture-side importance filter (treat as part of v1, not later).** If *every*
  Slack question becomes a tracked `they_owe_me` → ping task, it floods. Most Slack
  asks resolve in minutes and shouldn't be captured at all. The gate belongs more at
  capture (importance / "is this load-bearing") than at surfacing. This is the
  difference between a useful nudge and a nag generator.
- **Dependency on the winddown ritual.** Persistence only happens if I approve the
  item in winddown; low-importance Slack asks get deferred and then never persist.
  This fix improves what happens *after* capture, not whether capture happens.

## Deferred (bigger, real fix — note for later, not v1)

**Slack auto-resolve.** The complete version detects the reply arrived and closes the
`they_owe_me` itself so it stops nagging. Precedent already exists: Phase 11 does this
for Gmail (`resolvedBy: 'auto-gmail'`, `resolvedEvidence`, `resolvedConfidence` already
on the Commitment entity). A Slack equivalent — gather checks the thread, sees their
reply, auto-resolves — ties directly into the per-source watermark / mini-pull work.
Bigger lift; schema is already built for it.

## NEXT STEP (start here Monday)

Sketch the exact prompt changes to **week-plan** (promotion rule + verb transform +
age gate) and decide where the **capture-side importance filter** sits (slack-digest
extraction vs. winddown staging). Then decide the age threshold number. Output of that
step = a concrete diff list of SKILL.md edits, ready to implement.

## Key files

- `packages/runtime/skills/slack-digest/SKILL.md` — capture (`:699-711`, `:435-438`)
- `packages/runtime/skills/daily-winddown/SKILL.md` — direction mapping (`:593-598`)
- `packages/runtime/skills/week-plan/SKILL.md` — surfacing rule (`:177-179`), template `:292`
- `packages/runtime/skills/week-plan/LEARNINGS.md` — commitment→task pattern (`:80`)
- `packages/runtime/skills/week-plan/templates/week-priorities.md` — `## Waiting On` (`:41-43`)
- `packages/runtime/skills/daily-plan/SKILL.md` — task pull (`:139`), commitment scoring (`:140`)
- `packages/cli/src/commands/commitments.ts:161-175` — `commitments create` CLI
- `packages/core/src/services/commitments.ts:950-1018` — `create()`; staleness scoring `:52-65`
- `packages/core/src/models/entities.ts:285-442` — Commitment entity (direction, resolvedBy, etc.)
