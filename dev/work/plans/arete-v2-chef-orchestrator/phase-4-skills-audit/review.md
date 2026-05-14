---
title: "Phase 4 — Eng-lead review"
slug: arete-v2-phase-4-skills-audit-review
parent: arete-v2-chef-orchestrator
status: complete
created: "2026-05-15"
reviewer: eng-lead (independent)
verdict: APPROVE WITH MINOR CONCERNS
---

# Phase 4 — Eng-lead review

## 1. Functional verification

**9 demotions: OK.** Per-skill commits cleanly delete each skill dir
(`git ls-tree -r HEAD -- packages/runtime/skills/` confirms zero
surviving files for any of the 9). Commit bodies document CLI parity
per skill. People-intelligence policy lives in user workspace config
(`context/people-intelligence-policy.json`), not in the shipped
package — the "policy-as-config preserved" claim is structurally
correct (no shipped policy file existed to preserve; user-side
config untouched by skill deletion).

**3 drops: OK.** `daily-plan` (user-confirmed unused), `week-review`
(weekly-winddown absorbs triggers), `generate-mockup` (tombstone
only README.md). No consumers grep-cleanly for `generate-mockup`.
The `weekly-winddown/SKILL.md` correctly references the legacy
`week-review` only inside a "former skill, now subsumed" note.

**4 chef rewrites: OK.** All four (inbox-triage, email-triage,
slack-digest, schedule-meeting) include `## Read first` →
`.arete/skills-local/<slug>.md`, persist directive to
`now/archive/<slug>/<slug>-...md`, all 4 pattern names referenced,
Uncertain-tier guidance present. No `SKILL.legacy.md` files exist
(MC5 sunset honored). Per-skill commits enable surgical revert.
APPEND-file seeding cleanly extended: `CHEF_ORCHESTRATOR_SKILLS` is
union of Phase 2 (5) + Phase 4 (4) = 9, tests assert all 9 seed.

## 2. AC4.7 ledger truth

**Independent count of runtime skill dirs**: baseline 40 → ship 28
→ **Δ = -12**. Within plan band (-9 to -15). Sub-orch claim verified.

**Cumulative across phases**: my independent structural-proxy count
of `9d26005c` (pre-v2 main) vs Phase 4 HEAD:
- Runtime skill dirs: 40 → 28 = **-12**
- Core services (`packages/core/src/services/*.ts`): 37 → 43 = **+6**
  (org-entity, skill-fork, skill-resolver, skills-local,
  slack-heuristic, summary-writer)
- CLI lib helpers: 4 → 5 = **+1** (backend-detect)
- CLI verbs registered: +2 (cost, events)
- Memory file types: +1 to +2 (item-fates.jsonl + .arete/skills-local/)
- Frontmatter shapes: net +1 (SourceSummary, OrgEntity — approved_items)

**Conservative 5-proxy cumulative**: -12 + 2 + 1 + 2 + 6 = **-1**
(or up to -4 if approved_items / per-skill SKILL.legacy.md sunsets
that already-shipped MC5 are counted differently).

**Discrepancy with sub-orch's claim of ~-5**: sub-orch's per-phase
table omits Phase 0's +3 (lists Phase 0 as Δ=0/cumulative=0 — wrong;
Phase 0 was +3 per its own build-report). Adding Phase 0 back:
3+2+0+3-12 = **-4**, close to sub-orch's -5. Either way: the
**stretch goal "cumulative ≤0 at Phase 4 wrap" IS hit** by an
independent structural count. The exact magnitude (-1 to -5) is
sensitive to memory-file-type and service-sub-proxy choices, but
the *sign* is unambiguous. Discipline-math milestone genuinely
landed.

## 3. Group C deferrals

