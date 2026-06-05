# Phase 10 v2 — Eng-Lead Re-Review

**Reviewer**: senior staff engineer (same as v1)
**Reviewed**: 2026-06-03
**Plan**: phase-10-winddown-orchestrator/plan.md (v2)
**Verdict**: APPROVE WITH MINOR — six new gaps to address inline, none blocking 10a-pre kickoff

## v1 → v2 fix verification

| v1 ID | What v1 flagged | v2 fix (citation) | Verified? |
|-------|-----------------|-------------------|-----------|
| C1 | `createdAt` missing on Commitment | plan §"Migration plan" L253, L279, L455-459, AC0 L517 — added as 10a-pre with backfill from `date` | **YES** — code-checked `entities.ts:221-249`: still no `createdAt`; v2 correctly identifies it as new-field work; backfill-from-`date` sentinel + no-op on re-run is specified |
| C2 | owner-as-personSlug rewrite | plan §"Hard part 3" L131-146; §"Migration plan" L289-294; AC1a/AC1b L521-523 — `extractCounterpartiesFromText(text, owner_slug, direction)` with arrow + natural-language + self fallback | **PARTIAL** — spec is technically sound for arrow notation; natural-language fallback has an unresolved ambiguity case (see "New concerns" #1) |
| C3 | `restore` verb missing | plan §"Migration plan" L282, L309; AC1d L527-528; "10a-pre Prerequisites" L457 — built as 10a-pre, ~50 LOC, round-trips snapshot byte-equal | **YES** — code-checked `cli/src/commands/commitments.ts`: `grep restore\|backup\|migrate` returns ZERO matches; v2 correctly schedules build of verb before migration depends on it |
| C4 | Entity overlap hand-waved | plan §"Hard part 4" L152; §"Semantic dedup pipeline" L329-335 — replaced with deterministic person-slug overlap (`@<slug>` extraction) + Jaccard; no LLM in pre-filter | **YES** — explicit algorithm, deterministic, fits same pattern as existing `dedupMirrorPairs` and `utils/similarity.ts` |
| C5 | Slack provider (Sent-message detection) | plan §"v1 → v2 changes" L23 row C5; §"Non-goals" L88; revision history L11 — **deferred to Phase 12+ entirely**; v2 also defers Gmail external-resolution to Phase 11 | **YES (deferral)** — correct call. v2 ships only intra-Arete dedup; external-source detection is its own phase |
| C6 | Phase 8 R4 still slug-equality | plan §"Migration plan" L283; §"Phase 8 reconciler interaction" L429-448; AC12 L563; "10a-pre" L458 — R4 rewrite is explicit 10a-pre work | **YES** — code-checked `daily-winddown/SKILL.md:540-608`: still has "Counterparty resolution preferred via slug match" at L544-546 + "same counterparty + ≥0.9" at L567. v2 correctly identifies this as a rewrite (not verify) and sequences R4 changes BEFORE migration ships, so reconciler doesn't read both shapes simultaneously |

## Verdict reasoning

The three factual errors (C1/C3 missing artifacts, C6 R4 logic) are correctly identified as 10a-pre work — they MUST land before 10a's migration depends on them. The 10a-pre split is the right factoring; doing those three things inside 10a would create an undebuggable migration step. C2 is the highest-residual-risk fix — the parser spec covers ~80% of the patterns but leaves the ambiguity case ("Lindsay" → which Lindsay?) implicit. C4 and C5 are cleanly resolved.

Three things v2 does well that v1 didn't: (1) explicit feature flag gating with 3-5 day dry-run before apply, (2) persisted `migration-diff.md` as audit artifact (PM trust-risk rec absorbed), (3) golden-pair gate (AC3a) ties tier choice to measurable outcome.

The plan now correctly mirrors the codebase's existing patterns — atomic-write via `storage/file.ts:30-42` (tmp+rename) is real and load-bearing; `commitments.ts:200-209` `computeCommitmentHash` shape change (drop personSlug from input) is the surgical edit.

## New concerns introduced by v2

**N1 — Natural-language counterparty resolution is single-name ambiguous.** `arete-reserv/people/internal/` contains BOTH `lindsay-calar.md` and `lindsay-gray.md`. Plan §"Hard part 3" L141 says "person-name resolution against `people/**/*.md` frontmatter (display name + aliases)" but doesn't specify behavior when name resolves to multiple people. For the triage-data example "Deliver POP MVP project plan ... to Lindsay" — which Lindsay? This isn't a hypothetical; lines 521-523 use the AC1a test case `"@john-koht → @dave-wiedenheft"` (unambiguous) but the dangerous case is bare-name. **Recommendation**: parser MUST emit `ambiguous: true` and surface in migration-diff.md when name resolves to >1 slug; do NOT pick first match silently. Add as AC1e.

**N2 — Concurrent extract atomicity is named (AC11/concurrency test in §Tests L586) but mechanism is hand-waved.** v2 says "use storage adapter's atomic-write pattern." Code-check: `storage/file.ts:30-42` provides atomic SINGLE-file write (tmp+rename). But commitment dedup involves READ commitments.json → MODIFY → WRITE. Two concurrent `arete meeting extract` runs each read the same file, each compute different deltas, last-writer-wins → silent commitment loss. v2's concurrency test will catch this IF the test actually drives two concurrent runs. **Recommendation**: spec a file-lock (`proper-lockfile` or PID lockfile) OR a single-writer queue in CommitmentsService.save(), name it in the plan §Architecture, otherwise AC11 will fail under real concurrency. m6 from v1 review is not yet resolved.

**N3 — Memory-file historical bloat is acknowledged but not scheduled.** AC5 L539 specifies forward-going dedup; §"Memory file dedup" L379 says "Historical cleanup via `arete dedup --scope decisions`." That verb is in 10e. But running it once requires picking canonical for hundreds of pre-existing dupes — same canonical-pick problem the commitment migration has. Plan doesn't say whether decisions.md/learnings.md need their own migration-diff artifact + dry-run pattern. **Recommendation**: explicit AC10a "first `arete dedup --scope decisions --apply` produces a diff artifact; subsequent runs are incremental no-ops." Otherwise historical bloat sits there until user discovers it.

**N4 — Migration --apply partial-failure mode unspecified.** Plan says snapshot first, then apply. If apply crashes mid-write (disk full, OOM, signal), what's the state? `storage/file.ts` atomic write means commitments.json is either fully-old or fully-new. But the migration runs IN-PROCESS: parser runs → groups computed → new array constructed → single `storage.write()` call. If the in-memory new array is incomplete (parser throws on row 234 of 600), the write never happens, snapshot still intact, user re-runs. That's actually fine — but plan should state it as an explicit AC1f: "if `--apply` throws before write, commitments.json is unchanged; snapshot at `.arete/commitments.pre-phase-10.json` is the recovery anchor." One sentence, no code change, prevents post-build confusion.

**N5 — R10 mitigation is half a mitigation.** v2 added R10 (stale dedup-decisions.log) and says "`--explain` reads from commitments.json, not log." Correct — but the log itself is the soak-observability surface (per §"Soak observability" L639). User looking at the log to spot threshold-drift WILL be looking at stale entries. **Recommendation**: every log entry includes the commitment hash AT-DECISION-TIME; soak review uses `arete dedup --explain` on the canonical IDs to get current truth. Add as a sentence in R10 mitigation.

**N6 — AC3a golden-pair labeling cost is unbudgeted.** "30 hand-labeled pairs" — who labels, when, in what time? If John labels, it's ~30min of focused work on real arete-reserv commitment-text variations; that's fine, but the build phase 10b-min (5-7 days) needs to include the labeling time. If labeled by the building engineer, John still has to validate. **Recommendation**: add a 1-line schedule note in 10b-min: "labeling = ~30min of John's time during build week 1; engineer drafts pair candidates, John adjudicates." Otherwise this slips and AC3a can't gate.

## Build sequencing — 10a-pre is right?

**Yes, 10a-pre as a separate 2-3 day step is correct.** The three items inside it (`createdAt` field, `restore` verb, R4 rewrite) are independent of each other AND independent of the migration logic. Bundling them into 10a would mean: bug in migration grouping logic surfaces along with bug in `createdAt` backfill along with bug in R4 set-overlap = un-bisectable. Splitting lets each land + soak briefly before 10a depends on them.

One sequencing nuance: R4 rewrite (third bullet of 10a-pre) reads from `stakeholders[]` which doesn't exist until 10a ships. R4 must be written DEFENSIVELY — read `commitment.personSlug` if `stakeholders` undefined; read `stakeholders[]` otherwise. v2 plan implies this via "feature flag gating" L311-315 but doesn't spell out the R4 dual-shape read. **Recommendation**: AC0 should explicitly state R4 handles both shapes during the dry-run window. Otherwise R4 breaks during the 3-5 day dry-run period when commitments.json is still v1-shape but R4 is rewritten.

## Atomicity story — still hand-waved?

**Partial.** v2 acknowledged the gap (AC11 implied + §Tests L586 "Concurrency test") but didn't pick a mechanism. Three real options:

1. **File-lock via `proper-lockfile`** (npm package, ~1-day add): simple, works cross-platform, blocks concurrent writes. Cost: one new dep, one new failure mode (stale lock).
2. **In-process write queue in CommitmentsService**: serializes writes within one Node process. Doesn't help cross-process (two `arete` CLI invocations). Cost: zero deps; doesn't actually fix the C-process case.
3. **Read-check-write with version field**: add `version: number` to CommitmentsFile, increment on each write, refuse write if version-mismatch. Concurrent runs detect collision, retry. Cost: small schema change, retry logic.

Recommendation: option 1 for v2. Cleanest. Plan should name it in §Architecture and stop saying "atomic write" when it means single-file atomic — the read-modify-write story is what matters here.

## Parser correctness — stress-test against triage data

Walking through user's triage cases (28 john-koht twins per the manual triage):

| Input text (real-ish) | `personSlug` | Direction | Parser output |
|---|---|---|---|
| `"@john-koht → @dave-wiedenheft: Talk to Dave about staffing"` | `john-koht` | outbound | Arrow regex hits → `[{slug: "dave-wiedenheft", role: "recipient"}]` — **CORRECT** |
| `"Deliver POP MVP project plan ... to Lindsay"` | `john-koht` | outbound | Arrow miss → natural-lang " to <Name>" hits `Lindsay` → **AMBIGUOUS** (Calar vs Gray; N1 above). v2 spec doesn't say which path. |
| `"Note to self: prep for Dave's review"` | `john-koht` | outbound | Arrow miss → natural-lang "Dave" hits `dave-wiedenheft` → parser produces `[{slug: "dave-wiedenheft", role: "mentioned"}]` direction stays `outbound`. But this is a SELF-reminder. AC1b L523 says "Detected as self via no non-owner slug present" — fails here because Dave IS a non-owner slug. **WRONG**: would mark Dave as the counterparty when the commitment is really self-reminder-to-prep-FOR-meeting-with-Dave. |
| `"Going to chat with Dave on the staffing plan"` | `john-koht` | outbound | Arrow miss → natural-lang "with Dave" hits → `[{slug: "dave-wiedenheft", role: "recipient"}]` — **CORRECT** |

Two of four cases are correct, one is ambiguous (N1), one is wrong (the "note to self" pattern). The "note to self" failure mode is real in the user's triage data ("Note to self: ...", "Remember to ...", "Make sure to ..." with mentions of others). **Recommendation**: add a self-pattern detector that runs BEFORE the entity-extraction step — if text starts with "note to self", "remember to", "make sure I", "don't forget to" + no `@<slug>` arrow → direction='self' regardless of name mentions in body. Add as parser unit test alongside the existing five at §Tests L580-585.

## Migration atomicity — what if new commitments arrive during dry-run?

Plan says feature-flag gated, 3-5 day dry-run before `--apply`. During those 3-5 days, new commitments WILL be written (each meeting extract adds rows). v1 hash + v1 shape continue to write. After `--apply`, the migration runs ONCE against current state — including the new rows added during dry-run. That's fine.

But: the **diff report** the user reviewed in dry-run was computed against an earlier snapshot. The actual `--apply` operates on current data, which is 3-5 days newer. New commitments might fall into existing dedup groups in ways not shown in the dry-run diff. **Recommendation**: `--apply` should regenerate the diff at apply time and either (a) require user to re-confirm if delta > N rows, or (b) write a delta-diff alongside the original diff for audit. AC1c L525 doesn't cover this case.

Migration is idempotent in the "re-run produces same output" sense (deterministic grouping on stable hash), but it is NOT idempotent across new writes — and that's the realistic case.

## AC13 5s-extract gate — achievable?

Worst case: 10 staged items × 5 candidates × 1 LLM call (fast tier, ~500-800ms typical) = 25-40s LLM time alone if serial. Plan §"Cost estimate v2" L356 says "10 new staged items × ≤5 candidates × $0.001/call" — doesn't address latency.

If LLM calls are batched (one call with all 5 candidate-pairs in one prompt), it's ~1 call per staged item = 10 calls × 500-800ms = **5-8s serial, 1-2s parallel**. Achievable with `Promise.all` batching across the 10 items. If NOT batched, AC13 will fail.

**Recommendation**: §"Semantic dedup pipeline" L337 says "one call per candidate pair, batched if possible." Make "batched" mandatory in the spec — one LLM call returns a SAME/DIFFERENT/UNCERTAIN array indexed against the candidates. Otherwise AC13's 5s gate is wishful.

## Question-by-question on Q1-Q10

**Q1 (C1-C6 fix verification)**: Covered above. C1/C3/C4/C5/C6 are sound; C2 has N1 + parser self-pattern gap.

**Q2 (10a-pre right move)**: Yes. Three prerequisites are independent and load-bearing for 10a. Splitting prevents un-bisectable bug surface during migration.

**Q3 (parser correctness)**: Walked above. Catches arrow-notation cleanly; "note to self" pattern falls through to mentioned-role mistakenly; "Lindsay" ambiguous case unhandled.

**Q4 (migration atomicity across new writes)**: Idempotent within `--apply` re-run, but NOT idempotent across new writes during dry-run window. Add delta-diff at apply time.

**Q5 (golden-pair gate)**: 30 pairs is right size; labeler must be John (he's the domain authority for what's SAME in his workspace); add ~30min to 10b-min schedule for adjudication. Failure mode "fast passes golden but degrades in real use" is partially covered by R5 (threshold tuning) + R10 (soak telemetry on dedup-decisions.log).

**Q6 (memory file historical bloat)**: AC5 is forward-going; historical cleanup punted to `arete dedup --scope decisions` (in 10e). v2 doesn't say whether one-shot historical cleanup needs its own dry-run pattern. See N3.

**Q7 (atomicity)**: Hand-waved. Pick `proper-lockfile` or in-process queue; name it in §Architecture. See N2.

**Q8 (R10 stale-log)**: Half-mitigated. `--explain` reads truth, log is observability. Soak users WILL read the log directly. Recommend logging current-canonical-id + decision-time hash so user can cross-ref via `--explain`. See N5.

**Q9 (R11 extract slowdown)**: Achievable IF LLM calls batched within an extract; non-achievable if serial. Mandate batching in spec.

**Q10 (still missing)**: Five items — N1 (ambiguous name resolution), N2 (atomicity mechanism), N3 (historical memory bloat scheduling), N4 (mid-apply failure recovery), N6 (golden-pair labeling cost) — plus the "note to self" parser gap, plus the mid-dry-run new-writes delta.

## Final recommendation

**APPROVE WITH MINOR.** v2 correctly fixed the v1 blocking issues (C1/C3/C6 factual; C4 architectural; C5 deferral). The 10a-pre factoring is the right call. The owner-as-personSlug parser spec is sound for the 50-60% of cases that use arrow notation; the natural-language fallback needs the N1 ambiguity rule + the self-pattern detector before 10a-pre lands.

**Inline fixes before 10a-pre starts** (~half-day of plan editing, no code):
1. Add AC1e: ambiguous name → mark ambiguous, do NOT silently pick first slug.
2. Add AC1f: mid-`--apply` failure leaves commitments.json unchanged; snapshot is recovery anchor.
3. Add self-pattern detector (regex on "note to self|remember to|make sure I|don't forget to") to parser spec, runs BEFORE entity extraction.
4. Name atomicity mechanism (recommend `proper-lockfile`) in §Architecture; AC11 references it.
5. Mandate LLM-call batching in §"Semantic dedup pipeline" for AC13 viability.
6. Schedule John's ~30min golden-pair adjudication in 10b-min.
7. Add delta-diff at `--apply` time covering new writes during dry-run window.

These don't change scope or sequencing; they close concrete gaps that would otherwise surface as build-time churn. After these inline edits, 10a-pre is ready to start.

**Risk score**: medium. Migration is one-shot but reversible via `restore` (10a-pre); parser has known-unknowns (N1 + self-pattern) but they surface in dry-run diff; atomicity is the genuine new-risk if not picked before build. Cost cap is well-controlled at fast tier. Soak telemetry is in place.

**Estimated total**: 16-22 working days as plan says; ~half a day of inline plan edits brings it to ready-to-build.
