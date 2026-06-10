---
title: "Phase 12 — Projects as first-class citizens (holistic project context)"
slug: phase-12-projects-first-class
created: "2026-06-05"
parent: arete-v2-chef-orchestrator
owner: meta-orchestrator (Claude)
status: approved
approved: "2026-06-10"
has_pre_mortem: true
---

# Phase 12 — Projects as first-class citizens

## Why this exists

The 2026-06-05 design conversation surfaced a goal: a project should carry *holistic context*. When John opens a project, the agent should assemble the project itself **plus** related area, topics (the wiki), recent meeting decisions/learnings, and open commitments — and when work produces new outcomes (a call, a wiki update), those should flow *back* into the project doc rather than being hand-copied.

A code-grounded investigation found this is **mostly a latent bug, not a greenfield feature**:

- `arete brief --project <slug>` already exists (`brief-assemblers.ts:774`) and already assembles recent meetings, open commitments, and area-scoped topic re-rank. **Every one of those sections is guarded by `if (project.area)`.**
- `readProjectBySlug` (`brief-assemblers.ts:765`) reads `area` **only** from `fm.area`.
- **Nothing in the system ever writes `fm.area` to a project.** The `Project` type (`entities.ts:44`) is `{slug, name, description, status, created, updated}` — no area field. The project template (`construct-roadmap/templates/project.md`) is prose-only, no frontmatter. Area is conventionally a prose line — `**Area**: [Glance 2.0 MVP](../../../areas/glance-2-mvp.md)` — that no code parses.

Workspace audit (arete-reserv, 8 active projects, 2026-06-05):

| area signal | count | projects | `--project` brief today |
|---|---|---|---|
| `fm.area` present | 2 | inbound-emails-prd, status-letter-automation | ✅ full |
| only `**Area**:` prose line | 1 | glance-2-mvp | ❌ degraded to README echo |
| no area signal anywhere | 5 | claims-review-generator, glance-comms, onboarding-reserv, product-analytics-playbook-project, task-management-v1 | ❌ degraded |

The 2 working projects got `fm.area` only because John **manually** asked the agent to tag/index them. Left alone, the system never does it — a direct violation (by omission) of "memory must be a computed view, not hand-maintained" (`feedback_l3_memory.md`).

**One-line goal**: make a project's area a reliably-present, system-derived field so the *already-built* project brief lights up; have the agent write the project's relevant topics back onto it (system-owned, refreshed); add `/project` (read context in) and `/update-project` (write context back) flows; emit a frozen retro to the wiki on project close.

## Relationship to prior decisions

- **Partially supersedes followup-5 Questions A/B.** Followup-5 (`phase-3-5-followup-5-wiki-discoverability/plan.md` lines 62–85) deferred (A) meeting→project mapping and (B) a **hand-maintained** project→topic field, because hand-maintained cross-refs rot. This phase does **not** revive a hand-maintained field. The `topics:` it adds (AC5) is **system-written and refreshed every run** — the user never edits it. That is the exact distinction followup-5's rejection turned on: the rejected field had *no writer*; this one has an *automatic* writer. The drift concern is answered by continuous regeneration, not by asking the user to keep it current.
- **Ties to `project_published_doc_sync.md`.** The publish→commitment-completion idea lands as a deferred AC, gated on a "published" signal that does not yet exist.
- **Inherits Phase 8 followup-8 machinery.** Area inference (`suggestAreaForMeeting` / `AreaParserService`) and the `backfill-area` CLI shape (preview/`--apply`/`--reset` + `areaSetBy` provenance) are reused, not rebuilt.

## Design decisions (settled 2026-06-05)

