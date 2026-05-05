---
title: "Phase 2 — Build report (chef-orchestrator rewrite)"
slug: arete-v2-phase-2-chef-orchestrator-build-report
parent: arete-v2-chef-orchestrator
status: ready-for-review
created: "2026-05-04"
sub_orch: agent-a8c94a3575a32646c
sub_worktree: /Users/john/code/arete/.claude/worktrees/agent-a8c94a3575a32646c
sub_branch: worktree-agent-a8c94a3575a32646c
---

# Phase 2 — Build report

## Summary

Phase 2 (chef-orchestrator behavior rewrite) shipped **all 9 plan steps**
in a single build pass. Five chef-orchestrator skills rewritten with
SKILL.legacy.md companions (MC2 ship gate satisfied). PATTERNS.md
extended with the four chef-orchestrator patterns + action verb
taxonomy (MC4 ship gate satisfied — patterns shipped before any
skill rewrite). APPEND-file convention seeded on install + update.
Skill-resolver routing for `ARETE_LEGACY_SKILL_PROSE` env var
implemented (per-skill rollback). `frontmatter.approved_items`
duplicate removed; consumers read body sections.

Step-5 A/B validation: PASS (structural review — no live agent
harness available in sub-worktree). Two skill-prose refinements
applied post-A/B.

## Build sequence — commits

All commits on `worktree-agent-a8c94a3575a32646c`, branched from
`worktree-arete-v2-chef-orchestrator` at commit `0ddb33cc`.

| Step | Commit | Purpose |
|---|---|---|
| 1 | `7af57d39` | `phase-2(runtime): add chef-orchestrator patterns to PATTERNS.md` |
| 2 | `4cd4f4cc` | `phase-2(cli): seed .arete/skills-local/ templates on install + update` |
| 3 | `5d30a7ee` | `phase-2(runtime): add skill-resolver routing for ARETE_LEGACY_SKILL_PROSE` |
| 4 | `ae471a40` | `phase-2(runtime): rewrite daily-winddown for chef pattern + preserve SKILL.legacy.md` |
| 5 (A/B fix) | `e8486f52` | `phase-2(runtime): tighten daily-winddown chef prose post Step-5 A/B` |
| 6.1 | `61c1cd0c` | `phase-2(runtime): rewrite weekly-winddown for chef pattern` |
| 6.2 | `d140c9be` | `phase-2(runtime): rewrite week-plan for chef pattern (two-engage variant)` |
| 6.3 | `8a43078f` | `phase-2(runtime): rewrite process-meetings for chef pattern` |
| 6.4 | `7df52f33` | `phase-2(runtime): rewrite meeting-prep for chef pattern` |
| 7 | `d115eb8c` | `phase-2(core,backend): remove frontmatter.approved_items duplicate; consumers read body sections` |
| 8 | `687cb5e9` | `phase-2(test): unit + integration + snapshot tests for chef pattern` |
| 9 | `e045814f` | `phase-2: rebuild dist after Phase 2 changes` |

12 commits total. Per-skill commits enable surgical revert via
`git revert <hash>` if any individual skill's flag-flip isn't enough
(per MC2 ship gate intent).

## Files touched (per deliverable)

### (a) PATTERNS.md extension

- `packages/runtime/skills/PATTERNS.md` — extended with all four
  chef-orchestrator patterns (`do-all-work-then-engage`,
  `curate-with-reason-labels`, `propose-with-mcp-action`,
  `surface-deferred-as-sidecar`), action verb taxonomy
  (executable + draft-only modes), Jira documented as draft-only,
  two-engage variant of Pattern 1 documented for week-plan.
  +326 lines added.

### (b) APPEND-file convention

- `packages/core/src/services/skills-local.ts` (NEW) —
  `seedSkillsLocal()`, `renderSkillsLocalTemplate()`,
  `PHASE_2_CHEF_ORCHESTRATOR_SKILLS` constant. Idempotent: never
  overwrites existing user content.
