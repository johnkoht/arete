## Review: QMD Improvements Plan

**Type**: Plan (pre-execution)
**Audience**: Builder/User hybrid — implementation is builder-side (CLI + core code), impact is user-side (GUIDE MODE workspace PMs get fresher search)
**Reviewed**: 2026-02-21

---

### Concerns

**1. Scope — `meeting.ts` has no `loadConfig`; Step 2 has an unaddressed implicit dependency**

`meeting.ts` currently imports zero config infrastructure — no `loadConfig`, no `qmd_collection` access. Step 2 wires `refreshQmdIndex()` into `meeting add` and `meeting process`, and the plan specifies the helper should receive `existingCollectionName` as a parameter (per pre-mortem Risk 2 mitigation). But neither the plan nor the ACs acknowledge that `meeting.ts` needs a new `loadConfig` call to provide this. `pull.ts` already does it (`loadConfig(services.storage, workspaceRoot)` at L98), so the pattern exists — but it's not specified in Step 2's implementation details.

Suggestion: Add to Step 2 AC: "In `meeting.ts`, add `loadConfig(services.storage, root)` call after `findRoot()` succeeds, following the `pull.ts` pattern. Pass `config.qmd_collection` to `refreshQmdIndex()`."

---

**2. Completeness — `arete index --status` assumes qmd exposes last-indexed data it doesn't have**

Step 3 specifies `--status` shows "collection name and last-indexed state." qmd doesn't expose a machine-readable last-indexed timestamp. The ACs say "`arete index --status` reports collection info" — if "info" means just collection name from `arete.yaml`, that's fine. But "last-indexed state" is an unvalidated assumption.

Suggestion: Either drop `--status` entirely (shipping `arete index` alone is sufficient for MVP), or clarify the AC: "Shows collection name from `arete.yaml`. Does not report index freshness (qmd doesn't expose this)."

---

**3. Catalog — `qmd-semantic-search` entry is stale and not addressed in plan scope**

`dev/catalog/capabilities.json` entry for `qmd-semantic-search` lists `packages/core/src/search-providers/qmd.ts` as an implementation path — but the actual file is at `packages/core/src/search/providers/qmd.ts`. Also lists `packages/core/src/services/search.ts`, which doesn't exist. This plan touches the qmd capability directly (new helper, new command, factory wiring). The capability entry should be updated as part of this work.

Suggestion: Add to Step 1 AC or as a separate note: "Update `dev/catalog/capabilities.json` — correct `qmd-semantic-search` implementation paths and add new paths touched by this plan."

---

**4. Patterns — Existing `meeting process` tests need `--skip-qmd` added to command invocations**

Tests in `meeting-process.test.ts` correctly pass `--skip-qmd` to the `install` setup call, but the actual `meeting process` invocations don't have it. Once `meeting process` respects `--skip-qmd`, those test invocations need updating. The plan says "Tests for each command verify the helper is called; `--skip-qmd` suppresses it" — but doesn't acknowledge the existing test cases that will need the flag added.

Suggestion: Add to Step 2 AC: "Audit existing `meeting-process.test.ts` and any other command tests that invoke `meeting process` without `--skip-qmd`; add the flag to prevent test suite hangs."

---

**5. Completeness — Step 6 AC is too thin to catch silent wiring failure**

Step 6 AC is only: "Existing entity tests pass." But all existing entity tests construct `new EntityService(storage)` directly — they bypass the factory entirely. A developer could wire Step 6 incorrectly in `factory.ts` (forget to pass the search provider) and all existing tests would still pass.

Suggestion: Add to Step 6 AC: "New test verifies that `createServices()` passes a SearchProvider to EntityService — at minimum, assert the provider is not `undefined` when qmd is available."

---

### Strengths

- **QMD usage map is excellent** — Enumerating every skill + command that reads/writes qmd gives the developer exactly the context needed without missing anything
- **Pre-mortem integration is tight** — Risk 1 (test hangs) and Risk 3 (false negatives) are the two most dangerous risks and both have specific, testable mitigations
- **Out-of-scope section is disciplined** — Explicitly excluding live indexing, watch mode, and non-markdown files prevents scope creep
- **`testDeps` pattern cited concretely** — References the specific file to follow (`qmd-setup.ts`), not just "follow the pattern"

---

### Devil's Advocate

**If this fails, it will be because...** `meeting.ts` loads config in the wrong order — config read before `findRoot()` confirms the workspace root, so `loadConfig` uses `process.cwd()` instead of the actual `root`. Result: `qmd_collection` comes back `undefined`, `refreshQmdIndex()` silently skips, and the developer doesn't notice because tests pass (they mock the helper). The bug only appears in real usage. This is a "works in tests, fails in production" failure mode because the test fixture happens to have matching cwd and workspace root.

**The worst outcome would be...** qmd update hangs the test suite in CI. This happened before (`fbb5ad2`). If `--skip-qmd` is correctly added to `meeting add` but missed on `meeting process`, or if any existing test file calls `meeting process` without the flag (which now triggers qmd), CI silently hangs with no useful error. The cause is non-obvious to anyone who doesn't know the history. Risk is higher here than in Phase 2 because Phase 1 touches 3 different command files with existing test coverage.

---

### Verdict

✅ **Approve with suggestions**

The plan is well-constructed and the pre-mortem covers the highest-stakes risks. None of the concerns require redesign — they are implementation-detail gaps to incorporate into step ACs before PRD creation:

1. Add `loadConfig` requirement to Step 2 AC
2. Clarify or drop `--status` in Step 3
3. Add capability registry update to scope
4. Add existing test audit to Step 2 AC
5. Strengthen Step 6 AC with a factory-level integration test
