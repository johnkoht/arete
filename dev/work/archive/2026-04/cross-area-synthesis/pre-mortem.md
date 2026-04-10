---
title: "Pre-Mortem: Cross-Area Synthesis"
plan: cross-area-synthesis
created: "2026-04-06"
risks: 6
categories: [integration, test-patterns, scope-creep, reuse, code-quality, dependencies]
---

# Pre-Mortem: Cross-Area Synthesis

## Risk 1: LLM Response Parsing Fragility

**Problem**: The LLM returns free-form markdown. Parsing it into structured sections (Connections, Dependencies, Attention) is brittle — the model might use different heading names, skip sections, or nest content unexpectedly. This is the #1 failure mode in LLM-driven features.

**Mitigation**: Don't parse the LLM response structurally. Write the raw LLM output into `_synthesis.md` wrapped in standard frontmatter + header. The LLM prompt should specify the exact markdown format, but the code should treat the response as opaque content. For CLI summary counts (Step 3), either ask the LLM to include a structured JSON block at the end, or do simple regex counting (`##` headings, `-` bullet items).

**Verification**: Test with varied LLM response formats — missing sections, extra sections, empty response. Confirm no crash and output is still useful.

---

## Risk 2: Test Patterns — Mocking LLM Calls

**Problem**: Tests need to mock both storage (area files) and the `callLLM` function. The existing test file uses `createMockStorage()` but has no LLM mocking pattern. Getting the mock interaction right (prompt assertion + response injection) could be tricky.

**Mitigation**: Follow `EntityService` test patterns for `callLLM` mocking. The mock is simple: `const callLLM = vi.fn().mockResolvedValue('## Connections\n...')`. Assert the prompt passed to `callLLM` contains expected area names/content. Pre-populate storage with 2-3 area files via `storage.store.set()`. Reference: `packages/core/test/services/area-memory.test.ts` lines 24-66 for storage mocking, and check entity service tests for `callLLM` mock pattern.

**Verification**: Test covers: (1) prompt includes all area data, (2) output file written correctly, (3) `callLLM` not provided → synthesis skipped, (4) `callLLM` throws → graceful degradation.

---

## Risk 3: Integration — `refreshAllAreaMemory` Options Type Change

**Problem**: Adding `callLLM?: LLMCallFn` to `RefreshAreaMemoryOptions` changes an exported type. The CLI already passes this options object. If the type import chain isn't updated consistently, TypeScript will catch it — but the CLI wiring in `intelligence.ts` needs to actually create and pass the function.

**Mitigation**: Before implementing, read the full type chain: `RefreshAreaMemoryOptions` definition → CLI usage in `intelligence.ts:480-501` → `services.ai.call()` signature. The CLI already creates `callLLM` wrappers for person memory refresh — follow that exact pattern. Verify `'synthesis'` is a valid `AITask` in `ai.ts` (or add it).

**Verification**: `npm run typecheck` passes. CLI command works end-to-end with `--dry-run`.

---

## Risk 4: Scope Creep — Over-Engineering the Prompt

**Problem**: Temptation to build elaborate prompt construction with area summarization, token counting, priority ordering. The plan says "no budget controls for v1" but an implementer might add them anyway.

**Mitigation**: Strict AC adherence. The prompt is: read all area files, concatenate them, wrap in instructions. No summarization, no truncation, no priority ordering. The LLM is good at this — give it the raw data and clear instructions.

**Verification**: Review the prompt construction code. It should be <30 lines. If it's longer, scope creep happened.

---

## Risk 5: Reuse — `_synthesis.md` Excluded from Area Listing

**Problem**: `listAreaMemoryStatus()` reads all `.md` files in the areas directory. If `_synthesis.md` isn't excluded, it'll show up as an "area" in status output and staleness checks, creating confusion.

**Mitigation**: Check how `listAreaMemoryStatus()` discovers area files (lines 434-448). If it uses `storage.list()` with a glob, ensure `_synthesis.md` is filtered out (by `_` prefix convention or explicit exclusion). Also ensure `refreshAllAreaMemory()` doesn't try to "refresh" the synthesis file as if it were an area.

**Verification**: After implementation, `arete status` shows correct area count (synthesis file not counted as an area). `arete memory refresh` with a single area doesn't trigger synthesis.

---

## Risk 6: AITask Registration

**Problem**: `services.ai.call('synthesis', prompt)` requires `'synthesis'` to be a registered `AITask`. If the task routing in `ai.ts` doesn't know about it, the call will fail at runtime (possibly silently or with a confusing error).

**Mitigation**: Before implementing the CLI wiring, read `packages/core/src/services/ai.ts` to find the `AITask` type/enum and task-to-tier mapping. Either add `'synthesis'` as a new task, or reuse an existing task like `'summary'` or `'extraction'` if the tier routing is appropriate. Check `arete.yaml` for task configuration.

**Verification**: `services.ai.call('synthesis', prompt)` resolves to the correct model tier. Add a test or verify manually with `--dry-run`.

---

## Summary

Total risks identified: 6
Categories covered: Integration, Test Patterns, Scope Creep, Reuse/Duplication, Code Quality, Dependencies

Highest-impact risks: **#1 (parsing fragility)** and **#5 (`_synthesis.md` pollution)**. Both have straightforward mitigations. The overall plan is well-scoped — the main danger is over-engineering, not under-engineering.
