## Review: Web commitment resolve → parity with CLI resolve

**Type**: Plan
**Audience**: User (end-user functionality — web UI resolve path; code lands in `packages/apps/backend` + exercises `packages/core`). Audience is clear.
**Review Path**: Full
**Complexity**: Medium (3 steps, but touches `backend` + `core` and makes two architectural decisions — long-lived memoized service in a route closure, debounced cross-burst reindex). Treated as Full per the skill's "architectural decisions → Full" rule.
**Recommended Track**: standard

> This review pressure-tests a plan that already incorporated a prior eng-lead review (ship-with-changes, 4 should-fixes). I independently verified every load-bearing claim against the real code. Most check out. Two do not, and one is a genuine correctness blocker the prior review missed.

---

### Concerns

1. **[blocker] Concurrency — a single shared `CommitmentsService` instance is NOT safe under concurrent PATCHes; the `holdsLock` re-entrancy flag opens a lost-write window.** This is the exact failure mode the change exists to *prevent*, and it's introduced by the memoization decision (Step 1).
   - Evidence: `runUnderLock` (`packages/core/src/services/commitments.ts:690-735`) gates lock acquisition on an **instance-local boolean** `holdsLock` (`:682`). The re-entrancy contract is documented for *one call stack* wrapping its own inner `save()` (`:678-695`). But a memoized instance shared across requests breaks that assumption:
     - PATCH A enters `runUnderLock`, `holdsLock` is false, acquires the lockfile, sets `holdsLock = true` (`:721-722`), then `fn` runs and hits an `await` (e.g. `storage.write`, `:641`).
     - During that await, PATCH B enters `runUnderLock`, observes `holdsLock === true` (set by A), and takes the re-entrant branch `return fn()` **without acquiring any lock** (`:691-695`).
     - A's `finally` sets `holdsLock = false` (`:726`) while B may still be mid-write. Two writers now race the same `commitments.json` in-process, defeating the cross-process lock entirely.
   - Why the prior review missed it: it reasoned about `proper-lockfile` keying on the file path (correct for *cross-process* / cross-instance safety) but did not consider that memoizing collapses N requests onto **one instance**, activating the in-instance re-entrancy shortcut for genuinely-concurrent (not nested) calls.
   - Note this is *latent today* because the current raw read-modify-write doesn't touch the service at all, and the CLI only ever has one in-flight `resolve()` per process. Memoizing + a no-batch UI firing 50 concurrent PATCHes is the first time one instance sees concurrent `resolve()` calls.
   - Suggestion (pick one, smallest first):
     - **(a)** Serialize PATCHes at the router with an in-closure async mutex / promise-chain so only one `resolve()` runs at a time on the shared instance (cheap, ~10 lines, makes the O(N²) serialization explicit and in-process rather than relying on the file lock). This also makes the "concurrent no-lost-writes" AC trivially true and fast.
     - **(b)** Construct a fresh `CommitmentsService` (NOT full `createServices()`) per PATCH but reuse the memoized `tasks`/back-prop wiring — sidesteps the shared `holdsLock`. More wiring.
     - **(c)** Verify in core whether `holdsLock` should be call-scoped (e.g. AsyncLocalStorage) rather than instance-scoped before relying on a shared instance — but that's a core change, out of this plan's stated scope.
     - Whatever the choice, the Step-3 concurrent test MUST actually exercise a shared memoized instance (see Concern 5), or it will pass against per-request instances and give false confidence.

2. **[should-fix] The "gws subprocess storm" — the stated magnitude is not supported by the code; the load-bearing justification for memoization is overstated.** The plan (Context, `:33`) and Step 1 AC assert per-PATCH `createServices()` "shells the `gws` binary twice per call with 10s timeouts … ~100 subprocesses for a 50-click burst." I traced this:
   - `createServices()` (`factory.ts:97-101`) calls `getEmailProvider`/`getDriveProvider`/`getDocsProvider`/`getSheetsProvider`/`getDirectoryProvider`. Each of those (`integrations/gws/index.ts:58-121`) returns `null` immediately unless `config.integrations['google-workspace'].status === 'active'`; when active it only does a dynamic `import()` + constructs the provider. **None of them calls `detectGws` at construction.**
   - `detectGws` (the 10s × 2 subprocess pair, `detection.ts:24-51`, timeout `:15`) runs **lazily inside provider methods** (`drive.ts:66` inside `isAvailable()`, etc.), which `createServices()` never invokes.
   - So per-PATCH `createServices()` actually costs: one `loadConfig` disk read, plus (only if GWS active) 5 dynamic imports + cheap constructions. Real, worth avoiding under a burst — but it is **not** a 100-subprocess storm. The decision to memoize is still defensible (avoids repeated config reads + service-graph construction + the in-instance write contention), but the plan's headline rationale is wrong and would mislead anyone reasoning about the tradeoff later.
   - Suggestion: Correct the Context/Step-1 wording to the real cost ("per-PATCH config load + service-graph construction; under a 50-click burst that's wasteful and, more importantly, gives each request its own lock instance which we'd rather avoid"). If the subprocess claim ever WAS true, cite the exact call path; I couldn't find one.

