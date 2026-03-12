# Plan File Format

Plans are stored as markdown files with YAML frontmatter at `dev/work/plans/{slug}/plan.md`.

## Creating Plans

**Preferred**: Use the plan-mode extension commands:
- `/plan new [name]` — Create a new plan
- `/plan save [name]` — Save the current plan

**Auto-save**: When plan mode is active and you produce numbered steps under a "Plan:" header, the extension auto-saves with correct frontmatter.

**Do not manually write plan.md files** unless you understand the full schema below. The extension handles frontmatter creation, status transitions, and artifact tracking automatically.

---

## Frontmatter Schema

```yaml
---
title: "Human-readable plan title"
slug: kebab-case-slug
status: draft
size: small
tags: [optional, tags]
created: "2026-03-10T15:30:00.000Z"
updated: "2026-03-10T16:45:00.000Z"
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 3
---
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Human-readable title (can include spaces, punctuation) |
| `slug` | string | Kebab-case identifier, matches the folder name |
| `status` | enum | Lifecycle status (see below) |
| `size` | enum | Plan complexity estimate (see below) |
| `created` | ISO timestamp | When the plan was created |
| `updated` | ISO timestamp | When the plan was last modified |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `tags` | string[] | `[]` | Categorization tags |
| `completed` | ISO timestamp \| null | `null` | When the plan was completed/abandoned |
| `execution` | string \| null | `null` | Reserved for execution tracking |
| `has_review` | boolean | `false` | Whether `review.md` artifact exists |
| `has_pre_mortem` | boolean | `false` | Whether `pre-mortem.md` artifact exists |
| `has_prd` | boolean | `false` | Whether `prd.md` artifact exists |
| `steps` | number | `0` | Number of plan steps (auto-counted) |

---

## Valid Values

### Status

| Value | Description |
|-------|-------------|
| `idea` | Initial capture, not yet shaped |
| `draft` | Being actively shaped/planned |
| `planned` | Plan is complete, ready for approval |
| `building` | Execution in progress |
| `complete` | Successfully finished |
| `abandoned` | Intentionally stopped |

**Lifecycle**: `idea` → `draft` → `planned` → `building` → `complete`

### Size

| Value | Steps | Recommendation |
|-------|-------|----------------|
| `tiny` | 1-2 | Execute directly |
| `small` | 2-3 | Consider pre-mortem |
| `medium` | 3-5 | Recommend pre-mortem, consider PRD |
| `large` | 6+ | Strongly recommend pre-mortem + PRD |
| `unknown` | — | Not yet classified |

---

## Plan Content Format

After the frontmatter, include the plan content with numbered steps:

```markdown
---
(frontmatter)
---

# Plan Title

## Goal
One sentence describing what this achieves.

## Context
Why this matters, what problem it solves.

## Plan

1. **First step** — Description of what to do
   - Acceptance: How to verify it's done

2. **Second step** — Description
   - Acceptance: Verification criteria

3. **Third step** — Description
   - Acceptance: Verification criteria

## Risks
- Risk 1 and mitigation
- Risk 2 and mitigation

## Out of Scope
- What we're explicitly NOT doing
```

---

## Artifacts

Plans can have associated artifacts in the same directory:

| File | Created by | Purpose |
|------|------------|---------|
| `plan.md` | `/plan save` | The plan itself |
| `review.md` | `/review` | Cross-model review output |
| `pre-mortem.md` | `/pre-mortem` | Risk analysis |
| `prd.md` | `/prd` | Full PRD for autonomous execution |
| `prd.json` | `prd-to-json` skill | Task list for execute-prd |
| `notes.md` | `save_plan_artifact` tool | General notes |

---

## Example

```markdown
---
title: "Add Calendar Integration"
slug: add-calendar-integration
status: planned
size: medium
tags: [integration, calendar]
created: "2026-03-10T10:00:00.000Z"
updated: "2026-03-10T14:30:00.000Z"
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 4
---

# Add Calendar Integration

## Goal
Enable users to see upcoming meetings in their workspace briefings.

## Plan

1. **Create calendar adapter interface** — Define the abstraction for calendar providers
   - Acceptance: Interface supports list events, get event, check availability

2. **Implement Apple Calendar provider** — Use icalBuddy for macOS Calendar access
   - Acceptance: Can fetch today's events, handles errors gracefully

3. **Add pull calendar command** — CLI command to sync calendar events
   - Acceptance: `arete pull calendar` works, events stored in workspace

4. **Integrate with brief command** — Include upcoming meetings in briefings
   - Acceptance: `arete brief --for "meeting with X"` shows relevant calendar context

## Risks
- icalBuddy may not be installed → Provide clear error message and install instructions
- Calendar permissions on macOS → Document required permissions

## Out of Scope
- Google Calendar (future phase)
- Creating/modifying events (read-only for now)
```

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `/plan` | Toggle plan mode |
| `/plan new [name]` | Start a new plan |
| `/plan list` | List plans (`--ideas`, `--active`) |
| `/plan open <slug>` | Open a saved plan |
| `/plan save [name]` | Save the current plan |
| `/plan rename <name>` | Rename the current plan |
| `/plan close` | Close the current plan |
| `/plan status` | Show lifecycle info |
| `/plan delete` | Delete the current plan |
| `/plan archive` | Archive as complete/abandoned |
| `/review` | Run cross-model review |
| `/pre-mortem` | Run pre-mortem analysis |
| `/prd` | Convert plan to PRD |
| `/approve` | Mark plan as ready |
| `/build` | Start execution |
| `/wrap` | Close-out checklist |
