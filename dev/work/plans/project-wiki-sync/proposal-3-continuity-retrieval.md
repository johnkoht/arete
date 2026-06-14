# Proposal 3 — Cross-Project Continuity & Retrieval

**Lane:** retrieval / scoping / surfacing. Sibling A owns ingestion/reconcile (getting published facts INTO topics/L2); sibling B owns publish lifecycle/verbs/triggers. This proposal assumes facts ARE in memory and asks: *how do they reliably reach attention at the right moment, and how does an archived project's accumulated knowledge flow forward into a future sibling project?*

---

## Problem

Two surfaces decide what a working user sees:

1. **Guide-mode boot** — `## Active Topics` injected into CLAUDE.md, GLOBAL and ungrounded in what the user is about to work on.
2. **Project open** — `assembleBriefForProject`, AREA-scoped, which is coarse: an area with 20 projects pulls *all* its topics, not the lineage of the specific feature.

John's pattern: projects are loose/temporary; ship → archive; months later spin a NEW related project ("new feature for status letters") that should inherit the prior thread. The unit that must carry that continuity is the **topic page** (durable), not the project (ephemeral workspace). Today neither surface reliably delivers the *specific* prior thread, and one of them (boot) has a recency filter that will actively *drop* a 6-month-old archived thread.

Three concrete failure modes fall out of the current code:

- **(F1) Boot is global + recency-gated.** Generic, and silently sheds anything old — exactly the archived-project case.
- **(F2) Project brief is area-coarse.** The relevant lineage drowns among sibling-project topics in the same area.
- **(F3) New-project bootstrap has no lineage signal.** The `topics:` cache is *computed from the project's own README text*, so on day one a thin README retrieves little, and there's nothing pointing at the predecessor's topics.

---

## Guide-boot surfacing

**Current behavior (verify):**
- `generateClaudeMd` emits `## Active Topics` only when `memory.activeTopics` is non-empty (`packages/core/src/generators/claude-md.ts:53-66`).
- `getActiveTopics` selects/sorts: filter = `openItems > 0 OR last_refreshed within recencyDays` (default 90); sort = `(openItems desc, lastRefreshed desc, slug asc)`; cap 25 (`packages/core/src/models/active-topics.ts:66-113`, constants `:46-47`, filter `:83`).
- The list is **global** — `loadMemorySummary` calls `getActiveTopics(topics, options.activeTopics)` over *all* topics with no area/project filter (`packages/core/src/services/memory-summary-loader.ts:32-39`).

**Sharp finding — the `openItems` half of the filter is dead at boot.** `getActiveTopics` only weights/keeps open-item topics when an `openItemsBySlug` map is passed (`active-topics.ts:43`, `:79`). Every live boot caller invokes `loadMemorySummary` WITHOUT populating it (`update.ts:71`, `intelligence.ts:519`; the meeting.ts:1298 call only sets `limit`). So in production the filter collapses to **recency-only** and the sort's primary key is constant-0. The "OR has open items" escape hatch that was supposed to keep an active-but-stale thread visible **does not fire at boot today.** This makes the recency-window hazard (below) materially worse than the design intends.

**Recommendation: keep boot global, add an OPTIONAL context-aware re-weight; do NOT make it context-*exclusive*.**

- Guide sessions frequently start before the user has named an area/project, so a hard context filter would blank the list. Global-default is correct.
- When the harness *does* know the working context (the user opened from a project dir, or named an area), pass it down and apply a **bonus**, not a filter: boost entries whose `area` matches the working area, and entries in the working project's `topics:` cache, so they sort to the top of the same 25. This is a small additive change to the existing sort in `getActiveTopics` (add an optional `boostArea?: string` / `boostSlugs?: Set<string>` to `GetActiveTopicsOptions` and add a bonus term ahead of the `lastRefreshed` tiebreak). No new machinery.
- **Independently, wire `openItemsBySlug` for real** so the open-item escape hatch actually works — this is the cheap fix that also addresses the recency hazard for *active* archived-area threads.

---

## Archived-project reachability (incl. the recency-window hazard)

**The hazard is real and it is the headline risk.** Walk the path for "6 months later":

- The continuity carrier is the **topic page**, not the project. Archiving a *project* (`finalize-project` moves the dir to `projects/archive/YYYY-MM_<slug>/`, per `resolveArchivedProjectReadme`, `brief-assemblers.ts:1334-1351`) does **not** touch the topic pages the project fed. Good — that's the design working: topics outlive projects.
- BUT the topic page keeps accumulating only while there's ingest activity on it. Once the project ships and meetings stop, `last_refreshed` freezes. Six months later that page is ~180 days old.
- **At boot:** `getActiveTopics` recency filter (90 days, `active-topics.ts:47`, `:83`) **excludes it outright** — and because `openItemsBySlug` is unwired (above), there's no rescue even if the topic still has open work. The thread is silently invisible at the exact moment a sibling project is being conceived.
- **At project open:** `retrieveRelevant` does NOT recency-filter — it recency-*biases* (`+0.2 ≤30d`, `+0.1 ≤90d`, else +0; `topic-memory.ts:1804-1806`). So an old-but-relevant page can still be retrieved, just ranked lower. This surface is the safe one; boot is the dangerous one.

