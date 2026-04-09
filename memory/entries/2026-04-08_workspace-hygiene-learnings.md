# Workspace Hygiene Learnings

**Date**: 2026-04-08
**PRD**: `dev/work/plans/workspace-hygiene/prd.md`
**Execution**: `dev/executions/workspace-hygiene/`

## Metrics

| Metric | Value |
|--------|-------|
| Tasks completed | 6/6 (100%) |
| First-attempt success | 6/6 (100%) |
| Total iterations | 1 |
| Tests added | ~56 new tests |
| Final test count | 179 passing (core + CLI hygiene) |
| Commits | 1 |
| Files changed | 18 source + test files |

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| Public API breakage (Jaccard extraction) | No | Yes (re-exports in services/index.ts) | Yes |
| Timezone date comparison off-by-one | Yes (minor) | Yes (assertion >= 99 not >= 100) | Yes |
| learnings.md format assumption wrong | Yes | Yes (dual-format parser) | Yes — cross-model review caught this |
| CommitmentsService encapsulation break | No | Yes (purgeResolved wraps private methods) | Yes |
| Meeting frontmatter parse edge cases | No | Yes (graceful fallback for missing date) | Yes |

## What Worked

- **Two-phase scan/apply architecture** — scan is pure read (no mutations), apply validates freshness and delegates to owning services. Clean separation makes testing trivial and prevents accidental data loss.
- **Extracting only core Jaccard computation** — 4 callers have different normalization regex. Extracting just `jaccardSimilarity(a[], b[])` and `normalizeForJaccard()` avoided breaking any caller's domain-specific preprocessing.
- **Interactive checkbox with tier 1 pre-checked** — matches the inbox-triage UX pattern. Users see safe actions pre-selected, can deselect or add tier 2/3 items.
- **Cross-model review as format discovery** — the review agent caught that learnings.md uses bullet-list format (`- YYYY-MM-DD: text`) not heading sections. Without this, compactLearnings would have silently dropped all entries.

## What Surprised Us

- **Jaccard was independently implemented 4 times** — commitments.ts, area-parser.ts, meeting-extraction.ts, and meeting-processing.ts all had their own copy. Each with different normalization (different regex, different stop-word lists). Only the set-intersection math was identical.
- **`oldDate(100)` timezone boundary** — creating a date string via `new Date(Date.now() - 100 * 86400000).toISOString().slice(0, 10)` and then parsing it back via `new Date(dateStr)` can produce 99 days difference due to UTC/local timezone crossing. Using >= 99 instead of >= 100 in assertions handles this robustly.

## Non-Obvious Decisions

- **Deterministic IDs via sha256(category + affectedPath).slice(0, 12)** — stable across scans so the same issue maps to the same ID. 12 hex chars gives sufficient uniqueness within a workspace.
- **Activity trim keeps last 2500 lines, archives rest** — not configurable in MVP. Simple enough; can add options later if needed.
- **scannedAt freshness validation (1 hour)** — prevents applying actions from a stale scan where the workspace may have changed. Forces re-scan before apply.
- **purgeResolved wraps existing private shouldPrune** — extended the private method with optional thresholdDays rather than exposing internals or duplicating logic.

## Follow-ups

- Phase 2: Backend routes + Web UI page (plan tasks 7-8)
- Phase 3: Runtime SKILL.md for agent-driven cleanup (plan task 9)
- Future: Semantic dedup via SearchProvider, LLM relevance scoring (plan task 10)
