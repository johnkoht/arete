# Final Holistic Review — wiki-leaning-meeting-extraction

**Reviewer**: Orchestrator (Sr. Eng Manager)
**Date**: 2026-04-27
**Branch**: `worktree-wiki-leaning-extraction` (base `e9bb3361` → tip `f8bc3b83`)
**Scope**: Tasks T1–T10 + T6 follow-up. T11 (5-meeting A/B) is the manual merge gate, out of scope here.

---

## 1. Problem fit

The PRD defines four goals: extraction sees the wiki and emits only deltas; L2 entries get topic tags; recap output reshapes into Core + Could include; latent bugs (parser/writer mismatch, backend missing `activeTopicSlugs`) fixed as side effects. The implementation satisfies all four:

- **Extraction sees the wiki**: `meeting-context.ts:978–1025` runs `topicMemory.listAll → detectTopicsLexical → renderForExtractionContext + getMemoryItemsForTopics` and attaches the result as `bundle.topicWikiContext`. `meeting-extraction.ts` then renders that into a "Topic Wiki — already known to the reader, DO NOT re-extract" section in the prompt and emits a delta-only directive with the "When in doubt, INCLUDE" tiebreaker (line 894) and the CONFIRMATION-of-uncertainty one-shot example (line 897).
- **L2 items get topic tags**: `staged-items.ts:339,376–386,612–613` writes `**Topics**: slug-a, slug-b` alongside Date/Source. `services/memory.ts:601` parses them via `getMemoryItemsForTopics` and returns intersected slugs with recency/limit caps.
- **Recap reshaped**: `meeting-extraction.ts` schema has `core` and `could_include` (with 8-cap, ≤200-char items, frontmatter sanitizer). `formatStagedSections` emits `## Core` (or `summary` fallback) and `## Could include` (omitted when empty). `STAGED_HEADERS` (`meeting-apply.ts:119–123`) accepts `summary`, `core`, `could include`.
- **Latent bugs fixed**: parser regex now accepts `## Title`, `### YYYY-MM-DD: Title`, `### Title` shapes (single-pass priority classifier with code-fence tracking, documented in `services/LEARNINGS.md:116`); backend `agent.ts:227–245` now passes `activeTopicSlugs`.

Success criteria: 4 of 5 are verifiable by code inspection and pass; the 5th — "5-meeting A/B drop in item counts with no real-delta suppression" — is T11 and remains the merge gate.

---

## 2. Completeness

End-to-end data flow trace (HEAD):

1. **CLI invocation** (`packages/cli/src/commands/meeting.ts:456`) — `--dry-run-topics` flag accepted; calls `detectTopicsLexicalDetailed` with full per-slug score/token/lastRefreshed output (line 590) and exits without writing.
2. **Real extraction path** — `meeting-context.buildMeetingContext` at line 983–1025 runs Step 7. `topicMemory: TopicMemoryService` is required in `MeetingContextDeps:157`; `createServices()` wiring updated (per Phase 4 plumbing commit `4bfa5225`).
3. **Prompt assembly** — `buildMeetingExtractionPrompt` calls `buildTopicWikiContextSection` between `enhancedContext` and `exclusionList`. `MAX_TOPIC_WIKI_CONTEXT_CHARS = 6000`; truncation order verified by tests (Tier 1 oldest L2 → Tier 2 halve longest section on `\n` boundary → Tier 3 drop lowest-scored topic; highest-scored topic never dropped).
4. **`activeTopicSlugs`** — `mergeDetectedSlugsIntoActiveList` integrates detected slugs into the existing slug-bias list (CLI: `meeting.ts`; backend: `agent.ts:227–245` via `loadMemorySummary` + `renderActiveTopicsAsSlugList`).
5. **Response parsing** — `parseMeetingExtractionResponse` extracts `core`, `could_include`, `summary`. Frontmatter sanitizer (`stripYamlDocSeparator`) strips line-start `---` from both fields and logs (does NOT fail extraction). Hard-cap of 8; trim/empty/>200-char rejection applied.
6. **Formatter** — CLI line 1026–1027 and backend `agent.ts:433–434` pass `core` and `could_include` to `formatFilteredStagedSections`. The dual-anchor regex `/^##\s+(?:Summary|Core)\s*$/m` is applied at 4 production parsers (`meeting-extraction.ts updateMeetingContent`, `patterns.ts`, `intelligence.ts`, `workspace.ts`) so re-runs on `## Core`-anchored files don't duplicate.
7. **L2 backward compat** — `parseMemorySections` unit tests cover `## Title`, `### YYYY-MM-DD: Title`, `### Title`, code-fence negatives, trailing whitespace, empty-title rejection. Historical `## Summary` blocks parse cleanly (verified by 76/76 backend approval/intelligence tests passing in Task 8 progress log).

