---
title: Lock Scope And Success Criteria For User Journe Spec
slug: lock-scope-and-success-criteria-for-user-journe-spec
status: completed
size: medium
created: 2026-02-17T05:19:51.574Z
updated: 2026-02-17T23:48:00.000Z
completed: 2026-02-17T23:48:00.000Z
blocked_reason: null
previous_status: null
has_review: true
has_pre_mortem: true
has_prd: false
backlog_ref: null
steps: 5
---

Absolutely — great call.

## Pre-Mortem: Integration Test Harness for Real User Journeys

### Risk: Workspace contamination in the arete dev repo

**Problem**: Integration runs may accidentally seed test data into this repo (or modify tracked files), causing noisy diffs and unsafe test behavior.

**Mitigation**:  
Use an isolated workspace path by default (outside repo, e.g. `~/arete-e2e-workspace`). Add a hard guard in test setup that fails if target path resolves inside `/Users/johnkoht/code/arete`.

**Verification**:  
- Test run logs show sandbox path outside repo root.  
- Safety check fails fast when path is inside repo.

---

### Risk: Integration tests become flaky due to shared state

**Problem**: Reusing one seeded folder across tests can cause order-dependent failures and hidden coupling.

**Mitigation**:  
Define two modes:  
1) deterministic “ephemeral per scenario” mode for CI reliability,  
2) optional persistent local sandbox for fast manual smoke checks.  
Each scenario must reset state (fresh install/clean).

**Verification**:  
- Same suite passes when run twice in a row.  
- Tests pass regardless of order.

---

### Risk: Missing real-user failure coverage

**Problem**: We may build integration tests that still only verify happy-path mechanics, not the journeys that actually fail for users.

**Mitigation**:  
Start with a journey catalog tied to known UX pain (e.g. install → seed → people/status workflows). Add at least one regression scenario reproducing your observed failure pattern.

**Verification**:  
- Each scenario maps to a user-facing job and expected outcome.  
- At least one “previously failing” flow is encoded and passing.

---

### Risk: Brittle assertions tied to exact output text

**Problem**: Minor wording changes in CLI output may break tests without real product regressions.

**Mitigation**:  
Prefer semantic assertions: exit code, JSON keys, file existence/content invariants, index generation, and critical behavior over full-string snapshots.

**Verification**:  
- Tests still pass after harmless message wording tweaks.  
- Tests fail only when behavior changes materially.

---

### Risk: Test architecture drift between legacy and monorepo CLI layers

**Problem**: There are tests across `test/` (legacy-style) and `packages/cli/test/`; adding integration tests in the wrong place can fragment patterns and maintenance.

**Mitigation**:  
Define one canonical integration location and helper layer (shared CLI runner + workspace bootstrap + fixture checks) and document it before adding cases.

**Verification**:  
- New integration tests all live in one agreed structure.  
- Helpers are reused across scenarios (no repeated setup logic).

---

### Risk: Scope creep into full framework rewrite

**Problem**: “Refactor tests to integration” can expand into reworking all test infra, delaying value.

**Mitigation**:  
Phase delivery:  
Phase 1 = minimal harness + 3–5 critical journeys.  
Phase 2 = broaden coverage after proving signal quality.

**Verification**:  
- Phase 1 ships with bounded scenario count and clear done criteria.  
- No unrelated test framework changes in initial implementation.

---

### Risk: Multi-IDE behavior mismatch (Cursor vs Claude)

**Problem**: Integration harness may validate only one IDE path and miss regressions in the other.

**Mitigation**:  
Parameterize scenarios by IDE target (`cursor`, `claude`) for at least install/update smoke coverage; deep workflow coverage can start with one IDE and expand.

**Verification**:  
- Smoke tests run for both IDE targets.  
- Expected IDE-specific artifacts are asserted.

---

### Risk: Quality-gate blind spot (integration suite not run consistently)

**Problem**: If integration tests are ad hoc, regressions can slip despite unit tests passing.

**Mitigation**:  
Add explicit run entrypoint (`npm run test:integration`), document when required (pre-release / CLI-runtime changes), and keep independent from fast unit suite initially.

**Verification**:  
- Command exists and is documented.  
- Team can run integration suite repeatably from one command.

---

## Summary

- **Total risks identified**: 8  
- **Categories covered**: Context Gaps, Test Patterns, Integration, Scope Creep, Multi-IDE Consistency, Dependencies, Platform/State Isolation, Quality Process

**Do you see any other risks? Are these mitigations sufficient?**

---

## Execution Checklist

1. ✅ **Normalize plan metadata and gates**
   - AC: Size normalized to `medium` in frontmatter and body.
   - AC: Gate metadata aligned (`has_review: true`, `has_pre_mortem: true`, `has_prd: false`).
   - AC: Plan status moved to `in-progress`.

