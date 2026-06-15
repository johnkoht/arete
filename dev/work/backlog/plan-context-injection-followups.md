# plan-context-injection — fast-follows & backlog

Spun out of the `plan-context-injection` build (overnight ship run 2026-06-14→15; feature branch `feature/plan-context-injection`, pending merge). Design + evidence in `dev/work/plans/plan-context-injection/` (`plan.md`, `discovery-2026-06-14.md`, `diary.md`). Captured so these survive archiving the plan.

**What shipped (for context):** a deterministic no-LLM `selectProjectDocs` engine (traverse project dir + lexically select/expand docs), wired into the agenda path (WS-1), and an `arete plan-context --week|--day|--project` aggregator feeding week-plan (WS-2) and daily-plan (WS-3) + week→daily fidelity docs (WS-4). Verified on a read-only arete-reserv snapshot: Dave "Jira Roadmap Sync" agenda surfaces glance-2-roadmap concerns; `--week` surfaces per-project open questions.

---

## Fast-follows (small, scoped)

### 1. `selectProjectDocs` low-confidence on short meeting titles (pre-mortem R5)
Selection relevance is lexical jaccard between the topic and doc tokens. A bare meeting title ("Jira Roadmap Sync" → ~2-3 tokens after stop-word strip) gives weak jaccard, so the `lowConfidence` flag fires and selection leans on recency. On the real glance doc it still picked correctly (score 0.306) but flagged low-confidence. The aggregator already enriches the query with project name + area (`plan-context.ts` `queryExtra`); the agenda path should do the same / go further (attendees, area). Tune scoring or query enrichment so terse titles rank the right doc confidently. Lives in `packages/core/src/services/brief-assemblers.ts` `selectProjectDocs` (frozen this ship).

### 2. `package-lock.json` 0.15.1→0.16.0 drift
Pre-existing dirty `package-lock.json` (was `M` before this work). Untouched by the build, left out of all commits. Glance at merge — likely just commit it or reset.

---

## Backlog (larger — punted, test-and-circle-back)

### 3. Project weighting — surface *driving* projects, not *reference* ones (`--week`)
**The signal-vs-noise problem John flagged.** `--week` currently pulls ALL active projects ranked by README mtime, cap 12. But not all active projects are weekly-relevant: e.g. `adjuster-shadowing-discovery`, `ai-tooling`, `claims-workspace-discovery` are *reference* projects (pull on-demand via `--project` when working on something), not weekly drivers.

Evidence (arete-reserv, 2026-06-15 — 16 active project dirs):
- **Recency alone misclassifies.** By most-recent-file: `adjuster-shadowing-discovery` 6.9d and `claims-workspace-discovery` 5.0d are *recent* (notes processed into them) but reference-nature → recency would wrongly surface them. `ai-tooling` 54d, `notion-refactor` 75d are genuinely dormant.
- **Current behavior is accidentally OK:** ranking uses README mtime, and the reference/dormant projects lack a `README.md` (mtime→epoch) so they sort last and drop under the cap. Fragile — the moment one gets a README it jumps in.

Options (deferred pending John's testing):
- **(rec) explicit opt-out flag** — frontmatter `planning: reference`; flagged projects never appear in `--week` but stay available via `arete plan-context --project <slug>` (the on-demand layer + AGENTS.md read-before-asserting norm). One-time curation; matches John's mental model.
- open-work-based (surface only projects with open commitments/tasks) — no flag, but a reference project being actively processed has open items.
- a `kind:`/`status:` value he maintains.
Also: **fix the recency signal to max-file-mtime** (not README mtime) once weighting exists — but NOT before, or it regresses the accidental reference-dropping. And **archive dead projects** (`notion-refactor`, `ai-tooling`) to drop them from `active` entirely.

### 4. Large-doc open-questions / partial expansion
`selectProjectDocs` does **whole-doc-or-nothing** expansion (AC1.3: demote-on-overflow, no mid-doc truncation). So a doc larger than the per-project budget (e.g. arete-reserv's 26k `glance-1.5-roadmap.md` vs the 10k `--week` budget) never expands → its *own* `## Open Questions` / content never surfaces; only smaller docs (or the README) do. Today the README's open questions cover the glance case, but a project whose OQ lives only in a >budget doc surfaces none. Fix options: leading-section/partial expansion of the top doc, or a targeted "always extract `## Open Questions` regardless of expansion" pass. Touches frozen WS-1 `selectProjectDocs` (or a sibling). Budget is currently week 10k / day 6k per project (`PLAN_CONTEXT_WEEK/DAY_PER_PROJECT_BUDGET`).

### 5. WS-5 — disk cache (deferred, design preserved in `plan.md`)
Per-project distilled bundle cached at `.arete/cache/plan-context/<slug>.json`, slug-keyed (bounded by construction), max-mtime invalidated. **Only worth it once** (a) a measured latency problem exists, or (b) a future workstream adds LLM distillation of project bodies (the token cost the cache would avoid — selection is currently deterministic/fast). Revisit then; scope to caching `topic find` retrieval first.

### 6. `--week` token cost once weighting lands
Cap 12 × 10k per-project ≈ up to 120k chars (~30k tokens) worst case for a weekly run (acceptable, John biased to richer context). Once weighting (#3) trims to the ~8 driving projects, revisit whether the cap/budget can tighten.
