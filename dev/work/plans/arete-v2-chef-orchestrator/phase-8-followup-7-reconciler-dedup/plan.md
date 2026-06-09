---
title: "Phase 8 followup-7 — Reconciler dedup against open commitments (Rule 4)"
slug: phase-8-followup-7-reconciler-dedup
created: "2026-06-01"
revised: "2026-06-01 — post review-1"
parent: arete-v2-chef-orchestrator
owner: meta-orchestrator (Claude)
status: revised-post-review-1
input_signal: project-agent feedback after first Phase 8 winddown on 2026-06-01 (cadence item re-created as near-duplicate of already-open commitment)
---

## Revisions from review-1 (eng-lead, 2026-06-01)

- **C1 [HIGH]**: Recurring-item guard added to Rule 4 at ship (parallel to Rule 2's R6 guard). New AC1 Concrete-match bullet: "**Recurring-item guard**: if matched open commitment is < 5 days old AND text appears in a recurring meeting's action items (loop's `source_meeting.recurring: true`), drop to `## Uncertain` regardless of Jaccard." Neutralizes the soak-window R3 failure (John's weekly 1:1 cadence items getting silently collapsed). Predictable damage prevented day-1.
- **C2 [MED]**: Direction-guard mirror-pair handling fixed. New AC1 bullet: "If two open commitments exist for the same counterparty + ≥0.9 text overlap + opposite directions (mirror-pair signature), exclude BOTH from Rule 4 candidate set and surface as `## Uncertain` flagging parser-bug suspect." Prevents Rule 4 from hiding parser-bug mirror pairs via silent collapse.
- **C3 [LOW]**: Cross-rule join with Rule 1 specified in AC1: "If the matched commitment ID also appears as a Rule 1 fulfillment candidate in the same loop ledger, prefer the Rule 1 CT line (resolve commitment + cite fulfillment) over the Rule 4 CT line (skip-stage)." AC4 regex assertion added: `/Rule 1.*precedence|prefer.*Rule 1/i`.

# Phase 8 followup-7 — Reconciler dedup against open commitments

## Why this exists

The 2026-06-01 winddown (first chef-pattern Phase 8 run in production)
created a near-textual duplicate commitment: a cadence-style action item
from today's meeting was staged + surfaced for approval even though an
already-open commitment with ≥70% Jaccard overlap was tracked in
`commitments.json`. User had to hand-clean the duplicate.

The Phase 8 Step 2 reconciler runs three skip rules:

- **Rule 1** — intent → fulfilling action elsewhere (slack/email)
- **Rule 2** — intent → already-scheduled calendar event
- **Rule 3** — action moot, event passed (cheapest, runs first)

But **none** of them ask the simpler question: "Is this freshly-staged
item already represented by an open commitment in
`.arete/commitments.json`?" The chef happily re-stages it, the user
approves the curated view (already mentally fatigued from approving a
list), and the duplicate lands.

The leak compounds the **mirror-pair problem** (separate plan item):
duplicates inside the curated view PLUS near-dups against existing
state means cleanup becomes a de-facto second loop. Phase 8's
user-felt-win premise — "fewer items hand-skipped" — degrades when
chef itself introduces the items the user has to skip.

**One-line goal**: add a "Rule 4 — intent → already-tracked commitment"
dedup pass that runs **before** staged-item composition. Concrete
overlap → propose collapse (not create). Fuzzy → Uncertain.

## Scope (acceptance criteria)

### AC1 — Rule 4 added to Step 2 reconciler prose (GATE)

`packages/runtime/skills/daily-winddown/SKILL.md` Step 2:

- Add **Rule 4 — Intent → already-tracked open commitment** as a new
  sub-section, ordered **after Rule 3 (cheapest) and before Rule 1
  (most expensive)**. Final rule order: Rule 3 → **Rule 4** → Rule 1
  → Rule 2.
- For each staged-item candidate from process-meetings gather-only
  (Step 1m loops with `kind: "commitment-outgoing" | "commitment-incoming"
  | "incoming-ask" | "outgoing-ask"`) AND each open commitment from
  `arete commitments list --json` (Step 1o output):
  - **Counterparty resolution** preferred via `arete people show
    --channels` slug match. If counterparty slug matches OR loop has
    no counterparty (fall-through), proceed to text compare.
  - **Text overlap** ≥ **0.7 Jaccard** on normalized tokens (lowercased,
    non-alphanumeric stripped, split on whitespace). Threshold matches
    or exceeds `CommitmentsService.reconcile()`'s `JACCARD_THRESHOLD =
    0.6` deliberately — Rule 4 ships **stricter** than the existing
    reconcile() because it acts pre-stage; over-collapse here silently
    drops a fresh capture, while under-collapse leaks one re-stage.
    Conservative-collapse principle (D1) favors stricter threshold for
    pre-stage gates.
  - **Direction guard**: open commitment direction
    (`i_owe_them` / `they_owe_me`) MUST match the loop kind direction
    (`commitment-outgoing` / `commitment-incoming` respectively). A
    fresh outgoing-ask MUST NOT collapse against an open
    `they_owe_me` of the same text — they're different commitments
    with the same words.
- **Concrete match (≥0.7 + counterparty match + direction match)**:
  propose collapse to `## Closed today (proposed)` with the action
  `skip staging this item (already tracked as commitment <ID>)`. NO
  new commitment created. NO staged item surfaced separately.
- **Fuzzy match (0.5 ≤ Jaccard < 0.7, OR counterparty name-string-only
  fallback, OR direction-ambiguous)**: surface to `## Uncertain — your
  call` as "Possibly same as open commitment <ID> '<text>' — collapse
  or stage fresh?"
- **Below 0.5**: no match; proceed to Rules 1+2 (existing) and then
  normal stage pipeline.

### AC2 — Reuse `CommitmentsService.reconcile()` logic (DOCUMENTATION-ONLY)

Per D7 ("Reconciler implementation: agent judgment in-context. No new
CLI primitive initially"), Rule 4 stays as **SKILL.md prose**, NOT a
new CLI verb. But the prose explicitly references the same
normalization + Jaccard primitives already shipped in
`packages/core/src/services/commitments.ts:233-239` (the `normalize()`
helper + `jaccardSimilarity()` from `utils/similarity.js`) so the
human/agent reading the SKILL.md is grounded in identical math.

- Add a one-line pointer in Step 2 Rule 4 prose: "uses the same
  normalize-then-Jaccard logic as `CommitmentsService.reconcile()` —
  see `commitments.ts:233-239`."
- This is **for traceability**, not coupling. If a future phase
  hardens Rule 4 into a CLI verb (`arete commitments dedup --json` or
  similar), the agent + the code share one similarity definition.

### AC3 — Curated-view output template update (GATE)

Step 4 output template (`## Closed today (proposed)` block) gains an
example CT-line covering the Rule 4 case:

```markdown
[CT4] Meeting action 'Send Anthony the API spec' appears to already be
      tracked as open commitment `9f3b1c8e` ('Send API spec to Anthony',
      direction=i_owe_them, 9d old). Text Jaccard 0.82, counterparty match.
      Evidence: arete:commitments/9f3b1c8e
      Action if approved: skip staging this item (already tracked)
```

The Rule 4 evidence pointer scheme is `arete:commitments/<8-char ID>`,
parallel to `slack:`, `calendar:`, and `meeting:` pointers in Rules
1-3.

### AC4 — Test (GATE)

`packages/core/test/services/chef-orchestrator-skills.test.ts`,
within the existing `describe('Phase 8 — daily-winddown cross-skill
chef-orchestrator')` block, add a new nested describe `describe('AC4
— Rule 4 dedup against open commitments (Phase 8 followup-7)')`:

- Regex: `/Rule 4.*Intent.*already-tracked.*commitment/i` — rule
  exists in Step 2.
- Regex: `/0\.7\s+Jaccard|Jaccard.*0\.7/` — threshold cited.
- Regex: `/arete:commitments\//` — evidence pointer scheme present.
- Regex: `/Direction guard|direction.*match/i` — direction guard
  present (prevents mirror-pair false-collapse).
- Regex: counts: 4 occurrences of `### Rule ` in Step 2 (was 3).

Loose-regex convention per Phases 2 + 3.5 + 7a + 8. Per D7 no
end-to-end reconciler test; soak validation.

### AC5 — Discipline ledger

Per parent plan AC8: net delta ≤ 0 OR explicit substitution argument.

| Item | LOC estimate |
|---|---|
| daily-winddown SKILL.md Step 2 Rule 4 prose (new sub-section) | ~+60 markdown |
| daily-winddown SKILL.md Step 4 CT4 example | ~+8 markdown |
| chef-orchestrator-skills.test.ts new describe block | ~+25 test |
| **Net (markdown)** | **~+68** |
| **Net (code, non-test)** | **0** |

Substitution argument: ~+68 markdown buys closure of a user-felt leak
(cadence-item duplicate on first production winddown). Markdown-only
followup; no Core / CLI change. Cumulative ledger from 7a+7b+8 stays
negative on the code-only line.

### AC6 — Rollback path

`git revert <followup-7 commit>` cleanly restores three-rule
reconciler. No data migration, no fork drift; the SKILL.md is the
only artifact.

If Rule 4 over-collapses (silently drops captures that should have
been staged fresh, surfaced in soak as missed-capture diary entries):
revert + reassess threshold (currently 0.7) OR move all matches to
Uncertain regardless of confidence as a stricter v2.

## Decisions locked (this plan)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| F7-D1 | Rule placement | **New Rule 4**, not extension of Rule 1 | Rule 1 matches against fulfillment evidence (slack/email "I sent it"); Rule 4 matches against tracked state ("it's already a commitment"). Different evidence source, different failure modes, different graceful-degradation behavior. Single-responsibility per rule. |
| F7-D2 | Threshold | **0.7 Jaccard** (stricter than reconcile()'s 0.6) | Rule 4 acts pre-stage; over-collapse silently drops captures. Stricter threshold favors under-collapse, which leaks one re-stage (visible + user can dedup at approve time). |
| F7-D3 | Rule order | **3 → 4 → 1 → 2** | Rule 4 is local-only (no slack/calendar fetch needed; commitments list already in cache from Step 1o). Run cheap before expensive. |
| F7-D4 | Reuse | **Doc-pointer to `commitments.ts` reconcile()** | Per D7 no new CLI. Agent + code share one similarity definition by reference, not coupling. |
| F7-D5 | Direction guard | **Required match** | Prevents mirror-pair false-collapse against the parser-bug mirror-pair commitments (separate cleanup track). Without this guard, the new dedup rule could mask a genuinely-new outgoing-ask by collapsing against an unrelated they_owe_me with same text. |

## Recommendation: hotfix vs full-cycle

**Hotfix.** Scope is:

- 1 file modified (`daily-winddown/SKILL.md`)
- ~+68 LOC markdown total
- 1 test file extended with 1 new describe block
- 0 Core / CLI / generator changes
- No data migration, no schema change
- `git revert` is a clean undo

Compare to the Phase 8 followup-2 plan: that touched CLI + service +
generator + 3 docs + tests. This one is **prose + one test block**.

**Recommended path**: single PR titled
`phase-8-followup-7(daily-winddown): add Rule 4 dedup against open
commitments`. Sub-orchestrator runs in a sub-worktree per Phase 3+
pattern but the build is one commit + one rebuild-dist commit.

**Soak window**: 7 days post-merge with first winddown deliberately
hand-verified (user spot-checks any Rule 4 proposed-collapse against
the actual commitment to confirm the match is real). If 7 days with
zero false collapses, Rule 4 is trusted-default. If any false
collapse, revert and reassess threshold.

## Skeptical view (per parent plan principle #9)

**Strongest case against:**

"The bug fixed itself today — the user noticed the duplicate and
hand-cleaned it. The reconciler is conservative-by-design; the user
review surface caught the regression. Adding Rule 4 means the agent
now has FOUR rules to reason through per loop, increasing the chance
of agent-side reasoning error or rule-collision (Rule 4 collapses
something Rule 1 would have legitimately flagged with stronger
evidence). The 'mirror-pair' problem on the parallel track is the
real culprit; fix THAT, and Rule 4 becomes redundant for the textual-
duplicate class. Adding a fourth rule before fixing the structural
cause is treating symptoms."

**Counter:**

1. **Rule 4 fixes a different class than mirror-pair**. Mirror-pair
   is a parser bug producing two commitments per compound sentence.
   Rule 4 catches a fresh meeting-extracted intent matching an
   already-aged open commitment from a prior meeting (or from earlier
   today). These are independent leaks; fixing one doesn't close the
   other.
2. **Conservative-by-design AT 0.7 + direction guard**. The skeptical
   case implies aggressive collapse; the plan ships strict threshold
   (0.7 > reconcile()'s 0.6) and direction-guard. False-positive risk
   is bounded; false-negative is "one re-stage the user dedups at
   approve time" — the status quo, no worse.
3. **Soak is the validation layer**. Per D7 + AC7 prior phases, the
   prose-test-only approach IS validated by soak. Same here. If soak
   surfaces false collapses, revert.
4. **Four rules vs three is not a meaningful cognitive load increase**
   for the agent. The chef already reasons through 3 rules + tier
   placement + reason labels + APPEND content + week.md context. One
   more well-bounded rule with explicit thresholds is small marginal
   complexity.
5. **The user-felt-win premise of Phase 8**. If first production
   winddown produces hand-cleanup, the premise wobbles. Rule 4 closes
   the cleanup loop the user actually hit on day 1.

**Residual concern**: rule-order collision between Rule 4 (collapse
to commitment) and Rule 1 (collapse to fulfillment evidence). The 3
→ 4 → 1 → 2 order means Rule 4 fires first; a fresh intent matching
BOTH an open commitment AND a slack fulfillment will collapse to the
commitment (Rule 4), not to the fulfillment trace (Rule 1). This is
the right call — the user wants ONE collapse evidence, and the
commitment ID is the durable canonical reference. But surface in
pre-mortem.

## Risks summary (full pre-mortem in pre-mortem.md)

- **R1** — Silent over-dedup drops fresh captures (the main risk)
- **R2** — Threshold tuning wrong (0.7 too strict / too loose)
- **R3** — Recurring-item false positives (weekly standing actions)
- **R4** — Rule-order collision with Rule 1 fulfillment evidence
- **R5** — Direction guard insufficient for mirror-pair case
- **R6** — Agent confusion: 4 rules harder to apply than 3

## Phase plan requirements

- **MC1 (gates vs stretch)**: All ACs are gates. No stretch — bounded
  prose-only scope.
- **MC2 (per-skill rollback)**: `daily-winddown` is prose-only;
  `git revert` is rollback.
- **MC3 (shadow validation)**: not applicable — bounded prose
  addition. Soak window (7 days) is the validation layer.
- **MC4 (PATTERNS.md ship first)**: N/A — no new pattern. Rule 4 is
  an instance of the existing Step 2 reconciler shape.
- **MC5 (legacy interaction)**: N/A — Phase 3 sunset complete.

## Build orchestration

Sub-orchestrator runs in a sub-worktree per Phase 3+ pattern.

Branch: `worktree-phase-8-followup-7-reconciler-dedup`
Worktree path: `.claude/worktrees/phase-8-followup-7-reconciler-dedup`

Steps:

1. **Pre-flight**: verify Phase 8 commit reachable; verify no other
   open followup branches touching daily-winddown/SKILL.md (avoid
   collision with followup-2 if still in flight).
2. **AC1 + AC3 build** — daily-winddown/SKILL.md edits (Step 2 Rule 4
   sub-section + Step 4 CT4 example). One commit.
3. **AC4 build** — chef-orchestrator-skills.test.ts extension. One
   commit.
4. **Run tests** — per-file `npx tsx --test` on
   chef-orchestrator-skills.test.ts + regression check across prior
   phases' tests (per AC7 from parent Phase 8 plan).
5. **Rebuild dist**. Commit per CLAUDE.md "commit dist files" memory.
6. **Write build-report.md** with: SKILL.md diff summary, test pass
   confirmation, rebuild confirmation, soak-window onboarding note
   (first 7 winddowns: user spot-checks Rule 4 proposed-collapses).

Eng-lead review at end. Fix-ups if needed. Merge to parent.

## Open questions / parking lot

- **Threshold tuning**: 0.7 is a starting point. If 7-day soak surfaces
  consistent over- or under-collapse, follow-up adjusts. Phase 5
  parser-bug fix may also reduce mirror-pair noise, indirectly
  changing the false-positive surface.
- **Recurring-meeting cadence items**: e.g., "send X status update in
  weekly Y sync" extracted weekly. Direction guard alone doesn't
  catch this — the prior week's commitment is genuinely OPEN until
  resolved. Possible follow-up: time-since-creation gate (only
  collapse against commitments < N days old) OR resolve cadence as
  intentional duplicates. **Decision deferred to soak findings**.
- **CLI hardening**: if Rule 4 proves out in soak (high precision, low
  false-positive), Phase 9 candidate is `arete commitments dedup
  --json` as a CLI verb so other skills (process-meetings standalone,
  meeting-prep) can call the same logic. Parking-lot, not in scope.
- **Mirror-pair interaction**: this plan's direction guard helps but
  does NOT fully solve mirror-pair (parser bug emits BOTH directions).
  Track separately. Rule 4 false-positive on mirror-pair would
  surface as "collapse against the WRONG side" — surface in soak.