1. **Area is identity → store it (`fm.area`). Topics are a cached view → the agent writes them on explicit update, the user never does.** A project has one stable area (low cardinality, the routing hub); store it. Topics are many and churn; the agent recomputes them on every `/project` open (for display, read-only) and *persists* them only via the explicit `/update-project` flow, and then only when the slug set changes (pre-mortem R1+R2). This is the explicit shift from the initial "pure compute, never store" position, made because John wants the project doc to visibly carry — and other consumers to be able to read — its topic linkage.
2. **Derive, don't maintain.** Area is *proposed at creation* (mirrors `general-project`'s `**Linked Goal**` capture, `general-project/SKILL.md:73`) and *inferred for backfill*. Topics are *machine-regenerated*. Neither is ever required to be hand-typed.
3. **Don't duplicate areas.** AREA = standing domain; PROJECT = bounded unit of work inside an area. The brief surfaces project-grained operational detail; the area page stays the narrative rollup.
4. **Active vs archived = the ingest boundary.** A *live* project is never ingested into LLM-rewritten topic narrative (drift / two truth-sources). A *closed* project is frozen and MAY emit a retro into its area page (AC8).
5. **Two project schemas tolerated, not migrated.** Newer: `{project, type, area}` frontmatter. Older: `{title, status, started, notion}` + prose `**Area**:`. Parser reads frontmatter first, prose line second. No file migration (would violate decision 2).

## PM panel verdict (informs scope — `dev/personas/COUNCIL_INSTRUCTIONS.md`)

- **Harvester (hypothesis — not validated):** the proactive "assemble context during free-form chat" behavior is a tab-closer — one blocking prompt and they leave. **Mitigation: ship only explicit, user-invoked flows (`/project`, `/update-project`). The proactive ambient loop is OUT of scope, gated on dogfooding evidence.**
- **Architect (hypothesis — not validated):** worst case is *silent* failure; today's degraded-brief-with-no-explanation is exactly that. **Mitigation: AC6 visibility line.**
- **Preparer (hypothesis — not validated):** acceptance = "does the brief look materially richer than the README?" **Mitigation: AC11 ships the before/after section-count check as a hard gate.**
- **Product-manager lens:** riskiest assumption is *not* "can we derive area" (we can) — it's "is the proactive behavior wanted." Smallest validating bet = ship the manual flows, instrument whether John ever wishes they fired unprompted. **This phase is that bet.**

---

## Data model

### Project frontmatter (post-phase)

```yaml
---
title: "Glance 2.0 MVP — POP Launch"     # existing (older schema)
status: active                            # existing
started: 2026-04-14                       # existing
notion: { ... }                           # existing
area: glance-2-mvp                        # AC1 — derived/proposed; the routing hub
area_set_by: backfill                     # AC2 — provenance: manual | creation | backfill
topics:                                   # AC5 — SYSTEM-OWNED CACHE, never hand-edited
  - claim-letters
  - status-letter-template
  - localization
topics_refreshed: 2026-06-05              # AC5 — provenance for the cache
---
```

- `area` is read in priority order: `fm.area` → `{project,type,area}` schema variant → `**Area**: [..](../../../areas/<slug>.md)` prose-line regex → unresolved.
- `topics` + `topics_refreshed` are written wholesale by AC5; a leading comment line in the README (`<!-- topics: maintained by arete; edits are overwritten -->`) marks ownership. If hand/machine collision is observed in soak, migrate to a sentinel-bracketed body section per the main plan's risk-#6 pattern (person-memory precedent). Tracked as OQ4.

### `ActiveProject` (in-memory, `brief-assemblers.ts:712`)

Extend with `area` (already present, now actually populated), `areaSetBy?`, `topics?: string[]`, `topicsRefreshed?: string`.

---

## Scope (acceptance criteria)

