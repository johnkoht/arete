# Phase 10 Plan Review — Eng-Lead Pass

**Reviewer**: senior staff engineer (independent)
**Reviewed**: 2026-06-03
**Plan**: phase-10-winddown-orchestrator/plan.md
**Verdict**: REVISE BEFORE BUILD

## Verdict reasoning

The vision is right and several pieces are independently valuable (data-model change, semantic dedup, MCP-action proposals). But the plan as written has three concrete technical errors that will fail at build time, plus four architectural under-specifications that will produce build-report churn. Most critically: (1) the plan's canonical-pick rule refers to a `createdAt` field that does not exist on the `Commitment` type — see `packages/core/src/models/entities.ts:221-249`; (2) the plan assumes the old "single counterparty" maps cleanly to a `stakeholders[]` list, but 155 of ~600 entries in `arete-reserv/.arete/commitments.json` have `personSlug = "john-koht"` (the workspace owner) — so "union counterparties" produces a stakeholders array containing the owner, with the real counterparty buried in `text` as `@john-koht → @dave-wiedenheft`; (3) the `arete commitments restore` verb claimed as the reversibility lever does not exist (`grep` of `packages/cli/src/commands/commitments.ts` returns no `restore`/`backup` symbol). These three are factual, not stylistic.

Strengths: hybrid Jaccard → LLM pipeline matches the deterministic-pre-filter pattern already in `meeting-extraction.ts:391` (`dedupMirrorPairs`) and `commitments.ts:591` (`reconcile`), so the team has a working reference. The "data model change is independently valuable, SKILL.md rewrite is a reversible bet" framing in §"What this phase explicitly bets" is the right way to de-risk a 600-line plan. Hard parts 1-5 are honest and well-stated. The build sequencing 10a→10e is sensible.

The bar to clear before 10a starts: a v2 of the plan that names the real fields (`date` vs `resolvedAt`), spells out how owner-as-personSlug entries migrate, drops or builds the `restore` verb, and concretizes "entity overlap" and "Sent-message detector" into things a single engineer can land in the stated day-counts.

---

## Concerns (HIGH — must address before build)

### C1: `createdAt` does not exist on the Commitment type

**Concern**: Plan §"Migration plan" step 3 says "Sort by `createdAt` ascending; pick oldest as canonical." Plan Q5 recommends "oldest `createdAt`." But `Commitment` in `packages/core/src/models/entities.ts:221-249` has only `date` (meeting/source date, set at extraction time) and `resolvedAt` (set when resolved, null for open). There is no creation timestamp.

**Why it matters**: 10a is gated on this exact step. The actual options:
- Use `date` (meeting date): unreliable because meetings can be back-dated (e.g., transcript imported a week late) and recurring meetings re-emit the same text from different `date`s — the OLDEST `date` is the FIRST meeting that surfaced it, which is not always the canonical wording the user has edited since.
- Use `resolvedAt`: nullable, useless for the open-commitment majority.
- Add `createdAt` first, in a separate migration that backfills from `date` for old entries and stamps fresh ones at sync/create time — then run Phase 10's grouping migration.

The plan as written cannot execute step 3 without a code change it doesn't list.

**Recommendation**: Add a "0a: add `createdAt: string` to Commitment, backfill = `date`, stamp `new Date().toISOString()` in `sync()` and `create()`" prerequisite to 10a. Or commit to using `date` as the canonical proxy and write the trade-off into the plan (oldest meeting = canonical wording, accept that user-edited text from later approvals is in `textVariants[]`, not `text`).

**Plan reference**: §Migration plan step 3; §Open questions Q5; AC1.

### C2: "single counterparty → stakeholders[]" mishandles owner-as-personSlug rows

**Concern**: Plan §Architecture says `stakeholders: string[]` replaces single counterparty, and §Migration step 3 says "Union `stakeholders` from each entry's (single) counterparty." But in `arete-reserv/.arete/commitments.json`, 155 of the entries have `personSlug = "john-koht"` (the workspace owner). Sample: line 5158, `"text": "Deliver POP MVP project plan ... to Lindsay ..."`, `personSlug: "john-koht"`. The real counterparty (Lindsay) is buried in the text. Older entries from slack-digest sources encode the relationship inline: `"@john-koht → @dave-wiedenheft"` (line 29).