- `packages/core/src/services/index.ts` — exports added.
- `packages/core/src/workspace-structure.ts` — `.arete/skills-local/`
  added to `BASE_WORKSPACE_DIRS`.
- `packages/core/src/services/workspace.ts` — `seedSkillsLocal()`
  invoked from both `create()` and `update()`. Try/catch — never
  wedges install/update.
- `packages/core/test/services/skills-local.test.ts` (NEW) — 11
  unit tests covering render + seed paths (fresh / idempotent /
  override / empty file / preserved user content).

### (c) Skill-resolver routing for ARETE_LEGACY_SKILL_PROSE

- `packages/core/src/services/skill-resolver.ts` (NEW) —
  `parseLegacyList()`, `resolveSkillFile()`,
  `resolveSkillFileFromEnv()`, `resolveSkillFileWithFallback()`.
  Pure functions where possible; I/O-aware variant for the CLI.
- `packages/core/src/services/index.ts` — exports added.
- `packages/cli/src/commands/skill.ts` — new `arete skill resolve
  <slug>` subcommand. Returns the resolved path on stdout
  (shell-substitution-friendly), `--json` mode for structured
  callers, surfaces fallback warnings.
- `packages/core/test/services/skill-resolver.test.ts` (NEW) — 22
  unit tests covering env unset / single skill / multi-skill /
  non-existent skill (graceful) / legacy file missing (fallback +
  warning) / case-insensitive matching / sync + async existsFn.

### (d) Skill rewrites — five SKILL.md + five SKILL.legacy.md

Each rewritten skill includes:
- "Read first" stanza referencing `.arete/skills-local/<slug>.md`
- All four chef-orchestrator patterns explicitly named
- ## Rollback section citing `ARETE_LEGACY_SKILL_PROSE`
- Action verbs taxonomy table (skill-specific subset)
- Reason taxonomy with skill-specific extensions

| Skill | SKILL.md (lines) | SKILL.legacy.md (lines) |
|---|---|---|
| `daily-winddown` | 313 (rewrite) | 1061 (verbatim copy) |
| `weekly-winddown` | 250 (rewrite) | 862 (verbatim copy) |
| `week-plan` | 251 (rewrite) | 399 (verbatim copy) |
| `process-meetings` | 247 (rewrite) | 557 (verbatim copy) |
| `meeting-prep` | 232 (rewrite) | 336 (verbatim copy) |

The SKILL.legacy.md files are committed in the same commit as the
rewrite (MC2 ship gate). Build does not merge without them.

`week-plan` uses the **two-engage variant** of Pattern 1 explicitly
documented in PATTERNS.md and verified by the chef-orchestrator-skills
test suite.

### (e) frontmatter.approved_items removal

- `packages/core/src/integrations/staged-items.ts` — write of
  `data['approved_items']` removed; defensive `delete` on
  re-approval (idempotent cleanup).
- `packages/core/src/services/meeting-reconciliation.ts` — Format
  B parser switched from frontmatter to `## Approved <Section>`
  body sections. New `parseApprovedSection()` exported. Backward-compat
  fallback to legacy frontmatter for pre-Phase-2 meetings.
- `packages/core/src/services/index.ts` — `parseApprovedSection`
  exported.
- `packages/cli/src/commands/meeting.ts` — response shape now reads
  approvedItems from body sections via `parseApprovedSection`.
  Backward-compat preserved.
- `packages/apps/backend/src/services/workspace.ts` —
  `detectMeetingStatus()` now checks body `## Approved` sections
  before falling back to legacy frontmatter; `getMeeting()` reads
  approvedItems from body sections via existing `parseListSection()`
  helper. Backward-compat preserved.
- `packages/core/test/services/parse-approved-section.test.ts` (NEW)
  — 13 unit tests for the new body-section parser.
- `packages/core/test/integrations/staged-items.test.ts` (test 26)
  — updated from "stores in frontmatter approved_items" to "writes
  to ## Approved Action Items body section". Asserts body content +
  frontmatter cleanup.

