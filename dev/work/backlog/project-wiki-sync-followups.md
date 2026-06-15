# Project wiki-sync — fast-follows & backlog

Spun out of the v0.16.0 work (project search provenance + active-topics durable-status — PRs #14/#15) and the design exploration in `dev/work/plans/project-wiki-sync/`. Captured 2026-06-14 for later triage. (Uncommitted working note, like the rest of `dev/work/backlog/`.)

## Fast-follows (small, scoped)

### 1. Populate `openItemsBySlug` at boot (the fuller WS-A fix) — ✅ SHIPPED v0.17.0
Resolved by **harvesting the area cache**: new `AreaMemoryService.getOpenItemsBySlug()` reads the per-topic `open_items` already persisted in area-memory frontmatter and passes the map into `getActiveTopics` at the two boot sites (`intelligence.ts`, `update.ts`). The dead `openItems>0` keep-arm + open-items sort key are live again; durable-status arm retained. The "count source" question was answered pragmatically: the count is a deliberately-approximate ranking signal (a never-decremented snapshot sum), not a ledger — a live-count fix (add `@topic` to commitments/tasks) remains punted. See `memory/entries/2026-06-14_active-topics-openitems-learnings.md`.

### 2. Provenance denylist expansion — ONLY if it proves noisy
The search down-rank denylist is intentionally minimal (`working/` only). `prototypes/` and `sessions/` were left neutral on purpose (primary design history / research, not the abandoned-brainstorm failure mode). Revisit only if real searches show them outranking durable content.

### 3. Reconcile `wrap` vs `finalize-project` overlap — ✅ SHIPPED v0.17.0
Resolved by **differentiate triggers + structural hand-off**: `finalize-project` got a real `triggers:` array (it had none) and owns the project-archival phrases; `wrap` dropped `archive this project`, re-scoped its description, and step 6 now *structurally refuses* to archive a `projects/active/` dir (redirects to `finalize-project`) with an up-front hand-off. Real-router testing revealed the actual collision was the read-only `project` skill shadowing finalize-project (common-word id), so the fix also corrected three `scoreMatch` bugs (substring id-match, inverted dashify bonus, flat trigger weight → specificity hierarchy multi-trigger 22 > id 20 > single-trigger 10). Full per-skill routing sweep, zero new regressions. See `memory/entries/2026-06-14_wrap-finalize-router-learnings.md`.

**Residual (open):** `weekly-winddown` wins its "week" triggers over `week-plan` by only +2 (genuinely ambiguous; no router tie-break surface). Candidate future fix: an exact-contiguous-phrase bonus.

## Backlog (larger — punted)

### 4. `/publish` — project outputs → wiki  (PUNTED 2026-06-14, keep in backlog)
The big deferred design: bridge published project `outputs/` into the reconciled topic wiki. Full design already written in `dev/work/plans/project-wiki-sync/`:
- **proposal-1 (ingestion/reconcile)** — the hard part: supersession-by-omission, source-authority tiering, doc versioning. ~40% genuinely new machinery; gate omission inference behind a golden-doc eval.
- **proposal-2 (publish lifecycle)** — `/publish` verb (mid-life, per-doc) decoupled from terminal `/finalize-project`; auto-index vs. gated-reconcile; markdown-checkbox approval doc.
- **proposal-3 (continuity/retrieval)** — topic-as-continuity-unit; archived-project reachability.

Precondition already shipped: the search-time provenance floor (v0.16.0). **Do NOT ship the output→wiki fact-assertion until reconcile (especially omission) is real** — shipping early makes the wiki confidently wrong.

### 5. Cross-PM / external-doc provenance axis (proposal-4 — never written)
When another PM's PRD enters the workspace (Notion pull / sent markdown): mechanically it's just another L1 source, but it forces an *ownership* axis on source-tier — a foreign doc is authoritative in its owner's domain, reference-only in yours; it may ADD or FLAG a conflict, but never RETRACT your facts. The doc-identity frontmatter becomes the interchange format (document-passing, not live integration — you don't own the other systems). Honest ceiling: no cross-person supersession without shared infra; freshness degrades to manual re-pull. Write up as proposal-4 if/when this advances.

## References
- Plan + proposals: `dev/work/plans/project-wiki-sync/`
- Shipped: v0.16.0 (PRs #14, #15); `definition_of_done` directive (PR #16)
- Memory: repo `memory/entries/2026-06-14_project-search-provenance-learnings.md`; user auto-memory `project_published_doc_sync`