If the migration naively unions `personSlug` into `stakeholders[]`, the post-migration stakeholders list for these 155 entries becomes `["john-koht"]` — which is exactly NOT what the user means by stakeholder. Worse, two genuinely-distinct commitments where the only differentiator was the counterparty (e.g., "Send Lindsay the deck" with personSlug=lindsay vs the same text with personSlug=john-koht authored at extract time) collapse into one — because the new hash is `text + direction`, and `text` is identical.

**Why it matters**: This is the single largest semantic regression risk in the migration. AC4 in the plan ("`Send Lindsay` vs `Send Anthony` → NOT deduped") is the wrong test case; the dangerous case is `Send Lindsay the deck` (personSlug=lindsay-gray) merging with `Send Lindsay the deck` (personSlug=john-koht-self-reminder) when those were intentionally separate ledger entries representing user-side reminder + counterparty bilateral. The cross-person dedup in `EntityService.refreshPersonMemory()` already suppresses one direction (per the comment at `commitments.ts:196-199`), but the migration would now collapse the underlying ledger rows.

**Recommendation**:
- Migration must distinguish "real counterparty" from "owner-self-reminder." Strategy: if `personSlug === workspaceOwnerSlug` AND text contains `@<other-slug>` or " to <Other Name>" notation, parse the text to extract the real counterparty; otherwise keep owner in stakeholders (it IS a self-commitment).
- Spec AC4b: `Send Lindsay the deck` with `personSlug=lindsay-gray` MUST NOT merge with the same-text owner-self-reminder row if both exist. Add explicit fixture.
- Run `--dry-run` against arete-reserv before AC1 is even drafted; the diff report from that sample is the gating evidence for the migration grouping rules.

**Plan reference**: §Architecture commitment v2; §Migration step 3; AC1; AC4.

### C3: `arete commitments restore --from <backup>` does not exist

**Concern**: Plan §Migration plan says reversibility is `arete commitments restore --from commitments.pre-phase-10.json`. R1 mitigation depends on it. Grepping `packages/cli/src/commands/commitments.ts` for `restore`/`backup`/`export` returns zero matches. The verb is invented in the plan.

**Why it matters**: The "reversibility claim" is load-bearing for green-lighting a one-shot migration of thousands of rows. Without an actual implemented restore, mitigation R1 is wishful.

**Recommendation**: Either (a) add a 10a-prereq build step that ships `arete commitments restore --from <path>` BEFORE the migration step, with its own AC and test, or (b) downgrade reversibility to "manually `cp commitments.pre-phase-10.json commitments.json`" and call that out in the plan; restore-via-cp is fine but stop claiming a CLI verb that doesn't exist.

**Plan reference**: §Migration plan "Reversible"; §Risks R1.

### C4: Entity overlap pre-filter is hand-waved

**Concern**: Plan §"Semantic dedup pipeline" lists "Jaccard pre-filter + entity-overlap pre-filter." Entity overlap requires extracting entities (people/projects/artifacts) from commitment text. There is no entity extractor in the codebase that runs without an LLM. Existing pre-filters in the codebase use plain Jaccard token similarity (`utils/similarity.ts`, `meeting-extraction.ts:391`). Either entity overlap quietly becomes "token presence of any noun in a hand-curated stoplist" or it becomes "another LLM call before the LLM cross-check call" — which defeats the cost-cap argument.

**Why it matters**: The cost math in §"Hybrid dedup pipeline" cost-cap and Q1 depends on the pre-filter narrowing candidate set BEFORE the LLM call. If the entity step is itself an LLM call, the cost claim ("$0.25/winddown") is wrong by a factor of 2-3.

**Recommendation**: Replace "entity overlap" with one of:
- Person-slug overlap: parse `@<slug>` notation + match against `people.show` cache. Deterministic, works for the slack-digest and chef-emitted entries that use that convention.
- Keep ONLY Jaccard at threshold 0.5-0.6 as the pre-filter; skip the entity step in 10b initial ship. Reintroduce as a follow-up if FN rate is too high in soak.
Either way, name the algorithm in the plan with the file path it will live at.

