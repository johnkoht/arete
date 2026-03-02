# Review: People Intelligence Plan

**Type**: Plan (pre-execution)  
**Audience**: User — end-user intelligence features for PMs using Areté  
**Reviewer**: Cross-model review (plan-mode PM + skill checklist)  
**Date**: 2026-03-01

---

## Concerns

### 1. **Completeness — `RefreshPersonMemoryResult` needs new fields**

The plan adds stances and action items to `refreshPersonMemory()` but doesn't mention updating the return type (`RefreshPersonMemoryResult`). Currently it returns `{ updated, scannedPeople, scannedMeetings, skippedFresh, scannedConversations? }`. The CLI uses this to display "Refreshed person memory highlights for N person file(s)."

With new extraction, the result should report: stances extracted, action items extracted, items aged out. Without this, the CLI summary is misleading — the user gets "refreshed 3 files" with no indication that LLM stance extraction ran or that 5 action items were found.

**Suggestion**: Add to Task 5 AC: "Update `RefreshPersonMemoryResult` with `stancesExtracted`, `actionItemsExtracted`, `itemsAgedOut` counts. Update CLI summary in Task 8 to display them."

### 2. **Completeness — Content hash cache storage is unspecified**

Task 5 says "Cache LLM results by content hash" but doesn't specify WHERE the cache lives. Options:
- In-memory `Map<string, StanceResult[]>` (dies with process — fine for single CLI invocations)
- On-disk cache file (persists across runs — avoids re-extracting when nothing changed)

The function-scoped Map pattern documented in LEARNINGS.md is for N×M I/O reduction within a single method call. For LLM caching, the value is across invocations — re-running `arete people memory refresh` tomorrow shouldn't re-extract stances from unchanged meetings.

**Suggestion**: Specify in Task 5: "On-disk cache in `.arete/cache/person-signals/{meeting-content-hash}.json`. Check cache before calling LLM. Cache is a performance optimization — if missing, re-extract." Or simpler: since stances are already rendered into the person file, and `refreshPersonMemory` already has stale-awareness via `ifStaleDays`, the LLM cache may not be needed at all if the stale check prevents re-processing unchanged content. Clarify which caching strategy to use.

### 3. **Dependencies — Task 3 (action items) and Task 4 (lifecycle) should be one task**

Task 3 builds action item extraction. Task 4 builds lifecycle (aging, capping, dedup). These are listed as separate tasks that can "be parallelized after Task 1." But you can't meaningfully test or ship action item extraction without lifecycle — extracting items without aging means the feature immediately degrades. And lifecycle can't be built without items to age.

**Suggestion**: Merge Tasks 3 and 4 into a single task: "Extract bidirectional action items with lifecycle management." This prevents shipping extraction without aging, which the pre-mortem explicitly flags as a risk (Risk 4).

### 4. **Patterns — `person-signals.ts` LLM prompt needs specification**

Task 2 says "conservative prompt: precision over recall" but the actual LLM prompt for stance extraction is the core of the entire feature. The plan doesn't specify what the prompt looks like, what structured output format it expects, or how it relates to the existing `buildExtractionPrompt()` pattern in `conversations/extract.ts`.

This is the riskiest part of the plan — the quality of the prompt determines whether stances are useful or noise. Leaving prompt design entirely to the implementing subagent is a gamble.

**Suggestion**: Add to Task 2 AC: "Prompt must: (a) specify JSON output schema for stances, (b) require topic + direction (supports/opposes/concerned) + evidence quote, (c) include explicit 'if uncertain, omit' instruction, (d) be tested independently via `buildStancePrompt()` unit test." Consider including a draft prompt in the PRD so the subagent has a starting point.

### 5. **Scope — Task 10 "end-to-end validation" is vague**

Task 10 says "Manual test: process a meeting → verify person profiles enriched → run meeting prep → verify brief includes new intelligence." This can't be run in the dev repo (no real meetings), and it doesn't specify what "verify" means concretely. It also bundles LEARNINGS.md updates and AGENTS.md updates — these are documentation tasks, not validation.

**Suggestion**: Split Task 10 into:
- 10a: Run full automated test suite (`npm run typecheck && npm test`). Verify no regressions.
- 10b: Update `packages/core/src/services/LEARNINGS.md` with new patterns (LLM via options, content hash caching, action item lifecycle). Update AGENTS.md sources if CLI surface changed.
- Drop the manual test claim — the automated tests from Tasks 1-8 are the real verification.

