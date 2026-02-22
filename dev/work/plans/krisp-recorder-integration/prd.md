# PRD: Krisp Recorder Integration

**Version**: 1.1 (updated with engineering-lead review)
**Status**: Ready for execution
**Date**: 2026-02-21
**Branch**: `feature/krisp-mcp-integration`
**Pre-mortem**: `dev/work/plans/krisp-recorder-integration/pre-mortem.md`
**Review**: `dev/work/plans/krisp-recorder-integration/review.md`
**Engineering Lead Review**: `dev/work/plans/krisp-recorder-integration/review-engineering-lead.md`

---

## 1. Goal

Add Krisp as a meeting recorder integration in Areté, following the Fathom pattern. Users run `arete integration configure krisp` once to authenticate via browser OAuth, then `arete pull krisp [--days N]` to pull recorded meetings (transcripts, summaries, action items) into `resources/meetings/`.

Krisp exposes data via a hosted **MCP server** (`https://mcp.krisp.ai/mcp`) using **OAuth 2.0 with dynamic client registration**. All blockers were resolved in a pre-build discovery session: dynamic registration works without a developer portal, all OAuth endpoints are live, and the MCP transport is plain JSON-RPC POST.

---

## 2. Architecture Context

### Auth model (confirmed via discovery session — read before implementing)

- **Dynamic client registration**: `POST https://mcp.krisp.ai/.well-known/oauth-registration` — no auth required, returns `client_id` + `client_secret` immediately. Call once per configure run (skip if `client_id` already stored); register with the dynamic port as `redirect_uri`.
- **Confidential client** — ⚠️ NOT a pure public PKCE client. The token endpoint requires `client_secret_basic` (HTTP Basic auth: `Authorization: Basic base64(client_id:client_secret)`) AND the PKCE `code_verifier`. Both are required. Implementing only PKCE without `client_secret_basic` will produce a 401 at token exchange that passes mocked tests but fails in production.
- **5 credential fields** to store in `.credentials/credentials.yaml` under `krisp:`: `client_id`, `client_secret`, `access_token`, `refresh_token`, `expires_at`.
- **Silent refresh**: check `expires_at` before each MCP call; if expired, exchange `refresh_token` for new tokens using `client_secret_basic`.

### OAuth flow ownership — CRITICAL

**All OAuth logic lives in `KrispMcpClient.configure()` in `client.ts`.** The CLI `integration.ts` command calls `client.configure()` and handles persistence (writes credentials + marks arete.yaml active). Nothing OAuth-related — no PKCE, no localhost server, no token exchange — goes in `integration.ts`. This is the only way the OAuth flow is testable.

### MCP transport

Plain JSON-RPC POST over `fetch` — **no `@modelcontextprotocol/client` SDK needed**. Proven with curl. Pattern: `POST https://mcp.krisp.ai/mcp` with `{ jsonrpc: "2.0", method: "tools/call", params: { name, arguments }, id }`.

### Fathom pattern

Follow `packages/core/src/integrations/fathom/` for file structure and orchestrator shape. The credential loading pattern to follow is **`fathom/client.ts` (`loadFathomApiKey()`)** — not `fathom/config.ts` (which is just URL constants).

### Key files to read before starting

- `packages/core/src/integrations/fathom/client.ts` — credential loading pattern (`loadFathomApiKey`)
- `packages/core/src/integrations/fathom/index.ts` — orchestrator pattern (`pullFathom`)
- `packages/core/src/integrations/fathom/save.ts` — `MeetingForSave` transform pattern
- `packages/core/src/integrations/meetings.ts` — shared `MeetingForSave` interface, `saveMeetingFile()`
- `packages/core/src/services/integrations.ts` — **read fully**: `getIntegrationStatus()` private method is hardcoded for Fathom by name; `pull()` dispatches by name; both need `krisp` branches
- `packages/core/src/models/integrations.ts` — `IntegrationAuth.type` union is `'api_key' | 'oauth' | 'none'`; use `'oauth'` (not `'oauth2'`)
- `packages/cli/src/commands/pull.ts` — note hardcoded `available: ['calendar', 'fathom']` array and `info('Available: calendar, fathom')` string on line ~85; both need `'krisp'` added

