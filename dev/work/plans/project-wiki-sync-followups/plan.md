---
slug: project-wiki-sync-followups
status: approved
has_pre_mortem: true
has_review: true
created: 2026-06-14
---

# Plan: project-wiki-sync fast-follows #1 + #3

Draft plan for two independent fast-follows spun out of `dev/work/backlog/project-wiki-sync-followups.md`. Grounded in discovery (2026-06-14). Two workstreams, shippable independently. WS-2 (denylist expansion), WS-4 (`/publish`), WS-5 (cross-PM) remain punted.

User decisions locked (2026-06-14):
- **WS-1 source** = harvest the area cache (reuse already-persisted per-topic `open_items`).
- **WS-3 approach** = differentiate triggers + light hand-off.

---

## WS-1 — Populate `openItemsBySlug` at boot (harvest area cache)

### Problem
`getActiveTopics(topics, { openItemsBySlug })` (`packages/core/src/models/active-topics.ts:68`) accepts an optional `Map<topicSlug, openItemCount>` that drives both the keep-filter (`:89-92`) and the sort (`:106-114`). No live caller populates it, so `openItems` is always `0`: the `openItems > 0` keep-arm is dead and the sort's primary key is inert. v0.16.0 shipped a workaround (durable-status arm: keep when `status ∈ {active,stable,blocked}`) that covers the common "quiet-but-active" case. Populating the map is therefore now mostly a **sort-quality** win plus rescuing `new`/`stale`/`archived` topics that still carry open work.

### Why "harvest area cache"
No store is topic-keyed (commitments/tasks are area/project/person-keyed). The ONLY topic-keyed open-items count that already exists is the per-topic `open_items` the area-refresh computes and **persists in area-file frontmatter** — `topics: [ { slug, ..., open_items } ]` (`area-memory.ts:325-330`, written by `refreshAreaMemory` `:427`). Harvesting it = bounded I/O (one read per area file, not per meeting) and zero new pipeline. It inherits the known snapshot over-count (the underlying `open_action_items` is an extraction snapshot that never decrements — `meeting-frontmatter.ts:138`), which is acceptable for a filter/sort signal and is documented as such.

Crucially, the primary boot caller (`intelligence.ts:519`) runs **immediately after** `refreshAllAreaMemory` (`:494`), so the harvested counts are fresh as of that same refresh.

### Changes

1. **`AreaMemoryService.getOpenItemsBySlug(workspacePaths): Promise<Map<string, number>>`** — new public method in `packages/core/src/services/area-memory.ts`.
   - List `.arete/memory/areas/*.md` (`AREA_MEMORY_DIR`, `:24`; `storage.list` returns full paths and `[]` on missing dir).
   - For each file: `storage.read`, slice the `---`-delimited frontmatter block, and parse with `parse` from the **`yaml` package** (the same import `topic-page.ts:15` / `area-parser.ts:11` use — it round-trips the exact YAML `renderAreaMemory` emits). **Do NOT** reuse `area-parser.ts`'s `parseFrontmatter` — it's module-private and typed to `AreaFrontmatter`, which has **no `topics` field** (it models the `.arete/areas/{slug}.md` *source* file, not the computed memory file). There is no existing shared parser for the memory file's nested `topics:` list; `getLastRefreshed` (`:649`) only regex-scrapes a scalar.
   - Read `fm.topics` (array); for each `{ slug, open_items }`, coerce `open_items` to a finite number (skip `NaN`/missing) and accumulate `map.set(slug, (map.get(slug) ?? 0) + open_items)`. (Topic→area is effectively 1:1, but sum defensively in case a slug appears under two areas.)
   - `renderAreaMemory` omits the `topics:` block entirely when an area has no topics (`:323`); treat absent `topics:` / unreadable frontmatter as skip — never throw. Missing dir → empty map.

