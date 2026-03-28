---
title: Build Log
slug: build-log
status: building
size: large
tags: []
created: 2026-03-28T03:27:36.149Z
updated: 2026-03-28T04:54:21.700Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 6
---

# Build Log for Ship Workflow

## Problem

When a `/ship` session stalls (killed, timeout, error), a new agent has no structured way to resume. They must infer state from scattered artifacts (`dev/work/plans/{slug}/`, `dev/executions/{slug}/status.json`, worktree existence). We need explicit state tracking that enables seamless handoff between sessions.

## Solution

Introduce `build-log.md` as the **human-readable inter-session handoff artifact** for the `/ship` workflow. It's the single file a resuming agent reads to understand where we are, what decisions were made, and how to continue.

### Authority Model

| File | Purpose | Authoritative For |
|------|---------|-------------------|
| `build-log.md` | Inter-session handoff, human-readable | Phase progress, decisions, session history |
| `status.json` | Machine state for execute-prd | Task-level progress within Phase 4 |
| `progress.md` | Detailed task execution log | Developer reflections, iteration details |

**Resolution rule**: build-log.md is authoritative for "which phase are we in." When resuming, agent reads build-log first, then dives into status.json/progress.md for Phase 4 details if needed.

### Nesting: Ship + Execute-PRD

When ship invokes execute-prd in Phase 4:
- **Ship owns build-log.md** — writes "Phase 4.1: Execute PRD started/completed"
- **Execute-prd writes to status.json + progress.md** — task-level detail
- Resuming agent reads build-log → sees Phase 4 in progress → reads status.json for task state

This preserves separation: build-log is phase-level, status.json is task-level.

---

## Build Log Schema

### Full Template

```markdown
# Build Log: {slug}

## Build Context
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
**Phase**: {phase number} — {phase name}
**State**: {NOT_STARTED | IN_PROGRESS | BLOCKED | COMPLETE | FAILED}
**Last Update**: {ISO timestamp}

<!-- If BLOCKED or FAILED, add: -->
**Reason**: {description of blocker or failure}

> **Resuming?** Load the linked skill, read Progress below for context, continue from current phase.

---

## Progress

### Session 1
**Started**: {ISO timestamp}

#### Phase 1.1: Save Plan ✓
**Completed**: {timestamp}
**Outcome**: Saved to dev/work/plans/{slug}/plan.md

#### Phase 1.2: Pre-Mortem ✓
**Completed**: {timestamp}
**Outcome**: {N} risks identified ({N} CRITICAL, {N} HIGH, {N} MEDIUM)
**Decisions**:
- CRITICAL: {risk} → {mitigation added}
**Artifacts**: `dev/work/plans/{slug}/pre-mortem.md`

#### Phase 1.3: Review ⏳
**Started**: {timestamp}
[session ended here]

---

### Session 2
**Started**: {ISO timestamp}
**Resumed From**: Phase 1.3 (IN_PROGRESS)

#### Phase 1.3: Review ✓ (continued)
**Completed**: {timestamp}
**Outcome**: No structural blockers. 3 suggestions noted.
**Artifacts**: `dev/work/plans/{slug}/review.md`
```

### Status Block Format

Valid states:
- `NOT_STARTED` — Phase hasn't begun
- `IN_PROGRESS` — Phase actively running
- `BLOCKED` — Waiting on human (gate pause)
- `COMPLETE` — Phase finished successfully  
- `FAILED` — Phase failed, needs intervention

### Progress Entry Format

Each phase writes:
1. **On start**: `**Started**: {timestamp}` line, update Current Status to IN_PROGRESS
2. **On complete**: Full entry with Outcome, Decisions (if any), Artifacts, Next phase

Markers: `✓` (complete), `⏳` (in progress), `✗` (failed), `⏸` (blocked)

---

## Out of Scope (V1)

- `/build status` CLI command
- Execute-prd integration (V2)
- Hotfix integration (V2)
- Shared Phase 0 include extraction
- Automatic conflict resolution between build-log and artifacts

## Risks

1. **Log corruption** — Agent crashes mid-write, log is malformed
   - Mitigation: Verification step in Phase 0; keep writes atomic (full block replacement)

2. **Authority confusion** — Agent reads status.json instead of build-log for phase state
   - Mitigation: Clear authority model in docs; build-log links to skill which explains

3. **Scope creep to other skills** — Temptation to "just add hotfix too"
   - Mitigation: Explicit V2 section; PR review should flag

---

## Acceptance Criteria (Overall)

- [ ] New agent can `/ship {slug}` on stalled build and resume seamlessly
- [ ] Build Context links to skill, plan, PRD, branch, worktree
- [ ] Current Status shows phase, state, timestamp, reason (if blocked/failed)
- [ ] Progress entries capture outcomes and decisions, not just status
- [ ] Session boundaries clearly marked
- [ ] Verification catches log/artifact mismatches before resuming
- [ ] Documentation updated

---

## Future (V2)

- Extend to execute-prd skill (with nesting consideration: ship owns log, execute-prd writes to progress.md)
- Extend to hotfix skill
- Extract Phase 0 to shared include if patterns stabilize
- Add `/build status` CLI command

---

Plan:
1. **Create build-log template** at `.pi/skills/ship/templates/build-log.md`. Include Build Context table, Current Status block, Progress section with session markers. Use schema above. AC: Template matches schema spec; all placeholder fields have comments explaining what to fill.

2. **Add Phase 0 "Initialize or Resume Build Log"** to ship skill before Phase 1 in SKILL.md. On invocation: check for `dev/executions/{slug}/build-log.md`. If exists + State ≠ COMPLETE → resume mode (read log, display summary, continue from current phase). If exists + State = COMPLETE → warn "already complete, re-run?" and require confirmation. If not exists → create from template, proceed to Phase 1. AC: `/ship {slug}` on stalled build displays resume summary and continues correctly from the logged phase.

3. **Add verification to Phase 0** that sanity-checks logged state matches actual artifacts before resuming. If log says Phase 1.2 complete → verify pre-mortem.md exists. If log says Phase 2.2 complete → verify prd.md and prd.json exist. If log says Phase 3.1 complete → verify worktree directory exists. If mismatch: warn with specific discrepancy, offer fix/abort. AC: Stale or corrupt log does not cause silent failures; mismatches surface clearly with actionable options.

4. **Update all ship phases to write progress entries**. Each phase writes Started entry with timestamp on begin. Each phase writes Completed entry with Outcome, Decisions (if any), and Artifacts on finish. Update Current Status block atomically on each state transition. On gate pause → set State to BLOCKED and write Reason to Current Status. AC: After each phase completes, build-log.md reflects accurate state; no phase completes without corresponding log update.

5. **Add session boundary handling** to Phase 0. When resume is detected, append session marker before continuing work. Session marker includes: Started timestamp, Resumed From phase and state, optional Resolution note explaining what changed since last session. AC: Multiple sessions are clearly distinguishable in the log; full session history is preserved and readable.

6. **Document in AGENTS.md and ship skill**. Add build-log.md to the Workspace section as a build artifact. Add resume workflow to the Workflows section explaining how to continue stalled builds. Update ship skill Recovery section to reference build-log as the primary resume mechanism instead of manual artifact inspection. AC: Documentation is complete and accurate; a new agent can find resume instructions without reading the full skill file.