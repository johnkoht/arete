# PRD: Intelligence Quality & Calendar Integration

**Version**: 1.0  
**Status**: Draft  
**Date**: 2026-02-09  
**Branch**: `feature/intelligence-and-calendar`  
**Depends on**: Phase 3 intelligence services (context injection, memory retrieval, entity resolution, briefing assembly)

---

## 1. Problem & Goals

### Problem

Areté's intelligence layer (Phase 3) provides context injection, memory retrieval, entity resolution, and briefing assembly — but the underlying search is token-based keyword matching. This means:

- "user churn" doesn't match "retention problem" or "customer attrition"
- "pricing strategy" doesn't find decisions about "monetization approach"
- Context injection uses a static file map (Problem → business-overview.md) instead of discovering relevant files by content
- Memory search misses semantically related items that share meaning but not keywords
- No relevance scoring — all results are flat, with no ranking the agent can prioritize

Additionally, daily-plan and meeting-prep skills require the user to manually supply today's meetings because there is no calendar integration. For a PM tool, calendar is foundational context — meetings drive the majority of the workflow.

### Goals

1. **Swappable search backend**: Define a `SearchProvider` interface so the search implementation can be replaced without changing intelligence services. Implement QMD as the first provider; keep token-based matching as the always-available fallback.
2. **Upgrade memory retrieval**: Use semantic search (via SearchProvider) to find relevant decisions, learnings, and observations — not just keyword matches.
3. **Upgrade context injection**: Discover relevant workspace files by content relevance (via SearchProvider), not just the static primitive-to-file map. Add relevance scores.
4. **Improve briefing quality**: Surface relevance scores, better gap detection, recency weighting.
5. **Calendar integration**: Pull today's meetings (and upcoming week) from macOS Calendar via `ical-buddy`. Match attendees to people files. Feed into daily-plan and meeting-prep.
6. **Calendar filtering**: Allow users to configure which calendars they care about (work vs personal) via `arete.yaml`.

### Out of Scope

- Embedding-based search built from scratch (QMD already handles embeddings)
- Google Calendar OAuth or Microsoft Graph API (backlogged for later)
- Calendar write/push (read-only for v1)
- Background sync or daemons
- Cross-platform calendar support (macOS only for v1; interface allows future providers)

---

## 2. Architecture Decisions

### Swappable Search

Search is abstracted behind a `SearchProvider` interface. Intelligence services consume this interface, never a specific tool. A factory function returns the best available provider.

```
SearchProvider (interface)
├── QmdSearchProvider     — wraps QMD CLI, semantic + hybrid search
├── FallbackSearchProvider — refactored token-based matching (always available)
└── (future providers)     — swap in without changing intelligence services
```

The fallback chain: configured provider → QMD (if installed) → built-in token matching.

QMD-specific concepts (like `qmd update`, `qmd embed`) stay inside the QMD provider. The interface exposes only: `search()`, `semanticSearch()`, `isAvailable()`.

### Swappable Calendar

Calendar is abstracted behind a `CalendarProvider` interface. Same pattern.

```
CalendarProvider (interface)
├── IcalBuddyProvider     — wraps ical-buddy CLI, macOS Calendar.app
└── (future providers)     — Google Calendar, Microsoft, etc.
```

`ical-buddy` reads from macOS Calendar.app, which syncs with Google Calendar, iCloud, Outlook — whatever the user has configured. This gives cross-provider calendar access through the local sync layer.

### Calendar Filtering

Users configure which calendars to include in `arete.yaml`:

```yaml
integrations:
  calendar:
    provider: ical-buddy
    calendars:
      - Work
      - john@launchpadlab.com
    # If empty or omitted, all calendars are included
```

---

## 3. User Stories

### Search Infrastructure

1. As a developer, I can implement a new search provider by conforming to the `SearchProvider` interface, and swap it into Areté without modifying intelligence services.
2. As a PM, when I run `arete memory search "retention"`, I get results that include semantically related items (like "user churn" or "customer attrition"), not just exact keyword matches.
3. As a PM, when I run `arete context --for "pricing PRD"`, I get files ranked by relevance to the query, including project files and meetings that are topically related — not just the static context files.

### Calendar Integration

4. As a PM, I can run `arete pull calendar` to fetch today's meetings and the upcoming week from my macOS calendar.
5. As a PM, I can configure which calendars to include (e.g. only "Work") so personal events don't appear in my daily plan.
6. As a PM, when I use the daily-plan skill, it automatically pulls calendar events (if calendar is configured) instead of requiring me to manually list meetings.

---

