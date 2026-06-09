---
title: "Self-evolving coach (guide mode)"
slug: self-evolving-coach
status: idea
size: large
tags: [core, cli, runtime, guide-mode, coach, memory, calibration, personas]
created: "2026-06-03T00:00:00.000Z"
updated: "2026-06-03T00:00:00.000Z"
completed: null
execution: null
has_review: true
has_pre_mortem: false
has_prd: false
steps: 9
---

# Self-evolving coach (guide mode)

## Goal

Turn Areté's guide-mode persona from a **static advisor** into a **single coach that calibrates its own pushback**. The coach asks the questions the user didn't, names what he's avoiding, and pushes back on hand-waving — but it *learns when that pushing is welcome*: detect a pattern → push at some intensity → observe the response → lean in if welcomed, fall back if resisted.

**The falsifiable core (Phases 1–2) is proven on the one signal that cannot lie: edit-deltas.** When John rewrites a staged proposal before approving, that rewrite is a graded, deterministic correction — captured automatically, no agent self-instrumentation, no "session" concept needed. If a `correction-quality` calibration computed from edit-deltas does not measurably change the next session's boot behavior, the architecture is wrong and we find out cheaply. The genuinely *coaching* lenses (depth, person-standards) layer on top of that proven plumbing in Phases 3–4 — and they are honestly agent-logged, not deterministic.

**Scope of "real-time" — stated plainly:** the durable adaptation mechanism is the boot-context block read at the *start of the next session* (cross-session). True in-session adaptation (the running agent re-reading its own freshly-logged outcome) is NOT delivered by this plan; the CLI log write does not feed the live session. Phase 9 is a *next-boot* assertion. Do not oversell this as live learning.

PM-craft and career/growth are **lenses** the one coach foregrounds by context — NOT separate agents. Emergent lens auto-drafting is explicitly deferred (Out of scope).

## Context

Established by a read-only investigation + adversarial trial on 2026-06-03, then revised after eng-lead review (`review.md`). Two loops exist in guide mode:

- **Domain-knowledge loop — CLOSED.** Past meetings build topic wikis (`packages/core/src/services/topic-memory.ts:integrateSource`), re-injected as "already known" into the next extraction (`meeting-context.ts:buildTopicWikiContext` → delta directive `meeting-extraction.ts:~1046-1058`). Person signals aggregate across meetings (`person-memory.ts:aggregateSignals:148`, count-gated at `:179` — a plain frequency counter, no EMA). Boot context injects active topics into the workspace CLAUDE.md (`generators/claude-md.ts:generateActiveTopics:53`, fed by `memory-summary-loader.ts:loadMemorySummary:27` → `models/active-topics.ts:getActiveTopics:66`).
- **Self-evaluation loop — OPEN.** Signals about whether the coach/system was *any good* are captured and discarded. Personas are static, bound at authoring time (`packages/runtime/profiles/{pm-advisor,pm-orchestrator,plan-reviewer}.md`; selection directive in CLAUDE.md is a static "if frontmatter has `profile:`, adopt it" — `generators/claude-md.ts:170-172`; `generators/skill-commands.ts:28-33`). Every threshold is a hardcoded constant.

**The keystone (verified).** When the user rewrites a staged proposal before approving, `commitApprovedItems` reads the edits into the local `editsMap` at `packages/core/src/integrations/staged-items.ts:479`, applies them at `:505` (`const text = editsMap[item.id] ?? item.text;`), and **deletes the frontmatter** at `:576` (`delete data['staged_item_edits'];`). The richest coaching signal in the system — a graded human correction — is discarded. The `onApproved` observer (`staged-items.ts:587-620`, `ApprovedItemRecord` at `:425`) already fires per committed item, wrapped in try/catch (Phase 0 instrumentation), but receives only the *final* text, so even the existing consumer can't see the correction. `editsMap` is a surviving local in scope at the observer block (same pattern as `confidenceMap` snapshotted at `:483`), so capturing the delta needs **no reordering** of the delete.

**Reuse, don't reinvent.** The memory-log grammar is an extensible, kebab-case, k=v, URL-encoded event stream (`packages/core/src/utils/memory-log.ts:formatEvent:55`, `appendEvent:135`; `event` is an open `string`, not a closed union — `:19`). Appends are POSIX `O_APPEND`-atomic (`utils/file.ts:60`), so parallel winddowns writing events are race-safe — **which is exactly why all "session" gating derives from log timestamps (day-buckets), never a mutable counter file.** The coach is a **third loop with the same shape** as the two closed ones: dated signals → count/recency-gated aggregate → boot injection. New event kinds + a new aggregator + a new boot block — no new subsystem, no new store.

