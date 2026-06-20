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
- [x] **Phase 2/3** — Worktree `feature/project-exit` created; artifacts committed. (Skipped the heavy pi PRD/memory machinery — env-translated per H7; the plan's `## Plan` already serves as the build spec.)
- [x] **Phase 4** — Built Increment A (core + CLI + skill prose); independently verified (typecheck clean, core 9/9, CLI 20/20). Increment B deferred to John.
- [x] **Phase 5** — Diary + ship report written. Implementation committed (`18b4b770`). **STOPPED at the merge gate — no merge to main** (John's call in the morning).
- [ ] **Phase 6** — Cleanup (remove worktree) — only after John merges.

## Running log

- `00:00` Worktree `feature/project-exit` created off `main@29fc7553`. Fresh checkout, no `node_modules`.
- `00:01` Kicked off `npm install` in the worktree (background, log at `/tmp/project-exit-npm-install.log`) — needed for typecheck/test.
- `00:02` Committed planning artifacts to `feature/project-exit` (`c7e87360`). H7: feature branch, not main. ✅ progress saved.
- `00:05` `npm install` in worktree succeeded (exit 0) — typecheck/test possible.
- `00:08` Read `project.ts` patterns (verb registration, `open` JSON envelope, findRoot/getPaths). **C3 refinement:** marker root = arete workspace root via `services.workspace.findRoot()` (in production = the vault, which has no worktrees). The pre-mortem's "main checkout vs worktree" framing was a code-repo artifact; using `findRoot()` (not git toplevel) is the correct existing mechanism. Baked into the build spec.
- `00:10` **Dispatched build agent (background)** for the core + CLI layer: `project-session.ts` (marker read/write/clear/setDirty + main-root resolution, resume sidecar read/write +`.prev`, `dirtyByMtime` C1 backstop), CLI verbs (`mark-open`/`mark-dirty`/`mark-clear`/`list`), `open` resume-block surfacing, scoped `snapshotTree` prune, + core & CLI tests. Instructed: typecheck + per-file tests only (full suite stalls), report raw results.
- `00:12` **Authored skill prose myself** (non-overlapping with the agent): `packages/runtime/skills/project-exit/SKILL.md` (new — encodes C2 friction budget 0/1–2/3+, H2 confirm-before-irreversible, H4 no-hollow-status-line, capture=work-product-not-transcript, not-finalize/not-update boundaries, verification-honesty + rollback). Edited `packages/runtime/skills/project/SKILL.md` — added the no-arg → `project list` numbered-pick path + resume-block surfacing on open.
- `00:13` Holding commits until the build agent finishes + I verify (avoid git index contention).

## Pieces status (running)

| Piece | State |
|---|---|
| Planning artifacts (plan, pre-mortem, diary) | ✅ committed `c7e87360` |
| `/project-exit` SKILL.md | ✅ written (prose; soak-verified later, not CI) |
| `/project` no-arg + resume surfacing prose | ✅ written |
| Core `project-session.ts` + tests | ✅ built, 9/9 pass (I re-ran, not just the agent) |
| CLI verbs + `open` surfacing + tests | ✅ built, 20/20 pass (re-ran independently) |
| Typecheck + targeted tests green | ✅ `tsc -b core cli` exit 0; both test files green |
| Skill prose-pin tests (test D) | ⬜ follow-up |
| Increment B — statusline + session-start verbs + tests | ✅ built `bf3a6b45`, verified (core 19/19, CLI 25/25, tsc clean) |
| Increment B — settings.json wire-up + live render/greeting check | ⬜ **John (manual, irreducible)** — paste block + eyeball; see `increment-b-settings.md` |

## Increment B — built 2026-06-20

- `arete project statusline` — `▸ slug` / `▸ slug · unsaved` / nothing; total error-guard (never pollutes the prompt line); C1 backstop wired (shows unsaved on a real file edit even if the LLM didn't flip `dirty`).
- `arete project session-start` — reads `source` from hook stdin JSON (or `--source`); startup|clear wipe a stale marker (+ notice if unsaved); startup emits a once/day resume greeting with the H1 14-day recency filter; `--json` emits the `hookSpecificOutput` envelope.
- Did NOT touch live `.claude/settings.json` (gitignored, John's machine). Paste block + latency caveat + manual steps in `increment-b-settings.md`.
- Verified independently: typecheck exit 0; core 19/19; CLI 25/25. Read the core gating + both verbs by hand.

## Running log (cont.)

- `00:15` Build agent reported green. **Verified independently** (PoC-vs-fair-test rule): read `project-session.ts` + the full `project.ts` diff, re-ran typecheck (exit 0) and both test files (core 9/9, CLI 20/20). Confirmed: C1 `dirtyByMtime` treats the filesystem as source of truth (bit only upgrades clean→dirty); `open` stays strictly read-only (sidecar READ only, adds `resume` to JSON + a markdown block); verbs use the exact findRoot/`--json` skeleton; `snapshotTree` prune scoped to `active-project.json`+`.last-greeting` (not a blanket `.claude/` skip).
- `00:17` Committed implementation + dist (commit-dist rule) on `feature/project-exit`. STOPPED at merge gate — no merge to main.

## 🚢 Ship report — Increment A built, NOT merged

**Branch:** `feature/project-exit` (worktree `.claude/worktrees/project-exit`). `main` untouched.

**What's done + verified (CI-grade):**
- Core `project-session.ts`: marker read/write/clear/setDirty, resume sidecar read/write (+`.prev` + thinness flag), `dirtyByMtime` (C1 backstop). 9/9 unit tests.
- CLI: `arete project mark-open <slug>` / `mark-dirty` / `mark-clear` / `list`, and `open` resume-block surfacing (read-only). 20/20 tests. Typecheck clean across core+cli.
- Skill prose: `/project-exit/SKILL.md` (friction budget, confirm-before-irreversible, no-hollow-line, work-product-not-transcript) + `/project` no-arg picker & resume surfacing.

**What's NOT done (by design / honesty):**
- **Increment B** (statusline script + SessionStart greeting hook) — needs `.claude/settings.json` decisions + manual verification in your real env. Deferred to you.
- **Skill behavior is prose-pinned, NOT soak-verified** — the capture-sweep recall, friction budget, and `dirty`-flip judgment only get proven once you run real `/project-exit` sessions. That's the soak.
- ~~**Full test suite not run**~~ **RESOLVED 2026-06-20:** full suite run via subagent — **4815 pass / 0 fail / 2 skip** in ~6.6 min (no stall this time). The 2 skips are pre-existing unconditional `it.skip` golden tests (`brief.test.ts:43`, `context.test.ts:42`) untouched by this branch. This branch's own tests: core 9/9, CLI mark-* 6/6, list 3/3. **Regression gate clean — no PR/Actions run needed.**
- One minor: `project list` reads `status` via a `^status:` regex on the README (the agent's noted deviation) — fine for frontmatter; a body-prose `status:` line could mis-read. One-line swap to `parseProjectReadme` if you care.

**Merge-readiness:** branch was cut from `main@29fc7553`; `main` has since advanced to `80349f65` (your two plan-only commits: `build-mode-claude-port`, `web-commitment-resolve-parity`). Neither touches any file this branch changes — `git merge-tree` shows **no conflicts**, clean merge expected. Rebase optional.

**Recommended morning sequence:**
1. `cd .claude/worktrees/project-exit && git log --oneline main..HEAD` to see the two commits.
2. Skim the diff; try the verbs live (`arete project list`, `mark-open`, `open`).
3. `npm test` (full suite) for the regression gate.
4. If happy: merge `feature/project-exit` → main (your call — I did not merge).
5. Then build **Increment B** (statusline + hook) with manual verification, and register project-exit's interfaces in the `build-mode-claude-port` plan (H8).
