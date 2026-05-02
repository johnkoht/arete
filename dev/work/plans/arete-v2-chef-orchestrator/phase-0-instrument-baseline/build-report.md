---
title: "Phase 0 — Instrument + baseline — build report"
slug: arete-v2-phase-0-build-report
parent: arete-v2-phase-0-instrument-baseline
status: complete
created: "2026-05-01"
updated: "2026-05-01"
sub_orchestrator: agent-aa686a8109331e31b
worktree: .claude/worktrees/agent-aa686a8109331e31b
branch: worktree-agent-aa686a8109331e31b
---

# Phase 0 build report

All four deliverables (D1–D4) shipped. AC0.1, AC0.3, AC0.4, AC0.5 verified by tests; AC0.2 verified by smoke-readable skill prose. AC0.6/AC0.7/AC0.8 are user/soak-time checks; AC0.8 ledger filled in below. Pre-existing flaky tests in `packages/cli/test/commands/view.test.ts` (process-spawn SIGINT) reproduce on `main` and are unrelated.

## Files touched (per deliverable)

### D2 — Item-fate event log

- `packages/core/src/services/memory-log.ts` — extended `MemoryLogService` with `appendItemFate(workspacePaths, event)` writing JSONL to `.arete/memory/item-fates.jsonl`. Same `storage.append` (POSIX O_APPEND) pattern as the existing `append()` for `log.md`, with read-modify-write fallback.
- `packages/core/src/index.ts` — re-exports new `ItemFate` / `ItemFateEvent` / `ItemFateKind` / `ItemFateImportance` / `AppendItemFateOptions` types.
- `packages/core/src/services/meeting-processing.ts` — added two pure builders: `buildSkippedItemFateEvents(processed, sourcePath, importance)` and `buildDismissedItemFateEvents(dismissed, sourcePath, importance)` plus `MeetingItemFateInput` type. Storage-free; callers do the I/O.
- `packages/core/src/services/index.ts` — re-exports the new builders.
- `packages/cli/src/commands/meeting.ts` (extract --stage path) — snapshots silently-merged decisions/learnings before `applyReconciliationDecision` drops them, then walks the final processed state and emits one fate per skipped/dismissed item via `services.memoryLog.appendItemFate`. Best-effort.
- `packages/core/src/integrations/staged-items.ts` — `commitApprovedItems` now accepts an optional `onApproved: ApprovedItemObserver` callback and fires it once per committed item (action item / decision / learning) AFTER the meeting file is written. New types: `ApprovedItemObserver`, `ApprovedItemRecord`, `CommitApprovedItemsOptions`.
- `packages/cli/src/commands/meeting.ts` (approve path) — registers an `onApproved` observer that writes `fate=approved` events to `item-fates.jsonl` with confidence + importance threaded through.

### D3 — Cost telemetry aggregator

- `packages/cli/src/commands/cost.ts` (NEW) — `arete cost report` command. Pure `aggregateCostReport(events, windowDays, grouping, now)` exported for unit testing; `parseSince` exposed for parser tests; CLI runner uses DI for clock + log reader.
- `packages/cli/src/index.ts` — registers `cost` + `events` command groups; help text updated under a new `Telemetry` block.

### D4 — `arete events log` CLI helper

- `packages/cli/src/commands/events.ts` (NEW) — `arete events log winddown --event start|end` thin wrapper over `MemoryLogService.append`. Validates event-name input; honors `--json` for skill-script callers.

### D1 — Daily-winddown skill stanza

- `packages/runtime/skills/daily-winddown/SKILL.md` — top-of-file Phase 0 instrumentation note; new step 1.0 (`--event start`) at the very start of Phase 1; new step 4d (`--event end`) at the end of Phase 4. All three writes are documented as best-effort.

### Tests