**Plan reference**: §Semantic dedup pipeline; §Hard part 4 cost mitigation.

### C5: External-source resolution depends on integrations that don't exist

**Concern**: Plan §10c lists "Slack provider: pull today's Sent + monitored channels" and "Email provider: pull today's Sent" as build items inside a 5-7 day step. The codebase today has:
- Gmail integration: `packages/core/src/integrations/gws/gmail.ts` exists.
- Slack: `slack-heuristic.ts` exists for the digest skill, but there is NO Slack API integration for fetching the user's Sent messages or monitored channels — the slack-digest skill works off paste-in data, not API pulls.

Building a Slack Sent-message provider — auth, channel selection, rate limits, message normalization, attachment metadata extraction — is itself a multi-day phase, not a sub-bullet in 10c.

**Why it matters**: 10c as planned ships in "5-7 days" which is the same as 10b, but 10c also pulls in net-new integration surface. Empirically that's 10-15 days minimum once auth + scoping reality lands.

**Recommendation**: Split 10c. Make `10c-i` = Gmail-only external resolution (uses existing `gws/gmail.ts`), `10c-ii` = Slack API integration as its own phase later. The plan should either ship Gmail-only resolution at the 10c gate, or punt external-source resolution to Phase 11 entirely. Don't bundle a new Slack integration into a hybrid-dedup plan.

**Plan reference**: §End-to-end winddown flow step 1, 3b; §Build phases 10c; AC6.

### C6: Phase 8 reconciler interaction is acknowledged but not specified

**Concern**: R8 says "Phase 8 reconciler … verify still works on new shape; update rule logic if needed." Phase 8 Rule 4 in `daily-winddown/SKILL.md:540-608` is `counterparty match (slug equality) + direction match + Jaccard ≥0.7`. With `stakeholders: string[]` instead of single `personSlug`, the "counterparty match" check becomes "is the new loop's counterparty IN the commitment's stakeholders[]"? That's a substantive logic change, not a verification. Rule 4's mirror-pair signature exclusion (lines 566-573: same counterparty + ≥0.9 + opposite direction) also breaks: two stakeholder lists with one overlap is "same counterparty" — or is it? — the plan doesn't say.

R3's recurring-meeting guard (line 574-585) depends on `source_meeting.recurring`, which lives on the meeting, not the commitment — that still works. But Rule 4's slug-match logic must be rewritten.

**Why it matters**: Phase 8 just shipped; it's in soak. Phase 10 will rewrite winddown SKILL.md (§10d). The plan doesn't say whether the existing Rule 4 prose is preserved or replaced. The reconciler runs IN winddown, against Phase 10's deduped commitments. Order of operations: does dedup run BEFORE Rule 4, or in PARALLEL? If dedup runs first and collapses two commits that Rule 4 would have flagged separately, Rule 4's recurring-meeting guard might miss the case it was designed for.

**Recommendation**: Add an explicit subsection "Phase 8 reconciler interaction" to the plan. Spell out: (a) Rule 4 slug-equality check rewrites to stakeholder-set overlap (`commitment.stakeholders.some(s => loopCounterparty === s)`); (b) mirror-pair signature exclusion is moot under data-model (a) because direction is in the hash — same text + opposite direction now hashes differently and is two commitments by construction, so the "parser-bug surface" disappears unless the parser still emits mirror pairs (it does — see `meeting-extraction.ts:391` `dedupMirrorPairs` is the deterministic catch); (c) winddown order: gather → extract per meeting (mirror-pair dedup runs intra-meeting at extract time, unchanged) → Phase 10 cross-meeting dedup → Phase 8 reconciler rules 1-4 → unified approval. The reconciler operates on Phase 10's deduped stage.

**Plan reference**: §Risks R8; AC8; references to `daily-winddown/SKILL.md`.

---

## Minor concerns (LOW)

### m1: Text normalization for the hash is under-specified

§Architecture lists `text_normalized` but doesn't define it. Existing code uses `text.toLowerCase().trim().replace(/\s+/g, ' ')` (commitments.ts:205). If 10a uses the same normalization, two extractions that vary only in trailing period or doubled space hash equal — but variations in verb tense ("send" vs "sending"), determiners ("the deck" vs "a deck"), or relative time ("Friday" vs "by EOW") still hash distinctly and fall through to the LLM step. The plan should call out that the exact-match hash is intentionally narrow and that semantic equivalence is the LLM's job. Add an AC: same text with only punctuation differences hashes equal.

