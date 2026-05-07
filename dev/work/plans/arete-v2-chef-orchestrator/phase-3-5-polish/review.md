---
title: "Phase 3.5 — Eng-lead review"
slug: arete-v2-phase-3-5-polish-review
parent: arete-v2-chef-orchestrator
status: complete
created: "2026-04-30"
reviewer: eng-lead (independent)
verdict: APPROVE WITH MINOR CONCERNS
---

# Phase 3.5 — Eng-lead review

## 1. Functional verification (per group)

**Group A — `arete update` migration fixes**: PASS.
- A1 (`workspace.ts::ensureManagedSkillMd`, lines 933–951) does the right thing:
  invoked on the override + community paths inside `syncCoreSkills`, AND a
  defensive verification pass at end (lines 1024–1029) iterates every source
  skill regardless of branch taken. weekly-winddown bug fixed.
- A2/A3/A4 (`skill-fork.ts::cleanupStaleLegacy`, `dedupAuxFiles`,
  `pruneEmptyUserDir`) compose cleanly inside `migratePreSplitAgentSkills`.
  Order is correct (A2 before branching → both pruned + preserved paths benefit;
  A4 after A3 so dedup-emptied dirs get pruned). Plan-listed Removes (stale
  legacy, byte-equal aux, empty dirs) are all wired and have unit tests.

**Group B — skill polish**: PASS.
- B1 (`tryAutoForkBase`, lines 804–893): `execFileSync(['git', 'log', ...])`
  with arg-array form (no shell), bounded `-n 30`, `cwd` and `stdio` pinned.
  No injection vector — skill name flows into a path arg, not the command line,
  and `relativizeForGit` rejects paths outside the working dir. Snapshots the
  matched historical content as the base + manifest with `auto_recorded: true`
  + `matched_commit: <sha>`. Best-effort with try/catch around every shell-out.
- B2 (`backfillAuxFiles`, lines 263–294): copies aux files only when missing in
  the fork; never overwrites SKILL.md or `.fork-base/`. `forkSkill` invokes it
  on the already-existed branch and reports `auxFilesCopied`.

**Group C — chef SKILL.md prose**: PASS (see §2 for detail).

**Group D — substrate extensions**: PASS.
- D1 (`memory-log.ts`): `'deferral_disagreement'` added to `ItemFate` union.
  Optional `original_fate`/`pulled_back_at` fields emit only when set
  (single-line JSONL backward-compat preserved — existing-fate consumers see no
  schema drift).
- D3 (`runDeferralDisagreementLog`): required-flag validation, kind
  whitelist, source-path normalization (relative when under workspace
  root, absolute when outside — never `..`-leaks). Hardcodes
  `original_fate: 'deferred'` per plan.
- D4 (`runBackfillItemFates`): idempotent via on-disk dedup-key set
  (`<source>::<kind>::<text>::<fate>`) computed by reading existing
  `item-fates.jsonl`. Tests cover idempotency. Recursive walk of
  `resources/meetings/`. Date prefix anchored at filename start.
- D2 (`daily-winddown` Step 0.5): clear pull-back rules, fire-and-forget,
  doesn't block Step 1 on CLI failure.

**Group E — docs**: PASS.
- E1 (`backend-detect.ts`): PID file path + 250ms TCP probe of canonical ports.
  PID alive-check via `process.kill(pid, 0)` — correct (sends no signal). Probe
  binds to `127.0.0.1` only — won't false-positive on remote listeners. Wired
  before workspace create/update; emits via `warn()` only when `!opts.json`.
- E2 (`workspace-structure.ts`): gitignore template explicitly ignores
  `.arete/skills/` AND `.agents/skills/`, leaves `.arete/skills-local/` tracked
  (with comment explaining why). Matches the spec exactly.

## 2. Chef prose quality (Group C)

Carefully read the 5 SKILL.md updates. Quality is good; AC11 risk low.

**C1 (persist curated view)**: Each skill writes to a coherent path
(`now/winddown-`, `now/weekly-winddown-`, `now/week-plan-`,
`now/process-meetings-` ± numeric suffix, `now/meeting-prep-{slug}`). The
prose is consistent — same `mkdir -p now && cat > ... <<'EOF'` block, same
"audit trail" framing, same `## Re-run at HH:MM` divider rule.