## 4. Requirements

### 4.1 SearchProvider Interface (`src/core/search.ts`)

**Types:**
- `SearchProvider`: Interface with `name: string`, `isAvailable(): Promise<boolean>`, `search(query, options): Promise<SearchResult[]>`, `semanticSearch(query, options): Promise<SearchResult[]>`
- `SearchResult`: `{ path: string; content: string; score: number; matchType: 'keyword' | 'semantic' | 'hybrid' }`
- `SearchOptions`: `{ limit?: number; paths?: string[]; minScore?: number }`
- `getSearchProvider(workspaceRoot: string): Promise<SearchProvider>` — factory that returns the best available provider

**Behavior:**
- `search()` is keyword/exact matching
- `semanticSearch()` is meaning-based matching
- Both return results sorted by score descending
- Factory checks QMD availability first, falls back to built-in

### 4.2 QMD Search Provider (`src/core/search-providers/qmd.ts`)

**Implementation:**
- Wraps QMD CLI calls via `child_process.execSync` or `execFileSync`
- `isAvailable()`: checks `which qmd` succeeds and `qmd status` returns valid response
- `search()`: runs `qmd search "<query>" --json -n <limit>`, parses JSON output
- `semanticSearch()`: runs `qmd query "<query>" --json -n <limit>` (hybrid mode, best quality)
- Handles QMD not installed, QMD errors, timeout (5s default), empty results
- Does NOT leak QMD-specific concepts (update, embed) outside the provider

### 4.3 Fallback Search Provider (`src/core/search-providers/fallback.ts`)

**Implementation:**
- Refactors existing token-based matching from `memory-retrieval.ts` and `context-injection.ts` into this provider
- `isAvailable()`: always returns true
- `search()`: tokenize query, scan specified paths (or workspace root), score by token overlap
- `semanticSearch()`: same as `search()` (no semantic capability, but fulfills the interface)
- Preserves current behavior as baseline

### 4.4 Memory Retrieval Upgrade (`src/core/memory-retrieval.ts`)

**Changes:**
- Import and use `getSearchProvider()` instead of inline tokenization
- Primary path: call `provider.semanticSearch(query)` scoped to `.arete/memory/items/`
- Parse QMD results back into `MemoryResult` format (extract type from file, section parsing)
- If SearchProvider returns results, use them; if empty, fall back to section-level token scan (existing logic)
- Add `score` field to `MemoryResult` type
- Add recency weighting: boost items with dates within last 30 days (+20% score), 90 days (+10%)
- Preserve all existing function signatures for backward compatibility

### 4.5 Context Injection Upgrade (`src/core/context-injection.ts`)

**Changes:**
- Import and use `getSearchProvider()`
- Keep `PRIMITIVE_FILE_MAP` as the base layer (always include strategy, quarter goals, mapped context files)
- Add QMD-powered file discovery: run `provider.semanticSearch(query)` across workspace, add high-scoring results
- Score and rank all context files by relevance (from SearchProvider) — add `relevanceScore` to `ContextFile` type
- Include topically related meetings (from `resources/meetings/`) and project files that score well
- Cap total files to avoid overwhelming context (max 15 files default)
- Better placeholder detection using search results quality

### 4.6 Briefing Upgrade (`src/core/briefing.ts`)

**Changes:**
- Surface relevance scores in markdown output (show score next to each file reference)
- Sort files within each primitive section by relevance score
- Better gap detection: if SearchProvider found nothing for a primitive (not just "file missing" but "no relevant content"), that's a real gap
- Memory results show relevance ranking

### 4.7 CalendarProvider Interface (`src/core/calendar.ts`)

**Types:**
- `CalendarProvider`: Interface with `name: string`, `isAvailable(): Promise<boolean>`, `getTodayEvents(options?): Promise<CalendarEvent[]>`, `getUpcomingEvents(days, options?): Promise<CalendarEvent[]>`
- `CalendarEvent`: `{ title: string; startTime: Date; endTime: Date; calendar: string; location?: string; attendees: CalendarAttendee[]; notes?: string; isAllDay: boolean }`
- `CalendarAttendee`: `{ name: string; email?: string; status?: 'accepted' | 'declined' | 'tentative' | 'none' }`
- `CalendarOptions`: `{ calendars?: string[] }` — filter to specific calendars
- `getCalendarProvider(config: AreteConfig): Promise<CalendarProvider>` — factory

### 4.8 IcalBuddy Provider (`src/core/calendar-providers/ical-buddy.ts`)

