# Pre-Mortem: Product Simplification Phase 2

**Date**: 2026-04-04

Imagine it's one week from now and the Phase 2 delivery failed or caused regressions. What went wrong?

## Failure Scenarios

### 1. Jaccard dedup breaks addTask callers

**Scenario**: A caller creates a task, then later creates a slightly different task with the same wording but minor differences. The dedup fires incorrectly — the second task is silently dropped even though it's intentionally different.

**Probability**: Medium (Jaccard 0.8 is strict but not perfect)

**Mitigation**:
- 0.8 threshold is very high — requires 4/5 words in common or more
- Return the existing task (not an error) so caller is aware of the dedup
- Add `skipDedup?: boolean` option for callers that need guaranteed insert

### 2. Jaccard math is wrong in tests

**Scenario**: Tests pass because we used intuition about string similarity, not math. Edge cases in production fail silently.

**Probability**: Medium (documented gotcha in LEARNINGS.md)

**Mitigation**:
- Manually verify Jaccard math: tokenize both strings, compute |intersection|/|union|
- Use the pattern from LEARNINGS.md: "5 words" vs "5 words + 1 extra" = 5/6 = 0.833

### 3. existingTasks prompt section makes prompts too long

**Scenario**: Adding 50+ tasks to the extraction prompt blows token limits for long meetings with full transcripts.

**Probability**: Low (week.md typically has 5-20 tasks)

**Mitigation**:
- Cap existingTasks at 20 in the context section
- Use task text only (no metadata) to keep it compact

### 4. Threshold change (0.65) causes regression in tests

**Scenario**: Tests that previously checked items with confidence 0.5-0.64 now fail because those items are excluded.

**Probability**: High (almost certain some tests use values in this range)

**Mitigation**:
- Before changing the constant, grep for `confidence.*0\.[5-6]` in test files
- Update test expectations to match new threshold

### 5. meeting-context.ts change breaks existing bundle consumers

**Scenario**: Changing `MeetingContextBundle` type to add `existingTasks` breaks callers that construct the type manually.

**Probability**: Low (field is optional, TypeScript allows additional optional fields)

**Mitigation**:
- Use `existingTasks?: string[]` (optional) so no existing construction sites break
- Run typecheck before commit

### 6. Week-plan skill instruction not effective (Task 4)

**Scenario**: The skill instruction says "check for existing tasks" but the LLM doesn't reliably do this in practice.

**Probability**: Medium (LLMs don't always follow negative instructions perfectly)

**Mitigation**:
- Task 1's write-time Jaccard dedup is the real backstop — even if the skill tries to create a duplicate, TaskService.addTask() will catch it
- Frame instruction positively: "show (already a task) for commitments with linked tasks"

## Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Jaccard false positive | Medium | Low | 0.8 threshold + return existing |
| Jaccard math wrong in tests | Medium | Medium | Verify math manually |
| Token limit with existingTasks | Low | Medium | Cap at 20 tasks |
| Test regression from 0.65 threshold | High | Low | Update tests proactively |
| Type break in bundle | Low | Medium | Optional field |
| Skill instruction ineffective | Medium | Low | Write-time backstop in addTask |

## Go/No-Go Decision

**Go** — risks are manageable, mitigations are clear, and the Phase 1 learnings (verify before building, check real data) are being applied.
