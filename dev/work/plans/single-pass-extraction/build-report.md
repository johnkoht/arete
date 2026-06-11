# Build report — single-pass-extraction + CHR W0/W1/W2/W7-infra (overnight, 2026-06-11)

Branch: `feat/single-pass-extraction` (worktree `agent-a5a33ca8a5d192df4`).
Built by two ship orchestrators (the first died on API limits mid-CHR-W0;
the continuation verified + finished its draft rather than trusting it).
NOT merged, NOT pushed — John reviews first.

## What shipped (commit order)

| Commit | Item |
|---|---|
| fbad0a1d | Plan docs imported + 2026-06-11 adjudications applied (W0 stage-0, SP-W6 cut, eval rigor, soak aborts, pre-mortem closure) |
| f3111f86 | SP W1+W1.5+W2+W3 — schema (tiers/⚠/links/oq/direction:none), tier-derived approval, series resolver, judgment-first single-pass prompt, telemetry-only detectors, AC8 drop-point persistence |
| 81909ced | SP W4 — winddown staging-view tier ranking (SKILL.md, additive) |
| 93a2c619 | SP W5 — committed eval ground-truth manifest + judge rubric (+ scorecards README); harness local-only |
| 862f8ce8 | CHR W0 — `arete meeting reconcile-day` day-level reconcile behind `reconcile_mode` (+ fix: W1.5 series-resolver meetingsDir double-join, see Discoveries) |
| dd4aa12d | CHR W1 — engine spec + PATTERNS.md `reconcile-engine` entry |
| e98691ef | CHR W2 — `arete reconcile nominate` R2 primitive + Layer-1 tests |
| 1157b2cf | CHR W7 infra — raw pre-reconcile snapshots + shadow log, behind `reconcile_shadow` |
| 2e85e976 | Phase C — WINDDOWN-BENCHMARK.md (executable A/B checklist + gate decision rules) |

## Flags and how to flip (all in arete.yaml; all default to legacy behavior)

| Flag | Values | Off-state guarantee | Flip rule |
|---|---|---|---|
| `extraction_mode` | `legacy` (default) \| `single_pass` | bit-identical legacy extraction (golden fixture test) | Gate A in WINDDOWN-BENCHMARK.md (AC11 budget + AC2/AC3 bars over ≥5 soaked days, W4 live first) |
| `reconcile_mode` | `inline` (default) \| `day-level` | inline per-file reconcile untouched | after Gate A; one clean `reconcile-day --dry-run` over a real duplicate day; independently reversible |
| `reconcile_shadow` | `false` (default) \| `true` | zero writes | flip ON at soak start (it is instrumentation, not behavior) |

Invalid values for `extraction_mode` and `reconcile_mode` are clamped to the
safe default in `loadConfig`/`normalizeConfig` (a typo can never activate a
half-configured pipeline). `reconcile_shadow` is NOT clamped in
`normalizeConfig` — its safety comes from the strict `=== true` gate at every
call site (any non-`true` value, including typos, leaves it off; corrected per
2026-06-11 review). Behavior matrix: each flag is
independent; `extraction_mode` changes WHAT is extracted, `reconcile_mode`
changes WHERE cross-meeting reconcile runs, `reconcile_shadow` only adds
gitignored telemetry files.

## Smoke results (the committed evidence so far — full eval = John's call, token spend)

compliance-0609, real `callLLM` path, workspace tier routing
(extraction: frontier = claude-opus-4-6), READ-ONLY against arete-reserv:

