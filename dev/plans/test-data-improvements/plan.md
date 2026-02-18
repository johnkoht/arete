---
title: Test Data Improvements
slug: test-data-improvements
status: draft
size: large
created: 2026-02-17T22:52:19.561Z
updated: 2026-02-17T22:53:53.329Z
completed: null
blocked_reason: null
previous_status: null
has_review: false
has_pre_mortem: true
has_prd: true
backlog_ref: null
steps: 6
---

Great question — and important distinction.

**Short answer:**  
- **`test-data/` seeded via `arete seed test-data` is for testing the end product experience** (PM/builder workflows in a workspace): memory, context, briefs, agendas, PRD creation flows, people intelligence, etc.  
- **The fixture factory in `packages/core/test/fixtures/` is for building/testing Areté itself** (developer-side automated tests), but should mirror that same realistic end-user scenario.

So it’s both, but with different consumers:
1. **Product-side manual/e2e realism** (`test-data/`)  
2. **Dev-side automated correctness** (shared fixture builder)

---

Plan:
1. **Lock scope and success criteria (Product-first)** — Explicitly define that canonical scenarios represent end-user workspace behavior, not internal build-only edge cases.
   - AC: Scenario contract lists end-product workflows (brief/context/memory/resolve/people/agenda/PRD prep).
   - AC: Each scenario includes expected user-facing outputs/signals.
   - AC: Document distinction: seeded product fixtures vs developer test fixture API.

2. **Expand `test-data/` for realistic end-product journeys** — Build a richer narrative corpus across time, people, and projects.
   - AC: 6+ people, 12–15 meetings over ~10 weeks, 3 project threads, richer memory items.
   - AC: Includes recurring themes and stale/fresh spread for `context --inventory`.
   - AC: `test-data/TEST-SCENARIOS.md` maps prompts to expected outcomes.

3. **Upgrade integration tests to semantic product assertions** — Ensure CLI behavior matches user intent, not just structure.
   - AC: Existing integration tests assert meaningful content (who/what/thread/action), not only counts.
   - AC: Add coverage for `memory search`, `memory timeline`, `resolve`, `people memory refresh`, stale inventory.
   - AC: Assertions prefer stable signals over brittle exact prose.

4. **Add shared fixture builder for dev tests (mirrors product corpus)** — Reduce duplicated setup while keeping parity with seeded scenarios.
   - AC: Add `packages/core/test/fixtures/` typed API and one rich preset scenario.
   - AC: New fixture tests validate deterministic output and compatibility with services.
   - AC: Initial migration of 2–3 high-value service tests away from ad-hoc setup.

5. **Ensure seed command supports lifecycle-rich projects safely** — Preserve end-product realism without breaking existing behavior.
   - AC: `seed test-data` can copy active/archive project fixtures correctly.
   - AC: Backward-compatible with current fixture layout.
   - AC: Seed command tests cover old and new fixture shapes.

6. **Docs + validation gates + handoff** — Make this maintainable and safe to ship.
   - AC: Update fixture docs/contributor guidance to enforce canonical scenario usage.
   - AC: Run `npm run typecheck` and `npm test` (plus `npm run test:py` only if Python touched).
   - AC: Provide a short “manual smoke script” for end-product workspace validation.

---

- **Size**: large  
- **Steps**: 6  
- **Key risks**: product/dev fixture drift, brittle semantic assertions, date-based flakiness, seed compatibility regressions  
- **Dependencies**: existing seed flow, CLI integration harness, current core test patterns

Given this is 3+ steps and cross-cutting, I recommend **PRD path next** (`/skill:plan-to-prd`) before execution.