- `packages/core/test/services/memory-log.test.ts` — appendItemFate tests including the AC0.5 stress test (10 parallel writers × 100 events = 1000 events, no torn lines).
- `packages/core/test/services/meeting-processing.test.ts` — unit tests for `buildSkippedItemFateEvents` (reason mapping per source) and `buildDismissedItemFateEvents`.
- `packages/cli/test/commands/cost.test.ts` — `parseSince`, `aggregateCostReport` pure tests, plus CLI smoke against an installed workspace + log.md fixture (AC0.4).
- `packages/cli/test/commands/events.test.ts` — `arete events log winddown` start + end + rejects-invalid-event-name (AC0.1).
- `packages/cli/test/commands/item-fate-instrumentation.test.ts` — end-to-end approve cycle producing fate=approved events (AC0.3 approved path).

### Build artifacts (per `feedback_commit_dist.md`)

- `packages/cli/dist/**` and `packages/core/dist/**` rebuilt and committed.
- `dist/AGENTS.md` regenerated via `build-agents.ts` and committed.
- `package-lock.json` version-bumped (carried over from hygiene-pass-1 merge).

## Tests added

| Test file | Suite | Count |
|---|---|---|
| `packages/core/test/services/memory-log.test.ts` | `MemoryLogService.appendItemFate` | 5 |
| `packages/core/test/services/meeting-processing.test.ts` | `buildSkippedItemFateEvents` | 4 |
| `packages/core/test/services/meeting-processing.test.ts` | `buildDismissedItemFateEvents` | 2 |
| `packages/cli/test/commands/cost.test.ts` | `parseSince` | 4 |
| `packages/cli/test/commands/cost.test.ts` | `aggregateCostReport` | 6 |
| `packages/cli/test/commands/cost.test.ts` | `arete cost report CLI` | 2 |
| `packages/cli/test/commands/events.test.ts` | `arete events log winddown` | 3 |
| `packages/cli/test/commands/item-fate-instrumentation.test.ts` | approve fate writer | 2 |
| **Total new tests** | | **28** |

`npm run typecheck` clean. `npm test` final run: 3,392 pass / 2 pre-existing flakes / 2 skipped (the two `view.test.ts` failures around process-spawn SIGINT timing reproduce on `main` at `9d26005c`).

## Acceptance criteria verification

| AC | Status | How verified |
|---|---|---|
| **AC0.1** — `arete events log winddown --event start|end` produces well-formed log.md entries | PASS | `events.test.ts` "writes a winddown start event in well-formed grammar" asserts the regex `^## \[ISO_TS\] winddown \| event=start$`. Two-event ordered run also asserted. |
| **AC0.2** — daily-winddown SKILL.md includes the Phase 0 stanza and uses the CLI helper, not manual file writes | PASS (smoke-readable) | SKILL.md edited at top + Phase 1.0 (start) + Phase 4d (end). All three reference `arete events log winddown --event …`; no raw `.arete/memory/log.md` writes added to skill prose. End-to-end agent run is a soak-time check (AC0.6). |
| **AC0.3** — every approved staged item produces a matching fate=approved event; skipped/dismissed analogously | PASS | `item-fate-instrumentation.test.ts` exercises the full approve path against a fixture meeting (2 actions + 1 decision + 1 learning) and asserts 4 fate=approved JSONL events with correct kind/confidence/source. Skipped + dismissed paths verified at the unit-helper level (`buildSkippedItemFateEvents` reason-mapping + `buildDismissedItemFateEvents` shape) and at the call-site (CLI extract --stage walks final processed state and dismissedSnapshots). End-to-end exercise of skipped/dismissed requires a live LLM extract; deferred to manual smoke during the 14-day soak. |
| **AC0.4** — `arete cost report --since 7d` returns a parseable summary matching log.md sums | PASS | `cost.test.ts` "aggregates llm_cost_usd from a real log.md fixture" runs `arete cost report --json --by skill` against an installed workspace and asserts totalCostUsd matches the fixture's sum (1.5 + 0.25 = 1.75 USD). Pure aggregator tests cover day-grouping, skill-grouping, window cutoff, non-numeric handling, empty cases. |
| **AC0.5** — appendItemFate is append-only and atomic; concurrent writes never produce a malformed line | PASS | `memory-log.test.ts` "survives 10 parallel writers × 100 events without malformed lines (AC0.5)" fires 1,000 concurrent appends, asserts every line parses as JSON, every (writer, event) pair appears exactly once. Backed by POSIX O_APPEND in `FileStorageAdapter.append`. |
| **AC0.6** — 14-day soak: every winddown invocation has matching start + end events | DEFERRED | Soak-time check; not gateable in build report. Phase 0 ships the instrumentation; baseline measurement runs over the next 14 days. |
| **AC0.7** — Phase 0 baseline (median + p90 winddown duration; daily/weekly cost; fate distribution) recorded in wrap-report.md | DEFERRED | Soak-time output. Wrap report will land at end of 14-day soak. |
| **AC0.8** — adds-vs-removes ledger | PASS (see ledger below) | Counted manually against post-hygiene-pass-1 `main`. |

