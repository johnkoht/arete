# Code review — Phase 10e (background dedup hygiene verb)

**Reviewer**: senior-staff (code-check, claims verified)
**Scope**: 2 commits (`cd90bde5` engine, `7d266604` CLI verb)
**Verdict**: **SHIP** — all AC10 / AC10a criteria met, 29 tests green, typecheck clean, do-not-touch list respected. Findings are LOW (doc/count discrepancies + one minor audit-artifact staleness). No HIGH blockers.

---

## Per-commit table

| Commit | Subject | Source | Tests | Verified |
|--------|---------|--------|-------|----------|
| `cd90bde5` | core: background-dedup hygiene engine | `background-dedup.ts` (837 src LOC) | 18 unit | Pure module, no I/O, exhaustive scope switch, idempotent transformer. Confirmed. |
| `7d266604` | cli: arete dedup verb + integration tests | `dedup.ts` (417 src LOC), `index.ts`, core `index.ts` export | 11 integration | dry-run/apply/since/validation + `--explain` suite. Confirmed. |

Both commits carry a `Co-Authored-By: Claude Opus 4.7 (1M context)` footer (present; model string is 4.7, build was authored on 4.7).

Source LOC differs from build report (report says 671 engine / 343 CLI; actual `git show` is 837 / 417). The report numbers appear to be pre-final-edit estimates. Cosmetic.

---

## Verification against the checklist

| Item | Status | Evidence |
|------|--------|----------|
| `arete dedup --scope <…>` verb works | PASS | `dedup.ts:54-94`, `VALID_SCOPES` = commitments/decisions/learnings/topics. Registered `index.ts:181`. |
| `--dry-run` default, writes diff, no data writes | PASS | `mode = opts.apply ? 'apply' : 'dry-run'` (`:162`). Diff written `:201`; dry-run returns at `:210` before any mutation. Integration test asserts commitments.json byte-equal (`:159`). |
| `--apply` commitments under `withLock` (race-safe) | PASS | `:248` `services.commitments.withLock(...)` re-reads, re-runs engine, atomic-writes inside the lock. `withLock` confirmed in `commitments.ts:671`. |
| memory scopes `--apply` surface-only (AC10a) | PASS | `:224` early-returns `applied:false` for non-commitments scopes; info line printed; diff still written. Integration test asserts decisions.md byte-equal after `--apply` (`:384`). |
| `--since <date>` filter | PASS | commitments `background-dedup.ts:280`, memory `:435`, topics `:553` (last_refreshed). Integration test narrows scope (`:257`). Shape validated `dedup.ts:141`. |
| `--llm` opt-in, default Jaccard-only zero-cost | PASS | `callConcurrent` only constructed when `opts.llm` (`:165`). Engine skips LLM when absent, surfaces fuzzy pairs as candidates (`background-dedup.ts:373-384`). |
| Idempotent second `--apply` | PASS | Engine finds 0 new groups on merged input; transformer no-op. Unit test `deepEqual` (`:343`), integration test re-apply groups=0 (`:225`). |
| Engine pure / CLI owns I/O | PASS | No `storage`/`fs`/`services` imports in `background-dedup.ts`. All reads/writes/lock in `dedup.ts`. Matches 10b-min shape. |
| Does NOT touch do-not-touch list | PASS | `git show --name-only` on both commits: no edits to pipeline modules, gws, staged-items, meeting.ts, commitments.ts. Only additive change to core `services/index.ts` (export `parseMemorySections`) + cli `index.ts` (register). |
| 25 tests pass, no regressions | PASS (count off) | Actually **29** pass (18 unit + 11 integration), 0 fail. See LOW-1. |

---

## AC coverage

**AC10 (background dedup verb)** — MET.
- `--dry-run` produces candidate report; `--apply` writes; second `--apply` is no-op. All four scopes covered. Engine + integration tests directly exercise each clause.

**AC10a (historical memory-file bloat / migration-diff pattern)** — MET in spirit, with a deliberate (plan-sanctioned) narrowing.
- Writes a persisted dated diff artifact, dry-run-first workflow, oldest-by-date canonical pick, surface-only.
- Note: the plan's AC10a literally describes `--scope decisions --apply` as "follows the same migration-diff pattern as commitment migration" with "subsequent `--apply` runs are incremental no-ops" — wording that implies decisions DO get written/merged. The build instead treats memory scopes as **surface-only, never auto-merged**, citing plan v2 non-goal "memory dedup is editorial, not mechanical." These two plan statements are in tension; the build chose the conservative reading and documented it. I concur with the conservative choice (editorial intent should stay human), but flag it as an intentional interpretation, not a literal AC10a satisfaction. See LOW-3.

**AC7 (`dedup --explain`)** — present and tested (4 integration tests) though not in scope of this review's checklist. The verb also hosts `--explain` provenance mode (`dedup.ts:309`). Working; not double-reviewed here.

---

## Findings

### LOW-1 — Test count understated in build report (29 actual vs 25 claimed)
The build report claims "7 CLI integration tests" and "25 tests total." The integration file actually has **11** tests: 5 commitments + 2 decisions + **4 `--explain`** (the explain suite is entirely omitted from the report's coverage section). True total is 29. More coverage than claimed — net positive — but the report is inaccurate. Recommend correcting the report's count and adding the explain suite to its coverage list.

### LOW-2 — Persisted diff reflects the pre-lock run, not the locked re-run (commitments `--apply`)
In `dedup.ts`, the diff file is written at `:201` from the *unlocked* `result`. The `--apply` path then re-runs the engine inside `withLock` and reassigns `result = lockedResult` (`:275`), but the on-disk `dedup-diff-…md` already reflects the earlier unlocked computation. If a concurrent `meeting extract` mutated commitments between the two runs, the audit artifact (diff) would not match what was actually written. Console summary IS accurate (uses reassigned `result`). Low severity: the window is tiny and the diff is advisory, not the source of truth (commitments.json is). Optional fix: for commitments `--apply`, write the diff from inside the lock using `lockedResult.diff`.

### LOW-3 — AC10a literal-vs-implemented divergence (memory scopes)
As noted above: AC10a text suggests `--scope decisions --apply` writes merged sections; implementation is surface-only. Defensible and arguably more correct, but the plan AC should be reconciled (update AC10a wording to "surface-only diff; merge is manual") so the soak gate isn't measured against an unimplemented auto-merge.

### Correctness spot-checks (no issues found)
- `applyCommitmentsDedup` textVariants cap-5 oldest-first eviction: verified by unit test (`:378`), eviction via `tv.shift()` (`background-dedup.ts:816`).
- Idempotency: second pass yields 0 groups (canonical text_hash now absorbs the variant); `deepEqual` confirms byte-stable output.
- `source_meetings` union is sorted on write (`:829`) → deterministic serialization, supports idempotency.
- `parseMemorySections` output shape (`memory.ts:46`) maps 1:1 onto `MemorySectionInput` (title/body/date/source/topics) — loader adaptation in `dedup.ts:418-426` is faithful.
- Exhaustiveness `never` checks in both `runBackgroundDedup` and `loadInputsForScope` — missing scope would fail typecheck.
- commitments scope filters to `status==='open'` before pairing (`:279`) — resolved/dropped rows correctly excluded (unit test `:210`).

---

## Gate

No HIGH findings. SHIP. Recommend (non-blocking): correct the build report test count + explain-suite coverage (LOW-1), reconcile AC10a wording (LOW-3), and optionally move the commitments-scope diff write inside the lock (LOW-2).