**Implementation:**
- `isAvailable()`: checks `which ical-buddy` succeeds
- `getTodayEvents()`: runs `ical-buddy -b "" -nc -nrd -ea -df "%Y-%m-%d" -tf "%H:%M" -ic "<calendars>" eventsToday`, parses output
- `getUpcomingEvents(days)`: same with `eventsFrom:today to:today+<days>`
- Calendar filtering: reads `integrations.calendar.calendars` from config, passes to `-ic` flag
- Parse ical-buddy structured output into `CalendarEvent` objects
- Attendee extraction: parse attendee strings into name + email
- Handle: not installed, no events, permission errors

### 4.9 Calendar Config in `arete.yaml`

**Schema addition to AreteConfig:**
```typescript
integrations: {
  calendar?: {
    provider: string;      // 'ical-buddy' for now
    calendars?: string[];  // calendar names to include (empty = all)
  }
}
```

**Install/update**: `arete install` adds calendar config section to `arete.yaml` if not present (with commented-out example). `arete integration configure calendar` walks through selecting calendars.

### 4.10 CLI: `arete pull calendar`

**Command:**
- Uses CalendarProvider to fetch today + upcoming 7 days
- Outputs formatted event list to stdout
- With `--json`: structured JSON output
- With `--today`: only today's events
- Match attendee emails to person files (via entity resolution) and annotate with person slug/role
- Error messages: "ical-buddy not installed — run: brew install ical-buddy" or "No calendars configured — run: arete integration configure calendar"

### 4.11 Daily-Plan Integration

**Changes to `.cursor/skills/daily-plan/SKILL.md`:**
- Before asking user for meetings, check if calendar is configured: run `arete pull calendar --today --json`
- If events returned, use them as today's meeting list (skip asking user)
- If calendar not configured or no events, fall back to asking user (current behavior)
- Display calendar source: "Pulled from Calendar (Work)" vs "User provided"

### 4.12 Integration Registry and Docs

**Changes:**
- Update `src/integrations/registry.ts`: add `apple-calendar` integration entry with status `available`
- Update `AGENTS.md` with calendar system documentation
- Add build memory entry documenting the SearchProvider pattern and calendar integration
- Update `SETUP.md` with calendar setup instructions

---

## 5. Task Breakdown

### Group A: Search Infrastructure

**Task A1: SearchProvider interface and types**
- Create `src/core/search.ts` with `SearchProvider` interface, `SearchResult`, `SearchOptions` types
- Create `getSearchProvider()` factory function (skeleton)
- Add types to `src/types.ts` if needed
- Tests: interface contract tests, factory returns fallback when nothing else available

**Task A2: Fallback search provider**
- Create `src/core/search-providers/fallback.ts`
- Refactor token-based search logic from `memory-retrieval.ts` and `context-injection.ts` into this provider
- Extract shared tokenizer to `src/core/search.ts` (or keep in fallback)
- Provider implements `SearchProvider` interface
- `isAvailable()` always true
- Tests: keyword matching, stop word filtering, score ranking

**Task A3: QMD search provider**
- Create `src/core/search-providers/qmd.ts`
- `isAvailable()`: spawn `which qmd`, check exit code
- `search()`: spawn `qmd search "<query>" --json -n <limit>`, parse JSON
- `semanticSearch()`: spawn `qmd query "<query>" --json -n <limit>`, parse JSON
- Timeout handling (5s), error handling, graceful degradation
- Update factory in `src/core/search.ts` to prefer QMD when available
- Tests: mock child_process.execFileSync, test JSON parsing, test timeout, test unavailable

### Group B: Intelligence Upgrades

**Task B1: Upgrade memory retrieval**
- Modify `src/core/memory-retrieval.ts` to use `getSearchProvider()`
- Primary path: `provider.semanticSearch()` scoped to memory items dir
- Map provider results back to `MemoryResult` format
- Add `score` field to `MemoryResult` in `src/types.ts`
- Add recency weighting (30-day boost, 90-day boost)
- Preserve `searchMemory()` function signature
- Tests: verify QMD-backed search returns semantic matches (mocked), fallback behavior, recency boost

**Task B2: Upgrade context injection**
- Modify `src/core/context-injection.ts` to use `getSearchProvider()`
- Keep static PRIMITIVE_FILE_MAP as base layer
- Add SearchProvider-powered file discovery for meetings, projects, additional context
- Add `relevanceScore` field to `ContextFile` in `src/types.ts`
- Rank files by relevance, cap at 15 files
- Tests: verify discovered files beyond static map (mocked), relevance ranking, cap enforcement

