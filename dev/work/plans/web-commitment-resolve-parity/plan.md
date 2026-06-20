---
title: "Web commitment resolve → parity with CLI resolve"
slug: web-commitment-resolve-parity
status: complete
size: small
tags: [web, commitments, backend, parity]
created: "2026-06-19T00:00:00.000Z"
updated: "2026-06-20T00:00:00.000Z"
completed: "2026-06-20T00:00:00.000Z"
execution: "merged in PR #17 (cb301355)"
has_review: true
reviewed: "2026-06-19"
review_verdict: "REVISE → revised; re-approved after pre-mortem (0 CRITICAL, 3 HIGH mitigations folded in); post-build + pre-PR reviews SHIP"
has_pre_mortem: true
has_prd: true
steps: 3
---

# Web commitment resolve → parity with CLI resolve

## Goal
Make resolving a commitment in the web UI do everything `arete commitments resolve` does — task back-propagation, file locking, prune-safety, and search reindex — so the UI is a safe surface for bulk-resolving 50+ items.

## Context
When you mark a commitment resolved/dropped in the web UI, the work only half-lands. The web PATCH handler does a raw read-modify-write of `.arete/commitments.json` — it sets `status` + `resolvedAt` and nothing else (`packages/apps/backend/src/routes/intelligence.ts:489-496`). The CLI path (`arete commitments resolve` → `CommitmentsService.resolve()`, `packages/core/src/services/commitments.ts:787`) additionally: (1) back-propagates the resolution to the linked task in `week.md`/`tasks.md` so it shows `[x]` on the working surface, (2) takes a `proper-lockfile` lock in `save()` so concurrent winddown/extract writes can't last-writer-wins each other (`commitments.ts:603`), (3) protects task-referenced commitments from auto-prune, and (4) refreshes the QMD search index so resolved items stop surfacing in search.

These side effects are wired by the factory `createServices()` (`packages/core/src/factory.ts:149-159`), NOT by the raw `new CommitmentsService()` the backend currently uses. Every other backend route (`review.ts`, `areas.ts`, `tasks.ts`) already goes through `createServices()`; the commitments router is the lone outlier.

Consequence today: resolving in the UI leaves linked tasks unchecked **forever** (back-prop only fires inside `resolve()`, and once an item is `status: resolved` the triage/`listOpen` paths skip it — so running triage afterward does NOT catch up), and the raw write bypasses the lock. This is exactly the 50+-item bulk workflow the user prefers, so it currently orphans 50+ tasks silently.

Decision (confirmed with user): the QMD reindex should be **debounced server-side** — each resolve stays fast (back-prop + lock only), and one coalesced `refreshQmdIndex` runs ~5s after the last resolve, rather than one reindex per item.

**Eng-lead reviews (2026-06-19) — key constraint:** there is no bulk endpoint. "Resolve 50 items" is 50 independent, concurrent PATCH requests — each row's button calls `useMarkCommitmentDone().mutate` with no client-side batching/queue (`CommitmentsPage.tsx:152-163, 206-217`). Two consequences:
- **Concurrency safety is load-bearing (the /review blocker).** A naive memoized single `CommitmentsService` is NOT safe under concurrent requests: the instance-local `holdsLock` re-entrancy flag (`commitments.ts:682, 690-735`) was built for one call stack wrapping its own inner `save()`. Share the instance across N concurrent requests and, while request A holds the lock mid-write, request B sees `holdsLock === true`, takes the re-entrant branch, and writes WITHOUT locking — a lost-write/corruption window (the exact failure this feature exists to prevent). Resolution: memoize the service AND **serialize resolves through a router-level async mutex** (a promise queue) so only one resolve executes at a time through the shared instance. The cross-process `proper-lockfile` still guards against external writers (winddown/extract).
- **Construction cost is modest, not a "subprocess storm."** Earlier framing (per-PATCH `createServices()` → ~100 `gws` subprocesses) was wrong: gws provider getters return `null` unless google-workspace is `active`, and `detectGws` runs lazily inside provider methods, never at construction (verified in /review). Memoizing still avoids a redundant `loadConfig` disk read + ~18 service constructions per request, so it's worth doing — but the real driver is the mutex needing a single shared instance to serialize against, plus avoiding in-process `proper-lockfile` contention.

## Plan

