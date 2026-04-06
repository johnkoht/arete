---
name: sandbox
description: Build a release branch worktree, sync the test workspace with real data, analyze what changed, and generate a targeted test plan with regression baseline and optional agent-assisted extraction review.
category: build
work_type: testing
primitives: []
requires_briefing: false
triggers:
  - "let's test"
  - "test in the sandbox"
  - "sandbox"
  - "spin up sandbox"
  - "test the build"
  - /sandbox
---

# Sandbox Skill

Spin up an isolated, repeatable testing environment for any branch — using real workspace data (`arete-reserv-test`) without touching the real workspace. Generates a targeted test plan based on what changed, plus a regression baseline.

## When to Use

- Before releasing a branch with intelligence layer changes (extraction, briefing, context)
- After significant refactors where real-data behavior needs to be verified
- Anytime you want to test against realistic context without risking `arete-reserv`

## Prerequisites

- `~/code/arete-reserv` exists (source workspace)
- `~/code/arete-reserv-test` exists (test workspace — created by rsync on first run if missing)
- `scripts/sandbox-sync.sh` exists in the BUILD repo

---

## Phase 0: Resolve Context

1. Get current branch: `git branch --show-current` → `{branch}`
   - If invoked as `/sandbox {branch}`, use that branch instead (checkout first if needed)
2. Check for existing sandbox worktree: `git worktree list | grep arete.worktrees/sandbox`
3. Compute diff base:
   - Try: `git merge-base main HEAD` → `{diff-base}`
   - If on `main` or merge-base equals HEAD: fall back to `git describe --tags --abbrev=0`
4. Get changed files: `git diff --name-only {diff-base}..HEAD` → `{changed-files}`
5. Present preflight summary:

```
Branch:      {branch}
Diff base:   main (merge-base: {sha})
Changed:     {N} files
Worktree:    {exists at .../sandbox | not found → will create}
Test WS:     ~/code/arete-reserv-test
```

If on `main` with no diff: note that targeted tests will be limited; regression baseline still runs fully.

---

## Phase 1: Worktree Setup

1. If worktree exists at `~/code/arete.worktrees/sandbox`:
   - Get its current branch: `git -C ~/code/arete.worktrees/sandbox branch --show-current`
   - Force-remove: `git worktree remove --force ~/code/arete.worktrees/sandbox`
   - Delete the stale branch if it exists: `git branch -D sandbox/{prev-branch}` (suppress error if not found)
2. Create fresh worktree on current branch:
   ```bash
   git worktree add ~/code/arete.worktrees/sandbox -b sandbox/{branch} HEAD
   ```
3. Worktree guard — verify isolation:
   ```bash
   git_dir=$(git -C ~/code/arete.worktrees/sandbox rev-parse --git-dir 2>/dev/null)
   # Expected: .git/worktrees/sandbox/gitdir (NOT ".git")
   ```
   If result is `.git` → halt: something went wrong with worktree creation.

4. Set for remaining phases:
   ```
   WORKTREE=~/code/arete.worktrees/sandbox
   ARETE_BIN=$WORKTREE/packages/cli/bin/arete.js
   ```

---

## Phase 2: Build

Run all commands inside `$WORKTREE`.

1. Delete stale TypeScript build cache (critical — stale .tsbuildinfo causes wrong builds):
   ```bash
   rm -f packages/core/*.tsbuildinfo packages/cli/*.tsbuildinfo
   ```

2. Determine build target:
   - If `{changed-files}` includes any path under `packages/apps/` → `npm run build` (full, warn: takes longer)
   - Otherwise → `npm run build:packages` (core + cli only, sufficient for CLI testing)

3. Run the build in `$WORKTREE`.

4. Verify binary is functional:
   ```bash
   node $ARETE_BIN --help
   ```
   Expected: help text renders without crashing.

**On build failure**: halt. Present the error. Do not proceed to sync or test plan. The user should fix the build on their branch and re-invoke `/sandbox`.

---

## Phase 3: Sync Test Workspace

1. From the BUILD repo root (not the worktree), run:
   ```bash
   bash scripts/sandbox-sync.sh
   ```
