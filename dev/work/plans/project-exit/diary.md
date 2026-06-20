# Build diary — /project-exit

Overnight build session started 2026-06-20 (~late evening PT). John asked: save progress, continue the `/ship` skill, keep a diary, he'll review in the morning. Following `.pi/skills/ship/SKILL.md`.

## Scope + ground rules for this session

- **Build Increment A only** (the shippable MVP, CI-verifiable): marker verbs (`mark-open`/`mark-dirty`/`mark-clear`) with main-root pinning, resume sidecar helper (+`.prev`), dirty mtime comparator, `project list`, `open` resume-block surfacing, scoped `snapshotTree` prune, and the `/project-exit` skill prose. All with tests.
- **NOT building Increment B** (statusline script + SessionStart hook) — needs `.claude/settings.json` decisions + **manual** verification in John's real environment. Left for John.
- **NOT merging to main.** All work on `feature/project-exit` worktree branch. Stop at the merge gate; John reviews + merges in the morning (matches the established "main merge pending John's testing" pattern).
- Worktree: `.claude/worktrees/project-exit` (branch `feature/project-exit`, off `main@29fc7553`).
- Honest verification: I'll mark each piece CI-verified / inspected-only / pending, and won't overclaim.

## H8 — port-coordination note (the `build-mode-claude-port` plan now exists)

John created `dev/work/plans/build-mode-claude-port/` this session — porting BUILD off `.pi/` to native Claude Code. The ship skill I'm following is itself `.pi/` and in that port's scope. Per pre-mortem H8, project-exit's interfaces are the canonical contract the port must **consume, not regenerate**:
- Marker file: `<main-root>/.claude/active-project.json` = `{slug, name, opened_at, dirty}`.
- CLI verbs: `arete project mark-open|mark-dirty|mark-clear`, `arete project list`.
- (Increment B, deferred) exactly ONE SessionStart hook owner.
**Action for the port plan:** reference these, don't redefine. Logged here so it's not lost.

## Ship workflow progress

- [x] **Pre-Flight** — plan `status: planned`, `has_pre_mortem` was false → ran it; `has_review: true` → Phase 1.3 review SKIPPED (eng-lead review already done).
- [x] **Phase 1.2 Pre-Mortem** — `pre-mortem.md` written; 3 CRITICAL / 8 HIGH / 4 MED. Gate PAUSED, reported to John, mitigations folded into `plan.md` (Increment A/B split, C1 mtime backstop, C2 friction budget, C3 main-root pin, H3 `.prev`, H4 no-hollow-line, H6 honest teardown, H7 env-translation, H8 port coord, M-series). `updated` bumped.
- [ ] **Phase 2** — Memory review → build spec (PRD-equivalent) → commit artifacts. (in progress)
- [ ] **Phase 3** — Worktree setup. (worktree created)
- [ ] **Phase 4** — Build Increment A + verify.
- [ ] **Phase 5** — Wrap: diary, ship report. STOP at merge gate.

## Running log

- `00:00` Worktree `feature/project-exit` created off `main@29fc7553`. Fresh checkout, no `node_modules`.
- `00:01` Kicked off `npm install` in the worktree (background, log at `/tmp/project-exit-npm-install.log`) — needed for typecheck/test.
- `00:02` Committing planning artifacts (plan + pre-mortem + this diary) to the feature branch (H7: artifacts to feature branch, not main).

## For John (morning) — filled at end of session

_TBD — ship report, what's green, what's inspected-only, what's pending, recommended next step._
