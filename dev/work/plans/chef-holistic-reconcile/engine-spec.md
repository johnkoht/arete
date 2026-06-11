# Reconcile-engine spec (`reconcile-engine`) — CHR W1

Status: SPEC v1 (2026-06-11, overnight build). Referenced by the
`reconcile-engine` pattern in `packages/runtime/skills/PATTERNS.md`.
Consumers: daily-winddown (horizon=day), weekly-winddown (horizon=week,
ships per CHR W5 sequencing — after daily has ≥2 clean weeks post-W6).

One reconciliation brain (CHR D1): all cross-item judgment — cross-meeting
dedup, intent-vs-commitment, fulfillment scan, moot detection, supersession
arcs — happens in ONE holistic pass at winddown time. The engine is
**agent judgment specified here**, supported by deterministic CLI
primitives (`arete reconcile nominate`, `CommitmentsService.reconcile()`,
`writeWithLock`). The agent never does mechanical similarity itself; the
primitives never make judgment calls.

Invariants inherited whole (do not re-derive):
- **Proposed-only is sacred (D7)**: the engine computes, the chef proposes,
  the user approves. No auto-mutations. `[[unmerge]]`, `[[confirm]]`,
  `[[unskip]]`, `[[confirm-skip]]`, pull-backs all survive unchanged.
- **Conservative collapse (D1)**: every collapse cites concrete evidence;
  fuzzy → `## Uncertain — your call`, never silent.
- **Idempotency rails (D8)**: R7 resolvedAt check, processed/approved batch
  status filter, `excludePath` strict-`===`, body-only content hashing,
  `writeWithLock` partial-merge.

---

## 1. Ledger shape

The engine's input is the **merged, timestamp-ordered day ledger** (week
ledger for horizon=week). It composes the gather-only loop shape
(PATTERNS.md § "gather-only composition" → "JSON output shape conventions")
with extraction entries. One array, ordered by `timestamp` ASC; ties break
by source order (meetings → slack → email → calendar → commitments →
week.md) then by stable input order.

```json
{
  "horizon": "day",
  "window": { "target": "2026-06-09", "lookback_days": 7 },
  "entries": [
    {
      "kind": "extraction",
      "source": "meeting",
      "source_ref": "resources/meetings/2026-06-09-anthony-1-1.md",
      "item_id": "de_002",
      "item_type": "decision",
      "timestamp": "2026-06-09T15:00:00Z",
      "text": "Keep claim-assignment rules in the legacy rules engine for Q3",
      "counterparty": "anthony-avina",
      "tier": "normal",
      "uncertain": false,
      "uncertainty_reason": null,
      "direction": null,
      "continuation_of": null,
      "supersedes": null,
      "status": "pending",
      "evidence_pointer": "resources/meetings/2026-06-09-anthony-1-1.md#de_002"
    },
    {
      "kind": "open-thread",
      "source": "slack",
      "source_ref": "C0123ABC/p1716822720000",
      "timestamp": "2026-06-09T14:32:00Z",
      "text": "Anthony asked if the API spec is ready — second ping this week.",
      "counterparty": "anthony-avina",
      "evidence_pointer": "slack://team/C0123ABC/p1716822720000"
    }
  ]
}
```

Entry kinds and their producers:

| kind | producer | notes |
|---|---|---|
| `extraction` | Step 1h pure extracts (raw, pre-reconcile) | carries the single-pass fields: `tier` (`blocker\|high\|normal`), `uncertain` + `uncertainty_reason`, `direction` (incl. `none`), `continuation_of`, `supersedes`, per-item `status` from `staged_item_status` |
| `open-thread`, `incoming-ask`, `outgoing-ask` | slack-digest / email-triage `[gather-only]` | loop shape verbatim |
| `commitment-outgoing`, `commitment-incoming` | process-meetings gather + `arete commitments list --json` | open commitments enter as entries so Rule 4 sees them in-band |
| `calendar-event` | calendar pull (forward + back) | feeds Rules 2 and 3 |
| `completion` | week.md / scratchpad completed tasks | feeds completed-task matching |
| `workspace-evidence` | **workspace APPEND** (see § 8 — jira et al.) | generic evidence source; engine treats it like slack/email evidence |

Two hard rules about the ledger:

1. **Raw, not post-inline.** Extraction entries come from the meeting files
   as written by PURE extraction (day-level mode) or — during the W7 shadow
   soak — from the raw pre-reconcile snapshots in
   `dev/diary/raw-extractions/` (pre-mortem R2: the shadow engine must
   never consume post-inline state).
