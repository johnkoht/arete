---
title: "Phase 14 — Project write-back (/update-project + topics cache + close→retro)"
slug: phase-14-project-write-back
created: "2026-06-10"
parent: arete-v2-chef-orchestrator
owner: planning orchestrator (Claude)
status: approved
approved: "2026-06-10"
has_pre_mortem: false
has_review: true
depends_on: phase-13-area-edge-completion
---

> **Approval — 2026-06-10 (John):** OQ1 decided: retro ships via items/ + `topic refresh` (the recommended mechanism; parent-plan AC8's direct area-page writer is superseded). OQ3: yes — commitment-claim proposals in the v1 menu. OQ4: skill-only invocation. Delta pre-mortem (seeds in Review disposition) REQUIRED at ship Phase 1.2 before build.

# Phase 14 — Project write-back

## Why this exists

Phase 12 shipped the read half of the projects-first-class design: `/project` opens a project with holistic context, guaranteed read-only (pre-mortem R1). The write half — outcomes flowing *back* into the project doc instead of being hand-copied — was deliberately deferred by the 2026-06-10 amendment as Slices D and E, gated on (a) dogfooding `/project` and (b) the workspace restructure. Both gates are now satisfied or in hand: day 1 of dogfooding drove the mega-project splits *through* the new flows, and it also produced the acceptance case for the write-back skill:

> **The June-fixation case (live, observed + hand-fixed 2026-06-10):** a meeting transcript records the goal moving to EOY-2026; the project README still says end-of-June. Nothing in the system would ever reconcile them. `/update-project` must propose exactly that correction — and touch nothing else.

This phase ships:

- **Slice D — `/update-project`** (phase-12 AC7): scan what changed since the README was last touched (area meetings, wiki/topic changes, commitments), propose README edits on the daily-winddown "proposed" surface, apply exactly what John approves. Carries **AC5 topics-cache persistence** (phase-12 AC5): the system-owned `topics:` frontmatter cache, written ONLY through this flow, ONLY when the slug set changes.
- **Slice E — close→frozen retro** (phase-12 AC8): on `finalize-project`, emit a dated retro that lands in the wiki — **via the items/ + `topic refresh` path that dogfooding favorably exercised once** (the visioning-deck finalize wrote decisions/learnings to items/ and let `topic refresh` integrate; punch list #2's exact words: "that pattern worked and may inform/simplify AC8" — one observation, not a validation campaign). This replaces the originally-planned direct area-page write, dissolving most of pre-mortem R7's surface.

**One-line goal**: close the read-in/write-back loop — project docs stay current through an approval-gated flow with a named, observed acceptance case, and closed projects leave a frozen trace in the wiki without hand-copying.

## Relationship to prior decisions

- **Direct continuation of phase-12's plan + amendment.** AC numbering below is fresh, but AC2 here IS phase-12 AC5 and AC1 here IS phase-12 AC7; Slice E is phase-12 AC8 with a design revision (see decision 4). Phase-12 OQ5's default stands: topics cache capped at 5, confidence-floored. Phase-12 OQ4's choice stands: frontmatter `topics:` (sentinel-bracketed body section remains the fallback if soak shows hand/machine collision).
- **BINDING pre-mortem constraints (phase-12 pre-mortem, carried whole):**
  - **R1 — open is read-only; topics persistence lives ONLY in `/update-project`, inside the approval-gated proposal.** This phase must not regress phase-12's zero-write guarantee on open (the counting-adapter + snapshotTree tests stay green untouched).
  - **R2 — write the frontmatter only when the topic slug set actually changes.** No `topics_refreshed` bump on a no-op. Test must assert *zero write calls* on rerun, not merely identical content.
  - **R7 — wiki writes get heavier review.** Addressed structurally: Slice E routes through items/ + the existing `topic refresh` engine instead of a bespoke area-page writer (decision 4). Any residual direct-write fallback stays out of this phase.
  - **R10 — the topics cache must not become load-bearing.** Display/convenience only; ownership comment states it; no consumer added this phase reads it for behavior.
- **Depends on phase-13** (`phase-13-area-edge-completion`): the scan input (`meetingsForArea` via `assembleProjectWhatsNew`) is leak/miss-fixed there, and the commitment-claim verb this flow proposes ships there. Build can start once phase-13 merges; *dogfooding quality* additionally wants John's post-merge meeting-backfill apply, which is operational, not a build gate.
- **Reuses the daily-winddown "proposed" surface** (mandated): the `## Proposed updates`-style sections with per-item approve/skip, everything proposed and nothing auto-applied — the interaction contract `daily-winddown/SKILL.md` already drills (its "Closed today (proposed)" / chef-proposed discipline).
- **MC4 (parent plan): the "propose-edits-back-to-source-doc" pattern is reusable** (winddown proposes to staged items; this proposes to a README; published-doc-sync will propose to wiki pages). It gets a PATTERNS.md entry SHIPPED BEFORE the skill (AC6).

## Design decisions

1. **No new scan machinery — the CLI data path is `arete project open --json`.** The skill's inputs are the phase-12 brief + `whatsNew` (`assembleProjectWhatsNew`: area meetings, refreshed topics, new commitments since README mtime) plus reading the surfaced meeting files themselves. No LLM in the data path; judgment applies on top (same boundary as `/project`). The only new CLI surface is the topics-cache writer (decision 2), because R2's zero-write contract needs a tested code path, not agent prose.
2. **Topics persistence is a CLI verb the skill calls after approval.** `arete project refresh-topics <slug>` — preview by default (computed top-5 slugs, current cached set, `changed: true|false`); `--apply` writes `topics:` + `topics_refreshed:` + the ownership comment, and is itself change-gated (same slug set → zero write calls even under `--apply`). The skill includes the preview in its proposal; on approve it runs `--apply`. This keeps R1/R2 enforcement in tested code instead of trusting prose.
3. **Proposals are itemized and minimal.** Each proposed edit is one of a small typed menu — status update, decision/learning to log, new open question, meeting link, topics-cache refresh, commitment claim (`arete commitments claim`, phase-13) — quoted with its source (which meeting/topic justified it). John approves per item. "Touch nothing else" is a rule with a named worked example (June-fixation) in the skill prose.
4. **Slice E rides the observed-working path: items/ + `topic refresh`, not a bespoke area-page writer.** Original phase-12 AC8 had `finalize-project` write a dated retro directly into the area page change-log via `parseTopicPage`/`renderTopicPage` — flagged R7 (wiki round-trip corruption) and "candidate for own phase with heavier review." Dogfooding handed us a cheaper shape: the visioning-deck finalize wrote decisions/learnings to `.arete/memory/items/` and `topic refresh` integrated them cleanly (one favorable observation — punch #2 says "may inform/simplify", and this plan treats it as a lead, not proof; the AC5 substrate test + first-live-finalize soak carry the verification). So: finalize emits ONE structured retro decision entry (`## Closed project: <name>` with date/outcome/topics) to `items/decisions.md`, then runs the existing refresh. The wiki engine integrates it with all its existing safeguards; no new writer touches a live page. Idempotency = scan-before-write on the decisions file (key: `Closed project: <slug>` + close date). **Needs John's read (OQ1)** since it revises the parent plan's AC8 mechanism — the brief's R7 constraint is honored by *eliminating* the risky surface rather than hardening it.
5. **Conversational entry resolves the meeting first.** "I just had a call about X with Y — pull that into the project": resolve the meeting (existing `arete resolve` / meeting index), present it, then run the SAME proposal pipeline scoped to that one meeting. One flow, two entry points; no parallel logic.
6. **Live-workspace application is post-merge and John-operated.** The build touches fixtures only. First live `/update-project` runs are a soak step with John watching the diff (MC3).

## Data model

### Project frontmatter (post-phase) — phase-12 AC5 shape, unchanged

```yaml
---
title: "Task Management v1"
status: active
area: glance-2-mvp            # phase 12
area_set_by: creation         # phase 12
jira: { idea: GL-12 }         # phase 13 (read-side)
topics:                        # THIS PHASE — system-owned cache, never hand-edited
  - snapsheet-task-replacement
  - pop-adjuster-workflow
topics_refreshed: 2026-06-15   # bumped ONLY on slug-set change (R2)
---
<!-- topics: maintained by arete via /update-project; display cache only — do not hand-edit or depend on; edits are overwritten -->
```

- Writer: `refresh-topics --apply` exclusively. Cap 5, confidence-floored (phase-12 OQ5 default). Wholesale rewrite of the two keys when — and only when — the slug set differs.
- The ownership comment doubles as the R10 notice ("do not depend on").

### Retro entry (Slice E) — standard memory-item format

```markdown
## Closed project: Visioning Deck
- **Date**: 2026-06-10
- **Source**: projects/archive/2026-06_visioning-deck/README.md
- **Topics**: glance-2-mvp, vision-deck
- **Project**: visioning-deck

[2–4 line outcome summary: what shipped, what was decided, what was learned.]
```

Standard `parseMemorySections` live format (`## Title` + metadata bullets) — already parsed by the brief's decisions/learnings section and integrated by `topic refresh`. No schema invention.

## Scope (acceptance criteria)

| AC | Criterion | Verification |
|---|---|---|
| **AC1** (GATE) | **`/update-project <name>` skill.** Resolve project (reuse `/project` disambiguation rules — never auto-load a tie); data path = `arete project open <slug> --json` (+ reading surfaced meeting files); present a `## Proposed updates` surface (daily-winddown pattern): itemized typed proposals (decision 3), each with source attribution; apply EXACTLY the approved items via explicit edits; rejecting everything leaves the README byte-identical. Conversational entry per decision 5. **Never auto-writes; topics persistence only via AC2's verb after approval (R1).** | Skill-prose tests (`chef-orchestrator-skills.test.ts`): propose-not-auto-write rule; reject-leaves-untouched rule; the typed proposal menu; winddown-surface reference; June-fixation worked example present. Integration (substrate): on the June-fixation fixture workspace, `arete project open --json` surfaces the contradicting meeting in `whatsNew.meetings` and the brief carries the README's stale goal line — proving the contradiction reaches the agent's context. **Honest verification split (review finding 1 — AC3's stance applied here explicitly): the skill path's apply/reject discipline is LLM-mediated; CI enforces write-safety only via (a) the AC2 verb's snapshot/counting tests and (b) the AC4 regression wall. The reject-leaves-untouched rule on the skill path is prose-pinned + soak-verified — this (GATE) certifies the prose tests + substrate, not a CI-proven behavioral guarantee.** |
| **AC2** (GATE) | **Topics-cache persistence via `arete project refresh-topics <slug>`.** Preview default: top-5 computed slugs (AC4 re-rank output: `retrieveWiki` with the phase-12 project wiki query), current cached set, `changed` flag. `--apply`: change-gated wholesale write of `topics:` + `topics_refreshed:` + ownership comment (inserted once, directly after frontmatter). Same slug set → **zero write calls** even with `--apply` (R2). Cap 5 + confidence floor: **floor = the `retrieveWiki` ranking score (its `retrieveRelevant` relevance score incl. area-match bonus); a slug enters the cache only when its score clears an absolute threshold, top-5 by rank above it — never "top-5 regardless of score" (review finding 3: a rank-only cap silently caches garbage on weak-corpus projects). Exact threshold value is fixed during the build against the 23 project-fed landing-pad topics kept by wiki-rescue W4 (the phase-12 amendment's designated validation material) and recorded in the build-report.** `--json` in all exit paths; `--skip-qmd` + qmd refresh on actual write. `Project` read-model gains `topics?`/`topicsRefreshed?` (read-side only — nothing consumes them for behavior, R10). | Unit (core): same wiki state → rerun performs zero writes (counting StorageAdapter — assert no write call, NOT just identical content); slug-set change → single wholesale rewrite; ownership comment inserted once and preserved on rewrite; frontmatter round-trip lossless (nested `notion:`/`jira:` blocks survive); cap honored; **below-floor slugs excluded (explicit fixture with one strong + one weak match → cache holds only the strong one)**. CLI subprocess: preview is pure read (snapshotTree byte-identical); apply/changed/json paths. |
| **AC3** (GATE) | **June-fixation named integration test** (`june-fixation` — the settled acceptance fixture). Fixture workspace: project README whose Status/Goal says "end of June 2026"; area-tagged meeting (post-README-mtime) whose decision text says the goal moved to EOY-2026. Asserts the full deterministic substrate: (a) the meeting surfaces in `whatsNew`; (b) its decision text is readable at the surfaced path; (c) the README's stale goal line is in the brief's project-context section; (d) zero writes during the entire scan. Paired prose assertion: `update-project/SKILL.md` carries the June-fixation worked example verbatim — "propose the goal-date correction; touch nothing else." | Named test `june-fixation` in the integration suite + the prose assertion. **Honest verification split (stated in-skill and in build-report):** the LLM judgment step (composing the proposal from the surfaced contradiction) is not CI-testable without an LLM in the loop; CI proves the contradiction reaches the agent with zero side effects, prose pins the required behavior, and the post-merge soak (MC3) verifies the live behavior on John's real case — i.e., this is a **substrate gate**, and the build-report must say the acceptance *behavior* (right edit, touch nothing else) is soak-verified, not merge-verified. **Soak caveat (review finding 4): `assembleProjectWhatsNew` compares at day granularity (`m.date > sinceDay`, phase-12 code) — a meeting on the SAME day the README was last touched is excluded from the scan. The fixture controls for this (meeting strictly after README day); the live soak must too: a same-day "nothing new" is an mtime-granularity artifact, NOT evidence the flow is over-conservative. Timestamp-granularity is a phase-12 function change, out of scope, parked (OQ5).** |
| **AC4** (GATE) | **R1 regression wall + R10 guard.** Phase-12's `/project`-open zero-write tests (counting adapter + snapshotTree) pass unmodified; `/project` SKILL.md read-only language intact; no code path outside `refresh-topics --apply` (and explicitly-approved skill edits) writes to a project README. | Existing phase-12 tests stay green untouched (any edit to them is a review flag). **R10 promoted from review-grep to recorded artifacts (review finding 5): (a) the "only README writers in core are `applyAreaToProjectReadme` + the topics writer" grep is captured verbatim in the build-report, and (b) a cheap automated guard ships — a test asserting no brief section/behavior branches on `Project.topics` (fails loudly if a future consumer starts reading the cache without first making it authoritative).** |
| **AC5** (STRETCH, defer-not-cut) | **Close→frozen retro (Slice E, via items/ + `topic refresh` — decision 4).** `finalize-project` SKILL.md gains a retro step: compose the retro entry (data-model shape above) from the completion summary; **idempotency**: scan `items/decisions.md` for `Closed project: <slug>` first — present = skip (rerunning finalize never duplicates); append via the standard memory-item format; run `arete topic refresh`; report which topics integrated it. No new code path — prose + existing primitives. | Skill-prose test: retro step + idempotency-scan rule + exact entry format present. Integration (substrate): appending the fixture retro entry to a fixture workspace and running refresh integrates it into the named topic pages (exercises only existing, already-tested machinery — this test guards the FORMAT contract). Manual/soak: first live finalize observed by John. |
| **AC6** (GATE) | **PATTERNS.md: "propose-edits-back-to-source-doc" entry ships BEFORE the skill** (MC4). Documents: the proposed-surface shape, per-item approval, source attribution, reject-leaves-untouched, the R2 change-gated-persistence corollary, and the named instances (daily-winddown staged items; /update-project README; future published-doc-sync). | Entry exists in `packages/runtime/skills/PATTERNS.md`; `update-project/SKILL.md` references it; commit order shows pattern-before-skill. |
| **AC7** (GATE) | **Tests for all gated ACs pass; typecheck clean; FULL suite green at wrap.** | `npm run typecheck` + per-task tests + full `npm test` at wrap. |
| **AC8** (GATE) | **Discipline ledger + Preparer acceptance gate.** Net-LOC ledger below. **Hard gate:** on the fixture workspace, run the approved-update path twice with unchanged wiki state — the README is byte-identical after the first run (R2 end-to-end); and the `june-fixation` test is green. | Ledger; gate captured in build-report. |
| **AC9** | **Rollback.** `git revert <build commits>` removes skill + verb + PATTERNS entry. `topics:`/`topics_refreshed:` + ownership comment removable by deleting them — no consumer depends (R10). Retro entries are ordinary memory items (removable; `topic refresh` re-converges). Phase-12 surfaces untouched except additive metadata fields. | Documented in rollback.md; spot-verified. |

### AC ledger (estimate)

**Calibration statement (mandated):** phase 12 ran 2.5× its logic-LOC estimate (est. ~240 → actual ~608, `build-diary.md` 08:15Z); its *prose* estimate ran UNDER (est. ~150md → actual ~104 + 1292 test LOC excluded by convention). Numbers below anchor on phase-12 actuals: a two-mode CLI verb with json/qmd/round-trip ≈ 150–170 logic (project backfill-area actual); a frontmatter round-trip helper module ≈ 100–120 (project-area.ts = 115 actual); skill prose with locked rules ≈ 100–250 md (project SKILL = 66 lines; daily-winddown-grade flows run far larger — /update-project is closer to the latter).

| AC | Δ LOC (est.) | Anchor / substitution argument |
|---|---|---|
| AC1 | ~+230 md | new skill, winddown-grade flow prose (entry points, proposal menu, worked example, boundaries) |
| AC2 | ~+220 code | core topics writer ~110 (review finding 3: re-anchored upward — the change-detection slug-set diff, floor logic, and ownership-comment insertion are all net-new vs project-area.ts, which writes unconditionally) + CLI verb ~110 (anchor: backfill-area verb minus the inference loop) |
| AC3 | ~+0 code (tests only) | fixture + named test; excluded by convention but called out as the phase's most load-bearing artifact |
| AC4 | ~+0 | regression wall — existing tests |
| AC5 | ~+45 md | prose step on existing skill; zero new code paths (the substitution: the original AC8 design was ~+60 code on the wiki engine + idempotent writer; this spends ~0 code by reusing `topic refresh`) |
| AC6 | ~+35 md | PATTERNS entry |
| **Net** | **~+220 code + ~+310 md** | tests excluded by convention |

**Substitution argument:** AC1 adds no retrieval code — it consumes phase-12/13 CLI output (the alternative was a parallel scan path in prose: invisible LOC, untestable). AC2's verb exists because R2 demands a tested zero-write contract — the alternative (agent hand-edits frontmatter per prose rules) cannot be CI-asserted and was exactly pre-mortem R1/R2's failure shape. AC5 *deletes* planned code (the bespoke area-page writer) by riding `topic refresh`. Honest flag: this phase's risk is concentrated in prose quality, not LOC — the build-orchestration review gates reflect that (skill-prose tests are gates, not garnish).

## Test strategy

| Layer | Tests |
|---|---|
| Unit | AC2: zero-write-on-no-change (counting adapter), wholesale rewrite on change, ownership comment once + preserved, lossless round-trip (nested blocks), cap/floor. |
| Integration | Real fs + StorageAdapter, no mocks for memory ops. `june-fixation` (named): contradiction surfaces end-to-end, zero writes during scan. Approved-path-twice → byte-identical after first (AC8 gate). Reject path → untouched README. AC5 retro format integrates via real `topic refresh` machinery. |
| Skill-prose | `chef-orchestrator-skills.test.ts`: /update-project propose-not-auto-write, reject-untouched, June-fixation example, proposal menu, PATTERNS reference; finalize-project retro + idempotency rules; /project read-only language UNCHANGED (AC4). |
| CLI subprocess | `refresh-topics` preview/apply/changed/json via real `runCli` temp workspace; preview snapshotTree byte-identical. |
| Regression wall | Phase-12 zero-write suite passes unmodified (AC4). |
| Soak (MC3, post-merge, John-operated) | First 3 live `/update-project` runs: John reviews every proposed item + the applied diff; first-run topics-cache writes diffed per project (no surprise churn — phase-12 MC3 AC5 obligation, inherited); first live finalize-with-retro observed. |

## Touchpoints (file map)

- `packages/runtime/skills/update-project/SKILL.md` — NEW (AC1).
- `packages/runtime/skills/PATTERNS.md` — propose-edits-back-to-source-doc (AC6, ships first).
- `packages/runtime/skills/finalize-project/SKILL.md` — retro step (AC5).
- `packages/core/src/services/project-area.ts` (or sibling `project-topics.ts`) — topics compute/diff/write helpers (AC2).
- `packages/cli/src/commands/project.ts` — `refresh-topics` subcommand (AC2).
- `packages/core/src/models/entities.ts` — `Project.topics?`/`topicsRefreshed?` (read-model, AC2).
- `packages/runtime/skills/project/SKILL.md` — unchanged except (optionally) replacing "future phase" with a live `/update-project` pointer.
- Tests: `project-area`/`project-topics` suites, `cli/test/commands/project.test.ts`, `chef-orchestrator-skills.test.ts`, new `june-fixation` integration fixture.
- Wrap: cli-commands.md + AGENTS.md rebuild, capabilities.json, routability ("update the project with my last call" → update-project).

## Skeptical view (Principle 9)

"This is the followup-5 stored-cross-ref rejection wearing a trenchcoat, again — phase 12 already re-litigated `topics:` and then *didn't ship it*, which tells you how load-bearing it isn't. `/update-project` is a ceremony around what John can do in one sentence to any agent with the README open: 'update this from my last meeting.' The proposal menu will either be so conservative it proposes nothing (and John stops invoking it — see: synthesize) or chatty enough that approving its items is slower than editing the file. The June-fixation test is theater: it tests that a file is readable, not that the model proposes the right edit. And the retro-via-items path means project retros are now formatted exactly like every other decision — frozen context homeopathically diluted into the wiki."

**Counter:** The one-sentence alternative is exactly what produced the June-fixation rot — it depends on John noticing the contradiction; the flow's value is the *scan* (deterministic, since-last-touched, leak-fixed in phase 13), not the editing. The topics cache ships now because its display consumer exists (the brief + John reading the README) and its R1/R2/R10 containment is already designed and tested — deferring it again leaves every README's topic linkage invisible to other consumers, the gap phase-12 decision 1 was made to close. On test theater: conceded in-plan (AC3's honest verification split) — CI pins the substrate and the prose pins the behavior; that's the same epistemics every skill in this repo runs on, made explicit instead of implied. On retro dilution: the entry carries `Project:` provenance and a stable title key; if soak shows retros need more ceremony than a decision entry, the direct area-page writer remains a designed, deferred option — we spent zero code to find out. The "proposes nothing / proposes too much" failure mode is real and is precisely what the 3-run MC3 soak measures before the flow earns trust.

## Phase plan requirements (per parent plan)

- **MC1 (gates vs stretch):** AC1, AC2, AC3, AC4, AC6, AC7, AC8 gates; AC5 stretch (defer-not-cut — it has zero code coupling to D and can land in a fast-follow without re-review of D). AC9 rollback documented. The proactive ambient loop remains OUT (phase-12 PM-panel gate unchanged — instrument whether John wishes /update-project fired unprompted before building that).
- **MC2 (per-skill rollback):** update-project is a new skill (revert removes whole); finalize-project change is prose-only (revert); refresh-topics verb independent of both.
- **MC3 (shadow validation):** post-merge soak as specified in test strategy — proposed-item review ×3 runs, first-write topics diff per project, first live retro observed. Pre-merge: fixture-only.
- **MC4 (PATTERNS.md ship first):** AC6, enforced by commit order.
- **MC5 (legacy interaction):** none — no legacy code paths touched. (finalize-project is an old skill but the change is additive prose.)

## Build orchestration

1. **Slice 0:** AC6 PATTERNS entry (ships first, by contract).
2. **Slice 1:** AC2 `refresh-topics` (core + CLI + zero-write tests). Independently shippable: a useful verb even without the skill.
3. **Slice 2:** AC1 `/update-project` skill + AC3 june-fixation fixture/test + AC4 regression wall. The review-heavy slice.
4. **Slice 3 (stretch):** AC5 finalize retro prose + format-contract test.
5. **Wrap:** AC7 full suite, AC8 gate + ledger, AC9 rollback, docs/routability.

Post-merge operational order (John-operated):
1. (Pre-req, from phase 13) meeting backfill applied live, so the scan sees real areas.
2. First `/update-project` on a quiet project — review every proposed item; diff the applied edits + topics write.
3. The live June-fixation analog: run it on a project with a known stale status; confirm the proposal isolates the correction. **(Review finding 4: if the contradicting meeting is from the same day the README was last touched, the day-granularity scan excludes it — pick a case where the meeting post-dates the README by ≥1 day, or note the artifact; do not read a same-day miss as over-conservatism.)**
4. Next finalize uses the retro step; John eyeballs the integrated topic pages.
5. After 3 clean runs: flow earns default trust; consider the ambient-loop instrumentation question (parking lot).

## Open questions / parking lot

- **OQ1 — Slice E mechanism revision needs John's sign-off:** items/+`topic refresh` (recommended; favorably exercised once in dogfooding; deletes the R7 surface) vs the parent plan's direct area-page change-log write (richer placement control; ~+60 code on the wiki engine + heavier review). Lean strongly: items-mediated now, direct writer only if soak shows retros getting lost in the decision stream.
- **OQ2 — topics cache shape:** frontmatter `topics:` confirmed (phase-12 OQ4 default), sentinel-bracketed body section remains the documented fallback on hand/machine collision in soak.
- **OQ3 — should /update-project propose commitment claims in v1?** Lean yes (one prose item in the menu; the verb ships in phase 13; it's where John said claiming belongs). Cut from the menu without ceremony if it noisy-fires in soak.
- **OQ4 — `/update-project` invocation surface:** skill-only (lean) vs also an `arete project update` CLI alias. Lean skill-only: the flow is judgment-shaped; a CLI alias implies a deterministic contract the command can't honor.
- **OQ5 — `assembleProjectWhatsNew` day-granularity boundary** (review finding 4): same-day meetings are excluded from the scan (`m.date > sinceDay`). Parked: fixing to timestamp granularity is a phase-12 function change; soak notes the artifact; promote to a task only if live runs actually trip it.
- **Parking — publish→close-commitment (phase-12 AC9):** still deferred to published-doc-sync work; the proposal-menu shape here is designed to absorb it later as one more typed item.
- **Parking — proactive ambient loop:** unchanged posture; gated on soak instrumentation ("did John wish this fired unprompted?").
- **Parking — `topics:` becoming authoritative for any consumer:** R10 stands; any future consumer must first make the cache authoritative with its own freshness contract (a separate decision).

## Review disposition — 2026-06-10 (independent eng-lead review, opus, `review.md`)

Verdict: **Approve pending pre-mortem** (Large plan, `has_pre_mortem: false` — consistent with house process: the pre-mortem runs post-approval via `/ship`). The reviewer explicitly ruled Decision 4 (items/-mediated retro) a **legitimate discharge of R7, not a scope dodge** — "eliminating the risky surface beats mitigating it" — and called the R2 tested-zero-write verb "exemplary." Findings and dispositions:

| # | Finding | Disposition |
|---|---|---|
| 1 | AC1's apply/reject discipline is as LLM-mediated as AC3's, but only AC3 disclosed the verification split | **Adopted** — AC3's honest-split language applied to AC1's verification column; the (GATE) explicitly scopes what CI enforces |
| 2 | Decision 4's "dogfooding already validated" overstates punch #2's "may inform/simplify" | **Adopted** — softened to "favorably exercised once"; substrate test + first-live-finalize soak named as the actual verification; OQ1 sign-off gate retained |
| 3 | AC2's "confidence floor" under-specified (source of slug confidence undefined); ~80 LOC estimate omits net-new change-detection | **Adopted** — floor defined as an absolute `retrieveWiki` score threshold (never top-5-regardless-of-score), calibrated against the 23 W4 landing-pad topics and recorded in build-report; below-floor exclusion fixture added; estimate bumped to ~110 core / ~220 net |
| 4 | `assembleProjectWhatsNew` day-granularity excludes same-day meetings — live soak could misread a miss as over-conservatism | **Adopted** — caveat added to AC3 verification, post-merge step 3, and parked as OQ5 |
| 5 | R10 containment rested on an ephemeral review grep | **Adopted** — AC4 now ships a recorded build-report grep artifact + an automated no-consumer-of-`topics` guard test |
| DA | Proposal-quality dead zone (too conservative → abandoned like `synthesize`; too chatty → slower than hand-editing); core value is soak-verified only by construction | **Adopted as pre-mortem seed** (below) — already partially mitigated by the 3-run MC3 soak design |

### Pre-mortem seeds (for the post-approval delta pre-mortem — do NOT skip)

1. **Proposal dead zone**: the flow's value is unverifiable at merge; the 3-run soak must measure both axes (proposed-nothing-when-something-was-due AND items-per-run / approval friction), not just correctness.
2. **Confident-wrong proposal approved**: source attribution makes a mislabel-derived edit look authoritative (compounding risk from phase-13 seed 3); per-item approval + source quoting are the mitigations, and the pre-mortem should ask whether proposals from meetings with `area_set_by: backfill` deserve a visible provenance hint.
3. **Same-day suppression** (OQ5): could make the first live run look broken or, worse, make the one surfaced edit disproportionately likely to be the spurious one.
4. **Decisions-stream dilution**: retros formatted as ordinary decision entries may get lost; soak checks whether the retro is findable in the area's brief/wiki after integration.
