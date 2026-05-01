# Code Review: slack-digest-topic-wiki

**Date**: 2026-04-29
**Branch**: worktree-slack-digest-topic-wiki (13 commits, base = current main)
**Reviewer role**: Eng lead with expert profiles loaded
**Profiles loaded**: core, cli, backend
**LEARNINGS scanned**: `packages/core/src/services/LEARNINGS.md`, `packages/cli/src/commands/LEARNINGS.md`, `packages/runtime/skills/LEARNINGS.md`, `memory/entries/2026-04-23_topic-wiki-memory-learnings.md` (Phase A+B parent build)

## Verdict

**APPROVE_WITH_FIXES** — implementation is sound, the parent build's failure modes are demonstrably defended (drift test, dark-code audit, lock symmetry, body-only hash, --source scoping triple-tested). Profile-driven scan surfaces three small issues that didn't appear in per-task reviews. None are merge-blocking; all are <30 min to fix and could ship as a follow-up if the user prefers to merge now.

## Profile-driven findings

### Core profile

| Invariant / Pattern | Held? | Evidence |
|---|---|---|
| Services do NOT import `fs` directly — go through `StorageAdapter` | ✓ (mostly) | `topic-memory.ts` adds no `fs` imports; `discoverTopicSources` calls `storage.exists/list/read` exclusively. Lock acquisition (`acquireSeedLock`) in `seed-lock.ts` does use `node:fs/promises` directly — but it's an intentional advisory-lock primitive that pre-dates this branch. Untouched here. |
| Services are stateless | ✓ | `TopicMemoryService` has only `storage` + `searchProvider` fields, set at construction. New code adds no mutable state. |
| `AreteServices` from `createServices()` is fully constructed | ✓ | No new factory wiring; `topicMemory` already wired. New exports plug into existing service. |
| Models define all types — barrel-exported | ✓ | `SourceDiscoveryEntry`, `RefreshBatchOptions.sourcePath` defined in `topic-memory.ts` and re-exported via `services/index.ts` + `index.ts`. |
| Body-only hashing for source-file idempotency (LEARNINGS 2026-04-23) | ✓ | `hashMeetingSource` re-used (not re-implemented); `topic-memory-discovery.test.ts` adds a new regression test for slack-digest frontmatter-edit invariance. |
| Structured LLM output: enum keys + length caps + `---` injection guard (LEARNINGS 2026-04-23) | ✓ (unchanged) | `parseIntegrateResponse` reused; this branch did not weaken any of those guards. |
| Advisory lock at outer CLI boundary; service respects `skipLock` (LEARNINGS 2026-04-23) | ✓ | `refreshAllFromSources` honors `skipLock`; service acquires lock in non-skipLock path. CLI test at `topic-refresh-slack.test.ts` exercises the held-lock case. |
| **NEW finding**: Service emits `console.warn` directly (no logger DI) | ✗ partial | `topic-memory.ts:973` — the JSDoc acknowledges this ("discovery has no logger DI surface and adding one for this single warning is overkill"). Pragmatic, but this is a soft profile drift. The test does monkey-patch `console.warn` to capture (`topic-memory-discovery.test.ts:275-287`). Acceptable but worth flagging — if a second `console.*` shows up in a future PR, escalate to a logger param. |
| **NEW finding**: `SourceDiscoveryEntry.type` JSDoc claims downstream is non-branching | ✓ | Verified by grep across `packages/{core,cli,apps}/src` — zero hits for `entry.type ===`, `src.type ===`, or any branch on `SourceDiscoveryEntry.type`. The other `.type === 'meeting'` hits in the codebase (intelligence.ts:302, search.ts:596, etc.) are on unrelated `SearchResult.type` and `Entity.type`. JSDoc is honest. |

### CLI profile

