# Phase 11-pre — `EmailThread` Inbound Caller Audit

**Phase**: 11-pre (F4 — pre-mortem mitigation)
**AC**: AC1 — "Inbound caller audit committed to build report."
**Date**: 2026-06-01
**Author**: Claude Opus 4.7 (1M context)

---

## Scope

This audit enumerates every project consumer of `EmailThread` (and the
`EmailProvider.searchThreads / getThread / getImportantUnread` outputs)
and verifies that the Phase 11-pre type extension (`to/cc/bcc/body/
attachments/sentAt/cacheVersion`, all OPTIONAL) does not break any of
them.

**Scope filter**: `packages/` source files (`src/`), excluding `dist/`,
`test/`, and `node_modules/`.

## Methodology

1. `grep -rn "EmailThread" packages/ --include="*.ts" | grep -v /dist/ | grep -v node_modules`
2. `grep -rn "thread\.\(id\|subject\|from\|date\|snippet\|labels\|unread\|to\|cc\|bcc\|body\|attachments\|sentAt\|cacheVersion\)" packages/ ...`
3. Search for `Object.keys(thread)` / `for (... in thread)` iteration
   patterns (the only failure mode where new fields silently break things).
4. Search prompt templates / LLM-input code that might serialize
   `EmailThread` as a string.

## Findings

### Production consumers (3)

| # | File | Lines | Fields read | Risk | Status |
|---|------|-------|-------------|------|--------|
| 1 | `packages/core/src/services/intelligence.ts` | 597-619 | `thread.id`, `thread.subject`, `thread.from`, `thread.date` | NONE — only base fields, hardcoded list | **safe** |
| 2 | `packages/cli/src/commands/pull.ts` | 798-800 (pre-11-pre); plus new 11-pre code at 759 | `thread.subject`, `thread.from`, `thread.date`, `thread.snippet` | NONE — only base fields | **safe** (own change) |
| 3 | `packages/core/src/integrations/gws/gmail.ts` | (provider impl) | All — produces threads | N/A — provider itself | **owns the shape** |

### New 11-pre code (covered by Phase 11-pre tests)

| # | File | Lines | Notes |
|---|------|-------|-------|
| 4 | `packages/core/src/integrations/gws/gmail-sent-cache.ts` | 1-209 | Reader/writer for the new cache. Tested in `gmail-sent-cache.test.ts` (18 tests). |
| 5 | `packages/cli/src/commands/pull.ts:759` | (Sent helper) | Calls `provider.fetchSent`, writes v2 cache. Tested in `pull-gmail-sent.test.ts` (8 tests). |

### Tests (5 files, not safety-critical for prod but verified)

- `packages/core/test/integrations/gws/gmail.test.ts` — pre-existing; uses the BASE shape only. Passes unchanged.
- `packages/core/test/services/intelligence-email.test.ts` — pre-existing; uses BASE shape only. Passes unchanged.
- `packages/core/test/integrations/gws/email-thread-shape.test.ts` — NEW (16 tests) — snapshot tests pre AND post-extension. Both shapes pass.
- `packages/core/test/integrations/gws/gmail-sent-cache.test.ts` — NEW (18 tests).
- `packages/core/test/integrations/gws/gmail-fetchsent.test.ts` — NEW (30 tests).
- `packages/cli/test/commands/pull-gmail-sent.test.ts` — NEW (8 tests).

### Object.keys / for-in iteration (0)

`grep -rn "Object\.keys.*thread\|for.*in thread"` against project sources
returns **no matches**. New fields will not appear in unexpected places.

### Prompt-template surface area (0 production consumers)

`grep -rn "EmailThread" packages/core/src/ | grep -i "prompt\|template\|llm"`
returns matches only in `gmail-sent-cache.ts` and `gmail.ts` — the
provider + cache code themselves. **No LLM prompt template currently
serializes `EmailThread`.**

Phase 11a will introduce the auto-resolve prompt (`external_resolution`
task) which DOES consume `to/cc/body/attachments/sentAt` — but that's
11a-territory, deliberately new code, and will be tested in 11a.

## Conclusion

The `EmailThread` extension is **safe**.

- All 3 production consumers read only base fields (`id/subject/from/date/snippet`).
- No `Object.keys(thread)` iteration exists.
- No prompt templates consume `EmailThread`.
- Pre-extension JSON snapshot is byte-identical (verified by `email-thread-shape.test.ts`).
- Post-extension JSON emits new fields only when populated (serialization gate
  via TS optionals + `JSON.stringify` omitting `undefined`).

## Verification commands

```bash
# 1. Enumerate all EmailThread refs in src (excludes dist/test/node_modules).
grep -rn "EmailThread" packages/ --include="*.ts" \
  | grep -v /dist/ | grep -v /test/ | grep -v node_modules

# 2. Enumerate field reads.
grep -rn "thread\.\(id\|subject\|from\|date\|snippet\|labels\|unread\|to\|cc\|bcc\|body\|attachments\|sentAt\|cacheVersion\)" \
  packages/ --include="*.ts" | grep -v /dist/ | grep -v /test/ | grep -v node_modules

# 3. Confirm no Object.keys iteration.
grep -rn "Object\.keys.*thread\|for.*in thread" \
  packages/ --include="*.ts" | grep -v /dist/ | grep -v node_modules

# 4. Run all touched test suites.
./node_modules/.bin/tsx --test \
  packages/core/test/integrations/gws/email-thread-shape.test.ts \
  packages/core/test/integrations/gws/gmail.test.ts \
  packages/core/test/integrations/gws/gmail-sent-cache.test.ts \
  packages/core/test/integrations/gws/gmail-fetchsent.test.ts \
  packages/core/test/services/intelligence-email.test.ts \
  packages/cli/test/commands/pull-gmail-sent.test.ts \
  packages/cli/test/commands/pull.test.ts
```

## Annotated grep output (canonical)

```
packages/cli/src/commands/pull.ts:17:import type { ..., EmailThread } from '@arete/core';     (type-import, no reads)
packages/cli/src/commands/pull.ts:759:    const sentThreads: EmailThread[] = ...              (own 11-pre code)
packages/cli/src/commands/pull.ts:798: console.log(thread.subject, thread.from, thread.date)   (BASE fields only)
packages/cli/src/commands/pull.ts:799-800: if (thread.snippet) console.log(thread.snippet)     (BASE fields only)
packages/core/src/services/intelligence.ts:606-609: thread.id, thread.subject, thread.from, thread.date   (BASE fields only)
packages/core/src/integrations/gws/gmail.ts: (provider implementation — owns the shape)
packages/core/src/integrations/gws/gmail-sent-cache.ts: (new 11-pre code — owns the shape)
packages/core/src/integrations/gws/types.ts: (type definition — owns the shape)
packages/core/src/integrations/gws/index.ts: (barrel re-export)
packages/core/src/index.ts: (barrel re-export)
```

**Outcome**: PASS — 0 fixes required. The 1-day soak (AC1a) can begin
after Phase 11-pre merges.
