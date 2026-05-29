# Person frontmatter — channel field convention (Phase 7a AC5)

Person files live at `people/{internal,users,customers}/<slug>.md`. The
YAML frontmatter holds identity + channel-style fields the workspace
uses to match a person across sources (meetings, Slack, email, calendar).

This document is **convention only**. There is no schema enforcement.
The CLI tolerates missing or extra fields. Parsers consult whichever
fields are present and skip the rest.

## Recognized channel fields

All fields are optional. Today (Phase 7a) **only `email` is consistently
populated** across `~/code/arete-reserv/people/internal/*.md`. The
other fields are documented here so when John (or a future reconciler)
backfills, the names are consistent.

```yaml
---
# Identity (existing — not part of AC5)
name: Alice Nguyen
slug: alice-nguyen
category: internal           # internal | users | customers

# Channel fields (Phase 7a AC5 convention)
email: alice@reserv.com      # primary email; already widely populated
alt_emails:                  # alternate / historical emails
  - alice@oldcompany.com
  - a.nguyen@personal.com
slack_user_id: U01ABC123     # canonical Slack ID; survives display-name changes
slack_handle: alice          # @-mention name; mutable (use slack_user_id for stable match)
phone: "+1-555-0100"         # E.164 format preferred
---
```

## Per-field semantics

| Field | Type | Notes |
|---|---|---|
| `email` | string | Primary email. Already widely populated; reconciler's most reliable cross-source key. |
| `alt_emails` | string[] | Alternate / historical emails. Useful when a person's domain changes (left a company, used personal email in past meetings). Each entry is a fully-qualified email. |
| `slack_user_id` | string | Canonical Slack user ID (e.g., `U01ABC123`). **Preferred** for Slack matching — survives display-name changes. Discoverable via Slack MCP's `slack_get_user_by_email`. |
| `slack_handle` | string | The user's @-mention handle (e.g., `alice`). Mutable; falls back when `slack_user_id` is absent. |
| `phone` | string | E.164 format preferred (`+1-555-0100`). Currently not consumed by any skill; reserved for future SMS / WhatsApp integration. |

## What a reconciler does with these fields

Phase 8's daily-winddown reconciler matches counterparties across
sources. The current heuristic priority is:

1. **Exact `email` match** — sender email matches `email` or any
   `alt_emails` entry → high-confidence person resolution.
2. **`slack_user_id` match** — Slack message author's user ID matches
   `slack_user_id` → high-confidence. Discoverable from the Slack MCP
   author metadata.
3. **`slack_handle` match** — Slack message author's handle matches
   `slack_handle` (best-effort; handles change).
4. **Name-string heuristic fallback** — fuzzy-match display name
   against person `name`. Lower confidence; reconciler routes match
   to `## Uncertain — your call` tier instead of auto-collapsing.

When a channel field is missing for a person, the corresponding
match-rule simply doesn't fire — there's no error. Phase 8's design
must accommodate "partial coverage" (most internal people have email
only; reconciler degrades gracefully to name-string heuristic).

## Workspace-wide health surface

To see which fields are populated workspace-wide, run:

```bash
arete people audit-channels --json
```

This returns the population gap (e.g., "23 of 41 internal people
missing `slack_user_id`; reconciler match-rate for slack→person is
~56%"). Phase 8's daily-winddown surfaces this gap as a one-line
nudge in the curated view when nontrivial. No backfill is forced;
the user decides when the value justifies the manual work.

## Backfill workflow (recommended)

Backfill is **user-maintained** today. There is no automated discovery
in 7a. A future phase may wire automated discovery via Slack MCP
`slack_get_user_by_email` (look up `slack_user_id` from an email),
Google Workspace directory (look up `phone` from name), and similar.

Manual backfill: edit `people/internal/<slug>.md`, add the fields
below the existing `email:` line, save. The next `arete people
audit-channels` run reflects the change.

## What's NOT a channel field

These fields exist in person frontmatter but are out of AC5 scope:

- `name`, `slug`, `category` — identity.
- `role`, `team`, `company` — organizational context.
- `last_interaction`, `relationship_health` — auto-managed by
  `arete people memory refresh`.
- Memory Highlights body section — auto-managed; do not edit by hand.

AC5's `audit-channels` and `--channels` flag only inspect the
five fields listed in the "Recognized channel fields" section.

## Related

- `dev/work/plans/arete-v2-chef-orchestrator/phase-7a-cross-skill-foundations/plan.md` § AC5 — the rationale and rollout.
- `packages/runtime/skills/PATTERNS.md` § "gather-only composition" — how the reconciler consumes channel fields.
- `packages/cli/src/commands/people.ts` — implementation of `--channels` flag and `audit-channels` subcommand.