| Invariant / Pattern | Held? | Evidence |
|---|---|---|
| Command skeleton: `createServices` → `findRoot` guard → service call → format output | ✓ | New `--slugs`/`--source`/`--skip-topics` flags slot into the existing `topic refresh` action; same skeleton. |
| `--json` output covers ALL exit paths (LEARNINGS) | ✓ | All five new exit paths in `topic refresh` (skip-topics short-circuit, ambiguity error, --source-not-found, --source-bad-shape, lock-held) emit JSON when `opts.json`. Verified by reading each error branch. |
| LLM-spending commands ship dry-run, --yes gate, $USD ceiling, ARETE_NO_LLM (LEARNINGS 2026-04-23) | ✓ | `topic refresh` has all four (`--dry-run`, `-y/--yes`, `--cost-threshold`, `ARETE_NO_LLM` env check). `--source` doesn't change this — it only narrows the work. |
| `SeedLockHeldError` is a friendly warning, not stack trace (LEARNINGS) | ✓ | `topic.ts:487-503` catches and emits parseable JSON; CLI test at `topic.test.ts:382-424` asserts no stack trace in stderr. |
| Output formatting via `formatters.ts` helpers (not raw `chalk`) | ✓ | New error/info paths use `error()`, `info()`, `warn()` helpers consistently. |
| Commands do NOT import service classes directly | ✓ | All access via `services.topicMemory.*` — the new `--source` plumbing is just a new option on an existing call. |
| **NEW finding**: `--slugs` flag conflicts on `topic list` vs `topic refresh` | ✓ disambiguated by command shape | `topic list --slugs` is a boolean (no value); `topic refresh --slugs <list>` takes a comma-separated value. Different subcommand, different shape — not a true conflict. Help text on each is clear. Worth knowing for grep auditors. |

### Backend profile

| Invariant / Pattern | Held? | Evidence |
|---|---|---|
| Routes are thin HTTP adapters; heavy logic lives in core | ✓ | The rename at `meetings.ts:244` is a pure method-name swap. No new logic. |
| Write operations use `withSlugLock(slug, fn)` to prevent races | ✓ (unchanged) | The approve route wraps the workspace-service call in `withSlugLock`; the topic-integration block at L230-257 is a non-fatal post-step outside the lock — same pattern as before this branch. |
| Hook 2 failure must NOT turn the approve into a 500 (Hook 2 is non-fatal) | ✓ | The block is wrapped in `try/catch` with a `console.warn` log (L254-257). Approve commit already succeeded; topic ingestion is best-effort. |
| **NEW finding**: Backend approve route's topic ingestion is NOT covered by integration tests | ✗ | `packages/apps/backend/test/routes/meetings.test.ts` builds a hand-rolled Hono app that mocks `workspaceService.approveMeeting` and never exercises the real `routes/meetings.ts` file. The rename `refreshAllFromMeetings → refreshAllFromSources` at L244 is **typecheck-only verified** in this branch. There is no behavioral regression risk (TypeScript would have failed to compile if the rename was wrong), but the call site at L244 is structurally dark — no end-to-end test would catch a runtime fail there. |

## LEARNINGS-driven findings

### Things the diff respects

- **"Services tested ≠ services wired"** (2026-04-23): Every new export has a named production caller. `discoverTopicSources` → `refreshAllFromSources` body. `SLACK_DIGEST_FILENAME_RE` → discovery loop. `TOPIC_BIAS_BLOCK_PROMPT` → meeting-extraction prompt + drift test (test-only is the legitimate use here). `--source` flag → SKILL.md Phase 5b. `arete topic list --active --slugs` → SKILL.md Phase 2a. The dark-code audit at `dev/work/plans/slack-digest-topic-wiki/dark-code-audit.md` enumerates each.

- **Body-only hash invariant for slack-digests** (R7): `topic-memory-discovery.test.ts:158-182` directly tests "frontmatter edit ≠ hash bust" against a slack-digest fixture, including the sibling-plan `dedup_processed_at` field. Test would have caught a regression.

