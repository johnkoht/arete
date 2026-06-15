---
slug: plan-context-injection
status: approved
has_pre_mortem: false
has_review: true
created: 2026-06-14
reviewed: 2026-06-14
review_verdict: READY-WITH-CHANGES (9 CRs incorporated)
---

# Plan: project/wiki context injection into week-plan & daily-plan

Wire the project + topic-wiki context you've been building into the **planning** surfaces, where it currently doesn't reach. Grounded in discovery (2026-06-14; see `discovery-2026-06-14.md`). Shippable workstreams. **This is the biggest gap in planning right now:** week-plan/daily-plan are good at surfacing *high-level* priorities, but slip badly when the work digs into **details and tasks** — because no project/topic state reaches the reasoning, and the per-meeting prep loses fidelity.

User decisions locked (2026-06-14):
- All three flows in scope: **week-plan priorities**, **daily-plan ideas**, **agenda project context**.
- **Mechanism = Option B: a NEW lightweight aggregator `arete plan-context` that CALLS the existing verbs (brief/topic/project), does NOT duplicate their assembly.**
- New requirements (this round):
  - week-plan must read **last week's plan + recently-active projects (in-flight work)** to shape priorities — not just list them.
  - week-plan must invoke **daily-plan at full fidelity** (no corner-cutting; see WS-4).
  - Agenda prep must surface a project's **body content** — Key Questions, Open Questions, `working/` notes (the actual thoughts/questions/struggles), not just name/area/status.
- Open questions resolved: (1) verify-then-test the agenda path — **verified: it does NOT surface body today** (see below); (2) read last-week + in-flight — yes; (3) daily `--day` reuse — yes; (4) aggregator **calls** existing assemblers, never duplicates.

---

## Verified finding — the agenda case John asked about is FAR OFF today

Test: the Mon "Jira Roadmap Sync" (w/ Dave) + "Snapsheet Tasks" meetings. The content John wants surfaced (his Notion-vs-Jira decision, roadmap Key/Open Questions, capacity struggles) **exists** in `projects/active/glance-2-roadmap/` (README body + `working/` drafts) and `projects/active/task-management-v1/`, and both meetings infer area `glance-operations` — so the linkage would connect. **But the agenda path surfaces none of it:**

- `assembleBriefForMeeting` renders projects as **metadata bullets only** (name/area/status); README body never parsed (`brief-assemblers.ts:2213-2216, 2174-2187`).
- `assembleAgendaScaffold` never routes those project bullets into agenda candidates (`agenda-scaffold.ts:160-195, 386-397`) — they sit inert.
- `retrieveWiki` searches **only** `.arete/memory/topics/*.md` (`brief-assemblers.ts:561-643`); John has **no** jira/roadmap topic pages. So wiki surfaces nothing relevant.
- The only body-reading path, `assembleBriefForProject`, reads **only Background + Status Updates** (`:1397-1404`), not Key/Open Questions or `working/` — and the agenda flow never calls it.

So today's Dave agenda = attendees + recent meetings + commitments, maybe a bullet *naming* the project. Zero of the prep substance. Full evidence in `discovery-2026-06-14.md`.

**Provenance tension (load-bearing):** the highest-value prep content lives in `working/` drafts — but v0.16.0 provenance *down-ranks* `working/`. For plan/agenda prep that ranking is backwards. The aggregator must treat `working/` as first-class for "what am I actively wrestling with" (do not inherit the draft sink for this use case).

---

## Current state (what's wired vs. not)

The plumbing you shipped (project search provenance, topic wiki, brief aggregator) is real and rich — but **none of it feeds the planning judgment**. Both skills *declare* the `context_injection` capability; neither uses it for projects/topics.

**week-plan** (`packages/runtime/skills/week-plan/SKILL.md`)
- Gather step *lists* projects and topics: `ls projects/active/` "read each README briefly" (`:142-144`); `arete topic list --active --slugs --json` (`:160-161`).
- But the **reasoning** steps ignore both: priority logic (`:164-181`) weighs only carryovers, goal traction, theme momentum, commitments, calendar pressure; task draft (`:254-267`) derives from commitments + carryovers + calendar prep. **No project status, no topic narrative.**
- Never calls `arete search`. The v0.16.0 provenance work is unused here.

