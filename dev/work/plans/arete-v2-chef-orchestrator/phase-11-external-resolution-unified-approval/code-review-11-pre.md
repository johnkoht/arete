# Code Review — Phase 11-pre

**Reviewer**: Senior staff engineer (Claude Opus 4.7, 1M ctx)
**Date**: 2026-06-01
**Scope**: 6 source/doc commits + 1 build-report commit landed 2026-06-04 22:32 → 22:49
**Tests verified**: 113 pass / 0 fail (`tsx --test` across 7 suites, 13.7s)
**Typecheck**: clean on both `packages/core` and `packages/cli` (`tsc --noEmit`)

---

## Verdict: **APPROVE WITH MINOR**

Build is clean, type-safe, additive, and well-tested. Two LOW-severity
documentation/code drift findings noted below — neither blocks Phase 11a
nor the 1-day soak. No HIGH concerns. No regressions in the 41
pre-existing tests across the touched suites.

---

## Per-commit verification

| SHA | Scope | Claim | Verified |
|-----|-------|-------|----------|
| `bc6354f5` | core | EmailThread + GmailSentCache type + normalizeEmail | YES — additive diff confirmed (all new fields optional, type compiles, snapshot identical) |
| `711beac4` | core | gmail-sent-cache.ts reader/writer with v2 envelope | YES — version gate rejects missing/v1/v3, 18 tests cover the matrix |
| `59037f52` | core | fetchSent + MIME walk + rate-limit retry | YES — 30 tests, query string assembled correctly (`in:sent after:YYYY/MM/DD <q>`), backoff verified |
| `2e135827` | cli | `--sent` + `--fetch-body` flags | YES — backward compat asserted, JSON output additive, PullGmailDeps DI clean |
| `7303b436` | docs | inbound caller audit | YES — re-ran the audit greps; result matches |
| `c5e34214` | docs | 1-day pre-soak checklist | YES — 135 LOC, four-bucket protocol, rollback path documented |
| `9c2f8891` | docs | build report | YES — 203 LOC, accurate against actual file diffs and test counts |

All 7 commits carry the `Co-Authored-By: Claude Opus 4.7 (1M context)
<noreply@anthropic.com>` footer. All follow the `phase-11-pre(scope): ...`
naming convention.

---

## Backward-compat verification (existing callers unbroken)

- `packages/core/src/integrations/gws/types.ts` diff is **strictly
  additive**: existing 7 base fields untouched; new fields are all
  `?:`-optional. Type-narrowing on the existing shape still works.
- `JSON.stringify` omits `undefined` new fields. Verified by
  `email-thread-shape.test.ts` line 83-95 (asserts new keys ABSENT in
  output when only base fields set).
- `EmailProvider.fetchSent` is optional (`fetchSent?`) — non-Gmail mocks
  do not need to implement it.
- Pre-existing tests pass unchanged: `gmail.test.ts` (10),
  `intelligence-email.test.ts` (4), `pull.test.ts` (27) = **41/41 PASS**.

---

## Inbound caller audit re-verification

Re-ran the three canonical greps from the audit doc against the working
tree. Results match the build report claims exactly:

```
EmailThread refs (src only): 5 files
  - core/src/integrations/gws/types.ts (owner)
  - core/src/integrations/gws/gmail.ts (owner)
  - core/src/integrations/gws/gmail-sent-cache.ts (new 11-pre)
  - core/src/services/intelligence.ts (consumer)
  - cli/src/commands/pull.ts (consumer)

thread.<field> reads (src only):
  - intelligence.ts:606-609 → id, subject, from, date    (BASE only)
  - pull.ts:798-800         → subject, from, date, snippet (BASE only)

Object.keys(thread) / for-in iteration: 0 matches
```

intelligence.ts:597-619 spot-read confirmed — only reads `thread.id`,
`thread.subject`, `thread.from`, `thread.date` into a fixed-shape
ContextFile literal. No iteration. No spread. No serialization.

pull.ts:798-800 spot-read confirmed — three lines, four base fields,
direct interpolation into a string. Safe.

**"0 fixes required" claim verified.**

---

## Test quality spot-check (5 sample assertions)

1. **`email-thread-shape.test.ts:83-95`** — *"JSON.stringify omits
   undefined new fields"*. Strong assertion: explicitly checks
   `out.includes('"to"') === false` etc. This is the load-bearing
   serialization-gate test. Quality: HIGH.

2. **`gmail-sent-cache.test.ts:195-218`** — *"rejects v1 cache (no
   version field) with reason:wrong-version"*. Synthesizes a v1
   envelope without the `version` field, asserts both `reason` and
   that the message contains `"missing (likely v1)"`. Specific +
   contract-bound. Quality: HIGH.

3. **`gmail-fetchsent.test.ts:459-476`** — *"builds the right query"*.
   Asserts exact query string `'in:sent after:2026/05/15 subject:roadmap'`
   passed to the list call. Pins the YYYY-MM-DD → YYYY/MM/DD
   conversion. Quality: HIGH.

4. **`gmail-fetchsent.test.ts:420-444`** — *"rate-limit (429) on first
   list call → retries → succeeds"*. Uses production `setTimeout` (no
   sleep injection) — adds ~250 ms latency to the test but verifies
   the *real* retry path. Slight smell (could have injected
   `sleep: async () => {}`), but the asserted invariant (≥2 list-call
   attempts) is correct. Quality: MEDIUM-HIGH.

