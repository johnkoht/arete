# Chef holistic reconcile — one reconciliation brain for the winddown

Status: DRAFT (2026-06-10, overnight investigation)
Depends on: `dev/work/plans/single-pass-extraction/plan.md` (W1–W5 must ship + stabilize first)
Investigation inputs: winddown architecture map + reconcile consumer audit (2 agents, 2026-06-10; key findings inlined below)

## Why now

The winddown currently runs **three separate dedup/reconcile mechanisms** that
overlap and conflict:

| Mechanism | When | Window | Threshold | Judgment |
|---|---|---|---|---|
| Inline meeting reconcile (`extract --reconcile`) | per-file, at extract time | 7-day batch | Jaccard 0.7, first-occurrence-wins | none (mechanical) + `batchLLMReview` second pass |
| `wireExtractDedup` (Phase 10b reactive) | per-file, at extract time | same-day | Jaccard 0.7 + guards | LLM cross-check |
| Chef Step 2 rules 1–4 | winddown, holistic | merged day ledger | Jaccard 0.6–0.7 (varies) | agent judgment, proposed-only |

Consequences, all observed in production:

1. **The chef never sees the undeduped day.** Inline reconcile collapses
   first-occurrence-wins per file *before* Step 2 — the root of the
   collapse-to-oldest artifact that threatens supersession detection ("winddown
   sees the arc" requires the arc to survive to the winddown).
2. **Items can be skipped before the judgment layer exists.** A fresh capture
   marked `status: 'skipped', source: 'reconciled'` by inline Jaccard never
   reaches the chef's smarter guards (mirror-pair, recurring-item).
3. **Threshold drift**: 0.7 / 0.7 / 0.6 across the three mechanisms — items
   dedup differently depending on which path touches them first.
4. **Weekly/daily parity drift**: weekly-winddown re-implements pieces of the
   daily flow and stalls (stuck at Phase-7); there is no shared engine.
5. **Jira is display-only**: `jira_epics` watchlists render as context;
   "did I already file that ticket" is never actually checked.

Target flow (John, 2026-06-10):

1. pull slack, email, jira
2. pull meetings
3. extract from meetings (pure — no inline cross-meeting dedup)
4. **chef reviews and reconciles everything in one pass**: today's extractions ×
   each other × week.md × tasks/commitments × slack/email/jira evidence
5. stage + winddown review with proposed items
6. user reviews and approves
7. winddown complete

## Decisions

- **D1 — One reconciliation brain.** All cross-item judgment (cross-meeting
  dedup, intent-vs-commitment, fulfillment scan, moot detection, supersession
  arcs) happens in ONE holistic pass at winddown time. Inline `--reconcile` and
  per-file `wireExtractDedup` are deleted (after dual-run soak, see W7).
  `CommitmentsService.reconcile()` survives as a *primitive the engine calls*,
  not an independent judgment path.
- **D2 — Shared engine, two callers.** The holistic pass is specified once
  (`reconcile-engine` shared spec/pattern + supporting CLI primitives) and
  invoked by BOTH daily-winddown and weekly-winddown. Daily runs it over today
  (+7-day lookback context); weekly runs it over the week. This is the fix for
  weekly parity drift — weekly stops re-implementing.
- **D3 — Extraction becomes pure.** Step 3 emits items + model-judged
  `continuation_of` / duplicate markers (fed by single-pass Layer 1 context:
  open commitments, same-day priorItems, series resolver). No mechanical
  post-hoc collapse at extract time. The engine treats markers as *claims to
  verify*, not truth.
- **D4 — Timestamp-ordered ledger, arcs preserved.** The engine's input is the
  merged day ledger ordered by timestamp. When the same workstream appears
  multiple times, the engine presents the ARC (oldest → newest, with the
  flip-flops visible) and recommends a resolution; it never silently collapses
  to the oldest. This is the supersession requirement made structural.
- **D5 — Unified threshold + unified provenance.** One Jaccard threshold (0.7)
  everywhere mechanical similarity is used as a *candidate filter* (judgment
  decides; Jaccard only nominates). One provenance vocabulary:
  `source: 'chef-dedup'` replaces `source: 'reconciled'`; every skip carries
  `{reason, evidence, setBy, matched_ref}` — nothing is skipped without a
  user-visible why.
- **D6 — Jira as a read-only reconcile source, gated.** Step 1 gathers ticket
  state for the union of active areas' `jira_epics` (MCP read). Rule 1 extends
  to Jira evidence ("create ticket for X" intent × existing ticket = proposed
  close). Graceful degradation: Jira unavailable → display-only fallback
  (today's behavior), never blocks the winddown. No Jira writes in v1
  (`jira.create_ticket` stays draft-only).
- **D7 — Proposed-only stays sacred.** The engine computes; the chef proposes;
  the user approves. No auto-mutations. All existing approval/directive
  machinery (`[[unmerge]]`, `[[confirm]]`, `[[unskip]]`, pull-backs) survives
  unchanged.
- **D8 — All idempotency rails preserved** (from consumer audit): R7 re-run
  check (`resolvedAt > today_start` → never re-propose), processed/approved
  status filter on batch loading, `excludePath` strict-`===` self-match guard,
  body-only content hashing, `writeWithLock` partial-merge on all frontmatter
  mutations.
- **D9 — Quality gate moves, doesn't die.** `batchLLMReview` (the second LLM
  pass that drops low-signal items) is absorbed into the engine's judgment
  pass — it is NOT silently deleted. Single-pass extraction's importance tiers
  + ⚠ flags feed it.
- **D10 — Out of scope**: per-source gather watermarks (separate plan; engine
  consumes whatever the gather window provides), mini-pull (already designed to
  let winddown re-pull + this engine reconciles overlaps — F1 *serves* that
  contract), Jira writes, read-side wiki wiring.

## Target architecture

```
Phase G — GATHER (parallel, stateless per run)
  G1 slack (gather-only)   G2 email (gather-only)   G3 jira (NEW, read-only, gated)
  G4 calendar (fwd+back)   G5 meetings pull (krisp/fathom)   G6 commitments+areas+week.md

Phase X — EXTRACT (pure, per meeting, single-pass mode)
  arete meeting extract <file> --stage          # NO --reconcile
  → staged items + tiers + ⚠ + continuation_of claims + direction(none)

Phase R — RECONCILE (the engine; ONE pass, agent judgment in-context)
  R0 idempotency sweep (R7 resolvedAt check; prior-day directives)
  R1 build timestamp-ordered ledger: extractions × slack × email × jira ×
     calendar × commitments × week.md completions
  R2 candidate nomination (mechanical, cheap): Jaccard 0.7 within ledger,
     7-day meeting batch (excludePath guard), decisions/learnings memory match,
     continuation_of claim verification
  R3 judgment pass (agent): rules 3→4→1→2 (now incl. jira in Rule 1),
     mirror-pair / recurring guards, quality gate (absorbs batchLLMReview),
     arc assembly for repeat workstreams (D4), relevance scoring → sidecar tiers
  R4 write decisions: staged_item_status/skip_reason (writeWithLock),
     source='chef-dedup', dedup-decisions.log, item-fates events

Phase S — STAGE + ENGAGE (existing Steps 3–6, unchanged contracts)
  curated view (tier-sorted per single-pass W4) → persist → user approves → execute
```

Daily calls G(today)+X+R(today, 7d context)+S. Weekly calls R over the week's
accumulated ledger (its own gather scope) + weekly judgment — same engine spec,
different horizon.

## Work items

**W1 — Engine spec (`reconcile-engine`)**
The shared specification both winddowns reference: ledger shape, R0–R4 phases,
rule definitions (lifted verbatim from daily SKILL.md Step 2, extended with
jira), arc-assembly rules (D4), provenance vocabulary (D5), idempotency rails
(D8). Lives as a PATTERNS.md pattern + dedicated spec doc; daily/weekly
SKILL.mds shrink to "invoke the engine with horizon=day|week".

**W2 — CLI primitives for R2 (mechanical nomination)**
`arete reconcile nominate --ledger <json> --days 7 --json`: deterministic
candidate pairs (Jaccard 0.7, memory match, batch load with excludePath,
status filter). Pure function over inputs — fully unit-testable. This is the
*testable core* extracted from `meeting-reconciliation.ts` (findDuplicates,
matchRecentMemory, matchCompletedTasks, scoreRelevance survive HERE, repointed,
not deleted). The agent never does mechanical similarity itself.

**W3 — Jira gather (G3)** *(respec'd per pre-mortem R-jira: a CLI command
cannot call MCP connectors — `pull.ts` has zero MCP wiring; the working
precedent is skill-level gather)*
Jira gather is a **skill-level gather-only step** (the slack-digest/email-triage
pattern): the winddown agent reads Jira via the MCP connector in-harness and
**RESOLVED 2026-06-11 (John): Jira is a WORKSPACE concern, not arete core.**
Jira already lives in the arete-reserv winddown APPEND file
(`.arete/skills-local/daily-winddown.md`) — workspace-level instructions the
chef reads at Step 0. The engine spec (W1) therefore treats jira as a generic
"workspace-provided evidence source": the APPEND can contribute extra ledger
entries/evidence and the engine reconciles whatever it's given. No core CLI
primitive, no core MCP wiring, ever. W3 as originally scoped is **deleted**
(also verified: no Atlassian MCP connector in the current environment).

**W4 — Daily winddown rewire**
Step 1h drops `--reconcile`; Step 2 becomes "run engine R0–R4"; Step 3.5/4
consume engine output (provenance fields render as the existing CT/skip
visibility). Chef-skip log, deferred sidecar, directive scanning unchanged.

**W5 — Weekly winddown rewire**
Weekly Step 1h drops `--reconcile`; weekly judgment consumes the same engine
over the week horizon. Weekly-only passes (thread arcs, orphan-agenda GC) stay
weekly. This closes the Phase-7 parity stall.

**W6 — Deletion + migration**
Remove `--reconcile`/`--reconcile-days` flags, backend `agent.ts` reconcile
blocks (3 call sites), `wireExtractDedup` per-file wiring. `meeting-
reconciliation.ts` functions either move into the W2 primitive or are deleted
with their tests; `load-recent-meeting-batch.test.ts` (excludePath regression)
MUST survive, repointed at the W2 loader. `source: 'reconciled'` readers
migrate to `'chef-dedup'` (consumer audit: item-fates, staging view).

**W7 — Dual-run soak (shadow mode)**
For ≥5 winddown days before deletion (W6 lands last): engine runs in shadow
while the old inline path remains live. **Critical design point (pre-mortem
R2): the shadow engine must NOT consume post-inline state** — inline reconcile
mutates the day (skips, first-occurrence-wins collapses) before the engine
would see it, which makes agreement vacuously high and arc-assembly
structurally impossible. W7 therefore persists **pre-reconcile raw extraction
snapshots** at extract time (`dev/diary/raw-extractions/YYYY-MM-DD-<slug>.json`,
gitignored) and the shadow engine runs on those + the raw gather ledger.
Nightly diff: agreement rate, engine-only catches, inline-only catches,
arc-assembly events — each disagreement classified by hand. W6 is gated on the
soak report.

## Testing strategy

Three layers, matched to what each can actually verify:

**Layer 1 — Deterministic unit tests (W2 primitive).**
All mechanical nomination is a pure function → exhaustive unit coverage:
Jaccard boundaries (0.69999/0.70001), excludePath strict-`===` (symlink and
`./`-prefix non-matches — the LEARNINGS.md 2026-04-29 trap), status filter,
window boundaries, memory-item parsing formats, ledger ordering stability.
Migrated fixtures from `meeting-reconciliation.test.ts` + two NEW invariant
tests from the consumer audit: *threshold-unity* — scoped precisely (review
finding 2: a naive "one constant everywhere" test would force-delete Rule 4's
DELIBERATE 0.6 collapse threshold + 0.5–0.7 Uncertain band, daily
SKILL.md:583,632-642): unity applies to **candidate nomination** (R2) only;
judgment-band thresholds are engine-spec parameters with their own fixtures —
and *window-coverage* (engine sees ≥ what inline saw).

**Layer 2 — Golden-day replay eval** (scripts/, uncommitted per house
convention). The 2026-06-09 winddown is a complete, human-audited day: 6
meetings with verified ground truth (single-pass-extraction/
benchmark-evidence.md), 6 CT closures with cited evidence, a deferred sidecar,
known dedup events (29 evaluated / 0 merges), and two known parser-bug mirror
pairs. `scripts/eval-reconcile-golden-day.ts` replays the full day ledger
through the engine and scores against the recorded outcome:
- every human-approved CT closure re-proposed with equivalent evidence
- the 6 deferred eng actions + 4 org notices land in the sidecar tier
- mirror pair `b0e57c25`↔`ce091a38` surfaces as Uncertain (never auto-collapsed)
- the recurring-meeting case (ai_007 vs `acc2a220`) resolves via
  continuation_of verification, not duplicate-collapse
- NO item that the human kept gets engine-skipped (zero false collapses against
  ground truth)
Add a second golden day recorded during the W7 soak (a "boring" day, to test
the engine doesn't manufacture work on low-signal days).

**Layer 3 — Shadow-mode soak telemetry (W7).**
Production-data comparison, no user impact: agreement rate vs inline path
(target ≥90% on mechanical dupes), engine-only catches reviewed by hand,
false-collapse rate (user `[[unmerge]]`/pull-back events per week — must not
exceed the pre-F1 baseline), R7 idempotency fires on any re-run day, winddown
wall-clock delta (≤ +20% vs baseline; the engine replaces N per-file LLM
review calls with one batched pass, so this should be net-negative).

**Agent-judgment testing note**: R3 is agent judgment specified in SKILL.md/
spec, not code — it cannot be unit-tested. The golden-day replay (Layer 2) is
the regression harness for judgment; the spec carries explicit worked examples
(the house pattern) so drift is detectable in replay, and every judgment writes
provenance so disagreements are auditable after the fact.

## Acceptance criteria

Engine correctness (golden-day replay, Layer 2):
- AC1 **CT parity**: 6/6 of the 6/9 human-approved closures re-proposed, each
  with evidence of the same class (slack ref / meeting ref / calendar ref).
- AC2 **Zero false collapses** against the golden-day ground truth; the two
  known mirror pairs surface as Uncertain.
- AC3 **Arc preservation (D4)**: a same-day flip-flop fixture (Anthony de_002
  superseded by workshop de_004) renders as an arc with a recommendation —
  the newest item is never silently dropped in favor of the oldest.
- AC4 **Sidecar parity**: ≥ 90% tier agreement with the 6/9 human-validated
  deferral set; zero blockers deferred.

Engine safety (shadow soak, Layer 3):
- AC5 ≥ 90% agreement with inline path on mechanical duplicates over ≥5 days;
  every disagreement hand-reviewed and classified before W6.
- AC6 False-collapse rate ≤ pre-F1 baseline over the soak window, measured TWO
  ways (pre-mortem R5: unmerge events alone are blind — a false collapse hides
  the item, so the user never sees it to unmerge): (a) user unmerge/pull-back
  events, AND (b) a weekly **sampled re-audit** — N=10 random engine-skipped
  items re-checked against their transcripts/evidence by a judge agent, with
  human spot-check of any flagged; sampled false-collapse rate must be **0/10
  — hard bar, no "or explained" escape hatch** (review finding: this is the
  only metric watching silent data loss; any sampled false collapse blocks W6
  until root-caused and the fix re-soaked).
- AC7 R7 idempotency: a deliberate same-day re-run proposes zero
  already-resolved items.
- AC8 Winddown wall-clock ≤ +20% of baseline (expect improvement).

Structural:
- AC9 Threshold-unity and window-coverage invariant tests green; excludePath
  regression test survives, repointed at the W2 loader.
- AC10 Every engine skip/collapse carries `{reason, evidence, matched_ref}`
  and renders in the curated view; `source: 'chef-dedup'` flows to item-fates.
- AC11 Jira degradation: with Jira unreachable, the winddown completes with
  display-only fallback and a one-line Note — zero hard failures.
- AC12 Weekly-winddown runs the same engine (spec-level assertion + one weekly
  golden replay over the 6/2–6/9 week) and its SKILL.md no longer contains an
  independent reconcile implementation.
- AC13 Consumer audit clean: zero remaining references to deleted symbols
  (`reconcileMeetingBatch`, `batchLLMReview`, `--reconcile`) outside
  deprecated test archives; backend `agent.ts` paths migrated.

## Sequencing

W1 (spec) → W2 (primitive + Layer-1 tests) → W3 (jira, parallel-safe) →
W4 (daily rewire, engine live in SHADOW via W7) → Layer-2 golden replay →
W5 (weekly rewire) → W7 soak ≥5 days → soak report → W6 (deletion) →
AC13 final audit.

Hard gate: single-pass-extraction plan AC1–AC11 green + its 2-week detector
soak complete before W4 (the engine assumes tiers/⚠/continuation_of/
direction:none exist). Worktree build; commits per house convention.

**Degraded-mode contract (pre-mortem R3, the partial-ship seam):** if
`extraction_mode` is reverted to `legacy` while the engine is live, the engine
MUST keep functioning on tier-less input: missing tier → treat as `normal`,
missing ⚠ → trust confidence, missing `continuation_of` → nomination-only
dedup (R2 candidates still flow; the judgment pass loses the markers but not
the evidence). This contract gets its own Layer-1 test (legacy-shaped fixture
through the engine) so an SP rollback never strands the winddown.

## Skeptical view

- *"This is a big-bang replacement of working dedup."* — It isn't, by
  construction: W7 shadow mode means the old path stays live until the engine
  has ≥5 days of production agreement data and a hand-reviewed disagreement
  ledger. Deletion (W6) is the LAST step and is gated.
- *"R3 is agent judgment — untestable, will drift."* — Partially true; that's
  why the mechanical 80% lives in a pure-function primitive (W2) with full unit
  coverage, and judgment is regression-tested by golden-day replay with worked
  examples in the spec. This is also the house pattern already in production
  (Step 2 rules are agent judgment today, with zero replay harness — F1 adds
  the harness).
- *"O(n²) Jaccard + one giant LLM pass over 50 meetings will blow the latency
  budget."* — Nomination is cheap (Jaccard over a few hundred items); the
  judgment pass replaces N per-meeting `batchLLMReview` calls with one batched
  pass over nominated candidates only. AC8 measures it; tier-routing (fast tier
  for clear cases) is the escape valve.
- *"Jira auth/quota will make winddowns flaky."* — Gated + graceful (D6, AC11);
  jira evidence is additive, never load-bearing.
- *"Weekly horizon over a full week's ledger is a much bigger context than
  daily."* — Weekly already processes the week's meetings; the engine batches
  by nomination first, so judgment context scales with candidate count, not
  ledger size. If weekly context pressure appears, the engine spec allows
  per-day chunked nomination with a week-level arc pass.
- *"Deleting wireExtractDedup loses the reverse-stamping of canonical
  meetings."* — Reverse-stamping moves into R4 writes (provenance contract D5
  is a superset of what 10b wrote).

## Rollback

Shadow mode IS the rollback posture until W6: flip the engine off and the
inline path never stopped running. Post-W6, rollback = revert the W6 deletion
PR (isolated by design) + re-enable inline flags; engine writes use the same
frontmatter contracts, so no data migration in either direction. The golden-day
scripts and shadow logs are kept until one full month of clean operation.

## Relationship to other plans

- `single-pass-extraction` — hard dependency (tiers, ⚠, continuation_of,
  direction:none, view ranking). Its F1 section is superseded by this plan.
- `project: per-source gather watermark` — composes at Phase G; engine is
  window-agnostic.
- `project: mini-pull/pulse` — engine provides the "winddown re-pulls + dedup
  reconciles" guarantee mini-pull assumes.
- `project: supersession gap` — D4/AC3 implement the structural half
  ("winddown sees the arc"); recommendation UX continues there.
- `project: winddown shared engine` (weekly parity) — W1/W5 are that fix.
