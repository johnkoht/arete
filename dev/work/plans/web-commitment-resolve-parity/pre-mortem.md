# Pre-Mortem: Web commitment resolve → parity with CLI resolve

> Run 2026-06-19 against `plan.md` (status: draft, /review verdict REVISE → concurrency blocker fixed, pre-mortem recommended).
> Method: worked the 11 canonical risk categories in `.pi/standards/pre-mortem-categories.md`; verified load-bearing claims against `intelligence.ts`, `commitments.ts`, `qmd-setup.ts`, `factory.ts`, `server.ts`, `index.ts`, and the existing test harness. Forced no risks; 7 specific risks survived.

---

### Risk 1: Mutex chains off a REJECTED resolve and either breaks the queue or leaks errors across requests

**Problem**: The plan's mutex is a promise queue: `tail = tail.then(() => services.commitments.resolve(id, status))`. Two correctness traps:
(a) If `resolve()` rejects (e.g. unknown id → "No commitment found", or a `LockBootstrapError`), and the code does `tail = tail.then(run)` and also `return tail` to the handler, then the *next* request that chains `prevTail.then(...)` inherits a **rejected** promise as its predecessor. With a bare `.then(onFulfilled)` (no `onRejected`), the rejection propagates down the chain — every subsequent resolve's handler sees request A's "No commitment found" error and returns 404/500 for commitments that are actually fine. This is exactly the "error in one request leaks into another's response" failure the task flags.
(b) Conversely, if the implementer guards by swallowing rejection on the *stored* tail but awaiting a separate branch for the response, a subtle variant can leave the per-request result undefined. The chain must (i) keep the queue alive across a rejected link, and (ii) deliver each request its OWN result/error, not its predecessor's.

**Mitigation**: Separate the "queue continuation" promise from the "this request's result" promise. Canonical pattern:
```ts
let tail: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = tail.then(fn, fn);   // run fn regardless of prior outcome
  // advance the queue on a SETTLED promise so a rejection never poisons the next link
  tail = result.then(() => {}, () => {});
  return result;                       // caller awaits its own result/error
}
```
The handler does `const updated = await enqueue(() => services.commitments.resolve(id, status));` inside its own try/catch for error mapping. This guarantees serialization, no cross-request leakage, and a rejected resolve cannot stall or poison the queue.

**Verification**: Unit/route test: fire 3 concurrent PATCHes where the middle one targets an unknown id → assert the unknown one returns 404 AND the other two return 200 with their own commitment resolved (proves no leakage and no stall). Read the merged code and confirm the queue-advance promise has a rejection handler (`.then(noop, noop)` or `.catch(noop)`), not a bare `.then`.

**Severity**: HIGH

---

### Risk 2: Memoized service is an ASYNC promise — a construction race or a rejected memo poisons all resolves

**Problem**: `createServices()` is `async` (`factory.ts:81`, returns `Promise<AreteServices>`) but `createCommitmentsRouter(workspaceRoot)` is **sync** (`intelligence.ts:287`) and built once at startup (`server.ts:110`). "Construct once in the closure" therefore means memoizing a *promise*, not an object. Two traps: (a) if the implementer memoizes the resolved value via `if (!services) services = await createServices(...)` without guarding the in-flight window, the first burst of N concurrent PATCHes can each see `services === undefined` and call `createServices()` N times (N config loads + N×~18 service constructions + N separate `CommitmentsService` instances) — defeating the single-shared-instance precondition the mutex depends on. With N distinct instances, the mutex serializes against the wrong object and the `holdsLock` lost-write window the whole feature exists to close **reopens**. (b) If `createServices()` rejects (bad config, `loadConfig` throws) and the rejected promise is cached, every subsequent resolve fails forever with no recovery until restart.

**Mitigation**: Memoize the **promise** synchronously at first call, before any await: `servicesPromise ??= createServices(workspaceRoot)` then `const services = await servicesPromise` inside the handler. This guarantees exactly one construction even under a concurrent first burst. For (b): on a rejected `servicesPromise`, reset it to `undefined` in the catch so a later request can retry, OR let it fail loud and map to 500 (acceptable — config errors are deploy-time). Document the choice.