2. **Wire it at the two boot call sites only** — `intelligence.ts:519` and `update.ts:71`:
   ```ts
   const openItemsBySlug = await services.areaMemory.getOpenItemsBySlug(paths);
   const memorySummary = await loadMemorySummary(services.topicMemory, paths, {
     activeTopics: { openItemsBySlug },
   });
   ```
   - Wrap the harvest in try/catch (or rely on the method's own non-throw contract) so a harvest failure degrades to the current behavior, never breaks boot regen.
   - Do NOT touch the two extraction-bias callers (`meeting.ts:1298`, `backend/agent.ts:232`) — they render a bare slug list; the weighting is irrelevant and they shouldn't pay the read.
   - No signature change to `loadMemorySummary` — use the existing `options.activeTopics.openItemsBySlug` seam. (Keeps the loader service-graph-free per its module doc.)

3. **Keep the durable-status arm.** The count and the status arm are complementary: the count rescues open-work topics regardless of status and fixes sort order; the status arm rescues durable topics with zero recorded open items. Removing the workaround would raise the accuracy bar on a deliberately-approximate signal. Leave `active-topics.ts` filter logic unchanged.

### Tests
- `packages/core/test/services/area-memory.test.ts` (or a focused new test): `getOpenItemsBySlug` over a fixture areas dir —
  - **Fixture must be verbatim `renderAreaMemory(...)` output**, not hand-written YAML — that is the real contract and guards against drift if the renderer changes (it quotes `area_name`/`last_referenced`, etc.).
  - multi-area; a topic with `open_items: 0` present in the map; dup slug across two areas → summed.
  - frontmatter present but `topics:` block absent (area with people/decisions only) → skipped cleanly, no throw.
  - malformed/unreadable frontmatter → skipped, no throw; empty/missing dir → empty map.
- `packages/core/test/models/active-topics.test.ts` already covers the consumption side (map-driven keep + sort, `:45`,`:79`). Add one guard: **a topic with `open_items: 0` is NOT resurrected** by the map (regression guard for the keep-filter arm). No other change.
- `update.ts` path: assert a stale-but-present area file still yields a (possibly-stale) non-empty map and never throws.
- Optional: a thin integration assertion that `intelligence`/`update` pass a non-empty map when area files have counts (only if cheap; otherwise rely on unit coverage of the seam).

Note: map entries for "no page yet" topics (slug present in area file but no topic page) match nothing in `getActiveTopics` (it iterates pages) → harmless no-ops, no special handling needed.

### Acceptance
- A `stale`/`archived`/`new` topic with `open_items > 0` in its area file survives the boot filter and is rendered in Active Topics.
- Active Topics ordering reflects open-item weight (higher open count ranks earlier, ties broken by recency then slug — existing sort).
- Harvest failure / missing area files → identical output to today (graceful).
- No new I/O on the extraction-bias paths.

### Risks / notes
- **Snapshot over-count affects BOTH sort and the keep-filter** (be honest about this). The area `open_items` is a *sum of never-decremented extraction snapshots* (`meeting-frontmatter.ts:138` → summed at `area-memory.ts:813,816`). Because the count feeds the keep-filter (`active-topics.ts:92`), a long-dead `stale`/`archived` topic with a large historical sum can **resurrect into boot context and out-rank live work** within the 25-cap — not just imperfect ordering. The only existing backstop is `scanAreaMeetings`' 60-day exclusion (`area-memory.ts:826`), which drops topics last-referenced >60d ago **only when their open-items is zero** — it does NOT catch a nonzero stale sum. Accept this as a known, bounded wart for now (it's a ranking signal, not a ledger); the accurate fix is the punted "add `@topic` to items" path (WS-5-adjacent), out of scope. If it proves noisy in practice, a follow-up could decay/zero counts for non-durable topics past the recency window.
- **Staleness in `update.ts`**: `arete update` may run without a preceding area refresh, so counts can lag. Acceptable — same graceful-degradation contract; the numbers only nudge ranking.

---

## WS-3 — Reconcile `wrap` vs `finalize-project` (differentiate + hand-off)

### Problem
Both are runtime/product skills. `wrap` (`packages/runtime/skills/wrap/SKILL.md`) = lightweight close-out for ANY completed work. `finalize-project` (`packages/runtime/skills/finalize-project/SKILL.md`) = full project ceremony (context reconciliation, dated archive, activity log, README rewrite, idempotent closed-project retro + `arete memory refresh`).

The collision is mechanical (routing is keyword-scored, `intelligence.ts:75` `scoreMatch`; triggers parsed ONLY from frontmatter `triggers:` array, `skills.ts:153`):
- `finalize-project` has **no `triggers:` array at all** (latent bug) — it routes only by id/description luck.
- `wrap` declares the project-archival phrases (`archive this project`) as real triggers (+18 each), so **`wrap` shadows `finalize-project`** on shared phrases. A user saying "archive this project" on an active project gets the lightweight skill.
- The router has no tie-break / no disambiguation surface for skills.

### Changes (frontmatter + prose only — no code)

1. **Add a `triggers:` array to `finalize-project`** (fixes the latent bug, gives it the project-archival phrases it semantically owns):
   ```yaml
   triggers:
     - finalize project
     - complete this project
     - archive project
     - archive this project
     - commit changes to context
   ```
   (Mirror the phrasing in its existing "When to Use".)

2. **Strip project-archival phrasing from `wrap`** so it stops shadowing:
   - Remove `archive this project` from `wrap`'s `triggers:` (keep `wrap up`, `close out`, `post-mortem`, `what did we learn`).
   - Re-scope `wrap`'s `description` away from project "archival" toward "close out completed work / extract decisions & learnings".
   - **Make `wrap` step 6 structurally refuse to archive an active project** (not just "lighter language"). If the scope is a directory under `projects/active/`, `wrap` does NOT move it — it hard-redirects to `finalize-project` for the archive (so we never produce a second, divergent archive path: no dated prefix, no `_history`, no activity log, no closed-project retro). `wrap`'s own archive step survives ONLY for non-project work (a plan / quarter-goal / ad-hoc). This closes the divergent-archive hole at the structural level rather than relying on agent compliance.
   - Fix `wrap`'s `work_type: review` while here — `review` is not a valid `WorkType` (`models/common.ts:33`: discovery|definition|delivery|analysis|planning|operations), so it silently contributes nothing. Set to `analysis` (closest fit for a retro). Cosmetic for routing, but stop the dead value.