1. **Route the PATCH handler through a memoized, serialized factory-wired service** — In `packages/apps/backend/src/routes/intelligence.ts` (PATCH `/:id`, currently `:462-503`), replace the raw `fs.readFile`/`fs.writeFile` block with a call to `services.commitments.resolve(id, status)`, where `services` comes from a single `AreteServices` constructed **once** in the `createCommitmentsRouter(workspaceRoot)` closure (routers are built once at startup — `server.ts:110`). Three coupled concurrency mitigations are MANDATORY (pre-mortem HIGH-1/2/3) — they must land together or the lost-write window reopens:
   - **(HIGH-2) Memoize the construction PROMISE synchronously, not the resolved value.** `createServices()` is async; a sync "construct on first request" memo lets the first concurrent burst start N parallel constructions → N separate `CommitmentsService` instances → reopens the `holdsLock` lost-write window. Use `servicesPromise ??= createServices(workspaceRoot)` assigned **before any await**, and `await servicesPromise` in each handler. Reset `servicesPromise = undefined` on rejection so a transient construction failure can retry.
   - **(HIGH-1) Serialize resolves through a closure-scoped promise-queue mutex with correct settle semantics.** Advance the queue on a SETTLED promise so one rejected resolve can't poison/stall the chain, and return each caller its own result/error — e.g. `const run = tail.then(() => services.commitments.resolve(id, status)); tail = run.then(noop, noop); return await run;`. Only one resolve executes at a time through the shared instance, so no other request observes `holdsLock` mid-flight (closes the /review blocker). Mutex is per-router/per-workspace (closure-scoped), never global.
   - **(HIGH-3) See Step 3** — the concurrency test must be proven to go RED if this mutex is removed.
   - `resolve()` delivers back-prop (resolved only — `dropped` correctly does NOT check off tasks, per F1 semantics at `commitments.ts:823`), locking, and prune-safety. Note routing through `createServices()` newly activates prune-safety (`setHasOpenTaskReferencesFn`) on the web single-click and reconcile-confirm paths — intended parity; document in the PR.
   - **Error mapping (pin it):** map `resolve()`'s throws — "No commitment found…" → `404`; "Ambiguous prefix…" → `409` (unreachable: UI always sends a full 64-char id, confirmed `intelligence.ts:349`, but map rather than 500). Mapping is by error-message substring (`commitments.ts:795,799`), which is fragile — add a code comment tying the strings to those lines AND a test asserting the 404 path (so a future message copy-edit fails loudly instead of silently reverting to 500). `LockBootstrapError` / `storage.write` throws fall through to the existing `500` catch (acceptable — distinct failure mode). Keep the existing pre-`resolve()` `400` guard for invalid status.
   - **Response:** return `{ commitment: updated }` as-is — `resolve()` returns a `Commitment` (superset of `CommitmentEntry`); the frontend mutation never reads response-body fields (`hooks/intelligence.ts:74-115` does optimistic-remove by id + toast only), so no shape change needed.
   - Acceptance: Resolving via PATCH writes `status`/`resolvedAt` to `commitments.json` AND flips the linked `@from(commitment:<prefix>)` task in `week.md` to `[x]`; `dropped` leaves the task untouched; unknown id → 404 (asserted by test); under ≥50 concurrent PATCHes to distinct ids on ONE shared router instance, every targeted commitment ends `resolved` with zero lost writes; the service is constructed at most once per workspace.

2. **Add debounced, coalesced QMD refresh** — In the same `createCommitmentsRouter(workspaceRoot)` closure, keep a `setTimeout` handle. On each successful `resolve()`, re-arm a ~5s timer — `clearTimeout` the prior handle BEFORE `setTimeout` (resetting collapses a burst into one refresh); `.unref()` the timer so it never holds the process open on its own. NOTE the backend registers no `unhandledRejection` handler (pre-mortem MEDIUM), so the detached async callback must self-guard: wrap its body in try/catch AND `.catch()` the async `refreshQmdIndex` call — a leaked rejection would otherwise be unhandled process-wide. On fire, call `refreshQmdIndex(workspaceRoot, config.qmd_collection)` (`packages/core/src/search/qmd-setup.ts:185`) — read `config.qmd_collection` (singular — correct, matches all CLI call sites and is just a "configured?" gate; do NOT "fix" to the plural map) once from the closure's cached config. **Wrap the entire timer callback body in try/catch** and log via the returned `QmdRefreshResult` (`refreshQmdIndex` never throws — it returns `{ warning }`/`{ embedWarning }`, verified `qmd-setup.ts:233-239` — so inspect and log those fields; the try/catch guards against an unhandledRejection from the detached callback, not from `refreshQmdIndex` itself). Do not block the PATCH response. `refreshQmdIndex` already no-ops under `ARETE_SEARCH_FALLBACK`. Pending timer on shutdown: dropped silently by the synchronous `process.exit(0)` signal handlers (`index.ts:65-75`) — acceptable, search staleness is non-destructive and the next CLI `arete index`/resolve burst catches up.
   - Acceptance: Resolving 50 items quickly triggers exactly one `qmd update` ~5s after the last resolve (verify via spied debounce callback — see test note). Note the timing is eventual: a resolved item keeps surfacing in search until the debounced reindex completes (~5s after the last resolve in a burst), NOT at resolve time — this is acceptable and expected.