---

## 3. Tasks

---

### Task 1a: Build Krisp MCP client — core (types skeleton, client, config)

**Description**

Build the OAuth client, MCP transport, credential helpers, and types skeleton. **Does NOT include `save.ts` or `index.ts` yet** — those require verified tool schemas and come in Task 1b after a builder gate.

**Files to create:**

`packages/core/src/integrations/krisp/types.ts`
- Write types with `// UNVERIFIED — confirm with tools/list` annotation on every type and field
- Likely types needed: `KrispMeeting` (list item), `KrispDocument` (full meeting), `KrispTranscriptSegment`, `KrispSummary`, `KrispActionItem`
- Use reasonable shapes based on the Fathom pattern — titles, dates, content fields
- These will be corrected in Task 1b once the builder provides verified schemas

`packages/core/src/integrations/krisp/config.ts`
- `loadKrispCredentials(storage, workspaceRoot)` — reads full `krisp:` section from `.credentials/credentials.yaml`; returns all 5 fields or null if missing
- `saveKrispCredentials(storage, workspaceRoot, creds)` — atomic write of all 5 fields under `krisp:` key
- Pattern to follow: `packages/core/src/integrations/fathom/client.ts` (`loadFathomApiKey` and the YAML parsing pattern)
- **Atomic write**: read existing credentials.yaml, merge `krisp:` section, write entire file in one operation. Never write partial state.

`packages/core/src/integrations/krisp/client.ts` — `KrispMcpClient` class:

*Registration:*
- `register(port: number): Promise<{ client_id: string; client_secret: string }>` — `POST https://mcp.krisp.ai/.well-known/oauth-registration` with body `{ client_name: "Arete CLI", redirect_uris: ["http://localhost:{port}/callback"], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "client_secret_basic" }`

*`configure()` method — ALL OAuth logic lives here:*
1. Bind localhost HTTP server to port `0` (OS-assigned). Read actual bound port.
2. If no `client_id` stored: call `register(port)` to get `client_id` + `client_secret`
3. Generate PKCE: `code_verifier` (random 43–128 char base64url string), `code_challenge = base64url(sha256(code_verifier))`
4. Build authorization URL with `response_type=code`, `client_id`, `redirect_uri=http://localhost:{port}/callback`, all 5 scopes, `code_challenge`, `code_challenge_method=S256`, `state` (random nonce)
5. Open browser: `open <auth_url>` (macOS)
6. Wait for localhost callback with matching `state`; extract `code`
7. Token exchange — ⚠️ CONFIDENTIAL CLIENT:
   - `POST https://api.krisp.ai/platform/v1/oauth2/token`
   - Header: `Authorization: Basic base64(client_id + ':' + client_secret)` (client_secret_basic)
   - Body: `grant_type=authorization_code&code=<code>&redirect_uri=<redirect_uri>&code_verifier=<verifier>`
8. Return `{ access_token, refresh_token, expires_in }` — **do not persist here**; caller persists atomically

*`refreshTokens(credentials)` method:*
- `POST https://api.krisp.ai/platform/v1/oauth2/token`
- Header: `Authorization: Basic base64(client_id + ':' + client_secret)`
- Body: `grant_type=refresh_token&refresh_token=<token>`
- Returns new `{ access_token, expires_in }` — **do not persist here**; caller persists

*`callTool(name, args)` method:*
- Before calling: load credentials, check `expires_at`. If expired: call `refreshTokens()`, persist updated credentials via `saveKrispCredentials()`, then proceed.
- `POST https://mcp.krisp.ai/mcp` with:
  - `Authorization: Bearer <access_token>`
  - Body: `{ jsonrpc: "2.0", method: "tools/call", params: { name, arguments: args }, id: 1 }`
