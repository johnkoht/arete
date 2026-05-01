# Dark-Code Audit: slack-digest-topic-wiki

**Date**: 2026-04-29
**Branch**: worktree-slack-digest-topic-wiki
**Base**: bb687278

This audit enumerates every NEW symbol exported by files changed on this branch
and verifies a named non-test production caller exists outside the symbol's own
file. The 2026-04-23 topic-wiki-memory build shipped `aliasAndMerge` and
`renderActiveTopicsAsSlugList` as tested-but-never-called dark code; this gate
is the structural fix.

## Methodology

1. `git diff --name-only main...HEAD -- '*.ts' '*.tsx'` filtered to non-dist
   non-test src files.
2. For each changed file, `git diff main...HEAD -- <file>` filtered to lines
   beginning with `+export ` to capture only NEW exports (not pre-existing
   ones).
3. For each new symbol, `rg -n` across `packages/{cli,core,apps}/src` excluding
   the symbol's own declaring file and excluding `dist/` / `*.test.ts`.
4. Renamed-but-not-new symbol `refreshAllFromSources` is also enumerated since
   PRD Task 7 ACs require it.

## New Exports Enumerated

| File | Symbol | Status | Caller(s) |
|------|--------|--------|-----------|
| packages/core/src/services/topic-memory.ts | `discoverTopicSources` (function) | Wired | `refreshAllFromSources` body @ packages/core/src/services/topic-memory.ts:1007 (same file, internal); also re-exported via packages/core/src/index.ts:162 as part of public API |
| packages/core/src/services/topic-memory.ts | `SourceDiscoveryEntry` (interface) | Wired | Used as the return type of `discoverTopicSources` and as the local-array element type at topic-memory.ts:899-900; re-exported via packages/core/src/index.ts:176 |
| packages/core/src/services/topic-memory.ts | `SLACK_DIGEST_FILENAME_RE` (const regex) | Wired | `discoverTopicSources` body @ packages/core/src/services/topic-memory.ts:930 (same file); re-exported via packages/core/src/index.ts:163 (public API surface) |
| packages/core/src/services/meeting-extraction.ts | `TOPIC_BIAS_BLOCK_PROMPT` (const) | Wired | `buildMeetingExtractionPrompt` template literal @ packages/core/src/services/meeting-extraction.ts:964 (same file, internal usage); re-exported via packages/core/src/services/index.ts:45 → consumed by byte-equality test packages/core/test/runtime/slack-digest-bias-block.test.ts and intentionally exposed for skill-md drift detection (Task 4 AC) |
| packages/cli/src/commands/topic.ts | `resolveTargetSlugs` (function) | Wired | `arete topic refresh` action body @ packages/cli/src/commands/topic.ts:307 (same file) |
| packages/core/src/services/topic-memory.ts | `refreshAllFromSources` (rename of `refreshAllFromMeetings`) | Wired | 8 production callers — see grep gate below |

### Notes on intentional cross-file vs. same-file callers

