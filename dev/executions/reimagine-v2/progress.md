# Progress Log — reimagine-v2

Started: 2026-03-05T23:24:00Z
Branch: reimagine
Working dir: /Users/johnkoht/code/worktrees/arete--reimagine

## Pre-Mortem

### Risk 1: Backend dist not recompiled after TypeScript changes
**Problem**: The backend runs from `dist/`, not `src/`. If a developer changes `.ts` files but forgets to run `npx tsc`, the changes don't take effect and tests/builds may pass source but the running server uses stale code.
**Mitigation**: Every subagent prompt will include "After any backend change: `cd packages/apps/backend && npx tsc` and commit updated dist."
**Verification**: Reviewer checks that dist files were committed alongside src changes.

### Risk 2: V2-3 depends on V2-2 (tabs) being complete
**Problem**: V2-3 removes the PersonDrawer from PeopleIndex and navigates to /people/:slug. If V2-2 isn't done first, V2-3 could conflict.
**Mitigation**: Strict build order — V2-2 first, then V2-3.
**Verification**: V2-2 committed before V2-3 starts.

### Risk 3: V2-5 (Markdown editor) depends on V2-3 (PersonDetailPage) being complete
**Problem**: The editor wires into PersonDetailPage.tsx which is new in V2-3.
**Mitigation**: V2-5 runs only after V2-3 is merged + committed.
**Verification**: File exists before V2-5 starts.

### Risk 4: TipTap install in V2-5 may introduce dependency issues
**Problem**: Installing @tiptap/* packages in the web app could conflict with existing deps or fail.
**Mitigation**: Install and verify build passes as first step of V2-5.
**Verification**: `npm run build` in web package after install.

### Risk 5: API key storage path unclear
**Problem**: V2-1 needs to find where the agent reads API keys from to store in the same location.
**Mitigation**: Include explicit instruction to trace `getEnvApiKey` import chain in packages/apps/backend/src/services/ to find storage path.
**Verification**: Developer verifies stored key is picked up by the backend agent.

### Risk 6: Goals week.md parsing — checklist items vs section-style priorities
**Problem**: The current `parseWeekPriorities` uses `### N. Title` headers, but V2-4 needs to toggle `[ ]`/`[x]` items by index. These may be different structures.
**Mitigation**: Subagent reads the actual `now/week.md` content before implementing PATCH route to understand the real file structure.
**Verification**: Test covers actual toggle behavior on the real file format.

### Risk 7: People detail page rawContent + allMeetings performance
**Problem**: Scanning all meeting files to find attendees could be slow if there are many meetings.
**Mitigation**: Acceptable for v2 (same pattern as existing routes). Document as known limitation.
**Verification**: Route returns correct data in tests.

---

## Task Completions

### V2-2 — People Page Category Tabs (2026-03-06)
**Done**: Added All/Internal/Customer/User tabs above the people table with dynamic counts.

**Files Changed**:
- `packages/apps/web/src/pages/PeopleIndex.tsx` — added `Tabs`/`TabsList`/`TabsTrigger` import; `CategoryTab` type; `activeCategory` derived from `?category=` URL param; `handleCategoryChange()` that preserves `?filter=`; fixed `clearFilter()` to preserve `?category=`; split `filtered` into `searchFiltered` (for tab counts) + `filtered` (for table); `tabCounts` memo; tabs UI placed between PageHeader and commitment filter badge.

**Quality Checks**: `npm run build` (web) ✓

**Commit**: 7430a9f

**Reflection**: Straightforward frontend-only task. The key insight was splitting the `filtered` memo into two stages — `searchFiltered` (after search, before category) for tab counts, and then `filtered` (after category) for the table. The existing `clearFilter()` was wiping all search params with `setSearchParams({})` — fixed to use a functional update that only deletes `?filter=`. For V2-3: the PersonDrawer removal means reading PeopleIndex carefully to understand what state drives the drawer before deleting it. Token estimate: ~8k.


## V2-2 Documentation Fix (2026-03-06)
- Added `Multi-Param URL Coexistence (first use: V2-2)` section to `packages/apps/web/LEARNINGS.md`
- Documents the functional-setter `setSearchParams` pattern required when a page manages multiple independent URL params
- Clarifies why `CommitmentsPage` and `SearchPage` correctly use the destructive form (single param each) while `PeopleIndex` must use the functional form (two independent params)
- Commit: e960f9f; prd.json V2-2 commitSha updated

### V2-3 — People Detail Full Page (2026-03-06)
**Done**: Replaced PersonDrawer fly-out with a full `/people/:slug` page. Enhanced backend to return `rawContent` and `allMeetings`.

**Files Changed**:
- `packages/apps/web/src/components/people/PersonBadges.tsx` — new; extracts `HealthDot`, `CategoryBadge`, `TrendIcon` from PeopleIndex for shared use
- `packages/apps/web/src/pages/PeopleIndex.tsx` — removed PersonDrawer, `usePerson`, Sheet imports, `selectedSlug` state, `useParams`/`slugParam`; rows now call `navigate(/people/${slug})`
- `packages/apps/web/src/pages/PersonDetailPage.tsx` — new full page; two-column layout; meeting rows open Sheet via `useMeeting`; notes render `rawContent`; back link to `/people`
- `packages/apps/web/src/App.tsx` — imports `PersonDetailPage`; `/people/:slug` route now renders it
- `packages/apps/web/src/api/types.ts` — `PersonDetail` extended with `rawContent: string` and `allMeetings` array
- `packages/apps/backend/src/routes/people.ts` — `PersonDetail` type extended; `findMeetingsForPerson` helper added; `/:slug` handler computes `rawContent` (strips auto-managed sections) and `allMeetings`
- `packages/apps/backend/dist/routes/people.js` — recompiled
- `packages/apps/backend/test/routes/people.test.ts` — added 8 new tests for `rawContent` and `allMeetings`; fixed pre-existing fixture bug (`internals/` → `internal/`) that caused 4 pre-existing test failures

**Quality Checks**:
- `cd packages/apps/backend && npx tsc` ✓ (0 errors)
- `cd packages/apps/backend && npm test` ✓ (120/120 pass — up from 108/120, fixed 12 failures)
- `cd packages/apps/web && npm run build` ✓
- `npm run typecheck` ✓

**Commit**: c496c05

**Reflection**:
1. **Memory impact**: The `people/` gitignore pattern in the root `.gitignore` catches `packages/apps/web/src/components/people/` — required `git add -f`. This is worth documenting for V2-5 since the markdown editor may add more files under a `people/` path. Also discovered the `internals/` vs `internal/` directory naming mismatch in test fixtures — pre-existing bug silently masking 4 tests.
2. **Pattern for V2-5**: `rawContent` is already in `PersonDetail` and rendered as `whitespace-pre-wrap` in the Notes section. V2-5's TipTap editor just needs to: (a) add a new PATCH /api/people/:slug/notes route that writes back to the file, (b) toggle between `<div className="whitespace-pre-wrap">` display mode and `<TipTapEditor>` edit mode. The `rawContent` field is already the right source — no parsing needed.
3. **Token estimate**: ~22k tokens.