2. Verify post-sync: `ls ~/code/arete-reserv-test/arete.yaml` — must exist.
3. Display rsync stats output.

Note: `inputs/` is synced (not excluded) — staged meeting transcripts are needed for extraction tests. Any mutations from a previous test run will be overwritten by the sync.

---

## Phase 4: Analyze Changes → Test Plan

Map `{changed-files}` to test domains. A file may match multiple domains.

| Changed path pattern | Domain |
|---|---|
| `packages/core/src/services/meeting-*` | Meeting Extraction |
| `packages/core/src/integrations/{name}/` | Integration — name the integration |
| `packages/core/src/services/intelligence*` or `*briefing*` | Briefing / Intelligence |
| `packages/core/src/search/` | Search / Context Retrieval |
| `packages/cli/src/commands/{name}.ts` | CLI — name the command |
| `packages/apps/` | Backend / Web |
| `packages/core/src/services/context*` | Context Retrieval |

For each matched domain, pull the specific test commands and quality checks from `sandbox/test-scenarios.md`.

Construct the targeted test plan with exact copy-pasteable commands:
```
cd ~/code/arete-reserv-test && node {ARETE_BIN} {command}
```

---

## Phase 5: Present Test Instructions

Output three blocks:

### Block 1 — Regression Baseline (always run first)
Pull from `sandbox/regression-checklist.md`. Substitute `$ARETE_BIN` with the full path. These 5 commands must all pass before proceeding to targeted tests.

### Block 2 — Targeted Tests
From Phase 4 analysis. Grouped by domain.

### Block 3 — Reference
```
Binary:    node ~/code/arete.worktrees/sandbox/packages/cli/bin/arete.js
Test WS:   ~/code/arete-reserv-test
Pattern:   cd ~/code/arete-reserv-test && node {binary} {command}
Re-sync:   bash scripts/sandbox-sync.sh   (resets any mutations from test run)
Cleanup:   git worktree remove ~/code/arete.worktrees/sandbox
```

---

## Phase 6: Offer to Run & Review (optional)

After presenting the test plan, ask:

> "Want me to run extraction on 1-2 meetings and review the output for quality issues?"

If yes:
1. List meetings in `~/code/arete-reserv-test/resources/meetings/` (or wherever meetings live in that workspace)
2. Pick 2 that represent different types: prefer one 1:1 + one team meeting (check frontmatter for attendee count)
3. Run extraction on each:
   ```bash
   cd ~/code/arete-reserv-test && node {ARETE_BIN} meeting extract --file {meeting-path}
   ```
4. Read the staged sections written back to each meeting file
5. Analyze and report:
   - **Item count**: reasonable for the meeting length/type?
   - **Duplicates**: same commitment extracted twice under different phrasing?
   - **Owner attribution**: `i_owe_them` vs `they_owe_me` correct?
   - **Confidence distribution**: spread across range, or suspiciously all high/low?
   - **Relevance**: any obviously off-topic items that passed the filter?
   - **Decisions/learnings**: captured or missed?
6. Flag issues with severity:
   - **Regression** — worked before, broken now
   - **Quality gap** — suboptimal but not a regression
   - **Expected** — known limitation
7. Remind: running `bash scripts/sandbox-sync.sh` before the next test session will restore all meeting files to their pre-extraction state.

---

## Edge Cases

| Situation | Handling |
|---|---|
| Called on `main` | Diff base = last tag; note targeted tests limited; regression runs fully |
| Sandbox worktree already exists | Force-remove + recreate (avoids stale state) |
| Build fails | Halt at Phase 2, present error, do not continue |
| `arete-reserv-test` missing | rsync creates it on first run; Phase 3 verify step catches issues |
| `packages/apps/` in diff | Full `npm run build`; warn it takes longer |
| No changed files (on main, no tags) | Skip targeted tests entirely, run regression only |

---

## References

- **Test scenarios catalog**: `sandbox/test-scenarios.md`
- **Regression baseline**: `sandbox/regression-checklist.md`
- **Sync script**: `scripts/sandbox-sync.sh`
- **Worktree patterns**: `.pi/skills/ship/SKILL.md` § Phase 3
