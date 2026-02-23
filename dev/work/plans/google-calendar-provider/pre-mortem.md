# Pre-Mortem: Google Calendar Provider

**Date**: 2026-02-22
**Plan**: Google Calendar Provider (7 steps)
**Risk Level**: Medium-High — OAuth flow, new integration provider, credential storage, API client

---

## Risk 1: Producer-Consumer Mismatch on Provider String

**Problem**: This is the exact bug that caused the 2026-02-11 incident with `'macos'` vs `'ical-buddy'`. Step 5 (`configure` command) will write a provider string (e.g. `'google'`) to `arete.yaml`. Step 4's factory code in `getCalendarProvider()` must accept that exact string. If they use different values (`'google'` vs `'google-calendar'` vs `'gcal'`), `pull calendar` silently returns null — no events, no error.

**Mitigation**:
- Define the canonical provider string **once** in the plan before any code is written: `'google'`.
- In Step 5, add a comment in the configure command: `// getCalendarProvider reads this value — keep in sync`.
- In Step 4, add a comment in the factory: `// configure writes 'google' — accept this value`.
- In Step 6, add a **producer-consumer regression test** (same pattern as the existing `'macos'` test): call `configure` with the value it writes, then call `getCalendarProvider` with that config and assert it returns a non-null provider.

**Verification**: Review Step 5 and Step 4 diffs side-by-side. Confirm the string literal is identical. Confirm regression test exists in Step 6.

---

## Risk 2: Types Extraction Breaks Existing Imports

**Problem**: Step 1 moves `CalendarProvider`, `CalendarEvent`, `CalendarOptions` from `ical-buddy.ts` to `types.ts`. The current `index.ts` re-exports these from `ical-buddy.ts` (`export type { ... } from './ical-buddy.js'`). External consumers import from `@arete/core` (which re-exports from `index.ts`). If the re-export chain breaks, `pull.ts` and tests fail at compile time — but the subagent might not notice if they only run the new file's tests.

**Mitigation**:
- After Step 1, `index.ts` must update its re-export to `from './types.js'`.
- `ical-buddy.ts` must import types from `./types.js` instead of defining them.
- `packages/core/src/index.ts` barrel export must still work (line 54: `export { getCalendarProvider } from './integrations/calendar/index.js'`).
- Run `npm run typecheck` after Step 1 **before** proceeding to Step 2. This catches any broken import chain immediately.

**Verification**: `npm run typecheck` passes after Step 1. Grep for old import paths (`from './ical-buddy.js'` for types) to confirm none remain in non-test files.

---

## Risk 3: OAuth Credential Storage Conflicts with Existing Credentials

**Problem**: Google OAuth needs to store `access_token`, `refresh_token`, `client_id`, `client_secret`, `expires_at` in `.credentials/credentials.yaml`. Krisp already stores its credentials there under a `krisp:` key using atomic read-modify-write (`krisp/config.ts`). If the Google implementation writes the whole file instead of merging, it will wipe Krisp/Fathom credentials. Conversely, if it uses a different storage mechanism, it fragments credential management.

**Mitigation**:
- Follow the **exact** pattern from `krisp/config.ts`: read existing YAML → parse → merge under `google-calendar:` key → stringify → write.
- In the subagent prompt for Step 3, explicitly reference `packages/core/src/integrations/krisp/config.ts` as the template.
- Store under key `google-calendar` (matching the registry name from Step 2).
- Include `expires_at` as Unix timestamp in seconds (same as Krisp pattern).

**Verification**: Review `google-auth.ts` for read-modify-write pattern. Verify it uses `google-calendar:` namespace key. Confirm no full-file overwrite.

---

## Risk 4: OAuth Localhost Redirect — Google's Loopback Rules

**Problem**: Step 3 uses port 0 for the OAuth redirect server (OS-assigned port). But the `redirect_uri` registered with Google must match exactly. If the user registers a fixed redirect URI in Google Cloud Console (e.g. `http://localhost:8080/callback`) but the code uses a dynamic port, the OAuth flow fails with a redirect_uri_mismatch error. Unlike Krisp (dynamic registration), Google requires pre-registered redirect URIs.

