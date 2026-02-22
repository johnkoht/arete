---
date: 2026-02-21
title: Krisp Recorder Integration
tags: [integration, krisp, oauth, mcp]
---

# Krisp Recorder Integration (2026-02-21)

## Summary
Added Krisp as a meeting recorder integration via its hosted MCP server. Users run `arete integration configure krisp` once (browser OAuth), then `arete pull krisp [--days N]` to pull meetings. Implementation uses OAuth 2.0 dynamic client registration (confidential client — client_secret_basic + PKCE) with plain JSON-RPC POST transport. 18 tests in core, 12 new tests in CLI layer; 4 commits.

## Key Architectural Decisions

- **OAuth in `client.ts`, not `integration.ts`**: All OAuth logic (registration, PKCE, token exchange, refresh) lives in `KrispMcpClient.configure()`. The CLI command calls `client.configure()` and handles persistence. This keeps the OAuth flow testable as a unit.
- **Single `search_meetings` call with `fields` array**: No N+1 document fetches — Krisp's API returns all content (transcript, summaries, action items) in one `search_meetings` call with the `fields` parameter. Faster and simpler than a list-then-fetch pattern.
- **No `@modelcontextprotocol/client` SDK**: Krisp MCP is plain JSON-RPC POST; `fetch` + ~30-line wrapper is sufficient. Avoids an unvetted dependency.
- **Dynamic port 0 + re-registration**: OS-assigned port for localhost callback; re-register `redirect_uri` per configure run to avoid EADDRINUSE.
- **`expires_at` as Unix number**: Stored as seconds-since-epoch for direct comparison in silent refresh check.

## Pre-Mortem Effectiveness

| Risk | Materialized? | Mitigation Effective? |
|------|--------------|----------------------|
| Confidential client auth | No (designed in from start) | Yes — Basic auth test caught it |
| getIntegrationStatus hardcoded for Fathom | Yes | Yes — extracted loadOAuthTokenStatus helper |
| Dual-write in configure | No | Yes — test verified both writes |
| OAuth in wrong file | No | Yes — architecture enforced in prompts |
| GUIDE.md/LEARNINGS.md "create not update" | Yes (PRD was wrong) | Yes — reviewer caught before developer ran |
| expires_at type (ISO vs Unix) | Yes — stored as number not string | Yes — LEARNINGS.md updated |
| KrispMcpClient.configure() signature | Yes — takes (storage, workspaceRoot) | Yes — caught by "read files first" |

## Learnings

- The "read files first" prompt directive caught two type discrepancies (expires_at as number, configure() signature) before any code was written.
- Pre-mortem Risk 7 was inverted in the PRD — both files existed. Reviewer caught this before developer ran, saving potential content destruction.
- Reviewer pre-work checks are worth the round-trip: Task 2 sanity check raised 5 real issues that would have wasted developer tokens.

## Files Changed

- `packages/core/src/integrations/krisp/` — new integration: `client.ts`, `pull.ts`, `types.ts`, `index.ts`
- `packages/core/src/integrations/registry.ts` — added Krisp entry
- `packages/core/src/services/integrations.ts` — wired Krisp pull handler
- `packages/cli/src/commands/integration.ts` — `configureKrisp()` command
- `packages/cli/src/commands/pull.ts` — `pullKrisp()` command
- `packages/runtime/integrations/configs/krisp.yaml` — integration config
- `packages/runtime/integrations/registry.md` — updated registry
- `packages/runtime/GUIDE.md` — Krisp subsection + CLI reference row
- `packages/core/src/integrations/LEARNINGS.md` — Krisp OAuth patterns appended
- `memory/entries/2026-02-21_krisp-integration.md` — this entry
