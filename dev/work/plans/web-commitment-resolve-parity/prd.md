# PRD: Web commitment resolve → parity with CLI resolve

## Goal
Make the web UI's `PATCH /api/commitments/:id` resolve commitments through the fully-wired `CommitmentsService.resolve()` (task back-prop + file locking + prune-safety) instead of a raw file write, and add a debounced single QMD reindex after a burst — without reopening the concurrency lost-write window the /review caught.

## Tasks

### task-1: Route PATCH through a promise-memoized, serialized factory-wired service
Replace the raw `fs.readFile`/`fs.writeFile` block in the PATCH `/:id` handler (`packages/apps/backend/src/routes/intelligence.ts`) with a call to `services.commitments.resolve(id, status)`, where the wired `AreteServices` is built once per router and resolve calls are serialized.

**Acceptance Criteria**
- Resolving an open commitment via PATCH sets `status` + `resolvedAt` in `.arete/commitments.json` AND checks off the linked `@from(commitment:<prefix>)` task in `week.md`/`tasks.md` to `[x]`.
- `status: dropped` sets the commitment dropped but leaves the linked task untouched (no `[x]`).
- The wired services are obtained via a **synchronously memoized construction promise** (`servicesPromise ??= createServices(workspaceRoot)`, assigned before any await; reset to undefined on rejection) — never a value-memo that allows concurrent double-construction. <!-- pre-mortem HIGH-2 -->
- Resolve calls are serialized through a closure-scoped promise-queue mutex that advances on a **settled** promise and returns each caller its own result/error (one rejection cannot poison or stall the queue, nor leak into another request's response). <!-- pre-mortem HIGH-1 -->
- Unknown id → HTTP 404 (asserted by test); invalid `status` (not resolved/dropped) → 400; the message-substring → status mapping carries a code comment referencing the throw sites in `commitments.ts`.
- Response body remains `{ commitment }`; no frontend change required.

### task-2: Debounced, coalesced, self-guarded QMD reindex
Add a closure-scoped debounced `refreshQmdIndex` so a burst of resolves triggers exactly one reindex ~5s after the last resolve.

**Acceptance Criteria**
- On each successful resolve, a ~5s timer is (re)armed: `clearTimeout` the prior handle before `setTimeout`; the timer is `.unref()`'d.
- On fire it calls `refreshQmdIndex(workspaceRoot, config.qmd_collection)` using config loaded once per router.
- The detached callback self-guards: body wrapped in try/catch AND the async refresh `.catch()`-guarded (backend registers no `unhandledRejection` handler), and logs `QmdRefreshResult.warning`/`embedWarning` when present (refreshQmdIndex never throws). <!-- pre-mortem MEDIUM -->
- PATCH responses are not blocked on the reindex.

### task-3: Tests + build
Add backend route tests and rebuild committed artifacts.

**Acceptance Criteria**
- Tests cover: resolved → file + linked task `[x]`; dropped → task untouched; unknown id → 404; debounce coalescing fires once per burst (assert on a spy of the debounce/refresh callback, NOT the real `refreshQmdIndex`, which is skipped under the globally-set `ARETE_SEARCH_FALLBACK=1`).
- A high-contention test fires ≥50 parallel PATCHes to distinct ids against ONE shared router instance and asserts every targeted commitment ends `resolved` with zero lost writes. <!-- pre-mortem HIGH-3 --> This test is proven to go RED when the serialization mutex is removed.
- `pnpm -r build` (or package build) succeeds; `dist/` rebuilt and committed (project convention).
- `typecheck` + full affected test suite green.

## Out of Scope
- Server-side resolve batching (bulkResolve queue) — deferred unless serial proves slow.
- Switching the read-only reconcile endpoint to `createServices()` (optional consistency only).
- Any change to the CLI resolve path or `CommitmentsService.resolve()` itself.
