# Pre-Mortem: Notion Integration — Phase 1

**Plan**: Notion Integration — Pull Pages + Infrastructure
**Size**: Large (8 steps)
**Date**: 2026-02-22

---

### Risk 1: Notion Block-to-Markdown Converter — Unbounded Complexity

**Category**: Scope Creep

**Problem**: The Notion block format has 25+ block types, nested children (recursive), rich text with 8+ annotation types, and edge cases (empty blocks, synced blocks, column layouts, equations, embedded databases). Step 5 lists ~15 block types but the real API surface is much larger. A subagent could spend excessive time trying to handle every edge case, or conversely ship a converter that breaks on common real-world pages.

**Mitigation**:
- Define a **Tier 1 / Tier 2** split in the task prompt:
  - **Tier 1 (must)**: paragraph, heading_1/2/3, bulleted_list_item, numbered_list_item, to_do, code, quote, divider, image (as link), bookmark, table, table_row, child_page (as link), child_database (as link)
  - **Tier 2 (graceful fallback)**: toggle, callout, column_list/column, synced_block, equation, embed, file, audio, video, breadcrumb, table_of_contents, link_preview
- Tier 2 blocks render as `<!-- Unsupported block type: {type} -->` with any available text content extracted
- Use real Notion API response fixtures (captured from actual pages) for test data, not hand-crafted JSON
- AC: converter handles a real-world page with mixed block types without crashing

**Verification**: Test suite includes at least one "real page" fixture with 10+ block types. All Tier 1 types have individual unit tests. No `any` types in the converter.

---

### Risk 2: Notion SDK Types vs Our Types — Type Mismatch

**Category**: Integration

**Problem**: The `@notionhq/client` SDK exports complex discriminated union types for blocks (`BlockObjectResponse`), rich text (`RichTextItemResponse`), and pages (`PageObjectResponse`). These are deeply nested and use string literal unions. If we define our own parallel types in `types.ts`, they'll drift from the SDK. If we re-export SDK types, we couple `@arete/core` to the Notion SDK's internal structure.

**Mitigation**:
- Use `@notionhq/client` types directly in `client.ts` and `blocks-to-markdown.ts` (internal modules)
- Define thin Areté-specific types only for the public API surface: `NotionPageResult`, `NotionPullResult` (what `pullNotionPages()` returns)
- Do NOT re-export SDK types from `@arete/core` barrel — keep the SDK as an internal dependency
- In `types.ts`: only define types that cross module boundaries (config, results, frontmatter shape)

**Verification**: `packages/core/src/integrations/notion/types.ts` contains zero re-exports from `@notionhq/client`. SDK types used only in `client.ts` and `blocks-to-markdown.ts`.

---

### Risk 3: Notion URL Parsing — Many URL Formats

**Category**: Platform Issues

**Problem**: Notion URLs come in multiple formats and users will paste whatever they have:
- `https://www.notion.so/workspace/Page-Title-abc123def456` (workspace URLs)
- `https://notion.so/abc123def456` (short URLs)
- `https://www.notion.so/abc123def456?v=xyz` (with view params)
- `https://workspace.notion.site/Page-Title-abc123def456` (custom domains)
- Raw page IDs: `abc123def456` or `abc123-def4-5678-...` (with/without dashes)

If `resolvePageId()` only handles one format, most users will hit errors on first use.

**Mitigation**:
- Build `resolvePageId()` as a dedicated, well-tested function with explicit handling for each format
- Core logic: extract the last 32-character hex string from the URL path (Notion page IDs are always 32 hex chars, sometimes with dashes)
- Accept raw UUIDs (with and without dashes) and normalize to the no-dash format the API expects
- Include 6+ test cases covering all known URL formats
- If the input doesn't match any known pattern, return it as-is and let the API error handle it (with a clear error message)

**Verification**: Unit tests for `resolvePageId()` cover at least: workspace URL, short URL, URL with query params, custom domain URL, raw UUID with dashes, raw UUID without dashes, invalid input.

---

### Risk 4: Credential Storage — Producer-Consumer Mismatch (Known Pattern)

**Category**: Integration

**Problem**: This is the exact bug pattern from the calendar integration (`2026-02-11_calendar-provider-macos-alias.md`): `configure` writes a credential value, `pull` reads it — if they use different keys or paths, the integration silently fails. For Notion: `configure` stores token in `.credentials/credentials.yaml` under some key structure, `config.ts` loads it — these must agree exactly.

