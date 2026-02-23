## How This Works

Integrations follow a provider pattern: a factory function reads `AreteConfig` and returns a provider instance (or `null` if not configured/available). The calendar integration lives in `packages/core/src/integrations/calendar/` — `index.ts` exports `getCalendarProvider(config)`, which delegates to `ical-buddy.ts` for the macOS implementation. The Fathom integration is in `packages/core/src/integrations/fathom/`. Integration metadata (names, auth type, display info) is registered in `registry.ts`. The `IntegrationService` in `packages/core/src/services/integrations.ts` orchestrates pull operations. Tests for calendar live in `packages/core/test/` (pulled from the pre-monorepo structure; coverage for edge cases may have gaps per `2026-02-15_monorepo-intelligence-refactor-learnings.md`).

## Key References

- `packages/core/src/integrations/calendar/index.ts` — `getCalendarProvider(config)`, `listIcalBuddyCalendars()`, `'macos'` alias handling
- `packages/core/src/integrations/calendar/ical-buddy.ts` — `CalendarProvider` interface, `getIcalBuddyProvider()`, `listIcalBuddyCalendars()`, `parseIcalBuddyCalendars()`, `icalBuddy` binary
- `packages/core/src/integrations/fathom/client.ts` — `loadFathomApiKey()`, `saveFathomApiKey()`, Fathom API client
- `packages/core/src/integrations/registry.ts` — `INTEGRATIONS` map (`fathom`, `apple-calendar`, `krisp`)
- `packages/core/src/services/integrations.ts` — `IntegrationService`, pull orchestration
- `packages/cli/src/commands/integration.ts` — `configureCalendar()`, writes `provider: 'macos'` to `arete.yaml`
- `packages/cli/src/commands/onboard.ts` — `runIntegrationPhase()`, interactive calendar/Fathom/Krisp setup
- `packages/cli/src/commands/pull.ts` — `pullCalendar()`, calls `getCalendarProvider(config)`
- Memory entries: `2026-02-11_calendar-provider-macos-alias.md`, `2026-02-11_calendar-integration-ux-and-learnings.md`

## Gotchas

- **`arete integration configure calendar` writes `provider: 'macos'` but the binary is called `icalBuddy`.** The Homebrew formula is `ical-buddy`; the installed binary is `icalBuddy` (camelCase). The factory (`calendar/index.ts` L14-18) must accept both `'ical-buddy'` and `'macos'` as provider values. In 2026-02-11, `getCalendarProvider` was only checking `provider === 'ical-buddy'`, so config written by `configure` was silently rejected by `pull`. Fix and regression test are in `packages/core/test/integrations/calendar.test.ts` ("accepts provider 'macos' as alias for ical-buddy") and `packages/cli/test/commands/integration.test.ts` ("configures calendar integration with default macos provider"). See `2026-02-11_calendar-provider-macos-alias.md`.

- **Use `icalBuddy` (camelCase) for `which` checks and `execFile` calls; keep `ical-buddy` only in user-facing install messages.** In 2026-02-11 the code was checking/invoking `ical-buddy` (wrong) — the binary on disk is `icalBuddy`. Using the wrong name causes "command not found" even when icalBuddy is installed. See `ical-buddy.ts` and `2026-02-11_calendar-integration-ux-and-learnings.md`.

- **`icalBuddy calendars` output is multi-line blocks, not one calendar per line.** Lines starting with `• ` are calendar names; following lines (`type: CalDAV`, `UID: ...`, etc.) are metadata. A naive `output.split('\n')` will include metadata lines as calendar choices. Parse by filtering for lines starting with `• `. Before the 2026-02-11 fix, raw icalBuddy output was displayed directly as options, producing broken UX. See `2026-02-11_calendar-integration-ux-and-learnings.md`.

- **Config producer–consumer alignment: trace every reader when a `configure` command writes a config value.** When `configureCalendar()` in `integration.ts` writes a value like `provider: 'macos'`, every reader of that config field (`getCalendarProvider`, status commands, etc.) must accept the exact key/value written. The 2026-02-11 incident was caused by the producer and consumer using different string values for the same concept. Pattern from `2026-02-11_calendar-provider-macos-alias.md`: "When one command writes a config value, every consumer of that config must accept that value."