2. **Arcs survive composition.** When the same workstream appears in
   multiple entries, ALL occurrences stay in the ledger in timestamp order.
   Dedup of ledger entries themselves is forbidden — that is the engine's
   judgment output, not its input shape. (This is the project-memory risk
   "dedup hiding arc by collapse-to-oldest" made structural.)

## 2. Phases R0–R4

```
R0 idempotency sweep          (mechanical + directive scan)
R1 ledger build               (mechanical composition, shape above)
R2 candidate nomination       (mechanical — `arete reconcile nominate`)
R3 judgment pass              (agent, rules 3→4→1→2 + quality gate + arcs)
R4 write decisions            (mechanical writes via writeWithLock)
```

### R0 — Idempotency sweep

Before anything else:
- **R7 re-run check** (verbatim from daily SKILL.md Step 2): for any
  commitment with `resolvedAt > today_start` (00:00:00 local), never
  re-propose collapse — it was resolved earlier today on a prior run. Note
  the skip count in `## Notes`.
- **Prior-day directive scan**: resolve `[[unmerge]]` (Step 2.6),
  `[[confirm]]`/`[[unconfirm]]`/`[[unresolve]]` (Step 2.7),
  `[[unskip]]`/`[[confirm-skip]]` before computing anything — user
  decisions from the last winddown re-shape today's input.
- **User-decision mask**: items with `staged_item_status` of `approved` or
  `skipped` (any producer) are READ-ONLY for the engine. They may serve as
  evidence/canonicals but are never re-decided.

### R1 — Ledger build

Compose per § 1. Daily: today's entries + 7-day lookback meeting batch as
context. Weekly: the week's entries (its own gather scope). The lookback
batch loads via the W2 primitive's loader (status filter
`processed|approved`, `excludePath` strict-`===` — the LEARNINGS.md
2026-04-29 trap; pass paths exactly as `storage.list` emits them).

### R2 — Candidate nomination (mechanical, cheap)

`arete reconcile nominate --ledger <file.json> --days 7 --json` (CHR W2).
Pure function over the ledger file. Emits **candidate pairs only** —
nomination is NEVER a decision:

- **Jaccard ≥ 0.7** on normalized tokens within the ledger (same
  normalize-then-Jaccard as `CommitmentsService.reconcile()`;
  `commitments.ts` `normalize()` + `utils/similarity.js`).
- **Memory match**: decisions/learnings vs recent committed memory
  (`matchRecentMemory` semantics).
- **Completed-task match**: actions vs week.md/scratchpad completions
  (`matchCompletedTasks` semantics).
- **`continuation_of` / `supersedes` claim verification**: each model claim
  becomes a nominated pair tagged `claimed` — a claim to VERIFY in R3, not
  truth (D3).
- **Relevance scoring** (`scoreRelevance` weights) annotates each entry for
  sidecar tiering.

**Threshold-unity scope (deliberate, do not "fix"):** the 0.7 constant is
unified across **nomination** paths only. Judgment-band thresholds are R3
parameters and keep their deliberate values (§ 3). A naive
one-constant-everywhere sweep would re-open the 2026-06-01 leak class
Rule 4 was built to close (review F2).

Nomination also emits **sub-band candidates** (0.5 ≤ J < 0.7) tagged
`uncertain-band` so R3's Rule 4 fuzzy routing has its input — sub-band
pairs are never collapse candidates, only Uncertain-surface candidates.

### R3 — Judgment pass (agent)

Operates ONLY on nominated candidates + ledger context. Rule order
(cheap-first, verbatim from daily SKILL.md Step 2): **Rule 3 → Rule 4 →
Rule 1 → Rule 2**, then the quality gate, then arc assembly, then sidecar
tiering. Rules are lifted from daily SKILL.md Step 2 and remain the
canonical definitions there until W4 rewires; this spec pins the
parameters that MUST survive the move:

- **Rule 3 — moot, event passed.** Concrete-only (explicit event reference
  in the intent text; event timestamp < now). Evidence: the calendar event.
