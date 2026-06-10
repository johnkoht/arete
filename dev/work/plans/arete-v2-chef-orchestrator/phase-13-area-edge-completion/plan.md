---
title: "Phase 13 — Area edge completion (meetings + read-side polish)"
slug: phase-13-area-edge-completion
created: "2026-06-10"
parent: arete-v2-chef-orchestrator
owner: planning orchestrator (Claude)
status: approved
approved: "2026-06-10"
has_pre_mortem: false
has_review: true
---

# Phase 13 — Area edge completion

> **Approval — 2026-06-10 (John):** all OQ leans confirmed — OQ1 backfill defaults to all-history with `--days` as optional limiter; OQ2 provenance vocab `approval`. Delta pre-mortem (seeds in Review disposition) REQUIRED at ship Phase 1.2 before build.

## Why this exists

Phase 12 made `area:` a reliably-present, system-derived edge on **projects** (and Phase 8/10 did it for **commitments**). Day-1 dogfooding (2026-06-10, `followup-punch-list.md` item 12, John's catch) confirmed the third entity is still dark: **meetings never get `area:` frontmatter — nothing writes it.** Verified: zero `area:` keys in recent meeting files; `MeetingIndexEntry.area` reads `fm.area` (`brief-assemblers.ts:174` in the index loader) which is always absent.

Today, area-scoped meeting retrieval works ONLY via the W6 topics-union fallback (`meetingsForArea`, `brief-assemblers.ts:238`): a meeting matches an area iff the area slug appears in its `topics:` list. Two live failure modes:

- **(a) Miss**: only works where a same-named twin topic page exists and gets tagged. Works for `glance-2-mvp` / `glance-communications`; will NOT work for `pm-operations`-style areas without a twin topic page. Those areas see zero meetings, silently.
- **(b) Leak**: topic-mention ≠ area-belonging — tangential meetings bleed into area recent-activity (observed: BISR updates / claim-review-template surfacing under `glance-2-mvp`).

This is the same shape as the Phase 12 latent bug: a read path (`m.area === areaSlug`) that assumes a field nothing writes. The fix shape is also the same, and the machinery already exists three times over: `suggestAreaForMeeting` (Phase 8 f8, `area-parser.ts:392`), the preview/`--apply`/`--reset` + provenance + 0.7-floor backfill contract (`commitments backfill-area`, `commitments.ts:332`; `project backfill-area`, `project.ts:50`), and the meeting frontmatter mutation primitive (`writeWithLock`, `meeting-lock.ts:208`). **Nothing here is greenfield inference — this phase is the third instantiation of a shipped pattern.**

The phase also carries the cheap read-side items from the same punch list (#3, #4, #5, #6, #7–9) because they touch the exact same files (`brief-assemblers.ts`, `brief-formatters.ts`, `project/SKILL.md`) and fix day-1 annoyances that should not wait behind the heavier write-back phase:

- **#4 siblings**: derive from shared `area:` membership, not only README links. Evidence: `task-management-v1` has area siblings but no sibling section (no README links). The link-graph design predates reliable areas.
- **#5 claim tooling**: a commitment "claimed" by a project = `projectSlug` on the record, but agents/users claim in README prose (a4fdaf7b listed in runyon's tasks yet surfaces to all siblings as unclaimed-area). No cheap way to stamp it exists.
- **#6 jira read-side**: John already hand-maintains the proposed shape (`task-management-v1` carries `jira: {idea: GL-12}`); surface it in the brief.
- **#7–9 formatter polish**: status echoes raw `### YYYY-MM-DD` headings; open-work bullets double-nest (`-   - …`); recent-activity excerpts show `<!-- merged from … -->` HTML comments.

**One-line goal**: make `area:` a real first-class edge on all three entities (projects ✅ Phase 12, commitments ✅ Phase 8/10, meetings — this phase), and finish the project-brief read surface so Phase 14's write-back flow scans clean inputs.

## Relationship to prior decisions

- **Child of the Phase 12 amendment scope split** (2026-06-10): Slices D/E moved to a follow-up; this phase is the *foundation half* of that follow-up. Phase 14 (`phase-14-project-write-back`) is the flow half. See "Phase structure decision" below.
- **Inherits the Phase 8 f8 + Phase 12 backfill contract verbatim**: preview-by-default, `--apply` gated, `--reset` scoped to provenance, 0.7 confidence floor (pre-mortem R3 of phase 12 — non-negotiable), `--json` in all exit paths, qmd refresh + `--skip-qmd`.
- **Binding constraints carried from the phase-12 pre-mortem**: R2 (no churn writes — backfill rerun is a true no-op: zero write calls, see AC3; deliberately stronger than the phase-12 project backfill's identical-content guarantee, per review finding 2), R3 (confidence floor; a wrong area must never auto-fill — below floor → leave area-less, honest), R5-style disambiguation does not apply here (no fuzzy resolution in this phase).
- **`hashMeetingSource` body-only invariant** (services LEARNINGS, 2026-04-23/29): adding `area:` to meeting **frontmatter** does NOT bust the wiki extractor's dedup hash — backfill cannot trigger mass re-integration. This is a verified non-risk, not an assumption.
- **Live-workspace application is post-merge and John-operated** (phase-12 amendment sequencing): the build touches fixtures only; `arete meeting backfill-area --apply` on arete-reserv is a John-run step with an MC3 preview table first.

## Phase structure decision (one phase or two?)

**Recommendation: two phases — this one (foundation) before `phase-14-project-write-back` (flow).** Reasoning:

1. **Dependency direction is real, not aesthetic.** `/update-project` (Phase 14) scans "recent meetings in the project's area since the README was last touched" — that is `meetingsForArea` (`brief-assemblers.ts:1381` via `assembleProjectWhatsNew`). On today's topics-union fallback, that scan *misses* meetings for areas without twin topic pages and *leaks* tangential meetings in (both observed live). A write-back flow proposing README edits from leaked meetings proposes wrong edits — confidently. Phase 14's input quality is this phase's output. Similarly, Phase 14's flow wants to propose commitment claims, which consumes this phase's claim verb (AC5).
2. **Risk profiles differ.** This phase is read-side + one heavily-precedented write surface (meeting frontmatter, three prior instantiations of the same contract). Phase 14 contains the two approval-gated agent write flows (`/update-project` README edits + topics cache; close→retro touching wiki integration) — exactly the surfaces the phase-12 pre-mortem flagged for heavier review (R1, R2, R7, R10). Keeping them in their own phase keeps that review focused.
3. **Single-phase cost is calibration risk.** Phase 12 ran 2.5× its LOC estimate. Combined, these two phases are estimated bigger than phase 12's actual build. One mega-phase reproduces the "it's just a follow-up" framing that pre-mortem R8 warned about.
4. **House preference for independently-shippable slices**: phase 13 merges and delivers value (leak/miss fix, siblings, claim verb, polish) even if phase 14 slips a week behind dogfooding.

Deviation from the prime orchestrator's instinct, with reasoning: #3 (presentation prose), #6 (jira read-side), and #7–9 (polish) move from the flow phase into this one. They are dependency-free, touch the same three files this phase already opens, and fix day-1 reading annoyances — putting them behind the write-back phase delays the cheapest value for no coupling reason. #3 specifically *belongs* with #4: "always show siblings" is only honest once area-derived siblings make the section reliably non-empty.

## Design decisions

1. **Prefer `area:`, keep topics-union as fallback — per meeting, not per query.** `meetingsForArea` becomes: a meeting WITH explicit `area:` matches only on `area:`; a meeting WITHOUT one falls back to topics-membership. This fixes the leak for tagged meetings (a meeting explicitly in `pm-operations` no longer bleeds into `glance-2-mvp` via a topic mention) while remaining byte-identical in behavior for today's workspace (zero meetings carry `area:` until John applies backfill). No flag days, no migration. **Documented trade-off (review finding 1): this deliberately costs recall for genuinely multi-area meetings** — once a meeting carries `area: X`, a topic mention of area Y no longer surfaces it under Y. That is phase-12 pre-mortem R4 (parked: single primary area now, `areas:` plural later) arriving on meetings; precision was the observed live failure (leak) and the loss is recoverable (remove/extend the key), but it must be a *tested decision*, not a surprise — AC1 carries an explicit exclusion fixture for exactly this case.
2. **Propose at process; write before approve; mirror the project creation flow.** `arete meeting process` *proposes* (no write). The `process-meetings` skill presents the proposal; on John's confirm, `arete meeting set-area` writes `area:` + `area_set_by: approval`. The approve path then inherits it for commitments automatically (existing code: `meeting.ts:1736` reads `frontmatter.area` into created commitments) — meeting-area completion compounds into commitment-area completion for free.
3. **Backfill mirrors the project CLI exactly.** Same verb shape, same floor, same provenance discipline, same preview table for MC3. Inference text = title + summary + body transcript (same resolver precedence as `commitments backfill-area`'s closure, minus its frontmatter-area short-circuit which is the candidate filter here).
4. **Siblings = same-`area:` actives ∪ README links.** Area membership is the robust primary source (post-phase-12 every active project can carry `area:`); link-graph stays as the supplement for cross-area and archived references. Archive lookup widened to tolerate the `YYYY-MM_<slug>` directory prefix that `finalize-project` actually produces (the phase-12 lookup checks `archive/<slug>/` only — a latent miss found while planning this phase).
5. **Claim is explicit, so no provenance/reset machinery.** `arete commitments claim` stamps `projectSlug` on a commitment record (JSON store, not markdown). It is always a deliberate act by John or an approval-gated skill step — unlike inferred areas there is no "undo the machine's guesses" story to support. `--clear` covers mistakes.
6. **Polish is rendering-only.** #7–9 change extraction/formatting, never data. The shared `renderSection` fix (indented bullets pass through un-prefixed) must be shape-preserving for the other three brief modes.

## Data model

### Meeting frontmatter (post-phase)

```yaml
---
title: "Glance weekly sync"
date: 2026-06-09T17:00:00.000Z
attendees: [...]
topics: [claim-letters, status-letter-template]   # existing — wiki extractor owns
area: glance-2-mvp                                # NEW — explicit area edge
area_set_by: approval                             # NEW — provenance: manual | approval | backfill
---
```

- `area` read priority in `loadMeetingIndex` is unchanged (`fm.area` only — that's already correct; the bug was the absent writer).
- Provenance values: `manual` (hand-edited), `approval` (confirmed via process-meetings flow), `backfill` (CLI `--apply`). `--reset` touches ONLY `backfill`.
- `topics:` stays untouched and wiki-extractor-owned. This phase adds a sibling key, never rewrites the existing one.

### Commitment record

`projectSlug?: string` already exists on `Commitment` (`entities.ts:40`) and is already consumed by `unionProjectCommitments` (`brief-assemblers.ts:1091`). This phase adds the *writer* (claim verb), no schema change.

### `ActiveProject` / `ProjectBrief.metadata`

Gains `jira?: Record<string, string>` (read-only surfacing of the `jira:` frontmatter block; values stringified, arrays comma-joined). Parser tolerates absence and non-object shapes (ignore, never throw).

## Scope (acceptance criteria)

| AC | Criterion | Verification |
|---|---|---|
| **AC1** (GATE) | **`meetingsForArea` prefers explicit `area:`; topics-union stays fallback.** Per design decision 1: `m.area ? m.area === areaSlug : m.topics.includes(areaSlug)`. All call sites (`:1202` project recent-activity, `:1381` what's-new, `:1626` area brief) inherit via the single function. | Unit: leak fixture (meeting `area: pm-operations` + `topics: [glance-2-mvp]` → excluded from glance-2-mvp, included for pm-operations); miss fixture (meeting `area: pm-operations`, no twin topic page → included for pm-operations); no-area meeting → topics fallback unchanged; **accepted-trade-off fixture (review finding 1): a multi-area-flavored meeting (`area: X` + `topics: [Y]`) is asserted EXCLUDED from Y — named test documenting the deliberate recall cost (R4-bounded), so soak can't misread it as a regression.** Regression: existing `meetingsForArea` tests (W6.2) pass unmodified for area-less meetings. |
| **AC2** (GATE) | **Propose area at process; `arete meeting set-area` writes on confirm.** `arete meeting process` on a meeting lacking `area:` runs `suggestAreaForMeeting({title, summary, transcript})` and includes `proposedArea: {slug, confidence}` in output (JSON + one human line) at ≥0.7 confidence; below floor → no proposal (silent in human output, `proposedArea: null` in JSON). **Process performs zero area writes.** New `arete meeting set-area <file> <area-slug> [--set-by approval\|manual] [--json]` writes `area:` + `area_set_by:` via the meeting frontmatter writer (writeWithLock round-trip; body byte-preserved). `process-meetings` skill prose: present the proposal, confirm-or-skip (optional, never blocking — phase-12 R6 shape), on confirm run set-area BEFORE approve so commitments inherit. | Unit: proposal present ≥0.7 / absent <0.7; process writes no `area:` key (counting adapter); set-area round-trip preserves body + other frontmatter keys (incl. nested maps); area slug validated against `areas/*.md` (unknown slug → error, no write). Integration: process→set-area→approve on a fixture meeting → created commitments carry the area. Skill-prose test: propose-not-auto-write + optional-never-blocking rules. |
| **AC3** (GATE) | **`arete meeting backfill-area` mirroring the project CLI.** Default = preview (proposed area + confidence per area-less meeting, count summary); `--apply` writes `area:` + `area_set_by: backfill`; `--reset` clears ONLY `backfill`-stamped; `--days N` optional candidate limiter (default: all); `--skip-qmd`; `--json` complete in all exit paths; qmd refresh after apply. 0.7 floor; below floor → meeting stays area-less (listed as unmatched). **Zero meeting-file churn without `--apply`** (preview is a pure read). Idempotent apply with **no-op write suppression**: rerun with same proposals → zero write calls. *(Review finding 2, accepted: this is deliberately STRONGER than the phase-12 project backfill, whose `applyAreaToProjectReadme` writes unconditionally and guarantees only identical content. Backfill here can touch hundreds of committed files, so the candidate filter — only meetings WITHOUT `area:` — plus an explicit same-values guard in the writer must make rerun a true no-op. The ledger funds the change-detection branch.)* | Unit (core `meeting-area.ts` helpers): candidate listing skips meetings with `area:`; inference-text assembly; apply writes provenance + preserves body/frontmatter; reset scoped to `backfill`; same-values rerun → zero write calls (counting adapter). CLI subprocess: preview/apply/reset/days/json paths; preview leaves fixture workspace byte-identical (snapshotTree). Shadow (MC3): preview table over live arete-reserv meetings reviewed by John before any apply (post-merge); **long-tail spot-check must specifically eyeball 0.8 name-substring matches (see pre-mortem seeds)**. |
| **AC4** (GATE) | **Siblings derive from shared `area:` ∪ README links.** Brief section 6 union: active projects with `p.area === project.area` (excluding self) first, then link-derived extras (`parseSiblingSlugs`) not already present; archived link-targets labeled; archive lookup tolerates both `archive/<slug>/` and `archive/YYYY-MM_<slug>/` (the path `finalize-project` actually writes). Dedup by slug. | Unit: area-siblings appear with zero README links (the task-management-v1 case); link-only sibling (cross-area) still appears; self excluded; dedup when both sources yield the same slug; archived `YYYY-MM_` dir resolves + labeled. Integration: fixture workspace with 3 same-area projects → each brief lists the other 2. |
| **AC5** (GATE) | **Commitment claim verb.** `arete commitments claim <id-prefix> --project <slug>` stamps `projectSlug` on the commitment (id-prefix resolution per existing `resolve` semantics; ambiguous prefix → error listing matches, no write). `--clear` removes it. Project slug validated against `projects/active/` + `projects/archive/` (both naming shapes); unknown slug → error, no write. `--json` everywhere. Service method `CommitmentsService.setProjectSlug()` runs under the existing lock; hash/ID invariant (projectSlug is metadata, not part of dedup hash — same contract as `area`). | Unit (service): set, clear, ambiguous prefix rejection, unknown id; lock respected (mirrors `backfillArea` tests); **hash-invariance pinned (review finding 5): stamping/clearing `projectSlug` leaves the commitment's dedup hash/ID unchanged — explicit assertion mirroring the existing area-not-in-hash contract, not just asserted in prose.** CLI subprocess: claim/clear/--json; unknown project rejected. Integration: claim a fixture commitment → project brief Open-work moves it from unclaimed-area to project-claimed; sibling brief no longer shows it (the a4fdaf7b case). |
| **AC6** (GATE — prose-pinned, soak-verified) | **`/project` presentation prose: siblings + wiki always shown; trigger vocabulary broadened.** `project/SKILL.md` presentation step: ALWAYS render the Sibling-projects and Related-wiki-pages sections when present in CLI output — never drop as "secondary"; when absent from CLI output, say so in one line ("No siblings / no wiki pages matched"). **Trigger coverage (dogfooding miss, 2026-06-10 evening — punch #13):** John's "load project glance-2-roadmap and review" did not match the trigger list (`open/work on/pull up project`), so the agent freestyled with manual file reads and missed the assembled surface (one of four siblings, zero wiki pages). Add triggers: `load project`, `load the project`, `review project`, `look at (the) project`, `load up`. | Skill-prose test in `chef-orchestrator-skills.test.ts` asserts the always-show rule text + the broadened trigger list. **(Review finding 4, honest label: this is a string-presence assertion, not a behavior test — prose pins the rule, soak verifies the agent follows it. Same epistemic stance as phase-14 AC3's verification split.)** |
| **AC7** (GATE) | **`jira:` frontmatter read-side surfacing.** `readProjectBySlug`/`listActiveProjects` parse `fm.jira` (object → string map; arrays comma-joined; non-object ignored); `ProjectBrief.metadata.jira`; `formatProjectBriefMarkdown` renders one `**Jira:** key: VALUE · key: VALUE` line. No write path, no provider, no validation of ticket IDs. | Unit: object parsed; array values joined; missing/malformed → absent (no line rendered); formatter renders the line for task-management-v1-shaped fixture (`jira: {idea: GL-12}`). |
| **AC8** (GATE) | **Formatter polish (punch #7–9, one task).** (7) Status excerpt: `### …` heading-only chunks in `## Status Updates` are not emitted as content; a date heading becomes a `**[YYYY-MM-DD]**` prefix on its following paragraph. (8) `renderSection` passes through bullets that start with whitespace (already-nested) without adding the `- ` prefix — no more `-   - …`. (9) `loadMeetingIndex` excerpt skips HTML-comment lines (`<!-- … -->`) when picking the first non-empty line. | Unit per fix: status fixture with dated headings renders dated prefix, no raw `###`; nested open-work bullets render `  - x` under `- **I owe (1):**`; meeting body starting with `<!-- merged from … -->` yields the next real line as excerpt. Regression: person/area/meeting brief formatter snapshots unchanged for non-indented bullets. |
| **AC9** (GATE) | **Tests for all gated ACs pass; typecheck clean across core/cli; FULL suite green at wrap** (not just touched files — services LEARNINGS 2026-06-08). | `npm run typecheck` + per-task `tsx --test` + full `npm test` at wrap. |
| **AC10** (GATE) | **Discipline ledger + Preparer acceptance gate.** Net-LOC accounted with substitution argument (ledger below). **Hard gate (fixture-level, buildable):** the AC1 leak fixture — a meeting with explicit `area:` elsewhere + a glance topic tag — must be EXCLUDED from the glance project brief's recent activity, and the miss fixture must be INCLUDED for its area. **Shadow gate (live, read-only, pre-merge):** brief section counts for all live projects unchanged vs phase-12 baseline (AC1 is behavior-identical until areas are applied). | Named tests `area-edge leak` / `area-edge miss`; MC3 shadow table in build-report. |
| **AC11** | **Rollback.** `git revert <build commits>` reverts code + prose. AC3 `--apply` reversible via `--reset` (provenance-scoped). AC5 claims removable via `--clear` (and are inert metadata). AC2 set-area reversible by hand-deleting two frontmatter keys. No migration, no consumer hard-depends on the new keys this phase. | Documented in rollback.md; `--reset` spot-verified in tests. |

### AC ledger (estimate)

**Calibration statement (mandated):** phase 12 estimated ~+240 logic LOC for slices A+B+C and shipped ~+608 (2.5×, per `build-diary.md` 08:15Z — honest accounting). The diary's itemized why: per-AC numbers were thin against the precedents being mirrored, and review added real surface (qmd wiring, `--json` completeness, disambiguation output). The numbers below are therefore anchored to phase-12 **actuals**, not its estimates: `project-area.ts` = 115 LOC actual; the two-verb `project.ts` CLI = ~290 logic actual; `commitments backfill-area` CLI ≈ 130. Where this plan mirrors one of those components, its estimate IS that component's actual ±20%.

| AC | Δ LOC (est.) | Anchor / substitution argument |
|---|---|---|
| AC1 | ~+10 | one-function semantic change; no new code path |
| AC2 | ~+145 code, ~+25 md | proposal block in `process` (~60 — review finding 3: re-anchored upward; threading `proposedArea` through both the JSON shape and human output of a 2000+-line command's busiest action is not a 35-line edit) + `set-area` verb (~85; smaller than a backfill verb — single file, no preview table) |
| AC3 | ~+310 | `meeting-area.ts` ~140 (anchor: project-area.ts = 115 actual, +~20 for the no-op write-suppression branch the project version doesn't have — review finding 2) + CLI verb ~170 (anchor: project backfill-area ≈ 160 actual incl. qmd/json) |
| AC4 | ~+35 | union + archive-prefix tolerance inside the existing section-6 block |
| AC5 | ~+115 | service `setProjectSlug` ~40 (anchor: `resetBackfilledAreas` = 20, plus prefix resolution) + CLI verb ~75 |
| AC6 | ~+10 md | prose lines + test strings |
| AC7 | ~+35 | parse + metadata + one formatter line |
| AC8 | ~+35 | three localized rendering fixes |
| **Net** | **~+685 code + ~+35 md** | tests excluded by convention |

**Substitution argument:** AC1 re-points an existing filter (deletes the leak, adds nothing parallel). AC2/AC3 are the third instantiation of the backfill contract — they reuse `suggestAreaForMeeting`, `writeWithLock`, and the CLI shape rather than inventing inference or writers; the alternative (Phase 14 building its own meeting-relevance heuristic inside skill prose) would be invisible, untested LOC. AC4 replaces the unreliable link-only source rather than stacking a second section. AC5 is the missing writer for an already-consumed field. AC7/AC8 are read/render only. Honest flag: at ~685 logic LOC this is a phase-12-build-sized phase, not a patch — budgeted accordingly (R8 lesson), with slices that ship independently. **The two most overrun-prone rows are AC2 and AC3 (review finding 3) — the same "thin against the precedent being mirrored" failure shape that drove phase-12's 2.5×; if either runs >1.5× during build, re-scope at the slice boundary rather than absorbing silently.**

## Test strategy

| Layer | Tests |
|---|---|
| Unit | AC1 leak/miss/fallback fixtures. AC2 proposal floor + zero-write-on-process (counting adapter) + set-area round-trip (body + nested frontmatter preserved) + unknown-area rejection. AC3 candidate filter, inference text, apply provenance, reset scope, idempotent rerun = zero write calls. AC4 union/dedup/self-exclusion/`YYYY-MM_` archive. AC5 set/clear/ambiguous/unknown. AC7 parse shapes. AC8 three rendering fixtures + cross-mode formatter regression. |
| Integration | Real fs + StorageAdapter (NO mocks for memory ops — services LEARNINGS). process→set-area→approve commitment inheritance. Backfill preview leaves fixture workspace byte-identical (snapshotTree — phase-12 zero-write pattern, both layers). Claim flips a commitment between sibling briefs. Fixture-level AC10 gate. |
| Skill-prose | `chef-orchestrator-skills.test.ts`: process-meetings carries propose-not-auto-write + optional-never-blocking; project SKILL carries always-show-siblings/wiki. |
| CLI subprocess | `meeting backfill-area` + `meeting set-area` + `commitments claim` via real `runCli` temp workspace (pattern: `cli/test/commands/project.test.ts`). |
| Shadow (MC3) | Read-only: live brief section-count diff (expect zero change pre-apply). Post-merge, John-operated: backfill preview table over all live meetings; spot-check long tail (Phase 8 f8 lesson: 41.9% match rate implies a real weak-match tail). |

## Touchpoints (file map)

- `packages/core/src/services/brief-assemblers.ts` — `meetingsForArea` (AC1), sibling union (AC4), status-excerpt + meeting-excerpt extraction (AC8), `jira` parse (AC7).
- `packages/core/src/services/brief-formatters.ts` — `renderSection` nesting (AC8), jira line (AC7).
- `packages/core/src/services/meeting-area.ts` — NEW (AC2/AC3 helpers; mirrors `project-area.ts`).
- `packages/core/src/services/meeting-lock.ts` — consumed (writeWithLock), not modified.
- `packages/core/src/services/commitments.ts` — `setProjectSlug` (AC5).
- `packages/cli/src/commands/meeting.ts` — process proposal + `set-area` + `backfill-area` subcommands (AC2/AC3).
- `packages/cli/src/commands/commitments.ts` — `claim` subcommand (AC5).
- `packages/core/src/models/entities.ts` / `models/intelligence.ts` — `jira` on project read-model + brief metadata (AC7).
- `packages/runtime/skills/process-meetings/SKILL.md` (AC2 prose), `packages/runtime/skills/project/SKILL.md` (AC6 prose).
- Tests: `brief-project.test.ts`, `brief-formatters` suite, new `meeting-area.test.ts`, `commitments.test.ts`, `cli/test/commands/{meeting,commitments}.test.ts`, `chef-orchestrator-skills.test.ts`.
- Wrap: `cli-commands.md` + AGENTS.md rebuild, capabilities.json, routability check for new verbs.

## Skeptical view (Principle 9)

"This triples down on frontmatter bookkeeping. Meetings already have `topics:` — the union fallback mostly works for the areas John actually uses, and the two observed leaks are cosmetic noise in a brief section, not wrong decisions. Backfilling hundreds of historical meeting files churns a committed repo for retrieval polish. The claim verb is a manual chore disguised as tooling — John won't remember it exists (see: synthesize). And bundling six punch-list items makes this 'foundation' phase as big as phase 12's whole build — the exact R8 'it's just a follow-up' trap, now with a backfill that can mislabel meetings at scale."

**Counter:** The miss is not cosmetic — `pm-operations`-style areas see ZERO meetings today, which silently guts Phase 14's scan for those projects (confidently wrong write-back proposals are the downstream cost). The leak fix costs ~10 LOC and is behavior-identical until areas exist. Churn is bounded by the contract: preview-by-default, John reviews the MC3 table, applies once, provenance-reset available — and the body-only hash invariant means no re-integration cascade. Mislabel-at-scale is contained the same way it was for projects and commitments: 0.7 floor + below-floor-stays-empty + John-operated apply (and AC1 means a wrongly-labeled meeting at least stops leaking everywhere else). The claim verb's discoverability worry is real but cheap to mitigate: Phase 14's `/update-project` proposes claims as a flow step, which is where John already said it belongs ("skill step in the split/update flows"). On size: conceded and budgeted — see the ledger's honest flag and the sliced build order; slices A/B/C/D each ship alone.

## Phase plan requirements (per parent plan)

- **MC1 (gates vs stretch):** AC1–AC10 are gates; AC11 rollback documented. Nothing stretch — every item here was either dogfooding-observed (punch list) or is the binding foundation for Phase 14. The deferred Slices D/E live in Phase 14, not here.
- **MC2 (per-skill rollback):** prose-only edits to `process-meetings` + `project` skills → `git revert`. New CLI verbs are independent of skills.
- **MC3 (shadow validation):** (a) pre-merge read-only: live brief section counts unchanged (AC1 no-op proof); (b) post-merge John-operated: `meeting backfill-area` preview table for ALL live meetings reviewed before any `--apply`, long-tail spot-check explicit (Phase 8 f8 lesson).
- **MC4 (PATTERNS.md):** no new interaction pattern — every flow here instantiates an existing documented contract (backfill, propose-at-capture). Nothing to pre-document.
- **MC5 (legacy interaction):** none — no legacy code paths touched.

## Build orchestration

Cheapest-first, independently shippable slices:

1. **Slice A (read-side, zero risk):** AC1 + AC8 + AC7 + AC4 + AC6 + the AC10 fixture gate. Pure read/render; live behavior identical until meeting areas exist. Verify the leak/miss fixture gate + live section-count shadow before proceeding.
2. **Slice B (meeting-area write surface):** AC2 + AC3 (meeting-area.ts, set-area, backfill, process proposal, process-meetings prose). The heavy slice; carries the MC3 preview obligation.
3. **Slice C (claim tooling):** AC5. Independent of A and B.
4. **Wrap:** AC9 full suite, AC10 ledger, AC11 rollback doc, docs/routability.

Post-merge operational order (John-operated, mirrors phase-12 amendment):
1. Read-only verify: live briefs unchanged.
2. `arete meeting backfill-area` preview → John reviews MC3 table (+ long-tail spot-check) → `--apply` confident matches.
3. Re-run the glance-2-mvp / task-management-v1 briefs: confirm BISR/claim-review-template leakage gone, pm-operations-style areas now see meetings.
4. New meetings get areas at process/approve going forward (the steady-state writer).
5. Optionally claim known commitments (a4fdaf7b → runyon) via `arete commitments claim`.

## Open questions / parking lot

- **OQ1 — backfill default scope:** all-history vs `--days` default. Lean: default all (preview is free; apply is John-gated anyway), `--days` as optional limiter for incremental passes. **Cheap call — John at apply time, not blocking.**
- **OQ2 — provenance value for confirm-time writes:** `approval` (chosen — symmetric with the approve-flow moment) vs `creation`. Default taken; flag if John prefers one vocabulary across entities.
- **OQ3 — should `MeetingBrief` / other meeting read surfaces consume `area:` this phase?** Out of scope — only `meetingsForArea` changes semantics; other consumers pick it up naturally since the index already carried the field.
- **Parking — punch #10 (wiki section variance):** watch item, not actionable; investigate only if a brief silently drops its wiki section again.
- **Parking — `areas:` plural on meetings:** same posture as projects (phase-12 R4): single primary area now; parser change would be additive later.
- **Parking — commitment claim provenance:** if agent flows start claiming at volume (Phase 14), revisit a `projectSetBy` marker + reset story; deliberately omitted while claims are explicit-only.

## Review disposition — 2026-06-10 (independent eng-lead review, opus, `review.md`)

Verdict: **Approve pending pre-mortem** (Large plan, `has_pre_mortem: false` — consistent with house process: the pre-mortem runs post-approval via `/ship`). Findings and dispositions:

| # | Finding | Disposition |
|---|---|---|
| 1 | AC1's per-meeting preference costs recall for multi-area meetings (R4 arriving early); trade-off was undocumented/untested | **Adopted** — Design decision 1 amended; named exclusion fixture added to AC1 verification |
| 2 | AC3 cited a "phase-12 zero-write pattern" the phase-12 backfill doesn't implement (it writes unconditionally, guarantees identical content only) | **Adopted, option (b)** — kept the stronger zero-write-calls-on-rerun contract, funded the change-detection branch (+20 LOC in ledger), corrected the citation |
| 3 | AC2 process-block estimate (~35) thin; AC2/AC3 are the overrun-prone rows | **Adopted** — AC2 re-anchored to ~60; ledger names AC2/AC3 as overrun-prone with a 1.5× slice-boundary re-scope rule |
| 4 | AC6 gates on a string-presence prose test, overstating the guarantee | **Adopted** — relabeled "GATE — prose-pinned, soak-verified" with explicit honesty note |
| 5 | AC5 hash-invariance asserted, not pinned to a test | **Adopted** — explicit hash-unchanged unit assertion added to AC5 verification |
| DA | 0.8 name-substring match (`area-parser.ts:432`) clears the 0.7 floor on title alone → confident-but-wrong backfill at scale, compounding into phase-14 inputs | **Adopted as pre-mortem seed** (below) + MC3 long-tail spot-check now names 0.8 name-matches explicitly |

### Pre-mortem seeds (for the post-approval delta pre-mortem — do NOT skip)

The inherited phase-12 pre-mortem does not cover three risks this phase introduces; the reviewer requires a narrow delta pre-mortem on exactly these before build:

1. **0.8 name-match mislabel**: `suggestAreaForMeeting` awards 0.8 confidence on a bare area-name substring in the title — above the 0.7 floor. A meeting titled "Glance comms sync" that is mostly claims work backfills to `glance-comms` confidently. Candidate mitigations to evaluate: per-match-type floor (name-match alone insufficient without keyword corroboration), preview table sorts/flags 0.8-name-only matches, or floor raise for backfill specifically.
2. **Multi-area recall loss** (finding 1): bounded + tested, but the pre-mortem should ask whether any live recurring meeting is known to span areas before John applies backfill broadly.
3. **Cross-phase contamination**: this phase's mislabels become phase-14's confident-wrong write-back sources. Mitigation shape: phase-14 dogfooding starts only after the MC3 spot-check passes, and `/update-project` proposals quote their source meeting (already in phase-14 decision 3) so a mislabel is visible at proposal time.
