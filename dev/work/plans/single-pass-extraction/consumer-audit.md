# W1 consumer audit — `direction` + staged-item schema (FRESH, grep-verified)

Date: 2026-06-11 (overnight build). Method: `grep -rln "direction"` over
`packages/{core,cli,apps/backend,apps/web}/src`, then per-file inspection of
every hit. This supersedes the plan draft's preliminary list (which cited
nonexistent files — pre-mortem risk 5 / Phase-9 lesson).

## Verdict summary

`direction` has THREE distinct type families. Only one gains `'none'`:

| Type | Where | Gains `'none'`? |
|---|---|---|
| `ActionItemDirection` (extraction) | `services/meeting-extraction.ts:40` | **YES** (single_pass only) |
| `StagedItemDirection` (staging metadata) | `models/integrations.ts:98` | **YES** (read/write metadata fidelity) |
| `CommitmentDirection` | `models/entities.ts:217` (`i_owe_them\|they_owe_me\|self`) | **NO — commitments must never see `none`** (D7) |
| `ActionItemDirection` (person-signals) | `services/person-signals.ts` (separate type, imported by meeting-parser) | **NO** — person-memory action items never carry `none`; the guard is upstream |
| `StanceDirection` (`supports\|opposes\|concerned`) | `services/person-signals.ts:31` | N/A — unrelated semantic, no change |
| `ReconciliationActionItem.direction` | `models/entities.ts:571` | **YES** (widen) — it mirrors the extraction ActionItem; reconcile paths read staged files that may contain `none` |

## Consumer inventory (every file, with disposition)

### models
- `models/integrations.ts:90,98,112` — `StagedItemDirection` + `StagedItemOwnerMeta.direction` + `StagedActionItem.direction`. **CHANGE**: widen union with `'none'`.
- `models/entities.ts:217` — `CommitmentDirection`. **NO CHANGE** (none must be inert upstream).
- `models/entities.ts:571` — `ReconciliationActionItem.direction`. **CHANGE**: widen with `'none'`.