**Verification**: Read merged code: confirm assignment is the promise (no `await` before the memo assignment). Test: the existing acceptance criterion "service is constructed at most once per workspace" must be asserted under the **concurrent** first-burst, not sequential — spy/count `createServices` (or `loadConfig`) invocations while firing ≥50 parallel PATCHes against a fresh router and assert count === 1.

**Severity**: HIGH

---

### Risk 3: Concurrent no-lost-writes test passes vacuously and fails to guard the regression

**Problem**: The existing harness builds a **fresh router per `it`** (`intelligence.test.ts:49`, `const router = createIntelligenceRouter(tmpDir)`). The /review blocker (`holdsLock` re-entrancy lost write) ONLY manifests when many concurrent requests share **one** `CommitmentsService` instance. A test that builds a router per request, or that fires "concurrent" requests that don't actually overlap in the critical section (Hono `app.request` awaited sequentially, or ids that don't contend), would pass whether or not the mutex exists — giving false confidence that the data-loss guard works. The plan calls this out, but it's the single highest-stakes test and easy to get subtly wrong (e.g. `for (const p of patches) await p` instead of `Promise.all`).

**Mitigation**: Test must: (a) build ONE router instance and reuse it across all PATCHes; (b) fire with `Promise.all(ids.map(id => router.request(...)))` so they truly overlap; (c) target ≥50 distinct ids so the shared `save()` critical section is hammered; (d) assert in `commitments.json` that **all 50** end `resolved` and **none** reverted to `open`. Sanity-check the guard by temporarily removing the mutex locally and confirming the test goes RED (a regression guard that never fails when the bug is present is not a guard). Note `bulkResolve` (`commitments.ts:838`) is NOT the path under test — it's a single-call-stack loop; the web path is N independent stacks, which is the actual concurrency the test must model.

**Verification**: In the merged test, grep for `Promise.all` and a single shared `router`/`createCommitmentsRouter` call hoisted outside the loop. Reviewer (or the author) runs the "mutex-removed → test RED" check once and records it in the PR description.

**Severity**: HIGH

---

### Risk 4: Back-prop failure after the commitments.json write leaves a silent inconsistency (task stays unchecked)

**Problem**: `resolve()` writes `commitments.json` first (`commitments.ts:809`), THEN back-propagates to `week.md`/`tasks.md` via `completeTaskFromCommitmentFn`, wrapped in a **silent catch** (`commitments.ts:824-828`). If back-prop throws (file locked by a concurrent winddown editing `week.md`, malformed task file, disk error), the commitment is `resolved` but the linked task stays `[ ]` — silently. This is the *exact* half-landed state ("resolving leaves linked tasks unchecked forever") the feature exists to eliminate, now reachable on the new web path. The PATCH still returns 200, so the UI shows success while the working surface is stale. Note: this is pre-existing CLI behavior (`tasks.ts:507-517` mirrors it), so it's not a *new* bug — but routing the web bulk path through it widens the blast radius (50 concurrent back-props contending on the same `week.md`).

**Mitigation**: Out of scope to change `resolve()` semantics (plan explicitly excludes it, and silent best-effort is intentional per the F1 comment). Mitigate the *widened* exposure instead: because resolves are now serialized by the mutex (Risk 1), back-prop writes to `week.md` no longer overlap each other in-process, removing the self-contention vector. Accept the residual external-contention case (winddown holding `week.md`) as non-destructive — `commitments.json` is the source of truth and a later triage/winddown reconciles. Add a `console.warn` (not silent) inside the catch on the *backend* call site if cheap, so operators can see back-prop misses in logs. Document in the PR that 200 means "commitment resolved", not "task guaranteed checked".

**Verification**: Confirm the silent catch at `commitments.ts:824-828` is unchanged (out of scope) and that serialization (Risk 1) is in place so concurrent web back-props don't self-contend. If a backend-side warn is added, confirm it logs on a forced back-prop throw in a test. Manual QA step 3 in the plan (resolve item → task flips to `[x]`) covers the happy path.

