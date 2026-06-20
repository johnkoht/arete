# Build report — W6 (brief correctness trio)

Branch: `fix-wiki-w6` off `b373703e`. Commits: `ae3273d8` (parser), `cb39f960` (topics-union), `d239ed68` (fm.name), `f0fb5f90` (dist). All source changes in `packages/core/src/services/brief-assemblers.ts`.

## W6.1 — decisions/learnings parser respec
- Replaced legacy-only `### YYYY-MM-DD: Title` regex (old :1068-1078) with line-based `parseMemoryItemEntries()` (:1102): live format `## Title` + `- **Date**:` + `- **Topics**:` (backtick-stripped).
- Found + fixed a SECOND latent bug while in there: the old regex's multiline-`$` lookahead truncated each section body at its first line — even `Area:` lines beyond line 1 were missed. Regression-tested.
- Attribution: direct `topics.includes(area)` match OR slug→area via new `loadTopicAreaMap()` (:1160) from topic-page `area:` frontmatter; legacy `Area:` / `[area:]` kept as fallbacks. NOTE: 0 live topic pages carry `area:` today, so the direct match delivers now; the map engages as pages gain areas (Phase 12's backfill will feed it).
- Tests: `brief-memory-items.test.ts` (9) + integration in `brief-project.test.ts` (all 4 attribution paths + exclusion).

## W6.2 — meetingsForArea topics-union
- `topics: string[]` on `MeetingIndexEntry` (:118-131), parsed in `loadMeetingIndex` (YAML array or comma string) + synthetic agenda entry (:1543). Union filter in `meetingsForArea` (:227) covers both call sites (project S2 :966, area :1271).
- Tests: union truth-table (area-only/topics-only/both/neither; no substring match) + June-style fixture (topics-only, no area key) asserted present in S2.

## W6.3 — fm.name fallback
- `projectDisplayName()` (:855): `name:` → `title:` → `project:` → slug; used in `listActiveProjects` (:881) + `readProjectBySlug` (:907). Tests: 4 cases.

## Live AC6 check (read-only, arete-reserv)
`brief --project status-letter-automation`: **S4 "Decisions & learnings (127)"** (AC6 floor ≥10; 18 rendered before the 2000-char section cap with explicit truncation marker) · **S2 "Recent activity (10)" — all June meetings** (6/03–6/08, topics-only frontmatter) via topics-union. Zero writes to arete-reserv verified (mtime audit).

## Gates
- typecheck clean; dist rebuilt + committed.
- Targeted tests: 50 across brief-memory-items, brief-project, brief-area, brief-meeting, brief-person, brief-no-llm, brief-wiki-fallback (core) + brief-cli, brief (cli) — 0 failures. Full suite deferred to merge gate per AC7.

## Notes for reviewer/orchestrator
- S4 section cap (2000 chars) now binds with 127 items — rendering shows 18 + "109 not shown". Acceptable for repair scope; Phase 12 may want smarter selection.
- Merge-order note: W1+W5 (in flight) also touches `brief-assemblers.ts` (staleness display, retrieveWiki region) — second branch to land rebases.

## Review fixup
- **Fix (review-mandated):** `readAreaTaggedMemoryItems` returned items in FILE order; live `decisions.md` ends with an ascending chronological block, so the 2000-char section cap (`capBulletsByChars`, which contracts "drops oldest first") kept the 18 stalest matched items and silently dropped every June decision. Now sorts `items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))` before return — newest first, undated last; combined decisions+learnings sort together (also removes the decisions-before-learnings type bias).
- Exported `readAreaTaggedMemoryItems` + `AreaTaggedItem` for direct testing (consistent with `parseMemoryItemEntries`/`loadTopicAreaMap`).
- **Test:** new `readAreaTaggedMemoryItems` describe in `brief-memory-items.test.ts` — out-of-order mixed decisions+learnings fixture asserts exact newest-first interleaved order with undated item last (and non-matching area excluded). Targeted run: 19/19 pass (brief-memory-items + brief-project).
- **Live confirmation (read-only, arete-reserv):** `brief --project status-letter-automation` S4 now renders 18 bullets STARTING at 2026-06-08 and descending (06-08 ×8 → 06-05 ×5 → 06-04 ×5); truncation marker "older items dropped first" is now truthful.