**daily-plan** (`packages/runtime/skills/daily-plan/SKILL.md`)
- Reads `now/week.md`, `now/scratchpad.md`, calendar, commitments (`:120-123`).
- One context move: `contextual_memory_search` → `arete search "<term>" --scope memory --limit 2` per prep-worthy meeting (`:220-227`); area-slug extraction via `getAreaForMeeting()` (`:131`).
- **No projects, no topic pages, no project topics cache.**

**agenda flow** (`daily-plan/SKILL.md:242-249` → `prepare-meeting-agenda/SKILL.md:70-96`)
- daily-plan offers agendas **once per meeting** (`:242-249`), invoking `prepare-meeting-agenda` per accepted meeting (anti-degradation rule keeps batch quality up, `prepare-meeting-agenda/SKILL.md:98-106`).
- prepare-meeting-agenda gathers via `arete agenda scaffold --meeting "<title>"`, which wraps `assembleBriefForMeeting()` + person-file 1:1 signals.
- **Important nuance (verified):** `assembleBriefForMeeting()` already pulls *"Top 2 active projects filtered by area (explicit or inferred)"* and related wiki via `retrieveWiki()` (`packages/core/src/services/brief-assemblers.ts`). So **agendas already receive area-inferred project + wiki context** through the scaffold→brief path. `agenda scaffold` also already accepts `--project <slug>` (passthrough to `projectOverride`), but daily-plan never passes it.

So flow 3 is **smaller than it looks**: the path exists; the gaps are (a) confirming project/wiki candidates actually surface in agenda *sections* (not just the brief), and (b) letting daily-plan pin the right project when area-inference is wrong/ambiguous.

---

## Available plumbing (building blocks already exist)

| Verb | Returns | Use for |
|---|---|---|
| `arete search --scope projects\|topics\|all --json` | ranked chunks w/ `provenance` (published/reference/draft) | broad semantic recall; **snippets, not structured state** |
| `arete brief --project <slug> --json` | typed project brief (area, status, wiki) | structured project context |
| `arete brief --area <slug> --json` | typed area brief | area-scoped context |
| `arete project open <name> --json` | read-only brief + **`whatsNew`** (new meetings/topics/commitments since last touched) | "what changed in this project" |
| `arete topic find <query> --area --budget --json` | top-k topic pages, word-budgeted | inject topic narrative |
| `arete topic list --active --slugs --json` | active topic universe | bias / candidate set |
| `arete agenda scaffold --meeting --project` | source-tagged agenda skeleton | already in agenda flow |

Implementations: `packages/cli/src/commands/{search,project,topic,agenda,intelligence}.ts`; `packages/core/src/services/brief-assemblers.ts`; provenance in `packages/cli/src/lib/provenance.ts`.

**Key takeaway (corrected by review):** the aggregator *layer* is composition of existing assemblers; the **traverse+select capability it depends on is net-new service code** (`selectProjectDocs`). No new *retrieval/embedding* logic — selection is deterministic + lexical (see WS-1).

---

## Mechanism (decided — Option B, lightweight, composing)