**Sound, not work-dodging.** Each of the 7 deferred skills has a
consumer-ref count + brief justification (e.g., "Heavy consumer
surface (synthesize, finalize-project, getting-started reference
it). Chef-rewrite is reasonable; defer for scope discipline.").
The reasoning is the AC11 hard-stop residual risk — applying chef
pattern to skills whose user-felt pain isn't characterized risks
degrading working workflows. Recommended follow-on triage
(`create-prd`, `discovery`, `synthesize`, `wrap`/`finalize-project`
convergence) is actionable. Defer-list is the right discipline call
for a phase already at -12.

## 4. In-flight scope additions

**(a) Gmail `--query` gap-fill**: minimal. `pullGmailHelper` now
accepts `opts.query` and passes it through to `provider.searchThreads`
when set; default importance-gated path preserved when no query.
Single-purpose, scope-justified by `email-search` demotion. No
expansion beyond what the demotion required.

**(b) Phase 3.5 test regression fix-up**: legitimate. The Phase 3.5
followup commit `7ca3ea47` moved curated-view paths from
`now/<skill>-...md` to `now/archive/<skill>/<skill>-...md` but did
not update `chef-orchestrator-skills.test.ts`. Phase 4 fixed in-flight
as part of extending the suite to the 4 new chef skills. Test now
correctly asserts archive path for all 9 chef skills (Phase 2 + 4).
**Flag**: Phase 3.5 test coverage was incomplete; the followup commit
should have updated the assertion in the same change. Note for Phase
3.5 retrospective; not a Phase 4 blocker.

## 5. Discipline verification

**AC4.10 disposition table — PARTIAL MISS.** The build-report's
"final disposition table for ALL 40 shipped skills" omits four
Group D AUDIT candidates: `prepare-meeting-agenda`, `quarter-plan`,
`goals-alignment`, `periodic-review`. These survive in the codebase
but appear nowhere in the disposition table. Plan §Group D explicitly
called them out for AUDIT verdicts. Sub-orch's math claims "40
accounted" but the actual entry count is 36. **MINOR CONCERN** —
needs disposition rows added before merge or in a quick fix-up.

**AC4.9 — PARTIAL MISS.** Sub-orch claims "grep verified: no
surviving SKILL.md references the 9 demoted skills or the 3 dropped
skills." Reality:
- `packages/runtime/skills/PATTERNS.md` still references `daily-plan`
  in 5 places (lines 81, 111, 216, 688, 742) and `week-review` in
  4 places (lines 102, 561, 567, 773). The 78ee9e1c cleanup commit
  only addressed Group A demoted-skill refs; the Group D drop
  commits did not extend that cleanup to PATTERNS.md.
- `packages/runtime/skills/README.md` still lists `week-review`
  (line 15) and `daily-plan` (line 47).
- `packages/runtime/skills/week-plan/LEARNINGS.md` references
  `daily-plan` in 6 places.
- `packages/runtime/skills/week-plan/templates/week-priorities.md`
  references `daily-plan` in 2 places.

**MINOR CONCERN** — agents are unlikely to route to deleted skills
based on PATTERNS.md "Used by" hints (the trigger paths are gone),
but the documentation drift is real and the sub-orch's AC4.9 claim
is over-stated. Should be a small follow-up commit to clean up.

**Hygiene reconciliation: OK.** Phase 4 did not touch
hygiene-pass-1 deletions. Demoted skills' CLI verbs predate hygiene.
Drops are genuine pre-Phase-4 shipped skills (git history confirms).

**Tests: OK.** Spot-checked `chef-orchestrator-skills.test.ts`
(86/86 pass) and `skills-local.test.ts` (12/12 pass) via per-file
`tsx --test`. No `npm test` at root.

**dist rebuilt: OK.** dist commits reflect source — Phase 4 four
slugs present in `packages/core/dist/services/skills-local.js`.

## 6. Other concerns

- The disposition-counts table at line 168 of build-report.md
  uses fuzzy overlap-counting math ("4 leave-as-is overlap
  categories"). The combinatorial arithmetic only "hits 40" if you
  squint. With proper accounting (separate rows per skill, no
  overlaps), 4 skills are unaccounted (AC4.10 concern above).
- `daily-plan` triggers — sub-orch's open question #3 surfaces a
  real risk: no skill absorbs "Plan my day". Getting-started
  guidance redirects, but a user invoking the trigger phrase in
  the wild will hit a no-match. Recommendation: track in Phase 4
  soak; consider folding into `daily-winddown` if it bites.

## 7. Verdict

**APPROVE WITH MINOR CONCERNS.**

The discipline-math milestone genuinely landed: Δ = -12 verified;
cumulative ≤0 across v2 verified by independent count. The 9 demotions
+ 3 drops + 4 chef rewrites + Group C audit are solid work, properly
scoped, with per-skill commits enabling surgical revert. APPEND
seeding extension is clean; tests pass.

Two minor concerns warrant a follow-up commit before main merge
(not blocking — both are documentation hygiene, not behavior):
1. **AC4.10 gap**: add disposition rows for `prepare-meeting-agenda`,
   `quarter-plan`, `goals-alignment`, `periodic-review` to the
   build-report table (or to a Phase 4 follow-on plan).
2. **AC4.9 gap**: clean up dangling `daily-plan` / `week-review`
   references in `PATTERNS.md`, `README.md`, `week-plan/LEARNINGS.md`,
   and `week-plan/templates/week-priorities.md`.

Neither concern alters the discipline-math claim or risks user
workflow. Both are 30-minute follow-ups. Approve to soak; clean up
during soak window.