## AC0.8 ledger (parent AC8 instance)

Counts taken against `9d26005c` (post-hygiene-pass-1 main). "After Phase 0" reflects the state at this commit.

| Proxy | Before Phase 0 | After Phase 0 | Δ |
|---|---|---|---|
| CLI verbs (top-level commands registered in `cli/src/index.ts`) | 31 | 33 | **+2** (`cost`, `events`) |
| Runtime skills (directories under `packages/runtime/skills/`) | 38 | 38 | 0 (daily-winddown got a stanza; no new skill) |
| Frontmatter fields across canonical file shapes | (no new shapes) | (no new shapes) | 0 |
| Memory file types in `.arete/memory/` | 5 (`log.md`, `index.md`, `items/`, `areas/`, `topics/`, etc.) | 6 | **+1** (`item-fates.jsonl`) |
| Services in `packages/core/src/services/` | 19 | 19 | 0 (extends `memory-log.ts`; no new file) |
| **Net combined** | | | **+3** |

Matches the plan's prediction (Phase 0 nets +3; subsequent phases must net ≤0 *not including Phase 0*).

CLI verb count: I count `installCommand`, `onboardCommand`, `updateCommand`, `indexSearchCommand`, `statusCommand`, `routeCommand`, `contextCommand`, `memoryCommand`, `resolveCommand`, `briefCommand`, `peopleCommands`, `topicCommands`, `skillCommands`, `toolCommands`, `integrationCommands`, `pullCommand`, `meetingCommands`, `templateCommands`, `seedCommand`, `availabilityCommands`, `calendarCommands`, `commitmentsCommand`, `viewCommand`, `dailyCommand`, `momentumCommand`, `credentialsCommand`, `configCommand`, `searchCommand`, `createCommands`, `inboxCommand`, `hygieneCommand` = 31 register-calls before Phase 0; some register-calls add multiple verbs. Counting top-level user-facing verbs (e.g., `arete cost`, `arete events` are two new verbs) the delta is +2.

## Known issues / deferred items

1. **Naming drift between the phase plan's "Critical files" table and where the writers actually live.** The plan listed `meeting-apply.ts` for the skip path and `meeting-reconciliation.ts` for the dedup path; both were inaccurate against the post-hygiene code structure. The actual `staged_item_status === 'skipped'` decisions are made in `meeting-processing.ts` (the pure post-extraction processor) and the I/O happens at the CLI extract --stage call site. Documented in commit 8a7f6b97. Pure helpers in `meeting-processing.ts` keep the data shaping testable; storage-using calls live in CLI. Backend (`packages/apps/backend/src/services/agent.ts`) also calls `processMeetingExtraction` and `commitApprovedItems` — backend-side fate emission was deliberately left out of Phase 0 scope to avoid drifting beyond the phase boundary. Backend approve calls `commitApprovedItems` without the `onApproved` observer (option is optional, so no breakage); if backend approve traffic is non-trivial, Phase 0+1 wrap-up should add the same observer wire there. Open question for meta.