- **Bias-block byte-equality drift test** (R1): `slack-digest-bias-block.test.ts` reads BOTH files, asserts byte-equality, and includes a sanity-mutation test to verify the assertion is load-bearing. This is the load-bearing piece for the dual-tier sprawl defense.

- **Lock symmetry across all refresh paths** (2026-04-23 asymmetric-lock learning): `refreshAllFromSources` acquires by default; `skipLock: true` is explicit at the `arete topic seed` outer-holder boundary. CLI `topic refresh` does NOT pass `skipLock`, so cron + interactive shell collisions fail-fast with `SeedLockHeldError`. Side-effect fix: `seed-lock.ts:37` now sets `this.name = 'SeedLockHeldError'`, which un-deads two previously dark `err.name === 'SeedLockHeldError'` catches in `meeting.ts:1485` and `intelligence.ts:520`. Net positive beyond this branch's scope.

### Things the diff does well

- **Pre-mortem R5 (rename count off)**: All 9 sites renamed; backend route at `meetings.ts:244` was the one v1 missed; this branch caught it. `rg -n 'refreshAllFromMeetings' packages/` returns 0 hits.

### Things to watch (LEARNINGS imply but diff doesn't address)

- **Per-thread bleed (R6 / R8)**: The plan accepts the trade-off of per-digest topic union, on the bet that `integrateSource`'s prompt directive "update only sections substantively changed" defends against unrelated thread content polluting topic narratives. The directive IS in the prompt at `topic-memory.ts:703`. **But the test does not exercise this defense**: the AI mock returns a hand-crafted `IntegrateOutput`; nothing verifies the LLM actually respects "only substantively changes" against a multi-thread digest. This is hope, not evidence. Plan is honest about it (Risks section explicitly names this as accepted unverified). If topic narratives sprawl in real use, the next iteration introduces per-thread source segments — but that's a separate plan.

## Adversarial findings

### Finding 1 (LOW — service-level footgun, not exploitable today): `--source` 3-way path matching is over-permissive

**File:line**: `packages/core/src/services/topic-memory.ts:1042-1050`

**What's wrong**: `refreshAllFromSources` accepts `sourcePath` and filters via three branches:
```
src.path === options.sourcePath
src.path.endsWith(options.sourcePath)
options.sourcePath.endsWith(src.path)
```
The CLI happy path calls `path.resolve(cwd, opts.source)` first (`topic.ts:336`) so both sides are absolute and the equality branch fires. **However** the service is exported and callable directly. A programmatic caller passing `sourcePath: 'slack-digest.md'` (no date prefix) would `endsWith`-match every slack-digest in the workspace — defeating the cost-correctness invariant the `--source` flag exists to enforce. Pre-mortem R4 reads as if the filter is exact-match-only; the code is fuzzier than the plan.

**Why this matters**: The invariant the test claims (`topic-memory.test.ts:614 "with --source: integrates ONLY the matching digest"`) holds only when callers pass a unique-suffix path. The CLI is the only caller today, so it's not exploitable. But:
1. The JSDoc at `topic-memory.ts:1037-1041` ("entries are unique paths, scoped flag passes one path at a time") asserts ambiguity is implausible — true only because the CLI gates inputs, not because the service rejects ambiguity.
2. A future programmatic caller (the planned background queue, Phase C item 2) would inherit this footgun.

**Suggested fix**: Either (a) make the service strict-equality only and push path normalization into the CLI (already there) — drop the two `endsWith` branches; OR (b) when multiple entries match, throw an explicit ambiguity error rather than over-integrating. Option (a) is the smaller change.

### Finding 2 (LOW — process / not code): Backend approve route's topic-ingest block is structurally dark

**File:line**: `packages/apps/backend/src/routes/meetings.ts:230-257`

**What's wrong**: The Hook 2 block in the approve route — including the renamed `refreshAllFromSources` call at L244 — is not exercised by any integration test. The existing `meetings.test.ts` builds a hand-rolled Hono app and mocks `approveMeeting`, sidestepping the real route file entirely. The dark-code audit (Task 7) notes the call site exists but doesn't flag the test gap.