| AC | Criterion | Verification |
|---|---|---|
| **AC1** (GATE) | **Area on read + write-at-creation.** Read path: project parsing derives `area` in priority order (frontmatter → schema variant → prose `**Area**:` line → unresolved) in `readProjectBySlug` + `listActiveProjects` + any other `ActiveProject` constructor. Write path: `general-project`, `create-prd`, `discovery` skills propose an area at creation (read `arete areas`, suggest best match, write `area:` + `area_set_by: creation` on confirm). | Unit: parser priority order incl. each schema + prose + none. Integration: brief for a fixture project with prose-only area now populates sections 2–5. Manual: `glance-2-mvp` brief before/after. |
| **AC2** (GATE) | **Area backfill CLI.** `arete project backfill-area`: default = preview (proposed area + confidence per area-less project); `--apply` writes `area:` + `area_set_by: backfill`; `--reset` selective via the provenance marker. Reuses `suggestAreaForMeeting`/`AreaParserService` with project README (title + Background + Key Questions) as inference text. Approval-gated; never auto-applies. | Unit: inference text assembly; preview output shape; apply writes provenance; reset only touches `backfill`-stamped. Integration: dry-run over fixture project set. Shadow (MC3): preview table for all 8 arete-reserv projects reviewed before any apply. |
| **AC3** (GATE) | **`/project <name>` open flow + CLI — READ-ONLY.** CLI assembly = resolve name→slug (`resolveProject`, `entity.ts:361`) → `brief --project` → "what's new since last touched" (area meetings + topics with `last_refreshed` newer than README mtime + newly-opened commitments). Skill `/project <name>`: fuzzy-resolve (disambiguate top-N on tie — never auto-load a tie, per pre-mortem R5), present brief + what's-new, offer to dig in. **Open MUST NOT mutate the README** (pre-mortem R1) — it computes relevant topics for display but does not persist them. No LLM in the data path. | Unit: resolver disambiguation (exact, fuzzy, tie→top-N); "what's new" delta vs mtime fixture; **assert open performs zero writes**. Integration: end-to-end open on a fixture workspace leaves the README byte-identical. |
| **AC4** (GATE) | **Topic-aware, project-grained brief.** Fold topic re-rank into `assembleBriefForProject` via existing `retrieveRelevant({area})` (`brief-assemblers.ts:352`), query strengthened with README `## Key Questions`/`## Background` first lines. Commitments filtered by `c.projectSlug` first, unioned with area-scoped commitments not yet claimed by a sibling. Sibling projects parsed from README links (`\]\(\.\.\/([\w-]+)\/`), resolved against `active/` + `archive/` (archived labeled). | Unit: query-string assembly; commitment projectSlug-first union dedup; sibling-link parse incl. archived label. Integration: brief includes topic section + project-grained commitments on a fixture. |
| **AC5** (STRETCH — ships with AC7) | **Agent writes the project's relevant topics back (system-owned cache) — via `/update-project` only.** (Topic *computation* for display is AC4, a gate; only *persistence* is here, bundled with the stretch write-back flow.) Persistence happens in the explicit write flow (AC7), as part of its approval-gated proposal — NOT on `/project` open (pre-mortem R1). Recompute top-N relevant topic slugs (AC4 re-rank output) and write `topics:` + `topics_refreshed:` to README frontmatter **only when the slug set actually changes** (pre-mortem R2 — no date-only churn on a tracked workspace). Field is machine-owned — leading ownership comment; user edits are overwritten on the next change-triggered write. | Unit: **same wiki state → zero file write on rerun** (assert no write call, not just identical content); slug-set change → single wholesale rewrite; ownership comment preserved; frontmatter round-trip lossless. Integration: `/update-project` twice with unchanged wiki → README byte-identical after the first. |
| **AC6** (GATE) | **Visible message on area-resolution failure.** When area cannot be derived, brief prints one line: *"No area resolved (no `area:` frontmatter or `**Area**:` link found) — meeting/commitment/topic context unavailable. Run `arete project backfill-area` or add an area."* | Unit: brief on an area-less project emits the line and no empty/misleading sections. |
| **AC7** (STRETCH, defer-not-cut) | **`/update-project` write-back skill.** Scan recent meetings (project area, since README mtime) + wiki/topic changes; propose README edits (status, decision-to-log, new open question, meeting link) + refresh AC5 topics. Approval-gated, never auto-writes. Also handles the conversational case ("I just had a call about X with Y — pull that transcript"): resolve the meeting, present, then propose the same edits. Reuses the daily-winddown "proposed" surface. | Integration: proposes correct edits from a fixture meeting; rejecting leaves README untouched; accepting applies exactly the approved edits. Skill-prose test in `chef-orchestrator-skills.test.ts` (propose-not-auto-write rule). |
| **AC8** (STRETCH; may split to own phase) | **Close → frozen retro into the wiki.** Extend `finalize-project`: on archive (`active/`→`archive/`, status→archived), emit a dated retro into the project's **area page** change-log (NOT a new topic page). Idempotent: key on `slug + close-date`; scan for `Closed project <slug>` and replace-in-place via `parseTopicPage`/`renderTopicPage`. | Unit: retro content assembly; idempotency (write twice → identical area page). Integration: archive a fixture project → area page gains one retro entry; rerun → no duplicate. |
| **AC9** (DEFERRED — gated) | **Publish → propose close commitment.** On a project doc transitioning to "published," fuzzy-match open commitments scoped to the project and **propose** closing (approval-gated, never auto). | Not built this phase. Blocked: no publish-state machine exists for project docs. Re-scope into published-doc-sync work. |
| **AC10** (GATE) | **Tests for all gated ACs pass; typecheck clean across core/cli.** | `npm run typecheck` + per-file `tsx --test` on touched files. |
| **AC11** (GATE) | **Discipline ledger + Preparer acceptance gate.** Net-LOC accounted with substitution argument. **Hard gate:** diff `arete brief --project glance-2-mvp` before/after AC1 — if section count does not go 1 → 4+, STOP. | Ledger table below; section-count diff captured in build-report. |
| **AC12** | **Rollback.** `git revert <build commits>` reverts code + skill prose. AC2 `--apply` reversible via `--reset`. AC5 `topics:` removable by deleting the frontmatter keys (no consumer hard-depends on them this phase). No schema migration to unwind. | Documented; spot-verified. |