3. **[should-fix] Error-mapping for `resolve()`/`save()` throw paths is incomplete.** Step 1 maps "No commitment found" → 404, "Ambiguous prefix" → 409, `LockBootstrapError` → 500. Verified the throw sites: `resolve()` throws the two `Error(...)` messages at `commitments.ts:795` and `:799-801` (string-matched, not typed — brittle but the plan accepts it). However:
   - The plan maps by **error message substring** but doesn't say so explicitly, and the messages (`No commitment found matching id prefix "..."`, `Ambiguous prefix "..."`) are free-form strings with no error class. A future copy-edit to those strings silently reverts the mapping to 500. Suggestion: match on a stable prefix and add a comment pinning the mapping to `commitments.ts:795/:799`, or (better) gate the 404 on a pre-check `findIndex` like today's handler already does (`intelligence.ts:477`) and only call `resolve()` once existence is confirmed — that removes the string-match fragility for the common case.
   - `save()` can throw beyond `LockBootstrapError`: `lockfileLock` itself can reject (lock contention exhaustion / EEXIST after retries), and `storage.write` can throw (ENOSPC, EACCES). These currently fall to the outer `catch` → 500 (`intelligence.ts:499-502`), which is acceptable — but the plan should state "all other throws → 500 via existing catch" so it's a conscious decision, not a gap.

4. **[should-fix] Debounce correctness under overlapping bursts + shutdown is hand-waved on one edge.** The re-arming `setTimeout` + `.unref()` (Step 2) is correct for coalescing. Two gaps:
   - **Resolve-then-immediate-search race**: the AC says "resolved items stop surfacing in search," but the debounce intentionally delays reindex ~5s after the *last* resolve. A user who resolves one item and immediately searches will still see it for ~5s. That's probably fine, but the AC as written ("resolved items stop surfacing in search") is not true at the moment of resolve — it's true ~5s after the burst settles. Tighten the AC to reflect the debounce window (see AC table).
   - **Error inside the fired callback**: `refreshQmdIndex` never throws (verified — `qmd-setup.ts:233-239` returns `{ warning }`, the only `catch` is internal), so logging via `QmdRefreshResult.warning`/`embedWarning` (`:230-231`, `:236`) is the right call and the plan nails this. But the debounce callback runs detached on the timer — if anything *around* the call throws (e.g. reading cached `config.qmd_collection`), there's no handler and it's an unhandledRejection. Keep the belt-and-suspenders `.catch()` the plan mentions, and wrap the whole callback body.

5. **[should-fix] The concurrent-no-lost-writes test, as specified, won't catch Concern 1.** Step 3 says "fire ~10 in parallel, assert all 10 land resolved." The existing test harness (`intelligence.test.ts:665-690`) constructs `createCommitmentsRouter(tmpDir)` **fresh per `it`**. If the new test does the same and fires 10 PATCHes at 10 distinct ids through one router, it WILL exercise the shared memoized instance — good — but only if the memoization is actually in place and the test reuses one `router` const across all 10 `app.request` calls. The plan must state this explicitly, because the obvious way to write it (a router per request, or distinct ids that never contend) passes vacuously. Also: with 10 distinct ids each PATCH targets a different commitment, so even a buggy shared-instance write could "land all 10" by luck of interleaving — the test needs enough iterations / a tight loop to reliably surface the `holdsLock` window, or (better) target the same file with interleaved writes and assert no entry reverts to `open`. Suggestion: add a stress variant (50–100 parallel PATCHes, assert final file has exactly 0 `open` among the targeted ids and no lost `resolvedAt`), and assert it against ONE shared router instance.

