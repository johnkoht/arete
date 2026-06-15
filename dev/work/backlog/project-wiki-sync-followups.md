# Project wiki-sync — fast-follows & backlog

Spun out of the v0.16.0 work (project search provenance + active-topics durable-status — PRs #14/#15) and the design exploration in `dev/work/plans/project-wiki-sync/`. Captured 2026-06-14 for later triage. (Uncommitted working note, like the rest of `dev/work/backlog/`.)

## Fast-follows (small, scoped)

### 1. Populate `openItemsBySlug` at boot (the fuller WS-A fix)
WS-A shipped a *workaround*: durable-status topics (`active`/`stable`/`blocked`) now survive the 90-day boot cutoff. But the *intended* "a topic with open work stays in boot context" branch is still dead — `getActiveTopics`'s optional `openItemsBySlug` map is never populated by any live caller (the `loadMemorySummary` path: `update.ts`, `intelligence.ts`, `meeting.ts`).
- Compute per-topic open-item counts (open commitments / action items attributable to each topic slug) and pass the map into `getActiveTopics`.
- **The real work is the count source**, not the wiring: decide what "open items for a topic" means and whether it's cheap enough to compute at boot. Once that's settled, threading the map through is trivial.

### 2. Provenance denylist expansion — ONLY if it proves noisy
The search down-rank denylist is intentionally minimal (`working/` only). `prototypes/` and `sessions/` were left neutral on purpose (primary design history / research, not the abandoned-brainstorm failure mode). Revisit only if real searches show them outranking durable content.

### 3. Reconcile `wrap` vs `finalize-project` overlap
The two skills overlap and even share trigger phrases ("wrap up", "archive project"). `finalize-project` = project-specific, full-ceremony close-out (context reconciliation, dated archive, briefs-surfacing retro); `wrap` = general lightweight retro. Decide: merge, differentiate triggers cleanly, or have one delegate to the other.

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
