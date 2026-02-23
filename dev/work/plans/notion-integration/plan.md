---
title: Notion Integration
slug: notion-integration
status: building
size: large
tags: [integration, notion, pull, mcp]
created: 2026-02-22T21:15:50.725Z
updated: 2026-02-23T03:07:36.708Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 8
---

# Notion Integration — Phase 1: Pull Pages + Infrastructure

## Problem

Users have significant content in Notion (documentation, notes, specs, research) that Areté can't access. Without integration, users must manually copy-paste context into Areté or upload files — a high-friction barrier that prevents Areté from being truly empowering. Notion is the second-highest priority integration (after calendar) because of how much PM context lives there.

## Decisions

1. **Direct API for structured operations** + **MCP for ad-hoc agent access** — both sharing the same integration token
2. **Destinations are agent-recommended, user-confirmed** — no rigid defaults. The agent recommends based on project context, user confirms. CLI accepts `--destination` for headless/repeat use. Core `pullNotionPages()` accepts `destination` as a parameter — no default in core, CLI defaults to `resources/notes/`.
3. **Connection config / repeatability** → backlog after Phase 1 usage (use first, then design)
4. **Phase 1 = Pull pages + infrastructure** (this plan)
5. **Phase 2 = Database sync** (next plan)
6. **Phase 3 = Push/publish** (future)
7. **SDK vs. fetch** — Pre-work decision. Evaluate `@notionhq/client` package size before PRD execution. If < 5 deps and < 500KB, use SDK. If bloated, write a thin `fetch` wrapper following the Fathom `request<T>()` pattern.
8. **No `search()` in Phase 1** — MCP handles ad-hoc agent search. Areté API client is URL/ID-based only.
9. **MCP setup = print instructions only** — Don't auto-write IDE config in Phase 1. Reduces complexity and risk.

## Pre-Work (before PRD execution)

1. **Decide SDK vs. fetch**: Run `npm pack --dry-run` on `@notionhq/client`, evaluate dependency tree. Decision documented before Task 2 begins.
2. **Capture real API fixtures**: Fetch 2-3 real Notion page responses from a test workspace. Commit as test fixtures in `packages/core/test/integrations/notion/fixtures/`. Include: a simple page, a page with mixed block types (headings, lists, code, table, toggle), and a page with nested blocks. The converter developer needs these given to them, not told to create them.

## User Stories

### Context Enrichment
> "I'm onboarding to a team/project and want to quickly build Areté context. I'll paste a bunch of Notion links and Areté fetches the data, imports it, and starts building context."

### Agent-Driven Pull
> "Here's a link to a Notion page with our product requirements. Can you pull it into project X?"
> The agent asks where to drop it, makes a recommendation based on the project, and saves it.

### Ad-hoc Agent Access (MCP)
> "What does our product roadmap say about Q2 priorities?" — agent queries Notion directly via MCP during conversation.

---

## Plan

### 1. Types + Config + URL Resolver (S)
Create `packages/core/src/integrations/notion/` with foundation modules.

- `types.ts` — Areté-specific types only: `NotionPageResult`, `NotionPullResult`, `NotionPullOptions`. Do NOT re-export SDK types; keep SDK types internal to `client.ts` and `blocks-to-markdown.ts`.
- `config.ts` — Load Notion API token from credentials.yaml or `NOTION_API_KEY` env var. Define credential structure once here: `{ notion: { api_key: "ntn_..." } }`. Both the loader and `configure` command import from this source.
- `url.ts` — `resolvePageId(urlOrId)`: extract page ID from any Notion URL format or accept raw ID. Core logic: extract last 32-char hex string from URL path. Accept UUIDs with/without dashes, normalize to no-dash format.

**AC:**
- `resolvePageId()` handles: workspace URL, short URL, URL with query params, custom domain URL, raw UUID with dashes, raw UUID without dashes, invalid input (returns as-is)
- Token loading from credentials.yaml (`notion.api_key`) and env var (`NOTION_API_KEY`)
- Credential loader round-trips: structure that `configure` writes can be read back
- Types contain zero re-exports from `@notionhq/client`
- 7+ unit tests for URL parsing, token loading

### 2. Notion API Client (M)
SDK wrapper (or thin fetch client, per pre-work decision) with rate limiting and retry.

