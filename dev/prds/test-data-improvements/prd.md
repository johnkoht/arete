# PRD: Test Data Improvements

**Version**: 1.0
**Status**: Draft
**Date**: 2026-02-17
**Plan**: Test Data Improvements (6-step approved plan)

---

## Goal

Improve Areté’s test data system so it reliably validates real end-product PM/builder workflows (memory, context, resolve, brief, people intelligence, planning), while also providing a shared fixture foundation for automated developer tests.

---

## User Stories / Tasks

### Task 1: Lock scope and success criteria (product-first)

Define and document the canonical scenario contract so seeded data validates end-product behavior, not only internal implementation details.

**Acceptance Criteria**
- Scenario contract lists end-product workflows (brief, context inventory, memory search, memory timeline, resolve, people memory refresh, planning/agenda/PRD prep). <!-- inferred from plan -->
- Each workflow includes explicit expected user-facing output signals. <!-- inferred from plan -->
- Documentation clearly distinguishes seeded product fixture purpose (`test-data/`) from developer fixture API purpose (`packages/core/test/fixtures/`). <!-- inferred from plan -->

---

### Task 2: Expand `test-data/` corpus for realistic end-product journeys

Build a richer narrative fixture corpus with enough temporal and relational depth to exercise major features meaningfully.

**Acceptance Criteria**
- Seed corpus includes at least 6 people and 12–15 meetings spanning ~10 weeks. <!-- inferred from plan -->
- Corpus includes at least 3 project threads and richer memory entries across decisions/learnings. <!-- inferred from plan -->
- Corpus includes freshness spread (older + newer artifacts) to support stale detection in `context --inventory`. <!-- inferred from plan -->
- `test-data/TEST-SCENARIOS.md` maps prompts to expected outcomes. <!-- inferred from plan -->

---

### Task 3: Upgrade integration tests to semantic product assertions

Refactor/add integration tests so they validate surfaced intelligence quality, not just structural counts.

**Acceptance Criteria**
- Existing seeded integration tests assert semantic content signals (entity/thread/action), not only file counts. <!-- inferred from plan -->
- Add integration coverage for `memory search`, `memory timeline`, `resolve`, `people memory refresh`, and stale inventory behavior. <!-- inferred from plan -->
- Assertions use stable semantic markers (slug/title/company/thread/source paths) instead of brittle exact prose. <!-- inferred from plan -->

---

### Task 4: Add shared fixture builder for dev tests (mirrors product corpus)

Introduce a typed fixture factory for core tests that mirrors the product-seeded scenario and reduces duplicated setup boilerplate.

**Acceptance Criteria**
- Add `packages/core/test/fixtures/` with typed API and at least one rich preset scenario. <!-- inferred from plan -->
- Add fixture-builder tests validating deterministic output and compatibility with core services. <!-- inferred from plan -->
- Migrate at least 2–3 high-value service tests from ad-hoc setup to shared fixture helpers. <!-- inferred from plan -->

---

### Task 5: Ensure seed command supports lifecycle-rich projects safely

Update seed behavior to support realistic project lifecycle fixture structures while preserving backward compatibility.

**Acceptance Criteria**
- `arete seed test-data` supports lifecycle fixture paths (e.g., active/archive) without flattening all projects to active. <!-- inferred from plan -->
- Existing fixture layout compatibility is preserved. <!-- inferred from plan -->
- Seed command tests cover legacy and lifecycle-rich fixture shapes. <!-- inferred from plan -->

---

### Task 6: Docs + validation gates + handoff

Finalize docs and validate shipping quality with mandatory gates.

**Acceptance Criteria**
- Fixture/testing docs are updated with canonical scenario usage and contributor guidance. <!-- inferred from plan -->
- `npm run typecheck` and `npm test` pass (`npm run test:py` only if Python changes are made). <!-- inferred from plan -->
- A concise manual smoke script exists for validating end-product workspace behavior. <!-- inferred from plan -->

---

## Dependencies / Order

1. Task 1 → Task 2 → Task 3
2. Task 4 can begin after Task 1 contract is defined (in parallel with Task 2/3)
3. Task 5 depends on Task 2 corpus shape and seed expectations
4. Task 6 depends on completion of Tasks 1–5

---

## Success Criteria

- Seeded workspaces reliably exercise core PM/builder workflows.
- Integration tests verify semantic correctness of intelligence outputs.
- Core tests gain shared, realistic fixtures and less duplicated setup.
- Seed command supports richer project lifecycles without regressions.
- Full quality gates pass.