3. **Tests + build** — Add/extend a backend route test for the commitments PATCH covering: resolved → file + linked-task `[x]`; dropped → task untouched (directly guards the live 2026-06-10 false-completion regression, `commitments.ts:818-822`); unknown id → 404 (guards the fragile message-substring mapping — see Step 1); debounce coalescing fires once after a burst. **The highest-value test — concurrent no-lost-writes — must be set up to actually catch the blocker:** fire ≥50 PATCHes in parallel (`Promise.all`) to distinct ids against **ONE shared router instance** (not a fresh router per request — the existing harness builds a router per `it` at `intelligence.test.ts:49`, which barely contends and would pass vacuously) with high contention, then assert every targeted commitment ends `resolved` in `commitments.json` and none was silently overwritten back to `open`. **Prove the guard works (HIGH-3): confirm the test goes RED when the serialization mutex is removed** — otherwise it's not a real regression guard. Test-env gotcha: `ARETE_SEARCH_FALLBACK=1` is set globally in the test script (`search/LEARNINGS.md:31`), so the real `refreshQmdIndex` always hits the skip path — assert on a **spy of the debounce callback**, not the real `refreshQmdIndex`, or the assertion passes vacuously. Rebuild and commit `dist/` per project convention.
   - Acceptance: All tests pass incl. the high-contention shared-router no-lost-writes case; `dist/` rebuilt and committed.

## Risks
- **Concurrency (the /review blocker) — RESOLVED via router-level serialization mutex (Step 1).** The naive shared-instance memoization had a lost-write window through the `holdsLock` re-entrancy flag; serializing resolves through a closure-scoped promise queue closes it (only one resolve executes at a time, so `holdsLock` is never observed mid-flight by another request). This also makes the 50-item burst inherently serial: O(N²) small-JSON rewrites + N back-prop passes over `week.md`/`tasks.md`. Cheap in practice for a few-hundred-item file; ship it, optimize only if measured slow.
  - **Future option (B), if serial proves slow:** collect pending ids → one `CommitmentsService.bulkResolve()` (`commitments.ts:838`) under one `withLock` scope → one rewrite + one back-prop sweep + one reindex. Deferred — bigger change, and per-item HTTP error reporting gets murky (optimistic responses). Not in scope now.
  - **Recommended before `/approve`:** run `/pre-mortem` on the concurrency approach — the /review verdict was REVISE precisely because the central risk is silent data loss, and a pre-mortem is the right gate for that class of risk.
- **Config staleness from a long-lived service** — memoizing the wired service means an `arete.yaml` edit mid-session isn't picked up until backend restart. Acceptable (config rarely changes; restart is cheap); note in the PR.
- **Response-shape — CONFIRMED FINE (no action).** `resolve()` returns a `Commitment` (superset of `CommitmentEntry`). The frontend mutation never reads response-body fields (`hooks/intelligence.ts:74-113`); return `{ commitment }` as-is.

## Out of Scope
- Switching the read-only reconcile endpoint (`intelligence.ts:398`) to `createServices()` — harmless as-is (Jaccard match, no writes); optional consistency cleanup only.
- Any change to the CLI resolve path or to `CommitmentsService.resolve()` itself.
- New UI affordances — confirmed-reconcile resolutions already flow through this same PATCH endpoint and inherit the fix.

## Verification
1. Build: `pnpm -r build`; commit `dist/`.
2. Route test: as in step 3.
3. Manual end-to-end: pick an open commitment with a linked task in `week.md`; resolve it in the UI; confirm `commitments.json` resolved AND the task flips to `[x]` (the bit broken today). Resolve several quickly; confirm one `qmd update` ~5s after the last. Search a resolved item → no longer surfaces.
4. Lock sanity: resolve in the UI while a winddown/extract writes `commitments.json`; confirm no corruption / lost writes.