**Severity**: MEDIUM

---

### Risk 5: External cross-process lock contention exhausts the retry budget during a 50-item serial burst

**Problem**: With resolves serialized in-process (mutex), the 50-item burst is N sequential `save()` calls, each acquiring + releasing the `proper-lockfile` lock (`commitments.ts:721`, `LOCK_RETRIES` = 10 retries, maxTimeout 1s, `LOCK_STALE_MS` = 30s). If a winddown/extract run grabs the cross-process lock mid-burst and holds it for >~ the retry budget (sum of backoffs ≈ a few seconds, capped well under the 30s stale TTL), an individual `save()` can exhaust its 10 retries and throw. That resolve then rejects → maps to 500 → that one commitment is left `open` while its 49 neighbors resolved. Not corruption (the lock did its job), but a partial-failure the UI surfaces as a lone failed row mid-bulk. No deadlock risk: the in-process mutex and cross-process lockfile are different mechanisms; the mutex guarantees only one in-process `runUnderLock` runs at a time, and `holdsLock` is instance-local so there's no double-acquire (re-entrant branch only triggers for nested calls on the same instance, which serialized resolves don't create).

**Mitigation**: Accept as a rare, non-destructive, self-correcting partial failure (the UI's optimistic-remove will be reverted by the failed mutation; the user re-clicks). Confirm the error maps to 500 (not a silent success). Do NOT raise `LOCK_RETRIES` (out of scope; would slow the common path). Optionally note in the PR that simultaneous winddown + 50-item web bulk-resolve is a known contention window and the future `bulkResolve`-under-one-`withLock` option (plan Risk "Future option B") collapses it to a single lock acquisition.

**Verification**: Manual QA step 4 already specifies "resolve in UI while winddown/extract writes `commitments.json`; confirm no corruption / lost writes." Extend it to confirm that if a row *does* fail under contention, it surfaces as a failed mutation (toast/revert), not a false success. Confirm no `holdsLock` re-entrant path is reachable from the serialized web flow (it isn't, since each resolve is a fresh top-level call).

**Severity**: MEDIUM

---

### Risk 6: Detached debounce timer fires during/after shutdown or overlapping bursts → unhandledRejection

**Problem**: The debounce uses a closure `setTimeout` that fires ~5s after the last resolve and calls `refreshQmdIndex` (async, detached — not awaited by any handler). Two issues: (a) There is **no `unhandledRejection` handler** anywhere in the backend (`index.ts` has only SIGTERM/SIGINT → synchronous `process.exit(0)`, lines 65-75). `refreshQmdIndex` is documented and verified to never throw (`qmd-setup.ts:233-239` catches and returns `{ warning }`), so the *library* call is safe — but any bug in the timer callback body itself (reading `config.qmd_collection` off a rejected services promise, a logging call, etc.) would surface as an unhandledRejection with no handler, potentially crashing the process under newer Node. (b) The signal handlers do NOT clear the pending timer; the plan accepts "dropped silently by `process.exit(0)`" — correct because `process.exit` is synchronous and kills the timer, but only if the timer hasn't already fired and entered an in-flight `qmd update` child process, which is then orphaned (harmless: `qmd update` is idempotent).

**Mitigation**: Wrap the ENTIRE timer callback body in try/catch (the plan already mandates this) AND ensure the async work is `void`-ed with a `.catch` so a stray rejection can't escape: `timer = setTimeout(() => { void runRefresh().catch(err => console.error('[commitments] qmd refresh failed', err)); }, 5000)`. `.unref()` the timer (plan mandates). Inspect and log the returned `QmdRefreshResult.warning`/`embedWarning` fields. Re-arming on each resolve (clear + reset) correctly coalesces overlapping bursts into one trailing refresh — confirm the clear happens before the set.

**Verification**: Read merged code: timer callback has try/catch, the async refresh is `.catch`-guarded, `.unref()` is called, and re-arm does `clearTimeout(timer)` before `timer = setTimeout(...)`. Test (per plan): spy the debounce callback (NOT the real `refreshQmdIndex`, which no-ops under `ARETE_SEARCH_FALLBACK=1`) and assert it fires exactly once after a burst of N resolves.

**Severity**: MEDIUM

---

### Risk 7: Error-mapping by message-substring silently reverts to 500 on a future copy-edit; prune-safety now active on the web path

**Problem**: Two backward-compat / blast-radius concerns. (a) The plan maps `resolve()` throws to HTTP codes by **error-message substring** ("No commitment found" → 404). The messages live at `commitments.ts:795,799`. A future refactor that rewords those strings silently breaks the mapping → unknown-id returns 500 instead of 404, and the UI's not-found handling degrades with no test failure unless guarded. (b) Routing through `createServices()` now wires `setHasOpenTaskReferencesFn` (`factory.ts:157`) — so every web resolve's `save()` now runs the prune pass with task-reference protection, which the old raw `fs.writeFile` never did. This is the *intended* improvement, but it's a behavior change on the existing single-item UI click and the reconcile-confirm path (which the plan confirms flows through this same PATCH): a save that previously just rewrote one field now reads `week.md`/`tasks.md` to check open-task references and may prune age-stale commitments it didn't before. Observable effect: a single web resolve can now drop unrelated age-stale-and-unreferenced commitments from `commitments.json` as a side effect (this is also what the CLI does, so it's parity — but it's newly reachable from a UI click and worth flagging).

**Mitigation**: (a) Add a test asserting the 404 path (plan already mandates this — it's the guard that makes a future message edit fail loudly) AND a code comment at the mapping site tying the substrings to `commitments.ts:795,799` (plan mandates). (b) Accept the prune-on-resolve behavior as intended parity; note in the PR that web single-resolve now shares the CLI's prune semantics (age-stale unreferenced commitments may be pruned on any resolve). No code change — the prune logic and hard-ceiling are unchanged; this is documentation/awareness so the behavior shift isn't surprising in QA.

**Verification**: (a) Confirm the 404 test exists and a comment references the line numbers. (b) Manual QA: resolve one commitment in a workspace that contains an age-stale unreferenced commitment; confirm the stale one is pruned (expected) and a task-referenced stale one is NOT (prune-safety working). Confirm the reconcile-confirm path still returns the expected shape (`{ commitment }`).

**Severity**: MEDIUM

---

## Summary

Total risks identified: **7**

Categories covered: Integration (mutex/service wiring, async factory, prune-safety activation), Code Quality (promise-queue correctness, detached-timer error handling), Test Patterns (vacuous concurrency guard, 404 mapping guard), Platform/State (cross-process lock contention, back-prop partial failure), Documentation (behavior-shift notes in PR). Skipped: Context Gaps, Scope Creep, Reuse/Duplication, Dependencies, Build Scripts — not load-bearing for this small, well-scoped change (plan is explicit on scope and reuses `resolve()` wholesale).

Severity counts:
- **CRITICAL: 0**
- **HIGH: 3** (Risk 1 mutex rejection-poisoning, Risk 2 async-memo construction race, Risk 3 vacuous concurrency test)
- **MEDIUM: 4** (Risk 4 silent back-prop inconsistency, Risk 5 external lock contention partial-failure, Risk 6 debounce timer/unhandledRejection, Risk 7 error-mapping fragility + prune-safety behavior shift)
- **LOW: 0**

**Bottom line: CLEAR TO PROCEED WITH MITIGATIONS — no CRITICAL risks.** The data-loss class that drove the /review REVISE verdict is genuinely addressed by the serialization mutex, **provided** the three HIGH risks are mitigated as specified: (1) the promise queue advances on a settled promise and returns each caller its own result (no cross-request error leakage / no stall), (2) the async service is memoized as a *promise* assigned synchronously before any await (one shared instance under the first concurrent burst — the mutex's correctness depends on this), and (3) the no-lost-writes test uses ONE shared router + `Promise.all` + ≥50 distinct ids and is verified to go RED with the mutex removed. The four MEDIUM risks are non-destructive, self-correcting, or documentation-only and do not gate the ship.

**Ready to proceed with these mitigations?**
