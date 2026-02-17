# Plans Directory

Persistent storage for plan lifecycle management. Plans are created and managed by the plan-mode Pi extension.

## Structure

```
dev/plans/
├── README.md                    # This file
├── slack-integration/
│   ├── plan.md                  # Plan with YAML frontmatter
│   ├── review.md                # Cross-model review output
│   ├── pre-mortem.md            # Pre-mortem analysis
│   └── prd.md                   # PRD (if generated)
└── search-perf-fix/
    └── plan.md
```

## Plan Frontmatter Format

```yaml
---
title: Slack Integration
slug: slack-integration
status: draft
size: large
created: 2026-02-16T15:00:00Z
updated: 2026-02-16T15:00:00Z
completed: null
blocked_reason: null
previous_status: null
has_review: false
has_pre_mortem: false
has_prd: false
backlog_ref: null
steps: 8
---
```

## Lifecycle Statuses

| Status | Description |
|--------|-------------|
| `draft` | Initial plan, not yet finalized |
| `planned` | PM confirmed plan is coherent |
| `reviewed` | Cross-model review completed |
| `approved` | All required gates passed, ready to build |
| `in-progress` | Build started via `/build` |
| `completed` | All tasks done, quality gates passed |
| `blocked` | Blocked with reason (from any status) |
| `on-hold` | Paused (from any status) |

## Migrated PRD Statuses (2026-02-16)

| Slug | Status |
|------|--------|
| agents-md-compilation | completed |
| dev-cleanup-phase-1 | completed |
| enhance-onboarding-tool | completed |
| intelligence-and-calendar | completed |
| meeting-agenda-skill | completed |
| meeting-intelligence | completed |
| meeting-propagation | completed |
| multi-ide-support | completed |
| pi-dev-workflow | completed |
| plan-lifecycle-system | completed |
| plan-mode-skills-integration | completed (superseded) |
| pm-planning-system | completed |
| product-os | on-hold |
| refactor-pi-monorepo | completed |
| rules-architecture-refactor | completed |
| temporal-memory | planned |

## Quick Reference

- **Create**: Use `/plan` mode, create a plan, then `/plan save`
- **List**: `/plan list`
- **Open**: `/plan open <slug>`
- **Next step**: `/plan next` (smart gate orchestrator)
- **Gates**: `/review`, `/pre-mortem`, `/prd`
- **Build**: `/build` (after approval)
- **Status**: `/plan status`
