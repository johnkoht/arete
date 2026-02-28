# Engineering Review: Notion Integration — Phase 1

**Reviewer**: Engineering Lead  
**Date**: 2026-02-22  
**Verdict**: **APPROVE WITH CHANGES** — solid plan, needs restructuring before PRD conversion

---

## 1. Technical Feasibility

**All 8 steps are implementable. No blockers.** The Notion SDK (`@notionhq/client`) is mature, the API is well-documented, and the existing integration patterns (Fathom, Krisp) provide clear rails.

**One unknown to flag:**
- The plan says "handles pagination" but doesn't specify how. The SDK's `iteratePaginatedAPI()` helper exists — the developer should use it rather than hand-rolling cursor logic. Confirm this in the task prompt.

---

## 2. Architecture Fit

### ✅ What fits well
- `config.ts` / `client.ts` / `types.ts` / `save.ts` / `index.ts` structure mirrors Fathom exactly
- Credential loading via `credentials.yaml` follows Krisp/Fathom pattern
- Registry entry is straightforward (`auth: { type: 'api_key', envVar: 'NOTION_API_KEY', configKey: 'api_key' }`)
- QMD auto-refresh after pull matches Fathom's `pull.ts` pattern

### ⚠️ Deviation 1: Notion pull is page-based, not time-based
Fathom/Krisp pull by `--days` (time range). Notion pull is by `--page <url>` (explicit selection). This means:
- `PullOptions` currently has `days` — Notion doesn't use it
- `IntegrationService.pull()` will need to accept page URLs via the options bag

**Recommendation**: Extend `PullOptions` with optional `pages?: string[]` and `destination?: string`. Don't create a separate pull path. Core stays flexible, CLI provides sensible defaults (`resources/notes/`).

### ⚠️ Deviation 2: Destination is user-specified, not convention-fixed
Fathom always writes to `resources/meetings/`. Notion pages could go anywhere. The plan says "agent-recommended, user-confirmed" with `--destination`.

**Recommendation**: Fine for CLI. But `pullNotionPages()` in core must accept `destination` as a parameter — don't default it inside core. Let CLI default to `resources/notes/` and let agents pass whatever they want.

---

## 3. Dependency Ordering — **Needs Restructuring**

### Problem
Steps 1 and 5 overlap significantly. Step 1 includes `blocks-to-markdown.ts` as a file to create. Step 5 is a "dedicated, well-tested converter." A developer will be confused about scope boundaries.

### Recommended order

| Step | Description | Size | Rationale |
|------|-------------|------|-----------|
| **1** | Types + Config + URL resolver | **S** | Foundation. Zero API calls. Highly testable. Resolves Risks 2, 3, 4 first. |
| **2** | Notion API Client | **M** | SDK wrapper + pagination + rate limiter + retry. Depends on types/config. |
| **3** | Blocks-to-Markdown Converter | **L** | P0 risk item — isolate as its own task with Tier 1/2 split. Needs real fixtures. |
| **4** | Register in Integration Registry + Service wiring | **S** | Mechanical. Follow Krisp pattern exactly. |
| **5** | Core orchestrator: `pullNotionPages()` + save | **M** | Combines client + converter + save + dedup. Integration test territory. |
| **6** | CLI: Configure + Pull commands | **M** | Two commands, but well-patterned. Token validation, QMD refresh, JSON output. |
| **7** | MCP Setup Guidance | **S** | Print instructions only (see R5). |
| **8** | Runtime config, barrel exports, docs, LEARNINGS.md | **S** | Wrap-up. |

**Key change**: The converter is the highest-risk piece. Don't bury it inside a mega-task. Give it its own task with dedicated fixtures and extensive tests.

---

## 4. Risk Assessment (Pre-mortem Review)

### Correctly Prioritized ✅
- **Risk 1 (Block converter) as P0** — Agree. Tier 1/Tier 2 split is exactly right.
- **Risk 3 (URL parsing) as P0** — Agree. The 32-hex-char extraction approach is solid.
- **Risk 4 (Credential producer-consumer) as P1** — Good. Learned from calendar incident.
- **Risk 6 (Rate limiting) as P1** — Agree. Rate limiter must be in client from Day 1.

### Risk 8 (Nested recursion) — Upgrade to P1
The recommendation for iterative (queue-based) fetching is good, but both block-fetching AND block-to-markdown conversion should be iterative. If we solve one iteratively and the other recursively, we'll have inconsistency. The converter should accept a flat list of blocks with depth/parent metadata, not a nested tree.

### Missing Risks

**Risk 9 (MISSING): Notion token scope — page sharing 404s.**
Notion internal integration tokens are workspace-scoped, but pages must be explicitly shared with the integration. A user will configure the token (validates fine via `/v1/users/me`), then try to pull a page that isn't shared with the integration. Notion returns a generic **404**, not a permissions error. This WILL confuse users on first use.

**Mitigation**: When `getPage()` returns 404, return a specific error: *"Page not found. Make sure the page is shared with your Notion integration. See: [Notion docs link]"*. Cache the `/v1/users/me` validation from configure to distinguish "bad token" from "page not shared."

