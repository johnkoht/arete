# Models — Learnings

Pure data primitives + view renderers (no I/O, no clock reads unless injected). Consumed by generators, prompts, and CLI commands.

## Gotchas

- **`getActiveTopics` "openItems OR recent" filter was DEAD — collapsed to recency-only** (2026-06-13, v0.16.0): What broke: durable-but-quiet topics were dropped from boot context after 90 quiet days even though the documented filter was "openItems>0 OR recent". Why: `openItemsBySlug` is an OPTIONAL param that NO live boot caller populates (the `loadMemorySummary` path — `update.ts:71`, `intelligence.ts:519`, `meeting.ts:1298` — passes nothing), so `openItems` was always 0 and the `openItems > 0` branch never fired; the filter silently degraded to recency-only. Fix: also keep topics whose `status ∈ {active, stable, blocked}` (durable), so a long-running thread isn't aged out of boot context. `stale`/`archived` still age out; `new` is covered by recency. See `active-topics.ts:90-92`. Source: v0.16.0 project search provenance + active-topics durable-status (commit dd06769b).

## Invariants

- **An OPTIONAL signal param must have a verified live caller that populates it.** When a selection/filter function takes an optional signal (e.g. `openItemsBySlug`), confirm a real caller actually supplies it — a never-populated optional silently degrades the function to its default branch, and the "richer" filter behavior becomes dead code. Violating this causes: documented logic that never executes in production (the WS-A regression above). Cross-ref `packages/cli/src/commands/LEARNINGS.md`.

## Pre-Edit Checklist

Before editing files in this directory:
- [ ] Keep primitives pure — no I/O, no `new Date()` except via an injectable `today`/`now` option.
- [ ] If a function takes an optional signal param, grep its live callers to confirm at least one populates it before relying on the branch it gates.

## Patterns

- **One data source, view-specific renderers**: `getActiveTopics` feeds both the CLAUDE.md wikilink view (`renderActiveTopicsAsWikilinks`) and the extraction-prompt bias view (`renderActiveTopicsAsSlugList`). Renderers stay separate so wikilink syntax `[[...]]` never leaks into the extraction LLM's JSON output. Example: `packages/core/src/models/active-topics.ts`.

## References

- `packages/cli/src/commands/LEARNINGS.md` — optional-signal-param invariant (cross-ref)
- `packages/core/src/generators/LEARNINGS.md` — consumer of these primitives