The rename works because TypeScript fails to compile if the method name is wrong — typecheck protects against the rename specifically. But this is exactly the "tests pass ≠ code is reachable" failure mode the parent build's LEARNINGS warned against. If the route's logic regresses (e.g., the `parsed?.frontmatter.topics ?? []` check breaks, or `getOrCreateServices(workspaceRoot)` initialization changes), no test catches it.

**Why this matters**: Same class as the parent build's dark-code surprise. The `try/catch` swallowing failures means even runtime regressions stay silent.

**Suggested fix**: Out of scope for this branch — but the PR should explicitly call out this gap, and Phase C item 5's AI-mock harness should add a backend integration test for the approve→Hook 2 path. Alternatively, the existing `approval-integration.test.ts` could be extended to cover the topic-refresh side effect.

### Finding 3 (LOW — minor footgun, not blocking): `console.warn` in service is a profile drift

**File:line**: `packages/core/src/services/topic-memory.ts:969-975`

**What's wrong**: The service emits a `console.warn` directly. Core profile invariants don't ban `console`, but services should not have undocumented stdout/stderr side effects — they should bubble up via return values or take a logger via DI. The JSDoc acknowledges this and the test at `topic-memory-discovery.test.ts:275-287` works around it by patching `console.warn`. Functionally fine, but if a future PR adds a second `console.*` call here, the pattern hardens — that's the kind of drift profiles exist to prevent.

**Why this matters**: Soft warning. Pragmatic exception is documented. But the next time someone needs to log something from a service, they'll grep for `console.warn` here and copy the pattern instead of adding a logger DI surface. The "fix it later" comment becomes "fix it never."

**Suggested fix**: Out of scope for this branch. Note in PR description that this is a pragmatic exception; if this code grows to need a second log, escalate to a logger param.

### Finding 4 (INFO — slack-digest skill `$SLUGS` extraction is contract-by-prose): consistent with parent build, not net-new

**File:line**: `packages/runtime/skills/slack-digest/SKILL.md:556-571`

**What's wrong**: The bash block defines `SLUGS="<comma-separated topics from digest frontmatter>"` as a placeholder for the model executing the skill to fill in. There's no automated test that the model correctly extracts the YAML-list `topics: [a, b, c]` into a comma-separated shell variable. If the model emits whitespace-padded slugs, an empty list, or the YAML list verbatim with brackets, the CLI either rejects (clean error path, OK) or processes wrongly (silent — bad).

**Why this is acceptable**: Same risk profile as the parent build's meeting-approve flow, which is also markdown-driven. The CLI's `resolveTargetSlugs` rejects empty inputs cleanly. The lock-contention contract gives a recovery path. **Not net-new risk**, but worth naming in the PR description since the final-review explicitly flagged it as informational.

### Finding 5 (LOW — lock-collision test asserts service throws, but the test name says "no LLM calls"): assertion ordering issue

**File:line**: `packages/cli/test/commands/topic-refresh-slack.test.ts:127-147`

**What's wrong**: The test name is `lock-held: refresh throws SeedLockHeldError; no LLM calls`. The first assertion uses `assert.rejects` — fine. The second asserts `calls.length === 0`. But because lock acquisition happens BEFORE any LLM call (correct order), the LLM mock is never reached regardless of how the lock contention is handled. The assertion is correct but doesn't add diagnostic value beyond "the lock is the first gate." Not a defect; just noting that if the lock check were ever moved to AFTER LLM calls (a regression), this test wouldn't catch it any earlier than the throw assertion would.

**Why this matters**: Cosmetic. The CLI test at `topic.test.ts:382-424` complements this by asserting the JSON contract on stdout; together they're sufficient.

**Suggested fix**: None required. If the test were extended to assert "calls.length === 0" by exercising a happy path first then locking on retry, it would gain diagnostic power. Out of scope.

### Finding 6 (INFO — verified, not a defect): Pre-mortem R6 mitigation is unverified hope

