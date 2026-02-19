# Plans Directory

Persistent storage for plan mode. Plans are created and managed by the plan-mode extension.

## Structure

```text
dev/plans/
├── README.md                    # This file
├── my-feature/
│   ├── plan.md                  # Plan with YAML frontmatter
│   ├── pre-mortem.md            # Optional pre-mortem output
│   ├── review.md                # Optional review output
│   └── prd.md                   # Optional PRD artifact
└── bug-fix-foo/
    └── plan.md
```

## Plan Frontmatter Format

```yaml
---
title: My Feature
slug: my-feature
status: draft
size: medium
created: 2026-02-16T15:00:00Z
updated: 2026-02-16T15:00:00Z
completed: null
has_review: false
has_pre_mortem: false
has_prd: false
backlog_ref: null
steps: 4
---
```

## Statuses

| Status | Description |
|--------|-------------|
| `draft` | Plan is being shaped/refined |
| `ready` | Plan approved and ready to build |
| `building` | Build started via `/build` |
| `complete` | Build finished |

## Commands (Plan Mode UX)

- `/plan` — Toggle plan mode on/off
- `/plan new` — Start a new plan session
- `/plan save [slug]` — Save the active plan
- `/plan rename <new-name>` — Rename the active plan
- `/plan list` — List saved plans
- `/plan open <slug>` — Open an existing plan
- `/plan status` — Show plan status + recommendations
- `/plan delete <slug>` — Delete a plan and artifacts
- `/pre-mortem` — Optional risk analysis artifact
- `/review` — Optional second-opinion artifact
- `/approve` — Mark draft as ready
- `/build` — Start execution

## Notes

- Plan mode is planning-focused, but editing/writing is allowed when needed.
- Pre-mortem and review are optional recommendations, not required gates.
- Existing legacy plan statuses are migrated automatically when loaded.
