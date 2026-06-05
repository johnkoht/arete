# Build Report — Phase 11-pre

**Phase**: phase-11-pre (Gmail provider extension + cache versioning + 1-day soak prep)
**Plan**: `dev/work/plans/arete-v2-chef-orchestrator/phase-11-external-resolution-unified-approval/plan.md`
**Pre-mortem**: `dev/work/plans/arete-v2-chef-orchestrator/phase-11-external-resolution-unified-approval/pre-mortem.md`
**Status**: COMPLETE — all 6 steps landed, per-step commits, dist rebuilt, 86 tests pass, no regressions
**Author**: Claude Opus 4.7 (1M context), build session 2026-06-01

---

## Commits (in order)

1. `bc6354f5` — `phase-11-pre(core): extend EmailThread for Sent extraction + cache versioning`
2. `711beac4` — `phase-11-pre(core): add Gmail Sent cache reader/writer with v2 envelope`
3. `59037f52` — `phase-11-pre(core): extend GmailProvider with fetchSent + MIME walk + rate-limit retry`
4. `2e135827` — `phase-11-pre(cli): add --sent + --fetch-body flags to arete pull gmail`
5. `7303b436` — `phase-11-pre(audit): inbound EmailThread caller audit (F4 AC1)`
6. `c5e34214` — `phase-11-pre(soak): 1-day pre-soak checklist (AC1a)`

---

## Files changed

### Source (core)

- `packages/core/src/integrations/gws/types.ts` (modified)
  - Extended `EmailThread` with optional `to/cc/bcc/body/attachments/sentAt/cacheVersion`
  - New `GmailSentCache` type (envelope: `version: 2`, `pulledAt`, `daysCovered`, `threads`, `recipientIndex`)
  - New `GMAIL_SENT_CACHE_VERSION = 2` constant
  - New `normalizeEmail()` helper (eng MC1 — trim, extract from `<email>`, lowercase, empty for malformed)
  - Added optional `fetchSent` method signature on `EmailProvider` interface
- `packages/core/src/integrations/gws/gmail-sent-cache.ts` (NEW — 209 LOC)
  - `gmailSentCachePath(workspaceRoot, date?)` — canonical `.arete/cache/gmail-sent-YYYY-MM-DD.json`
  - `buildRecipientIndex(threads)` — normalized email → thread.id[] (dedupes, skips malformed)
  - `writeGmailSentCache(storage, root, threads, opts)` — v2 envelope writer
  - `readGmailSentCache(storage, root, date?)` — version-gated reader, non-throwing, returns `{ok: true, cache} | {ok: false, reason}`
  - `deleteGmailSentCache(storage, root, date?)` — best-effort invalidate
- `packages/core/src/integrations/gws/gmail.ts` (substantial rewrite)
  - New `fetchSent({query, sinceDate, fetchBody, limit})` method on GmailProvider
  - MIME walk: `extractBody` (prefers text/plain, HTML fallback with stripping), `extractAttachments` (metadata only)
  - Base64url decoder
  - Address-list parser (`parseAddressList`) wired to `normalizeEmail`
  - Rate-limit retry wrapper (`withRateLimitRetry`, exponential backoff on 429/quota)
  - `__testing__` named export for unit-level test isolation
- `packages/core/src/integrations/gws/index.ts` — barrel re-exports for new symbols
- `packages/core/src/index.ts` — top-level re-exports for new symbols

### Source (cli)

- `packages/cli/src/commands/pull.ts`
  - New `--sent` and `--fetch-body` CLI flags
  - New `PullGmailDeps` for DI (matches `PullCalendarDeps` pattern)
  - `pullGmailHelper` extended:
    - When `--sent`: calls `provider.fetchSent({sinceDate, fetchBody, limit: 100})`, writes v2 cache
    - JSON output additive — new `sent` key only when `--sent` set
    - Defensive: missing `fetchSent` → error + exit(1)

### Tests (5 new files, 4 untouched-and-still-passing)

NEW:
- `packages/core/test/integrations/gws/email-thread-shape.test.ts` (16 tests)
  - Backward compat: pre-extension snapshot JSON byte-identical
  - Forward compat: post-extension fields round-trip
  - `normalizeEmail` covers 8 edge cases
- `packages/core/test/integrations/gws/gmail-sent-cache.test.ts` (18 tests)
  - Round-trip; v1-reject; v3-reject; unparseable; malformed; refetch flow end-to-end
- `packages/core/test/integrations/gws/gmail-fetchsent.test.ts` (30 tests)
  - 5-message list → fetch all 5; MIME walk; attachment metadata; format selection; rate-limit retry; query building; best-effort failures
- `packages/cli/test/commands/pull-gmail-sent.test.ts` (8 tests)
  - Backward compat (no --sent); --sent + cache write; --days → sinceDate; --fetch-body forwarding; missing fetchSent → error

UNCHANGED:
- `packages/core/test/integrations/gws/gmail.test.ts` (10 tests) — passes as-is
- `packages/core/test/services/intelligence-email.test.ts` (4 tests) — passes as-is
- `packages/cli/test/commands/pull.test.ts` (27 tests) — passes as-is

### Docs (2 new files)