The pre-mortem (R6, R8) accepts that per-digest union → topic-page integration may bleed unrelated thread content. The mitigation cited is the LLM prompt's "update only sections substantively changes" directive at `topic-memory.ts:703`. The test mock doesn't exercise this — it returns canned JSON. The plan is honest about this being unverified. Not a code defect; the mitigation is in the prompt where the plan said it would be. If real-world topic narratives drift, the next iteration is a per-thread source-segment plan (out of scope).

## Strengths

1. **Side-effect fix in `seed-lock.ts:37` is a net positive beyond this branch's scope.** Setting `this.name = 'SeedLockHeldError'` un-deads `err.name === 'SeedLockHeldError'` catch sites in `meeting.ts:1485` and `intelligence.ts:520` that were previously dark (instances kept `name = 'Error'`). This is the kind of incidental improvement the parent build's dark-code learning was meant to surface.
2. **Triple-layer test coverage for `--source` scoping**: service-level (`topic-memory.test.ts:614`), CLI-bin level (`topic.test.ts:344`), and AI-mock end-to-end (`topic-refresh-slack.test.ts:110`). This is exactly the test structure the parent build's "services tested ≠ services wired" learning recommends.
3. **Bias-block drift test is robust**: byte-equality + sentinel-mutation sanity-check + duplicate-marker-count check. Three assertions covering three failure modes (drift, mutation slipping past, marker corruption). The dual-tier sprawl defense actually has both tiers tested now — single-tier in the parent build was the gap.

## Devil's advocate

**If this fails in production, it will be because...** the slack-digest skill's prose-contract `$SLUGS` extraction emits something the CLI's `resolveTargetSlugs` rejects (empty, malformed, or YAML-list-with-brackets), and the user sees `Specify a topic slug, --slugs <list>, or --all` instead of a topic refresh. The digest is committed but `topics:` go un-integrated. Recovery: re-run `arete topic refresh --slugs ... --source ...` manually. Not catastrophic, but invisible until the user notices their topic pages aren't updating from Slack.

**The worst outcome would be...** a programmatic caller (the planned background queue) passes a non-CLI-validated `sourcePath` to `refreshAllFromSources` — e.g., a relative path or a bare filename — and the `endsWith` branches at `topic-memory.ts:1046-1047` over-match, integrating every prior digest tagged with the same slug. The user gets billed for N digests instead of 1 on a "nightly background ingest" cron. Cost-correctness invariant violated. Not exploitable today (no such caller exists), but the footgun is real and the plan's pre-mortem R4 reads as if exact-match-only.

## Recommendation

**APPROVE_WITH_FIXES**. The branch is mergeable as-is — no findings are merge-blockers. The Phase 4.2 holistic review's three fixes (rebase + 3 doc nits) are already applied. The findings here are profile-driven and didn't surface in per-task reviews because none of them violate any per-task AC.

**Optional fixes before merge** (each is <30 min):

1. (Finding 1) Tighten `--source` filter at `topic-memory.ts:1042-1050` to strict equality; document that path normalization is the CLI's responsibility. Drop the two `endsWith` branches OR throw on multi-match. Prevents a footgun for the future background queue.
2. (Finding 2) Add a one-line note to the PR description that the backend approve route's topic-ingest block is not covered by integration tests; flag for Phase C item 5 (AI-mock harness).

**Defer to follow-up**:

3. (Finding 3) Logger DI for the `console.warn` in `discoverTopicSources` — only worth doing if a second log shows up here. Today it's a single, well-documented exception.
4. Backfill an end-to-end skill→CLI→core test once Phase C item 5's AI-mock harness lands. Closes Finding 4's contract-by-prose gap.

The build is **ready for the merge gate**. The expert profiles surfaced one real footgun (Finding 1) and two structural test gaps (Findings 2, 4) that weren't called out by per-task reviews — none load-bearing, but worth noting in the PR record so the next reviewer / future maintainer has them.