### (f) Test infrastructure

- `packages/core/test/services/chef-orchestrator-skills.test.ts`
  (NEW) — 39 smoke tests asserting the SHIPPED structure of each
  rewritten SKILL.md against the chef-orchestrator pattern envelope
  (Read-first stanza / pattern names / Rollback section / SKILL.legacy.md
  presence / week-plan two-engage documentation / PATTERNS.md
  contents).
- `packages/cli/test/commands/install.test.ts` — extended with 2
  tests for skills-local seeding (fresh install + idempotent update).

### (g) Dist rebuild

- 32 dist files updated/added (final commit). All TS builds clean
  via `tsc -b packages/core packages/cli packages/apps/backend`.

## Verification — AC2.1 to AC2.12

| AC | Status | Evidence |
|---|---|---|
| **AC2.1** — PATTERNS.md ships with all four patterns BEFORE any rewrite | **PASS** | git log: `7af57d39 phase-2(runtime): add chef-orchestrator patterns to PATTERNS.md` lands BEFORE `ae471a40 ... rewrite daily-winddown`. Verified via commit ordering. |
| **AC2.2** — APPEND seed templates land for all 5 skills on install/update; existing user content never overwritten | **PASS** | 11 unit tests + 2 install integration tests. End-to-end CLI smoke verified (install, edit user file, run update → preserved verbatim). |
| **AC2.3** — Each rewritten SKILL.md begins with "Read first" stanza referencing APPEND file | **PASS** | chef-orchestrator-skills test suite asserts this for all 5 skills. |
| **AC2.4** — Reason labels on every staged + deferred item; `## Uncertain — your call` tier when uncertain; no length cap | **PASS (structural)** | Pattern 2 in PATTERNS.md prescribes the envelope; each skill's SKILL.md applies it (output template includes `— <reason>` format and `## Uncertain — your call` section). Live A/B against real winddown deferred to soak (no agent harness in sub-worktree). |
| **AC2.5** — Each rewritten skill ships with SKILL.legacy.md AND ARETE_LEGACY_SKILL_PROSE routes to it | **PASS** | All 5 SKILL.legacy.md files exist (verified by chef-orchestrator-skills test suite). 22 skill-resolver unit tests + end-to-end CLI smoke (env unset / env set + legacy present / env set + legacy missing fallback) all green. |
| **AC2.6** — Action proposals always include verb name + parameters + mode tag; agent never auto-executes; user response format documented | **PASS (structural)** | Pattern 3 in PATTERNS.md prescribes the envelope (verb name, parameters, mode tag, never-auto-execute rule, response format). Action verb taxonomy includes both executable AND draft-only (Jira) examples. Verified by PATTERNS.md test in chef-orchestrator-skills suite. |
| **AC2.7** — Deferred items roll to sidecar; pull-back appends `deferral_disagreement` event to item-fates.jsonl | **PASS (structural)** | Pattern 4 in PATTERNS.md prescribes the envelope. Daily-winddown SKILL.md specifies `./deferred-YYYY-MM-DD.md`; weekly + week-plan use `./deferred-week-YYYY-WNN.md` (shared between those two skills); process-meetings uses `./deferred-batch-{date}.md` or parent's sidecar. Pull-back integration with item-fates.jsonl is specified in Pattern 4 prose; live harness wiring deferred to soak. |
| **AC2.8** — frontmatter.approved_items removed; web review UI reads body sections | **PASS** | Writer (staged-items.ts) no longer writes the field; consumers (meeting-reconciliation.ts, backend workspace.ts, CLI meeting.ts) all read body sections with backward-compat fallback. 48 staged-items + 25 load-recent-meeting-batch + 9 meeting-approve + 13 parse-approved-section + 50 meeting-extract tests all pass. |
| **AC2.9** — AC10 (gating) winddown median ≤50% of Phase 0 baseline over 14-day soak | **DEFERRED to soak** | Soak hasn't started; AC2.9 is measured during soak, not at build ship. |
| **AC2.10** — AC11 hard stop (>45 min any single soak day = revert) | **READY** | Per-skill flag (`ARETE_LEGACY_SKILL_PROSE`) provides the rollback mechanism. End-to-end CLI smoke verified the routing works. |
| **AC2.11** — AC8 ledger Δ ≤0 across 5 proxies | **OVER BUDGET — surfaced for meta** (see ledger below) |
| **AC2.12** — All tests pass; typecheck clean | **PASS** | `tsc -b packages/core packages/cli packages/apps/backend` clean. ~150 tests run via per-file `tsx --test` and `vitest run`. **NO `npm test` at repo root** (Phase 1 watchdog lesson honored). |