**Mitigation**:
- Define the credential structure once in `config.ts`: `{ notion: { api_key: "ntn_..." } }` — both the loader and the writer import from the same source
- `configure` command imports the load function and round-trips: write → load → verify the loaded value matches
- Add a regression test: mock `credentials.yaml` with the exact structure `configure` writes, call `loadNotionApiKey()`, assert it returns the token
- Comment at the credential loader: "configure writes `notion.api_key`; this must match"

**Verification**: Test exists that writes credentials in the configure format and reads them back via the loader. Comment exists at the loader referencing the producer.

---

### Risk 5: `IntegrationService.pull()` Growing Unwieldy

**Category**: Code Quality

**Problem**: `IntegrationService.pull()` currently has explicit `if (integration === 'fathom')` / `if (integration === 'krisp')` branches. Adding Notion makes it 3 branches. This is a known pattern that gets worse with each integration. The same issue exists in `pull.ts` CLI command with its own branching.

**Mitigation**:
- For Phase 1: add the Notion branch following the existing pattern (don't refactor mid-feature)
- Add a code comment: `// TODO: Refactor to provider registry pattern when adding 4th integration`
- In LEARNINGS.md: document that the service needs refactoring to a map/registry pattern before the next integration
- Keep the Notion branch structure identical to Fathom's for consistency

**Verification**: The Notion branch in `IntegrationService.pull()` follows the same structure as the Fathom branch. TODO comment exists. LEARNINGS.md mentions the refactoring need.

---

### Risk 6: Notion API Rate Limiting During Batch Pulls

**Category**: Platform Issues

**Problem**: Notion API rate limit is 3 requests/second. A single page pull requires: 1 `getPage()` + N `getBlockChildren()` calls (one per 100 blocks, plus recursive calls for nested blocks). A page with 300 blocks and 10 nested toggles could require 15+ API calls. Batch pulling 10 pages could hit 150+ calls. Without backoff, users will get 429 errors and partial pulls.

**Mitigation**:
- Implement a simple rate limiter in the Notion client: track request timestamps, delay if approaching 3/sec
- On 429 response: exponential backoff with retry (max 3 retries, starting at 1s)
- For batch pulls: process pages sequentially (not in parallel) to keep rate predictable
- Report partial progress: if 7/10 pages succeed before a persistent 429, save the 7 and report the 3 failures with "try again in a few minutes"

**Verification**: Client has retry logic for 429 responses. Batch pull reports partial success. Test covers 429 handling (mocked).

---

### Risk 7: MCP Config Merge — Corrupting Existing IDE Config

**Category**: Integration

**Problem**: Step 7 offers to write Notion MCP config to `.cursor/mcp.json`. Users may already have MCP servers configured. A naive write could overwrite existing config. The file might also not exist yet, or might have comments/formatting that `JSON.parse` → `JSON.stringify` would alter.

**Mitigation**:
- Read existing `.cursor/mcp.json` if it exists; parse it; merge `notionApi` into `mcpServers` (don't replace the whole object)
- If the file doesn't exist, create it with just the Notion server
- If `mcpServers.notionApi` already exists, warn: "Notion MCP is already configured. Overwrite? [y/N]"
- If the file can't be parsed (malformed JSON), don't touch it — print manual instructions instead
- Support both `.cursor/mcp.json` and `.claude/mcp.json` based on detected IDE (follow multi-IDE adapter pattern)

**Verification**: Test: merge into existing config with other servers preserves those servers. Test: handles missing file. Test: handles malformed JSON gracefully (prints instructions instead of crashing).

---

### Risk 8: Nested Block Recursion — Deep Pages Causing Stack/Performance Issues

**Category**: Platform Issues

**Problem**: Notion pages can have deeply nested blocks (toggles inside toggles inside columns inside toggles). Each level of nesting requires a separate API call to `getBlockChildren()`. A pathological page could have 10+ nesting levels. Without limits, this causes: excessive API calls, potential stack depth issues, and very long pull times for a single page. Both block-fetching AND block-to-markdown conversion must be iterative — if one is iterative and the other recursive, we'll have inconsistency.

**Mitigation**:
- Set a maximum recursion depth (e.g., 5 levels) — render deeper blocks as `<!-- Content truncated: nesting depth exceeded -->`
- Track total API calls per page pull; warn if exceeding 50 calls
- Use iterative (queue-based) block fetching — `getAllPageBlocks()` returns a flat list of blocks with depth metadata
- Converter accepts flat list with depth metadata (not a nested tree) — also iterative processing
- Log progress for long-running pulls: "Fetching page... (X blocks processed)"

**Verification**: Test with a fixture containing 3+ nesting levels. Code has a configurable max depth constant. No recursive function calls in either block fetching or markdown conversion. Both use the flat-list-with-depth pattern.

---

### Risk 9: Notion Token Scope — Page Sharing 404s

**Category**: Platform Issues

**Problem**: Notion internal integration tokens are workspace-scoped, but pages must be explicitly shared with the integration. A user will configure the token successfully (validates fine via `/v1/users/me`), then try to pull a page that isn't shared with the integration. Notion returns a generic **404**, not a permissions error. This WILL confuse users on first use — "I just configured it and it says not found?"

**Mitigation**:
- When `getPage()` returns 404, return a specific error: "Page not found. Make sure the page is shared with your Notion integration. In Notion, open the page → click '...' → 'Connect to' → select your integration. Docs: https://developers.notion.com/docs/authorization"
- Cache the `/v1/users/me` validation result from configure to distinguish "bad token" (would fail users/me) vs. "page not shared" (users/me works, page 404s)
- Include this gotcha in the sync skill guidance and LEARNINGS.md
- `--dry-run` flag on pull helps users debug this (see if page is accessible before saving)

**Verification**: Test covers 404 response and confirms the specific "page not shared" error message is returned (not a generic error). Sync skill mentions the page-sharing requirement.

---

### Risk 10: `@notionhq/client` SDK Dependency Weight

**Category**: Dependencies

**Problem**: The `@notionhq/client` SDK may pull a large dependency tree, adding bundle size to `@arete/core`. The Notion REST API is straightforward enough that a thin `fetch` wrapper (like Fathom's `request<T>()` or Krisp's approach) could suffice. Adding a heavy SDK for simple REST calls is avoidable overhead.

**Mitigation**:
- **Pre-work decision**: Before PRD execution, run `npm pack --dry-run` on `@notionhq/client` and evaluate the dependency tree
- Decision criteria: If < 5 deps and < 500KB, use SDK (benefits: typed responses, pagination helpers, maintained by Notion). If bloated, write a thin `fetch` client following Fathom pattern.
- Document the decision and rationale in the pre-work phase

**Verification**: Decision is documented with size data before Task 2 begins. If thin client chosen, it covers all required API endpoints.

---

## Summary

**Total risks identified**: 10
**Categories covered**: Scope Creep, Integration (×2), Platform Issues (×4), Code Quality, Dependencies, State Tracking

### Risk Priority

| # | Risk | Severity | Likelihood | Priority |
|---|------|----------|------------|----------|
| 1 | Block converter complexity | High | High | **P0** — scope carefully |
| 3 | URL parsing formats | Medium | High | **P0** — test extensively |
| 9 | Page sharing 404s | High | High | **P1** — guaranteed first-use confusion |
| 4 | Credential producer-consumer | High | Medium | **P1** — known failure pattern |
| 6 | API rate limiting | Medium | Medium | **P1** — implement backoff |
| 8 | Nested block recursion | Medium | Medium | **P1** — both fetch and convert must be iterative |
| 2 | SDK type mismatch | Medium | Medium | **P2** — design boundary early |
| 10 | SDK dependency weight | Medium | Medium | **P2** — resolved by pre-work |
| 7 | MCP config merge | Low | Low | **P2** — mitigated: print instructions only |
| 5 | Service branching | Low | Low | **P3** — document for later |

### Top 3 Actions Before Building

1. **Capture real Notion API fixtures** (pre-work) — fetch actual API responses from a test workspace. Commit as test fixtures. The converter developer needs these given to them.
2. **Decide SDK vs. fetch** (pre-work) — evaluate `@notionhq/client` package size. Document decision with data.
3. **Lock down the Tier 1/Tier 2 block type split** — prevents scope creep in the converter task.

---

**Ready to proceed with these mitigations?**
