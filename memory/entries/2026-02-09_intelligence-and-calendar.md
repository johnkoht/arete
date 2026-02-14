# Intelligence & Calendar — Phase 3 Upgrade

**Date**: 2026-02-09  
**PRD**: `.cursor/build/prds/intelligence-and-calendar/prd.md`

## Summary

Upgraded Areté's intelligence layer with swappable search backend (QMD + token fallback) and added macOS calendar integration via ical-buddy.

## What Changed

### Search Provider System (Tasks A1-A3, B1-B3)

- Created SearchProvider interface (`src/core/search.ts`)
- Implemented QmdSearchProvider (`src/core/search-providers/qmd.ts`) and FallbackSearchProvider (`src/core/search-providers/fallback.ts`)
- Upgraded memory-retrieval to use SearchProvider with recency weighting
- Upgraded context-injection with relevance scoring and semantic file discovery
- Upgraded briefing to surface scores and improve gap detection

### Calendar Integration (Tasks C1-C4, D1)

- Created CalendarProvider interface (`src/core/calendar.ts`)
- Implemented IcalBuddyProvider for macOS Calendar (`src/core/calendar-providers/ical-buddy.ts`)
- Added `arete integration configure calendar` command
- Added `arete pull calendar` command with person matching
- Integrated calendar into daily-plan skill

### Documentation (Task D2)

- Updated `src/integrations/registry.ts`: Added 'apple-calendar' integration entry with status 'available'
- Updated `AGENTS.md`: Added §9 Search Provider System and §10 Calendar System with interface docs and provider lists
- Updated `SETUP.md`: Added Calendar Setup section with ical-buddy installation and configuration instructions
- Updated `src/types.ts`: Added 'none' to IntegrationAuth type union

## Key Decisions

1. **Swappable providers**: Both search and calendar use interface + factory pattern for extensibility
2. **Graceful fallback**: QMD not required; token-based search always available
3. **Relevance scoring**: All context files and memory items now scored 0-1
4. **Calendar filtering**: Users can select which calendars to include via configuration
5. **Person matching**: Calendar attendees auto-matched to workspace people by email
6. **Auth type 'none'**: Added to IntegrationAuth for integrations that don't require credentials (e.g. local ical-buddy)

## Architecture Patterns

### SearchProvider Pattern

```typescript
interface SearchProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  semanticSearch(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}
```

Factory (`getSearchProvider`) checks availability and returns QMD provider if available, otherwise fallback provider. All intelligence services use the factory — they don't call providers directly.

### CalendarProvider Pattern

```typescript
interface CalendarProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  getTodayEvents(options?: CalendarOptions): Promise<CalendarEvent[]>;
  getUpcomingEvents(days: number, options?: CalendarOptions): Promise<CalendarEvent[]>;
}
```

Factory (`getCalendarProvider`) returns ical-buddy provider on macOS if command available, otherwise null (calendar features disabled). Configuration in `arete.yaml` under `integrations.calendar`.

## Testing

- Search provider tests: QMD provider availability, fallback provider tokenization and scoring
- Calendar provider tests: ical-buddy parsing, person matching, error handling
- Memory retrieval tests: semantic search integration, recency weighting
- Context injection tests: relevance scoring, file discovery
- Briefing tests: score surfacing, gap detection
- Integration tests: calendar pull command, configure command

## Impact

- Memory search now semantic (when QMD available)
- Context injection discovers relevant files beyond static primitive map
- Briefings show relevance scores for prioritization
- Daily plans auto-populate from calendar with meeting context
- Foundation for Google Calendar and Microsoft Graph providers
- Graceful degradation when QMD or calendar not available

## Future Extensions

1. **Search providers**: Elasticsearch, Meilisearch, or other backends
2. **Calendar providers**: Google Calendar (OAuth), Microsoft Graph (OAuth), CalDAV
3. **Person matching**: Fuzzy name matching when email not available
4. **Meeting prep automation**: Auto-generate prep briefs when calendar events detected
5. **Search quality**: Boosting by file type, recency, or user feedback

## Learnings

[To be filled in by orchestrator after full review]