- On 401: throw descriptive error "Krisp session expired — run `arete integration configure krisp`"
- On 403: throw descriptive error "Krisp Core plan required for meeting data access"

*Methods:*
- `listMeetings(options: { startDate?: string; endDate?: string })` — calls `callTool('search_meetings', options)`
- `getDocument(id: string)` — calls `callTool('get_document', { id })`

*Error messages:*
- "Browser closed before completing login — run `arete integration configure krisp` again"
- "Token exchange failed — run `arete integration configure krisp` again"
- "Both tokens expired — run `arete integration configure krisp` to reconnect"
- "Krisp Core plan required for meeting data access"

**Tests**: `packages/core/test/integrations/krisp.test.ts`

Test all of the following scenarios:
1. `callTool` — valid token: assert `fetch` called with `Authorization: Bearer <token>` header AND body `{ jsonrpc: "2.0", method: "tools/call", params: { name: "test_tool", arguments: {} }, id: 1 }` (two explicit assertions, not just "fetch was called")
2. `callTool` — expired `access_token`: assert `refreshTokens` called, new tokens persisted via `saveKrispCredentials`, THEN `fetch` called with new bearer token
3. `refreshTokens` — verify `client_secret_basic` header: `Authorization: Basic base64(client_id + ':' + client_secret)` and `grant_type: refresh_token` in body
4. `refreshTokens` — assert new `access_token` AND updated `expires_at` persisted to credentials (not just returned)
5. Both tokens expired (simulate `refresh_token` exchange returning 401): assert throws "Both tokens expired" error (not a silent failure)
6. 403 on `callTool`: assert throws "Krisp Core plan required" error
7. `loadKrispCredentials` — present and complete: returns all 5 fields
8. `loadKrispCredentials` — missing `krisp:` section: returns null
9. `saveKrispCredentials` — atomic write: verify credentials.yaml contains all 5 fields after save; verify no partial state if write is simulated to fail before completion

**⚠️ BUILDER GATE — do not proceed to Task 1b until:**
1. Authenticate with a Krisp Core account via `claude mcp add --transport http krisp https://mcp.krisp.ai/mcp` or by running the configure flow
2. Call `tools/list` to get actual tool schemas
3. Save the response as `dev/work/plans/krisp-recorder-integration/krisp-tools-schema.json`
4. Task 1b can then implement `save.ts` against the verified schema

**Acceptance criteria**:
- `packages/core/src/integrations/krisp/types.ts` exists with `// UNVERIFIED` annotations on all types
- `packages/core/src/integrations/krisp/config.ts` exports `loadKrispCredentials()` and `saveKrispCredentials()`; atomic write verified by test
- `packages/core/src/integrations/krisp/client.ts` exports `KrispMcpClient` with `configure()`, `refreshTokens()`, `callTool()`, `listMeetings()`, `getDocument()`
- All 9 test scenarios above pass
- `@modelcontextprotocol/client` is NOT added to `packages/core/package.json`
- `npm run typecheck` passes
- `npm test` passes

---

### Task 1b: Implement save.ts and index.ts using verified schemas (builder-gated)

**Pre-requisite**: `dev/work/plans/krisp-recorder-integration/krisp-tools-schema.json` must exist with the real `tools/list` output before this task starts.

**Description**

Using the verified Krisp tool schemas, finalize `types.ts`, implement the meeting transform (`save.ts`), and complete the pull orchestrator (`index.ts`). Also update `credentials.yaml.example`.

**Files to create/update:**

`packages/core/src/integrations/krisp/types.ts` (update)
- Replace `// UNVERIFIED` types with types matching the real schema from `krisp-tools-schema.json`
- Add `// Verified against tools/list YYYY-MM-DD` comment block at top of file