2. **Pre-existing view.test.ts flakes** (process-spawn / SIGINT timing): `spawns server, polls health, opens browser, and prints ready message` and `kills child process on SIGINT`. Both reproduce on `main` (`9d26005c`) with the same failure modes. Unrelated to Phase 0; flagging here so the pattern doesn't get attributed to this phase at /review.

3. **AC0.3 end-to-end skipped/dismissed verification** requires a live LLM extract. The integration test exercises the approved path end-to-end; skipped/dismissed paths are covered at the unit-helper level (reason mapping per source, snapshot semantics). Manual smoke during the 14-day soak will close this gap.

4. **D1 stanza lives only in the runtime skill prose**, not in `dist/AGENTS.md` (which carries a compact index of skill triggers, not full prose). The skill prose is what agents actually load when they run daily-winddown. AGENTS.md regen captured the timestamp delta only.

5. **`commitApprovedItems` signature change** is backwards-compatible (new options arg defaults to `{}`) but does change the function signature shape in TypeScript types. Backend caller passes 3 args today; that still typechecks. If a future release tightens linting around exhaustive options, audit pre-existing call sites.

## Hygiene reconciliation

Phase 0 added new files (`cost.ts`, `events.ts`, `item-fates.jsonl` runtime artifact, the test files) and extended existing modules (`memory-log.ts`, `meeting-processing.ts`, `staged-items.ts`, `daily-winddown/SKILL.md`). Did NOT touch any code that hygiene-pass-1 deleted (verified: no edits to `compat/`, removed `src/`, removed test files, etc.). Confirmed via `git log f774aa65..HEAD --name-only | grep -v dist`.

## Skeptical-view re-read

The phase plan's skeptical view: "skip the baseline; ship Phase 1+2; if it feels better, declare success." Build experience didn't invalidate that argument — it's still a coherent shortcut path the user might want to take. The counter-argument (AC10 unfalsifiable without a measured baseline) holds; nothing learned during build weakens it. No escalation to meta needed on this front.

## Review fixes applied

After eng-lead review (`review.md`, verdict APPROVE WITH MINOR CONCERNS),
three follow-on fixes landed on this branch:

1. **`1c9ed2fa` — phase-0(backend): wire item_fate onApproved observer at workspace approve.** Backend `approveMeeting` (`packages/apps/backend/src/services/workspace.ts`) now passes an `onApproved` observer to `commitApprovedItems` mirroring the CLI side. Item-fate events now fire for web-approve traffic, closing the AC0.6 baseline gap (web-approve was silently missing). Integration test added in `workspace.test.ts`.
2. **`de2be846` — phase-0(core): internalize observer error trapping in commitApprovedItems.** The per-item `onApproved` invocation is now wrapped in try/catch inside `commitApprovedItems` itself; observer errors are logged to stderr and never abort the commit. Caller-side try/catches retained as defense in depth. Two unit tests added.
3. **`<this commit>` — phase-0(docs): apply review fixes to build-report.md.** Corrected the AC0.8 ledger CLI verb count (31 → 33; delta unchanged at +2) and added this section.

After these fixes:
- `npm run typecheck` clean.
- `staged-items.test.ts`: 48/48 pass (incl. 2 new observer-error tests).
- `workspace.test.ts` (backend): 10/10 pass (incl. 2 new fate-emission tests).
- `memory-log.test.ts`: 13/13 pass (regression-clean).

The dist artifacts for `packages/core` and `packages/apps/backend` were
rebuilt and committed in a follow-up commit (see git log).

## Ready for /review

Ready for /review v2 (post-fix-ups).