`arete plan-context` — one typed aggregator that **calls** the existing verbs and returns a single pre-seeded, `[source]`-tagged bundle. The skill **curates + frames**; the verb **gathers deterministically** — the proven `agenda scaffold` pattern. Decided over "reuse search from skill prose" because planners need **structured project state** (status / blocked / what's-new / open questions), not search snippets, and pushing N calls + dedup/rank/budget into SKILL.md recreates the exact degradation the agenda anti-degradation rule fights (`prepare-meeting-agenda/SKILL.md:98-106`).

**Hard constraint (John): compose, don't duplicate** — but be honest about what's composition vs. net-new (eng-lead CR-1). Two layers:
- **Composition (true):** the *aggregator* `arete plan-context` calls `assembleBriefForProject`, `assembleProjectWhatsNew`, `retrieveWiki`, `topic find` via `IntelligenceService`. Thin orchestrator + budgeting + `[source]`-tagging. No objection.
- **Net-new (NOT composable):** traverse-the-project-dir + select-the-relevant-doc + tiered expand/list. **Nothing in `brief-assemblers.ts` reads beyond `README.md`** (`ActiveProject` has one body field, `readmeContent`). This is a new pure method on the project-read service (`selectProjectDocs`, pinned below), and `assembleBriefForProject` is currently **2-arg with no options** (`intelligence.ts:438-450`) — adding budget/selection is a signature change threaded core→CLI, not additive composition. Do not let "mostly composition" tempt a second body parser bolted onto `plan-context` — that's the exact duplication the constraint forbids.

Modes:
- `--week` — all active projects (recency/area-ranked), area-active topics, goal crosswalk, last-week plan + carryover/commitment join.
- `--day` — same, scoped to today's areas (areas-of-today).

**Body-content requirement (new):** the bundle MUST surface project **body** — Key Questions, Open Questions, and `working/` notes — not just Background+Status. This is the gap that makes the Dave agenda useless today. Either extend `assembleBriefForProject` to emit these sections (preferred — single body-reader) or have `plan-context` read them; do NOT add a second body parser if the brief path can grow the sections.

Sequencing (value early, aggregator shape informed by real use):
- **Phase 1 — WS-1 agenda body (smallest, highest felt-pain).** Make project body reach the agenda. Verified the pipe is broken end-to-end, so this is real work, not just a passthrough.
- **Phase 2 — WS-2 week-plan** (the aggregator + reasoning wiring).
- **Phase 3 — WS-3 daily-plan ideas** (`--day` reuse) and **WS-4 daily-plan fidelity**.

Optional **Phase 0 spike**: hand-assemble the bundle for one real week-plan / Dave-agenda run (read the glance-2-roadmap body by hand) to confirm the context improves the output before committing the verb. Recommended — cheap insurance.

---

## Layering principle: aggregator (in-flight) vs. wiki (finalized)

The spike's "wiki noise 4/4" finding resolves a standing design question (when does an open project earn a wiki page?): **it doesn't, while it's in-flight.**

- **Wiki / topic pages = stable, cross-cutting, finalized, supersession-resolved knowledge.** Promoting an open project early is exactly what creates the hard problem in [`project-wiki-sync`](../project-wiki-sync) / published-doc-sync — continuous supersession of contradicted decisions as the project churns.
- **`plan-context` aggregator = live computed view over in-flight project docs** (README/outputs/working). No promotion, no copy, no supersession — reads source-of-truth directly, always current by construction.
- **Resolution:** wiki = **finalized**; aggregator covers the **in-flight "I need it now"** need. You stop paying the supersession tax for moving work and only pay it once, when a project *stabilizes*.
- **Reuse / on-ramp:** the aggregator's distilled bundle is the natural **input to wiki promotion at finalization** — a project close-out consumes the same traverse+select+distill output and promotes it to a topic page (supersession handled then, once). The aggregator is the wiki's on-ramp, not its competitor. This is the cross-cutting reuse John flagged; track against published-doc-sync.

---

## Workstreams

### WS-1 — Agenda gets the right project DOCUMENT (Phase 1)
**Goal:** the Dave "Jira Roadmap Sync" agenda surfaces the Notion-vs-Jira decision + roadmap concerns; the Snapsheet agenda surfaces task-v1 open questions. **Validated by the Phase-0 spike** (see `discovery-2026-06-14.md` §E) — these are achievable and high-value.
- **The resolver must traverse the project and SELECT, not read README.** Spike finding: the payload was never the README — it was `outputs/` syntheses, a project-root narrative doc, or the last meeting instance, varying per project. So WS-1 reads across `README + root docs + outputs/ + working/` and picks the relevant doc(s) for the meeting topic. Today the chain is broken end-to-end: `assembleBriefForMeeting` emits project metadata bullets only (`brief-assemblers.ts:2213-2216`); scaffold never routes them (`agenda-scaffold.ts:160-195, 386-397`).
- **`outputs/` is a SIGNAL, not a GATE.** Newer projects may be README + `working/` only (no `outputs/`). Selection heuristic: (1) relevance to meeting/plan topic, (2) recency, (3) `outputs/` as a tie-breaker boost — then fall through to root docs / `working/` / README. Never require `outputs/` to exist.
- **Build traverse+select in the shared project-read SERVICE, not in `plan-context`.** The aggregator (a CLI command) composes the project-read engine behind `arete project open` / `assembleBriefForProject` (the same engine `/project` the skill sits on) — it does NOT call the `/project` skill. That engine today reads only README Background+Status + `whatsNew`; traverse+select is net-new and belongs IN the engine so `/project`, `arete brief --project`, agendas, and `plan-context` all inherit it (one body-reader, no drift).
- **Default project-read shape (tiered expand vs. list):**
  - **Expand:** `README.md`; any root markdown (`/<slug>/*.md`); `outputs/` — but **budget `outputs/`** (recent/relevant expanded, overflow listed) so mature projects don't blow the token budget. Generic `/project` read can be generous; the aggregator tightens the budget per meeting/plan.
  - **List, don't expand:** `working/` + `inputs/` — with **title / first-heading per file**, not bare filenames, so the reader can select. Expand on demand by relevance.
  - This tiers stable-vs-volatile (curated layer expanded; churny drafts as an opt-in index) and resolves "when to dig into `working/`": **always listed → expanded on demand**, never dumped, never guessed.
- **Deterministic project resolution** — the agent will NOT proactively dig (spike #4). `plan-context`/scaffold must resolve the project from the meeting (area→project, `:2174-2187`) and pull it; daily-plan passes `--project <slug>` to override; surface the chosen project + the specific doc(s) opened in the per-meeting display (auditable).
- **Demote wiki.** `retrieveWiki` candidates were noise 4/4 in the spike — do not lead the agenda with topic-wiki pages; project documents are the signal. Keep wiki as a low-weight, gated extra. **Why wiki was noise = the layering principle below**, not a wiki defect: in-flight project knowledge isn't (and shouldn't be) in the wiki yet.
- **Recurring-meeting template fix** (spike #5): template a recurring meeting off its **own last instance** in `resources/meetings/`, not a generic attendee-count type (the team bi-weekly got a wrong 1:1 template).
- **NAMED DELIVERABLE — scaffold candidate extractor (CR-3, highest silent-miss risk):** growing the brief body does NOTHING unless a new extractor reaches `sections[].candidates[]`. Add a `project-doc` candidate extractor + heading regex + routing case to `agenda-scaffold.ts` (`:155-195, 362-398`, the candidate extraction is heading-regex based). Without this, WS-1's own AC fails silently — the project section sits inert exactly as today.

#### WS-1 interface contract (pinned — WS-2/WS-3 consume this; do not redesign mid-build) (CR-2)
New **pure, no-LLM** function in `brief-assemblers.ts`, surfaced via `IntelligenceService`. Returns a *descriptor*, not rendered markdown (rendering stays in CLI/formatters per both PROFILEs). Traversal uses `StorageAdapter.list/getModified` only — never `fs`.
```ts
export interface ProjectDocSelection {
  expanded: Array<{ rel: string; heading: string; body: string; provenance: 'published'|'reference'|'draft'; score: number }>;
  listed:   Array<{ rel: string; title: string; firstHeading?: string; provenance: 'published'|'reference'|'draft' }>;
  budgetChars: number; usedChars: number; truncated: boolean;
}
export interface SelectProjectDocsOptions {
  topic?: string;          // meeting/plan title — selection query (LEXICAL only)
  budgetChars: number;     // hard cap on expanded bytes; caller sets per use (generic /project ~12k; plan-context per-meeting ~3-4k)
  expandWorking?: boolean; // default false: working/ listed not expanded
  maxExpanded?: number;    // default ~3
  locationBoost?: boolean; // caller opts in to working/-boost; generic /project may not (CR-8, provenance inversion is caller-controlled)
}
export async function selectProjectDocs(slug, paths, deps, opts): Promise<ProjectDocSelection>;
```
`assembleBriefForProject` *optionally* calls `selectProjectDocs` behind a new opts flag to enrich its "Project context" section — so `/project` and `arete brief --project` inherit it; the agenda path gets it via the meeting brief + the new scaffold extractor. **Do NOT widen `assembleBriefForProject`'s existing return shape** (it backs the typed brief and ripples into `brief-formatters.ts`).

#### WS-1 selection algorithm (deterministic + lexical — NO embeddings/LLM) (CR-4)
"Relevance to topic" must NOT smuggle in an embedding call (breaks the defended `brief-no-llm` invariant + cost discipline). Reuse existing primitives (`search/tokenize.ts`, `jaccardSimilarity` already used at `brief-assemblers.ts:615`):
```
for each candidate doc d in {README.md, root *.md, outputs/*, working/*, inputs/*.md}:
  relevance     = jaccard(tokenize(opts.topic), tokenize(title ∪ firstHeading ∪ first N chars body))
  recencyScore  = clamp(1 - ageDays/RECENCY_HALFLIFE(~30d), 0, 1)     // getModified, injected referenceDate for tests
  locationBoost = opts.locationBoost ? (outputs:+0.15 | root:+0.10 | working:+0.05) : 0
  score = 0.55*relevance + 0.30*recencyScore + locationBoost
sort desc; tie-break: locationBoost → mtime → lexical rel path (stable/deterministic)
```
- **Budget:** expand top docs by score until next would exceed `budgetChars`; the overflowing doc is **demoted to `listed`** (not truncated mid-doc); set `truncated:true`.
- **Zero-result safety ("pick wrong > pick none"):** never return empty `expanded` when ≥1 doc exists — if all scores below floor, fall back to most-recent root-or-README doc. Always surface chosen `rel` + `score` in output so a wrong pick is visible/overridable.

#### WS-1 Acceptance Criteria (rubric-passing — CR-9)
- **AC1.1** `selectProjectDocs(slug, paths, deps, {topic, budgetChars})` returns a `ProjectDocSelection` whose `expanded[]` includes ≥1 doc from `{README.md, root *.md, outputs/*}` when any exists, and `listed[]` contains every `working/*` and `inputs/*.md` file with a non-empty `title`, for a fixture project with one root doc + two working files.
- **AC1.2** For a fixture project with **no `outputs/` dir**, `selectProjectDocs` returns without error and selects the highest-scoring root doc (outputs/ is not a gate).
- **AC1.3** Given `budgetChars=2000` and a 5000-char fixture root doc, that doc appears in `listed[]` (not `expanded[]`), `truncated===true`, and no `expanded` body is cut mid-content.
- **AC1.4** Deterministic: two calls with identical inputs + same injected `referenceDate` return byte-identical ordering; ties break locationBoost → mtime → lexical rel path.
- **AC1.5** `assembleAgendaScaffold` routes the project-document section into `sections[].candidates[]` with `source:'project-doc'`; an agenda whose resolved project has a selected doc yields ≥1 such candidate (asserted on the scaffold object, not stdout).
- **AC1.6** The chosen doc's relative path and score appear in `plan-context`/scaffold `--json` output (audit).
- **AC1.7 (invariant)** `brief-no-llm.test.ts` passes unchanged — `selectProjectDocs` and any modified brief path make no `AIService`/`callLLM`/embedding call (lexical jaccard + mtime only).
- **AC1.8 (recurring template)** A fixture recurring meeting with a prior instance in `resources/meetings/` produces a scaffold whose template derives from that instance, not a 1:1 default (assert `templateType !== '1on1'`).
- **AC1.9 (spike-vs-post-build, MANUAL release gate — not CI)** `arete agenda scaffold --meeting "Jira Roadmap Sync" --json` run with `cwd=~/code/arete-reserv` (READ-ONLY) surfaces ≥1 candidate sourced from `glance-2-roadmap/glance-1.5-roadmap.md` containing a roadmap concern (capacity / parity / slice-zero / Notion-vs-Jira) **without a human naming the file**; operator compares to the Phase-0 hand-assembled bundle. See Testing Strategy.

### WS-2 — week-plan priorities (Phase 2)
**Goal:** last-week plan + in-flight project state shape suggested priorities AND the task draft (close the "slips at the detail/task level" gap).
- Build `arete plan-context --week --json` (composing, per above): active projects w/ status + `whatsNew` + open-questions + topics; area-active topic snippets; goal crosswalk; **last week's `now/week.md` + carryover/commitment join**.
- Wire into week-plan gather (replace the inert `ls`/`topic list` lines `:142-161`); extend priority logic (`:164-181`) and task draft (`:254-267`) to weigh project momentum/blockers/in-flight work and surface stalled-but-important projects with concrete next tasks.
- **Ship-time: add the read-before-asserting norm to AGENTS.md** (only once `arete plan-context` exists — don't document a non-existent verb): "When work touches a project other than the one in focus and you need its current state, read it via the project-read service (`arete project open` / `arete plan-context --project`) rather than memory or wiki — those lag in-flight work. Don't pull for incidental mentions." In free-form chat this is agent JUDGMENT (no deterministic trigger → no hook); the norm makes the aggregator the canonical current-state source over stale memory/wiki. `arete project open` exists today, so a lighter version could land before the full verb.
- **Multi-project meetings (CR-8):** brief takes top-2 projects by area (`.slice(0,2)`). Run selection per resolved project, **share the budget** across them, tag each candidate with its project slug. No-area meetings resolve zero projects → traverse never fires; `--project` is the escape hatch (state as precondition).

#### WS-2 Acceptance Criteria (CR-9)
- **AC2.1** `arete plan-context --week --json` returns `{projects[], topics[], goals[], lastWeek, generatedAt}`; each `projects[]` entry carries `{slug, status, whatsNew, selectedDocs[], openQuestions[], source}`. Shape is snapshot-tested (skill-consumer contract — CR-8).
- **AC2.2** For a fixture workspace with one `status: blocked` project having ≥1 open commitment, that project appears in `projects[]` with its status and ≥1 open item, source-tagged.
- **AC2.3** `--week` includes prior `now/week.md` content under `lastWeek` when the file exists, and `lastWeek:null` when absent (no error).
- **AC2.4** A project unedited >14 days but `status: active` with open work still appears in `projects[]` (quiet-but-important not dropped).
- **AC2.5 (doc-only)** AGENTS.md contains the read-before-asserting norm referencing `arete plan-context --project` / `arete project open`, added only in this workstream.

### WS-3 — daily-plan ideas (Phase 3)
**Goal:** today's focus is informed by project/topic state, not just memory + calendar.
- Add `--day` mode (areas-of-today) to the WS-2 aggregator; wire into daily-plan gather alongside the existing `contextual_memory_search`.

#### WS-3 Acceptance Criteria (CR-9)
- **AC3.1** `arete plan-context --day --json` returns the same schema as `--week` but `projects[]` is filtered to projects whose area is in today's areas; given a fixture with 3 projects across 2 areas and a calendar touching 1 area, only that area's projects appear.
- **AC3.2** `--day` with no project-bearing area today returns `projects:[]` (not an error) with a populated `generatedAt`.

### WS-5 — context cache — DEFERRED (CR-6), design note only
**Status: DEFERRED — do NOT build in this ship.** The eng-lead review found the selection algorithm is deliberately deterministic + LLM-free (lexical jaccard + mtime), so there is **no generation-token cost being paid** for the cache to avoid — it would only save embedding/IO latency, which isn't a measured problem yet. Building it now caches a fast computation for no real win. **Revisit only when (a) a measured latency problem exists, or (b) a future workstream adds LLM distillation of project bodies** (the only thing that makes per-project caching pay in tokens). If revisited, scope to caching `topic find` retrieval first. Design below preserved for that future.

**Goal (future):** when several meetings/plans in one session pull the same project/area, distill it once.
- **Cache the per-project/area distilled bundle, NOT the per-meeting brief.** Meetings are unique (attendees, recent meetings) → low hit rate; the *project component* is the shared, reusable unit, and it's exactly what `plan-context` produces. Cache key = `plan-context:<project|area slug>`.
- **Must be disk-backed** (`.arete/cache/...`, gitignored): `prepare-meeting-agenda` runs N times = N separate CLI processes; in-process memory caching buys nothing across invocations. House precedent: `gmail-sent-cache.ts`, project-topics frontmatter cache.
- **Bounded by construction — key the file by SLUG, not by hash.** One file per project: `.arete/cache/plan-context/<slug>.json`, content-hash stored *inside*. On read: if stored hash ≠ current hash (or TTL ceiling passed) → recompute + **overwrite in place**. Cache size is bounded by # active projects; old hashes never accumulate. (Keying by hash-in-filename would accumulate — don't.) Cheap prune on write: drop `plan-context/*.json` whose project no longer exists (archived). No sweeper/LRU needed.
- **Invalidate by MAX-MTIME across the project dir, hash only as tiebreak (CR-7).** Hashing a 26k+ root doc on every read defeats the latency goal the cache exists for. Use `getModified` max across the dir as the cheap invalidation key (matches `ProjectWhatsNew` mtime approach, `brief-assemblers.ts:1612`); generous TTL ceiling (~1h) as backstop. (No existing hash-invalidation precedent in the cache layer — `gmail-sent-cache.ts` is date-keyed/version-validated, not hashed; don't assume copy-paste.)
- **Concurrency (CR-8):** N parallel CLI processes may recompute+overwrite `<slug>.json`. `StorageAdapter.write` is atomic (last-writer-wins, safe for one file); the prune-archived-slugs step must be idempotent unlink (ignore ENOENT).

#### WS-5 Acceptance Criteria (if/when un-deferred)
- **AC5.1** writes `.arete/cache/plan-context/<slug>.json` with bundle + max-mtime invalidation key.
- **AC5.2** second call with no file changes reads cache (no recompute); after touching any project file the next call recomputes + overwrites in place.
- **AC5.3** exactly one file per active project; a run after a project is archived removes its stale `<slug>.json` (idempotent, no error if gone).
- **AC5.4** concurrent invocations for the same slug never leave a partial/corrupt file (atomic write).
- **Honest scope of the win:** `arete brief`/`scaffold` make **no LLM generation calls** today (deterministic assembly + embedding retrieval — verified, `brief-assemblers.ts` has no generate calls). So caching the *current* brief saves latency + embedding cost, not generation tokens. The real **token** win lands only once the aggregator does LLM distillation of project bodies (the #2 candidate-synthesis decision) — then caching avoids re-distilling shared projects across meetings. The per-agenda synthesis itself is per-meeting and irreducible — not cacheable.

### WS-4 — week-plan invokes daily-plan at full fidelity (Phase 3)
**Goal:** stop the corner-cutting observed when week-plan calls daily-plan (reused context instead of per-meeting `get_meeting_context` + `--scope memory`; skipped agenda offers; partial `@due` tagging — see `discovery-2026-06-14.md` §D).
- Define the week-plan→daily-plan **invocation contract**: daily-plan runs its full step sequence (4/4.5 per-meeting context + memory search, 5 agenda offers, 3.6 `@due` tagging) even when called from week-plan; shared context may be *passed in* but must not *replace* required steps.
- Decide the `@due` rule for multi-day deadlines (the agent's instinct to preserve real Tue deadlines vs. the spec's "tag all selected with plan date" was arguably right — reconcile the spec).

#### WS-4 Acceptance Criteria (CR-9)
- **AC4.1** When daily-plan is invoked from week-plan, the daily-plan run executes per-meeting `arete search --scope memory` for each prep-worthy meeting — verified by the invocation contract documented in `daily-plan/SKILL.md` requiring it even with passed-in context.
- **AC4.2** A multi-day-deadline commitment retains its real due date after a week-plan-triggered daily-plan run (reconciled `@due` rule: real deadline preserved, not overwritten with plan date).
- **Note:** WS-4 is SKILL.md (markdown/doc) work — rubric documentation-only exception applies (content accuracy, not unit tests).

---

## Risks / open questions
- **Does context actually improve plans?** The core bet. Mitigate with the Phase-0 spike before building the verb.
- **Provenance inversion (downgraded by spike).** Originally flagged `working/` as the buried value. Spike §E showed the winners were `outputs/` (already `published`/high-rank) + root docs; `working/` wasn't a primary earner. So the inversion is secondary to traverse-and-select. Still don't *exclude* `working/` (some projects' value lives only there), but don't re-architect ranking around it.
- **Doc selection is the hard part (new, load-bearing).** Per spike, the relevant doc varies (outputs/ synthesis vs. root narrative vs. last meeting instance). The resolver needs a selection heuristic (recency + outputs/-preference + topic match) and a budget — picking the wrong doc is worse than picking none. This is WS-1's core risk.
- **Cost/latency.** `topic find` + per-project body reads are retrieval/LLM calls. Budget hard: top-N projects by recency/area, word-budgeted snippets — mirror `agenda scaffold`'s `--max-per-section`.
- **Body parser singularity.** Surface Key/Open Questions via the existing `assembleBriefForProject` body-reader (grow its section set) rather than a second parser, or the two drift.
- **WS-4 is not context injection** but shares the planning surface and John flagged it explicitly — keep it scoped so it doesn't block WS-1/2.
- **AC vs. spike evidence are different classes (CR-5).** Automated ACs run against committed temp-dir fixtures (the `brief-project.test.ts` `mkdtempSync` + `FileStorageAdapter` pattern). The arete-reserv comparison (AC1.9) is a **manual, READ-ONLY release gate** — arete-reserv is mutable, external, absent in CI, and off-limits for writes. Never conflate them.
- **Scaffold extractor gap (CR-3, highest silent-miss):** restated as a named WS-1 deliverable — without the new `project-doc` extractor, growing the brief body changes nothing and WS-1's AC fails silently.
- **`--json` schema is a consumer contract (CR-8):** week-plan/daily-plan SKILL.md prose will parse `plan-context --json`. Freeze + snapshot-test the shape; drift silently breaks skills.
- **Empty/malformed project dirs (CR-8):** README-only project; frontmatter-only/empty working files; non-`.md` in `inputs/` (filter via `list({extensions:['.md']})`). Must degrade gracefully, never throw.

---

## Testing strategy (CR-9)

**Conventions (verified):** core tests in `packages/core/test/services/*.test.ts` using `node:test` + `node:assert/strict` with **real temp-dir fixtures via `mkdtempSync` + `FileStorageAdapter`** (per `brief-project.test.ts`), NOT in-memory mocks. CLI tests in `packages/cli/test/`. Inject `referenceDate` for recency determinism.

- **WS-1 unit — `packages/core/test/services/project-doc-selection.test.ts` (new):** fixture permutations — README-only; README+2 root+1 working; outputs present vs absent; oversized root (budget); empty/frontmatter-only working; non-`.md` input. Covers AC1.1–1.4.
- **WS-1 unit — extend `agenda-scaffold.test.ts`:** feed a `MeetingBrief` with a project-doc-bearing section; assert a `source:'project-doc'` candidate lands in `sections[].candidates[]` (AC1.5). Add recurring-template fixture (AC1.8).
- **WS-1 invariant — `brief-no-llm.test.ts`:** runs unchanged; its structural grep guard auto-covers the new `brief-assemblers.ts` symbols (AC1.7). Keep green.
- **WS-1 integration — `packages/cli/test/integration/agenda-project-doc.test.ts` (new):** temp workspace mirroring the glance case (area-inferring meeting + project w/ roadmap root doc); assert ≥1 project-doc candidate. **Automated stand-in for AC1.9 — must NOT touch arete-reserv.**
- **Spike-comparison harness (AC1.9, manual gate):** `dev/work/plans/plan-context-injection/spike-compare.sh` runs `arete agenda scaffold --meeting "Jira Roadmap Sync" --json` with `cwd=~/code/arete-reserv`, **read-only** (no `--apply`, `--skip-qmd`, no index write), diffs JSON against the Phase-0 hand-assembled bundle, prints which roadmap concerns surfaced. **Safety: run against a `cp -r` snapshot of arete-reserv (or assert zero writes)** so the live workspace is never mutated. Out of CI; operator runs once pre-merge; result pasted into the plan/diary as evidence.
- **WS-2/3 — `packages/cli/test/integration/plan-context.test.ts` (new):** temp workspace (week.md, projects across areas, a blocked project); assert `--json` schema via frozen snapshot (AC2.1, AC3.1) + filtering/presence ACs.
- **WS-5 — deferred; tests deferred with it.**

---

## Build order (PRD task sequence)
1. **WS-1** — `selectProjectDocs` service (pinned contract + deterministic algorithm) → scaffold `project-doc` extractor → wire into meeting brief/agenda path. Smallest shippable slice; the engine WS-2/3 reuse.
2. **WS-2** — `arete plan-context --week` aggregator (composes service) + week-plan SKILL.md wiring + AGENTS.md norm.
3. **WS-3** — `--day` mode + daily-plan SKILL.md wiring.
4. **WS-4** — week→daily fidelity (SKILL.md doc work; independent; last).
5. **WS-5** — DEFERRED (not in this ship).

`selectProjectDocs`'s signature (WS-1) is the contract WS-2/WS-3 consume — freeze it first so the build doesn't redesign mid-stream.

## Status
**APPROVED** (eng-lead review incorporated, 9 CRs). Pre-mortem next (ship Phase 1.2), then PRD → worktree → autonomous build. Merge gate held for John's morning review (do not auto-merge; approve only after the AC1.9 spike-comparison passes).