### Review revisions folded in (2026-06-03)

- **BLOCKER (keystone signal mismatch):** edit-deltas fire over staged *meeting items*, not conversation, so they cannot drive the *depth* signal. The falsifiable core is re-anchored to a **`correction-quality` lens** driven by edit-deltas (deterministic). Depth/person lenses moved to Phases 3–4 and explicitly marked agent-logged.
- **BLOCKER (no session identity):** no session counter/boundary exists in the codebase. All "distinct sessions" gating derives from **UTC day-buckets of `log.md` event timestamps**. No mutable counter file (would race).
- **Over-engineering:** dropped the EMA/contextual-bandit framing for a **counter + cooldown** rule (matches what `aggregateSignals` actually is).
- **In-session vs cross-session:** stated as an explicit non-goal in Goal + Verification.
- **preference-model overlap → SPLIT (decided):** *capture* lives here (Phase 1). The downstream *passive style application* (`collaboration.md`, skill-brief output styling, periodic synthesis prompts) stays in `preference-model`, now a **consumer** of this plan's `coach-outcome` events. Do not build two capture mechanisms. Annotate both plans before building.

### Relationship to existing plans

- **`preference-model`** — split as above (capture here, apply there). Add a note to its plan that capture is owned by `self-evolving-coach`.
- **`user-feedback-and-telemetry`** — different lane (external multi-user telemetry to a remote endpoint). No overlap; this plan is entirely local to `.arete/`.

## Plan

### Phase 1 — Capture: resurrect the edit-delta as a `coach-outcome` event

1. **Snapshot the edit delta into `onApproved`; emit a `coach-outcome` event.** In `packages/core/src/integrations/staged-items.ts:commitApprovedItems`, extend `ApprovedItemRecord` (`:425`) with optional `originalText?: string` and `edited?: boolean`. In the record build (`:588`), read from the surviving `editsMap` local (`:479`) — no reordering of the `:576` delete — and populate the new fields when `editsMap[item.id]` differs from `item.text`. The existing `onApproved` observer (wired in `packages/cli/src/commands/meeting.ts` and `packages/apps/backend/src/services/workspace.ts`) appends a `coach-outcome` event (step 2) classifying each item: `verbatim` (no edit) / `tweaked` (normalized-Jaccard ≥ 0.7 between original and final) / `rewritten` (< 0.7), lensed as `correction-quality` and keyed by `item_kind`. Reuse `normalizeForJaccard` / `jaccardSimilarity` from **`packages/core/src/utils/similarity.ts:13,28`** (re-exported via `meeting-extraction.ts:247`).
   - Acceptance: approving an edited item writes one `coach-outcome` line to `.arete/memory/log.md` carrying the original→final classification; `staged_item_edits` is still cleared (`:576` unchanged). Verbatim approvals still emit (as `verbatim`).
   - Verify: unit test in `packages/core/test/integrations/staged-items.test.ts` — commit a fixture with `staged_item_edits`, capture `onApproved` records, assert `edited`/`originalText` present and classification correct for tweak/rewrite/verbatim. Existing commit tests unaffected (fields optional).

