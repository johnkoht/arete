# Discovery evidence — 2026-06-14

Grounding for `plan.md`. Two investigations: (A) live workspace `~/code/arete-reserv`, (B) product code paths. Read-only.

## A. The content John wants surfaced EXISTS (arete-reserv)

Test case: Mon meetings "Jira Roadmap Sync" (w/ Dave) and "Snapsheet Tasks" kickoff. John's roadmap thoughts/questions/struggles live in:

- `projects/active/glance-2-roadmap/README.md` — **Key Questions** ("What does 'off Snapsheet' actually mean for POP?", "minimum feature set for POP to operate daily"), **Open Questions & Risks** (parity-vs-better per-feature decisions, financials timing dependency, dual-write coverage complexity, MultiAgent readiness). Frontmatter: status active, area `glance-operations`.
- `projects/active/glance-2-roadmap/working/2026-06-12_roadmap-structure-model.md` — **the exact Notion-vs-Jira tooling decision for Dave**: stand up company-managed "Glance Operations" space, retire JPD as a layer, value-slice epics under one initiative PLAT-11590, board view for Now/Next/Done.
- `projects/active/glance-2-roadmap/working/2026-06-10_roadmap-reconciliation-redline.md` — John's struggle notes: reassignment scope split, Task-v1 boundary pinning, capacity signal (front-end-heavy, open ask for 3 dedicated Glance eng).
- `projects/active/task-management-v1/README.md` — Snapsheet Tasks epic (PLAT-11410); Status Updates capture the real-time sync latency constraint (15-min poll too slow for inbound; needs WebSockets/faster poll).

Area linkage: both meetings infer area `glance-operations` (`areas/glance-operations.md`, renamed from `glance-2-mvp` 2026-06-11); `areas/glance-jira-map.md` is the canonical Jira/value-slice map. So area→project linkage would connect the Dave meeting to the roadmap project.

**No topic wiki pages** capture any of this — only `.arete/memory/topics/ml-roadmap.md` exists (unrelated). The exploratory thinking lives ONLY in project README bodies + `working/` drafts.

`now/week.md` priorities (wk of 6/15): P1 "Finalize the Glance 1.5 roadmap + surface with team" (settle Notion-vs-Jira w/ Dave Mon, critical path); P2 "Land the cross-functional team / Jira-workflow alignment."

## B. The agenda/brief path surfaces NONE of the body content (product code)

1. `assembleBriefForMeeting` — projects rendered as **metadata bullets only**: `**${p.name}** (area: …, status: …) — path` (`packages/core/src/services/brief-assemblers.ts:2213-2216`). `readmeContent` is loaded into the `ActiveProject` (`:1165`) but the body is **never parsed** in the meeting path. Filter: `projects.filter(p => p.area === area).slice(0, 2)` (`:2174-2187`).

2. `assembleAgendaScaffold` — candidates are extracted **only** from brief sections for commitments / recent-meetings / topics / wiki (`packages/core/src/services/agenda-scaffold.ts:160-195, 386-397`). The "Meeting area & projects" section (metadata bullets) is **never routed into `sections[].candidates[]`** — it stays inert in the brief envelope.

3. `retrieveWiki()` — searches **only** `.arete/memory/topics/` (`brief-assemblers.ts:561-643` → `topic-memory.ts:1756`, `paths: [TOPIC_PATH_PREFIX]`). Never returns project README body. Fallback path also topic-pages-only (Jaccard on slugs/aliases).

4. `assembleBriefForProject` (the typed `arete brief --project` path, `brief-assemblers.ts:1353-1578`) IS the only path that reads project body — but only **Background** (`:1397-1398`) and **Status Updates** (`:1399-1404`), capped ~4000 chars (`:1408`). NOT Key Questions, NOT Open Questions, NOT `working/` docs. And the agenda flow never calls it.

**Conclusion:** running `arete agenda scaffold --meeting "Jira Roadmap Sync"` today yields attendees + recent meetings + commitments touching Dave, at best a metadata bullet *naming* glance-2-roadmap. Zero roadmap questions/struggles; nothing from `working/`. The pipe to the body content does not exist.

## C. Provenance tension (load-bearing)

The highest-value prep content lives in `working/` drafts (e.g. the 6/12 structure model = the actual Dave decision). v0.16.0 provenance (`packages/cli/src/lib/provenance.ts`) **down-ranks `working/` (draft)** below published/reference. For *plan/agenda prep* this ranking is backwards — drafts are where in-flight thinking lives. The aggregator must NOT inherit the down-rank for the prep use case (or must treat `working/` as first-class for "what am I actively wrestling with").

## E. Phase-0 spike results (2026-06-14, run against arete-reserv, commit 14d2a1a)

Hand-simulated the aggregator across 4 real agendas (product bi-weekly, jira roadmap, snapsheet tasks, PoP claim walkthrough). Findings that revise the design:

1. **README is never the payload.** The doc that earned its place each time was a *sibling*: `resources/meetings/2026-06-01-...bi-weekly.md` (last instance); `glance-2-roadmap/glance-1.5-roadmap.md` (project ROOT, not README); `task-management-v1/outputs/2026-06-04-...md`; `adjuster-shadowing-discovery/outputs/synthesis-exec.md`. → WS-1 resolver must **traverse the project (README + root docs + outputs/ + working/) and SELECT** the relevant doc; a README read is insufficient. Winner location varies by project/meeting.
2. **Scaffold candidates were noise 4/4.** `retrieveWiki` candidates (rollout-strategy, product-management-tools, glance-adoption, snapsheet-migration, default-email-template) and recent-meeting dumps earned ZERO places. Topic-wiki retrieval as tuned is noise for prep (consistent with §A: almost no relevant topic pages exist). → **Demote "wiki" from the headline; the gap is "inject the right PROJECT DOCUMENT," not wiki.**
3. **Provenance inversion is lower-priority than §C claimed.** Winners were `outputs/` (provenance `published`, correctly high) + root docs. `working/` was NOT a primary earner in the spike. The inversion concern stands (some projects' value will live only in working/) but is secondary to traverse-and-select.
4. **Inference alone underperforms.** The one meeting given no project pointer (bi-weekly: "check open/recent projects") → agent "didn't check other active projects." Left loose, the agent does not proactively dig. → `plan-context` must own **deterministic project resolution**, not rely on the agent.
5. **Template inference bug.** Scaffold applied a 1:1 template (Feedback/Growth prompts) to a team meeting. Recurring meetings should template off their **own last instance** (what worked for the bi-weekly), not a generic attendee-count type.
6. **Format preference confirmed.** John kept agendas as lean skeletons (not the skill's time-boxed/themed format) and skipped step-5a self-check. Decision: skeleton *format* is the default; the substance self-check is a SEPARATE concern and should be retained in lightweight form.

## D. week-plan → daily-plan invocation infidelity (observed)

When week-plan invoked daily-plan, the agent self-reported cutting corners vs. the daily-plan spec:
- Steps 4/4.5: reused week-plan's already-assembled calendar/area context instead of re-running the full `get_meeting_context` + per-meeting `--scope memory` search.
- Step 5: skipped offering agendas for prep-worthy meetings.
- Step 3.6: only partial `@due` tagging.

I.e. week-plan calling daily-plan does not currently guarantee daily-plan runs at full fidelity. Separate from context injection, but in scope per John.
