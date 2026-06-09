# now/archive/ — what lives here

The `now/archive/` directory holds **chef-curated views** from skill invocations + their **deferred-item sidecars**. It is NOT the durable wiki — that lives in `resources/notes/`, `.arete/memory/`, and the meeting/people files.

## Convention (Phase 3.5 followup-2)

Each chef-pattern skill writes to its own subdirectory:

```
now/archive/
├── daily-winddown/
│   ├── winddown-YYYY-MM-DD.md      ← chef-curated view from each /daily-winddown run
│   └── deferred-YYYY-MM-DD.md       ← items deferred that day (sidecar)
│
├── weekly-winddown/
│   ├── weekly-winddown-YYYY-MM-DD.md
│   └── deferred-week-YYYY-Wnn.md
│
├── week-plan/
│   ├── week-plan-YYYY-MM-DD.md
│   └── deferred-week-YYYY-Wnn.md
│
├── process-meetings/
│   └── process-meetings-YYYY-MM-DD.md
│
├── slack-digest/
│   └── slack-digest-YYYY-MM-DD.md   ← chef-curated REVIEW of the digest run
│                                       (the durable digest lives in resources/notes/)
│
├── meeting-prep/
│   └── meeting-prep-YYYY-MM-DD.md
│
├── inbox-triage/
│   └── inbox-triage-YYYY-MM-DD.md
│
├── email-triage/
│   └── email-triage-YYYY-MM-DD.md
│
├── schedule-meeting/
│   └── schedule-meeting-{slug}-YYYY-MM-DD.md
│
└── week-md/
    └── week-YYYY-Wnn.md             ← snapshot of now/week.md when the week rotates
```

## What each artifact is

**`<skill>-YYYY-MM-DD.md`** — the curated view the chef agent showed the user during that skill invocation. Captures: staged items, reason labels, Uncertain tier, proposed actions, "Closed today" trace (Phase 8 only). Audit trail for "what did the chef do that run."

**`deferred-*.md` sidecars** — items the chef judged low-stage-value and rolled out of the primary view. Threshold is ≥3 items per Phase 3.5 followup-3 (daily); weekly uses ISO week numbering. Pull items back by removing `[[defer]]` or adding `[[pull-back]]`; next run logs a `deferral_disagreement` event.

**`week-md/week-YYYY-Wnn.md`** — snapshot of `now/week.md` when the week rotates. Captures the as-shipped state of the week for retrospective lookup.

## Where is this NOT the source of truth?

Several places. Don't read these archives for:

- **Slack digest content** — lives in `resources/notes/<date>-slack-digest.md` (durable; integrated into topic pages by `arete topic refresh`). The `slack-digest/` archive is the chef's REVIEW surface, not the digest itself.
- **Decisions / learnings** — live in `.arete/memory/items/decisions.md` and `learnings.md` (durable; appended by `arete meeting approve`).
- **Commitments** — live in `.arete/commitments.json` (durable).
- **Meeting summaries** — live in `resources/meetings/<file>.md` (durable extract output).
- **Topic pages** — live in `.arete/memory/topics/<slug>.md` (durable wiki).

The archive is REVIEW SURFACE. The durable signal lives in the locations above.

## Retention guidance

**Operational need**: ~8-14 days. Phase 8's daily-winddown Step 0.6 reads the prior winddown for unactioned-resolve detection; followup-3's prerequisite check uses an 8-day window. Beyond that, the chef doesn't read these files.

**Audit need**: subjective. Useful for "what did I plan three weeks ago?" reflection. Beyond ~60 days, the durable signal has captured anything load-bearing (item-fates.jsonl, commitments.json, decisions.md, meeting files).

**Recommendation**: keep ~60-90 days. Beyond that, files are safe to remove. Storage cost is trivial (~5-50KB per file; a year totals 5-10MB) so retention is convenience, not pressure.

**Manual purge** (when you want it):

```bash
# Remove curated views older than 60 days (preserves sidecars + week-md)
find now/archive -name "winddown-*.md" -mtime +60 -delete
find now/archive -name "week-plan-*.md" -mtime +60 -delete
find now/archive -name "process-meetings-*.md" -mtime +60 -delete
find now/archive -name "slack-digest-*.md" -mtime +60 -delete
find now/archive -name "meeting-prep-*.md" -mtime +60 -delete
find now/archive -name "inbox-triage-*.md" -mtime +60 -delete
find now/archive -name "email-triage-*.md" -mtime +60 -delete
find now/archive -name "schedule-meeting-*.md" -mtime +60 -delete

# Or sweep the whole archive (more aggressive)
find now/archive -name "*.md" -mtime +90 -delete
```

No auto-purge ships today. If user wants automation, a future `arete archive purge --older-than 60d` verb could ship — flag as a feature request if you find yourself wanting it.

## What's NOT in the convention (cleanup candidates)

If you see any of these at `now/archive/` root or workspace root, they're pre-Phase-3.5-followup-2 stragglers or ad-hoc agent dumps:

- **Loose `week-YYYY-WNN.md` or `<date>-week-N.md` files at archive root** — pre-unification. Move to `week-md/` or just leave as historical.
- **`channel-backfill/`, `*-backfill/`, `*-findings/`** directories — project-agent investigative dumps; not chef-pattern artifacts. Clean up once the underlying task completes.
- **`deferred-*.md` at workspace root** (not under `now/archive/<skill>/`) — pre-unification chef sidecars. Move to the correct subdir or delete.

The chef pattern post-followup-2 writes nothing outside `now/archive/<skill>/`. Anything outside that shape is human/project-agent work.