No gaps found. Each link in the chain has tests at HEAD that exercise it.

---

## 3. Pre-mortem retrospective

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|---------------|---------------------|------------|
| **R1** Parser regex over/double-matches mixed L2 headers (HIGH) | No | Yes — single-pass priority classifier (`## > ### YYYY-MM-DD: > ###`), code-fence tracking, empty-title rejection, anchored regex with `^...$/m` | Effective — 19 fixture tests in `memory.test.ts` pass; LEARNINGS entry at line 116 documents invariants |
| **R2** Lexical detection precision (HIGH) | TBD at T11 | Yes — stop-token list, ≥2 non-stop tokens + ≥0.5 coverage threshold, cap=3 at rollout, `--dry-run-topics` flag for empirical tuning | Likely effective — unit tests cover stop-token rejection, single-token coincidence, recency tiebreaker; T11 is the empirical validation |
| **R3** LLM over-suppression (HIGHEST) | TBD at T11 | Yes — "When in doubt, INCLUDE" tiebreaker (verified verbatim at line 894); CONFIRMATION-of-uncertainty one-shot example (line 897); 5-meeting A/B as merge gate | Cannot verify without T11; mitigations are in the right shape |
| **R4** Token budget overflow (MEDIUM) | No | Yes — `MAX_TOPIC_WIKI_CONTEXT_CHARS = 6000`; deterministic 3-tier truncation; truncation runs before prompt assembly | Effective — 6 truncation tests in `meeting-extraction.test.ts` cover all tiers including the highest-score-never-dropped invariant |
| **R5** `MeetingContextDeps.topicMemory` callsite/factory drift (MEDIUM) | No | Yes — full grep sweep in T5 commit; `createServices` wired, all test factories updated | Effective — typecheck clean, all 66 `meeting-context.test.ts` tests pass |
| **R6** `## Summary` → `## Core` rename truncates historical files (HIGH) | No | Yes — `STAGED_HEADERS` retains `summary` AND adds `core`/`could include`; T8 manual grep audit documented; dual-anchor regex at 4 production parsers | Effective — 76/76 backend tests with `## Summary` fixtures pass; explicit backward-compat test in `parser` and `meeting-extraction` |
| **R7** Frontmatter-injection via `core`/`could_include` (MEDIUM) | No | Yes — `stripYamlDocSeparator` helper rejects `/^---\s*$/m` from both fields, logs warning, does not fail extraction | Effective — 2 sanitizer unit tests pass; mirrors topic-wiki-memory pattern (2026-04-23) |
| **R8** Single-PR scope risks bisectability (MEDIUM) | Partially | Yes — 11 thread-aligned commits (each task one or more clean commits); each commit's tests independently green | Effective — clean `git log` narrative; bisectable at task granularity |
| **R9** Backend `activeTopicSlugs` behavior change (LOW) | No | Yes — backend tests don't inject `topicMemory`/`workspacePaths` so the new branch is silently skipped in unit tests; production-only behavior addition called out in T10 progress log | Effective — no fixture diffs; 357/360 backend tests pass (3 failures are pre-existing, NOT introduced) |