**Task B3: Upgrade briefing assembly**
- Modify `src/core/briefing.ts`
- Show relevance scores in markdown (e.g. "relevance: 0.85")
- Sort files by score within primitive sections
- Improve gap detection using search result quality
- Tests: verify markdown includes scores, proper sorting, improved gaps

### Group C: Calendar Infrastructure

**Task C1: CalendarProvider interface and types**
- Create `src/core/calendar.ts` with `CalendarProvider`, `CalendarEvent`, `CalendarAttendee`, `CalendarOptions` types
- Create `getCalendarProvider()` factory function (skeleton)
- Add calendar config types to `src/types.ts` (extend `AreteConfig.integrations`)
- Tests: interface contract, factory returns null when no provider available

**Task C2: IcalBuddy provider**
- Create `src/core/calendar-providers/ical-buddy.ts`
- `isAvailable()`: check `which ical-buddy`
- `getTodayEvents()`: run ical-buddy with today filter, parse output
- `getUpcomingEvents(days)`: run ical-buddy with date range, parse output
- Calendar filtering via `-ic` flag from config
- Attendee parsing (name and email extraction)
- Error handling: not installed, no events, permission errors
- Tests: mock child_process, test output parsing, test calendar filtering, test attendee extraction

**Task C3: `arete pull calendar` CLI command**
- Add `pull calendar` subcommand in CLI
- Use CalendarProvider to fetch events
- Format output (table for terminal, JSON for --json)
- Match attendee emails to people files via entity resolution
- Annotate events with person slugs/roles
- Error messages for missing ical-buddy or missing config
- Tests: mock provider, test output formatting, test people matching

**Task C4: Calendar config and setup**
- Add `integrations.calendar` section to `AreteConfig` type
- Update config loading/defaults in `src/core/config.ts`
- Update `arete install` to include calendar config placeholder in arete.yaml
- `arete integration configure calendar`: interactive setup (list available calendars via ical-buddy, let user pick)
- Tests: config loading with/without calendar, install includes placeholder

### Group D: Skill Integration & Docs

**Task D1: Daily-plan calendar integration**
- Update `.cursor/skills/daily-plan/SKILL.md`
- Before asking for meetings, check `arete pull calendar --today --json`
- If events returned, use them; if not, fall back to asking user
- Note source in output ("Pulled from Calendar" vs "User provided")

**Task D2: Registry, AGENTS.md, and build memory**
- Update `src/integrations/registry.ts`: add apple-calendar with status available
- Update AGENTS.md: add Search Provider system and Calendar system sections
- Update SETUP.md with calendar setup instructions
- Create build memory entry `.cursor/build/entries/2026-02-09_intelligence-and-calendar.md`
- Add line to `.cursor/build/MEMORY.md`

---

## 6. Dependencies Between Tasks

```
A1 → A2 (fallback needs interface)
A1 → A3 (QMD needs interface)
A2 → B1 (memory retrieval needs fallback as baseline)
A3 → B1 (memory retrieval needs QMD provider)
A2 → B2 (context injection needs fallback)
A3 → B2 (context injection needs QMD provider)
B1 + B2 → B3 (briefing upgrade needs memory + context upgrades)

C1 → C2 (ical-buddy needs interface)
C1 → C3 (CLI needs interface)
C2 → C3 (CLI needs ical-buddy provider)
C1 → C4 (config needs types)

C3 → D1 (daily-plan needs pull command)
B3 + C3 → D2 (docs need everything)
```

Execution order: A1 → A2 → A3 → B1 → B2 → B3 → C1 → C2 → C4 → C3 → D1 → D2

---

## 7. Testing Strategy

- All SearchProvider tests mock `child_process` to avoid requiring QMD installed
- All CalendarProvider tests mock `child_process` to avoid requiring ical-buddy installed
- Integration with intelligence services tested via mocked providers
- Existing tests for memory-retrieval, context-injection, briefing, entity-resolution must continue to pass
- `npm run typecheck` and `npm test` after every task

---

## 8. Success Criteria

- `arete memory search "retention"` returns results about "user churn" (when QMD is available)
- `arete context --for "pricing"` returns topically related files beyond the static map
- `arete brief --for "create PRD for search"` shows relevance-scored results
- `arete pull calendar` shows today's meetings from macOS Calendar
- `arete pull calendar --today --json` returns structured event data
- Daily-plan skill automatically uses calendar data when configured
- All existing tests continue to pass
- Search backend can be swapped by implementing SearchProvider (no changes to intelligence services needed)
- Calendar backend can be swapped by implementing CalendarProvider (no changes to CLI/skills needed)