### 6. **Backward Compatibility — `--memory` flag behavior change**

Currently `arete people show sarah --memory` shows asks and concerns. After this work, it shows stances, open items, and relationship health too. This isn't a breaking change (it's additive), but if someone scripts against the `--json` output, the structure changes.

**Suggestion**: Add to Task 8 AC: "JSON output adds new fields alongside existing ones (non-breaking). Existing `asks`/`concerns` fields unchanged."

### 7. **Catalog — No capability entry update mentioned**

The plan touches `EntityService`, CLI commands, and skills — these are core capabilities. `dev/catalog/capabilities.json` should be checked per LEARNINGS.md pre-edit checklist ("If work touches tooling/extensions/services, are `dev/catalog/capabilities.json` entries current?").

**Suggestion**: Add to Task 10: "Verify `dev/catalog/capabilities.json` entries for people service, people CLI, meeting-prep skill are current."

### 8. **Multi-IDE — Skill edits need consistency check**

Task 9 edits `packages/runtime/skills/meeting-prep/SKILL.md` and `process-meetings/SKILL.md`. These are runtime skills that get copied to user workspaces. The edits need to work for both Cursor and Claude installations — no IDE-specific paths or tool references in the skill content.

**Suggestion**: After Task 9, run: `rg "\.cursor.*or.*\.claude|\.claude.*or.*\.cursor" packages/runtime/skills/meeting-prep/ packages/runtime/skills/process-meetings/` — should return nothing.

---

## Strengths

- **Thorough pre-planning**: Four decisions resolved before build. Pre-mortem with 10 risks. Council invoked with concrete policies. Engineering Lead consulted. This is among the best-prepared plans.
- **Builds on proven patterns**: The module extraction (Task 0), signal collection → aggregation → rendering pipeline, and auto-managed section approach all follow documented, tested patterns.
- **Clean scope**: Communication Preferences explicitly cut. Out of scope section is clear and specific.
- **Graceful degradation**: No LLM function → stances skipped, everything else works. No profile.md → falls back to heuristics. This is robust.
- **Correct dependency ordering**: Task 1 blocks everything, parallel tasks identified, Phase D at the end.

---

## Devil's Advocate

**If this fails, it will be because...** the LLM stance extraction produces mediocre results and we don't discover this until after all 10 tasks are built. The prompt quality, response parsing, and "conservative extraction" tuning are all specified abstractly ("precision over recall") without concrete definitions. A subagent will write a reasonable-looking prompt, tests will pass with mock data, and then real meeting transcripts — which are messy, speaker-attributed, full of hedging and sarcasm — will produce stances like "Sarah supports the product" (too vague to be useful) or "Bob opposes the timeline" (misread from a question, not a position). The feature ships, meeting prep shows noisy stances, and the user loses trust in the intelligence layer.

The mitigation is Task 2's acceptance criteria, but "conservative prompt" is not a verifiable AC. You can't test "conservative" with mocks. The real test is against actual meeting content, and that happens only in Task 10's manual validation (which I've flagged as vague).

**The worst outcome would be...** stances and action items are technically correct but useless in practice. The system extracts "Sarah mentioned timeline concerns" from every meeting where timelines were discussed, producing 15 nearly-identical stances that add noise without insight. The person profile becomes a wall of text that nobody reads, and meeting prep — the killer feature this enables — gets worse because it now includes a paragraph of low-signal stances before the useful context. The Harvester persona abandons trust; the Preparer sees no output improvement over raw Claude; only the Architect appreciates the structured data, but even they start editing stances by hand.

---

## Verdict

- [ ] Approve — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] Revise — Address concerns before proceeding

### Required Before PRD

1. **Merge Tasks 3+4** — Action item extraction and lifecycle are inseparable (Concern 3)
2. **Specify LLM prompt strategy** — At minimum, define the JSON output schema and include "if uncertain, omit" in Task 2 AC (Concern 4)
3. **Specify cache strategy** — In-memory per-invocation or on-disk across invocations (Concern 2)

### Recommended (can address during PRD)

4. Update `RefreshPersonMemoryResult` with extraction counts (Concern 1)
5. Confirm `--json` backward compatibility in Task 8 AC (Concern 6)
6. Add capability catalog check to Task 10 (Concern 7)
7. Split Task 10 into automated verification + documentation (Concern 5)
8. Multi-IDE consistency check after skill edits (Concern 8)