`packages/core/src/integrations/krisp/save.ts` (create — only after types verified)
- Transform `KrispDocument` MCP response → `MeetingForSave` (from `../meetings.ts`)
- Handle missing/null fields gracefully: `summary ?? ''`, `transcript ?? ''`, `actionItems ?? []` — do not throw on absent fields
- Follow `packages/core/src/integrations/fathom/save.ts` as reference

`packages/core/src/integrations/krisp/index.ts` (create)
- `pullKrisp(storage, workspaceRoot, paths, days)` orchestrator
- Follow `packages/core/src/integrations/fathom/index.ts` exactly — same signature, same loop, same error handling

`.credentials/credentials.yaml.example` (update)
- Add `krisp:` section under the meetings heading:
```yaml
# Krisp - Meeting recording with AI summaries
# Run: arete integration configure krisp
# All fields below are set automatically during configure.
krisp:
  client_id: ""         # set automatically
  client_secret: ""     # set automatically
  access_token: ""      # set automatically
  refresh_token: ""     # set automatically
  expires_at: ""        # ISO timestamp, managed automatically
```

**Add to `packages/core/test/integrations/krisp.test.ts`:**
10. Transform (`save.ts`) — full document: mock a complete `KrispDocument` → assert `MeetingForSave` has correct `title`, `date`, `summary`, `transcript`, `actionItems`, `source: 'krisp'`
11. Transform — null/missing fields: mock a `KrispDocument` with `summary: null`, `transcript: undefined`, `actionItems: []` → assert `MeetingForSave` has empty strings/arrays (not throws, not undefined)
12. `pullKrisp()` — happy path: mock `listMeetings` returning 2 items + mock `getDocument` returning full docs → assert `saved: 2, errors: []`
13. `pullKrisp()` — partial failure: mock `getDocument` throwing on second item → assert `saved: 1, errors: ['...']` (no crash)

**Acceptance criteria**:
- `types.ts` has `// Verified against tools/list` comment with date; no `// UNVERIFIED` annotations remain
- `save.ts` transforms `KrispDocument` to valid `MeetingForSave`; handles null/missing fields without throwing
- `index.ts` exports `pullKrisp(storage, workspaceRoot, paths, days)`
- `.credentials/credentials.yaml.example` has `krisp:` section with all 5 fields
- All 4 new test scenarios (10–13) pass
- `npm run typecheck` passes
- `npm test` passes

---

### Task 2: Wire into the integration framework

**Description**

Register Krisp in the registry, extend the service layer, add CLI commands. Read `packages/core/src/services/integrations.ts` and `packages/cli/src/commands/pull.ts` **in full** before making changes — both have implicit patterns that must be followed.

**Files to modify/create:**

`packages/core/src/integrations/registry.ts`
- Add `krisp` entry. Use **`auth: { type: 'oauth' }` — not `'oauth2'`** (type union is `'api_key' | 'oauth' | 'none'`; `'oauth2'` is a typecheck failure):
```typescript
krisp: {
  name: 'krisp',
  displayName: 'Krisp',
  description: 'Meeting recording with AI summaries, transcripts, and action items',
  implements: ['meeting-recordings'],
  auth: { type: 'oauth' },
  status: 'available',
}
```

`packages/core/src/services/integrations.ts` — read this file fully before editing:
- Add `krisp` dispatch branch in `pull()`: call `pullKrisp(this.storage, workspaceRoot, paths, days)` (import from `'../integrations/krisp/index.js'`)
- Extend `getIntegrationStatus()` for `krisp`: load credentials via `loadKrispCredentials()`; return `'active'` if `access_token` present and non-empty, `'inactive'` otherwise
- Refactor: extract `private async loadOAuthTokenStatus(workspaceRoot: string, name: string): Promise<IntegrationStatus>` helper to avoid duplicating the credentials.yaml read pattern for future OAuth integrations