### AC11 ledger (estimate)

| AC | Δ LOC (est.) | Note |
|---|---|---|
| AC1 | ~+35 | parser priority (~15) + 3 skill-prose blocks (~20) |
| AC2 | ~+90 | CLI verb reusing existing inference service |
| AC3 | ~+65 | open assembly + "what's new" delta |
| AC4 | ~+50 | re-wires existing filters (not parallel) |
| AC5 | ~+30 | wholesale topics-cache writer + ownership comment |
| AC6 | ~+5 | one print branch |
| AC7 | ~+150 md | prose-heavy skill |
| AC8 | ~+60 | area change-log emit + idempotency |
| **Net** | **~+325 code + ~+150 md** | |

**Substitution argument:** AC1 is a bug fix — it lights up shipped-but-dark code and deletes nothing; LOC is bounded and load-bearing. AC4 re-wires existing filters rather than adding parallel ones. AC5 replaces the alternative (every consumer re-deriving topics ad hoc) with one cached edge. Tests excluded by convention.

---

## Test strategy

| Layer | Tests |
|---|---|
| Unit | Area parser priority order (frontmatter / schema variant / prose line / none). Backfill: inference-text assembly, preview shape, apply-writes-provenance, reset-scoped-to-`backfill`. Resolver disambiguation (exact / fuzzy / tie). "What's new" mtime delta. Topic re-rank query-string assembly. Commitment projectSlug-first union dedup. Sibling-link parse incl. archived label. AC5 wholesale-rewrite idempotency + frontmatter round-trip + ownership-comment preservation. AC8 retro idempotency. |
| Integration | Brief for prose-only-area project populates sections 2–5 (real fs + StorageAdapter). `/project` open end-to-end on fixture workspace. `/update-project` proposes-not-auto-writes; reject leaves README untouched. Archive emits exactly one area-page retro; rerun no-dup. |
| Skill-prose | `chef-orchestrator-skills.test.ts`: `/update-project` carries the propose-not-auto-write rule; `/project` carries the no-LLM-in-data-path note. |
| Snapshot | `glance-2-mvp` brief before/after AC1 (the AC11 gate). |
| Soak | AC5 topics-cache churn watch + AC2 backfill correctness spot-check on the live arete-reserv workspace post-ship. |

