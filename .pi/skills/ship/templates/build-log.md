# Build Log: {slug}

<!-- 
  This template tracks inter-session state for /ship workflows.
  Created by Phase 0; updated by each phase.
  Authoritative for: phase progress, decisions, session history.
  See SKILL.md "Authority Model" for relationship with status.json/progress.md.
-->

## Build Context

<!-- Fill these values when creating the log -->

| Field | Value |
|-------|-------|
| Type | ship |
| Skill | [.pi/skills/ship/SKILL.md](.pi/skills/ship/SKILL.md) |
| Plan | [dev/work/plans/{slug}/plan.md](dev/work/plans/{slug}/plan.md) |
| PRD | [dev/work/plans/{slug}/prd.md](dev/work/plans/{slug}/prd.md) |
| Branch | `feature/{slug}` |
| Worktree | `../arete.worktrees/{slug}` |
| Created | {ISO timestamp} |

## Current Status

<!-- Update this block atomically on each phase transition -->

**Phase**: 0 — Initialize Build Log
**State**: NOT_STARTED
**Last Update**: {ISO timestamp}

<!-- Add Reason field if State is BLOCKED or FAILED:
**Reason**: {description of blocker or failure}
-->

> **Resuming?** Load the linked skill, read Progress below for context, continue from current phase.

---

## Progress

<!-- INSERT NEW SESSION HERE -->

### Session 1

**Started**: {ISO timestamp}

<!-- 
  Phase entries go here. Format:
  
  #### Phase X.Y: {Phase Name} {marker}
  **Started**: {timestamp}
  **Completed**: {timestamp}
  **Outcome**: {1-2 sentence summary}
  **Decisions**: (optional, only if gate decisions were made)
  - {decision made}
  **Artifacts**: (optional, only if files were created)
  - `{artifact path}`
  
  Markers: ✓ (complete), ⏳ (in progress), ✗ (failed), ⏸ (blocked)
-->

<!-- 
  When a session ends mid-phase, add:
  [session ended here]
  
  On resume, a new session header will be inserted at INSERT NEW SESSION HERE.
-->
