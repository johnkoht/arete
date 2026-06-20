# 🚢 Ship Complete: wiki-leaning-meeting-extraction

**Status**: ✅ 10/10 code tasks + T6 follow-up + 4.2 follow-ups — ready for T11 manual gate + merge
**Branch**: `worktree-wiki-leaning-extraction` (worktree at `.claude/worktrees/wiki-leaning-extraction`)
**Base**: `main` at `e9bb3361` (which already includes plan + PRD artifacts)

| Metric | Value |
|--------|-------|
| Phases Completed | 0–4 + 5.1–5.5 (5.6 merge interactive) |
| Code tasks | 10/10 (T1–T10) |
| Manual gate | T11 (5-meeting A/B) — your call |
| Quality gates | typecheck ✓ ; all touched test suites ✓ |
| Pre-mortem | 7/9 risks retired pre-merge; R2 + R3 retire on T11 |
| Commits | 12 |
| Tests added | ~80 |
| LOC added | ~3.5k across 17 files |
| Reviewer dispatches | ~14 (2 transient API 500s mitigated by Phase 4.2 review) |

## Deliverables

- **Wiki-aware extraction**: when topics are detected on a transcript, `MeetingContextBundle.topicWikiContext` is populated with topic-page sections + topic-tagged L2 items. Extraction prompt injects them as "already known to the reader" with a verbatim delta-only directive (5 DELTA rules + 4 do-NOT-emit rules + "When in doubt, INCLUDE" tiebreaker + one-shot CONFIRMATION-of-uncertainty example).
- **Recap reshape**: `## Core` (free-form, principle-based) + `## Could include` (prioritized one-line headlines, capped 8). `## Summary` retained for backward compat — both headings parse permanently.
- **L2 topic tags**: `learnings.md` / `decisions.md` entries gain `**Topics**: slug-a, slug-b` bullet. New `getMemoryItemsForTopics(paths, slugs, opts)` helper for per-topic queries.
- **Token budget guard**: `MAX_TOPIC_WIKI_CONTEXT_CHARS = 6000` with tiered truncation (oldest L2 → halve longest section on `\n` → drop lowest-scored topic; highest-scored never dropped).
- **Frontmatter sanitizer**: `stripYamlDocSeparator` strips line-start `---` from `core` + `could_include[]` (R7 mitigation; strip-and-warn pattern, deliberately diverged from topic-memory's drop-on-detect).
- **CLI tuning lever**: `arete meeting extract --dry-run-topics` runs detection only, prints score + matched tokens + last_refreshed for each detected slug; supports `--json`. Used to tune thresholds against real meetings before A/B.
- **Two latent bugs fixed**:
  - L2 parser/writer mismatch (writer emitted `## Title`, parser only matched `### Title`). Parser now matches all three header shapes via single-pass classifier with priority + code-fence tracking.
  - Backend missing `activeTopicSlugs` (CLI passed it, backend didn't). Backend now mirrors CLI's assembly via `loadMemorySummary` + `renderActiveTopicsAsSlugList`.

## Pre-Mortem Review

| # | Risk | Severity | Materialized | Effective |
|---|------|----------|--------------|-----------|
| R1 | Parser regex over/double-match | HIGH | No | Yes — single-pass classifier + code-fence tracking; LEARNINGS entry |
| R2 | Lexical detection precision | HIGH | TBD on T11 | Stop-tokens + ≥2 non-stop + ≥0.5 coverage + cap=3; dry-run flag for tuning |
| R3 | LLM over-suppression | HIGHEST | TBD on T11 | Verbatim directive + "When in doubt INCLUDE" + CONFIRMATION example; literal `.includes()` test guards |
| R4 | Token budget overflow | MEDIUM | No | 6000-char budget + 3-tier truncation + highest-scored protection |
| R5 | MeetingContextDeps callsite drift | MEDIUM | No | 8-site sweep; typecheck verified clean |
| R6 | `## Summary` rename truncates | HIGH | Caught in pre-work | Yes — `summary` retained; dual-anchor regex at 4 parsers; manual-grep evidence |
| R7 | Frontmatter injection via core/could_include | MEDIUM | No | `stripYamlDocSeparator` strip-and-warn |
| R8 | Single-PR scope risks bisectability | MEDIUM | No | 12 commits along Thread A/B/C boundaries |
| R9 | Backend activeTopicSlugs fixture drift | LOW | No | Backend tests don't inject topicMemory; 0 fixture diffs |

## What's left for you

### 1. T11 — 5-meeting A/B validation (the merge gate)

This is the only remaining task and is by-design manual. Run extraction on **5 historical meetings with diverse topic coverage** in two modes:
- **Control**: current `main` (no `topicWikiContext`)
- **Treatment**: `worktree-wiki-leaning-extraction` (this branch)

Compare item counts (action items, decisions, learnings, open questions) per meeting. Acceptance per AC:
- Treatment ≤ Control on most meetings (deltas-only is the goal)
- No meeting where Treatment loses an item that Control captured AND that the wiki didn't already record (manually inspect 1–2 borderline cases)
- No fabricated items in Treatment that Control didn't surface

**Suggested workflow**:
1. Pick 5 meetings — mix of fresh-topic (no wiki page yet) + wiki-resident-topic. Note their slugs.
2. From `main`: `arete meeting extract <slug> --json --stage` → save Control output per meeting.
3. Switch to worktree, repeat: `arete meeting extract <slug> --json --stage` → Treatment output.
4. Diff the two. Note: with no wiki context (fresh topic), Treatment should match Control. With wiki context, Treatment should produce fewer items (deltas only).
5. Save the comparison + your verdict to `dev/work/plans/wiki-leaning-meeting-extraction/ab-results.md` (uncommitted).

The `--dry-run-topics` flag is useful before each Treatment extraction to confirm what topics will be injected.

### 2. Merge

Once T11 verdict is positive:
- Review the diff: `git log main...worktree-wiki-leaning-extraction --oneline`, `git diff main...worktree-wiki-leaning-extraction --stat`
- Create PR: `gh pr create --title "feat: wiki-leaning meeting extraction" --body-file dev/work/plans/wiki-leaning-meeting-extraction/ship-report.md`
  - Or merge locally if your convention permits.
- After merge: `/ship cleanup wiki-leaning-meeting-extraction` to remove the worktree + branch.

## Carryover items (not blocking)

- **Refactor backlog** filed: `dev/work/plans/refactor-extract-topic-wiki-context-step/plan.md` — extract Step 7 from `meeting-context.ts:978-1025` into a standalone helper for testability and easier swap-in of LLM-based detection. Tiny.
- **Pre-existing backend agent.test.ts failures** (3 tests: dedup precedence, boundary 0.5 confidence, auto-approves matching priorItems) — confirmed pre-existing on `main`, NOT introduced by this branch. Worth a separate investigation; orthogonal to wiki-leaning work.
- **Optional LEARNINGS entry on CLI/backend extraction parameter parity** (T10 reviewer suggestion). Inline comment at `agent.ts:218-227` references the CLI mirror. Defer until a third extraction parameter divergence appears.

## Recommendations (for future PRDs)

**Continue**:
- Pre-work review with explicit "verify line numbers via grep before edit" — caught real ambiguities/blockers in T3 (TopicIdentity gap), T5 (callsite sweep), T6 (heading semantics), T8 (dual STAGED_HEADERS sets).
- Verbatim text + literal `.includes()` assertions for prompt-engineering work.
- Dark-code audit as discrete post-merge check separate from test coverage. (10 new exports, 0 dark.)
- Plan-level Decisions log; reviewers cite "Decision #N" rather than re-deriving rationale.

**Stop**:
- Long reviewer dispatches (28+ min) without checkpointing — when API 500s, work is lost. Prefer two short reviewers over one long one for high-blast-radius tasks.
- Trusting full-file `--test` runs via background bash on large Node TAP test files (meeting-extraction.test.ts is the canonical offender — use `stdbuf` + `--test-reporter=spec` + `--test-name-pattern`).

**Start**:
- File refactor backlog items eagerly during reviews (filed `refactor-extract-topic-wiki-context-step` here).
- For tasks with bash-tool-suspect tests, hand the developer the explicit test-runner incantation in the prompt.
- When a test fails because the ALGORITHM is right but the TEST is wrong (Tier 3 budget, CONFIRMATION quote-style), fix the test and write the diagnosis in the commit body.

## Documentation Updates

- ✅ `.agents/sources/shared/cli-commands.md` — `--dry-run-topics` documented under `arete meeting extract`.
- ✅ `packages/core/src/services/LEARNINGS.md` — parser priority order + code-fence tracking invariant (commit `2fe2fd7a`).
- ✅ `memory/entries/2026-04-29_wiki-leaning-meeting-extraction-learnings.md` — full retrospective.
- ✅ `memory/MEMORY.md` — index line at top.

## Files Touched (17 source + tests + dist)

**Core**:
- `packages/core/src/services/meeting-extraction.ts` — biggest change: TopicWikiContext type, 4 new helpers, MAX_TOPIC_WIKI_CONTEXT_CHARS, delta directive, core/could_include parsing, sanitizer, dual-anchor in updateMeetingContent
- `packages/core/src/services/meeting-context.ts` — Step 7 wiki-context enrichment + topicMemory dep
- `packages/core/src/services/meeting-processing.ts` — formatFilteredStagedSections accepts core/couldInclude
- `packages/core/src/services/meeting-apply.ts` — STAGED_HEADERS lowercase set
- `packages/core/src/services/topic-detection.ts` — **new** lexical pre-pass + detailed variant
- `packages/core/src/services/topic-memory.ts` — TopicIdentity.lastRefreshed + toIdentities populates
- `packages/core/src/services/memory.ts` — single-pass classifier + getMemoryItemsForTopics
- `packages/core/src/services/patterns.ts` — extractTopicsFromContent dual-anchor regex
- `packages/core/src/integrations/staged-items.ts` — MeetingMetadata.topics + writer emits **Topics** bullet
- `packages/core/src/models/topic-page.ts` — renderForExtractionContext helper
- `packages/core/src/models/memory.ts` — MemoryEntry/MemoryResult.topics?

**CLI/Backend**:
- `packages/cli/src/commands/meeting.ts` — `--dry-run-topics` flag + formatter callsite
- `packages/apps/backend/src/services/agent.ts` — activeTopicSlugs assembly + formatter callsite
- `packages/apps/backend/src/routes/intelligence.ts` — extractCompletionText dual-anchor
- `packages/apps/backend/src/services/workspace.ts` — extractSummary dual-anchor

**Tests** (all green at HEAD):
- `packages/core/test/services/meeting-extraction.test.ts` — +50 tests
- `packages/core/test/services/meeting-context.test.ts` — +5 tests
- `packages/core/test/services/topic-detection.test.ts` — +24 tests (new file)
- `packages/core/test/services/memory.test.ts` — +19 tests
- `packages/core/test/services/patterns.test.ts` — +2 tests
- `packages/core/test/services/meeting-apply.test.ts` — +1 test
- `packages/core/test/services/meeting-processing.test.ts` — +5 tests
- `packages/core/test/integrations/staged-items.test.ts` — +5 tests
- `packages/core/test/models/topic-page.test.ts` — +11 tests
- `packages/cli/test/commands/meeting-extract.test.ts` — +5 tests
- `packages/apps/backend/test/services/agent.test.ts` — +2 tests
