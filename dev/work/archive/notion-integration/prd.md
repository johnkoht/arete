# PRD: Notion Integration — Phase 1: Pull Pages + Infrastructure

**Version**: 1.0
**Status**: Ready for execution
**Date**: 2026-02-22
**Branch**: `feature/notion-integration`

---

## 1. Problem & Goals

### Problem

Users have significant content in Notion (documentation, notes, specs, research) that Areté can't access. Without integration, users must manually copy-paste context into Areté or upload files — a high-friction barrier that prevents Areté from being truly empowering. Notion is the second-highest priority integration (after calendar) because of how much PM context lives there.

### Goals

1. **Pull Notion pages into the Areté workspace**: Users can paste Notion URLs (single or batch) and Areté fetches, converts to markdown, and saves them to a specified destination — fully indexed for intelligence layer access.
2. **Follow existing integration patterns**: Notion follows the Fathom/Krisp provider pattern (registry, service wiring, CLI commands) so it's consistent and maintainable.
3. **Guide MCP setup for ad-hoc access**: After configuring the integration token, print instructions for setting up the Notion MCP server in the user's IDE for conversational access.
4. **Handle the highest-risk piece well**: The blocks-to-markdown converter must handle the most common Notion block types correctly, with graceful fallback for uncommon types.

### Out of Scope

- Database queries/sync (Phase 2)
- Push/publish to Notion (Phase 3)
- `search()` in the Areté Notion client (MCP handles ad-hoc search; Phase 2 for API search)
- Connection config / repeatable syncs (backlog — use first, then design)
- Notion OAuth flow (internal integration token is sufficient)
- Real-time sync / webhooks
- Image download (we link to Notion-hosted images)
- Auto-writing MCP config to IDE files (print instructions only in Phase 1)

### Pre-Work Requirements

Before execution begins, these must be completed:

1. **SDK vs. fetch decision**: Evaluate `@notionhq/client` package size (`npm pack --dry-run`). If < 5 deps and < 500KB, use SDK. Otherwise, write a thin `fetch` wrapper following the Fathom `request<T>()` pattern. Document the decision.
2. **Real API fixtures**: Capture 2-3 real Notion page responses from a test workspace. Commit as test fixtures in `packages/core/test/integrations/notion/fixtures/`. Include: a simple page, a page with mixed block types, and a page with nested blocks.

---

## 2. Architecture Decisions

