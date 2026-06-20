# Post-Build Adversarial Review — web-commitment-resolve-parity

Review of commit `29a534ca` on `feature/web-commitment-resolve-parity`, by an adversarial code-review subagent (orchestrated). Orchestrator disposition appended at top.

## Orchestrator disposition (2026-06-19)
- **Verdict accepted: SHIP-WITH-FOLLOWUPS, no blockers.** The 3 HIGH mitigations were independently verified satisfied.
- **should-fix #1 (sibling-isolation test) — DONE:** added `PATCH … a failing resolve in a burst does not break siblings` (mixed 200/404/200 burst, asserts both goods resolved). Green.
- **should-fix #2 (409 ambiguous-prefix untested + behavior-change note) — DONE:** added `PATCH … ambiguous prefix returns 409` test; the exact→prefix match behavior change is called out in the ship report / PR note.
- Tests now 36/36 in `intelligence.test.ts`.

---

## Verdict: SHIP-WITH-FOLLOWUPS

The three HIGH mitigations are genuinely satisfied in the code. No data-loss bug found. Two should-fix items (a test gap and a behavior-change note), a couple of nits. Nothing blocks merge.

## HIGH mitigations — verified satisfied

### HIGH-1 serialize mutex — CORRECT
`tail` is always reassigned to `run.then(noop, noop)`, a promise that ALWAYS fulfills. The next `serialize` does `tail.then(fn)` on an always-fulfilled promise, so `fn` always runs regardless of the prior request's outcome. A rejected `resolve()` neither poisons nor stalls the chain. Each caller awaits its OWN `run` → no cross-request leakage. `tail` is a single rolling promise reference, not an array → bounded memory. The load-modify-save critical section cannot interleave (one resolve at a time on the single shared instance).

### HIGH-2 promise-memo — CORRECT, no double-construct race
`getServices()` is fully synchronous from the `if (servicesPromise)` check through `servicesPromise = p` — no intervening `await`, so the memo is set before control yields. A concurrent first burst cannot create two `createServices()`. Rejection-reset `if (servicesPromise === p) servicesPromise = undefined` only nulls the still-failed promise, so it cannot clobber a newer retry.

### HIGH-3 contention test — SOUND, guards the bug
ONE shared router, `Promise.all` over 60 distinct non-prefixing 8-char ids, real `proper-lockfile`, asserts all 60 resolved AND none open. The bug genuinely manifests without the mutex: `resolve()` does `load()` OUTSIDE the lock (commitments.ts:791), so concurrent resolves read the same open snapshot and last-writer-wins loses changes. Proven RED (1/60) without the mutex, GREEN (60/60) with it.

## Findings

### [should-fix → RESOLVED] No test for "rejected resolve in a burst doesn't break siblings"
The pre-mortem's Risk-1 verification mandated it. Added to the test suite.

### [should-fix → RESOLVED/NOTED] PATCH now does prefix matching (was exact match)
Old handler used `findIndex(c.id === id)` (exact); `resolve()` matches `id === id || startsWith(id)`. Intended CLI parity; UI sends full ids so benign, but an observable contract change and the 409 branch was untested. 409 test added; behavior change noted in the PR.

### [nit] Response now includes extra fields (additive, safe)
New response = core `Commitment` (superset of `CommitmentEntry`, adds `createdAt` etc.). Frontend reads only id/status/resolvedAt → unaffected.

### [nit] Error-mapping substring-based but adequately guarded
No false-positive throw paths (`LockBootstrapError`, proper-lockfile contention both fall through to 500). The 404 test + line-ref comment guard it.

## What's correct (verified)
Mutex (no poison/stall/leak, bounded), promise-memo (single instance, safe retry), contention test (genuine guard), debounce (clearTimeout-before-rearm, `.unref()`, try/catch + `.catch()` guarded, exactly-once), dropped-does-not-check-off-tasks, prune-safety activation (intended), `{ commitment }` shape preserved, committed dist matches source, 400/404/409 mapping.
