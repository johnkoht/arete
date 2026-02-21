---
title: Krisp Recorder Integration
slug: krisp-recorder-integration
status: idea
size: large
tags: [integration, meeting-recorder, mcp, oauth]
created: 2026-02-21T17:38:59.395Z
updated: 2026-02-21T17:50:00.000Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 4
---

# Krisp Recorder Integration

Integrate Krisp.ai as a meeting recorder in Areté, following the Fathom pattern. Pull recorded meetings (transcripts, summaries, action items) into `resources/meetings/` via `arete pull krisp`.

## Context

Krisp is a noise-canceling tool with meeting recording, AI summaries, and transcription. Unlike Fathom (REST API + API key), Krisp exposes data via a **Model Context Protocol (MCP) server** with **OAuth 2.0 + PKCE** authentication. There is no public REST API and no API key option.

- MCP server: `https://mcp.krisp.ai/mcp`
- OAuth endpoints: `https://api.krisp.ai/platform/v1/oauth2/`
- Required plan: Core (lowest paid tier)
- SDK: `@modelcontextprotocol/client` with `StreamableHTTPClientTransport`

## Critical Gate

**Step 1 must complete before any building.** The `client_id` required for OAuth registration is unknown — there is no public developer portal. Until we have a valid `client_id`, we cannot implement the OAuth flow.

## Plan

### Step 1: Validate OAuth client_id access (go/no-go gate)

Set up your Krisp account at your new job. Then:

- (a) Run `claude mcp add --transport http krisp https://mcp.krisp.ai/mcp` and observe the OAuth flow — what `client_id` does Claude Code use? Is it a public/shared value we can reuse?
- (b) Check Krisp's app/settings for any "API" or "Developer" section that issues credentials
- (c) If neither works, contact Krisp (support or developers page) to register Areté as an OAuth client — explain it's a CLI tool using PKCE (public client, localhost redirect per RFC 8252)
- (d) While authenticated, visit the "Supported Tools" help article to get the exact `search_meetings` parameters and `get_document` response schema (currently bot-blocked)

**Exit criteria:** We have a `client_id` we can use in Areté's OAuth flow AND we know the MCP tool schemas.

**If blocked:** Evaluate a fallback — Krisp's Zapier integration (Core plan) could push to a webhook, or we defer until Krisp opens a developer program.

---

### Step 2: Build the Krisp MCP client

Create `packages/core/src/integrations/krisp/`:

- **`types.ts`** — TypeScript types for Krisp MCP tool responses (meeting list item, document/transcript structure, summary structure, action items)
- **`client.ts`** — `KrispMcpClient` class:
  - OAuth 2.0 + PKCE browser flow (open browser → localhost callback server per RFC 8252 → exchange code → store tokens)
  - Token refresh logic using stored `refresh_token`
  - MCP JSON-RPC calls via `@modelcontextprotocol/client` with `StreamableHTTPClientTransport`
  - Methods: `listMeetings(options)`, `getDocument(id)`
  - Token storage in `.credentials/credentials.yaml` under `krisp:` key
- **`save.ts`** — transform MCP tool responses → `MeetingForSave` (shared interface already used by Fathom)
- **`index.ts`** — `pullKrisp(storage, workspaceRoot, paths, days)` orchestrator

Tests: `packages/core/test/integrations/krisp.test.ts` — unit tests for transform (mock MCP responses), OAuth token storage, date range filtering.

---

### Step 3: Wire into the integration framework

- **`registry.ts`** — add `krisp` entry with `implements: ['meeting-recordings']`, `auth.type: 'oauth2'`
- **`services/integrations.ts`** — add `krisp` dispatch branch in `pull()` and `getIntegrationStatus()`
- **`packages/cli/src/commands/pull.ts`** — add `arete pull krisp [--days N]` branch
- **`packages/cli/src/commands/integration.ts`** — add `arete integration configure krisp` (triggers OAuth browser flow, stores tokens, marks status active)
- **`packages/runtime/integrations/configs/krisp.yaml`** — integration config file
- **`packages/cli/src/commands/setup.ts`** — add Krisp to the post-install suggestions

Tests: CLI wiring tests for `arete pull krisp` (mock `pullKrisp`), configure command stores correct config shape.

---

### Step 4: Tests and documentation

- Ensure all unit tests pass: `npm run typecheck && npm test`
- Update `packages/runtime/integrations/registry.md` — Krisp: Available (was Planned/unlisted)
- Update `packages/runtime/GUIDE.md` sync documentation to include Krisp
- Add `LEARNINGS.md` entry in `packages/core/src/integrations/` for the OAuth PKCE CLI pattern (browser flow, localhost callback, token refresh)
- Memory entry: `memory/entries/2026-02-XX_krisp-integration.md`

---

## Size: Large (4 steps, OAuth complexity + MCP protocol + critical gate)

## Risks

1. **`client_id` blocker** — Step 1 is a hard gate. If Krisp won't register public clients and won't issue a client_id, the integration is blocked until they open a developer program.
2. **MCP tool schema unknown** — `search_meetings` params and `get_document` response shape aren't confirmed. Need a live account to call `tools/list`.
3. **OAuth browser flow complexity** — CLI OAuth with localhost callback is well-understood (GitHub CLI, Google Cloud SDK) but more complex than Fathom's API key. PKCE adds correctness requirements.
4. **Token expiry** — need robust refresh logic; if refresh token expires, user must re-auth via browser.
5. **Krisp plan requirement** — integration only works on Core plan or higher. Free users get nothing. Need clear error messaging.

## Out of Scope

- Webhook-based real-time sync (Advanced plan only, not needed for `arete pull` pattern)
- Krisp AI Voice SDK (noise cancellation — completely separate product surface)
- Windows/Linux support for OAuth browser flow (macOS first, matching our calendar integration pattern)
- Granola integration (separate integration, tracked separately in registry)
