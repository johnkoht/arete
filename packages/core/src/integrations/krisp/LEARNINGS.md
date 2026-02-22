# Krisp MCP Integration — LEARNINGS

## Krisp MCP API Shape (2026-02-21)

Verified against live Krisp Core account. Key differences from what you'd assume:

### MCP Streamable HTTP requires Accept header
- **Must send**: `Accept: application/json, text/event-stream` on every POST
- Without it, Krisp returns **406 Not Acceptable**
- Krisp always responds with `text/event-stream` (SSE), not `application/json`

### SSE response format
- Responses come as `event: message\ndata: {JSON}\n\n`
- The JSON is a full JSON-RPC envelope with `result` containing the MCP tool result

### MCP tools/call wraps results in a content envelope
- `result` from tools/call is NOT the raw data — it's `{ content: [...], structuredContent: {...} }`
- `structuredContent` has the parsed data; `content[0].text` has a human-readable version
- Always prefer `structuredContent` when present

### search_meetings response shape
- Returns `{ criteria, meetings: [...], count }` in `structuredContent`
- Meetings use `meeting_id` (not `id`)
- `speakers` are plain strings `["Anna", "Bob"]`, not objects
- `transcript` is a **reference** `{ status, note }` pointing to getDocument, not inline text

### get_document response shape
- Returns `{ documentId, document }` in `structuredContent`
- `document` is markdown containing: recording download link + transcript sections
- The transcript includes speaker names and timestamps in markdown format

### Date filtering
- `before: "2026-02-22"` appears to mean "before start of that day" — meetings with UTC dates
  on that day are excluded. Add +1 day to `before` to include today's meetings across timezones.
