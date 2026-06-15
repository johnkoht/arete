# Active Topics openItemsBySlug from area-memory cache (WS-1) — build learnings

> Worktree build on `feature/active-topics-openitems`, 2026-06-14. WS-1 of `dev/work/plans/project-wiki-sync-followups/plan.md`. Populates `getActiveTopics`'s `openItemsBySlug` seam at boot (the fuller follow-up to v0.16.0's durable-status floor, which was the shipped WS-A). Uncommitted → committed on branch; not released.

## Outcome

- New `AreaMemoryService.getOpenItemsBySlug(paths)` — reads each `.arete/memory/areas/*.md` once, yaml-`parse`s the frontmatter, sums per-topic `open_items` into a `Map<slug, count>`. Bounded by #areas, never throws (missing dir → empty map; malformed file/no `topics:` → skipped).
- Wired through the existing `loadMemorySummary(..., { activeTopics: { openItemsBySlug } })` options seam at the two boot call sites: `intelligence.ts` (memory refresh) and `update.ts`. This revives the previously-dead `openItems > 0` keep-arm AND the open-items sort primary key in `getActiveTopics`. The durable-status filter arm (from WS-A) is retained.
- Tests: +getOpenItemsBySlug cases (multi-area, 0-count, dup-sum across areas, no-topics, malformed, missing-dir) + an active-topics non-resurrection guard (map entry with count 0 does not keep an aged-out topic). 70/70 targeted; 4052/4052 core.

## Non-obvious lessons

- **There is NO topic-keyed open-items store.** Commitments/tasks are area/project/person-keyed; nothing is keyed by topic slug. The ONLY per-topic count that exists is the `open_items` field persisted in area-memory frontmatter — and that field is a SUM of extraction snapshots that is never decremented as items get done. So the count is a deliberately-approximate RANKING signal, not a ledger.
- **The approximate count feeds BOTH the sort AND the keep-filter** — so a long-dead topic carrying a big historical `open_items` sum can resurrect into boot context. This is bounded by area-memory's 60-day-with-zero-open-items exclusion, which does NOT catch a *nonzero* stale sum. Accepted as a known wart for now; the real fix (a live count, e.g. by tagging items with `@topic` and counting open ones) is punted. The non-resurrection test only guards the count==0 case; it cannot guard the nonzero-stale case because the data doesn't distinguish stale from live.
- **Freshness differs by call site.** The harvest reuses already-computed persisted data (cheap), and at the `intelligence.ts` site it runs immediately after `refreshAllAreaMemory`, so counts are fresh there. `update.ts` does NOT refresh area memory first, so its counts may lag — acceptable and graceful by design (next memory refresh corrects them); the whole load also degrades to `memorySummary: undefined` if it throws.
- **Cross-package build gotcha (worktree).** In a worktree whose `node_modules/@arete/core` symlinks to main's STALE `dist`, a plain `tsc -b packages/cli` mis-resolves the new core methods (`getOpenItemsBySlug` looks absent). Must build `@arete/core` first / override the path resolution. The committed `dist/` is only authoritative after a clean build on the merge target — don't trust a worktree-local dist that was produced against a stale core.

## Learnings

- The "tested but not wired" trap (documented in services LEARNINGS) is exactly what WS-A left behind: `openItemsBySlug` was a real consumer in `getActiveTopics` that no caller populated. WS-1 closes it. When a seam exists with no production producer, treat it as dark code, not "done."