**Mitigation**:
- **Google's special case**: Google allows `http://localhost` redirect URIs **without specifying a port** for installed/desktop apps (loopback redirect). The redirect URI in the auth request should be `http://127.0.0.1:{actual_port}/callback`, and this works because Google matches loopback addresses flexibly for native apps. However, this only works with the "Desktop" app type in Google Cloud Console.
- Document in Step 7 that users must create a **Desktop** (not Web) OAuth client in Google Cloud Console.
- In the subagent prompt, specify: "Use Google's loopback IP redirect flow for installed applications. The redirect_uri should be `http://127.0.0.1:{port}/callback` where port is dynamically assigned."

**Verification**: Review `google-auth.ts` uses `http://127.0.0.1:{port}/callback` format. SETUP.md docs specify "Desktop" app type.

---

## Risk 5: Fresh Context — Subagent Missing Integration Patterns

**Problem**: Steps 3-5 are the core implementation. A subagent starting fresh won't know about: (a) the null-return pattern from `getCalendarProvider()`, (b) the `isAvailable()` contract, (c) the Krisp OAuth patterns already established, (d) the LEARNINGS.md gotchas about provider strings.

**Mitigation**: Every subagent prompt for Steps 3-5 must include a file-reading preamble:
- `packages/core/src/integrations/LEARNINGS.md` (full — contains invariants, gotchas, Krisp patterns)
- `packages/core/src/integrations/calendar/index.ts` (factory pattern)
- `packages/core/src/integrations/calendar/types.ts` (after Step 1 creates it)
- `packages/core/src/integrations/krisp/config.ts` (credential storage pattern)
- `packages/core/src/integrations/krisp/client.ts` (OAuth flow reference)
- `packages/core/src/integrations/registry.ts` (registry pattern)

Also include a mini-context summary: "CalendarProvider interface requires `name`, `isAvailable()`, `getTodayEvents()`, `getUpcomingEvents()`. Factory returns null when unavailable — never throws. Credentials go in `.credentials/credentials.yaml` under a namespaced key using atomic merge."

**Verification**: Check each subagent prompt includes the file list and context summary before spawning.

---

## Risk 6: No `googleapis` SDK — Manual REST Client Edge Cases

**Problem**: Step 4 specifies a thin REST wrapper with no `googleapis` dependency. This is the right call (keeps dependencies minimal), but Google Calendar API has quirks: pagination via `nextPageToken`, RFC3339 datetime formats with timezone offsets, recurring event expansion (`singleEvents=true`), optional fields that change shape. A hand-rolled client risks missing edge cases that the SDK handles.

**Mitigation**:
- Scope the REST client to **only** what `CalendarProvider` needs: list events for a date range with calendar filtering. No create/update/delete.
- Always pass `singleEvents=true` (expands recurring events — critical for daily calendar view).
- Always pass `orderBy=startTime` (only valid when `singleEvents=true`).
- Parse `dateTime` (timed events) and `date` (all-day events) fields from the API response. Map to `CalendarEvent.isAllDay` accordingly.
- Handle pagination: loop while `nextPageToken` exists. Set reasonable `maxResults` (250 per page).
- In Step 6, write tests against **real API response fixtures** (mocked), not simplified objects. Include: timed event, all-day event, multi-day event, event with no attendees, event with 20+ attendees, declined event.

**Verification**: Review test fixtures for realism. Verify `singleEvents=true` is always set. Check pagination handling exists.

---

## Risk 7: Token Refresh and 401 Handling

**Problem**: `expires_at` is checked before each API call. If the token expires mid-request or between check and use, the API returns 401. If two concurrent calls both detect expiry and try to refresh simultaneously, one may overwrite the other's fresh token with a stale one (refresh tokens are single-use in Google's implementation).