### core/services — write/parse path (the load-bearing changes)
- `meeting-extraction.ts` — type def (:40,47), `VALID_DIRECTIONS` (:184, parser drop at :1448), mirror-pair logic (:391-472, keys on opposite-direction — `none` never participates: pair gate requires `a.direction !== b.direction` AND both in {i_owe_them,they_owe_me}; with `none` widened, gate updated to require both sides binary), arrow render `formatActionItem` (:1828, `'←'` fallback would mis-render `none` — **CHANGE** to `·` for none). Parser accepts `none` only in single_pass mode; legacy parse path byte-identical.
- `meeting-processing.ts` — `ItemOwnerMeta.direction` is `string` (pass-through, no change needed); tier-derived approval added (single_pass only); `formatFilteredStagedSections` renders `[@owner ·]`-style none marker via the item line (it renders bare `- id: text` — text carries no bracket here; **owner bracket lives only in `formatStagedSections`/frontmatter metadata**, verified).
- `integrations/staged-items.ts` — `OWNER_PATTERN` (:103, `[→←]` only — **CHANGE**: accept `·`, map to `none`), metadata reader (:244 accepts only binary — **CHANGE**: accept `'none'`), `formatActionItemWithOwner` (:368-380, `'→'` fallback would mis-render `none` as i_owe_them on APPROVAL — **CHANGE**: render `·`). This is the approved-section writer.
- `meeting-parser.ts` — parses `## Approved Action Items` → `PersonActionItem`s → `CommitmentsService.sync()` + person memory. Arrow variants (:48) don't include `·`; owner-only `(@slug)` + no-notation heuristic fallback (`inferDirectionFromText`) could still capture a none-item line. **CHANGE (the D7 guard)**: explicit none-marker check — a line containing `(@slug ·)` / `[@slug ·]` is skipped before any inference. This single guard makes `none` inert for BOTH commitments creation and person-memory (both consume this parser's output for meeting files).
- `meeting-reconciliation.ts` — `extractIntelligenceFromFrontmatter` (:911 defaults missing direction to `'i_owe_them'`; **CHANGE**: preserve `none` from metadata/marker), `APPROVED_OWNER_PATTERN` (:825, `[→←]` — none-marked lines fall to the no-match branch which defaults i_owe_them; **CHANGE**: accept `·` → none). Matching/dedup logic is direction-agnostic (text Jaccard).
- `person-memory.ts:291-292,310-311` — filters by `=== 'i_owe_them'` / `=== 'they_owe_me'`. `none` falls into neither bucket → **inert by construction; no change**. (Upstream guard in meeting-parser means none items never arrive anyway.)
- `entity.ts` — stance dedup direction (StanceDirection, unrelated); action-item lifecycle consumes meeting-parser output → covered by parser guard. **No change.**
- `person-signals.ts` — LLM stance extraction (`supports|opposes|concerned`) + its own `ActionItemDirection` for conversation-sourced items. Conversation extraction never emits `none` (its own prompt unchanged). **No change.**
- `commitments.ts` — `computeDirectionScore` (:133), hash (:205), `add()` (:954). Never receives `none` (guard upstream). **Defensive change**: `sync()` skips any item whose direction is not a valid `CommitmentDirection` (belt + suspenders for D7), with a console.warn.
- `commitments-hash-v2.ts:341` — hash input typed `CommitmentDirection`. **No change** (none never reaches hashing; verified `direction` IS part of hash identity → adding `none` to CommitmentDirection would have changed hash semantics — review F7's exact worry; avoided by keeping none out of the commitment domain).
- `commitment-dedup-pipeline.ts` / `commitment-dedup-extract.ts` / `extract-dedup-wiring.ts` — compare extracted items against existing commitments; direction used as metadata string pass-through (`adaptFilteredItemsForDedup`). `none` flows through as inert metadata; comparisons are text-based. **No change** (spot-verified no binary-only switch).
- `commitment-resolution-pipeline.ts`, `background-dedup.ts`, `dedup-explain.ts` (:270 prints), `unmerge-directives.ts` (:278 re-hash of existing commitment), `commitments-counterparty-parser.ts`, `migrations/migrate-to-v2.ts` — all operate on EXISTING commitments (post-guard domain). **No change.**
- `agenda-scaffold.ts:204` — already renders `'•'` for non-binary directions. **No change** (prior art for the `·` marker).
- `area-memory.ts:378`, `brief-assemblers.ts:845,1034-1035` — render/filter COMMITMENTS (post-guard). **No change.**
- `meeting-frontmatter.ts:140-143` — counts i_owe/they_owe per meeting for frontmatter counts. `none` items counted in neither directional bucket. **Verified**: counts are informational (`action_items_i_owe` etc.), no total-must-match invariant. **No change.**

### cli
- `commands/meeting.ts` — extract command (flag plumbing **CHANGE**: single_pass wiring), approve command (writes Approved sections via staged-items formatter — covered by formatter change), context command. 
- `commands/commitments.ts`, `commands/momentum.ts`, `index.ts` — commitment-domain renders. **No change.**

### backend
- `services/agent.ts` — backend twin of extract (reconcile block :362, auto-approve `confidence > 0.8` :~335). **CHANGE deferred**: backend extraction stays LEGACY tonight (single_pass is CLI/winddown-path only; backend keeps legacy behavior regardless of flag — documented gap, see build-report). Risk accepted: the winddown drives extraction through the CLI.
- `routes/review.ts:32,113` — direction passes through to web UI typed binary. `none` items reaching the review UI would show `direction: undefined`-ish; **no change tonight** (UI renders pending items fine without direction; logged as known gap).
- `routes/intelligence.ts`, `routes/people.ts`, `routes/tasks.ts`, `services/workspace.ts` — commitment/person domain. **No change.**

### web
- All hits are commitment/person/review renders (binary or stance). **No change tonight** — `none` staged items render without an arrow badge; cosmetic.

## Tier-derived auto-approval (pre-mortem risk 1) — insertion point
`processMeetingExtraction` (`meeting-processing.ts:323`) — in `single_pass`
mode, status derivation switches from `confidence > 0.8` to tier: ONLY
`importance === 'blocker' && !uncertain` auto-approves; everything else
pending. `source === 'dedup'` → approved and `importance: 'light'`
auto-approve-all are retained (pre-existing semantics, not confidence-driven).
Confidence becomes telemetry in single_pass mode (still recorded in
`staged_item_confidence`).

## Silent-drop enumeration (AC8, for W3)
1. `meeting-processing.ts:393,489,528` — `confidence < 0.65` bare `continue` (3 sites). single_pass: keep item, stage pending, record `low_confidence` telemetry.
2. `meeting-extraction.ts` parser drops: missing description/owner (:1416), garbage (:1429), trivial (:1438), invalid direction (:1448), decision garbage/trivial (:1503,:1513), learning garbage/trivial (:1546,:1556) — warnings recorded but unpersisted. single_pass: keep + telemetry.
3. Mirror-pair drop (:1591) — persisted via `## Parser-dropped` (the one visible drop). single_pass: keep both + flag section.
4. Near-dup Jaccard 0.8 collapse (:1602-1633) — warning, unpersisted. single_pass: keep + telemetry (the model handles one-utterance-one-type; mechanical collapse becomes telemetry).
5. Category-limit slice (:1637-1641) — warning, unpersisted. single_pass: NO caps.
6. `could_include` >8 / >200-char drops (:1383-1397) — out of scope (not staged items).
7. Topic drops (:1570-1581) — out of scope (slug hygiene, not items).
8. Inline reconcile skips / silent merges (meeting.ts:998-1034) — visible as skips for actions; silent merge for de/le has fate events (Phase 0 instrumentation) — already persisted to item-fates. CHR-W0 day-level mode marks ALL types as visible skips.