**Risk 10 (MISSING): `@notionhq/client` SDK dependency weight.**
Check package size before committing. If it pulls a massive dependency tree, consider using raw `fetch` (like the Krisp pattern from LEARNINGS.md: "no MCP SDK needed"). The Notion REST API is simple enough for a thin `fetch` wrapper (same pattern as Fathom's `request<T>()` method).

**Decision point**: Run `npm pack --dry-run` on `@notionhq/client`. If < 5 deps and < 500KB, use it. If bloated, write a thin client. Resolve this before Task 2.

---

## 5. Specific Recommendations

### R1: Restructure steps (see §3)
Merge Steps 1 & 5, split into the 8-step order above. Eliminates scope ambiguity.

### R2: Remove `search()` from Phase 1
Step 1 lists `search(query)` as a client method. None of the user stories use search — it's all URL-based pulling. Search is Phase 2 territory. MCP handles its own search for ad-hoc agent queries; the Areté client doesn't need it.

### R3: Capture real API fixtures as PRE-WORK
The pre-mortem says this. I'm elevating it to a **hard requirement**. Before PRD execution, capture 2-3 real Notion page responses from a test workspace and commit as test fixtures. The converter developer needs these given to them, not told to create them.

### R4: Follow Krisp pattern for `getIntegrationStatus()`, not Fathom
Fathom has legacy compat with IDE config files (the `configsDir` check in `IntegrationService`). Notion should be **manifest-only**: check `arete.yaml` for `integrations.notion.status` + credential loader. No legacy paths.

### R5: Simplify MCP step — print instructions, don't auto-write IDE config
The Krisp integration in `integration.ts` doesn't write MCP config — it just works via its own client. For Phase 1, **print clear manual MCP setup instructions** for Cursor/Claude. Auto-writing `.cursor/mcp.json` adds Risk 7 complexity (merge logic, malformed JSON handling, multi-IDE support). Defer auto-config to Phase 2, or make it a clearly separate task with its own tests.

### R6: Add `--dry-run` to pull command
`arete pull notion --page <url> --dry-run` — fetch and convert, print markdown to stdout, don't save. Low effort, high value for first-time users and debugging. Especially important since users will be figuring out page sharing (Risk 9).

### R7: Decide SDK vs. fetch before PRD
This is a pre-work decision that affects Task 2's entire structure. Don't leave it to the developer.

---

## 6. Complexity Estimates

| Step | Description | Size | Notes |
|------|-------------|------|-------|
| 1 | Types + Config + URL resolver | **S** | Pure functions, good test surface |
| 2 | Notion API Client | **M** | Rate limiter is the complexity driver |
| 3 | Blocks-to-Markdown Converter | **L** | 15+ block types, rich text, nesting. Needs extensive fixtures. |
| 4 | Registry + Service wiring | **S** | Mechanical. Copy Krisp pattern. |
| 5 | Core orchestrator + save | **M** | Glue code + dedup logic + integration tests |
| 6 | CLI: Configure + Pull | **M** | Two commands, well-patterned |
| 7 | MCP Setup Guidance | **S** | Print instructions only (per R5) |
| 8 | Exports, docs, LEARNINGS | **S** | Mechanical wrap-up |

**Total**: 4S + 3M + 1L ≈ 4-6 hours subagent time

---

## 7. What's Approved As-Is

- ✅ Problem statement and user stories
- ✅ Phase 1/2/3 scope split
- ✅ Registry entry shape and `api_key` auth type
- ✅ Credential structure (`notion.api_key` in credentials.yaml)
- ✅ Configure flow (prompt → validate via `/v1/users/me` → store)
- ✅ QMD auto-refresh after pull
- ✅ Out-of-scope list
- ✅ Pre-mortem Risk 1 Tier 1/Tier 2 block split
- ✅ Pre-mortem Risk 4 credential alignment mitigation

## What Must Change Before PRD

| # | Change | Why |
|---|--------|-----|
| 1 | **Restructure steps** per §3 | Current Steps 1 & 5 overlap, creating ambiguity |
| 2 | **Remove `search()` from Phase 1** | Not in user stories; MCP handles ad-hoc search |
| 3 | **Add `pages` + `destination` to `PullOptions`** | Core model must support page-based pulls cleanly |
| 4 | **Add Risk 9 (page sharing 404)** to pre-mortem | Guaranteed first-use confusion without it |
| 5 | **Decide SDK vs. fetch** as pre-work | Affects client task structure |
| 6 | **Simplify MCP step** to print-instructions-only | Or scope auto-config as a separate, testable task |
| 7 | **Capture real API fixtures** as pre-work | Converter quality depends on realistic test data |

---

**Bottom line**: This is a well-thought-out plan with a thorough pre-mortem. The core architecture decisions are sound — it follows existing patterns, the risks are mostly identified, and the scope is appropriate for Phase 1. The main issues are structural (step ordering/overlap) and a couple missing risks. Fix those and this is ready for PRD conversion.
