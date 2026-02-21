# Krisp Integration — Research Notes

## Key Findings (2026-02-21)

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

**Auth Flow:** Authorization Code + PKCE (S256) only. No API key, no PAT, no client_credentials.

**HTTP Transport:** Streamable HTTP only (no SSE). Standard JSON-RPC POST to `https://mcp.krisp.ai/mcp`.

**SDK:** `@modelcontextprotocol/client` (v1.x) with `StreamableHTTPClientTransport` handles the transport natively.

### Critical Unknown: `client_id`
Dynamic client registration returns 404. No public developer portal found. Need a pre-registered `client_id` to use the OAuth flow outside of Claude Code. Unclear how to obtain one.

**Possible paths:**
1. Contact Krisp to register Areté as an OAuth client
2. Inspect what `client_id` Claude Code uses when running `claude mcp add --transport http krisp https://mcp.krisp.ai/mcp`
3. Krisp may allow public clients with any localhost redirect_uri (RFC 8252)

### MCP Tool Schema: Unknown
The "Supported Tools" help article is bot-protected. Exact `search_meetings` parameters and `get_document` response schema require either: (a) a logged-in Core account reading the article, or (b) calling `tools/list` with a valid auth token.

### No Local Storage
All data is cloud-stored. No local files to scan. Enterprise plan has on-device option but paths/formats undocumented.

### Native Integrations (push-only, not useful for pull)
Zapier (Core), Slack (Core), HubSpot/Salesforce/Pipedrive (Advanced). These are push-only; Krisp sends data out, not readable programmatically.