**Recommendations:**

1. **Recency window must respect topic `status`, not just age.** The status enum already has `active | stable | blocked | stale | archived` (`packages/core/src/models/topic-page.ts:17-23`). A `stable`/`active` page that's gone quiet is durable knowledge, not stale noise. Change the boot filter from "age ≤ 90d" to "age ≤ 90d **OR status ∈ {active, stable, blocked}**". Only `stale`/`archived` topics get age-gated out. This is a one-line predicate change at `active-topics.ts:83` plus threading `status` (already on `ActiveTopicEntry`, `:21`). Small change.
2. **Topic status, not project status, governs visibility.** Archiving a project should NOT archive its topics. A topic goes `archived` only when *its subject* is truly dead — that's a memory-refresh/reconcile decision (sibling A's lane), not a side effect of `finalize-project`. Flag this as a cross-lane contract: **finalize-project must not cascade-archive topics.**
3. **Don't rely on boot alone for the 6-months-later case.** The reliable reach is the *project-open brief* of the NEW sibling project (next sections), because retrieval there is bias-not-filter. Boot is the ambient reminder; the brief is the deliberate pull.

---

## Scope unit: area vs topic-family vs lineage

This is the central design call. Three candidates:

- **Area** — what the project brief uses today (`assembleBriefForProject` keys meetings `:1423`, decisions/learnings `:1473-1481`, commitments `:1448`, wiki `:1501` off `project.area`). Coarse: 20 projects in one area share one bucket.
- **Topic-family / topic-cache** — the `topics:` frontmatter cache (computed by `project-topics.ts`, score-floored at 0.35, cap 5). Narrows area → the handful of topics this project actually touches.
- **Explicit project-lineage edge** — a `continues: <prior-slug>` link declaring "this project is the descendant of that one."

**Recommendation: AREA (filter) + TOPIC-CACHE (rank/boost) is the right primary scope. Do NOT build a lineage edge as a first-class scope dimension — make it an optional bootstrap *hint*, nothing more.**

Reasoning:
- **The topic IS the lineage.** Two sibling projects months apart in the same area, both about "status letters," will retrieve the *same topic pages* via the wiki query — that's continuity for free, already implemented. `retrieveWiki` + `buildProjectWikiQuery` (`brief-assemblers.ts:1259-1272`, `:561-643`) do exactly this. Area gets ~80%; the topic-cache narrows the remaining noise.
- **A lineage edge is mostly redundant and carries maintenance cost.** It only adds value when the predecessor used *different vocabulary* than the successor (so the wiki query misses), or when the predecessor's topics live in a *different area*. Those are real but narrow; they don't justify a new persisted scope dimension that someone has to set correctly and keep accurate. (Matches the prior conclusion that explicit project links are "a later refinement, possibly unnecessary.")
- **Where area is genuinely too coarse, the fix is the topic-cache boost in the brief, not a new edge.** The brief already *reads* `topics:` (`brief-assemblers.ts:974`, `:1163`) but — per the R10 no-consumer guard — nothing in assembly may branch on it. That guard is correct for *gating* but it blocks the one good use: **using the cache to RE-RANK the area-scoped wiki/meeting results so the project's own topics float to the top.** Recommend relaxing R10 specifically to allow a *display-order* boost (not a filter, not a gate) — sibling-B/A should weigh in since R10 is theirs. This is the single highest-leverage narrowing available, and it's a small change.

**Net:** area = the filter (membership), topic-cache = the ranker (relevance within membership), lineage = an optional day-one hint (below). No new scope dimension.

---

## New-project bootstrap from a prior

**The gap (F3):** `computeProjectTopicsRefresh` builds its query from the *new* project's own README — name + area + first lines of `## Key Questions` / `## Background` (`project-topics.ts:136`, `buildProjectWikiQuery` `brief-assemblers.ts:1259-1272`). On day one that README is thin, so the cache computes weak/empty and the brief has no lineage to surface. The predecessor's accumulated thread is reachable *in principle* (same area, similar topics) but not *primed*.

**Recommendation — a two-tier bootstrap, cheapest first:**