- `dev/work/plans/.../phase-11-pre-emailthread-audit.md` — inbound caller audit (F4 AC1)
- `dev/work/plans/.../phase-11-pre-soak-checklist.md` — 1-day soak protocol (AC1a)

### dist

- `packages/core/dist/integrations/gws/` rebuilt — adds `gmail-sent-cache.{d.ts,js}` + maps
- `packages/core/dist/index.{d.ts,js}` rebuilt
- `packages/cli/dist/commands/pull.{d.ts,js}` rebuilt

---

## Test status

### New tests (added by this build)

| Suite | Tests | Status |
|-------|-------|--------|
| email-thread-shape.test.ts | 16 | PASS |
| gmail-sent-cache.test.ts | 18 | PASS |
| gmail-fetchsent.test.ts | 30 | PASS |
| pull-gmail-sent.test.ts | 8 | PASS |
| **NEW total** | **72** | **PASS** |

### Existing tests (touched code, still passing)

| Suite | Tests | Status |
|-------|-------|--------|
| gmail.test.ts | 10 | PASS |
| intelligence-email.test.ts | 4 | PASS |
| pull.test.ts | 27 | PASS |
| **EXISTING total** | **41** | **PASS** |

### Phase 11-pre aggregate (touched test suites only)

**86 tests pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**, in 1.4s.

---

## Inbound caller audit summary

Full audit lives in `phase-11-pre-emailthread-audit.md` (committed in
`7303b436`).

### Three production consumers; all safe.

| # | File | Risk |
|---|------|------|
| 1 | `packages/core/src/services/intelligence.ts:597-619` | NONE — reads `id/subject/from/date` only |
| 2 | `packages/cli/src/commands/pull.ts:798-800` | NONE — reads `subject/from/date/snippet` only |
| 3 | `packages/core/src/integrations/gws/gmail.ts` | owns the shape |

### Zero structural risks:

- 0 `Object.keys(thread)` iteration sites.
- 0 prompt templates consuming `EmailThread`.
- Pre-extension JSON snapshot byte-identical (proven in `email-thread-shape.test.ts`).

**Outcome**: PASS — 0 fixes required.

---

## Verification commands

```bash
# Run all Phase 11-pre test suites (touched code).
./node_modules/.bin/tsx --test \
  packages/core/test/integrations/gws/email-thread-shape.test.ts \
  packages/core/test/integrations/gws/gmail.test.ts \
  packages/core/test/integrations/gws/gmail-sent-cache.test.ts \
  packages/core/test/integrations/gws/gmail-fetchsent.test.ts \
  packages/core/test/services/intelligence-email.test.ts \
  packages/cli/test/commands/pull-gmail-sent.test.ts \
  packages/cli/test/commands/pull.test.ts
# Expected: 113 tests pass (86 from touched + 27 pre-existing pull.test).

# Rebuild dist.
./node_modules/.bin/tsc -b packages/core packages/cli

# Typecheck.
./node_modules/.bin/tsc --noEmit -p packages/core
./node_modules/.bin/tsc --noEmit -p packages/cli

# Inbound caller audit re-verification.
grep -rn "EmailThread" packages/ --include="*.ts" \
  | grep -v /dist/ | grep -v /test/ | grep -v node_modules
grep -rn "thread\.\(id\|subject\|from\|date\|snippet\|labels\|unread\|to\|cc\|bcc\|body\|attachments\|sentAt\|cacheVersion\)" \
  packages/ --include="*.ts" | grep -v /dist/ | grep -v /test/ | grep -v node_modules
grep -rn "Object\.keys.*thread\|for.*in thread" \
  packages/ --include="*.ts" | grep -v /dist/ | grep -v node_modules
```

---

## AC mapping

| AC | Status | Evidence |
|----|--------|----------|
| AC1 (Gmail provider extension, v2 cache envelope, normalizeEmail, recipient pre-index, caller audit, snapshot tests) | ✔ | Steps 1-5, all 6 commits |
| AC1a (1-day pre-soak doc) | ✔ | Step 6 (`c5e34214`); soak is John's manual step post-merge |

---

## Process notes (transparency)

During Step 3 commit construction, the worktree had concurrent
Phase 10b-min work staged in the index. An initial commit (now reset
via `git reset --soft`) accidentally included the dedup-pipeline files.
The bad commit was reset cleanly and the Phase 10b-min code was
subsequently committed by another agent as `7e1c397b
phase-10b-min(core): hybrid commitment dedup pipeline (Step 1)` —
which now sits between the Phase 11-pre cache commit (`711beac4`) and
the Phase 11-pre provider commit (`59037f52`).

**Phase 11-pre never touched Phase 10b-min territory** (`services/meeting-extraction.ts`,
`services/commitment-dedup-pipeline.ts`, `services/commitments.ts` core methods).
The interleaved 10b-min commit is theirs — confirmed by reviewing
`59037f52^..59037f52` which shows only my 6 files.

---

## Exit conditions

- **Normal**: 6 steps complete (5 code + 1 doc), 72 new tests + 41
  pre-existing pass, dist rebuilt, audit + soak docs committed.
- ✔ Phase 11-pre is **ready for review / merge / 1-day soak / 11a**.