- **`getCalendarProvider()` is async — always `await` it.** The signature is `async function getCalendarProvider(config): Promise<CalendarProvider | null>`. Forgetting `await` gives a truthy `Promise` that passes the null check, then crashes at runtime when `.getTodayEvents()` is called on the Promise object. Every caller must `await getCalendarProvider(config)`. See `packages/core/src/integrations/calendar/index.ts`.

- **`getCalendarProvider()` returns `null` (not throws) when the provider is unavailable.** Callers in `pull.ts` check for `null` before using the provider. Adding a new provider that might not be installed must follow this null-return pattern — never throw from the factory when the dependency is simply absent.

- **`listIcalBuddyCalendars()` uses DI for testability.** Accepts optional `deps` parameter `{ which?, exec? }` with production defaults. Tests inject mocks instead of requiring the real icalBuddy binary. Returns `{ available: boolean, calendars: string[] }` — never throws. Added 2026-02-22.

- **`saveFathomApiKey()` does shallow merge on the `fathom` block.** It reads `.credentials/credentials.yaml`, spreads `{ ...existing, fathom: { api_key } }`, and writes back. This preserves other integration credentials (e.g., krisp) but replaces the entire `fathom` section. If Fathom adds more config fields in the future, they'd be overwritten. Currently safe since only `api_key` exists. Added 2026-02-22.

- **Credential files live in `.credentials/credentials.yaml` (gitignored).** Both Fathom (`fathom.api_key`) and Krisp (`krisp.client_id`, `krisp.client_secret`, etc.) store credentials here. Always use read-modify-write to avoid clobbering other integrations' keys. The `loadFathomApiKey()` function also checks `FATHOM_API_KEY` env var first (env var takes precedence).

## Invariants

- All integration providers must implement the provider interface (e.g. `CalendarProvider` with `name`, `isAvailable()`, and event-fetch methods). `getCalendarProvider()` must call `isAvailable()` and return `null` if false.
- The `INTEGRATIONS` registry in `registry.ts` is the canonical list of supported integrations for `arete integration list`. Keep it in sync with actual implemented providers.
- `IntegrationService` in `services/integrations.ts` does not know about specific integration implementations — it delegates to provider factories.

## Testing Gaps

- Calendar provider edge cases (all-day events, events with no attendees, multi-line notes fields in icalBuddy output) had reduced test coverage after the monorepo refactor cleanup (`2026-02-15` risk 5 note: "calendar provider edge cases" specifically called out).
- ~~No test covers the `icalBuddy calendars` multi-line parsing against real icalBuddy output fixtures.~~ **Resolved 2026-02-22**: `parseIcalBuddyCalendars()` + `listIcalBuddyCalendars()` added with 11 fixture-based tests covering multi-calendar, metadata lines, empty output, missing binary, and exec errors.

## Patterns That Work

- **Regression test at the config boundary**: Add a test that uses the exact value written by `configure` and asserts the `pull` command does NOT error. This catches the producer-consumer mismatch before it reaches production. Pattern from `2026-02-11_calendar-provider-macos-alias.md`.
- **Comment at the consumer**: A one-line comment at the factory ("configure writes 'macos'; accept both") helps future refactors avoid dropping the alias. Already in `calendar/index.ts`.

## Pre-Edit Checklist

- [ ] If adding a new calendar config field: check every consumer in `pull.ts`, `integration.ts`, `status.ts` for alignment
- [ ] If changing the `provider` string written by `configure`: update `getCalendarProvider()` to accept the new value, and update the regression test in `test/commands/pull-calendar.test.ts`
- [ ] Verify `which icalBuddy` (camelCase) is used, not `which ical-buddy`, in any availability check
- [ ] Run `npm test` to verify regression tests still pass: `packages/core/test/integrations/calendar.test.ts` and `packages/cli/test/commands/integration.test.ts`
- [ ] If adding a new integration: register it in `registry.ts`, implement provider interface, add factory to `calendar/index.ts` pattern