### m2: `textVariants[]` cap of 10 needs eviction policy

Q3 says cap at 10. FIFO? LIFO? Drop-shortest? Most-recent-N? The cap matters for the audit trail; FIFO loses the original wording (which might be the user-edited canonical), LIFO loses the recency that matters in soak. Recommend: keep first occurrence + last 9 (preserves originality + recency).

### m3: Idempotency of "Closed today (auto)" surface

If a winddown is re-run on the same day (user re-invokes), do already-auto-resolved commits appear again? The plan should specify: only commits whose `resolvedAt` is set today AND `resolvedBy` starts with `auto-` appear in "Closed today (auto)". Test with re-run fixture.

### m4: Per-meeting UI dupe badge timing

§"Per-meeting UI dupe badges" shows the badge `↪ canonical in <slug>` but doesn't say when it's written into the meeting file body. At extract time (so the staged section already has the badge)? At dedup-decision time (post-extract, requires re-writing the meeting file)? Idempotency matters — running winddown twice mustn't accumulate two badges. Spec: badge is written during step 3a's emission, into a NEW frontmatter field `staged_item_dupe_of: { ai_001: { canonical: "ai_007", slug: "..." } }` (mirroring `staged_item_status` / `staged_item_edits` pattern in `staged-items.ts:478-483`), then rendered by the UI / approval flow.

### m5: Cost extrapolation

§Hard part 4 says "~$1-3/day." §AC11 says "$3 median, $10 heavy." Q1 recommends standard tier. With Claude standard tier pricing today ($3/M input, $15/M output) and ~200-400 input tokens + ~50 output tokens per cross-check pair, that's ~$0.0009-$0.0015 per LLM call. 100 calls/day = $0.10-0.15. The plan's $0.25/winddown number from §Architecture is plausible for a heavy day. The plan's "$10 heavy day" cap is roughly 10x the real worst case, which is fine as a circuit-breaker but should be reported with the actual estimate so soak doesn't react to a non-threat.

### m6: Concurrency on commitments.json

If two `arete` processes write commitments.json concurrently (e.g., user is approving in the UI while winddown is mid-run), `StorageAdapter.write` is atomic per-call (`storage/file.ts:30-39` uses tmp + rename), but read-modify-write is NOT atomic. CommitmentsService.save() reads, modifies, writes — last writer wins. The plan should either (a) acknowledge this is the existing posture and Phase 10 doesn't make it worse, or (b) add file-level locking for the approval-handler that touches multiple files (commitments + N source meetings). Pick (a) for v1, document.

### m7: No dedup-decisions log

Phase 9 added `dev/diary/brief-invocations.log` for observability. Phase 10 mentions "Emit dedup decisions to chef's reasoning log" but doesn't name a file path or format. Recommend `dev/diary/dedup-decisions.log` with one JSONL line per decision: `{ts, kind: "exact|semantic|external", aText, bText, decision: "merge|distinct", confidence, llm_used: bool, cost_usd}`. Mirrors Phase 9 telemetry approach.

---

## Strengths

1. **Hybrid pre-filter pattern is proven in-codebase.** `commitments.ts:591` `reconcile()` and `meeting-extraction.ts:391` `dedupMirrorPairs` already use Jaccard pre-filter with deterministic post-pass. 10b extends this pattern rather than inventing a new one. Lowers integration risk.

2. **Reversibility framing in "What this phase explicitly bets."** Lines 432-439 correctly separate the reversible bet (SKILL.md rewrite) from the durable substrate (data model + brief verb). This is the right way to land a 3-5 week phase — the data model + dedup work is keepers even if the orchestration UX flops.

3. **Honest hard-parts section.** §Hard parts 1-5 names the real risk surface up front rather than burying it in §Risks. Most plans I review save the fuzzy-equivalence problem for AC discussion; this one calls it irreducible up front.

