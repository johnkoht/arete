# GWS Integration — LEARNINGS

## CLI Command Structure (Verified 2026-04-05)

The `gws` CLI uses a **resource-path + `--params` JSON** pattern, NOT per-flag args.

### Correct command format
```
gws <service> <resource> [sub-resource] <method> --format json --params '{"key":"value"}'
```

All parameters go in a single `--params` JSON blob. Multi-word resource paths are separate args.

### Verified command paths

| Operation | Command |
|-----------|---------|
| List Gmail messages (IDs only) | `gws gmail users messages list --params '{"userId":"me","q":"...","maxResults":N}'` |
| Get Gmail message (with headers) | `gws gmail users messages get --params '{"userId":"me","id":"...","format":"metadata","metadataHeaders":["From","Subject","Date"]}'` |
| List Drive files | `gws drive files list --params '{"q":"...","pageSize":N}'` |
| Get Drive file metadata | `gws drive files get --params '{"fileId":"..."}'` |
| Get Google Doc content | `gws docs documents get --params '{"documentId":"..."}'` |
| Get Spreadsheet | `gws sheets spreadsheets get --params '{"spreadsheetId":"..."}'` |
| Get Sheet range | `gws sheets spreadsheets values get --params '{"spreadsheetId":"...","range":"Sheet1!A1:B2"}'` |
| Search contacts | `gws people people searchContacts --params '{"query":"...","readMask":"emailAddresses,names,organizations,photos","pageSize":N}'` |
| Search directory | `gws people people searchDirectoryPeople --params '{"query":"...","readMask":"emailAddresses,names,organizations,photos","sources":["DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE"],"pageSize":N}'` |
| Calendar smoke test | `gws calendar events list --params '{"maxResults":1}'` |

### Gmail messages.list returns IDs only
`users messages list` returns `{messages: [{id, threadId}]}` — **no headers, no snippet, no labels**.
To get subject/from/date, you must call `users messages get` per message ID (cap at ~10 for performance).
This means `searchThreads` requires N+1 calls. See `gmail.ts` for the two-call implementation.

### Drive uses `pageSize` not `maxResults`
Drive API uses `pageSize` for pagination; Gmail uses `maxResults`. Don't mix them.

### Drive `q` requires query syntax, not free text
The `q` param for `files list` must be a Drive query expression, not a plain search term.
Free text like `"email template"` causes `error[api]: Invalid Value`.
Valid forms: `fullText contains 'email template'`, `name contains 'roadmap'`, `mimeType = '...'`.
The CLI (`pullDriveHelper`) auto-wraps plain text as `fullText contains '...'`. Internal callers
(e.g. `getRecentDocs`, `getRecentFiles`) always pass Drive operator syntax directly — that's correct.

### Arrays in --params work
The gws CLI accepts arrays in the JSON blob: `{"metadataHeaders":["From","Subject","Date"]}` and
`{"sources":["DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE"]}` both work correctly.

---

## Pre-Build Checklist for Any CLI Wrapper

**Run `gws <service> --help` and `gws <service> <resource> --help` before writing a single adapter.**
Document the actual subcommand tree in this file. Never assume command structure from API docs alone —
the CLI may have a different shape. Evidence: the original GWS adapter was built without running
`--help` first; the command structure was invented and broke immediately on real use (2026-04-05).

Fixture JSON files must be **snapshotted from real CLI output**, not hand-crafted:
```bash
gws gmail users messages list --params '{"userId":"me","maxResults":1}' > fixtures/gmail-message-ids.json
gws gmail users messages get --params '{"userId":"me","id":"<real-id>","format":"metadata"}' > fixtures/gmail-message-detail.json
```