- **Rule 4 — intent → already-tracked open commitment.** All guards
  survive verbatim: stakeholders[] set-overlap counterparty resolution
  (excluding role='self'; v1 `[personSlug]` fallback), **direction guard**
  (kind must match commitment direction), **mirror-pair signature
  exclusion** (same counterparty set + ≥0.9 overlap + opposite directions
  ⇒ exclude BOTH, surface to Uncertain with `parser-bug-suspect`),
  **recurring-item guard** (matched commitment < 5 days old + recurring
  source meeting ⇒ Uncertain regardless of Jaccard), **Rule 1 precedence**
  (same commitment also fulfillment-matched ⇒ prefer the Rule 1 CT line).
  **Bands (deliberate — daily SKILL.md:583, 632–642):**
  - ≥ 0.7 + counterparty + direction (and no guard fires): concrete →
    propose collapse.
  - **0.5 ≤ J < 0.7 (the Uncertain band)**: surface to
    `## Uncertain — your call`, never collapse.
  - < 0.5: no match.
  - The **0.6 collapse threshold belongs to `CommitmentsService.reconcile()`**
    (`JACCARD_THRESHOLD = 0.6`) — a *primitive the engine calls* (D1),
    post-approval scope. Rule 4 is deliberately stricter (0.7) because it
    acts pre-stage where over-collapse silently drops a fresh capture.
    Both values are engine-spec parameters with Layer-1 fixtures; neither
    is folded into the R2 nomination constant.
- **Rule 1 — intent → fulfilling action elsewhere.** Counterparty via
  channels cache; topic overlap ≥ 0.5; fulfillment timestamp ≥ intent.
  Graceful degradation: name-string-only counterparty ⇒ Uncertain
  regardless of topic confidence (`slack_user_id` backfill note rendered).
- **Rule 2 — intent → already-scheduled event.** Attendee chain slug →
  email → name; recurring-generic-title guard ⇒ Uncertain.
- **Quality gate (absorbs `batchLLMReview`, D9).** The second-pass
  low-signal drop review moves INTO this judgment pass: low-signal /
  vague / non-actionable staged actions are proposed-skip with reason.
  Single-pass tiers + ⚠ feed it: `blocker` is NEVER quality-dropped;
  `uncertain: true` items inherit their `uncertainty_reason` into the
  proposal. (Until W4 rewires, day-level Stage-0 runs `batchLLMReview`
  itself inside `arete meeting reconcile-day` — same gate, mechanical
  placement.)
- **Cross-meeting duplicate judgment.** For R2 Jaccard nominations between
  extraction entries: judgment confirms or rejects. Confirmed duplicate
  with NO new information ⇒ propose visible skip on the LATER occurrence
  (`matched_ref` = canonical). Any nominated pair where the later entry
  adds state (new owner, new deadline, reversal, refinement) is NOT a
  duplicate — it enters arc assembly (§ 4).

### R4 — Write decisions (mechanical)

All writes go through `writeWithLock` partial-merge (mtime-guard per call
site), touching ONLY the keys owned:

- `staged_item_status[id] = 'skipped'` (or stays `'pending'` for proposals
  per the existing week-1/confirm-gate machinery),
- `staged_item_source[id] = 'chef-dedup'` (§ 5),
- `staged_item_skip_reason[id] = { reason, evidence, matched_ref, setBy,
  setAt }` — `setAt` is REQUIRED (the reader drops entries without it),
- dedup-decisions log entry (the `[[unmerge]]` resolver reads it),
- item-fates events (`buildSkippedItemFateEvents` shape) to
  `.arete/memory/item-fates.jsonl`,
- reverse-stamping of canonical meetings (superset of what 10b
  `wireExtractDedup` wrote — its visibility contract moves here at W6).

Items already `approved`/`skipped` are never touched (R0 mask). Re-runs
are no-ops by construction: prior `skipped` + R7 check + dedup-log
presence.

## 3. Judgment-band parameter table (Layer-1 fixtures pin these)

| Parameter | Value | Owner | Why it is NOT the nomination constant |
|---|---|---|---|
| R2 nomination Jaccard | 0.7 | `arete reconcile nominate` | unified candidate filter (D5) |
| R2 uncertain-band nomination | 0.5 ≤ J < 0.7 | `arete reconcile nominate` | feeds Rule 4 fuzzy routing; never a collapse candidate |
| Rule 4 concrete collapse | ≥ 0.7 + counterparty + direction | R3 judgment | pre-stage gate; over-collapse = silent data loss |
| Rule 4 Uncertain band | 0.5–0.7 | R3 judgment | deliberate (SKILL.md:632–642); parser-bug-suspect routing |
| `CommitmentsService.reconcile()` | 0.6 | primitive (post-approval) | survives as engine-called primitive (D1); leak-vs-loss tradeoff differs post-stage |
| Rule 1 topic overlap | ≥ 0.5 | R3 judgment | fulfillment scan tolerates paraphrase; evidence requirement compensates |
| Mirror-pair signature | ≥ 0.9 + opposite directions | R3 guard | bug-surface detector, not dedup |

