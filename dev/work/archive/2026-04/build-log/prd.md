# PRD: Build Log for Ship Workflow

**Version**: 1.0  
**Status**: Ready for Execution  
**Date**: 2026-03-28  
**Branch**: `feature/build-log`  
**Depends on**: Ship skill, plan-mode extension

---

## 1. Problem & Goals

### Problem

When a `/ship` session stalls (killed, timeout, error), a new agent has no structured way to resume. They must infer state from scattered artifacts:
- `dev/work/plans/{slug}/` for plan artifacts
- `dev/executions/{slug}/status.json` for task-level state
- Worktree existence for environment state

This leads to:
1. **Wasted work** — Resuming agent may re-run completed phases
2. **Lost context** — Decisions made during the session aren't captured
3. **Silent failures** — Agent continues from wrong state, causes conflicts

### Goals

1. **Seamless resume**: New agent can `/ship {slug}` on stalled build and continue correctly
2. **Decision capture**: Outcomes and decisions recorded per phase, not just status
3. **Session tracking**: Multiple sessions clearly distinguishable in the log
4. **Verification**: Catch log/artifact mismatches before they cause silent failures

### Out of Scope (V1)

- `/build status` CLI command
- Execute-prd integration (execute-prd writes to its own progress.md)
- Hotfix skill integration
- Shared Phase 0 include extraction
- Automatic conflict resolution between build-log and artifacts

### Authority Model

| File | Purpose | Authoritative For |
|------|---------|-------------------|
| `build-log.md` | Inter-session handoff | Phase progress, decisions, session history |
| `status.json` | Machine state for execute-prd | Task-level progress within Phase 4 |
| `progress.md` | Detailed task execution log | Developer reflections, iteration details |

**Rule**: build-log.md is authoritative for "which phase are we in." Resuming agent reads build-log first, then dives into status.json/progress.md for Phase 4 details if needed.

---

## 2. Architecture Decisions

### Build Log Location

```
dev/executions/{slug}/build-log.md
```

Created from template at `.pi/skills/ship/templates/build-log.md`.

### Phase 0: Initialize or Resume

New phase inserted before Phase 1:
1. Check for existing build-log.md
2. If exists + State ≠ COMPLETE → resume mode
3. If exists + State = COMPLETE → warn and require confirmation
4. If not exists → create from template

### Nesting: Ship + Execute-PRD

When ship invokes execute-prd in Phase 4:
- **Ship owns build-log.md** — writes "Phase 4.1: Execute PRD started/completed"
- **Execute-prd writes to status.json + progress.md** — task-level detail

### Progress Entry Format

Each phase writes:
- **On start**: `**Started**: {timestamp}` line, update Current Status to IN_PROGRESS
- **On complete**: Full entry with Outcome, Decisions (if any), Artifacts

Markers: `✓` (complete), `⏳` (in progress), `✗` (failed), `⏸` (blocked)

---

## 3. User Stories / Tasks

### Task 1: Create Build Log Template

**Description**: Create the build-log template at `.pi/skills/ship/templates/build-log.md` implementing the full schema from the plan.

**Changes**:
- Create `.pi/skills/ship/templates/build-log.md`
- Include Build Context table with Type, Skill link, Plan link, PRD link, Branch, Worktree, Created timestamp
- Include Current Status block with Phase, State, Last Update, optional Reason
- Include Progress section with session markers and phase entry structure
- Add insertion-point comments for agents (per review suggestion)

**Acceptance Criteria**:
- [ ] Template exists at `.pi/skills/ship/templates/build-log.md`
- [ ] Template matches schema from plan (Build Context, Current Status, Progress sections)
- [ ] All placeholder fields have comments explaining what to fill
- [ ] `<!-- INSERT NEW SESSION HERE -->` comment present for agent guidance

---

### Task 2: Add Phase 0 to Ship Skill

**Description**: Insert Phase 0 "Initialize or Resume Build Log" before Phase 1 in SKILL.md with full initialization and resume logic.

**Changes**:
- Add `## Phase 0: Initialize Build Log` section before Phase 1 in SKILL.md
- Add Phase 0.1: Check for existing build-log.md
- Add Phase 0.2: Create new OR resume existing
- Add Phase 0.3: Display resume summary if resuming

**Logic**:
```
If dev/executions/{slug}/build-log.md exists:
  If State = COMPLETE → warn "already complete", require confirmation to re-run
  If State ≠ COMPLETE → resume mode:
    - Display current phase and last update
    - Show session history count
    - Continue from current phase
Else:
  Create build-log.md from template
  Set Phase 1.1, State NOT_STARTED
  Proceed to Phase 1
```

**Acceptance Criteria**:
- [ ] Phase 0 section exists in SKILL.md before Phase 1
- [ ] Running `/ship {slug}` on stalled build displays resume summary
- [ ] Running `/ship {slug}` on stalled build continues from logged phase
- [ ] Running `/ship {slug}` on completed build warns and requires confirmation
- [ ] New builds create build-log.md from template