2. ✅ **Lock Phase 1 journey list explicitly**
   - AC: Name 3–5 Phase 1 scenarios with command sequences and expected outcomes.
   - AC: Include one regression scenario tied to observed UX failure.
   - AC: Mark out-of-scope for Phase 1.

   **Phase 1 Journeys (locked):**
   1) **Workspace bootstrap smoke (Cursor + Claude)**
      - Commands:
        - `arete install <sandbox>/cursor --ide cursor --json`
        - `arete install <sandbox>/claude --ide claude --json`
        - `arete status --json` (run in each workspace)
      - Expected outcomes:
        - Install exits 0 and returns JSON success.
        - Cursor workspace has `.cursor/rules` + `AGENTS.md` and no `.claude/`.
        - Claude workspace has `.claude/rules` + `CLAUDE.md` and no `.cursor/`.
        - `arete.yaml` includes `schema` and correct `ide_target`.

   2) **Update idempotency + structure safety**
      - Commands:
        - `arete update --json` (run twice in same seeded workspace)
      - Expected outcomes:
        - Both runs exit 0.
        - Required workspace structure remains present after each run.
        - No cross-IDE artifact pollution (Cursor run never creates Claude artifacts, and vice versa).

   3) **Seeded user-data workflow (core UX smoke)**
      - Commands:
        - In external sandbox workspace only, run seed path used by integration harness.
        - `arete people list`
        - `arete people show jane-doe`
        - `arete people index`
      - Expected outcomes:
        - Seeded people and meetings files exist in expected directories.
        - `people list/show` returns seeded entities.
        - `people/index.md` is generated/updated.

   4) **Regression journey: “unit tests pass, real UX fails” reproduction**
      - Commands:
        - Fresh sandbox setup (install + seed), then run the exact user-facing command chain used in Journey 3.
      - Expected outcomes:
        - Command chain succeeds end-to-end on a realistic workspace state.
        - Failures are asserted on behavior (exit code, files, key JSON/markdown invariants), not exact wording.
        - Scenario is deterministic across repeated runs.

   **Out of Scope (Phase 1):**
   - Full replacement of all unit tests with integration tests.
   - Broad migration of legacy `test/` suites.
   - New integration providers or calendar/fathom behavior expansion.
   - Snapshot-heavy golden-output framework rewrite.

3. ✅ **Commit canonical architecture decisions**
   - AC: Lock one integration test location and helper pattern.
   - AC: Set external sandbox as default and repo-local sandbox as opt-in.
   - AC: Define semantic assertion strategy and IDE parameterization coverage.

   **Canonical decisions (locked):**
   - **Integration test location**: `packages/cli/test/integration/`
   - **Shared helper module**: `packages/cli/test/integration/helpers.ts`
   - **Scenario naming**: `*.integration.test.ts` (journey-focused, black-box CLI behavior)
   - **Runner scope (Phase 1)**: extend npm scripts to include integration tests explicitly (separate command).

   **Sandbox policy:**
   - **Default**: external sandbox root outside repo (`~/arete-e2e-workspace` for manual runs, temp dirs for automated runs).
   - **Hard guard**: fail test setup if workspace path resolves inside `/Users/johnkoht/code/arete`.
   - **Repo-local sandbox**: allowed only as explicit opt-in for debugging (must live in gitignored path).

   **Assertion strategy:**
   - Prefer semantic assertions over snapshot strings:
     - exit codes / JSON `success`
     - required file and directory invariants
     - manifest invariants (`schema`, `ide_target`)
     - index generation side effects
   - Use strict string matching only for stable contract text when necessary.

   **IDE coverage policy (Phase 1):**
   - Install/update smoke must run for both `cursor` and `claude`.
   - Seeded workflow/regression may run on primary IDE first (Cursor), then expand to Claude in Phase 2.

4. ✅ **Tighten acceptance criteria for reliability and compatibility**
   - AC: Deterministic rerun expectation documented.
   - AC: Existing test suites and CLI behavior explicitly protected.
   - AC: Keep backward compatibility expectations explicit.

   **Reliability + compatibility AC (locked):**
   - **Deterministic reruns**:
     - Same integration suite must pass on two consecutive runs against fresh workspaces.
     - Scenario order must not affect outcomes (no hidden shared-state dependency).
   - **Behavior contracts over output wording**:
     - Assertions MUST prioritize exit code, JSON contract, file invariants, and side effects.
     - Assertions MUST avoid brittle full-output snapshots unless contract text is intentionally stable.
   - **Backward compatibility guardrails**:
     - Existing unit/golden suites remain unchanged and passing under `npm test`.
     - Existing CLI command interfaces used by current tests (`install`, `update`, `status`, `people`) retain compatibility.
   - **No cross-IDE regressions**:
     - Cursor/Claude artifact boundaries remain enforced in integration assertions.

5. ✅ **Define rollout enforcement policy**
   - AC: Define when `npm run test:integration` is required vs optional.
   - AC: Document local/manual run workflow and CI expectations.
   - AC: Preserve quality gates (`npm run typecheck`, `npm test`).

   **Rollout enforcement policy (locked):**
   - **Required** (`npm run test:integration`):
     - Changes touching CLI command behavior, workspace install/update flows, seed/test-data workflows, or integration harness files.
   - **Optional (recommended)**:
     - Refactors not affecting CLI behavior or workspace side effects.
   - **Can skip**:
     - Documentation-only or comment-only changes.

   **Execution expectations:**
   - **Local manual run**:
     - `npm run typecheck`
     - `npm test`
     - `npm run test:integration` (when required by triggers above)
   - **CI/automation expectation (Phase 1)**:
     - Keep integration suite as explicit job/step (not merged into default fast test job yet).
     - Fail build when required integration checks fail.
   - **Quality gates stay mandatory**:
     - `npm run typecheck` and `npm test` are always required.

- **Size**: medium
- **Steps**: 5
- **Key risks**: repo contamination, flakiness from shared state, brittle assertions, scope creep, IDE mismatch
- **Dependencies**: agreed sandbox policy, journey prioritization, shared harness helpers, existing CLI install/update/seed behavior