## 4. Arc assembly (D4) — rules + worked examples

When ≥2 ledger entries describe the SAME workstream (nominated pair where
the later entry adds/changes state, or a verified `supersedes` claim), the
engine assembles an **arc**, presents it oldest → newest with flip-flops
visible, and recommends a resolution. It NEVER silently collapses to the
oldest — newest-drop is the collapse-to-oldest artifact this plan exists
to kill.

Arc rules:

1. **Membership**: entries join an arc via (a) confirmed R2 nomination with
   state-change, (b) verified `continuation_of`/`supersedes` claims, or
   (c) transitive chaining of (a)/(b). Same-workstream is a judgment call
   on nominated candidates only.
2. **Ordering**: ledger timestamp ASC. Same-file items order by item id.
3. **Presentation**: every member renders with source ref + timestamp; the
   recommendation names which member should survive and WHY (evidence
   class, recency, specificity). The recommendation is a proposal (D7).
4. **Write semantics on user approval**: surviving member stays
   pending/approved; superseded members get visible
   `skipped` + `chef-dedup` + skip_reason with `matched_ref` → the
   survivor. Never delete body lines.
5. **Mirror-pair / recurring guards apply INSIDE arcs**: a would-be arc
   whose members trip the mirror-pair signature goes to Uncertain whole.

### Worked example 1 — same-day supersession (the AC3 fixture)

2026-06-09: Anthony 1:1 (morning) emits
`de_002: "Keep claim-assignment rules in the legacy rules engine for Q3"`.
The compliance workshop (afternoon) emits
`de_004: "Build automated claim assignment by adjuster license profile
before Snapsheet sunset"` with `supersedes: de_002` (model claim).

- R2 nominates the pair (claim verification path; Jaccard alone may be
  sub-0.7 — claims are first-class nomination input).
- R3 verifies: same workstream (claim-assignment routing), afternoon entry
  reverses the morning decision. NOT a duplicate — arc.
- Render:

  ```
  ## Arc — claim-assignment routing (2 items, same day)
  1. 09:00 anthony-1-1 de_002 — keep rules in legacy engine for Q3
  2. 14:00 compliance-workshop de_004 — build automated license-profile
     assignment before Snapsheet sunset  [supersedes #1, blocker]
  Recommendation: keep #2 (later, larger forum, explicit reversal with
  Snapsheet-sunset deadline); mark #1 superseded.
  ```

- Failure mode being prevented: first-occurrence-wins dedup keeps de_002
  and skips de_004 — the BLOCKER dies and the stale decision survives.

### Worked example 2 — A→B→A reversal (flip-flop must stay visible)

Monday standup: "Ship the importer behind a flag" (A). Tuesday eng sync:
"Don't flag the importer; ship dark" (B, supersedes A). Thursday 1:1 with
the eng lead: "Back to the flag — compliance wants the kill switch" (A′).

- All three join one arc (transitive nominations).
- The engine MUST render all three. Collapsing A′ into A as "duplicate"
  (their Jaccard will exceed 0.7!) would hide the reversal-of-reversal —
  the user would see a stale B-vs-A pair and resolve it backwards.
- Rule: **within an arc, high Jaccard between non-adjacent members is arc
  evidence, not dedup evidence.** Recommendation: keep A′, mark A and B
  superseded, cite the Thursday compliance rationale.

### Worked example 3 — three-meeting chain (continuation, not duplicate)

Weekly platform sync emits `ai_007: "Migrate the webhook retries to the
queue"` three weeks running; weeks 2 and 3 carry
`continuation_of: <ai_007/commitment ref>` (series resolver context made
the model mark instead of re-emit).

- R2 nominates weeks 2/3 against the open commitment (claim + Jaccard).
- R3: verified continuation of tracked state, no state change ⇒ this is
  Rule 4 territory (already-tracked), NOT an arc and NOT a fresh capture
  per week. Propose skip-stage with `matched_ref` → the commitment.
- BUT the recurring-item guard still applies: if the commitment is < 5
  days old and the meeting is recurring, drop to Uncertain — last week's
  unresolved instance may be a genuinely different obligation.
- Contrast with example 1: continuation collapses toward the TRACKED
  state; supersession collapses toward the NEWEST state; duplicates
  collapse toward the CANONICAL (first). The three are distinct verdicts
  and each writes a distinct `reason` vocabulary (§ 5).

