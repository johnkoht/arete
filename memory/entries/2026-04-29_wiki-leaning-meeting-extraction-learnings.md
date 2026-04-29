# Wiki-leaning Meeting Extraction — Learnings

**Date**: 2026-04-29
**Branch**: worktree-wiki-leaning-extraction
**PRD**: dev/work/plans/wiki-leaning-meeting-extraction/{plan,prd,pre-mortem,review,final-review}.md
**Scope**: packages/core (5 services + 2 models touched, 1 new service), packages/cli (1 command + 1 new flag), packages/apps/backend (3 production parsers + agent service)

## What Changed

Made meeting extraction *lean on the topic-wiki* — when topics are detected on a transcript, the LLM sees the existing topic-page sections + topic-tagged L2 items as "already known," and only extracts deltas (new decisions, changed plans, new risks/questions). Recap reshaped from `## Summary` into `## Core` (free-form, principle-based — what's actionable/decided/changed) + `## Could include` (prioritized one-line headlines for side threads, capped at 8). L2 items (`learnings.md`, `decisions.md`) gain a `**Topics**:` bullet for precise per-topic queryability replacing fuzzy date-window heuristics.

Two latent bugs fixed as side effects:
- **L2 parser/writer mismatch**: writer emitted `## Title`, parser only matched `### Title`. Newly written learnings/decisions were unsearchable. Parser now matches all three header shapes (single-pass classifier with priority + code-fence tracking, R1).
- **Backend missing `activeTopicSlugs`**: CLI passed it; backend didn't. Slug-bias defense never fired on web path. Backend now mirrors CLI's assembly via `loadMemorySummary` + `renderActiveTopicsAsSlugList`.

User-visible: new CLI flag `arete meeting extract --dry-run-topics` for empirical detection-threshold tuning before A/B rollout.

## Metrics

- **Commits**: 12 (10 task feats + 1 LEARNINGS doc + 1 test-fix follow-up + 1 docs follow-up)
- **Tests added**: ~80 (24 topic-detection + 11 buildTopicWikiContext/truncation + 11 core/could_include sanitizer + 12 STAGED_HEADERS/formatters + 11 topic-page renderForExtractionContext + 9 memory parser + 5 staged-items writer + 5 CLI dry-run-topics + 5 meeting-context enrichment + 2 backend wiring)
- **LOC**: ~3.5k added across 17 files
- **Pre-mortem risks identified**: 9 (1 HIGHEST, 3 HIGH, 4 MEDIUM, 1 LOW); 7 retired pre-merge, 2 (R2 + R3) retire on T11 manual A/B by design
- **Reviewer dispatches**: ~14 (pre-work + post-work loops); 2 transient API 500s mid-loop required pragmatic fallback (one task committed without retrieved review report, validated independently in Phase 4.2)
- **Subagent dispatch flakiness**: full meeting-extraction.test.ts (4368 lines, 250+ tests) hangs the bash tool with default Node TAP reporter; workaround `stdbuf -oL -eL ... --test-reporter=spec --test-name-pattern=...` via individual describe blocks

## Pre-mortem Effectiveness

| Risk | Severity | Materialized? | Mitigation Effective? |
|------|----------|--------------|----------------------|
| R1 Parser regex over/double-matches mixed L2 headers | HIGH | No | Yes — single-pass classifier with priority order (## → ### date-prefixed → ### bare); anchored multiline regex; code-fence tracking via `inFence` toggle; documented as invariant in `services/LEARNINGS.md` |
| R2 Lexical detection precision | HIGH | TBD on T11 | Stop-token list (10 words: planning/review/sync/etc.); ≥2 non-stop slug tokens threshold; ≥0.5 coverage; cap at 3 at rollout (Decision #6) |
| R3 LLM over-suppression of new learnings | HIGHEST | TBD on T11 | Verbatim delta directive (5 DELTA rules + 4 do-NOT-emit rules); "When in doubt, INCLUDE" tiebreaker; one-shot CONFIRMATION-of-uncertainty example (pricing $99/$149); literal `.includes()` test assertions |
| R4 Token budget overflow with rich wiki context | MEDIUM | No | `MAX_TOPIC_WIKI_CONTEXT_CHARS = 6000` budget guard; tiered truncation (drop oldest L2 → halve longest section on `\n` boundary → drop lowest-scored topic); highest-scored topic never dropped |
| R5 `MeetingContextDeps.topicMemory` callsite/factory drift | MEDIUM | No | Full callsite sweep (8 sites across 6 files); typecheck as detection mechanism; real `TopicMemoryService` in test factory (graceful on missing topics dir) |
| R6 `## Summary` → `## Core` rename truncates historical files | HIGH | Caught in pre-work review | Yes — `summary` retained in BOTH STAGED_HEADERS sets (lowercase + TitleCase); dual-anchor regex `/^##\s+(?:Summary|Core)\s*$/m` at 4 production parser sites; manual-grep evidence in working-memory.md as merge-gate |
| R7 Frontmatter-injection via core/could_include | MEDIUM | No | `stripYamlDocSeparator` strip-and-warn helper (deliberately diverged from topic-memory.ts's drop-on-detect — LLM-prose more likely accidental); regex `/^---\s*$/m`; logs warning, doesn't fail extraction |
| R8 Single-PR scope risks bisectability | MEDIUM | No | 12 commits along Thread A/B/C boundaries; each commit independently typechecks |
| R9 Backend `activeTopicSlugs` behavior change in fixtures | LOW | No | Backend tests don't inject `topicMemory`/`workspacePaths`, so new branch silently skips in unit tests; 0 fixture diffs |

**Pre-mortem score**: 7/9 relevant risks fully retired; 2 await T11 (designed merge-gate). Zero risks shipped.

## What Worked / What Didn't

**+** **Pre-work review caught a non-trivial type gap**. Task 3's pre-work review found that `TopicIdentity` lacked `lastRefreshed` — the AC's recency tiebreaker was unimplementable. Without that pre-work step, the developer would have invented a hacky workaround. The orchestrator chose option (a): extend `TopicIdentity` and `toIdentities` together. Clean, additive, ~6 lines of new code.

**+** **R6 dual-heading strategy avoided a 17-callsite migration**. Plan Decision #7 ("both `summary` and `core` headers accepted permanently") + the formatter's `core ?? summary` precedence + the dual-anchor regex at 4 parser sites delivered the new feature WITHOUT needing to touch `apps/backend/test/`, `packages/cli/test/golden/`, or migrate any historical meeting files. The pre-work review caught this risk before the developer could do the obvious-but-wrong rename.

**+** **Subagent caught hidden bug proactively**. Task 8 dev caught that `updateMeetingContent`'s anchor regex would fail to find `## Core` and fall through to APPEND (duplicating content on re-extraction). Fixed dual-anchor before it could ship. This is *exactly* the "grumpy reviewer mindset" — but the developer found it themselves while reading carefully. The pattern: when extending a content-shape anywhere, grep for ALL anchor-based parsers, not just the obvious ones.

**+** **Strip-and-warn vs drop-on-detect for frontmatter sanitizer (R7)**. Reusing topic-memory.ts's existing `---` sanitizer would have been cargo-cult. The dev correctly identified that LLM-prose in `core`/`could_include` is more likely accidental than malicious, and chose strip-and-warn. JSDoc captures the rationale at the call site so a future dev grep'ing for `---` finds the design decision.

**+** **Pre-mortem R3 verbatim-text mitigation worked**. The "When in doubt, INCLUDE" tiebreaker and one-shot CONFIRMATION-of-uncertainty example are load-bearing — they're the difference between an LLM that over-suppresses (silent quality loss) and one that lets dedup catch duplicates. Tests use literal `.includes()` strings to lock the verbatim contract; even a single quote-style change (T6 fix `"` vs `'`) would otherwise drift undetected.

**—** **Subagent dispatch flakiness mid-PR**. Anthropic API hit 500s on multiple agent launches over a 30-min window mid-execution. Task 6's reviewer dispatch ran 28 minutes then 500'd; we never retrieved their report. Workaround was Phase 4.2 holistic review covering the gap. **Lesson**: when a long-running reviewer dispatches, capture intermediate findings if possible, or prefer two short reviewers over one big one for tasks with high blast-radius.

**—** **Test framework buffering** with `--test-reporter` default + bash tool background heuristic. Tests that ran fine via `--test-name-pattern` (200ms each) hung indefinitely with no output when run as a full file via background dispatch. Workaround: `stdbuf -oL -eL` + `--test-reporter=spec` + name-pattern. **Lesson for future PRs touching meeting-extraction.test.ts**: don't trust full-file runs in background; verify via per-describe-block patterns.

**—** **Test-budget mistake in T6 Tier 3 truncation test**. The test setup (3 topics × 500-char sections, budget=800) didn't actually force Tier 3 to trigger — Tier 2's halving alone fit under budget. Caught by Task 8 dev's full-suite run; fixed in a small follow-up commit (`f8bc3b83`). **Lesson**: when writing a test for "this tier triggers when prior tiers can't bring it under," compute the floor (sections trimmed to 0) and pick a budget BELOW that floor.

**—** **Subagent context truncation at long tool counts**. Several agents hit 70-100+ tool uses and ended their turns mid-work without committing (Task 6, Task 9, Task 10, T6-fix). The orchestrator had to step in, verify the work, and commit. Each time, the dev's actual implementation was correct — they just couldn't finish the housekeeping (commit + prd.json update). **Lesson for future PRDs**: keep subagent prompts tight; explicitly hand off the commit step ("if you're approaching tool-budget limits, write a stub completion report and let the orchestrator commit").

## Recommendations

**Continue**:
- Pre-work review with explicit "verify line numbers via grep before edit" — caught real ambiguities/blockers in T3 (TopicIdentity), T5 (callsite sweep), T6 (heading semantics ambiguity), T8 (dual STAGED_HEADERS sets).
- Verbatim text + literal `.includes()` assertions for prompt-engineering work — locks the contract.
- Dark-code audit as a discrete post-merge check separate from test coverage. (10 new exports, 0 dark.)
- Plan-level Decisions log with explicit rationale; reviewers can cite "Decision #N" rather than re-deriving.

**Stop**:
- Running long reviewer dispatches (28+ min) without intermediate checkpointing — when API 500s, the work is lost.
- Trusting full-file `--test` runs via background bash on large test files (meeting-extraction.test.ts is the canonical offender).

**Start**:
- For tasks with bash-tool-suspect tests, hand the developer the explicit `stdbuf` + `--test-reporter=spec` + `--test-name-pattern` incantation in the prompt.
- File refactor backlog items eagerly during reviews — captured `refactor-extract-topic-wiki-context-step` for the `buildTopicWikiContext` helper extraction (T5 reviewer suggestion).
- When a test fails because the ALGORITHM is right but the TEST is wrong (Tier 3 budget, CONFIRMATION quote-style), fix the test — and write the diagnosis in the commit body so the reasoning sticks.

## Follow-ups

- **T11 manual gate**: 5-meeting A/B validation comparing Treatment (this branch) vs Control (main) on diverse topic coverage. Save outcome to `dev/work/plans/wiki-leaning-meeting-extraction/ab-results.md`. The R2 + R3 mitigations only retire here.
- **Refactor backlog**: `dev/work/plans/refactor-extract-topic-wiki-context-step/plan.md` (tiny — extract Step 7 from `meeting-context.ts:978-1025` into a standalone helper for testability and easier swap-in of LLM-based detection).
- **Backend agent.test.ts pre-existing failures** (3 tests: dedup precedence, boundary 0.5 confidence, auto-approves matching priorItems) — confirmed pre-existing on main `e9bb3361`, NOT introduced by this branch. Worth a separate investigation; orthogonal to wiki-leaning work.
- **Optional LEARNINGS entry** on CLI/backend extraction parameter parity (T10 reviewer suggestion). Inline comment at `agent.ts:218-227` references CLI:852 mirror; LEARNINGS would make the parity-invariant grep-discoverable. Defer until a third extraction parameter divergence appears.

## File Anchors

- `packages/core/src/services/meeting-extraction.ts:495-700` (TopicWikiContext type, 4 new exported helpers, MAX_TOPIC_WIKI_CONTEXT_CHARS)
- `packages/core/src/services/meeting-extraction.ts:880-905` (delta directive verbatim)
- `packages/core/src/services/meeting-context.ts:978-1025` (Step 7 wiki-context enrichment — refactor candidate)
- `packages/core/src/services/topic-detection.ts` (new — `detectTopicsLexical` + `detectTopicsLexicalDetailed`, STOP_TOKENS)
- `packages/core/src/models/topic-page.ts:469` (`renderForExtractionContext`)
- `packages/core/src/services/memory.ts:52-87,601` (parser priority order; `getMemoryItemsForTopics`)
- `packages/core/src/services/LEARNINGS.md:116` (parser invariant: priority order + code-fence tracking)
- `packages/cli/src/commands/meeting.ts:456` (`--dry-run-topics` flag)
- `packages/apps/backend/src/services/agent.ts:218-237` (latent gap: backend `activeTopicSlugs` mirror)
- `packages/apps/backend/src/routes/intelligence.ts:102`, `services/workspace.ts:89`, `services/patterns.ts:96` (3 dual-anchor parser updates)
