# PRD: Workflow Stability & Versioning

**Version**: 1.0  
**Status**: Ready for Execution  
**Date**: 2026-03-27  
**Branch**: `feature/workflow-stability`  
**Depends on**: Plan-mode extension, ship skill

---

## 1. Problem & Goals

### Problem

The Areté development workflow has several stability gaps:

1. **No visibility into active work**: 47 plans in `dev/work/plans/`, 34 are stale ideas. No easy way to see what's actually in progress vs planned vs complete.

2. **Status doesn't update**: Plans execute via `/ship` or `/build` but status stays at `draft` or `planned` forever. No automation to mark `building` or `complete`.

3. **No build gates**: Agents can run `/ship` on ideas or drafts — there's no enforcement that plans must be approved first.

4. **No versioning**: Still at 0.1.0 with no process to bump versions, create tags, or maintain CHANGELOG.

5. **Uncommitted build artifacts**: Agents run `npm run build` but forget to commit dist files, leaving dirty state.

### Goals

1. **Visibility**: `/plan list` shows a clear kanban-style view of active work (building → planned → complete). Backlog separated.

2. **Enforce discipline**: `/build` and `/ship` fail unless plan status is `planned`. No accidental execution of ideas.

3. **Auto-transition**: Status automatically updates: `planned` → `building` → `complete` as work progresses.

4. **Clean separation**: Ideas go to `dev/work/backlog/`, active plans stay in `dev/work/plans/`, completed work archives to `dev/work/archive/`.

5. **Versioning**: New `/release` command for semantic versioning with tags and CHANGELOG.

6. **Gatekeeper agent**: `gitboss` reviews, merges, and decides version bumps — including catching uncommitted changes.

### Out of Scope

- CI/CD integration (future)
- npm publish automation (future)
- PR creation via GitHub API (manual for now)
- Multi-IDE changes (plan-mode and git tooling only)

---

## 2. Architecture Decisions

### Plan Lifecycle

```
dev/work/backlog/    → Ideas (lightweight markdown, no frontmatter required)
dev/work/plans/      → Active work (draft, planned, building, complete)
dev/work/archive/    → Historical (completed, abandoned)
```

Status transitions:
```
idea (backlog) → /plan promote → draft (plans/)
draft → /approve → planned
planned → /build or /ship → building
building → completion → complete
complete → 14 days or explicit → archive/YYYY-MM/{slug}/
```

### Gitboss Agent

New agent with tightly scoped responsibilities:
1. Pre-merge checks (uncommitted changes, branch state)
2. Review diff (high-level correctness check)
3. Merge to main (handle conflicts)
4. Decide version bump → invoke `/release`

Gitboss does NOT: write code, make architecture decisions, or suggest refactors.

### Release Command

Extension command `/release` handles:
- Pre-flight checks (clean tree, on main, no pending merge)
- Version bump in package.json (patch or minor)
- Git tag creation
- CHANGELOG update (Keep a Changelog format)
- Atomic commit

---

## 3. User Stories / Tasks

### Task 1: Enhanced `/plan list` Display

**Description**: Add filters and table layout to `/plan list` for better visibility into active work.

**Changes**:
- Add filters: `--complete`, `--building`, `--planned` (join existing `--ideas`, `--active`)
- Default view (no args): show active work only (building → planned → complete from last 14 days)
- Table format with stacked name/slug per row
- `--backlog` shows ideas + drafts as the queue
- Footer shows backlog count: "Showing active plans. Use --backlog to see N ideas."

**Acceptance Criteria**:
- [ ] `/plan list` with no args shows only building/planned/recent-complete in table format
- [ ] `/plan list --backlog` shows ideas and drafts
- [ ] `/plan list --complete` shows all complete plans
- [ ] `/plan list --building` shows only building plans
- [ ] `/plan list --planned` shows only planned plans
- [ ] Table format displays: Plan name (row 1), slug (row 2), size, updated date
- [ ] Footer shows backlog count when viewing active
- [ ] Tests added for all new filters in `commands.test.ts`

**Files to Read First**:
- `.pi/extensions/plan-mode/commands.ts` (existing list handlers)
- `.pi/extensions/plan-mode/persistence.ts` (plan loading)
- `.pi/extensions/plan-mode/LEARNINGS.md` (gotchas)
- `.pi/extensions/plan-mode/commands.test.ts` (test patterns)

---

### Task 2: Enforce Build Gates

**Description**: Prevent `/build` and `/ship` from running on unprepared plans.