`packages/cli/src/commands/pull.ts` — read fully before editing:
- Add `krisp` dispatch branch following the Fathom branch pattern (around line 43)
- Update `available: ['calendar', 'fathom']` array → `['calendar', 'fathom', 'krisp']` (line ~80)
- Update `info('Available: calendar, fathom')` string → `info('Available: calendar, fathom, krisp')` (line ~85)

`packages/cli/src/commands/integration.ts` — add `arete integration configure krisp`:
- Calls `client.configure()` to run the full OAuth browser flow (do NOT re-implement OAuth here)
- **Dual-write on success**:
  1. `saveKrispCredentials(storage, workspaceRoot, creds)` — writes `client_id`, `client_secret`, `access_token`, `refresh_token`, `expires_at` to `.credentials/credentials.yaml`
  2. `integrationService.configure(workspaceRoot, 'krisp', { status: 'active' })` — writes to `arete.yaml` so `arete integration list` shows active
- Both writes must succeed; if credentials write fails, do not write to arete.yaml
- User-visible confirmation: "✅ Krisp connected. Run `arete pull krisp` to sync meetings."

`packages/runtime/integrations/configs/krisp.yaml` — **CREATE** (does not exist):
- Follow `packages/runtime/integrations/configs/fathom.yaml` pattern

`packages/cli/src/commands/setup.ts`
- Add Krisp to post-install integration suggestions alongside Fathom

**Tests:**
- `arete pull krisp [--days N]` dispatches to `pullKrisp()` with correct `days` value (mock `pullKrisp`)
- `arete pull krisp` with unknown integration falls through to "Available: calendar, fathom, krisp" message
- `arete integration configure krisp` — success: writes all 5 credential fields to credentials.yaml AND marks `krisp.status: active` in arete.yaml (dual-write, both verified)
- `arete integration configure krisp` — with existing `client_id` stored: skips registration, goes straight to browser flow
- `getIntegrationStatus('krisp')` — credentials.yaml has `krisp.access_token`: returns `'active'`
- `getIntegrationStatus('krisp')` — credentials.yaml has no `krisp:` section: returns `'inactive'`
- `getIntegrationStatus('krisp')` — credentials.yaml has `krisp:` section but empty `access_token`: returns `'inactive'`

**Acceptance criteria**:
- `registry.ts` has `krisp` entry with `auth: { type: 'oauth' }` — no typecheck errors
- `pull.ts` updated: branch dispatches to `pullKrisp`, both `available` references include `'krisp'`
- `integration.ts` configure command performs dual-write (credentials.yaml + arete.yaml) verified by test
- `getIntegrationStatus('krisp')` returns correct status for all 3 credential states (verified by tests)
- `packages/runtime/integrations/configs/krisp.yaml` created
- `npm run typecheck` passes
- `npm test` passes including all 7 new tests above

---

### Task 3: Tests, documentation, and memory entry

**Description**

Run the full test suite, create integration docs, add a LEARNINGS.md entry for the OAuth pattern, and create the build memory entry. Note: several of these files **do not exist yet** and must be created, not updated.

**Steps:**

1. **`npm run typecheck && npm test`** — full suite, zero regressions vs. pre-Krisp baseline

2. **`packages/runtime/integrations/registry.md`** — this file exists; add Krisp entry:
   - Name: Krisp | Status: Available | Auth: oauth (dynamic registration + browser flow)
   - Requires: Core plan or higher
   - Commands: `arete integration configure krisp` / `arete pull krisp [--days N]`

3. **`packages/runtime/GUIDE.md`** — **CREATE this file** (it does not exist). Model it after any existing guide docs in the repo, or create a clean integration guide section. Include:
   - `arete pull krisp [--days N]` — pull meetings from Krisp
   - Note: Core plan required; first run requires `arete integration configure krisp` (opens browser)
   - Note: configure is one-time; subsequent pulls are silent