6. **[nit] Config-staleness risk is correctly identified but the mitigation ("note in PR") is weak for a long-lived process.** `factory.ts:90` loads config once; memoizing means an `arete.yaml` edit needs a backend restart. The plan accepts this (Risks `:49`). Fine for `qmd_collection`, but if a user *activates* google-workspace mid-session, the memoized service won't pick it up — and the resolve path doesn't need GWS, so impact is nil here. Acceptable; just confirm no resolve-path behavior depends on config that changes at runtime. No action required beyond the PR note.

7. **[nit] Existing handler reuses `c` as both Hono context and `.findIndex` callback param** (`intelligence.ts:477` `findIndex((c) => c.id === id)` shadows the route's `c`). The plan replaces this block wholesale, so it's moot — but whoever writes the replacement should not reintroduce the shadow.

---

### AC Validation Issues

| Task | AC | Issue | Suggested Fix |
|------|-----|-------|---------------|
| 1 | "the write is lock-protected" | Not independently verifiable as written, and (per Concern 1) **false under concurrency with a shared instance**. "Lock-protected" is unobservable from the HTTP surface. | "A resolve PATCH acquires the commitments.json proper-lockfile before writing (assert via the concurrent test: N parallel PATCHes to distinct ids all persist `status: resolved` with no entry left `open`)." |
| 1 | "the service is constructed at most once per workspace (no `gws` subprocess storm under a burst)" | Two concerns combined (single concern rule); and the "subprocess storm" half is unverified (Concern 2). | Split: (a) "Across 50 sequential PATCHes, the router's service factory runs exactly once (assert via a spy/counter on the construction path)." Drop the subprocess claim or replace with the real cost. |
| 1 | "flips the linked `@from(commitment:<prefix>)` task in `week.md` to `[x]`; `dropped` does not" | Good — specific, testable, single concern each. Verified back-prop fires only for `resolved` (`commitments.ts:823`) and the live 2026-06-10 regression guard (`:818-822`). No change. | — |
| 2 | "Resolving 50 items quickly triggers exactly one `qmd update` ~5s after the last resolve" | "quickly" is loosely bounded; otherwise testable via spy. | "When ≥2 resolves arrive within the 5s debounce window, the debounce callback fires exactly once, ≥5s after the final resolve (assert via spied callback, not real `refreshQmdIndex` — `ARETE_SEARCH_FALLBACK=1` skips the real path)." |
| 2 | "resolved items stop surfacing in search" | Not true at resolve time — only after the debounce fires + reindex completes (Concern 4). Also depends on QMD being installed (skipped under fallback/CI). | "After the debounce reindex fires (≥5s post-burst) with QMD available, a search for a resolved item no longer returns it." Mark as manual/integration-only since CI runs `ARETE_SEARCH_FALLBACK=1`. |
| 3 | "All tests pass incl. the concurrent-no-lost-writes case" | Test as specified may pass vacuously (Concern 5). | Require: shared router instance + ≥50 parallel PATCHes + assert no targeted id remains `open` and every `resolvedAt` is set. |
| 3 | "`dist/` rebuilt and committed" | Fine (matches project convention per user memory). | — |

---

### Test Coverage Gaps

- **Step 1 has no test asserting single-construction.** The "constructed at most once" AC needs a counter/spy on the factory; none is specified. Add one.
- **No test for the `holdsLock` concurrency window specifically.** The generic "10 distinct ids land resolved" does not reliably reproduce the interleaving in Concern 1. Add a high-contention variant (same-file, many parallel, assert no reverts).
- **Error-mapping tests missing.** Step 3 covers 404 + dropped + concurrent + debounce, but not the 409 ambiguous-prefix path (plan calls it unreachable, but if it's mapped it should have a unit test feeding a 2-char prefix that matches 2 ids — cheap, and proves the mapping) and not the "resolve throws non-mapped error → 500" path.
- **No regression test that back-prop does NOT fire for `dropped`** is explicitly listed as the highest-value guard in the plan body (`:818-822`) — good, Step 3 includes it. Confirmed present in spirit; ensure it asserts the linked task stays unchecked, not just that the commitment is `dropped`.

---

### Strengths

- **The core problem is real and well-evidenced.** Verified: the live PATCH handler (`intelligence.ts:489-496`) does a raw read-modify-write that sets only `status`/`resolvedAt` — no back-prop, no lock, no prune-safety, no reindex. `resolve()` (`commitments.ts:787-832`) does all four. The "orphans tasks forever" consequence is accurate because once `status: resolved`, `listOpen` skips it (`commitments.ts:756`) so triage can't catch up. This is a genuine correctness gap, not a polish item.
- **The `dropped` ≠ `resolved` back-prop distinction is correctly preserved** and tied to the real 2026-06-10 regression. The plan didn't just copy CLI behavior blindly.
- **Response-shape analysis is correct and verified.** `resolve()` returns `Commitment` (superset of `CommitmentEntry`), and the frontend mutation (`hooks/intelligence.ts:74-115`) does optimistic-remove-by-id + rollback + invalidate — it never reads response-body fields. Returning `{ commitment }` as-is is safe. The plan got this exactly right.
- **The `QmdRefreshResult.warning`/`embedWarning` logging fix (vs a never-firing `.catch()`) is correct** — `refreshQmdIndex` genuinely never throws (`qmd-setup.ts:185-240`).
- **The `ARETE_SEARCH_FALLBACK=1`-globally-set test gotcha is caught** (matches `search/LEARNINGS.md:31`) — the plan correctly says to spy the debounce callback, not the real refresh.
- **Architectural fit is sound**: `createCommitmentsRouter(workspaceRoot)` is a real closure factory (`intelligence.ts:3`, exported), routers are built exactly once at startup (`server.ts:106-120` inside `createApp`), so a memoized service in that closure has a clean lifecycle. The instinct is right — it's the `holdsLock` interaction that's the trap.
- **Scope discipline is good**: deferring `bulkResolve` batching (path B) with a clear "optimize only if measured slow" is the right call given the no-batch UI.

---

### Devil's Advocate

**If this fails, it will be because...** the memoized shared `CommitmentsService` instance, under the exact 50-concurrent-PATCH burst the feature is built for, hits the `holdsLock` re-entrancy window (Concern 1) and silently loses writes — turning the fix into a *new* corruption source that is strictly worse than today's lock-free-but-single-field write. Today's raw write is naive but each request rewrites the whole file atomically with last-writer-wins; the new path could interleave two writers who both believe they hold the lock. The plan's own highest-value test ("concurrent no lost writes") is the thing most likely to either catch this (if written against a shared instance with enough contention) or — worse — pass vacuously and ship the bug with a green checkmark.

**The worst outcome would be...** a user bulk-resolves 50+ commitments (the explicit target workflow), the interleaving drops a handful of writes, and because the UI optimistically removes all 50 from the list and only invalidates on settle, the dropped ones briefly vanish then reappear as `open` on the next refetch — looking like a flaky UI rather than data loss. The user re-resolves, hits the race again, and loses trust in the surface the whole plan exists to make trustworthy. Compounding factor: the back-prop side-effect means a lost commitment write could leave a task checked `[x]` in `week.md` while the commitment is still `open` in `commitments.json` — a split-brain between the working surface and the source of truth, which is exactly the kind of silent divergence that's hard to notice and hard to debug.

---

### Verdict

- [ ] **Approve** — Ready to proceed
- [ ] **Approve with suggestions** — Minor improvements recommended
- [ ] **Approve pending pre-mortem** — Run `/pre-mortem` before `/approve`
- [x] **Revise** — Address concerns before proceeding

**Rationale**: Concern 1 is a genuine correctness blocker — the memoization decision, as written, can introduce a lost-write/split-brain window under the precise concurrent burst this feature targets, and the prior review missed it because it only reasoned about cross-process locking, not single-instance re-entrancy. This must be resolved (likely a router-level serialization mutex, Concern 1 option (a)) before approval. Concern 2 (overstated justification) and the AC issues (3, 5) should be fixed in the same pass since they affect how the test is written and whether it actually guards the blocker. Once the concurrency model is pinned and the concurrent test is specified against a shared instance with real contention, this is a clean, well-scoped Medium plan worth shipping.

Given the Medium complexity and that the central risk is a concurrency hazard, **run `/pre-mortem` on the revised concurrency approach before `/approve`** — the failure modes here are exactly the silent-data-loss class a pre-mortem is good at surfacing.
