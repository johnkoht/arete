# Google Calendar Provider — Plan Review Notes

## Codebase Review Findings (2026-02-22)

### Plan Inaccuracies Fixed
1. **No `google-calendar` registry entry exists** — plan claimed it did. Registry has: `fathom`, `apple-calendar`, `krisp`.
2. **Path references corrected**:
   - Factory: `packages/core/src/integrations/calendar/index.ts`
   - Provider + interface: `packages/core/src/integrations/calendar/ical-buddy.ts`
   - Configure: `packages/cli/src/commands/integration.ts`
   - Pull: `packages/cli/src/commands/pull.ts`
3. **CalendarProvider interface** lives in `ical-buddy.ts`, not a shared module — needs extraction.

### Krisp OAuth Patterns to Leverage
From `packages/core/src/integrations/LEARNINGS.md` (2026-02-21):
- Dynamic port binding (port 0) for localhost callback
- 5-field atomic credential write to `.credentials/credentials.yaml`
- No heavy SDK needed — `fetch` wrapper suffices for HTTP APIs

### Open Design Questions (resolve before PRD)
1. **`googleapis` (~80MB) vs thin REST client?** — Recommendation: thin REST, consistent with Krisp pattern
2. **OAuth flow**: Localhost redirect only (Google deprecated OOB in 2022)
3. **Client ID distribution**: User-created Google Cloud project (matches Fathom API key pattern) vs shared Areté client ID
4. **Credential storage**: Under `google_calendar` key in `.credentials/credentials.yaml`
