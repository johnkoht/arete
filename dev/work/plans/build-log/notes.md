# Build Log — Plan Notes (Revised)

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

...
```

### Status Block Format

```
**Phase**: 4.1 — Execute PRD
**State**: IN_PROGRESS
**Last Update**: 2026-03-28T14:30:00Z
```

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

## Plan

### V1 Scope: Ship Skill Only

1. **Create build-log template**
   - Add `.pi/skills/ship/templates/build-log.md` with full schema above
   - Include Build Context table, Current Status block, Progress section
   - AC: Template matches schema spec; all placeholder fields documented

2. **Add Phase 0 to ship skill**
   - Insert "Initialize or Resume Build Log" before Phase 1 in SKILL.md
   - On invocation:
     - Check for `dev/executions/{slug}/build-log.md`
     - If exists + State != COMPLETE → resume mode (read log, display summary, continue from current phase)
     - If exists + State == COMPLETE → warn "already complete, re-run?"
     - If not exists → create from template, proceed to Phase 1
   - AC: `/ship {slug}` on stale build displays resume summary and continues correctly

3. **Add verification to Phase 0**
   - Before resuming, sanity-check that logged state matches artifacts:
     - If log says "Phase 1.2 complete" → verify pre-mortem.md exists
     - If log says "Phase 3.1 complete" → verify worktree exists
   - If mismatch: warn and ask user how to proceed
   - AC: Stale/corrupt log doesn't cause silent failures

4. **Update all ship phases to write progress entries**
   - Each phase: write Started entry on begin, Completed entry on finish
   - Update Current Status atomically on each transition
   - On gate pause (BLOCKED): write reason to Current Status
   - AC: After each phase, build-log.md reflects accurate state

5. **Add session boundary handling**
   - When Phase 0 detects resume: append session marker before continuing
   - Include: Started timestamp, Resumed From phase, optional Resolution note
   - AC: Multiple sessions clearly distinguishable in log

6. **Document in AGENTS.md and ship skill**
   - Add build-log.md to `[Workspace]` section
   - Add resume workflow to `[Workflows]`
   - Update ship skill Recovery section to reference build-log
   - AC: Documentation complete; recovery section updated

### Future (V2)

- Extend to execute-prd skill (with nesting consideration: ship owns log, execute-prd writes to progress.md)
- Extend to hotfix skill
- Extract Phase 0 to shared include if patterns stabilize
- Add `/build status` CLI command

---

## Nesting: Ship + Execute-PRD

When ship invokes execute-prd in Phase 4:
- **Ship owns build-log.md** — writes "Phase 4.1: Execute PRD started/completed"
- **Execute-prd writes to status.json + progress.md** — task-level detail
- Resuming agent reads build-log → sees Phase 4 in progress → reads status.json for task state

This preserves separation: build-log is phase-level, status.json is task-level.

---

## Out of Scope (V1)

- `/build status` CLI command
- Execute-prd integration
- Hotfix integration
- Shared Phase 0 include extraction
- Automatic conflict resolution between build-log and artifacts

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

## Size Estimate

**Small-Medium (6 steps)** — Core changes are in one skill file + template. Recommend `/pre-mortem` given this touches the critical ship workflow.

## Risks

1. **Log corruption** — Agent crashes mid-write, log is malformed
   - Mitigation: Verification step in Phase 0; keep writes atomic (full block replacement)

2. **Authority confusion** — Agent reads status.json instead of build-log for phase state
   - Mitigation: Clear authority model in docs; build-log links to skill which explains

3. **Scope creep to other skills** — Temptation to "just add hotfix too"
   - Mitigation: Explicit V2 section; PR review should flag