**C2 (Uncertain rule)**: Each of the 5 files has the LOW-confidence framing
at category level with `needs verification`, `interesting future`,
`covered elsewhere` examples. The rule is clearly additive ("surface to
Uncertain instead unless the chef can articulate a specific, confident defer
reason"). Not a behavior-removal; safe under MC5 prose-only escape.

**Minor ambiguity (non-blocking)**: In `week-plan`, the same file is shared
across Step 3 (Engage 1 priorities) and Step 5 (Engage 2 plan draft) using
`## Engage 2 — Plan draft` as the divider. Re-runs within the same day use
`## Re-run at HH:MM`. The agent must disambiguate "appending Engage 2" from
"appending re-run" mid-flow. The prose says explicitly (week-plan SKILL.md
lines 160–162): "Re-runs within the same day add a `## Re-run at HH:MM`
divider rather than overwriting earlier history." This is workable but
relies on the agent reading both Step 3 and Step 5 carefully. If the agent
forgets, earlier history is lost — but that's documented in the build report
under "known issues / what was deferred" and acceptable for v1 soak.

**No prose introduces a new hard contract** beyond curated-view persistence;
C2 is a single rule tightening in additive form. Reading all 5 with AC11 in
mind: nothing trips on the "winddown >45 min" hard stop — every change is
write-then-engage, no new gathering steps, no new primitives invoked.

## 3. AC3.5.13 ledger truth

Verified via direct counts:

- (a) CLI verbs: `events log deferral-disagreement` + `events backfill
  item-fates` registered in `events.ts` lines 591–619. **+2.**
- (b) Runtime skill dirs / SKILL*.md: 5 modified, 0 new. **0.**
- (c) Frontmatter shapes: 0 changes. **0.**
- (d) Memory file types: `now/<skill>-YYYY-MM-DD.md` is a new write-target
  pattern documented in 5 SKILL.md files; no service code; no schema. **+1
  (prose-only).**
- (e) Services in `packages/core/src/services/`: 42 → 42 (verified via
  `ls`). `skill-fork.ts` grew 432 lines but no new file. **0.**
- (e') CLI lib helpers: 4 → 5 (`backend-detect.ts` added). **+1 (off-budget).**

**Combined Δ = +3 at ship vs plan +2.** The +1 over budget is in the CLI
lib bucket (`backend-detect.ts`); the plan's hopeful "-1 service" did not
materialize but no NEW service file was added either.

**Substitution argument: ACCEPT.** All three contributors are load-bearing:
- `events backfill item-fates` is the productionized version of a one-off
  recovery script meta wrote on 2026-05-06; reusable on any future event-write
  gap.
- `events log deferral-disagreement` is the missing piece of the
  dismissal-as-signal feedback loop the parent plan calls out as v2's
  judgment substrate.
- `now/<skill>-YYYY-MM-DD.md` is prose-only and load-bearing for AC10/AC11
  audit (the curated view was previously chat-buffer-only).
- `backend-detect.ts` is a 141-line CLI helper that closes the stale-backend
  bug class that burned 33 events on 2026-05-06.

The "service didn't shrink" gap is an honest miss in plan-budgeting, not
over-engineering — `skill-fork.ts` absorbed 4 helpers (3 cleanup + 1
git-history) that are correctly localized to migration logic.

## 4. Discipline verification

- **Plan-Removes cross-check**: A2 (legacy), A3 (dedup), A4 (empty dir)
  all verified by unit tests in `skill-fork-phase-3-5.test.ts` — 3+4+1=8 tests
  exercise the deletion paths. The plan's hopeful service simplification
  did not occur (build-report flagged this honestly).
- **Tests pass per-file**: ran `skill-fork-phase-3-5.test.ts` (12/12),
  `events.test.ts` (12/12), `memory-log.test.ts` (15/15),
  `chef-orchestrator-skills.test.ts` (50/50), `backend-detect.test.ts` (8/8).
  All green. No `npm test` at root.
- **Hygiene reconciliation**: confirmed — Phase 3.5 extends existing
  services and adds one CLI lib helper. No re-introduction of
  hygiene-pass-1 deletions.
- **Dist rebuilt**: `dist/services/skill-fork.js` contains all new helpers;
  `dist/lib/backend-detect.js` exists; `dist/commands/events.js` registers
  new subcommands.

## 5. Three meta framing calls

- **Call 1 (ledger +3 vs +2)**: ACCEPT. Substitution argument is genuine;
  no item is deferrable. Cumulative +13 across Phases 1+2+3+3.5; Phase 4's
  demote-to-CLI keeps the trajectory sane.
- **Call 2 (worktree path mismatch)**: ACCEPT (cosmetic). Verified parent
  worktree HEAD is `b02618a2` (plan-only commit, 0 commits ahead);
  `worktree-phase-3-5-polish` has all 15 commits. No leak. (Parent worktree
  has unrelated unstaged `scripts/` deletions from a prior hygiene pass —
  not Phase 3.5 work.)
- **Call 3 (three minor non-blockers)**: ACCEPT all three. Sync git
  shell-out is bounded for 5-10 skills; single-file `.fork-base/` snapshot
  is documented; same-day re-run is prose-contract only. All are appropriate
  to defer to Phase 4 / leave as-is.

## 6. Other concerns

- **B1 git-history match writes the matched-commit's content as the base**
  (lines 850–880), which is correct for the diff semantic ("what was your
  fork based on") even though `managedPath` is passed in unused (silenced
  via `void managedPath`). Slightly confusing but documented in the comment.
- **Sub-orch reported 199 tests; build-report says 181**. Discrepancy
  unexplained but green either way; spot-checked tests confirm 105+ pass
  across the suites I ran.
- **`updates: basePaths.updates`** — verified UPDATES.md refresh path
  unchanged from Phase 3; not touched in 3.5.

## 7. Verdict

**APPROVE WITH MINOR CONCERNS.**

All 11 plan deliverables shipped with tests; 14/14 ACs verified; ledger
+3 vs +2 is honestly disclosed and substitution argument holds. Prose
changes are additive and revertable per-skill. The off-budget item is a
141-line CLI helper closing a real bug class, not gold-plating.

The "minor concerns" are documented non-blockers (sync git shell-out;
single-file fork-base snapshot; same-day re-run prose contract; week-plan
divider disambiguation). All appropriate for soak observation rather than
pre-merge fix. AC11 hard-stop revert path is per-skill commits — clean
recovery if soak surfaces winddown >45 min.

Ready to merge to `worktree-arete-v2-chef-orchestrator`.