4. **`packages/core/src/integrations/LEARNINGS.md`** — **CREATE this file** (it does not exist). Cover all 5 patterns:
   - **Dynamic client registration**: no developer portal; `POST /oauth-registration` with no auth issues `client_id` + `client_secret`. Pattern for any MCP-based OAuth integration.
   - **Confidential client + PKCE**: Krisp requires `client_secret_basic` at token endpoint *and* PKCE `code_verifier`. Always check `token_endpoint_auth_methods_supported` in AS metadata — do not assume public client.
   - **Dynamic port binding**: use port `0` (OS-assigned) for localhost callback; re-register `redirect_uri` per configure run. Avoids `EADDRINUSE` on hardcoded ports.
   - **5-field credential storage + atomic write**: write all 5 fields at once or nothing; `expires_at` ISO timestamp enables silent refresh without extra API calls.
   - **No MCP SDK needed**: Krisp MCP is plain JSON-RPC POST; `fetch` + ~30-line wrapper is sufficient and avoids unvetted dependencies. Check AS metadata first before assuming SDK is required.

5. **`packages/runtime/integrations/configs/krisp.yaml`** — should already exist from Task 2; verify present

6. **`memory/entries/2026-02-XX_krisp-integration.md`** — **CREATE** (use today's date). Include:
   - Date, title, one-paragraph summary
   - Key architectural decisions: dynamic registration, confidential client, fetch JSON-RPC, OAuth in client.ts
   - Pre-mortem effectiveness: which of the 8 risks materialized, which didn't
   - Learnings section with any collaboration observations

7. **`memory/MEMORY.md`** — update index: add new entry at top

**Acceptance criteria**:
- `npm run typecheck` passes — zero type errors
- `npm test` passes — full suite, no regressions
- `packages/runtime/integrations/registry.md` has Krisp entry with correct details
- `packages/runtime/GUIDE.md` created with Krisp pull/configure documentation
- `packages/core/src/integrations/LEARNINGS.md` created with all 5 patterns documented
- `memory/entries/2026-02-XX_krisp-integration.md` created and indexed in `MEMORY.md`

---

## 4. Task Dependencies

```
Task 1a (client, types skeleton, config)
   ↓
[BUILDER GATE: authenticate Krisp, call tools/list, save krisp-tools-schema.json]
   ↓
Task 1b (save.ts, index.ts — verified schemas)
   ↓
Task 2 (wiring: registry, service, CLI)
   ↓
Task 3 (docs, memory)
```

Tasks are strictly sequential. Each depends on the previous completing fully.

---

## 5. Out of Scope

- `@modelcontextprotocol/client` SDK — plain `fetch` is sufficient; do not add this dependency
- Webhook-based real-time sync (Advanced plan only)
- Krisp AI Voice SDK (noise cancellation — separate product)
- Windows/Linux OAuth browser flow (macOS first)
- Granola integration (separate plan)

---

## 6. Pre-Mortem Summary (top risks to watch during execution)

1. **Confidential client auth** — token exchange needs `client_secret_basic` + PKCE. Mocked tests won't catch an incorrect implementation; only live testing will. Test #3 specifically checks the Basic auth header.
2. **`getIntegrationStatus` hardcoded for Fathom** — read `services/integrations.ts` fully before editing; private method must be extended.
3. **Dual-write in configure** — credentials.yaml AND arete.yaml. Test #3 in Task 2 verifies both. If only one is written, either `pull` or `integration list` will be broken.
4. **OAuth flow in wrong file** — everything OAuth lives in `client.ts`. Nothing OAuth in `integration.ts`.
5. **Three files to CREATE, not update** — `GUIDE.md`, `LEARNINGS.md`, builder gate schema file.
6. **`pull.ts` hardcoded strings** — both the array `['calendar', 'fathom']` and the `info()` string need `'krisp'` added.