5. **`pull-gmail-sent.test.ts:375-424`** — *"errors clearly when
   provider does not implement fetchSent"*. Stubs `process.exit`,
   captures console, asserts exit code 1 + error message contains
   `"does not implement fetchSent"`. The stub-and-rethrow pattern is
   idiomatic for node:test. Quality: HIGH.

Overall test quality: **HIGH**. Mocks isolate cleanly, assertions are
specific and not over-coupled to internals, edge cases (empty list,
malformed JSON, future-version cache, missing fetchSent) all covered.

---

## Concerns

### HIGH

*None.*

### LOW

**LOW-1 — Plan/code drift on `cacheVersion` placement**

The Phase 11 v3 plan §F4 (line 26) says:
> *"Cache file format versioned: `cacheVersion: 2` field on `EmailThread`"*

The actual implementation uses TWO version markers:
- `GmailSentCache.version: 2` — envelope-level (this is what
  `readGmailSentCache` actually gates on)
- `EmailThread.cacheVersion?: number` — per-thread, set by
  `mapSentMessage` to `2`, but **never read by any validator**

The envelope `version` is the correct architectural choice (per-thread
versioning is pointless — they're written/read together). But
`EmailThread.cacheVersion` is now a vestigial field. Either:
- (a) Remove `EmailThread.cacheVersion` (more honest), OR
- (b) Add a test that explicitly validates per-thread cacheVersion is
      `2` after read (currently only checked in mapSentMessage output)

Recommendation: defer to Phase 11a — when the resolution pipeline reads
threads from the cache, decide whether it needs per-thread
versioning. If not, drop the field. Not blocking.

**LOW-2 — Reader doesn't auto-delete on invalidation**

Build report (line 36) says the reader *"deletes invalidated cache +
signals refetch needed"*. The actual implementation signals via
`{ok: false, reason: 'wrong-version'}` and **leaves the file in place**;
the caller is expected to call `deleteGmailSentCache` separately. The
"refetch flow" test (cache-test.ts:304-333) does this explicitly.

This is fine architecturally (reader stays pure, caller controls FS
mutations) — but the build report claim overstates what the reader does.
Suggest tightening the build report wording in any retro doc, OR
have `readGmailSentCache` call `deleteGmailSentCache` internally on
`wrong-version` (the API surface implies it). Not blocking — pull.ts
always overwrites on write, so the stale file is harmless.

**LOW-3 — `fetchBody=false` still emits to/cc/bcc/sentAt on the cache**

Plan F4 (line 26) says: *"new fields excluded from JSON output when
fetchBody=false"*. The actual code (gmail.ts:224-232) emits
`to/cc/bcc/attachments/sentAt/cacheVersion` regardless — only `body` is
conditionally added.

This is the **right behavior** (recipient pre-index needs to/cc/bcc;
sentAt is needed for temporal matching), so the plan text is the wrong
spec, not the code. Recommend: amend the plan v4 (or retro doc) to
clarify that *"body excluded when fetchBody=false; recipient/timing
fields always present"*. Not blocking.

---

## Cross-cutting checks

| Check | Status |
|-------|--------|
| 72 new tests pass | YES (verified via tsx --test) |
| 41 pre-existing tests still pass | YES (10+4+27) |
| Aggregate 113 tests pass / 0 fail | YES (matches build report) |
| Dist rebuilt (gmail-sent-cache.{d.ts,js}, pull.{d.ts,js}, types.{d.ts,js}) | YES (mtimes match commit times) |
| Typecheck clean (`tsc --noEmit -p packages/core`) | YES (no output) |
| Typecheck clean (`tsc --noEmit -p packages/cli`) | YES (no output) |
| Co-Authored-By footer on all 7 commits | YES (10 occurrences total) |
| Naming convention `phase-11-pre(scope):` | YES (all 7 follow it) |
| 11-pre commits don't touch 10b-min files | YES (zero overlap on `services/meeting-extraction.ts`, `services/commitment-dedup-pipeline.ts`, `services/commitments.ts`) |
| Process note re interleaved `7e1c397b` 10b-min commit | YES (transparency commendable) |
| Audit doc + soak doc committed at canonical paths | YES |

---

## Architectural observations (non-blocking)

1. **`__testing__` named export**. Good pattern for unit testing
   pure helpers (`decodeBase64Url`, `extractBody`, `parseAddressList`,
   `withRateLimitRetry`). Clearly labeled as such — won't be mistaken
   for public API. Continue this pattern in 11a.

2. **`parseAddressList` comma-split caveat**. Code comment honestly
   notes: *"Naive comma-split — does NOT handle quoted commas inside
   display names (rare in practice)."* Acceptable for soak; flag for
   11a if a real-world Sent message trips it. Consider `email-addresses`
   npm if soak surfaces issues.

3. **Rate-limit retry uses real timers in one test**. The
   "429 → retry" test (line 420) doesn't inject `sleep`, so it eats
   ~250 ms of wall-clock. Acceptable as a single slow test; the four
   `withRateLimitRetry` unit tests below it DO inject `sleep`, which
   is the right pattern.

4. **`pull.ts` Sent code path doesn't read the cache first**. Always
   overwrites. This is correct for now (Phase 11a will add read+merge
   semantics). Worth noting for the 11a planning discussion.

---

## Recommendation

**APPROVE WITH MINOR — proceed to 1-day soak.**

Phase 11-pre is well-scoped, well-tested, and architecturally sound.
The three LOW findings are documentation drift, not functional bugs —
they'd surface in a v4 plan revision or a retro doc, not a fixup commit.

After the 1-day soak (per `phase-11-pre-soak-checklist.md`), Phase 11a
is unblocked.
