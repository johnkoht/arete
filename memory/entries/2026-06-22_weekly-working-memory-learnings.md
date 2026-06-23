# Weekly Working Memory — correction-captured interpretive overrides

Date: 2026-06-22
Plan: `dev/work/plans/weekly-working-memory/` (plan + review + pre-mortem)
Shipped: `arete week-memory` CLI + `plan-context.weekMemory` field + 4 skill wire-ins.

## Metrics

- 4 build tasks (A: core store, B: CLI, C: plan-context field, D: 4 skill edits) + docs/wrap, executed sequentially-then-parallel (A → B → C‖D) via subagents in a worktree.
- Tests added: core `week-memory.test.ts` (10), CLI `week-memory.test.ts` (11), plan-context core +1 case / CLI integration +1 contract assertion. Full suite green except the one pre-existing `area-memory.test.ts` date flake (confirmed identical on clean baseline).
- End-to-end CLI smoke (install → add → plan-context → resolve → exclude) passed on the real path.

## Pre-mortem effectiveness

| Risk | Materialized? | Effective? | Notes |
|------|---------------|-----------|-------|
| R1 `suppresses` keyed on prose → silent re-flag | Designed-out | Yes | Stored commitment-id-first; daily-plan emits an observable note on apply AND unmatched (no silent miss). |
| R2 archive wipes active entries mid-week | Caught a real bug | Yes | Built week-stamped/idempotent; ALSO found a seeded `week: ""` store would archive empty to a malformed `week-memory-.md` — fixed to skip on zero entries. |
| R3 frozen plan-context contract break | No | Yes | Additive `weekMemory: []`; extended (not replaced) the snapshot + CLI contract test. Read via existing `deps.storage`, no new service/factory wiring. |
| R4 CLI reimplements store | No | Yes | Store logic lives once in core `week-memory.ts`; CLI + plan-context both consume it. |
| R6 runtime/skills propagation | No | Yes | `packages/runtime/skills/` confirmed canonical source; installed workspaces copy at `arete install/update`; `.agents/skills/` is a gitignored local-dev rsync mirror. |
| R7 skill layer untestable | Open (by design) | Partial | Plumbing verified (unit + e2e smoke); skill BEHAVIOR (capture/suppress correctness) is soak-pending on John's live workspace — disclosed, not claimed proven. |

## What worked / what didn't

- (+) Store-as-core-free-functions (like `tools.ts` / `patterns.ts`), read via passed `StorageAdapter`, NOT a factory-wired service class — kept the plan-context change additive and avoided `createServices` churn for a leaf store.
- (+) Cross-model plan review caught the central overclaim ("all three skills consume plan-context" — only daily-plan does); the fix (one bundle field + two explicit `week-memory list` gather calls) is the honest enforcement model.
- (+) Capture-on-correction (not on importance) is the design key: corrections are self-selecting, so capture is selective by construction with zero approval treadmill.
- (−) `@arete/core` in the worktree resolved to MAIN's stale `dist` (symlinked node_modules) — Task B had to rebuild worktree-local node_modules pointing `@arete/core` at the worktree's own package. RECURRING gotcha (see prior entries). Set this up at worktree creation next time.
- (−) zsh does not word-split unquoted `$VAR` holding `node /path` — the first CLI smoke silently no-op'd. Use a shell function for the bin.

## Recommendations

- Continue: design-before-code on the highest-stakes pre-mortem risks (R1/R2 were prevented, not just verified).
- Start: when creating a worktree for a monorepo whose packages reference each other via `@scope/*`, immediately repoint the changed package's node_modules entry to the worktree (don't symlink the whole tree to main).
- Stop: trusting an end-to-end smoke run through an unquoted `$ARETE` var under zsh.

## Follow-ups

- **Soak gate (REQUIRED before trusting the skill layer):** run a real week-plan on John's workspace, confirm it captures exactly the qualifying corrections (and zero vocabulary edits); next day confirm daily-plan suppresses the overridden item AND prints the observable note.
- `area-memory.test.ts` date-sensitive flake — inject a clock into `AreaMemoryService`'s recency window (separate hotfix; predates this branch).
- `--day` returns ALL active entries (no area filter) — entries have no area field and the set is tiny; revisit only if the store grows.
- `readWeekMemory` is exported but has no external caller (symmetric primitive to `listWeekMemory`); kept as intentional public API.
