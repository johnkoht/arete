---
title: "Workflow Stability & Versioning"
slug: workflow-stability
status: planned
size: medium
tags: [process, tooling, plan-mode]
created: "2026-03-27T09:30:00.000Z"
updated: 2026-03-27T04:31:37.969Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 7
---

# Workflow Stability & Versioning

## Goal

Create a stable, visible, and disciplined workflow for planning → building → releasing with clear status tracking, enforced gates, and automated versioning.

## Context

- 47 plans in folder, mostly stale ideas (34)
- Plans execute but status never updates
- No visibility into what's actually in flight
- No versioning strategy (stuck at 0.1.0)
- Backlog folder exists but unused

## Plan

### 1. **Enhance `/plan list` display** — Add filters and table layout

Add filters and improve display format for better visibility.

**Changes**:
- Add filters: `--complete`, `--building`, `--planned` (in addition to existing `--ideas`, `--active`)
- Default view (no args): show `building` → `planned` → `complete` (recent) — the "active work" view
- Table format with stacked name/slug:
  ```
  ⚡ BUILDING
  ┌──────────────────────────┬────────┬──────────┐
  │ Plan                     │ Size   │ Updated  │
  ├──────────────────────────┼────────┼──────────┤
  │ Meeting Importance       │ medium │ Mar 26   │
  │ meeting-importance       │        │          │
  └──────────────────────────┴────────┴──────────┘
  ```
- `--backlog` shows ideas + drafts in table format (the "queue")

**Pre-mortem mitigation**: Read `commands.ts`, `persistence.ts`, `LEARNINGS.md` before implementing. Follow existing test patterns in `commands.test.ts`.

**Acceptance**: 
- `/plan list` shows active work in table format
- `--backlog` shows queue
- Tests added for new filters

---

### 2. **Enforce build gates** — Hard-fail if status isn't ready

Prevent `/build` and `/ship` from running on unprepared plans.

**Changes**:
- `/build` and `/ship` MUST fail if status isn't `planned` or `approved`
- Clear error: "⛔ Plan status is '{status}'. Run `/approve` first."
- `/hotfix` bypasses this (bugs don't need planning)
- Add status check at very start of ship skill (before Phase 1.1)

**Pre-mortem mitigation**: Don't modify ship skill inline — add check at entry point only. Test full `/ship` flow after changes.

**Acceptance**: 
- Attempting `/ship` on `idea` or `draft` fails with actionable message
- `/hotfix` still works without status check

---

### 3. **Auto-transition status** — Keep status accurate

Automatically update plan status during build lifecycle.

**Changes**:
- `/ship` start → set status to `building`
- `/ship` merge complete → set status to `complete`
- `/build` complete → set status to `complete`
- Use existing `updatePlanFrontmatter()` at transition points

**Pre-mortem mitigation**: Add status update calls at existing transition points, don't restructure ship phases.

**Acceptance**: 
- After `/ship` merge, plan shows as `complete` in `/plan list`
- Status transitions are logged

---

### 4. **Archive on complete** — Move finished plans out of active folder

Keep the plans folder lean by archiving completed work.

**Changes**:
- After status → `complete`, move plan folder to `dev/work/archive/YYYY-MM/{slug}/`
- `/plan list` default view excludes archive
- `/plan list --archive` shows archived plans
- Keep last 14 days of `complete` in main folder before archiving (for visibility)
- Handle slug conflicts: append counter (`-2`, `-3`) if exists

**Pre-mortem mitigation**: Check for existing archive path before moving. Archive is append-only.

**Acceptance**: 
- Old complete plans don't clutter active plans folder
- `--archive` flag shows historical plans
- Duplicate slugs handled gracefully

---

### 5. **Use backlog folder for ideas** — Separate ideas from active plans

Restructure folders to separate active work from queue.

**Changes**:
- New structure:
  ```
  dev/work/plans/      # Only draft, planned, building, complete (active)
  dev/work/backlog/    # Ideas (queue) - lightweight markdown
  dev/work/archive/    # Completed and abandoned (history)
  ```
- Migration script to move 34 existing ideas to backlog
- Script has `--dry-run` mode, only touches `status: idea` plans
- `/plan promote <slug>` moves from backlog to plans with proper frontmatter
- Backlog format: `# Title` on line 1, description follows (no frontmatter required)

**Pre-mortem mitigation**: Dry-run output reviewed by builder before actual migration. Test `/plan promote` on existing backlog items.

**Acceptance**: 
- `plans/` folder contains <10 items typically
- Migration script runs successfully with builder review
- `/plan promote` works on backlog items

---

### 6. **Create gitboss agent** — Post-build review, merge, versioning

New agent to handle the final stages of shipping.

**Changes**:
- New agent: `.pi/agents/gitboss.md`
- Four responsibilities ONLY:
  1. **Pre-merge checks**: Uncommitted changes → refuse merge, list dirty files
  2. Review implementation diff (changes look correct?)
  3. Handle merge to main (conflict resolution, commit message)
  4. Decide if version bump needed → run `/release`
- Invoked at end of `/ship` Phase 5.6 (replaces inline merge logic)
- Can be invoked manually: `/gitboss` or `@gitboss review`
- Explicit boundaries: no code changes, no architecture decisions

**Pre-mortem mitigation**: Agent definition has explicit scope boundaries. Ship calls gitboss rather than rewriting merge logic.

**Acceptance**: 
- After `/ship` build phase, gitboss handles review+merge+version
- Agent definition includes clear "out of scope" section
- Pre-merge check catches uncommitted dist files
- Manual invocation works

---

### 7. **Add `/release` command** — Version management

Command for version bumps with proper tracking.

**Changes**:
- `/release patch` — bump 0.1.x, create git tag, update CHANGELOG
- `/release minor` — bump 0.x.0, create git tag, update CHANGELOG  
- `/release status` — show current version, unreleased changes
- Pre-flight checks: clean working tree, on main branch, no pending merges
- `--dry-run` mode to preview changes
- Atomic operation: all changes in single commit

**Pre-mortem mitigation**: Test `/release --dry-run` before any actual release. Clear error messages for pre-flight failures.

**Acceptance**: 
- Version bumps create tags and update CHANGELOG
- Pre-flight checks prevent bad state
- Gitboss can invoke `/release` successfully

---

## Risks

See `pre-mortem.md` for full analysis. Key risks:

1. **Ship Skill Integration** (HIGH) — Ship is 2000+ lines, changes are high-risk. Mitigation: hooks/callbacks, not inline changes.
2. **Migration Disruption** (MEDIUM) — Moving 34 ideas could disrupt active work. Mitigation: dry-run, builder review.
3. **Gitboss Scope Creep** (LOW) — Agent tries to do too much. Mitigation: explicit boundaries.

## Dependencies

- Step 3 depends on Step 2 (status checks before transitions)
- Step 6 depends on Step 7 (gitboss needs `/release`)
- Steps 1, 4, 5 are independent

## Out of Scope

- CI/CD integration (future)
- npm publish automation (future)
- PR creation (manual for now)
- Multi-IDE changes (this is plan-mode and git tooling only)
