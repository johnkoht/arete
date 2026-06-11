# Single-pass extraction — replace the harness with judgment

Status: DRAFT (2026-06-10)
Evidence: `benchmark-evidence.md` (same dir) — 6/9 winddown audit + compliance benchmark + 4-meeting junk test

## Why now

The 2026-06-09 winddown audit (all 6 meetings vs transcripts) graded the pipeline ~B+:
zero hallucinations, but three systematic failure modes, all caused by the harness
*around* the model, not the model:

1. **Critical misses via cap.** `CATEGORY_LIMITS` keeps first-N in LLM response
   order (`meeting-extraction.ts:1637`). Heather's launch blocker ("Glance can't
   roll out without license-profile assignment") was raised in closing remarks and
   lost to a minute-20 nuance refinement. Overflow went to `validationWarnings[]`,
   which is never persisted — gone by morning.
2. **Double records.** Dedup is Jaccard within-category only; one utterance became
   ai_001 + de_001 + le_001 (the "UX section in PRDs" triple).
3. **Non-closeable actions.** The rubric tests owner+commitment+specificity but not
   completion condition; standing policies staged as never-closeable commitments
   (feeds the 113-open commitment-rot baseline).

Two benchmarks closed the empirical questions:

- **Compliance transcript** (richest meeting): naive single-pass (transcript + 5
  lines of context, no caps, one-sentence closeability rule, ⚠-if-unsure) recovered
  **5/5 audit-identified misses AND 17/17 of the pipeline's staged items**, zero
  hallucinations, correct closeability. Model confound ruled out — extraction
  already runs at frontier tier (`arete.yaml: extraction: frontier`).
- **Junk test** (4 routine meetings: two 1:1s, sprint ceremony, shadowing session):
  ~102 naive items vs pipeline's ~22; **judged junk ~9%, zero fabrication, and
  nearly all marginal items self-flagged ⚠**. Excess volume = learnings verbosity
  on observational meetings — absorbed by wiki synthesis + view tiering, not noise.

Bonus findings from the junk test:
- The closeability instruction **generalized** (classified the "future PRDs" policy
  as a decision unprompted, emitted the closeable instance as the action).