1. **Direct API for structured operations + MCP for ad-hoc agent access** — both share the same integration token. Areté builds a programmatic client for pull operations; users configure the Notion MCP server separately for conversational access.
2. **Destinations are user-specified** — Core `pullNotionPages()` accepts `destination` as a required parameter (no default in core). CLI defaults to `resources/notes/`. Agents recommend based on project context.
3. **SDK types stay internal** — Areté-specific types (`NotionPageResult`, `NotionPullResult`) are the public API. SDK types (`BlockObjectResponse`, etc.) are used only inside `client.ts` and `blocks-to-markdown.ts`.
4. **Flat block list with depth metadata** — `getAllPageBlocks()` returns blocks as a flat array with `depth` field, not a nested tree. Both block-fetching and markdown conversion are iterative (queue-based), not recursive.
5. **Manifest-only status** — Notion integration status checked via `arete.yaml` only. No legacy IDE config file paths (unlike Fathom's backward-compat).
6. **Tier 1/Tier 2 block split** — Tier 1 blocks must render correct markdown. Tier 2 blocks extract text if available, else produce a placeholder comment. Never crash on unknown block types.

---

## 3. Task Breakdown

### Task 1: Types + Config + URL Resolver

**Description**: Create `packages/core/src/integrations/notion/` with foundation modules: types, credential loading, and URL parsing.

Files to create:
- `types.ts` — Areté-specific types: `NotionPageResult` (page metadata + markdown content), `NotionPullResult` (pull operation result with saved/errors counts), `NotionPullOptions` (pages, destination). No SDK type re-exports.
- `config.ts` — `loadNotionApiKey(storage, workspaceRoot)`: load from `credentials.yaml` (`notion.api_key`) or `NOTION_API_KEY` env var. Define credential structure as a constant so both loader and configure command reference the same shape.
- `url.ts` — `resolvePageId(urlOrId)`: extract 32-char hex page ID from any Notion URL format or accept raw UUID. Normalize to no-dash format.

Files to read first:
- `packages/core/src/integrations/fathom/config.ts` — credential loading pattern
- `packages/core/src/integrations/fathom/client.ts` — `loadFathomApiKey()` for reference
- `packages/core/src/integrations/LEARNINGS.md` — credential gotchas

Acceptance Criteria:
- `resolvePageId()` correctly handles: workspace URL (`notion.so/workspace/Title-abc123`), short URL (`notion.so/abc123`), URL with query params, custom domain (`workspace.notion.site/Title-abc123`), raw UUID with dashes, raw UUID without dashes, and invalid input (returns as-is)
- `loadNotionApiKey()` loads from `credentials.yaml` key `notion.api_key` and falls back to `NOTION_API_KEY` env var
- Credential loader round-trips: the structure that `configure` will write can be read back (regression test pattern from calendar LEARNINGS)
- Types contain zero imports from `@notionhq/client`
- 7+ unit tests covering URL parsing edge cases and token loading
- All files use `.js` import extensions, no `any` types

### Task 2: Notion API Client

**Description**: Build the Notion API client with rate limiting, retry, and iterative block fetching. Use SDK or thin fetch wrapper per pre-work decision.

Files to create:
- `client.ts` — `NotionClient` class (or functions) with methods:
  - `getPage(pageId)` — retrieve page metadata (title, URL, last_edited). On 404: return specific error "Page not found. Make sure the page is shared with your Notion integration. In Notion, open the page → '...' → 'Connect to' → select your integration."
  - `getPageBlocks(blockId)` — retrieve direct children blocks with pagination
  - `getAllPageBlocks(pageId)` — iterative (queue-based) fetcher for all blocks including nested children. Returns flat list of blocks with `depth` field. Configurable `MAX_DEPTH` constant (default: 5). Stops expanding children beyond max depth with a placeholder.

Rate limiting and error handling:
- Track request timestamps, delay if approaching 3 req/sec
- On 429: exponential backoff (1s, 2s, 4s) with max 3 retries
- On 401: "Invalid Notion API token" error
- On 404: "Page not shared" error (see above)

Files to read first:
- `packages/core/src/integrations/fathom/client.ts` — HTTP client pattern with error handling
- `packages/core/src/integrations/krisp/client.ts` — rate limiting/retry reference
- Pre-work SDK decision documentation

Acceptance Criteria:
- Client fetches page metadata successfully
- `getAllPageBlocks()` returns flat list with depth metadata, processes iteratively (no recursive calls)
- Rate limiter prevents exceeding 3 req/sec (tested with mocked timestamps)
- 429 responses trigger exponential backoff and retry, max 3 attempts
- 404 returns actionable "page not shared" error, not generic "not found"
- 401 returns "invalid token" error
- `MAX_DEPTH` constant (5) stops nested block expansion
- Tests: rate limiting, 429 retry, 404 error message, 401 error message, pagination, max depth cutoff

### Task 3: Blocks-to-Markdown Converter

**Description**: Build the blocks-to-markdown converter — the highest-risk piece. Accepts a flat list of blocks with depth metadata (from `getAllPageBlocks`), produces clean markdown.

**Tier 1 (must handle correctly):**
- `paragraph`, `heading_1`, `heading_2`, `heading_3`
- `bulleted_list_item`, `numbered_list_item`, `to_do`
- `code` (with language annotation), `quote`, `divider`
- `table`, `table_row`
- `image` (render as `![alt](url)`), `bookmark` (render as link)
- `child_page` (render as `[Page Title](notion_url)`), `child_database` (render as link)
- Rich text annotations: bold, italic, strikethrough, inline code, links, mentions (render as text)

**Tier 2 (graceful fallback):**
- `toggle`, `callout` — extract text content, render as blockquote with type annotation
- `column_list`, `column` — extract text content sequentially
- `synced_block` — extract text content
- `equation` — render as inline/block code
- `embed`, `file`, `audio`, `video` — render URL as link
- `breadcrumb`, `table_of_contents`, `link_preview` — render as comment or link
- Any unknown type — `<!-- Unsupported block type: {type} -->` with text extracted if available

Files to create:
- `blocks-to-markdown.ts` — `blocksToMarkdown(blocks: FlatBlock[]): string`
- Rich text helper: `richTextToMarkdown(richText: RichTextItem[]): string`

Files to read first:
- Pre-work API fixtures in `packages/core/test/integrations/notion/fixtures/`
- Notion API block reference (types and structure)

Acceptance Criteria:
- All Tier 1 block types produce correct idiomatic markdown (individual unit test per type)
- Rich text: bold → `**text**`, italic → `*text*`, code → `` `text` ``, strikethrough → `~~text~~`, links → `[text](url)`
- Nested blocks render with correct indentation based on depth metadata (e.g., nested list items)
- Tables render as proper markdown tables with header row
- Code blocks include language annotation: ` ```python `
- Tier 2 blocks produce reasonable fallback output, never crash
- Unknown block types produce placeholder comment with type name
- Test suite includes real API fixture tests (from pre-work) with 10+ block types in one page
- No `any` types in the converter
- No recursive function calls — iterative processing of flat block list

### Task 4: Integration Registry + Service Wiring

**Description**: Register Notion in the integration registry and wire up `IntegrationService` for pull operations.

Files to modify:
- `packages/core/src/integrations/registry.ts` — add `notion` entry
- `packages/core/src/models/integrations.ts` — extend `PullOptions` with `pages?: string[]` and `destination?: string`
- `packages/core/src/services/integrations.ts` — add Notion branch to `pull()`, add `getIntegrationStatus()` for Notion

Design notes:
- Registry entry: `{ name: 'notion', displayName: 'Notion', description: 'Documentation and workspace pages', implements: ['documentation'], auth: { type: 'api_key', envVar: 'NOTION_API_KEY', configKey: 'api_key', instructions: 'Create an internal integration at notion.so/profile/integrations' }, status: 'available' }`
- Notion status check: manifest-only (`arete.yaml` `integrations.notion.status` + credential loader). No legacy IDE config file check.
- Add TODO comment on the integration branching: `// TODO: Refactor to provider registry pattern when adding 4th integration`

Files to read first:
- `packages/core/src/integrations/registry.ts` — existing entries
- `packages/core/src/services/integrations.ts` — `pull()` and `getIntegrationStatus()` patterns
- `packages/core/src/models/integrations.ts` — existing `PullOptions` type

Acceptance Criteria:
- `notion` entry in `INTEGRATIONS` registry with `api_key` auth type
- `PullOptions` has optional `pages` (string array) and `destination` (string) fields
- `IntegrationService.pull()` routes `'notion'` to the pull function
- `getIntegrationStatus('notion')` checks arete.yaml manifest + credential loader (no legacy config paths)
- TODO comment exists for refactoring
- Existing Fathom/Krisp/calendar tests still pass
- `arete integration list` shows Notion with correct status

### Task 5: Core Orchestrator + Save

**Description**: Build `pullNotionPages()` orchestrator and the save module that ties client + converter + file system together.

Files to create:
- `save.ts` — `saveNotionPage(storage, page, destination, options)`: writes markdown file with frontmatter. Filename: `{slugified-title}.md` (no date prefix — pages aren't temporal like meetings). Frontmatter: `title`, `source_url`, `notion_page_id`, `fetched_at`, `source: notion`.
- `index.ts` — `pullNotionPages(storage, workspaceRoot, paths, options)`: orchestrator that accepts `NotionPullOptions` (pages + destination). Processes pages sequentially. Returns `NotionPullResult` with `saved`, `skipped`, `errors` counts.

Behavior:
- For each page URL/ID: resolve ID → fetch page metadata → fetch all blocks → convert to markdown → save
- Deduplication: before saving, scan destination directory for existing files with matching `notion_page_id` in frontmatter. Skip if found (report as skipped).
- Partial success: if 7/10 pages succeed and 3 fail, save the 7 and report all 3 errors
- Sequential processing (not parallel) to respect rate limits

Files to read first:
- `packages/core/src/integrations/fathom/index.ts` — orchestrator pattern
- `packages/core/src/integrations/fathom/save.ts` — save pattern
- `packages/core/src/integrations/meetings.ts` — `saveMeetingFile` for reference

Acceptance Criteria:
- End-to-end pull: URL → fetch → convert → save with correct frontmatter
- Batch pull processes pages sequentially, reports partial success (saved X, skipped Y, errors Z)
- Deduplication: existing file with matching `notion_page_id` causes skip (not overwrite)
- Frontmatter includes all required fields: title, source_url, notion_page_id, fetched_at, source
- `NotionPullResult` matches `PullResult` shape for `IntegrationService` compatibility
- Tests: save with frontmatter verification, dedup detection, partial success, empty page handling

### Task 6: CLI — Configure + Pull Commands

**Description**: Add Notion support to the CLI configure and pull commands.

**Configure** (`arete integration configure notion`):

Files to modify:
- `packages/cli/src/commands/integration.ts` — add `notion` branch to configure action

Behavior:
- Prompt for API token interactively (or accept `--token <value>` flag for non-interactive)
- Validate token by calling Notion API `/v1/users/me` (via client or direct fetch)
- On success: store token in `.credentials/credentials.yaml` using structure from `config.ts`, write `notion: { status: 'active' }` to `arete.yaml` via `IntegrationService.configure()`
- Print MCP setup instructions: JSON snippet for `.cursor/mcp.json` using the user's token
- Print success: "✅ Notion connected. Run `arete pull notion --page <url>` to pull a page."
- On failure: clear error — "Invalid token" or "Network error" with retry guidance

**Pull** (`arete pull notion`):

Files to modify:
- `packages/cli/src/commands/pull.ts` — add `notion` branch

Behavior:
- `--page <url-or-id>` — repeatable flag for one or more pages
- `--destination <path>` — where to save (default: `resources/notes/`)
- `--dry-run` — fetch and convert, print markdown to stdout, don't save to file
- `--json` — structured JSON output for agent consumption
- `--skip-qmd` — skip automatic QMD index refresh
- After successful pull (not dry-run): auto-refresh QMD index (like Fathom pattern)
- Report: pages saved, skipped, errors

Files to read first:
- `packages/cli/src/commands/integration.ts` — configure patterns (calendar, krisp)
- `packages/cli/src/commands/pull.ts` — pull patterns (fathom, krisp, calendar)
- `packages/core/src/integrations/fathom/client.ts` — `loadFathomApiKey` for credential pattern

Acceptance Criteria:
- `arete integration configure notion` prompts for token, validates via API, stores in credentials.yaml, writes to arete.yaml, prints MCP instructions
- `--token` flag works for non-interactive configuration
- Invalid token returns clear error message (not stack trace)
- `arete pull notion --page <url>` pulls a single page and saves to default destination
- Multiple `--page` flags pull multiple pages
- `--destination` overrides default `resources/notes/`
- `--dry-run` prints converted markdown to stdout without saving files
- `--json` returns structured output with success/error data
- QMD auto-refreshes after pull (unless `--skip-qmd`)
- Tests: configure flow with mocked API (success + failure), pull with mocked core (single, multi, dry-run, json output)

### Task 7: Runtime Integration Config + Sync Skill Update

**Description**: Update runtime artifacts so agents know about Notion integration.

Files to create:
- `packages/runtime/integrations/configs/notion.yaml` — config template

Files to modify:
- `packages/runtime/skills/sync/SKILL.md` — add Notion section with commands, page-sharing gotcha, backfill pattern
- `packages/runtime/integrations/registry.md` — update Notion row: status → Available, capabilities → Pull

Acceptance Criteria:
- `notion.yaml` config template exists with documented options
- Sync skill includes Notion section with: CLI commands (`arete pull notion --page <url>`), page-sharing 404 gotcha ("Make sure the page is shared with your integration"), batch pull example, `--dry-run` for debugging
- Registry shows Notion as Available with Pull capability
- Config template follows existing format (calendar.yaml, fathom.yaml)

### Task 8: Core Barrel Exports + Documentation

**Description**: Export public APIs, update credentials docs, seed LEARNINGS.md.

Files to modify:
- `packages/core/src/integrations/` barrel (or wherever Notion exports need to be added to `@arete/core`)
- `.credentials/README.md` — add Notion section
- Create `packages/core/src/integrations/notion/LEARNINGS.md`

LEARNINGS.md should include:
- Credential structure (`notion.api_key` in credentials.yaml; `NOTION_API_KEY` env var)
- Page-sharing 404 pattern: Notion returns 404 (not 403) when a page isn't shared with the integration
- Rate limiting: 3 req/sec, exponential backoff on 429
- SDK decision rationale (from pre-work)
- Flat block list design: `getAllPageBlocks` returns flat array with depth, not nested tree
- Refactoring note: `IntegrationService.pull()` needs provider registry pattern before 4th integration
- Tier 1/Tier 2 block type split for the converter

Files to read first:
- `packages/core/src/integrations/LEARNINGS.md` — parent LEARNINGS for format
- `.credentials/README.md` — existing credential docs

Acceptance Criteria:
- `pullNotionPages`, `loadNotionApiKey`, `resolvePageId` exported from `@arete/core`
- Notion types (`NotionPullResult`, `NotionPageResult`) exported from `@arete/core`
- `.credentials/README.md` has Notion section with setup link and example
- `LEARNINGS.md` seeded with all patterns listed above (7+ entries)
- No broken imports in existing code after barrel changes

---

## 4. Dependencies Between Tasks

```
Task 1 → Task 2 (client needs types + config)
Task 2 → Task 3 (converter works on blocks from client, but can be developed in parallel with fixtures)
Task 1 + 2 + 3 → Task 5 (orchestrator needs all three)
Task 4 (registry) can be done in parallel with Task 2 or 3
Task 5 → Task 6 (CLI uses orchestrator)
Task 6 → Task 7 (runtime docs reference CLI commands)
Task 7 → Task 8 (docs wrap-up is last)
```

**Recommended execution order**: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

Task 3 (converter) is the highest-risk task. It can be started after Task 1 is complete (it needs types but not the client — it works on fixture data).

---

## 5. Pre-Mortem Risks & Mitigations

See `pre-mortem.md` for full analysis (10 risks). Key mitigations embedded in tasks:

| Risk | Mitigation | Task |
|------|-----------|------|
| Block converter scope creep (P0) | Tier 1/Tier 2 split; real fixtures; individual unit tests per type | 3 |
| URL parsing formats (P0) | 7+ test cases covering all known formats; 32-hex extraction approach | 1 |
| Page sharing 404 (P1) | Specific error message with Notion docs link; `--dry-run` for debugging | 2, 6 |
| Credential mismatch (P1) | Single source of truth in `config.ts`; round-trip test | 1, 6 |
| Rate limiting (P1) | Client-level rate limiter + 429 backoff from Day 1 | 2 |
| Nested block depth (P1) | Iterative queue; MAX_DEPTH=5; flat list with depth metadata | 2, 3 |
| SDK type coupling (P2) | SDK types internal only; Areté types at public boundary | 1 |

---

## 6. Testing Strategy

- All Notion API tests mock HTTP calls (no real API calls in test suite)
- Block converter tests use real API fixtures (from pre-work) + individual block type tests
- Credential tests mock file system via StorageAdapter
- CLI tests mock core services
- `npm run typecheck` and `npm test` after every task
- Existing integration tests (Fathom, Krisp, calendar) must continue to pass

---

## 7. Success Criteria

- `arete integration configure notion --token ntn_xxx` validates and stores the token
- `arete pull notion --page https://notion.so/workspace/My-Page-abc123` saves a readable markdown file
- `arete pull notion --page <url1> --page <url2> --destination projects/active/discovery/inputs/` batch-pulls to a specified location
- `arete pull notion --page <url> --dry-run` prints markdown to stdout without saving
- Pulled pages are automatically indexed by QMD for intelligence layer access
- Notion appears in `arete integration list` with correct status
- Configure prints MCP setup instructions for ad-hoc agent access
- Block converter handles a real-world Notion page with 10+ block types without crashing
- All existing tests pass; typecheck clean
