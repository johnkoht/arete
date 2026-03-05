# Meeting Triage PRD Learnings

**Date**: 2026-03-04
**PRD**: meeting-triage (Meeting Minder — Areté Meeting Triage App)
**Branch**: app (worktree: arete--app)

---

## Metrics

| Metric | Value |
|--------|-------|
| Tasks completed | 7/7 |
| First-attempt success | 5/7 (71%) |
| Iterations required | 3 total (T3: 1 iterate, T4: 1 iterate, T7: 0) |
| New packages | packages/apps/backend/ + packages/apps/web/ |
| Tests added | +6 (T1 zero, inherited 1235) → +21 (T2) → +16 (T3) → +7 (T4) → +13 (T5) → +6 (T7) = ~63 new tests |
| Commits | 12+ commits across all tasks |
| Token estimate | ~53K total across all subagents |
| Build memory | This entry |

---

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| Vite/React build isolation | No | Yes (isolated tsconfig, no tsc -b reference) | Yes |
| Staged item parsing fragility | No | Yes (case-insensitive headers, empty arrays) | Yes |
| Pi SDK API surface unknown | Partial | Yes (developer inspected .d.ts before coding) | Partial — text_delta shape was still wrong in first pass (test only, not production) |
| Concurrent write races | No | Yes (per-slug withSlugLock on all writes) | Yes |
| apps/ not in workspace | No | Yes (file: references, no workspaces conversion) | Yes |
| process-meetings backward compat | No | Yes (--commit flag added) | Yes |
| arete view server spawn path | No | Yes (getPackageRoot() + existsSync dev/prod fallback) | Yes |
| AGENTS.md discoverability | Partial | Caught by reviewer | Fixed in Phase 3 |
| gray-matter round-trips | No | Yes (yaml-only in core, gray-matter in backend only) | Yes |

**3/9 risks partially materialized** (Pi SDK event shape in tests, AGENTS.md discoverability gap, DELETE missing withSlugLock). All were caught by the reviewer and fixed.

---

## What Worked Well

1. **Reviewer sanity checks caught real gaps before work started** — The pre-work reviewer caught: wrong tsconfig.base.json path (T1), workspace array strategy (T1), action items disposition (T2), staged_item_status YAML schema (T2), commitApprovedItems signature (T3), API key check mechanism (T4). These prevented 6 implementation bugs before any code was written.

2. **Exact API surface from Task 2 guided Task 3+** — Reading `staged-items.ts` before crafting the T3 prompt gave exact function signatures (storage first, then filePath, then memoryDir). This prevented a common "guessed wrong arg order" bug.

3. **Pi SDK verification before coding** — Task 4 developer was instructed to read the actual `.d.ts` files first. This caught the `text_delta` shape difference early (flat `delta: string` vs nested Anthropic `content_block_delta`).

4. **Type-shape-in-API-layer pattern** — Task 5 handled all backend→frontend type mismatches (attendees initials, duration parsing, ai/de/le → action/decision/learning) in `api/meetings.ts`, keeping components clean. Reviewer confirmed clean architecture.

5. **DI pattern for all testable side effects** — `ViewCommandDeps`, `AvailabilityDeps`, `CalendarDeps` — same proven pattern applied to `view.ts`. No test runner hangs, clean mocking.

---

## What Didn't Work (Iterate Causes)

1. **T3 iterate: DELETE missing withSlugLock** — Developer followed the per-slug lock pattern for PUT/PATCH/approve but missed DELETE. Root cause: the mitigation was described as "all writes" but DELETE isn't obviously a "write" operation. Fix: future task prompts should enumerate every endpoint that needs locking rather than saying "all writes."

2. **T4 iterate: Test event shape vs production** — Pi SDK normalized `text_delta` shape (flat `delta: string`) was documented in the task prompt correctly, but the test's inline function used the raw Anthropic nested shape. Tests passed because both sides were consistently wrong. Fix: when providing event shape specs, include both "use THIS" and "NOT this" examples to make the contrast explicit.

---

## Subagent Reflections (Synthesized)

- **Context specificity matters more than coverage**: Tasks with pre-specified exact patterns (T3's signature, T7's spawn path) had zero architecture guesses. Tasks with vaguer guidance required iteration.
- **First-use pattern documentation happened organically**: Every major first-use (gray-matter split, Hono factory, Pi SDK session, TanStack v5 syntax, SIGINT listener bleed) was documented in LEARNINGS.md by the developers without prompting from the orchestrator.
- **Reviewer's pre-work sanity check ROI is high**: ~40% of sanity checks returned NEEDS REFINEMENT with issues that would have caused real bugs. This phase adds ~10% to prompt crafting time but saves 2-3 iterate loops.

---

## Collaboration Patterns

- Builder approved pre-mortem immediately with "nope, please proceed" — no additional risks surfaced. Fast directional decision once pre-mortem presented.
- Builder initiated with full context (PRD path + JSON path + explicit skill load request) — execution could begin immediately.

---

## System Improvements Applied

| File | What Changed |
|------|-------------|
| `packages/apps/backend/LEARNINGS.md` | Created: Hono factory, gray-matter/yaml split, per-slug lock invariant, QMD non-fatal, Pi SDK integration, SSE polling |
| `packages/apps/web/LEARNINGS.md` | Created: API layer pattern, staged_item_edits gotcha, TanStack v5 syntax, SSE cleanup, sync job coordination |
| `packages/core/src/integrations/LEARNINGS.md` | Added: Staged Items Pattern (yaml-only, action items not to memory, round-trip safety) |
| `packages/cli/src/commands/LEARNINGS.md` | Added: SIGINT listener bleed between tests — removeAllListeners in afterEach |
| `packages/runtime/skills/process-meetings/SKILL.md` | Updated: staged output mode default, --commit flag for backward compat, action item extraction |
| `.agents/sources/shared/cli-commands.md` | Added: `arete view [--port]` |
| `packages/cli/src/index.ts` | Added: `arete view` to help text |

---

## Recommendations

### Continue
1. Reviewer pre-work sanity check — ROI is consistently high; ~2 NEEDS REFINEMENT per 7 tasks prevented concrete bugs
2. Exact API surface reading before crafting dependent task prompts (read T2's exported functions before writing T3's prompt)
3. DI pattern for all CLI commands with external side effects
4. First-use LEARNINGS.md entries happening at task completion time (not deferred)
5. Documentation synthesis in Phase 3 (AGENTS.md, CLI help text) as a checklist item

### Stop
1. Vague "all write operations" in pre-mortem mitigations — enumerate specific endpoints/functions
2. Providing only "use THIS" examples without "NOT this" contrast for format specs (led to T4 test shape bug)

### Start
1. For tasks involving data shape transformations between layers: include a "shape contract" table (backend field → frontend field → transform function) in the prompt — prevents the 5-way mismatch discovered in T5
2. For tasks using new external SDKs: always include a "verify before coding" step with exact import paths to inspect — and test the key scenario with both the correct shape AND an incorrect shape to prevent "consistently wrong" test bugs
3. For SSE endpoints: always pre-specify the EventSource client pattern alongside the server SSE pattern — they're always implemented together

---

## Next Steps (Suggested)

1. Wire `arete view` into a real workspace and do an end-to-end smoke test
2. Build `packages/apps/backend/dist/` to enable production mode (`npm run build:apps`)
3. Address process-meetings skill note: Task 6 reviewer noted `--file` arg marked "required" in Arguments section is misleading for batch mode
4. Add `packages/apps/` to the catalog (new architectural layer)