4. **Conservative defaults on external resolution.** "HIGH-confidence only auto-resolves; MEDIUM surfaces" plus the temporal-window + artifact-name guards (Hard part 3) are the right defaults for the trust-crater failure mode. AC7's "Send Lindsay the FINAL deck + deck-draft.pdf → NOT auto-resolved" is the right test case.

5. **Dual-axis sequencing.** 10a (data model) and 10e (background verb) are independently shippable; 10b and 10c are the risky-and-coupled middle. Trimming scope means dropping 10c + 10d while keeping 10a + 10b + 10e — that's a viable MVP path.

---

## Build sequencing recommendation

Current order (10a → 10b → 10c → 10d → 10e) is mostly right. Two changes:

1. **Insert "10a-pre": add `createdAt` field + `arete commitments restore` verb** (~1-2 days). Resolves C1 + C3 before the migration step depends on either.

2. **Demote 10c (external-source resolution) to Phase 11** OR split into 10c-i (Gmail) + 10c-ii (Slack, deferred). Slack API integration is its own beast (see C5); the plan as written hides this in a sub-bullet.

If scope must trim mid-phase, ship order:
- **MVP**: 10a-pre + 10a + 10b-min (10b without cross-day dedup, same-day only per Q4) + 10e. This delivers the data-model win, semantic dedup, and the hygiene verb. SKILL.md rewrite stays the way it is.
- **Drop first**: 10c (external resolution). Highest novel-integration risk per unit of user value. The "Send Lindsay the deck" auto-resolution case is great when it works, catastrophic when it doesn't.
- **Drop second**: 10d (unified approval surface). Per-meeting approval already works (`staged-items.ts:463`); a chat-first unified surface is a UX bet, not a correctness bet.

Riskiest step is 10a's migration. Mitigation: ship migration as a separate `arete commitments migrate --to-v2 --dry-run` / `--apply` pair under a feature flag; let it sit in dry-run for 3-5 days against arete-reserv before flipping. Read-path code can dual-read v1+v2 shape during the transition.

---

## Test strategy gaps

1. **No fixture for owner-as-personSlug entries.** The 155 entries in arete-reserv with `personSlug=john-koht` need a fixture covering: (a) self-reminder rows where owner IS the intended commitment-holder, (b) rows where the text encodes the real counterparty as `@<slug>`, (c) rows with neither — text mentions the counterparty by name only. Test that migration produces correct stakeholders[] for each. Currently absent.

2. **Threshold sweep is described but not parameterized.** §Tests says "threshold sweep at Jaccard 0.3 / 0.5 / 0.6 / 0.7 / 0.85 / 0.95." Doesn't say: synthetic or real? How many pairs? Precision/recall targets? Without targets, "sweep" is qualitative. Recommend: 50 hand-labeled pairs from arete-reserv (positive + negative + ambiguous), measure P/R at each threshold, ship the threshold that maxes F1 with P ≥ 0.9 (false-merge cost > false-miss cost).

3. **LLM determinism for tests.** §Tests doesn't say how the LLM cross-check gets tested. Mock or real? If real, tests are non-deterministic and slow. If mock, you're testing the prompt-routing not the prompt. Recommend: golden-pair set with hand-labeled YES/NO + cached LLM responses for replay tests; one nightly real-LLM job that runs the golden set and alerts on drift.

4. **End-to-end winddown integration test scope is hand-waved.** "Fixture workspace with 3 meetings, 2 overlapping commitments, 1 Slack-evidenced resolution" — but what about the failure paths? Cost cap exceeded mid-run? LLM 429? Storage write fails on one of N source meetings during approval? The atomicity question in m6 needs an AC.

5. **No threshold-drift soak telemetry.** R5 says "ship with conservative threshold, iterate per-soak feedback." Iteration requires data. The dedup-decisions log proposed in m7 IS the data, but the plan doesn't connect it back to the threshold-tuning loop. Add: weekly review pulls the JSONL log, computes P/R against any user-flagged dispute events, recommends threshold delta.

---

## Question-by-question (Q1-Q6 in plan)

**Q1 (tier for cross-check)**: Agree with standard. Counter-recommendation: start with fast tier and measure P/R against the golden-pair set before paying for standard. If fast tier hits ≥85% precision at ≥75% recall, the cost win (5-10x) is worth the marginal accuracy loss. Stand up the measurement first.

