# Notion Integration Learnings

## How This Works

Notion integration follows the Fathom pattern: thin `fetch` wrapper (not SDK), credential cascade (env var → credentials.yaml), page ID resolution from any URL format, block fetching with rate limiting, markdown conversion, and file save with dedup.

Key files:
- `config.ts` — credential loading (env var → credentials.yaml)
- `url.ts` — page ID extraction from URLs
- `client.ts` — Notion API client with rate limiting
- `blocks-to-markdown.ts` — block-to-markdown converter
- `save.ts` — file save with frontmatter and dedup
- `index.ts` — orchestrator (`pullNotionPages`)

## Key References

- `packages/core/src/integrations/notion/client.ts` — `NotionClient`, `RateLimiter`, `getAllPageBlocks()`
- `packages/core/src/integrations/notion/blocks-to-markdown.ts` — `blocksToMarkdown()`, `richTextToMarkdown()`
- `packages/core/src/integrations/notion/save.ts` — `saveNotionPage()`, dedup by `notion_page_id`
- `packages/core/src/services/integrations.ts` — `IntegrationService.pull('notion', ...)` routing
- `packages/cli/src/commands/pull.ts` — `pullNotion()` CLI handler
- `packages/runtime/integrations/configs/notion.yaml` — runtime config template

## Gotchas

### SDK Avoided — Thin Fetch Wrapper (2026-02-22)
**Do not add `@notionhq/client`**. The SDK is 567KB with complex TypeScript types for 3 REST endpoints (get page, get blocks, paginate blocks). Per LEARNINGS.md pattern from Krisp: "If it's HTTP/HTTPS, `fetch` is enough." The `client.ts` implementation is ~150 lines including rate limiting and retries.

### 404 Means "Not Shared", Not "Not Found" (2026-02-22)
Notion returns HTTP 404 (not 403) when a page exists but hasn't been shared with the integration. The error message must be actionable: "Page not found or not shared with your integration. Share the page via Notion's 'Add connections' menu." Users will interpret 404 as "wrong URL" when the real fix is page sharing.

### Rate Limiter is Timestamp-Based (2026-02-22)
The `RateLimiter` class tracks timestamps of the last N requests within a 1-second sliding window, not a simple counter that resets. This is correct for Notion's "3 requests per second" limit. A counter-based approach would allow bursts followed by starvation. The implementation delays requests when the limit is reached, not before.

### getAllPageBlocks() is Iterative, Not Recursive (2026-02-22)
Block fetching uses a queue-based iterative approach with depth tracking, not recursive function calls. Each block in the queue has a `depth` field. This avoids stack overflow on deeply nested pages and produces a flat `FlatBlock[]` array that `blocksToMarkdown()` can process in a single pass. Max depth (5) is enforced by `MAX_DEPTH` constant — blocks beyond this get a placeholder.

### Tier 1 vs Tier 2 Block Support (2026-02-22)
Not all Notion blocks have full markdown equivalents. Tier 1 blocks (paragraph, headings, lists, code, tables, images, bookmarks) have complete conversion. Tier 2 blocks (toggle, callout, column_list, synced_block, etc.) have fallback handling — often HTML comments or simplified text. Unknown block types emit `<!-- Unsupported block type: {type} -->` so users know content was skipped.

### File URLs Expire (~1 Hour) (2026-02-22)
Notion `file.url` values for images, files, audio, and video blocks are **time-limited S3 pre-signed URLs** that expire after approximately 1 hour. Downloaded markdown will have broken links to these assets after expiration. Users should:
- Re-pull pages to get fresh URLs
- Download assets separately if permanent storage is needed
- Consider this a limitation for archival use cases

### Synced Blocks Show Empty Content (2026-02-22)
`synced_block` types reference content from another block. The Notion API returns the reference ID, not the actual content. Markdown output will be empty for synced blocks. The original block's content is not fetched — doing so would require additional API calls and could create circular references. Document this limitation for users who rely on synced blocks.

### Multi-Column Layout is Flattened (2026-02-22)
`column_list` and `column` blocks are structural containers for side-by-side layout in Notion. Markdown has no column equivalent, so these blocks are treated as structural passthroughs — their children are rendered sequentially. Visual layout information is lost. This is expected behavior, not a bug.

### Credential Cascade Matches Other Integrations (2026-02-22)
`loadNotionApiKey()` checks `NOTION_API_KEY` env var first, then falls back to `.credentials/credentials.yaml` under `notion.api_key`. This matches the Fathom and Krisp patterns. Always test both paths in credentials loading tests.

### Provider Registry Pattern Needed (2026-02-22)
`IntegrationService.pull()` now has 3 branches (Fathom, Krisp, Notion) with similar structure. Adding a 4th integration should trigger refactoring to a provider registry pattern (like `getCalendarProvider`). The TODO is in `services/integrations.ts`. Don't add more switch branches.

## Invariants

- `resolvePageId()` must return a 32-char lowercase hex string from any valid Notion URL format (workspace URL, short URL, custom domain, raw UUID with/without dashes).
- `NotionClient` must respect 3 req/sec rate limit and handle 429 with exponential backoff (1s, 2s, 4s).
- `blocksToMarkdown()` must be iterative (no recursion) and handle any `FlatBlock[]` including empty arrays.
- Saved files must have frontmatter with `notion_page_id` for dedup on subsequent pulls.
- `pullNotionPages()` must return partial success (some saved, some errors) — not fail-fast on first error.

## Testing Notes

- `packages/core/test/integrations/notion/fixtures/` contains 3 fixture files: `simple-page.json`, `mixed-blocks-page.json` (20 block types), `nested-blocks-page.json` (3-level nesting).
- Client tests use injectable `fetchFn` and `delayFn` — no real HTTP calls or waits needed.
- Rate limiter tests verify timestamp-based windowing and delay behavior.
- Blocks-to-markdown tests cover both individual block types and fixture-based integration scenarios.

## Pre-Edit Checklist

- [ ] Before changing `client.ts`: verify rate limiter tests still pass after changes
- [ ] Before changing `blocks-to-markdown.ts`: run fixture-based tests (mixed-blocks, nested-blocks)
- [ ] Before adding a new block type: check if it's Tier 1 (full conversion) or Tier 2 (fallback)
- [ ] Before changing credential loading: test both env var and credentials.yaml paths
- [ ] Before changing `resolvePageId()`: run all 9 URL format tests
- [ ] Run `npm test` for full regression check after any changes

---

Last updated: 2026-02-22
