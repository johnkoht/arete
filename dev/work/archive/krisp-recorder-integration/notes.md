# Krisp Integration — Research Notes

## Discovery Session (2026-02-21) — Gate Cleared ✅

Live curl tests confirmed the integration is fully feasible. No developer portal or Krisp contact needed.

### Dynamic Client Registration Works
`POST https://mcp.krisp.ai/.well-known/oauth-registration` registers a new client on the fly:
```json
{
  "client_id": "<uuid>",
  "client_secret": "<uuid>",
  "token_endpoint_auth_method": "client_secret_basic",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "scope": "user::me::read user::meetings:metadata::read ..."
}
```
Areté calls this once on first-run configure, stores `client_id` + `client_secret`, then proceeds to the OAuth browser flow.

### Auth Model Correction
The original plan assumed a **pure public PKCE client** (`token_endpoint_auth_method: none`). Krisp overrides this and requires `client_secret_basic` — confidential client. PKCE S256 is still required for the auth code flow, but the token endpoint exchange also needs HTTP Basic auth with the `client_secret`.

### All Endpoints Confirmed Live
| Endpoint | Status |
|---|---|
| `GET /.well-known/oauth-protected-resource` | ✅ Returns scopes |
| `GET /.well-known/oauth-authorization-server` | ✅ Returns full AS metadata |
| `POST /.well-known/oauth-registration` | ✅ Returns client credentials |
| `POST /mcp` (unauthenticated) | ✅ Returns 401 + `WWW-Authenticate: Bearer` |

### Credentials to Store
```yaml
krisp:
  client_id: ""       # from registration
  client_secret: ""   # from registration
  access_token: ""    # from OAuth flow
  refresh_token: ""   # from OAuth flow
  expires_at: ""      # for silent refresh logic
```

### Remaining Unknown
MCP tool schemas (`search_meetings` exact params, `get_document` response shape) — still need a live Core account token to call `tools/list`. Resolve early in Step 1 development.

---

## Background Research (2026-02-21)

### No Public REST API
Krisp has no REST API for meeting data. `krisp.ai/api` is a 404. Their "developers" page is exclusively an AI Voice SDK (noise cancellation for B2B embedding) — unrelated to meeting data.

### MCP Server — Primary Access Path
Krisp has a hosted MCP (Model Context Protocol) server at `https://mcp.krisp.ai/mcp` designed for AI tool integration.

**Capabilities:**
- Search meetings by topic, content, attendees, date range
- Get full transcripts, summaries, key points, action items by document ID
- List upcoming calendar meetings (1–14 days ahead)
- Available on **Core plan** (lowest paid tier)

**OAuth Endpoints (all confirmed live):**
| Endpoint | URL |
|---|---|
| Discovery | `GET https://mcp.krisp.ai/.well-known/oauth-protected-resource` |
| AS Metadata | `GET https://mcp.krisp.ai/.well-known/oauth-authorization-server` |
| Authorization | `https://api.krisp.ai/platform/v1/oauth2/authorize` |
| Token exchange | `https://api.krisp.ai/platform/v1/oauth2/token` |
| MCP endpoint | `https://mcp.krisp.ai/mcp` (POST, JSON-RPC) |

**OAuth Scopes:**
`user::meetings::list`, `user::meetings:metadata::read`, `user::meetings:notes::read`, `user::meetings:transcripts::read`, `user::activities::list`, `user::me::read`, `user::subscriptions::read`

**Auth Flow:** Authorization Code + PKCE (S256) + `client_secret_basic`. Confidential client (see Discovery Session above for correction). No API key, no PAT, no client_credentials.

**HTTP Transport:** Streamable HTTP only (no SSE). Standard JSON-RPC POST to `https://mcp.krisp.ai/mcp`.

**SDK:** `@modelcontextprotocol/client` (v1.x) with `StreamableHTTPClientTransport` handles the transport natively.

### `client_id`: ✅ RESOLVED — Dynamic Registration
~~Dynamic client registration returns 404.~~ Corrected: `POST https://mcp.krisp.ai/.well-known/oauth-registration` works and returns `client_id` + `client_secret` with no authentication required. See Discovery Session above.

### MCP Tool Schema: Still Unknown
The "Supported Tools" help article is bot-protected. Exact `search_meetings` parameters and `get_document` response schema require either: (a) a logged-in Core account reading the article, or (b) calling `tools/list` with a valid auth token. Resolve early in Step 1 dev.

### No Local Storage
All data is cloud-stored. No local files to scan. Enterprise plan has on-device option but paths/formats undocumented.

### Native Integrations (push-only, not useful for pull)
Zapier (Core), Slack (Core), HubSpot/Salesforce/Pipedrive (Advanced). These are push-only; Krisp sends data out, not readable programmatically.