**Q2 (auto-resolve batch vs per-item confirm)**: Agree with batch. Add: surface in "Closed today (auto)" with full evidence quote inline (not just a link). User scans the batch in 30 seconds; per-item is winddown-flow death.

**Q3 (`textVariants[]` cap)**: 10 is fine. Eviction: first-N preserved + last-(cap-N) — preserve originality + recency, drop the middle. N=1 is the simplest rule.

**Q4 (cross-day dedup on day 1 vs same-day only)**: Agree same-day only at 10b initial ship. Adds: when extending to cross-day, scope to last 14 days NOT all-time — older commitments either resolved or stale-pruned at 90d (per `PRUNE_HARD_CEILING_DAYS` in `commitments.ts:36`).

**Q5 (canonical by oldest)**: As-stated impossible (see C1). With the proposed fix (add `createdAt`, backfill from `date`), oldest-`createdAt` is the right pick. Alternative: oldest among entries with `area` set (preserves user-curated metadata).

**Q6 (background dedup scheduled vs manual)**: Agree manual-only v1. Add: when scheduling later, gate on cost — running `dedup --scope all` against thousands of commitments is potentially $10-50 in a single run; require interactive `--apply` confirmation, no unattended runs.

---

## Verification checklist for build-time reviews

When 10a lands, verify:
1. `Commitment` type has `createdAt: string` field (or document the chosen alternative).
2. Migration emits a diff report listing every group with before/after, written to a file path named in the plan.
3. Backup file `commitments.pre-phase-10.json` exists post-apply.
4. Reversibility verb (`commitments restore` or documented `cp` instructions) actually works end-to-end on the backup file.
5. Dry-run against `arete-reserv/.arete/commitments.json` produces a diff with the 155 owner-as-personSlug rows handled per the C2 spec — no silent collapse of self-reminder + bilateral pairs.
6. Hash invariance test: `computeCommitmentHashV2("Send Lindsay the deck", "i_owe_them")` produces stable output across runs.

When 10b lands, verify:
7. `dedupMirrorPairs` (intra-meeting) still runs at extract time; cross-meeting dedup runs AFTER and does not double-process pairs already collapsed.
8. Jaccard pre-filter threshold is named as a const, in the same file/style as `MIRROR_PAIR_JACCARD_THRESHOLD` (meeting-extraction.ts:235).
9. LLM cross-check has a cache: same pair seen twice in one winddown session = one LLM call. Test with synthetic re-extraction.
10. Cost meter present: per-winddown total reported at end (per AC11), broken down by exact-match / semantic / external-resolution.
11. dedup-decisions log writes JSONL with the schema in m7.

When 10c lands (if not deferred):
12. External-resolution provider is named (Gmail-only or Slack-only or both) — no claim broader than what shipped.
13. Temporal window rule is spec'd numerically (e.g., "after `commitment.createdAt`, before now, no upper bound").
14. Artifact-name match is implemented as a deterministic check (not LLM) — keyword list + filename substring match.
15. `[[unresolve]]` directive parser exists in the next-winddown flow; an auto-resolved commit can be un-resolved by adding the directive in the prior sidecar.

When 10d lands (if not deferred):
16. MCP-action proposal wire format is spec'd — what JSON shape does `[Approve]` emit? Where does the handler live? Today's daily-winddown SKILL.md (line 37) references Pattern 3 `propose-with-mcp-action` but is markdown-only — the proposals are textual, not structured. 10d needs to be specific about which it ships.
17. Approval handler atomicity: writes commitments.json + N meeting files. If write N+1 fails, what's the rollback state? Acceptance: log the partial state, leave commitments.json as truth, document recovery in the cost/diagnostic output.

When 10e lands:
18. `arete dedup --scope commitments --dry-run` against arete-reserv runs in under 60s for ~thousands of entries (the LLM-cross-check is the long pole; either parallelize calls or cap per-run).
19. Idempotent re-run AC10 holds: second `--apply` writes nothing new.
20. No silent destructive default: `arete dedup --scope all` without `--apply` is dry-run by default; bare `--apply` requires interactive confirm above $1 estimated spend.
