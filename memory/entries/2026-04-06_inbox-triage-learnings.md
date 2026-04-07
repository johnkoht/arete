# Inbox Triage — Learnings

**Date**: 2026-04-06
**Slug**: inbox-triage
**Steps**: 4/4

---

## Metrics

- Steps executed: 4/4
- Eng lead reviews: 1 (full code review)
- Real issues caught by review: 5 (2 blockers, 3 improvements)
- False positives: 0
- Commits: 2 (feat + review fixes)
- Files created: 4 new (inbox.ts, inbox-count.ts, inbox.test.ts, SKILL.md)
- Files modified: 14

---

## Pre-Mortem Effectiveness

| Risk | Materialized? | Mitigation effective? |
|------|-------------|----------------------|
| Binary copy ENOENT on pre-upgrade workspaces | Yes — `copyFileSync` fails if inbox/ missing | Fixed: `mkdirSync(inboxDir, { recursive: true })` before copy |
| Mode validation gap (--url --file --title) | Yes — 3 modes slipped through | Fixed: tightened to `modes.length === 2 && !opts.file` |
| Missing --url tests | Partial — no tests existed | Fixed: 2 tests using runInboxAdd with mock fetchFn |
| showInboxTip only on 2 of 6 pull branches | Yes — calendar/notion/gmail/drive missed | Fixed: added to all 6 integration branches |
| DRY violation in inbox counting | Yes — inline impl in both status.ts and pull.ts | Fixed: extracted to shared `lib/inbox-count.ts` |

---

## Key Decisions

1. **DI via InboxAddDeps interface** — Exported `runInboxAdd(opts, deps)` with injectable `fetchFn`, `readFileSync`, `copyFileSync`, `existsSync`. Enables mock-based URL tests without HTTP servers (learned from Notion test hang issue in LEARNINGS.md).

2. **Shared `countInboxItems()` helper** — Extracted from inline implementations in both status.ts and pull.ts to `packages/cli/src/lib/inbox-count.ts`. Parses frontmatter status from .md files, counts unprocessed/needs-review/triaged.

3. **`inputs/onboarding-dump/` → `inbox/` migration** — Replaced the single-purpose dump directory with the general-purpose inbox. All references updated (rapid-context-dump skill, context-dump-quality util, getting-started skill).

4. **QMD scope coordination** — Adding `inbox` as 11th scope required coordinated changes across 4 files: `QmdScope` type union, `SCOPE_PATHS`, `ALL_SCOPES`, `VALID_SCOPES`. Test assertions for scope counts updated (10→11).

---

## Learnings

- **`captureConsole` + direct function call beats subprocess for async tests.** URL mode tests call `runInboxAdd()` directly with mock deps and capture stdout, avoiding the need to spawn subprocesses or mock HTTP servers. This is the same pattern as Notion integration tests.

- **Mode validation combinatorics need explicit enumeration.** The initial `modes.includes('url') && modes.includes('text')` check was correct for 2-mode combos but let 3-mode combos through. Explicit `modes.length === 2` guard is required.

- **`mkdirSync({ recursive: true })` is always needed before file writes to new directories.** Even though `inbox/` is in `BASE_WORKSPACE_DIRS`, pre-upgrade workspaces won't have it. Binary file copy was the first code path to hit this because text mode uses `services.storage.write()` which handles directory creation internally.