- `client.ts` — Methods:
  - `getPage(pageId)` — retrieve page metadata. On 404: return specific error "Page not found. Make sure the page is shared with your Notion integration."
  - `getPageBlocks(blockId)` — retrieve children blocks with pagination (use SDK's `iteratePaginatedAPI()` if using SDK)
  - `getAllPageBlocks(pageId)` — iterative (queue-based) fetcher for all blocks including nested children. Configurable max depth (default: 5). Returns flat list of blocks with depth metadata.
- Rate limiter: track request timestamps, delay if approaching 3 req/sec
- On 429 response: exponential backoff with retry (max 3 retries, starting at 1s)
- On 404: distinguish "bad token" (cached from configure validation) vs. "page not shared"

**AC:**
- Client fetches page metadata and all blocks (including nested) iteratively
- Rate limiter prevents exceeding 3 req/sec
- 429 responses trigger backoff and retry
- 404 response gives actionable "page not shared" error message
- Max depth constant (5) prevents runaway recursion
- Tests for: rate limiting (mocked), 429 retry (mocked), 404 error message, pagination

### 3. Blocks-to-Markdown Converter (L)
Dedicated, well-tested converter. This is the highest-risk piece — isolated as its own task with dedicated fixtures.

**Tier 1 (must handle):**
- `paragraph`, `heading_1/2/3`, `bulleted_list_item`, `numbered_list_item`, `to_do`
- `code`, `quote`, `divider`
- `table`, `table_row`
- `image` (as link), `bookmark` (as link)
- `child_page` (as link), `child_database` (as link)
- Rich text: bold, italic, strikethrough, code, links, mentions

**Tier 2 (graceful fallback — extract text if available, else placeholder):**
- `toggle`, `callout`, `column_list`/`column`, `synced_block`
- `equation`, `embed`, `file`, `audio`, `video`
- `breadcrumb`, `table_of_contents`, `link_preview`

**Design:**
- Accepts a flat list of blocks with depth metadata (output of `getAllPageBlocks`)
- Iterative processing (no recursive function calls)
- Unsupported blocks: `<!-- Unsupported block type: {type} -->` with any text content extracted

**AC:**
- All Tier 1 block types produce correct idiomatic markdown
- Rich text formatting preserved (bold, italic, code, links)
- Nested blocks render with correct indentation based on depth metadata
- Tier 2 blocks produce graceful fallback (not crash)
- Test suite uses real API fixtures (from pre-work) + individual unit tests per Tier 1 type
- At least one "real page" fixture test with 10+ block types
- No `any` types in the converter

### 4. Register in Integration Registry + Service Wiring (S)
Add `notion` to registry and wire up `IntegrationService`.

- Add to `packages/core/src/integrations/registry.ts`: `notion` entry with `api_key` auth type
- Extend `PullOptions` type with optional `pages?: string[]` and `destination?: string`
- Add Notion branch to `IntegrationService.pull()` following existing pattern
- Add `getIntegrationStatus()` for Notion — **manifest-only** (check `arete.yaml` for `integrations.notion.status` + credential loader). No legacy IDE config file paths.
- Add TODO comment: `// TODO: Refactor to provider registry pattern when adding 4th integration`

**AC:**
- `arete integration list` shows Notion with correct status
- `IntegrationService.pull()` routes to Notion pull function
- `PullOptions` extended with `pages` and `destination`
- Notion status check is manifest-only (no legacy config path)
- Notion branch matches Fathom/Krisp structure

### 5. Core Orchestrator: `pullNotionPages()` + Save (M)
Glue code combining client + converter + save + dedup.

- `save.ts` — Save page as markdown file with frontmatter (title, source URL, notion_page_id, fetched_at, source: notion). Filename: slugified title with date prefix.
- `index.ts` — Export `pullNotionPages(storage, workspaceRoot, paths, options)` orchestrator. Accepts `destination` as parameter (no default in core). Processes pages sequentially (not parallel) to keep rate predictable.
- Deduplication: skip if `notion_page_id` already exists at destination (check frontmatter of existing files)
- Partial success: if 7/10 pages succeed before a persistent error, save the 7 and report the 3 failures

**AC:**
- Pulls single page end-to-end: fetch → convert → save with frontmatter
- Batch pull processes pages sequentially, reports partial success
- Deduplication works (existing page skipped)
- Frontmatter includes: title, source_url, notion_page_id, fetched_at, source
- Tests for: save with frontmatter, dedup detection, partial success reporting

### 6. CLI: Configure + Pull Commands (M)

**Configure** (`arete integration configure notion`):
- Prompt for API token (or accept `--token` flag)
- Validate token via `/v1/users/me` API call
- Store token in `.credentials/credentials.yaml` using structure from `config.ts`
- Write `notion: { status: 'active' }` to `arete.yaml`
- Print MCP setup instructions (not auto-config): "To give your AI agent direct Notion access, add this to your .cursor/mcp.json: ..." with the correct JSON snippet using their token
- Print: "✅ Notion connected. Run `arete pull notion --page <url>` to pull a page."

**Pull** (`arete pull notion`):
- `--page <url-or-id>` — pull a single page (repeatable flag for multiple)
- `--destination <path>` — where to save (default: `resources/notes/`)
- `--dry-run` — fetch and convert, print markdown to stdout, don't save
- `--json` output for agent consumption
- `--skip-qmd` — skip QMD index refresh
- Auto-refresh QMD index after pull (like Fathom pattern)
- Report: pages pulled, files created, any errors

**AC:**
- Configure prompts for token, validates it, stores credentials, prints MCP instructions
- `--token` flag for non-interactive use
- Invalid token gives clear error message
- Pull works with single and multiple `--page` flags
- `--dry-run` prints markdown to stdout without saving
- `--destination` overrides default
- QMD auto-indexes new content (skippable with `--skip-qmd`)
- JSON output mode works
- Tests for: configure flow (mocked), pull orchestration (mocked), dry-run output

### 7. Runtime Integration Config + Sync Skill Update (S)
- Add `notion.yaml` config template to `packages/runtime/integrations/configs/`
- Update `packages/runtime/skills/sync/SKILL.md` with Notion pull guidance (commands, backfill pattern, error handling for page sharing)
- Update `packages/runtime/integrations/registry.md` — Notion status → Available

**AC:**
- Sync skill includes Notion-specific guidance for agents, including the page-sharing 404 gotcha
- Registry reflects Notion as available with Pull capability
- Config template documents available options

### 8. Core Barrel Exports + Documentation (S)
- Export new Notion types and functions from `@arete/core` barrel
- Update `.credentials/README.md` with Notion setup instructions
- Add `LEARNINGS.md` to `packages/core/src/integrations/notion/`
- Seed LEARNINGS.md with: credential structure, page-sharing 404 pattern, rate limiting notes, SDK decision rationale, refactoring need (provider registry pattern before 4th integration)

**AC:**
- All public APIs exported from `@arete/core`
- Credentials README has Notion section with link to integration setup
- LEARNINGS.md seeded with initial patterns and invariants

---

## Out of Scope (Phase 1)
- Database queries/sync (Phase 2)
- Push/publish to Notion (Phase 3)
- `search()` in the Areté client (MCP handles ad-hoc search; Phase 2 for API search)
- Connection config / repeatable syncs (backlog — use first, then design)
- Notion OAuth flow (internal integration token is sufficient)
- Real-time sync / webhooks
- Image download (we link to Notion-hosted images)
- Auto-writing MCP config to IDE files (print instructions only in Phase 1)

## Key Risks

See `pre-mortem.md` for full analysis (10 risks). Top priorities:

| # | Risk | Priority |
|---|------|----------|
| 1 | Block converter complexity (scope creep) | **P0** |
| 3 | URL parsing — many formats | **P0** |
| 9 | Page sharing 404 — confusing first-use error | **P1** |
| 4 | Credential producer-consumer mismatch | **P1** |
| 6 | API rate limiting during batch pulls | **P1** |
| 8 | Nested block recursion — depth/performance | **P1** |
| 2 | SDK type mismatch — coupling boundary | **P2** |
| 10 | SDK dependency weight | **P2** (resolved by pre-work) |
| 7 | MCP config merge corruption | **P2** (mitigated: print-only) |
| 5 | IntegrationService branching | **P3** |

## Technical Context
- Existing patterns: Fathom (API key + HTTP client), Krisp (OAuth + MCP JSON-RPC)
- Integration service: `packages/core/src/services/integrations.ts`
- Registry: `packages/core/src/integrations/registry.ts`
- CLI commands: `packages/cli/src/commands/pull.ts`, `packages/cli/src/commands/integration.ts`
- QMD indexing: `refreshQmdIndex()` from `@arete/core`
- Notion MCP server: `@notionhq/notion-mcp-server` (local, stdio) or remote OAuth
- Notion SDK: `@notionhq/client` (pending pre-work evaluation)
- Models type: `PullOptions` in `packages/core/src/models/integrations.ts`

## Complexity Estimates

| Step | Description | Size |
|------|-------------|------|
| 1 | Types + Config + URL resolver | **S** |
| 2 | Notion API Client | **M** |
| 3 | Blocks-to-Markdown Converter | **L** |
| 4 | Registry + Service wiring | **S** |
| 5 | Core orchestrator + save | **M** |
| 6 | CLI: Configure + Pull | **M** |
| 7 | Runtime config + sync skill | **S** |
| 8 | Exports, docs, LEARNINGS | **S** |

**Total**: 4S + 3M + 1L

## Next Steps
- [x] Run pre-mortem
- [x] Engineering review
- [ ] Complete pre-work (SDK evaluation + API fixtures)
- [ ] Convert to PRD via `/prd` for autonomous execution