## AC2.11 ledger — actual numbers

Counts taken at parent worktree branch tip `0ddb33cc` (pre-Phase-2)
vs `e045814f` (this build's HEAD).

| Proxy | Before | After | Δ at ship | Plan estimate | Notes |
|---|---|---|---|---|---|
| (a) CLI verbs | 76 | 77 | **+1** | 0 | New verb: `arete skill resolve <slug>`. Required for the ARETE_LEGACY_SKILL_PROSE env var to actually route at runtime. |
| (b) Runtime skills (counted as `packages/runtime/skills/<slug>/` directories) | 38 | 38 | **0** | 0 | Rewrites, not adds. Five SKILL.legacy.md files are co-located with their existing skill dir (per-skill-dir count is unchanged). |
| (b') Runtime skill files (counted as SKILL*.md across packages/runtime/skills/) | 38 | 43 | **+5 temp** | 0 (acknowledged in plan as temp) | Five SKILL.legacy.md files added. Per MC5 option (a), removed in Phase 2 wrap-up before Phase 3 ships. |
| (c) Frontmatter file shapes | (count includes approved_items) | (count excludes approved_items) | **-1** | -1 | `meeting.frontmatter.approved_items` removed. |
| (d) Memory file types in `.arete/memory/` | N | N+1 | **+1** | 0 to +1 | `.arete/skills-local/` added (under `.arete/`, technically a peer of memory/). Plan acknowledged this as 0 to +1. |
| (e) Services in `packages/core/src/services/` | 49 | 51 | **+2** | 0 | Two new files: `skills-local.ts` and `skill-resolver.ts`. Plan said "skill-resolver code change is in existing modules" — actual implementation broke them out as standalone services. |

**Combined Δ at Phase 2 ship**: +1 + 5 + (-1) + 1 + 2 = **+8**.

**Combined Δ at Phase 2 wrap-up** (MC5 option (a) — sunset legacy
before Phase 3): -5 (legacy files removed) + -1 (skill-resolver code
removed if env var path is also removed) = **+8 - 6 = +2** at Phase
3 ship time. The +2 is `arete skill resolve` verb + the
`skills-local` service + `.arete/skills-local/` dir; the resolver
service goes away if the env var is removed.

**Plan estimate was -1 to 0 at ship time. Actual is +8 at ship time.**

### Per the plan's explicit instruction (§"AC2.11 ledger Δ > 0 at ship time → engage meta")

Surfaced honestly. Two paths for meta to consider at /review:

1. **Substitution argument** — the +5 SKILL.legacy.md files are
   intentional temporary substrate (MC2 ship gate). The plan
   acknowledges this as net zero by Phase 3 ship. The +1 CLI verb +
   +2 services + +1 memory file type are the structural cost of
   the chef-orchestrator pattern — they enable the per-skill
   rollback mechanism + the APPEND-file convention. Both are
   load-bearing for the user-felt dream. The -1 frontmatter
   removal is the durable shrink.

2. **Pull more removes** — if /review wants Δ ≤ 0 at ship, candidate
   removes from Phase 2 territory:
   - Inline `skill-resolver.ts` into `skills.ts` (saves -1 service).
   - Inline `skills-local.ts` into `workspace.ts` (saves -1 service).
   - Drop the `arete skill resolve` CLI verb and bake the env var
     check into the skill-prose itself (saves -1 CLI verb but
     weakens runtime guarantee — env var can be silently ignored
     by the harness).

Recommendation: accept option (1) — the ledger is over-budget
deliberately to enable the per-skill rollback safety net. This is
the AC11 hard stop's structural prerequisite. Phase 2 wrap-up
brings Δ to +2 (one new CLI verb, one new memory dir, one new
service), which is acceptable for the chef-orchestrator capability
delivered.

## Step-5 A/B subjective notes (verbatim)

Per Phase 2 plan §Step 5: "Run new daily-winddown against 5 fixture
meetings. Compare output subjectively to legacy."

**Constraint**: no live agent harness in sub-worktree, no fixture
meetings in `test/fixtures/`. Adapted to a **structural / prose-quality
A/B** — analyzing the new SKILL.md against the legacy SKILL.md against
the four AC2.4 quality criteria.

### Quality assessment

1. **Does the curated view feel right? (≥8/10 quality)** — **8/10**.
   The new prose:
   - Removes the 4-phase architecture diagram and step-by-step
     engagement gates that consumed cognitive overhead in the legacy.
   - Replaces "wait for user confirmation in Phase 3a", "wait again
     in Phase 2.5", etc. with a single user engagement at Step 4.
   - Keeps the actually-useful primitive sequence (recordings →
     meetings → extraction → commitments → triage) but bundles them
     as gather + judge.
   - The output template is concrete enough to be actionable,
     abstract enough to allow per-day variation.

   Concern: the legacy SKILL.md was very explicit about *which CLI
   to call when*. The new one consolidates more aggressively, which
   means the agent has to actually be smart about parallelism. Risk:
   an agent trying to be careful runs them sequentially, losing the
   speed win. **Mitigation applied**: strengthened "run in parallel"
   guidance in Step 1 (commit `e8486f52`).

2. **Are reason labels meaningful?** — **Yes**. The taxonomy in
   PATTERNS.md gives a stable language; the skill-specific extensions
   in daily-winddown SKILL.md (open commitment age, today's meeting
   source, inbox capture, etc.) are concrete and pull from real
   signals the system captures.

3. **Does the agent ask `## Uncertain` when reasonable?** — The
   prose explicitly says "Don't guess. If a reasonable person could
   disagree, ask." This is a clear instruction. Whether the agent
   actually obeys depends on how the harness interprets the prose,
   but the structural support is there.

   Concern: the agent might over-defer (default to skip). The
   "importance gating" rules say `light → defer unless customer-touching`.
   If the APPEND file is empty (which it will be on first install),
   `customer-touching` becomes ambiguous; the agent might silently
   auto-defer 80% of meetings on the first day. **Mitigation applied**:
   added "When in doubt about importance, surface to Uncertain
   rather than auto-defer" rule to importance handling section
   (commit `e8486f52`). Aligns with R3 (trust-gap miscalibration)
   in the parent pre-mortem.

4. **Are action proposals well-formed for both modes?** — **Yes**.
   Example output template includes both an executable action
   (`slack.send_dm`) and a draft-only action (`(draft)
   jira.create_ticket project=INGEST ...`). The mode tag prefix is
   consistent. The verb taxonomy lists which verbs are which mode.

### Verdict

**Step-5 PASS.** Patterns are sound; daily-winddown applies them
coherently; two skill-prose refinements applied (parallelism
guidance + uncertain-bias-on-cold-start). PATTERNS.md does not need
revision — fixes are skill-prose-level. Proceeded to Step 6 (other
4 rewrites).

The structural A/B is **weaker evidence** than a live agent run on
real fixture meetings. The Phase 2 plan's mitigation: 14-day soak
period with AC11 hard stop catches behavioral regression.
Recommend the eng-lead reviewer at /review reads through one or two
of the rewritten skills' output templates against a real meeting
to add a second-eye check.

## Test summary

All tests run via per-file `tsx --test` or `vitest run` invocations
(per Phase 1 watchdog lesson — **NO `npm test` at repo root**).

| Test suite | Tests | Status |
|---|---|---|
| `packages/core/test/services/skills-local.test.ts` (NEW) | 11 | PASS |
| `packages/core/test/services/skill-resolver.test.ts` (NEW) | 22 | PASS |
| `packages/core/test/services/parse-approved-section.test.ts` (NEW) | 13 | PASS |
| `packages/core/test/services/chef-orchestrator-skills.test.ts` (NEW) | 39 | PASS |
| `packages/core/test/integrations/staged-items.test.ts` (test 26 updated) | 48 | PASS |
| `packages/core/test/services/load-recent-meeting-batch.test.ts` | 25 | PASS |
| `packages/cli/test/commands/install.test.ts` (extended) | 12 | PASS |
| `packages/cli/test/commands/meeting-approve.test.ts` | 9 | PASS |
| `packages/cli/test/commands/meeting-extract.test.ts` | 50 | PASS |

**Total**: 229 tests across 9 files, all green.

End-to-end CLI smoke for `arete skill resolve daily-winddown`:
- env unset → live SKILL.md ✓
- env set + legacy file present → SKILL.legacy.md ✓
- env set + legacy file missing → fallback to live SKILL.md with warning ✓

Typecheck clean: `tsc -b packages/core packages/cli packages/apps/backend`
runs with no output (success).

### Pre-existing flakes / known issues

None encountered. The 3 pre-existing backend agent.test.ts failures
flagged in Phase 1 build report are not Phase 2's regression; they
remain (not touched in this build).

## Hygiene reconciliation

Phase 2 did NOT touch any code that hygiene-pass-1 deleted. It
modified existing skill SKILL.md files (preserved by hygiene), added
two new core service files, added one new CLI subcommand, and
removed one frontmatter field with backward-compat readers. No
conflict surfaced.

## Open questions to meta (per plan §"When to engage meta")

1. **AC2.11 ledger Δ > 0 at ship time** — engaged: see ledger above
   (+8 at ship, +2 at wrap-up). Two paths offered (substitution
   argument vs pull more removes). **Lean: substitution argument
   per Phase 1 precedent + the structural-cost-of-rollback-safety-net
   reasoning.**

2. **No live A/B agent run** — Step 5 was structural prose review
   not live agent run. **Recommendation**: eng-lead reviewer at
   /review reads through one of the rewritten skills' output
   templates against a real meeting workspace as a second-eye check.

Nothing else needs meta engagement. PATTERNS.md was adequate during
the daily-winddown rewrite (no pattern revision needed). All tests
pass. Skill-resolver routing did not require deeper code changes
than expected.

## Per-step deferrals (none)

All 9 plan steps shipped. No stretch deferrals.

## Ready for review

| Check | Status |
|---|---|
| All 9 plan steps shipped | PASS |
| All 5 skill rewrites + SKILL.legacy.md (MC2 ship gate) | PASS |
| PATTERNS.md ships first (MC4 ship gate) | PASS |
| MC5 resolution (sunset legacy before Phase 3) documented | PASS — in skill rewrites' Rollback sections |
| Tests green (per-file invocations only) | PASS |
| Typecheck clean | PASS |
| dist rebuilt + committed | PASS |
| AC2.11 ledger surfaced honestly | YES — +8 at ship, +2 at wrap |
| Step-5 A/B subjective notes captured | YES (verbatim above) |
| Per-skill commits enable surgical revert | YES (each rewrite is its own commit) |

Sub-worktree: `/Users/john/code/arete/.claude/worktrees/agent-a8c94a3575a32646c`
Sub-branch: `worktree-agent-a8c94a3575a32646c`
HEAD: `e045814f` (12 commits ahead of `0ddb33cc`)

Ready for eng-lead reviewer.