- Naive extraction **refused to force direction** on non-John meetings ("neither —
  team-internal"). The pipeline's two-value direction enum forces a false binary —
  the likely root cause of the recurring mirror-pair parser bugs (`b0e57c25`↔`ce091a38`
  class in the 6/9 winddown).
- It caught a Krisp-summary-vs-transcript contradiction the pipeline inherited
  verbatim (Anthony's "I choose to get blocked").

The accreted harness (caps, regex filters, pattern lists grown case-by-case after
each incident) was built to constrain a weaker setup and now strictly subtracts
value from a frontier model. Inverse of the usual escalation path: here the
*architecture simplification* is the cheap fix.

## Decisions

- **D1**: Extraction becomes one holistic pass: full transcript + assembled context
  → structured output. No category caps. No regex post-filters as *gates*.
- **D2**: Keep — context assembly (the part that wins), staging schema/IDs/approval
  UX, frontmatter writer, alias coercion, `processMeetingExtraction` staging logic
  (adapted), item-fates telemetry.
- **D3**: Schema additions: `importance: blocker|high|normal` on decisions and
  action items; `uncertain: boolean` + `uncertainty_reason` (the ⚠ channel);
  `direction` gains `none` (team-internal / not John-relative); new top-level
  `open_questions[]` category (wiki pages already have an Open Questions section —
  this feeds it).
- **D4**: Existing mechanical detectors (mirror-pair Jaccard, garbage prefixes,
  trivial patterns) flip from filters to **logging-only telemetry** for one soak
  period. If they fire on real junk the model missed, we learn; if silent for ~2
  weeks of winddowns, delete.
- **D5**: Ranking/collapsing is a **view concern**. Winddown staging view sorts by
  importance tier, collapses `normal` for routine meetings, never hides `blocker`.
  Data layer persists everything (no more ephemeral-warning data loss — there is no
  overflow because there is no cap).
- **D6**: Closeability is a prompt rule, not a regex: standing policies → decisions;
  actions require a completion condition; emit the concrete first instance when one
  exists.
- **D7**: `direction: none` items are **never** created as commitments; they stage
  for visibility only (or defer to sidecar per existing winddown rules).
- **D8**: Out of scope: read-side wiki wiring for create-prd / prepare-meeting-agenda
  (finish topic-wiki-memory Step 7 + add prepare-meeting-agenda). Separate plan;
  this plan only ensures extraction output keeps feeding the wiki write path.

## Context & tool access — the part that carries the win

The compliance benchmark won with ~5 lines of context. The production version
should win bigger, because the codebase already assembles richer context than the
benchmark had. Two layers:

### Layer 1 — pre-assembled context (always in the prompt)

Budgeted, ordered by judgment-changing power:

| Block | Source (exists today) | What it buys |
|---|---|---|
| Identity frame | static + workspace config | "John is the PM/workspace owner; direction is relative to him; he attends some meetings as observer" — enables `direction: none` |
| Meeting frame | calendar/Krisp + person files (stances, open items, `meeting-extraction.ts:570-580`) | correct attribution, "who is this person to John" |
| Topic wiki context | `MAX_TOPIC_WIKI_CONTEXT_CHARS=6000` block + wiki open-questions resolution prompt (`:1090-1101`) | **supersession**: "wiki says X open; transcript resolves it → decision citing the wiki" |
| Open commitments w/ present counterparties | commitments service, filter by attendee slugs | **dedup at source**: kills the ai_007-vs-`acc2a220` class — model marks `continuation_of: <id>` instead of re-emitting |
| Prior same-series meeting items | **NOT wired today** — `loadRecentMeetingBatch` is a flat 7-day window (all meetings, no series concept); `recurring_meetings` config exists only in area frontmatter for area-matching. New resolver needed (W1.5) | recurring-meeting guard moves into the model's judgment instead of being chef improvisation in the winddown |
| Agenda file + goals/area focus | existing assembly (`:585-620`) | importance calibration ("this was the P2 gate") |
| Same-day earlier extractions | `priorItems` plumbing exists (`meeting-extraction.ts:884-905`) **but its framing must be inverted** (review finding 1): today it renders as an EXCLUSION list ("already extracted, skip these") — i.e., cross-meeting dedup inside the prompt, which suppresses supersession arcs at the source. W2 rewrites it to **mark, don't skip**: "these exist; if you see the same item, emit it WITH `continuation_of`/`supersedes` markers — never omit a superseding item" | two same-day meetings on one workstream → second meeting emits the marker itself AND the arc survives to the reconcile layer (required by chef-holistic-reconcile D3/D4) |

Principle: context tells the model **what John already knows**, so extraction
becomes "what changed" — same delta-directive idea already in the prompt, now fed
properly.

### Layer 2 — on-demand tools (the "if unsure" channel)

Extraction becomes an *agent* (tool-loop), not a single completion. Read-only
tools, small set:

- `read_topic_page(slug)` — full page when the 6K context block was truncated or
  the model suspects supersession beyond the provided slugs
- `list_commitments(person_slug)` — verify continuation-vs-new before emitting
- `read_meeting(path)` — prior meeting in the series when the delta is ambiguous
- `search_wiki(query)` — cross-topic lookups (a compliance meeting touching email
  templates can pull `email-templates` context it wasn't pre-given)
- `find_meetings(query)` — topic-driven meeting lookup for relations the W1.5
  resolver can't see. W1.5 (title+attendee match) covers true recurring series;
  this tool covers same-thread-different-title chains (e.g., "Drafts Alignment
  Status Letters" 6/1 → "Status Letter Draft Emails Sync" 6/3 → "Status Letter
  TDD Sync" 6/10 — one workstream, three titles, zero title similarity).
  Division of labor: deterministic resolver feeds Layer 1 always; the tool is
  judgment-gated like the others ("only if the answer changes what you emit")

Rules: tools are for resolving ⚠ candidates, not exploration — instruct "use a
tool only when its answer would change what you emit"; hard cap (~6 calls/meeting);
every tool call logged to the extraction record (`context_consulted[]`) so we can
see what the model actually needed and promote frequent lookups into Layer 1.

Cost note: Layer 1 ≈ today's prompt size. Layer 2 adds calls only on uncertainty;
junk test showed ⚠ rates of 2-5 items/meeting — bounded.

## Work items

**W1 — Schema + parser** (`meeting-extraction.ts`, `models/`)
New response schema per D3. Parser accepts both old and new formats (confidence
floats still parsed; tiers map for staging: blocker/high → auto-stage `approved`
candidates, normal → `pending`, uncertain → always `pending` with reason shown).
Consumer audit FIRST (per feedback memory), and run it FRESH — the preliminary
list in this plan's first draft was wrong (pre-mortem 2026-06-10: cited
`services/staged-items.ts`/`services/entities.ts` which don't exist; direction
types actually live in `models/integrations.ts:98` and `models/entities.ts:
214-217`, consumed across ~20 service files incl. `entity.ts`,
`person-memory.ts`, `commitments.ts`, `commitments-hash-v2.ts`,
`extract-dedup-wiring.ts`). W1 starts with a grep-verified consumer inventory
checked into the plan dir. `none` must be inert in commitments creation (D7)
and person-memory action items.

**Approval-volume control (pre-mortem R1).** Backend auto-approves
`confidence > 0.8` today; at 4–5× item volume that either mass-approves into
the commitments store or buries the evening review. In single_pass mode,
auto-approve derives from TIER, not confidence: only `blocker` auto-approves;
`high` defaults pending; `normal` defaults pending-collapsed; ⚠ always pending.
See AC11.

**W1.5 — Series resolver** (new capability, small)
`resolveMeetingSeries(meetingPath)`: match prior meetings by normalized-title
similarity + attendee-set overlap within ~35 days (and area `recurring_meetings`
config when present). Returns the last 1-2 prior meetings' staged/approved items
+ open questions for the Layer 1 "prior same-series" block. Today this linkage
does not exist — Anthony 6/9 relates to Anthony 6/2 only by both being inside the
flat 7-day `loadRecentMeetingBatch` window, identical to any unrelated meeting.
Respect the `excludePath` trap (LEARNINGS.md 2026-04-29).

**W2 — Prompt rewrite** (single pass, judgment-first)
Replace the accreted IS/IS-NOT pattern lists with the benchmark prompt shape:
closeability rule, one-utterance-one-type rule, ⚠-if-unsure, importance tiers with
blocker cues, open questions, "don't pad — every item traces." Keep: wiki
open-question resolution examples, delta directive, topic-bias block. Mode flag
`extraction_mode: single_pass | legacy` in config; legacy remains default until W5
gate passes.

**W3 — Demolition + telemetry flip** (D4)
Caps removed (`CATEGORY_LIMITS` → unused in single_pass mode; `THOROUGH_LIMITS`
deleted). `isTrivialItem`, `isTrivialDecision`, `GARBAGE_PREFIXES`, mirror-pair
detection → log-only events in item-fates stream. **Preserve the
`## Parser-dropped` visibility contract** (pre-mortem correction: mirror-pair
warnings DO persist today via `meeting-processing.ts:724-741` — the log-only
flip must keep writing that section, not silently remove it).
**Enumerate every drop point**: the confidence filter (`< 0.65`, currently a
bare `continue` with no record) and any other silent-drop path must either
persist the dropped item with a reason or be removed — AC8 is checked against
the full enumerated list, not just the known warnings.

**W4 — Winddown view ranking** (D5; `daily-winddown/SKILL.md` + staging renderer)
Stage section sorts blocker → high → normal; routine-meeting normals collapse to a
count line ("+ 9 normal items — expand in file"); blockers render even for
sidecar-deferred meetings (an all-hands can carry a blocker). `direction: none`
items follow existing sidecar deferral rules.

**W5 — Eval gate** (scripts/, uncommitted per eval-harness-local convention)
`scripts/eval-extraction-2026-06.ts`: runs both modes through the real `callLLM`
path on the three-part corpus below; emits a per-meeting scorecard
(recall / junk / fabrication / tiering / direction / continuation). Gate flips
the default mode. Corpus:

1. **Ground-truth set (5)** — compliance 6/9, Anthony 6/9, Nate 6/8, sprint 6/4,
   shadowing 6/4 (`benchmark-evidence.md`). Scored against recorded ground truth.
2. **Series set (2 chains, 6 meetings)** — Anthony 1:1 ×3 (5/26, 6/2, 6/9) and
   Email Templates Weekly ×3 (5/26, 6/2, 6/9), each chain run in date order with
   W1.5 series context. Scores continuation/supersession behavior across runs.
3. **Ad-hoc blind set (4)** — random sample from the past month spanning meeting
   shapes not in the tuning loop (e.g., a Lindsay 1:1, DOI sync, a CX deep-dive,
   a vendor demo). No precomputed ground truth: judge-agent audits each
   extraction against its transcript (same protocol as the 6/9 audit), human
   spot-check on any item the judge flags.

**W6 — Agentic Layer 2** (after W5 soak)
Tool-loop extraction with the 4 read-only tools + `context_consulted[]` logging.
Ships behind its own flag; Layer 1 alone must already beat legacy (it did in the
benchmark with far less).

## Sequencing

W1 → W1.5 → W2 → W5 (eval on flag) → **W4 (view ranking) → THEN flip the
default mode** (pre-mortem R3: flipping before W4 ships uncapped, unranked
staging into production evenings) → W3 → soak 2 weeks of winddowns (telemetry
from D4 detectors + item-fates approval rates) → W6.

Worktree build (no branch switching in main repo). W1+W2 are one PR; W3+W4 a
second; W6 a third.

## Acceptance criteria

Quantitative (W5 scorecard, production model, both modes side by side):

- AC1 **Recall**: single_pass ≥ legacy on ground-truth items for all 5 set-1
  meetings; on the compliance transcript specifically, ≥ 21/22 of the combined
  ground truth (pipeline's 17 + the 5 audited misses).
- AC2 **Blocker recall = 100%**: every ground-truth blocker tier-marked `blocker`
  (license-assignment is the canary — the exact item the old pipeline lost).
- AC3 **Junk ≤ 15%, fabrication = 0** across all 11 corpus meetings (junk = judge
  verdict "John would never want this recorded"; fabrication = item with no
  transcript trace). ⚠-flag coverage: ≥ 80% of judged-junk items carry the
  model's own `uncertain` flag (proves the self-flagging channel works).
- AC4 **Direction integrity**: zero `i_owe_them|they_owe_me` on sprint planning
  and any other no-John-stake meeting in the corpus (all `none`); zero
  commitments created from `none` items; zero mirror-pair telemetry events that
  a human confirms as real mirror pairs.
- AC5 **Closeability**: zero staged action items without a completion condition
  across the corpus (judge-checked); "UX section in PRDs" emits as decision
  (+ closeable instance) on re-run.
- AC6 **Series behavior** (set 2): the 6/9 Anthony run with W1.5 context marks
  the recipient-table TDD `continuation_of` the existing commitment instead of
  re-emitting; across both chains, repeat topics produce continuation/supersession
  markers, not fresh duplicates (target: 0 unmarked cross-run duplicates).
  **And the inverse (review finding 1): a superseding item is RE-EMITTED with
  its marker, never omitted** — fixture: Anthony de_002 → workshop de_004
  same-day supersession must appear in the workshop extraction.
- AC7 **Ad-hoc generalization** (set 3): judge grade ≥ B+ on all four blind
  meetings — guards against overfitting the prompt to the tuning set.

Structural:

- AC8 No data loss: every extracted item persists in the meeting file regardless
  of staging status; `validationWarnings`-only items = 0.
- AC9 Winddown renders tier-sorted staging; `normal` collapse works; a blocker
  from a sidecar-deferred meeting still surfaces.
- AC10 Mirror-pair + trivial detectors fire as telemetry only; 2-week soak report
  written before deletion; `## Parser-dropped` section still renders.
- AC11 **Approval budget** (gates the default-mode flip): median
  user-pending items per winddown ≤ 25 across the soak window, and zero
  non-blocker items auto-approved. If breached, tighten tier mapping or
  collapse rules before flipping.

## Skeptical view

- *"9% junk compounds across 6 meetings/day into wiki bloat."* — Wiki integration
  is synthesis, not append; tiering gates what the view shows; the soak measures
  actual approval rates via item-fates. If junk approvals trend up, tighten the
  prompt's "don't pad" or add a tier gate on wiki feed — both view-side knobs.
- *"The benchmark agents were me-shaped (Fable); production runs Opus 4.6."* — Real
  risk. W5 eval runs through the actual `callLLM` path with the configured tier;
  the gate is on production-model output, not benchmark-agent output.
- *"Removing confidence-threshold filtering loses a safety net."* — The filter
  is `< 0.65` (not 0.5 as this plan's first draft claimed) and today it drops
  items SILENTLY (bare `continue`, no record) — it is itself an AC8 violation.
  Kept as a *staging* signal with persistence: low-confidence items stage
  pending-with-reason instead of vanishing. Tiers complement confidence.
- *"Tool loop = latency + cost in the winddown critical path."* — W6 is last,
  flagged, and capped at ~6 calls; Layer 1 alone already beats legacy.
- *"One utterance one type loses legitimate decision+learning pairs."* — Rule
  permits a learning when the insight outlives the decision (benchmark applied
  this correctly, e.g. fraud-language decision + state-basis learning).

## Follow-ups (registered, out of scope here)

**F1 — Holistic chef reconcile (winddown re-architecture).** John's target flow:

1. pull slack, email, **jira** (jira is display-only today, SKILL.md:446-448)
2. pull meetings
3. extract from meetings (pure per-meeting — no inline cross-meeting dedup)
4. **chef reviews and reconciles everything in one pass**: today's extractions ×
   each other × week.md × tasks/commitments × slack/email/jira evidence
5. staging + winddown review with proposed items
6. user reviews and approves → winddown complete

Today's deviation: cross-meeting dedup runs inline at extract time per file
(first-occurrence-wins, `--reconcile` against the 7-day batch) BEFORE the chef
ever sees the day — the ordering artifact behind the collapse-to-oldest /
supersession-arc-hiding risk. **This plan is the precondition for F1**: single-pass
extraction makes step 3 pure (continuation/duplicate markers are model judgment
fed by Layer 1 context, not post-hoc Jaccard), so all reconciliation can move to
the chef's holistic pass. F1 then deletes the inline `--reconcile` path and gives
the chef the full-day arc — which is also where supersession detection
(project memory: "winddown sees the arc") naturally lives. Jira joins as a real
reconcile source (MCP read) instead of a watchlist render.

**F2 — Read-side wiki wiring** (= D8): finish topic-wiki-memory Step 7 for
create-prd / week-plan / process-meetings + add prepare-meeting-agenda.

## Rollback

`extraction_mode: legacy` is a config flip; legacy code path stays intact until
the soak report. Schema additions are optional fields — old parsers ignore them.
W3 deletions land only after the gate, in their own PR, revertable as a unit.
