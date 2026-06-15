# plan-context-injection — build learnings (2026-06-15)

Feature: deterministic no-LLM `selectProjectDocs` engine + `arete plan-context --week|--day|--project` aggregator, wiring in-flight project documents into agendas (WS-1), week-plan (WS-2), daily-plan (WS-3) + week→daily fidelity docs (WS-4). WS-5 cache deferred. Plan/discovery/diary in `dev/work/plans/plan-context-injection/`.

## 1. Metrics
- Tasks: 6 (T1–T6) + 3 defect fixes (WS-1 wiring) + 1 budget fix. 12 commits on `feature/plan-context-injection`.
- Tests: 4740 → 4784 (+44), 4782 pass / 0 fail / 2 pre-existing skips. New files: `project-doc-selection.test.ts`, `plan-context.test.ts` (core + cli integration), `agenda-project-doc.test.ts`; extended `agenda-scaffold.test.ts`, `brief-project.test.ts`.
- Iterations: WS-1 took a full rework round (3 defects) after the real-data gate; budget took 2 bumps (8k-total → 6k/project → 10k/project).

## 2. Pre-mortem effectiveness
- 0 CRITICAL predicted; build proceeded correctly.
- **R5 (short-title jaccard → wrong/low-confidence doc): MATERIALIZED** — real glance doc selected correctly but flagged low-confidence (score 0.306). Mitigation (query enrichment) reduced but didn't eliminate; now a backlog tuning item.
- **R9 (shared budget across projects → all-listed): MATERIALIZED** — exactly the `--week` 8k/6≈1.3k bug. Pre-mortem predicted it; the unit test's small-doc fixture didn't catch it.
- R3 (candidates land in `unrouted`): mitigated in T2; not the actual failure mode.
- **Biggest catches came from the REAL-DATA GATE, not the pre-mortem or unit tests:** (a) WS-1 green-but-broken (meeting resolution needs live calendar + `--project` override dead on unresolved meetings + `assembleBriefForProject` unwired); (b) `--week` open-questions empty despite budget bump (whole-doc-or-nothing expansion). Both passed the full suite.

## 3. What worked / what didn't
- ✅ **Real-workspace spike comparison (read-only arete-reserv snapshot) was the decisive gate** — caught two rounds of green-but-broken that the 4700+ unit suite passed. This is the single highest-leverage practice from this build.
- ✅ Eng-lead review pinned the `selectProjectDocs` contract before coding consumers → WS-2/3 didn't redesign mid-stream.
- ✅ "Compose, don't duplicate" held: `plan-context` does zero body parsing (grep-verified); all bodies via `selectProjectDocs`.
- ✅ Optional-param discipline (R1) kept `assembleBriefForProject`'s 2-arg callers + the no-LLM invariant green throughout.
- ❌ **Fixtures were too clean, twice.** The integration fixture had a *resolvable* meeting (masked the `--project`-on-unresolved gap); budget tests used *small* docs (masked whole-doc-or-nothing). Unit-green ≠ works-on-real-data for selection/budget features.

## 4. Recommendations
- **Continue:** mandatory real-workspace acceptance gate for any context/retrieval/selection feature — not just fixtures. Make it part of the AC, run before merge.
- **Start:** when a feature depends on document selection or budgets, include a fixture with a >budget doc AND a multi-project workspace AND an unresolvable subject — the three masks that bit us.
- **Stop:** treating "full suite green" as done for retrieval features.

## 5. Follow-ups
All in `dev/work/backlog/plan-context-injection-followups.md`: project weighting (driving vs reference), large-doc partial expansion / always-extract open-questions, short-title low-confidence tuning, WS-5 disk cache, `--week` token-cost revisit, `package-lock.json` drift at merge.