**Changes**:
- Add status check at start of `/build` command
- Add status check in ship skill pre-flight (Phase 1.1)
- Allow only `planned` or `approved` status to proceed
- `/hotfix` bypasses gate (bugs don't need planning)

**Acceptance Criteria**:
- [ ] `/build` on `idea` status fails with: "⛔ Plan status is 'idea'. Run `/approve` first."
- [ ] `/build` on `draft` status fails with same message pattern
- [ ] `/ship` on `idea` or `draft` fails at pre-flight with clear message
- [ ] `/build` and `/ship` on `planned` status proceed normally
- [ ] `/hotfix` skill works without status check
- [ ] Tests added for gate enforcement

**Files to Read First**:
- `.pi/extensions/plan-mode/commands.ts` (handleBuild function)
- `.pi/skills/ship/SKILL.md` (pre-flight check section)
- `.pi/skills/hotfix/SKILL.md` (verify no status check needed)

---

### Task 3: Auto-Transition Status

**Description**: Automatically update plan status during build lifecycle.

**Changes**:
- `/ship` Phase 1.1 (after save): set status to `building`
- `/ship` Phase 5.6 (after merge): set status to `complete`
- `/build` completion handler: set status to `complete`
- Use existing `updatePlanFrontmatter()` function

**Acceptance Criteria**:
- [ ] After `/ship` starts execution, plan status is `building`
- [ ] After `/ship` merge completes, plan status is `complete`
- [ ] After `/build` completes (all todos done), plan status is `complete`
- [ ] Status transitions are logged (console or debug output)
- [ ] Tests verify status transitions

**Files to Read First**:
- `.pi/extensions/plan-mode/commands.ts` (updatePlanFrontmatter, handleExecutionComplete)
- `.pi/extensions/plan-mode/persistence.ts` (updatePlanFrontmatter implementation)
- `.pi/extensions/plan-mode/LEARNINGS.md` (two execution paths: todo vs PRD)

---

### Task 4: Archive on Complete

**Description**: Move finished plans out of active folder to reduce clutter.

**Changes**:
- Add `archivePlan(slug)` function to persistence.ts
- Archive path: `dev/work/archive/YYYY-MM/{slug}/`
- Handle conflicts: append `-2`, `-3` if slug exists in archive month
- Trigger: when status transitions to `complete` AND plan is older than 14 days
- Add `--archive` flag to `/plan list` to show archived plans
- Add `listArchive()` function (may already exist)

**Acceptance Criteria**:
- [ ] `archivePlan(slug)` moves plan folder to `dev/work/archive/YYYY-MM/{slug}/`
- [ ] Duplicate slug in same month gets counter suffix (`-2`, `-3`)
- [ ] `/plan list` default excludes archived plans
- [ ] `/plan list --archive` shows archived plans
- [ ] Plans stay in `plans/` for 14 days after completion before archive eligibility
- [ ] Tests for archive function and conflict handling

**Files to Read First**:
- `.pi/extensions/plan-mode/persistence.ts` (file operations, existing archive functions)
- `.pi/extensions/plan-mode/commands.ts` (list command structure)

---

### Task 5: Backlog Folder for Ideas

**Description**: Separate ideas from active plans with migration and promote command.

**Changes**:
- Create migration script: `scripts/migrate-ideas-to-backlog.ts`
  - `--dry-run` mode shows what would move
  - Only moves `status: idea` plans
  - Converts to lightweight markdown (strips frontmatter, keeps content)
- Add `/plan promote <slug>` command
  - Reads from `dev/work/backlog/{slug}.md`
  - Creates proper plan in `dev/work/plans/{slug}/plan.md` with frontmatter
  - Extracts title from `# ` heading, uses filename as slug
- Update `/plan new` to create in `plans/` with status `draft`
- Backlog format: `# Title` on line 1, description follows

**Acceptance Criteria**:
- [ ] `npx tsx scripts/migrate-ideas-to-backlog.ts --dry-run` lists ideas to move
- [ ] `npx tsx scripts/migrate-ideas-to-backlog.ts` moves ideas to backlog
- [ ] Migrated files are lightweight markdown (no frontmatter)
- [ ] `/plan promote backlog-slug` creates plan from backlog item
- [ ] Promoted plan has proper frontmatter with status `draft`
- [ ] `/plan list` shows only `plans/` directory (not backlog)
- [ ] Tests for promote command

**Files to Read First**:
- `dev/work/backlog/` (existing structure: bugs/, enhancements/, skills/)
- `.pi/extensions/plan-mode/persistence.ts` (plan creation)
- `.pi/extensions/plan-mode/commands.ts` (command registration)

---

### Task 6: Create Gitboss Agent

**Description**: New agent for post-build review, merge, and versioning decisions.

**Changes**:
- Create `.pi/agents/gitboss.md` with:
  - Four responsibilities: pre-merge checks, diff review, merge, version decision
  - Explicit out-of-scope section (no code changes, no architecture)
  - Pre-merge check: uncommitted changes → refuse merge, list files
  - Integration point: invoked from `/ship` Phase 5.6
- Update ship skill to call `@gitboss` at Phase 5.6 instead of inline merge logic

**Acceptance Criteria**:
- [ ] `.pi/agents/gitboss.md` exists with complete agent definition
- [ ] Agent has explicit "Out of Scope" section
- [ ] Pre-merge check: refuses merge if uncommitted changes exist
- [ ] Pre-merge check: lists dirty files in refusal message
- [ ] Ship skill Phase 5.6 invokes gitboss agent
- [ ] Manual invocation works: user can say `@gitboss review`
- [ ] Agent can invoke `/release` command (depends on Task 7)

**Files to Read First**:
- `.pi/agents/` (existing agent definitions for format)
- `.pi/skills/ship/SKILL.md` (Phase 5.6 merge logic)
- `memory/collaboration.md` (builder preferences for agent boundaries)

---

### Task 7: Add `/release` Command

**Description**: Version management command for semantic versioning.

**Changes**:
- Create `/release` extension command in plan-mode or new release extension
- Subcommands:
  - `/release patch` — bump 0.x.Y, tag, CHANGELOG
  - `/release minor` — bump 0.X.0, tag, CHANGELOG
  - `/release status` — show current version, unreleased changes
- Pre-flight checks: clean tree, on main, no pending merge
- `--dry-run` mode for preview
- CHANGELOG format: Keep a Changelog (keepachangelog.com)
- Atomic: single commit with version bump + CHANGELOG + tag

**Acceptance Criteria**:
- [ ] `/release status` shows current version and unreleased commits
- [ ] `/release patch --dry-run` shows what would happen
- [ ] `/release patch` bumps patch version in package.json
- [ ] `/release minor` bumps minor version in package.json
- [ ] Git tag created matching new version (e.g., `v0.2.0`)
- [ ] CHANGELOG.md updated with new version section
- [ ] Pre-flight: fails if working tree dirty with clear message
- [ ] Pre-flight: fails if not on main branch
- [ ] All changes in single atomic commit
- [ ] Tests for release logic

**Files to Read First**:
- `package.json` (current version location)
- `CHANGELOG.md` (current format, or create if missing)
- `.pi/extensions/plan-mode/index.ts` (command registration pattern)

---

### Task 8: Support `/build <slug>` and `/ship <slug>`

**Description**: Allow building plans without requiring plan mode to be active.

**Changes**:
- Add slug argument parsing to `/build` command
  - `/build <slug>` — loads plan from `dev/work/plans/{slug}/plan.md`
  - Validates status (must be `planned`)
  - Starts execution (same as current behavior)
- Add slug argument parsing to `/ship` command
  - `/ship <slug>` — loads plan, runs full ship workflow
  - Creates worktree, PRD, executes, prompts for merge
- If plan mode IS active with a different plan, warn and confirm
- Reuse existing `loadPlan()` from persistence.ts

**Acceptance Criteria**:
- [ ] `/build workflow-stability` works without plan mode active
- [ ] `/ship workflow-stability` creates worktree and executes PRD
- [ ] Status gate enforced: `/build my-idea` fails if status is `idea`
- [ ] Warning shown if switching from active plan in plan mode
- [ ] Tests added for slug-based invocation

**Files to Read First**:
- `.pi/extensions/plan-mode/commands.ts` (handleBuild, existing argument parsing)
- `.pi/extensions/plan-mode/persistence.ts` (loadPlan function)
- `.pi/skills/ship/SKILL.md` (ship workflow)

---

## 4. Pre-Mortem Risks

See `pre-mortem.md` for full analysis. Key mitigations to apply:

1. **Plan-mode state complexity**: Read LEARNINGS.md before modifying commands.ts
2. **Ship skill integration**: Add hooks at entry/exit points, don't restructure phases
3. **Migration disruption**: Use dry-run, review before execution
4. **Test coverage**: Run extension tests explicitly after each task

---

## 5. Success Criteria

After completion:
- [ ] `/plan list` provides clear visibility into work status
- [ ] Agents cannot accidentally execute unprepared plans
- [ ] Plan status automatically reflects actual state
- [ ] Plans folder stays lean (<15 items)
- [ ] Version can be bumped with `/release patch`
- [ ] Gitboss catches uncommitted changes before merge
- [ ] `/build <slug>` and `/ship <slug>` work without plan mode active
