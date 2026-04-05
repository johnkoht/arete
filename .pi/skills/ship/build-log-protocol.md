---
name: build-log-protocol
description: Protocol for managing build-log.md — creation, session resume, state verification, and per-phase update format. Used by the ship skill to enable inter-session resume.
---

# Build Log Protocol

> Referenced by: `.pi/skills/ship/SKILL.md` (Phase 0 and Build Log update reference)

The build-log at `dev/executions/{slug}/build-log.md` is the authoritative record of phase progress. It enables resume from any point across sessions.

---

## Phase 0: Initialize Build Log

Phase 0 runs before any other phase. It determines whether to start fresh, resume, or confirm a re-run.

### Phase 0.1: Check for Existing Build Log

**Actions**:
1. Derive `slug` from plan title (kebab-case)
2. Check for `dev/executions/{slug}/build-log.md`
3. If found, read `**State**:` and `**Phase**:` fields from Current Status header

**Outcomes**:
- **No file** → create new (Phase 0.2: New)
- **State = COMPLETE** → confirm re-run (Phase 0.2: Re-Run)
- **State ≠ COMPLETE** → resume (Phase 0.2: Resume)

---

### Phase 0.2: Create New OR Resume Existing

#### New Build

Copy template and fill in values:
```bash
slug="{plan-slug}"
mkdir -p "dev/executions/${slug}"
cp ".pi/skills/ship/templates/build-log.md" "dev/executions/${slug}/build-log.md"
timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
sed -i '' \
  -e "s/{slug}/${slug}/g" \
  -e "s/{ISO timestamp}/${timestamp}/g" \
  "dev/executions/${slug}/build-log.md"
```

Proceed to Phase 1.

#### Resume

1. Read current `**Phase**:` and `**State**:` from build-log
2. Count existing `### Session` headers; increment for next session
3. Append session marker at `<!-- INSERT NEW SESSION HERE -->`:
   ```markdown
   ### Session {N}
   **Started**: {ISO timestamp}
   **Resumed From**: {phase} ({state})
   ```
4. Display resume summary:
   ```
   🔄 Resuming Ship: {slug}
   Current Phase: {phase} | State: {state}
   Session {N} started. Continuing from {phase}...
   ```
5. Proceed to Phase 0.3 (state verification)

#### Re-Run Completed Build

Prompt builder:
```
⚠️ Build Already Complete

Re-running will archive build-log.md to build-log.{timestamp}.md and restart from Phase 1.
Continue? [y/N]
```

Wait for explicit confirmation before proceeding.

---

### Phase 0.3: Verify State (Resume Only)

**Purpose**: Confirm logged state matches actual artifacts before resuming. Prevents silent failures from stale/corrupt logs.

**Phase → Artifact Verification**:

| Logged Phase | Expected Artifact | Check |
|-------------|------------------|-------|
| Pre-Mortem complete | `dev/work/plans/{slug}/pre-mortem.md` | File exists |
| Review complete | `dev/work/plans/{slug}/review.md` | File exists |
| Convert to PRD complete | `dev/work/plans/{slug}/prd.md` + `prd.json` | Both exist |
| Commit Artifacts complete | Plan committed | `git log --oneline --grep="plan: {slug}"` returns result |
| Create Worktree complete | Worktree exists | `../{repo}.worktrees/{slug}` is directory |
| Execute PRD started | Execution state | `dev/executions/{slug}/` exists |
| Merge complete | Branch merged | `git branch --merged main` includes `feature/{slug}` |

**If verification passes**: Continue to logged phase.

**If mismatch detected**:
```
⚠️ State Mismatch Detected
  - {list of mismatches}

Options:
  [F] Fix log — Reset phase to an earlier point
  [R] Rebuild — Regenerate missing artifacts
  [A] Abort — Cancel resume
```

Wait for builder choice before proceeding.

---

## Build Log Update Reference

Every phase updates `dev/executions/{slug}/build-log.md` at entry and exit.

### Phase Names (for Current Status field)

Use the human-readable name, not just the number, so resume detection is robust:

| Phase | Name |
|-------|------|
| 1.1 | Save Plan |
| 1.2 | Pre-Mortem |
| 1.3 | Cross-Model Review |
| 2.1 | Memory Review |
| 2.2 | Convert to PRD |
| 2.3 | Commit Artifacts |
| 3.1 | Create Worktree |
| 3.2 | Switch to Worktree |
| 4.1 | Execute PRD |
| 4.2 | Final Review |
| 5.1 | Create Memory Entry |
| 5.2 | Update LEARNINGS.md |
| 5.3 | Commit Implementation |
| 5.4 | Verify with /wrap |
| 5.5 | Generate Ship Report |
| 5.6 | Merge Gate |
| 6.1 | Cleanup |

### On Phase Start

Update the `## Current Status` block and add a phase entry:

```markdown
## Current Status
**Phase**: X.Y — {Phase Name}
**State**: IN_PROGRESS
**Last Update**: {ISO timestamp}
```

```markdown
#### Phase X.Y: {Phase Name} ⏳
**Started**: {ISO timestamp}
```

### On Phase Complete

```markdown
## Current Status
**Phase**: X.Y — {Phase Name} (moving to X.Z)
**State**: COMPLETE
**Last Update**: {ISO timestamp}
```

```markdown
#### Phase X.Y: {Phase Name} ✓
**Started**: {timestamp}
**Completed**: {timestamp}
**Outcome**: {1-2 sentence summary}
**Artifacts**: `{path}` (if files created)
```

### On Gate Pause

```markdown
## Current Status
**Phase**: X.Y — {Phase Name}
**State**: BLOCKED
**Last Update**: {ISO timestamp}
**Reason**: {gate name}: {specific reason}
```

### On Failure

```markdown
## Current Status
**Phase**: X.Y — {Phase Name}
**State**: FAILED
**Last Update**: {ISO timestamp}
**Reason**: {error description}
```

```markdown
#### Phase X.Y: {Phase Name} ✗
**Started**: {timestamp}
**Failed**: {timestamp}
**Reason**: {error description}
```