**No mocks for memory operations**: real fs + StorageAdapter (per `services/LEARNINGS.md` and the project's testing memory).

---

## Touchpoints (file map)

- `packages/core/src/services/brief-assemblers.ts` — `readProjectBySlug`, `listActiveProjects`, `assembleBriefForProject` (area read; topic re-rank; commitment projectSlug-first; sibling parse; AC6 line). The two `ActiveProject` constructors at `:742` and `:765` must share one area-resolution helper.
- `packages/core/src/services/area-parser.ts` / Phase 8 f8 inference — reused for AC2.
- `packages/cli/src/commands/` — new `project` command group (`backfill-area`, `open`); or extend existing `brief`/`areas` patterns. Mirror `commitments backfill-area`.
- `packages/core/src/models/entities.ts` — `Project` type gains `area?`, `areaSetBy?`, `topics?`, `topicsRefreshed?` (read-model alignment).
- `packages/runtime/skills/general-project/SKILL.md`, `create-prd/SKILL.md`, `discovery/SKILL.md` — propose-area-at-creation step.
- `packages/runtime/skills/project/SKILL.md` (new), `update-project/SKILL.md` (new) — the two flows.
- `packages/runtime/skills/finalize-project/SKILL.md` + the area-page writer — AC8.
- Tests: `brief-assemblers.test.ts`, `area-parser.test.ts`, new `project-command.test.ts`, `chef-orchestrator-skills.test.ts`.

---

## Skeptical view (Principle 9)

"This is gold-plating a folder of markdown. John already opens projects by typing `open path/to/README.md`; the brief echoes the README he's about to read anyway. The 5 area-less projects lack an area because they genuinely don't map to one — forcing inference mislabels them, and a *wrong* area is worse than none: it pulls the wrong meetings/commitments into the brief and quietly poisons context. And the AC5 topics-cache reintroduces exactly the stored-cross-ref the team rejected in followup-5 — now it can go stale *and* look authoritative."

**Counter:** AC1 is a verified live bug (the brief assumes a field nothing writes), not a feature; bounded cost, deletes nothing. Mislabel risk is real → AC2 is preview-by-default + approval-gated + provenance-stamped, and AC6 makes "no area" honest rather than silently degraded; low-confidence inference yields "no area + visible line," never a forced guess. The AC5 staleness objection is answered by the writer cadence: the cache is rewritten on every open/update, with a `topics_refreshed` date surfaced — it cannot drift the way an unwritten field does, and no consumer hard-depends on it this phase (it's a convenience edge, removable per AC12).

---

## Phase plan requirements (per parent plan)

- **MC1 (gates vs stretch):** AC1, AC2, AC3, AC4, AC6, AC10, AC11 are gates. AC5, AC7, AC8 stretch (defer-not-cut; AC5 ships with AC7). AC9 deferred. Proactive ambient loop out of scope.
- **MC2 (per-skill rollback):** all skill changes are prose on existing/new skills → `git revert`. New skills ship without legacy companions.
- **MC3 (shadow validation):** AC2 backfill runs preview across all 8 arete-reserv projects, reporting proposed area + confidence for John's review BEFORE any `--apply`. AC1 read-path: shadow the brief section-count for every project pre/post. AC5: first-run topics-cache write is diffed (no surprise churn).
- **MC4 (PATTERNS.md ship first):** `/update-project` introduces a "propose-edits-back-to-source-doc" interaction; if reusable, document in PATTERNS.md before the skill.
- **MC5 (legacy interaction):** none — no legacy code paths touched.

---

## Build orchestration

Cheapest-first, independently shippable slices:
1. **Slice A (the win):** AC1 + AC6 + AC10(partial) + AC11 gate. Lights up glance-2-mvp; honest failure for the rest. **Verify the section-count gate before proceeding.**
2. **Slice B:** AC2 backfill (preview-reviewed via MC3, then apply confident matches). Fleet-wide unlock.
3. **Slice C:** AC3 + AC4. The read-only `/project` open experience + topic-aware brief (topics computed for display).
4. **Slice D (stretch):** AC7 `/update-project` write-back, which carries AC5 topics-cache persistence (change-triggered only).
5. **Slice E (stretch, possibly own phase):** AC8 close→wiki retro (touches the wiki engine — heavier review).

---

## Open questions / parking lot

- **OQ1:** `glance-2-mvp` is both a project slug and an area slug → the project's area resolves to the same-named area. Accept the dual reference (different altitudes: operational vs narrative) or dedupe in the brief? Lean: accept. **Needs John's read.**
- **OQ2:** Two project schemas — tolerate-both-by-deriving (recommended) vs converge-via-migration (violates derive-don't-maintain). **Values call — John.**
- **OQ3:** No "published/finalized" signal exists for project docs today → AC9 deferred; confirm it belongs in published-doc-sync work.
- **OQ4:** AC5 topics-cache storage shape — frontmatter `topics:` (chosen, machine-readable) vs sentinel-bracketed body section (collision-safe per person-memory precedent). Revisit if soak shows hand/machine collision.
- **OQ5:** Top-N for the AC5 topics cache — fixed N (e.g. 5) vs confidence-thresholded? Lean: cap at 5, threshold to avoid weak matches polluting the cache.
- **Parking lot — project↔Jira:** add a `jira:` frontmatter block parallel to the existing `notion:` block (e.g. `jira: { epics: [PLAT-...] }`). No code provider in this repo; pull stays via the arete-reserv MCP. **Backlog — not this phase.**
- **Parking lot — proactive Scenario-1 ambient loop:** deferred per PM panel; build only after the manual `/project` flow proves (via instrumentation) John wishes it fired unprompted.

---

## Amendment — 2026-06-10 (pre-build: decisions closed, scope cut)

### Decisions (John, 2026-06-10)

- **OQ1 — resolved by workspace restructure, not by code.** John is splitting the mega-projects: `glance-2-mvp` becomes the *area* with child projects (prototype, runyon, vision-deck, roadmap); `glance-comms` likewise (rollout, signature-logic, …). The slug collision dissolves. The parser still *accepts* project-slug==area-slug (costs nothing); no dedupe logic is built. The "siblings share context via the area hub" design (AC4 union) is exactly the shape the restructure produces.
- **OQ2 — tolerate both schemas.** Confirmed; no migration.
- **OQ3 — confirmed.** AC9 stays deferred to published-doc-sync work.
- **OQ5 — default taken:** topics cache cap 5 + confidence floor. Only matters in deferred Slice D; no further discussion needed.

### Scope cut for this build

**Gated slices A+B+C only: AC1, AC2, AC3, AC4, AC6, AC10, AC11 (+ AC12 rollback doc).** Slices D (AC5+AC7 `/update-project` + topics-cache persistence) and E (AC8 close→retro) move to a follow-up phase, gated on (a) dogfooding `/project`, (b) the workspace restructure completing. Since AC5 persistence is out, this build writes **nothing** to project READMEs except via the approval-gated `backfill-area --apply` (which is itself post-merge, operated by John).

### Sequencing (settled)

The restructure does **not** pause the build — Slice B is CLI code; only *applying* backfill to the live workspace is gated on the restructure. Post-merge operational order:
1. Verify AC11 against the live workspace (read-only brief runs).
2. John extracts child projects using the now-area-aware creation flow (each stamped `area:` at creation — no backfill needed for them).
3. Rerun the project audit against the new project set.
4. `arete project backfill-area` preview (MC3 table) → John reviews → `--apply` confident matches only.

### New inputs since draft (2026-06-05 → 2026-06-10)

- **Wiki rescue W4 applied 2026-06-10**: wiki is now 215 active pages / 34 archived; **23 "project-fed" topics were kept specifically as landing pads for this phase** — use them as AC4 re-rank validation material.
- **Premise re-verified 2026-06-10 post-wiki-repair merge**: line refs shifted (`readProjectBySlug` ~`:927`, `listActiveProjects` ~`:897`, `if (project.area)` guards `:1007`/`:1030`/`:1056`) but the bug is live — `area` still read only from `fm.area`, nothing writes it.

### Execution mode

Prime orchestrator (main session) + suborchestrator running `/ship` in a dedicated worktree. Suborchestrator keeps `build-diary.md` in this plan dir (committed per-task). Merge gate executed by the prime orchestrator after a green wrap; merge authority delegated by John 2026-06-10 ("approve and /ship autonomously") contingent on all gates green incl. AC11.