**Key takeaway**: 7 of 9 risks fully retired pre-merge. R2 and R3 carry residual exposure that only T11 can resolve, which is exactly the design intent (per Decision #8).

---

## 4. Test status

| Suite | Result | Notes |
|-------|--------|-------|
| `npm run typecheck` | PASS (clean) | `tsc -b packages/core packages/cli` clean; no errors |
| `meeting-extraction.test.ts` | 269/269 PASS | Includes all wiki-context, truncation, sanitizer, schema, slug-merge, dual-anchor tests |
| `meeting-context.test.ts` | 66/66 PASS | Includes 5 new `topicWikiContext` enrichment tests |
| `topic-detection.test.ts` | 24/24 PASS | Threshold, recency tiebreaker, stop-token rejection, single-token coincidence rejection, detailed/non-detailed agreement |
| `memory.test.ts` | 23/23 PASS | Three header shapes, code-fence negative, getMemoryItemsForTopics with limit/sinceDays/empty-slug paths |
| `topic-page.test.ts` | 37/37 PASS | `renderForExtractionContext` full/missing-section/scope-trunc/changelog-limit + render/parse round-trip |
| `cli/test/commands/meeting-extract.test.ts` | 50/50 PASS | Includes `## Summary` backward-compat fixture and `## Core`/`## Could include` rendering |
| `apps/backend/test/services/agent.test.ts` | 48/51 PASS | 3 failures (`dedup takes precedence`, `boundary case 0.5 confidence`, `auto-approves items matching priorItems`) are PRE-EXISTING — confirmed by re-running on `e9bb3361` (main) where the same 3 tests fail. NOT introduced by this branch. |

**No new failures introduced.** Total new passing tests added across the branch: ~50+ (tracked per task in `dev/executions/.../progress.md`).

---

## 5. LEARNINGS.md audit

- **T2** (parser priority order) — present at `packages/core/src/services/LEARNINGS.md:116`, dated 2026-04-27, attributed to `wiki-leaning-extraction`. Documents invariants: priority order, fall-through behavior, fence tracking, empty-title rejection, metadata-attribution scope, topics absent-vs-empty distinction, and names the canonical regression suite (`memory.test.ts parseMemorySections suite, 19 tests`). **Confirmed present and high quality.**
- **T8** (dual-anchor regex pattern) — NOT in LEARNINGS, but T8's progress log explicitly justifies the omission ("documented in code comments at the four parser sites... fully self-evident from the regex pattern... if a 5th parser arises, factor into a small exported helper"). Defensible — the pattern is local and obvious at each site.
- **T10** (extraction parameter parity CLI/backend) — NOT in LEARNINGS. Reviewer flagged this as optional. The CLI assembly pattern (`loadMemorySummary` → `renderActiveTopicsAsSlugList`) was already exported and reusable; backend reuse was 6 lines. **Recommend a brief LEARNINGS entry post-T11** documenting "CLI and backend extraction must mirror parameters; if a 3rd caller emerges, factor into `topic-memory.ts`" — but not a merge blocker.

---

## 6. Documentation impact

**`--dry-run-topics` is missing from `.agents/sources/shared/cli-commands.md`.** The file documents 3 existing `--dry-run` flags (lines 59, 85, 99) but not the new `--dry-run-topics`. Implementation is at `packages/cli/src/commands/meeting.ts:456`.

**Recommended action before T11/merge**: add a bullet under `arete meeting extract` in `.agents/sources/shared/cli-commands.md` documenting:
```
- `--dry-run-topics` - Run lexical topic detection only (no LLM call); print detected topics with scores + matched tokens. Use for tuning thresholds against real meetings before relying on detection.
```
Then run `npm run build:agents:dev` to refresh `dist/AGENTS.md`.

**AGENTS.md / other docs**: no other staleness identified. `dist/AGENTS.md` was rebuilt in T10 (`4bfa5225`).

---

## 7. Refactor backlog

| Item | Source | Captured? | Notes |
|------|--------|-----------|-------|
| Extract `buildTopicWikiContext` helper from `meeting-context.ts` (~47 inline lines, 978–1025) | T5 reviewer | **NO** | Not in `engineering-debt/plan.md` or any refactor-* plan. **Recommend filing as a small engineering-debt item.** |
| Dual-anchor regex consolidation (4 sites; factor when a 5th arises) | T8 reviewer | **NO** | Self-policing per progress log ("if a 5th parser arises, factor"). Acceptable — 4 inline regexes is fine and the next caller will trigger refactor. |
| LEARNINGS entry on extraction parameter parity (CLI/backend mirror) | T10 reviewer | **NO** | Optional per reviewer. Recommend after T11 closes. |

**Recommendation**: file ONE small engineering-debt item for the `buildTopicWikiContext` helper extraction. The other two are acceptable as informal/post-T11.

---

## 8. Verdict

**READY** — with two small recommended follow-ups before merge (neither blocking T11).

**Evidence**:
- All code tasks (T1–T10 + T6 follow-up) implemented per ACs.
- Typecheck clean. All 7 in-scope test suites pass at HEAD with 0 new failures.
- 7 of 9 pre-mortem risks fully retired pre-merge; R2/R3 explicitly designed to be resolved by T11.
- Latent bugs (parser/writer mismatch, missing backend `activeTopicSlugs`) fixed as side effects.
- LEARNINGS.md updated for the highest-value invariant (T2 parser).
- Commit history is bisectable along thread/task boundaries (R8 mitigation effective).

**Recommended pre-merge follow-ups (small, non-blocking)**:
1. **Documentation**: add `--dry-run-topics` to `.agents/sources/shared/cli-commands.md` and rebuild via `npm run build:agents:dev`. ~5 minutes.
2. **Refactor backlog entry**: append a small item to `dev/work/plans/engineering-debt/plan.md` capturing the `buildTopicWikiContext` helper extraction (T5 reviewer flag). ~5 minutes.

**Merge gate remaining**: T11 5-meeting A/B validation (manual, user-driven). Per Decision #8 this is the only signal we have for R3 (LLM over-suppression), so it must run before the PR lands. The implementation is complete and ready for that gate.

---

**Final report by Orchestrator. Ready for T11.**