2. **Define the two coach event kinds + thin typed writers.** Add to `packages/core/src/services/memory-log.ts` two helpers over the existing `appendEvent` grammar (no new file/store):
   - `coach-intervention | id=<iv_xxx> lens=<slug> signal=<slug> intensity=<observe|nudge|push> [topic=<slug>]`
   - `coach-outcome | ref=<iv_xxx> lens=<slug> signal=<slug> response=<welcomed|tweaked|resisted|dismissed> evidence=<edit-delta|follow-through|engagement|explicit> [delta=<n>]`
   The `correction-quality` path (step 1) writes `coach-outcome` with `evidence=edit-delta` and **no `ref`** (it's an unsolicited outcome, not a response to a logged intervention). Agent-logged lenses (Phases 3–4) write the `ref`-paired form. `id` is a short nanoid. All validated by the existing `formatEvent` kebab/k=v regex.
   - Acceptance: both kinds round-trip through `formatEvent`/`parseEvent`; malformed fields throw per the tight-grammar contract.
   - Verify: unit tests in `packages/core/test/utils/memory-log.test.ts` (round-trip + rejection).

### Phase 2 — Falsifiable core: the `correction-quality` calibration loop (deterministic, end-to-end)

3. **`aggregateCoachOutcomes` — the read-model (counter + cooldown, no EMA).** Add `packages/core/src/services/coach-calibration.ts` exporting `aggregateCoachOutcomes(events: LogEvent[], opts): CoachCalibration`, modeled on the frequency-counter shape of `person-memory.ts:aggregateSignals:148`. For each `(lens, signal)` cell: bucket outcomes by **UTC day** (derived from event timestamps — the only "session" proxy), count `welcomed`/`tweaked` vs `resisted`/`rewritten`/`dismissed`, and resolve a recommended posture. For `correction-quality`: per `item_kind`, if `rewritten` dominates across ≥N=3 distinct days, emit a directive ("John consistently rewrites action-item phrasings to be terser → propose terser"); a recent `dismissed`-equivalent applies a cooldown (recency window, reuse the `getActiveTopics:66` idea). Pure function, no I/O.
   - Acceptance: deterministic given an event list; ≥3-day dominance promotes a directive; cooldown suppresses within the window then expires. Day-bucketing (not raw counts) verified.
   - Verify: unit tests in `packages/core/test/services/coach-calibration.test.ts` (cold start, 3-day promotion gate, cooldown expiry).

4. **Boot-context "Coaching calibration" block.** Extend `MemorySummary` (consumed by `loadMemorySummary:27`) with a `coachCalibration` field populated from `aggregateCoachOutcomes` over `.arete/memory/log.md`, and add `generateCoachCalibration(memory)` in `generators/claude-md.ts` alongside `generateActiveTopics:53`. Emit a compact directive block (e.g. `correction-quality: John rewrites action items to be terser — draft terser`). Computed view only, never user-maintained (honors the MEMORY.md "L3 = computed views" rule). Empty calibration → no block (mirror `generateActiveTopics`).
   - Acceptance: regenerating CLAUDE.md after a promoted cell includes the directive; empty → no block.
   - Verify: renderer unit test (populated vs empty) + integration test that CLAUDE.md regen surfaces it.

5. **Falsifiability gate (the real acceptance test).** In a test workspace, commit several meetings where the same *kind* of proposal is consistently rewritten the same way across ≥3 UTC days, regenerate boot context, and confirm the `correction-quality` directive appears and the next session's proposals reflect it — with **no agent self-logging involved**. Record in `manual-qa.md`. If this deterministic loop doesn't change next-session behavior, STOP and redesign before Phase 3.

### Phase 3 — Coaching lenses (agent-logged) + governors

> Honest caveat (per review): everything in this phase depends on the *guide-mode agent* reliably calling `arete coach log`. LLM self-instrumentation is unreliable; treat these lenses as best-effort enrichment layered on the proven Phase-2 plumbing, NOT as load-bearing. If agent-logging proves too flaky in practice, these lenses degrade gracefully (no directive) without breaking the core.

6. **Coach persona + `arete coach log` surface.** Add `packages/runtime/profiles/coach.md` (always-on coaching stance: Socratic, names avoidance, pushes on hand-waving) + the logging protocol. Add `packages/cli/src/commands/coach.ts` with `log intervention` (returns id) / `log outcome --ref <id>` / `calibration --json`, appending via step 2 helpers. Inject the coach stance into boot context the way personas are referenced today (`claude-md.ts:170-172`) but always-on, not skill-bound.
   - Acceptance: `arete coach log intervention --lens depth --signal wants-more-depth --intensity nudge` prints an id + appends a valid event; paired `log outcome --ref <id>` appends.
   - Verify: CLI integration test (both append expected lines; bad enums rejected with actionable errors).

7. **The `depth` lens (agent-logged).** Generalize `aggregateCoachOutcomes` to `ref`-paired interventions. Detection (agent): after a summary-level answer, user asks to go deeper. Posture: cold-start `nudge` (pre-empt depth, "say tl;dr to dial back"); `nudge` welcomed across ≥3 distinct days → `push`; one explicit `dismissed` → immediate demote + cooldown. This is the "stop making John ask for depth" lens — now correctly sourced from agent-logged engagement, with its unreliability owned.
   - Acceptance: depth cell promotes nudge→push only after ≥3 distinct days of welcomed; single dismissed demotes immediately + cools down.
   - Verify: unit test feeding synthetic `coach-intervention`/`coach-outcome` pairs through the aggregator; assert transitions.

8. **Anti-nag governors (enforced).** Per-day cap of ≤2 `push`-intensity interventions (counted from `coach-intervention` events in `log.md`, not a mutable counter); `dismissed` cools the cell; `push` gated behind a per-lens welcomed-count threshold. The counter+cooldown asymmetry (fast demote, slow promote) is the primary governor; these are belt-and-suspenders. Calibration changes surface a one-line "I've started leading with depth — here's why" (transparent, not silent).
   - Acceptance: a day that already pushed twice emits no third push even if recommended; suppressed cells stay silent until cooldown expires.
   - Verify: unit tests on day-bucketed cap + cooldown; persona prose review.

### Phase 4 — Person-standard lens ("what would Lindsay say") [follow-on]

9. **Reuse person-memory as a coaching standard.** A person lens (e.g. `person:lindsay`) is sourced from the *already-aggregated* recurring asks/concerns from `person-memory.ts:aggregateSignals` / `renderPersonMemorySection:226` — a new *read* path feeding the coach stance, no new capture. Calibrated by the Phase-3 (agent-logged) loop. Same unreliability caveat as Phase 3.
   - Acceptance: when a person lens is active and that person's aggregate has a recurring concern, the coach can surface it as a coaching prompt; intensity governed by the loop.
   - Verify: unit test that the person aggregate feeds coach context; manual check on a real person with meeting history.

## Verification

- `npm run typecheck && npm test` green across root.
- `.arete/memory/log.md` accumulates `coach-outcome` (edit-delta) events; `arete coach calibration --json` returns a stable per-cell read-model from day-bucketed counts.
- **Phase 2 falsifiability gate passes on the deterministic `correction-quality` loop** (step 5) — the decisive proof.
- No regression to meeting commit behavior — `staged_item_edits` still cleared at `:576`; existing `onApproved` consumers unaffected by the new optional fields.
- Explicit non-goal confirmed: adaptation is next-session (boot block), not in-session live learning.

## Risks (mitigations)

- **Agent-logging unreliability (Phases 3–4)** → the *core* (Phases 1–2) rides the deterministic edit-delta and needs no agent logging; agent-logged lenses are best-effort and degrade to "no directive." This is the review's BLOCKER, now structurally contained.
- **Cold start / sparse signal** → bland for a while; default `nudge`, never seed fake priors; `push` gated on welcomed count. Earned trust is the point.
- **Overfitting to a bad stretch** → cooldown expiry + day-bucketed counts (a single bad day can't flip a cell); suppressed cells return to `nudge`, not silence.
- **Coach becomes a nag** → counter+cooldown asymmetry (fast demote / slow promote) + per-day push cap (step 8).
- **Concurrency** → all gating from `O_APPEND`-atomic log timestamps; no mutable counter file.
- **Duplicate capture with preference-model** → resolved (SPLIT): capture here, apply there. Annotate both plans before building.
- **Privacy / creepiness** → ledger is plaintext grep-able `log.md` the user owns; calibration changes surface a one-line rationale (transparent, not invisible — autonomy ≠ opacity; overrides the original "even if not obvious to the user" framing).

## Out of scope

- **Emergent lens auto-drafting (shadow mode).** Single coach detecting a bifurcation and drafting a new lens on its own. Highest-risk, lowest-immediate-value: with one user + rare interventions the detector mostly fires on noise. Build ONLY after Phases 1–3 prove out, behind shadow mode (a drafted lens logs what it *would* have done and must out-predict the parent over ≥N days before promotion), and **transparent** (one-line notice + readable file), never silent. Likely cut entirely. (Review confirms: keep cut.)
- **In-session / live adaptation** — explicit non-goal (Goal).
- pm-craft / career lenses beyond depth + person — natural Phase 5 once the loop is proven.
- Multi-user / org-level coaching policy; any remote/external telemetry (that's `user-feedback-and-telemetry`).
- Auto-tuning domain-loop thresholds (confidence/Jaccard) from outcomes — separate effort.

## Files touched (estimate)

- `packages/core/src/integrations/staged-items.ts` — edit-delta snapshot, `ApprovedItemRecord` fields (~20 LOC; no reordering)
- `packages/core/src/services/memory-log.ts` — two coach event helpers (~20 LOC)
- `packages/core/src/services/coach-calibration.ts` — NEW, `aggregateCoachOutcomes` (counter+cooldown, ~90 LOC)
- `packages/core/src/generators/claude-md.ts` — `generateCoachCalibration` block (~25 LOC)
- `packages/core/src/services/memory-summary-loader.ts` + MemorySummary model — `coachCalibration` field (~15 LOC)
- `packages/cli/src/commands/coach.ts` — NEW, `arete coach log|calibration` (~80 LOC)
- `packages/cli/src/commands/meeting.ts` + `packages/apps/backend/src/services/workspace.ts` — pass new `onApproved` fields → `coach-outcome` (~20 LOC)
- `packages/runtime/profiles/coach.md` — NEW coach persona/stance + logging protocol
- Tests: `staged-items.test.ts`, `memory-log.test.ts`, `coach-calibration.test.ts`, `coach.test.ts` (CLI), `claude-md.test.ts`