1. **Tier 1 (no new machinery): area + topic-cache already covers the common case.** A new "status-letters v2" project in area `claims` will, on first `arete project open`, retrieve the predecessor's `status-letters` topic page via the area-scoped wiki query — *provided that page passes the brief's retrieval* (it does; brief retrieval is bias-not-filter). So for same-area, same-vocabulary successors, **bootstrap is automatic and needs nothing built.** The fix that makes it reliable is the boot/status changes above so the user is even reminded the predecessor exists.

2. **Tier 2 (small change): seed the new project's wiki query from the predecessor when the user names one.** When the user says "new feature continuing X," the project-creation flow can read X's `topics:` cache (active OR archived README — `resolveArchivedProjectReadme` already locates archived READMEs, `:1334`) and either (a) pre-fill the new project's `topics:` cache with the predecessor's slugs, or (b) inject the predecessor's topic slugs as extra terms into `buildProjectWikiQuery`. Option (b) is cleaner — it feeds the existing scoring path rather than fabricating a cache the project hasn't earned. This is an *optional hint at creation time*, which is exactly the right weight for "lineage": ephemeral, advisory, not a persisted edge.

This is sibling-B-adjacent (it's a creation-verb behavior), so flag the handoff: **the retrieval side (this proposal) provides "given a predecessor slug, return its topic slugs to seed the query"; the verb side decides when/whether to ask for the predecessor.**

---

## Small change vs new machinery

**Small changes to existing retrieval (recommended, do these):**
- Wire `openItemsBySlug` into the live boot callers so the open-item filter/sort actually works (`memory-summary-loader.ts` + CLI call sites). *Cheap; fixes a dead code path.*
- Boot recency filter: `age ≤ 90d OR status ∈ {active,stable,blocked}` — one predicate at `active-topics.ts:83`. *Fixes the archived-thread-drop hazard.*
- Optional context boost in `getActiveTopics` sort (`boostArea`/`boostSlugs`) — additive sort term. *Makes boot context-aware without losing global default.*
- Relax R10 enough to let `assembleBriefForProject` use the `topics:` cache as a **rank boost** on area-scoped wiki/meeting results (display order only). *Narrows area-coarseness.*
- Tier-2 bootstrap: helper that returns a predecessor's topic slugs to extend `buildProjectWikiQuery`. *Small, opt-in.*

**New machinery (recommended AGAINST, or defer):**
- A persisted project-lineage edge (`continues:` frontmatter) as a scope dimension — defer; topic+area already carry continuity, and an edge adds maintenance surface for a narrow gain.
- A new "topic-family" grouping abstraction above topics — unnecessary; the topic page already *is* the family.

---

## Hardest risk

**The boot recency window (90 days) silently drops archived-project knowledge at the exact moment it's most needed — and the intended safety valve is currently dead code.**

The "OR has open items" escape in `getActiveTopics` (`active-topics.ts:83`) is the design's answer to "don't drop active-but-quiet threads," but `openItemsBySlug` is never populated at any live boot site, so the filter is recency-only in production. Six months after a project ships, its topic page is ~180 days old, has no rescue, and vanishes from boot context. The user spins the sibling project with no ambient reminder the predecessor exists. The brief *can* still retrieve it (bias-not-filter), but only if the user thinks to open a project and the wiki query happens to hit — i.e., continuity becomes luck.

Why it's the worst: it's **silent** (no "dropped N stale topics" signal), it **degrades exactly the headline use case** (months-later sibling project), and it's **masked** because the brief surface looks like it works. Mitigation is cheap (status-aware filter + wire open-items), which is why it's worth calling out loudly rather than tolerating.

Runner-up: area-coarseness drowning the lineage thread among 20 sibling-project topics — real, but the topic-cache rank boost addresses it, and it's a *quality* degradation (noise) rather than a *silent miss*.

---

## Open questions

1. **R10 relaxation** — sibling A/B own that guard. Is a display-order-only boost acceptable, or does it reopen the "brief silently depends on a stale cache" risk R10 was protecting against? (Mitigation: boost only, never filter; cache staleness already surfaced via `topics_refreshed`.)
2. **Who sets topic `status: archived`?** Must be memory-refresh/reconcile (sibling A), explicitly NOT a `finalize-project` side effect. Needs a written cross-lane contract.
3. **Tier-2 predecessor prompt** — does the creation verb (sibling B) ask "does this continue a prior project?", or is it inferred from the opening message? Retrieval side is ready either way.
4. **`topics_refreshed` staleness on archived projects** — an archived project's `topics:` cache never refreshes again (the writer only runs on active projects, `project-topics.ts:129`). For Tier-2 seeding from an archived predecessor, is a frozen cache acceptable? (Likely yes — it's a one-time hint, and the new project's own refresh corrects course.)
5. **Boot context source** — does the harness reliably know the working area/project at CLAUDE.md generation time, or only mid-session? If only mid-session, the context boost may need a regen trigger rather than living in the initial boot block.