**Mitigation**:
- For this CLI tool, concurrency is unlikely (single user, sequential commands), so a simple approach suffices: refresh if `expires_at - now < 300` (5-minute buffer before expiry).
- On 401 response, retry **once** after refreshing the token (even if `expires_at` hasn't been reached — clock skew exists).
- After refresh, write new tokens atomically before retrying the API call.

**Verification**: Review `google-calendar.ts` for 401 retry logic. Confirm the 5-minute buffer exists in the expiry check.

---

## Risk 8: Scope Creep — Calendar Selection UX

**Problem**: The ical-buddy `configure` flow accepts `--calendars` as a CLI flag. Google Calendar has a `calendarList` API that can enumerate calendars. There's temptation to add an interactive calendar picker (like the ical-buddy flow had before it was simplified). This is scope creep — the plan says "configure command" not "interactive calendar browser."

**Mitigation**:
- Step 5 configure should accept `--calendars` as comma-separated IDs (same pattern as existing calendar configure).
- The Google provider should accept the `calendars` option from config and filter by calendar ID.
- Do NOT add: calendar list fetching during configure, interactive selection, calendar name-to-ID resolution. These are enhancements for backlog.
- Strict AC adherence: if it's not in the acceptance criteria, it's not in the implementation.

**Verification**: Review Step 5 diff for any calendar enumeration API calls. Configure should only write config, not query Google APIs.

---

## Risk 9: Registry Entry Misalignment with Configure and Factory

**Problem**: Step 2 adds `google-calendar` to the registry. The registry `implements` field must be `['calendar']` to match `apple-calendar`. The `auth.type` should be `'oauth'` (matching Krisp). The configure command currently has `name === 'calendar'` as a special case that writes `provider: 'macos'`. Adding Google requires either: (a) a new `name === 'google-calendar'` handler, or (b) changing the `name === 'calendar'` handler to ask which provider. Option (b) is a UX change with more risk.

**Mitigation**:
- Use option (a): `arete integration configure google-calendar` as a separate path. Simpler, no risk to existing ical-buddy flow.
- Registry name: `'google-calendar'`, `implements: ['calendar']`, `auth: { type: 'oauth' }`.
- Configure handler writes `{ provider: 'google', status: 'active' }` under `integrations.calendar` in config.
- Factory accepts `provider === 'google'` alongside existing `'ical-buddy'` / `'macos'`.

**Verification**: Confirm registry entry `implements` matches `apple-calendar`. Confirm configure command has a handler for `'google-calendar'`. Confirm factory reads `provider === 'google'`.

---

## Risk 10: LEARNINGS.md and Catalog Not Updated

**Problem**: After adding a major new integration, `LEARNINGS.md` and `dev/catalog/capabilities.json` must be updated. If Step 7 only covers SETUP.md, institutional memory and the capabilities catalog fall behind.

**Mitigation**:
- Step 7 acceptance criteria must include:
  - Update `packages/core/src/integrations/LEARNINGS.md` with Google Calendar section (patterns, gotchas, invariants)
  - Update `dev/catalog/capabilities.json` with a `google-calendar-provider` entry
  - Update SETUP.md with Google Cloud Console setup instructions

**Verification**: Check all three files are modified in Step 7's diff.

---

## Dependency Chain

```
Step 1 (types) → Step 2 (registry) → Step 3 (OAuth) → Step 4 (provider) → Step 5 (wire up) → Step 6 (tests) → Step 7 (docs)
```

- Steps 1-2 are low-risk, mechanical changes. Run `npm run typecheck` after each.
- Steps 3-4 are the core implementation. Step 4 depends on Step 3 (needs auth for API calls). Step 3 can reference Krisp patterns.
- Step 5 depends on Steps 1-4 (needs types, registry, auth, and provider to wire together).
- Step 6 depends on Step 5 (needs everything wired to write integration tests).
- Step 7 is independent of code but should be done last to document final state.

**Critical gate**: After Step 5, run `npm run typecheck && npm test` on the full suite before proceeding to Step 6. This catches integration issues between the new code and existing consumers.

---

## Summary Table

| # | Risk | Severity | Likelihood | Category |
|---|------|----------|------------|----------|
| 1 | Producer-consumer provider string mismatch | High | Medium | Integration |
| 2 | Types extraction breaks imports | Medium | Medium | Dependencies |
| 3 | Credential storage overwrites existing creds | High | Medium | Integration |
| 4 | OAuth redirect port mismatch | High | Medium | Platform Issues |
| 5 | Subagent missing integration patterns | Medium | High | Context Gaps |
| 6 | REST client missing API edge cases | Medium | Medium | Code Quality |
| 7 | Token refresh / 401 handling | Low | Medium | Code Quality |
| 8 | Scope creep on calendar selection UX | Low | Medium | Scope Creep |
| 9 | Registry entry misalignment | Medium | Medium | Integration |
| 10 | LEARNINGS.md and catalog not updated | Medium | High | State Tracking |

---

## During Execution Checklist

Before each task, reference this pre-mortem and confirm:
- [ ] Which risks apply to this task?
- [ ] Are the mitigations included in the subagent prompt?
- [ ] After completion: `npm run typecheck && npm test` passes?
