# Krisp MCP Integration — LEARNINGS

## Krisp MCP API Shape (Updated 2026-03-02)

Verified against live Krisp Core account. Key differences from what you'd assume:

### get_document → get_multiple_documents (2026-03-02)
- Krisp removed `get_document` tool, replaced with `get_multiple_documents`
- Takes `{ ids: string[] }` instead of `{ documentId: string }`
- Returns `{ results: [{ id, document }] }` in structuredContent
- Batch-fetch all meeting documents at once for efficiency

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

### get_multiple_documents response shape
- Returns `{ results: [{ id, document }] }` in `structuredContent`
- `document` is markdown containing: recording download link + transcript sections
- The transcript includes speaker names and timestamps in markdown format
- **Note**: Legacy `get_document` was removed; use `get_multiple_documents` with single-item array

### Date filtering
- `before: "2026-02-22"` appears to mean "before start of that day" — meetings with UTC dates
  on that day are excluded. Add +1 day to `before` to include today's meetings across timezones.

### Summaries and meeting_notes (2026-03-02)
- `search_meetings` accepts fields including `meeting_notes`, `detailed_summary`, `key_points`, `action_items`
- These may be returned as top-level fields OR nested inside a `meeting_notes` object
- Not all meetings have summaries — depends on Krisp processing status and plan
- Meetings still processing may return empty documents from `get_multiple_documents`