---

## Google Calendar Integration (2026-02-22)

Patterns and gotchas from shipping `google-calendar` provider + OAuth flow.

### 1. Keep OAuth errors user-actionable (no transport noise)

Google OAuth and token endpoints return low-level statuses that are not useful to end users. Map errors to next actions:

- `invalid_grant` → token/consent expired, rerun `arete integration configure google-calendar`
- `invalid_client` → client credentials are wrong/missing; check `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- network errors → tell user to retry/check connectivity
- 5xx errors → provider temporarily unavailable

Do not bubble raw Node/network messages or stack traces from integration internals.

### 2. Calendar API failures should preserve context + remediation

In `google-calendar.ts`, map common statuses to clear messages:

- 401 → re-authenticate (`configure google-calendar`)
- 403 → permission denied for specific calendar ID
- 404 → calendar not found
- 429 → rate limit, retry later

For unknown statuses, prefer `HTTP <code>` messaging over raw `statusText` and always keep text user-safe.

### 3. Document the unverified-app OAuth warning

During setup, some users will see Google's unverified-app interstitial. Documentation must include:

1. **Advanced**
2. **Go to Areté (unsafe)**

Without this note, setup appears broken even though flow is functioning.

### 4. Producer-consumer invariant still applies to Google provider strings

`integration configure google-calendar` writes calendar config under `integrations.calendar.provider: 'google'`. Factory readers must continue accepting `'google'` exactly. If the configure output string changes, update all consumers and regression tests together.

---

## Krisp Integration (2026-02-21)

Patterns learned from the Krisp MCP OAuth integration. Applicable to any future MCP-based OAuth integration.

### 1. Dynamic Client Registration

No developer portal required. `POST https://mcp.krisp.ai/.well-known/oauth-registration` with no auth returns `{ client_id, client_secret }` immediately. Register once per configure run (or reuse stored `client_id`). Include `redirect_uri` (with the actual dynamic port) in the registration body.

**Pattern**: Call register before building the auth URL; skip if `client_id` already in credentials.

### 2. Confidential Client + PKCE — Both Required

Krisp requires **`client_secret_basic`** at the token endpoint (`Authorization: Basic base64(client_id:client_secret)`) AND PKCE (`code_verifier` in body). Pure PKCE without `client_secret_basic` returns a 401 that passes all mocked tests but fails in production. Always check `token_endpoint_auth_methods_supported` in AS metadata before assuming public client.

**Pattern**: Check AS metadata. If `client_secret_basic` is listed, you need Basic auth at token exchange — PKCE alone is not sufficient.

### 3. Dynamic Port Binding (port 0)

Use port `0` for the localhost OAuth callback server — the OS assigns an available port. Read the actual bound port after `server.listen(0)` via `(server.address() as AddressInfo).port`. Re-register the `redirect_uri` per configure run so the dynamic port is always valid. This avoids `EADDRINUSE` errors from hardcoded ports.

### 4. 5-Field Credential Storage — Atomic Write, Unix Timestamp

Krisp credentials require 5 fields: `client_id`, `client_secret`, `access_token`, `refresh_token`, `expires_at`. Write all 5 atomically (read-modify-write on credentials.yaml) or write nothing — never partial state.

**`expires_at` is stored as a Unix timestamp in seconds** (not an ISO string): `Math.floor(Date.now() / 1000) + expires_in`. Check `expires_at < Math.floor(Date.now() / 1000)` before each API call to trigger silent refresh.

### 5. No MCP SDK Needed

The Krisp MCP server uses plain JSON-RPC POST over HTTPS — no `@modelcontextprotocol/client` SDK required. A `fetch` wrapper (~30 lines) is sufficient:
```typescript
POST https://mcp.krisp.ai/mcp
Authorization: Bearer <access_token>
Body: { jsonrpc: "2.0", method: "tools/call", params: { name, arguments: args }, id: 1 }
```
Before adding any SDK dependency, verify the transport protocol. If it's JSON-RPC over HTTP/HTTPS, `fetch` is enough.