3. **`wrap up` stays → `wrap`** (per GUIDE.md:1288 + memory: `wrap` = the general verb). With `finalize-project` no longer relying on description-luck for "wrap up" and `wrap` keeping it as an explicit trigger, `wrap` wins cleanly. The hand-off (below) catches the case where the user actually wanted the full ceremony.

4. **Hand-off in `wrap` step 1** (mirrors `update-project → finalize-project` at `update-project/SKILL.md:41`): when the scope is a project in `projects/active/`, `wrap` surfaces a one-line offer —
   > "This is an active project. For the full close-out (context reconciliation, dated archive, closed-project retro), run `finalize-project` instead. Continue with a lightweight wrap (decisions/learnings only, NO archive)? (y/n)"
   - This UX nudge is layered ON TOP of the structural refusal in change #2 — the nudge catches it early; the step-6 refusal is the backstop so that even if the agent skips the offer, `wrap` still cannot produce a divergent project archive. The hand-off is NOT the only guard.
   - `wrap` may proceed lightweight (extract decisions/learnings, summarize) but will not archive a `projects/active/` dir; for a plan/quarter-goal/ad-hoc scope it behaves exactly as today.

5. **Preserve the `update-project → finalize-project` hand-off** (`update-project/SKILL.md:41`) untouched — verify it still reads correctly after finalize-project's frontmatter change.

### Docs to update (per definition_of_done; user-facing)
- `packages/runtime/skills/finalize-project/SKILL.md:26` — **drop "wrap up" from its `When to Use`** (it will now lose that phrase to `wrap`; leaving it makes the prose contradict routing).
- `packages/runtime/GUIDE.md` — confirm the wrap-vs-finalize paragraph (`:1288`) still matches; tweak if wording about routing/triggers changed. Spot-check `:494-501`, `:524`.
- `packages/runtime/UPDATES.md` — short user-facing note: "finalize-project now routes on its own triggers; `wrap` no longer hijacks project-archival phrases; `wrap` redirects active-project archival to finalize-project."
- `packages/runtime/skills/README.md` — **`wrap` is currently absent from the skills table** (only finalize-project/periodic-review/etc. are listed under Operations at `:18`). Either add a `wrap` row (real doc gap) or leave the table as-is if wrap belongs under a different heading — decide during build; do NOT "fix `:18`" blindly (it doesn't mention wrap today).
- Leave `packages/runtime/skills/PATTERNS.md` (`:227,:229`) UNCHANGED — we're not altering finalize-project's extraction path.
- Do NOT touch build-side `/wrap` (`.pi/extensions/plan-mode/wrap-checks.ts`, `.pi/skills/ship`, AGENTS.md `/wrap`) — different "wrap".

### Tests / verification
- No code path changes, so no unit tests. **Skill frontmatter is read live by `services.skills.list` per call — there is no skills-index/capabilities manifest to regenerate** (confirmed: no manifest/cache file); edits take effect immediately. Triggers are not schema-validated anywhere (`skills.ts:153` only `Array.isArray`-guards), so a typo fails silently to +0 — these route checks are the ONLY safety net.
- **REQUIRED GATE** (not just ship notes): run the CLI scorer and confirm each, capturing before/after scores:
  - `arete skill route "finalize project"` → finalize-project (strong)
  - `arete skill route "archive this project"` → finalize-project (was wrap; reviewer walked the math: finalize 58 vs wrap 2)
  - `arete skill route "wrap up"` → wrap (reviewer: wrap 55 vs finalize 2)
  - `arete skill route "what did we learn"` → wrap
  - `arete skill route "complete this project"` → finalize-project (wins via the new trigger; "complete"/"archive" are NOT operations work_type keywords, so the trigger array is load-bearing here)

### Acceptance
- `finalize-project` has a real `triggers:` array and wins the project-archival phrases.
- `wrap` no longer shadows finalize-project; `wrap up` still → wrap.
- `wrap` offers the finalize-project escalation on active projects and can still proceed lightweight.
- `update-project`'s existing hand-off intact.
- Docs reflect the new routing.

### Risks / notes
- `archive project` vs `archive this project` are near-identical; the scorer can't perfectly separate. Both now belong to `finalize-project` (both in its triggers, neither in wrap's) → no ambiguity. Good.
- No router/tie-break code change in scope (the discovery flagged the absent disambiguation surface as a larger latent issue — left out deliberately; frontmatter differentiation resolves the concrete collision without it).

---

## Sequencing & ship
- Two independent worktrees (WS-1 = core/cli code + tests; WS-3 = runtime skill markdown + docs). Can ship in parallel or back-to-back.
- WS-1 warrants a patch/minor bump (behavior change in boot context). WS-3 is docs/skill-content (patch). Bundle into one release or two per gitboss judgment.
- Route through `/ship` Phase 5 wrap + gitboss merge gate per `definition_of_done`. Stop at merge gate for review.

## References
- Backlog: `dev/work/backlog/project-wiki-sync-followups.md` (#1, #3)
- Discovery: this session (2026-06-14)
- Prior: v0.16.0 (PRs #14/#15); `active-topics.ts`, `provenance.ts`