- legacy: 3 ai / 7 de / 6 le in 62.3s — decisions sat at EXACTLY the 7-cap
  (cap demonstrably binding on today's model).
- single_pass: 5 ai / 13 de / 8 le / 9 open questions, 3 blocker-tier,
  2 ⚠ (with crisp reasons), 2 direction:none, in 86.4s (+39% wall).
- **AC2 canary PASS**: the license-assignment-before-Snapsheet-sunset item —
  the exact item the legacy cap loses — extracted AND tier-marked blocker.
- Production-model behavior matches the Fable-observed benchmark on the
  load-bearing behaviors (⚠ self-flagging, none-refusal, blocker pickup).

Raw outputs in `eval/runs/` (local, gitignored).

## Test/build state

- **core + cli (the packages this branch touches)**: full suite green —
  **4601 tests / 4599 pass / 0 fail / 2 skipped** (pre-branch baseline
  4530 pass; +69 branch tests: single-pass schema/prompt/persistence,
  series resolver ±, tier approval, golden legacy fixture, reconcile-day,
  extract gating, nominate Layer-1 + CLI smoke, shadow infra).
- **backend**: 363/367 — the 4 failures are PRE-EXISTING: verified
  bit-identical failure set at the merge-base (74370a1e) via a throwaway
  detached worktree. Branch changes zero backend source files.
- **web**: untouched by the branch; suite not runnable in this environment
  (vitest devDeps not installed in the monorepo node_modules). Pre-existing
  condition, not a branch regression.
- dist/ rebuilt and committed for core + cli per house rule.

## Discoveries a reviewer should know (found during CHR-W0 verification)

1. **CLI inline-reconcile recent-batch is a silent no-op (pre-existing,
   since 46152a75).** `meeting.ts` computes
   `join(root, paths.resources, 'meetings')` but `paths.resources` is
   ALREADY absolute → doubled path → `storage.list` silently returns `[]`.
   Affects the CLI `--reconcile` recent-batch (`meeting.ts:~1006`) and CLI
   `wireExtractDedup` (`:~1217`). Memory/completed-task matching still
   worked (context-based, not batch). The production collapse-to-oldest
   artifact came via the BACKEND twin (`packages/apps/backend/.../agent.ts:
   550,685`), which joins correctly. **Deliberately left unfixed in the
   legacy path** (flags-off bit-identity invariant); the same bug WAS fixed
   in branch-new code (W1.5 series resolver, reconcile-day, nominate).
   Recommended disposition: fix alongside CHR-W6 deletion, or as a
   standalone reviewed fix once the soak baseline is recorded — note that
   fixing it CHANGES legacy CLI behavior (inline reconcile would suddenly
   start seeing the 7-day batch).
2. **`staged_item_skip_reason` requires `setAt`** — the reader
   shape-validates and silently drops entries without it. The dead
   orchestrator's W0 draft omitted it; fixed + unit-covered. Any future
   writer must include it.
3. **Root `npm test` covers core+cli only.** Backend/web have their own
   suites; "full suite green" claims must name which suites ran.

## Known gaps (deliberate, documented)

- **Backend stays legacy** regardless of all flags: `agent.ts` extraction,
  its inline reconcile twin, and confidence>0.8 auto-approval are untouched.
  The winddown drives extraction through the CLI, so the A/B is valid, but
  web-UI-triggered processing takes the old path. Migrate at CHR W4-W6.
- **SP-W6 (agentic tool loop) cut** — pinned after CHR-W6 (adjudicated).
- **CHR W3 (jira) deleted** — workspace-APPEND evidence source per
  adjudication; engine-spec § 8 carries the extension point.
- **CHR W4/W5/W6 + soaks not built** — sequenced after SP gate per plan.
- Stage-0 `reconcile-day` writes `source: 'reconciled'` (plan-specified for
  W0); `'chef-dedup'` arrives with the engine (W4+); readers must accept
  both forever (W6 adds the historical fixture test).
- Eval harness + raw run outputs stay local/gitignored (house rule);
  manifest + rubric + scorecards README are committed.
- No subagent tooling exists in this environment — both orchestrators ran
  reviews as disciplined separate self-review passes over the diffs
  (weaker independence than briefed; logged in the diary both times).

### Independent-review notes on record (2026-06-11 audit, NOTES 8/10/11)

Recorded verbatim from the independent review so the observations survive
(items 6/12 of the same review — empty-text drop telemetry, oq-truncation
telemetry, clamping sentence — were FIXED in dff33c12/ca95508d and are
covered in the sections above):

- **NOTE 8 — reconcile-day stats display.** The JSON/human output reports
  window-wide `reconciliation.stats` (duplicates among the 7-day context
  meetings count too) beside day-scoped `applied` — the numbers won't
  reconcile visually. Cosmetic; tighten when reconcile-day gets real use.
- **NOTE 10 — rollback hygiene edge.** A legacy-mode re-extract of a
  meeting file WRITTEN by single_pass treats `## Open Questions` /
  `## Parser-flagged` as user notes (dedup source → auto-approve via
  `source: dedup`) and leaves the stale sections in place (legacy
  `updateMeetingContent` deliberately does not replace them). Not a
  flags-off violation — such files only exist after a flip — but if the
  soak is rolled back, expect this on re-extracts of soak-era files.
- **NOTE 11 — `NONE_DIRECTION_MARKER` raw-line scope.** The marker regex
  (`[([]\s*@?slug\s*·`) tests the whole raw line, so legacy free text
  containing a "(word ·" shape would be skipped from commitments parsing.
  The middle-dot makes this vanishingly rare; on record for completeness.

## AC status — what is satisfiable NOW vs awaiting soak/eval

### single-pass-extraction plan

| AC | Status | Evidence |
|---|---|---|
| AC1 recall ≥ legacy / ≥21/22 compliance | **AWAITING eval run** | smoke trend positive (26+9oq vs 16 items) |
| AC2 blocker recall 100% | **SMOKE PASS**; full corpus awaiting eval | canary extracted + blocker-marked |
| AC3 junk ≤15%, fab 0, ⚠ ≥80% | **AWAITING judge run** | rubric + manifest committed; 2 ⚠ w/ reasons on smoke |
| AC4 direction integrity | **STRUCTURAL PARTS GREEN NOW** | D7 guards exist at 3 layers (parser `·` skip, sync guard, dedup-canonical guard); originally only layer 1 had tests — review fixes 2026-06-11 added tests for the sync guard (commitments.test.ts) and the dedup-canonical guard (extract-dedup-wiring.test.ts); mirror-pair human confirmation awaits soak |
| AC5 closeability | **AWAITING judge run** | rubric carries the check |
| AC6 series continuation + re-emit | **UNIT GREEN; chain replay awaiting eval** | resolver ±tests; prompt mark-don't-skip + banned-phrase test; NOTE: the double-join fix was load-bearing here — pre-fix, CLI series context never assembled |
| AC7 blind-set ≥ B+ | **AWAITING judge run** | blind set defined in manifest |
| AC8 no data loss | **GREEN NOW** | drop-point persistence tests; detectors keep items in single_pass |
| AC9 tier-sorted view | **SHIPPED (prose); behavior awaits soak nights** | W4 SKILL.md additive; gated on frontmatter maps |
| AC10 detectors telemetry-only + soak report | **CODE GREEN; report awaits 2-week soak** | telemetry events to item-fates.jsonl |
| AC11 approval budget (median ≤25, p90 ≤40) | **SOAK-GATED** | protocol in WINDDOWN-BENCHMARK.md |
| AC12 cost ≤2× | **AWAITING scorecards** | smoke wall-clock +39% (not tokens) |
| AC13 series negative case | **GREEN NOW** | non-series fixture test + advisory labeling |

### chef-holistic-reconcile plan (W0/W1/W2/W7-infra scope)

| AC | Status | Evidence |
|---|---|---|
| AC1–AC4 (golden-day replay) | **AWAITING Layer-2 replay** (engine not built; W0 is the precursor) | spec + fixtures defined; arc example 1 = AC3 fixture |
| AC5–AC8 (shadow soak) | **AWAITING W7 soak** | infra shipped: snapshots + shadow log + soak-validity/abort rules |
| AC9 threshold-unity + window-coverage + excludePath | **GREEN NOW** | W2 Layer-1 tests, incl. band-preservation counter-test |
| AC10 provenance on every skip | **W0 SUBSET GREEN** | reconcile-day writes {reason, evidence, setBy, setAt}; matched_ref + chef-dedup arrive with the engine |
| AC11 jira degradation | **STRUCTURAL (permanent v1 posture)** | workspace-APPEND evidence source; nothing core to fail |
| AC12 weekly same-engine | **FUTURE (W5, decoupled)** | — |
| AC13 deletion audit | **FUTURE (W6)** | inline path fully intact by design |

## Review notes (fresh-eyes pass over main..HEAD)

- Legacy invariance verified at the seams: every detector/filter keeps its
  `else { validationWarnings.push + continue }` legacy branch; golden
  legacy fixture test asserts byte-stability; config clamps invalid flags.
- W0 semantics vs inline verified: ASC filename sort = first-occurrence-
  wins oldest-canonical = inline's `[...recent, current]`; visible-skip-
  only (no silent merge) per plan; user decisions win; idempotent re-runs
  abstain (no mtime churn).
- W7 snapshot insertion point verified upstream of ALL mutation sites
  (inline reconcile, processMeetingExtraction, batchLLMReview,
  wireExtractDedup); known prompt-level-suppression limit documented in
  the service header (review F1).
- SKILL.md diffs are additive (only 2 removed lines, both inside a
  replaced example block).