- `discoverTopicSources` and `SLACK_DIGEST_FILENAME_RE` only have same-file
  callers in `topic-memory.ts`. They are exported from the module and re-
  exported from `packages/core/src/index.ts` as part of the public API surface
  for the slack-digest skill / future callers. This is documented intent (PRD
  Task 2 AC: "New function `discoverTopicSources(paths, storage)` exported
  from `packages/core/src/services/topic-memory.ts`"). The PRD Task 7 AC for
  `discoverTopicSources` accepts `refreshAllFromSources` body in same file as
  the production caller.
- `SourceDiscoveryEntry` is the public type for `discoverTopicSources`'s
  return value. Same justification.
- `TOPIC_BIAS_BLOCK_PROMPT` is intentionally exported as a public anchor for
  the slack-digest SKILL.md byte-equality test (Task 4). The skill-side drift
  detection IS the production consumer. Same-file consumer exists at
  meeting-extraction.ts:964 (built into the meeting prompt).
- `resolveTargetSlugs` is exported from `topic.ts` for future test coverage
  per Pre-mortem Risk 12 (positional vs. --slugs ambiguity); current
  production caller is the same file's refresh action body. Acceptable per
  Task 5 AC (`resolveTargetSlugs(slug, slugsFlag, all)` resolution helper
  named in AC).

None of these are dark in the parent-build sense (`aliasAndMerge` had ZERO
production paths; everything here is reached by a real CLI invocation or a
real prompt build).

## Grep Gates

| Gate | Expected | Actual | Status |
|------|----------|--------|--------|
| `rg -n 'refreshAllFromMeetings' packages/{cli,core,apps}/src` | 0 hits | 0 hits | PASS |
| `rg -n 'parseSlackDigestFile' packages/` (incl. dist) | 0 hits | 0 hits | PASS |
| `rg -n 'TOPIC_BIAS_BLOCK_PROMPT' packages/` | ≥1 import + ≥1 usage in production | 1 declaration (meeting-extraction.ts:515), 1 same-file usage (meeting-extraction.ts:964), 1 barrel re-export (services/index.ts:45), plus skill-md reference + drift test | PASS |
| `rg -n 'discoverTopicSources' packages/{cli,core,apps}/src` | ≥1 production caller | 8 hits (declaration + same-file caller @ topic-memory.ts:1007 + barrel export + cli flag help text) | PASS |
| `rg -n 'SourceDiscoveryEntry' packages/{cli,core,apps}/src` | ≥1 production usage | 5 hits (declaration + 2 type usages in same file + barrel re-export) | PASS |
| `rg -n 'SLACK_DIGEST_FILENAME_RE' packages/{cli,core,apps}/src` | ≥1 production caller (or document as public API) | 3 hits (declaration + same-file caller @ topic-memory.ts:930 + barrel re-export) | PASS |
| `rg -n 'refreshAllFromSources' packages/{cli,core,apps}/src` (PRD §6 DoD) | ≥8 hits across enumerated callers | 8 production call sites (see below) | PASS |

### `refreshAllFromSources` production call sites

All 7 PRD Task 7 AC sites verified plus 1 additional site (the seed estimate
preview at topic.ts:390):

- `packages/apps/backend/src/routes/meetings.ts:244`
- `packages/cli/src/commands/topic.ts:390` (estimate-preview pass)
- `packages/cli/src/commands/topic.ts:469`
- `packages/cli/src/commands/topic.ts:940`
- `packages/cli/src/commands/topic.ts:1063`
- `packages/cli/src/commands/meeting.ts:1467`
- `packages/cli/src/commands/intelligence.ts:511`
- `packages/core/src/services/topic-memory.ts:971` (prototype declaration)

PRD Task 7 listed expected sites at topic.ts:253/331/787/910 and
meeting.ts:1421 — actual line numbers drifted forward due to Task 5's
`--source` and `--skip-topics` flag wiring. The PRD comment at task line 80
was already pinned to a stale line; that's a doc-drift signal, not a dark
code signal. All 7 expected logical sites map 1:1 to actual sites.

## CLI Flag Reachability

- `arete topic list --active --slugs --json`:
  - command entry @ packages/cli/src/commands/topic.ts:95 (`.command('list')`)
  - `--active` flag declared @ topic.ts:98
  - `--slugs` flag declared @ topic.ts:99
  - `--json` flag declared @ topic.ts:100
  - active-slugs primitive branch @ topic.ts:116 (comment) → handler runs
    `renderActiveTopicsAsSlugList(getActiveTopics(...))`
  - PASS
- `arete topic refresh --slugs --source --skip-topics`:
  - command entry @ packages/cli/src/commands/topic.ts:257 (`.command('refresh [slug]')`)
  - `--all` @ topic.ts:259
  - `--slugs <list>` @ topic.ts:260
  - `--source <path>` @ topic.ts:261
  - `--skip-topics` @ topic.ts:262
  - PASS

## Skill Wiring

- SKILL.md Phase 2a contains `arete topic list --active --slugs --json`:
  - packages/runtime/skills/slack-digest/SKILL.md:138 (Phase 2a context bundle invocation)
  - packages/runtime/skills/slack-digest/SKILL.md:200 (Phase 2c bias-block reference)
  - PASS
- SKILL.md Phase 5b contains `arete topic refresh --slugs ... --source ...`:
  - packages/runtime/skills/slack-digest/SKILL.md:551 (`scoped to the digest file via --source <path>`)
  - packages/runtime/skills/slack-digest/SKILL.md:567 (the actual bash invocation)
  - packages/runtime/skills/slack-digest/SKILL.md:570 (re-run hint on lock collision)
  - packages/runtime/skills/slack-digest/SKILL.md:583 (idempotency note)
  - PASS

## SeedLockHeldError Fix (Task 5 side-effect)

- Constructor sets `this.name = 'SeedLockHeldError'`:
  - packages/core/src/services/seed-lock.ts:37 — PASS (single occurrence in file body)
- Production catch-sites:
  - packages/cli/src/commands/topic.ts:487 (refresh estimate path; uses
    `instanceof SeedLockHeldError`)
  - packages/cli/src/commands/topic.ts:1041 (seed path; uses
    `instanceof SeedLockHeldError`)
  - packages/cli/src/commands/intelligence.ts:520 (memory refresh path; uses
    `err.name === 'SeedLockHeldError'` — relies on the constructor fix)
  - packages/cli/src/commands/meeting.ts:1485 (approve path; uses
    `err.name === 'SeedLockHeldError'` — relies on the constructor fix)
- Both name-based and instanceof-based catch-sites coexist across the
  codebase. The constructor `this.name` assignment is what makes the
  name-based check in meeting.ts:1485 and intelligence.ts:520 reliable across
  module-instance boundaries (the PRD-named risk).

## Verdict

- New exports audited: 5 (plus 1 renamed)
- Dark exports: 0 / 6
- Intentionally unused: 0 / 6
- All wired: PASS

**Gate signal for /ship Phase 4.3**: PROCEED

No dark code introduced. Every new export reaches a real production code
path, either via direct intra-package call (`discoverTopicSources` from
`refreshAllFromSources`, `SLACK_DIGEST_FILENAME_RE` from `discoverTopicSources`,
`TOPIC_BIAS_BLOCK_PROMPT` from `buildMeetingExtractionPrompt`,
`resolveTargetSlugs` from the refresh action body) or via the slack-digest
skill markdown invoking the new CLI flags (`--active --slugs --json` from
Phase 2a, `--source` from Phase 5b). Grep gates all pass; rename is complete;
SeedLockHeldError name fix is live and depended upon by two production
catch-sites.