## 5. Provenance vocabulary (D5)

Writers emit `source: 'chef-dedup'` for every engine decision.
**Readers accept `'reconciled'` forever** (months of history; W6 adds the
historical-fixture reader test). Every skip/collapse carries:

```yaml
staged_item_skip_reason:
  de_002:
    reason: "superseded same-day by workshop decision (arc: claim-assignment)"
    evidence: "resources/meetings/2026-06-09-compliance-workshop.md#de_004"
    matched_ref: "2026-06-09-compliance-workshop.md:de_004"
    setBy: chef          # or chef-proposed during confirm-gate windows
    setAt: 2026-06-09T22:14:03Z   # REQUIRED — reader drops entries without it
```

`reason` controlled prefixes (greppable, item-fates analytics):
`duplicate (…)`, `already tracked (…)`, `already completed (…)`,
`superseded (…)`, `moot (…)`, `low-signal (…)`. `evidence` is a concrete
pointer (file#id, slack://, calendar event id) — "nothing is skipped
without a user-visible why." Nothing in the engine ever writes bare
`skipped` without a skip_reason entry.

## 6. Degraded-mode contract (legacy-shaped input)

If `extraction_mode` reverts to `legacy` while the engine is live, the
engine keeps functioning on tier-less input (pre-mortem R3):

| Missing field | Engine behavior |
|---|---|
| `tier` | treat as `normal` (never auto-anything; quality gate may not assume blockers exist) |
| `uncertain` / `uncertainty_reason` | trust the legacy confidence float as a *staging signal* (post-SP-W3 semantics: confidence is telemetry-with-persistence, not a silent drop filter — review F8 note) |
| `continuation_of` / `supersedes` | nomination-only dedup: R2 Jaccard/memory/completed candidates still flow; R3 loses claims but not evidence |
| `direction: none` | absent in legacy; binary directions pass through untouched |

This contract has its own Layer-1 test (legacy-shaped fixture through the
nominate primitive + an engine-spec checklist assertion) so an SP rollback
never strands the winddown. Mid-soak SP rollback additionally pauses the
W7 shadow soak and resets its clock (soak-validity rules in plan W7).

## 7. R7 idempotency (deliberate same-day re-run)

A second engine run on the same day must propose zero already-resolved
items. Mechanism stack (all four, not any one):
1. R0 R7 check — `resolvedAt > today_start` commitments excluded.
2. R0 user-decision mask — `approved`/`skipped` items are read-only.
3. R4 writes are partial-merge upserts keyed by item id — re-writing an
   identical decision is a no-op (only `setAt` would refresh, and the
   prior-status mask prevents even that).
4. dedup-decisions log is append-with-dedupe by (date, item ref, verdict).

AC7 verifies this end-to-end; the Stage-0 `reconcile-day` command already
ships the same property (its idempotency test is the precedent).

## 8. Jira — generic workspace-APPEND evidence, NOT core

RESOLVED 2026-06-11 (John): jira is a workspace concern. It already lives
in the arete-reserv winddown APPEND file
(`.arete/skills-local/daily-winddown.md`) — workspace-level instructions
the chef reads at Step 0. The engine therefore defines a **generic
extension point** and nothing jira-specific:

- The APPEND may contribute `workspace-evidence` ledger entries (shape in
  § 1: `{kind: 'workspace-evidence', source: '<workspace-source>',
  source_ref, timestamp, text, counterparty?, evidence_pointer}`).
- Rule 1 treats `workspace-evidence` as a fulfillment-scan source exactly
  like slack/email ("create ticket for X" intent × an existing-ticket
  evidence entry ⇒ proposed close with the ticket as evidence).
- Degradation is structural: no APPEND entries ⇒ the source simply isn't
  in the ledger; the winddown never blocks on it (AC11 posture is the
  permanent v1 statement).
- No core CLI primitive, no core MCP wiring, ever (CLI cannot call MCP
  connectors — pre-mortem R-jira/risk 9). No writes (draft-only stays in
  the workspace APPEND).

## 9. What the engine does NOT do (scope fence)

- No gather (Phase G owns windows/watermarks; the engine is
  window-agnostic — per-source watermark plan composes upstream).
- No approval execution (`commitApprovedItems` and the approve flow are
  untouched consumers of the same frontmatter contracts).
- No body-line deletion, ever. Visible status flips only.
- No mechanical similarity in-agent (R2 primitive only) and no judgment
  in-primitive (R3 agent only). The seam is the nomination file.