---

### Task 3: Add Verification to Phase 0

**Description**: Add sanity-checks in Phase 0 that verify logged state matches actual artifacts before resuming.

**Changes**:
- Add verification step after resume detection
- Check phase→artifact mappings (document in SKILL.md):
  - Phase 1.2 (Pre-Mortem) → `dev/work/plans/{slug}/pre-mortem.md` exists
  - Phase 2.2 (Convert to PRD) → `dev/work/plans/{slug}/prd.md` and `prd.json` exist
  - Phase 3.1 (Create Worktree) → worktree directory exists at `../{repo}.worktrees/{slug}`
- On mismatch: warn with specific discrepancy, offer options (fix log, fix artifacts, abort)

**Acceptance Criteria**:
- [ ] Verification checks run on resume before continuing
- [ ] Phase→artifact mapping documented in Phase 0 section
- [ ] Uses phase names not just numbers (e.g., "Phase 1.2 (Pre-Mortem)")
- [ ] Mismatch produces clear warning with actionable options
- [ ] Stale or corrupt log does not cause silent failures

---

### Task 4: Update Ship Phases to Write Progress

**Description**: Update all ship phases (1.x through 5.x) to write progress entries to build-log.md.

**Changes**:
- Each phase section gets "Build Log Update" instructions
- On phase start: Write `**Started**: {timestamp}` entry, update Current Status to IN_PROGRESS
- On phase complete: Write full entry (Outcome, Decisions if any, Artifacts), update Current Status
- On gate pause: Set State to BLOCKED, write Reason to Current Status

**Phases to update** (grep output shows 17 phase sections):
- Phase 1.1, 1.2, 1.3
- Phase 2.1, 2.2, 2.3
- Phase 3.1, 3.2
- Phase 4.1, 4.2
- Phase 5.1, 5.2, 5.3, 5.4, 5.5, 5.6

**Acceptance Criteria**:
- [ ] All phase sections include "Build Log Update" instructions
- [ ] After each phase completes, build-log.md reflects accurate state
- [ ] Gate pauses set State=BLOCKED with Reason
- [ ] No phase completes without corresponding log update
- [ ] Writes are "atomic" (replace entire block, not incremental line additions)

---

### Task 5: Add Session Boundary Handling

**Description**: Add session marker logic to Phase 0 when resume is detected.

**Changes**:
- When Phase 0 detects resume, append session marker to Progress section
- Session marker format:
  ```markdown
  ---
  
  ### Session N
  **Started**: {ISO timestamp}
  **Resumed From**: Phase X.Y (STATE)
  **Resolution**: {optional note if state changed since last session}
  ```
- Place marker at `<!-- INSERT NEW SESSION HERE -->` comment

**Acceptance Criteria**:
- [ ] New session markers appended on resume
- [ ] Session markers include Started, Resumed From, optional Resolution
- [ ] Multiple sessions clearly distinguishable in log
- [ ] Full session history preserved and readable

---

### Task 6: Update Documentation

**Description**: Update AGENTS.md and ship skill Recovery section to document build-log.

**Changes**:
- AGENTS.md `[Workspace]` section: Add `dev/executions/{slug}/build-log.md` as build artifact
- AGENTS.md `[Workflows]` section: Add resume workflow explanation
- Ship skill Recovery section: Update to reference build-log as primary resume mechanism
- Ship skill LEARNINGS.md: Add gotcha about Phase 0 verification

**Acceptance Criteria**:
- [ ] AGENTS.md Workspace section lists build-log.md
- [ ] AGENTS.md Workflows section explains resume workflow
- [ ] Ship skill Recovery section references build-log (not manual artifact inspection)
- [ ] Ship skill LEARNINGS.md updated with verification gotcha
- [ ] New agent can find resume instructions without reading full skill file

---

## 4. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Ship skill is large (~2000 lines) | HIGH | Grep all phase headings first; verify count after editing |
| Phase number drift | MEDIUM | Use phase names not just numbers; document mapping |
| "Atomic writes" vague | MEDIUM | Define as "replace entire block, not incremental" |
| Scope creep to execute-prd | MEDIUM | Check V1 scope each task; `git diff .pi/skills/execute-prd/` = 0 |

---

## 5. Success Criteria

Overall acceptance:
- [ ] New agent can `/ship {slug}` on stalled build and resume seamlessly
- [ ] Build Context links to skill, plan, PRD, branch, worktree
- [ ] Current Status shows phase, state, timestamp, reason (if blocked/failed)
- [ ] Progress entries capture outcomes and decisions, not just status
- [ ] Session boundaries clearly marked
- [ ] Verification catches log/artifact mismatches before resuming
- [ ] Documentation updated
