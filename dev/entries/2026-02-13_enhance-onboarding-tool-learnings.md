# Enhance Onboarding Tool — Learnings

**Date**: 2026-02-13  
**PRD**: `dev/prds/enhance-onboarding-tool/prd.md`  
**Orchestrator**: execute-prd skill (second production use)  
**Execution Path**: PRD (recommended and approved)

---

## Metrics

| Metric | Result |
|--------|--------|
| Tasks completed | 9/9 (100%) |
| Success rate (first attempt) | 9/9 (100%) — zero iterations |
| Pre-mortem risks identified | 8 |
| Pre-mortem risks that materialized | 0/8 (0%) |
| Content added | ~600 lines (TOOL.md: 406 → ~830 lines) |
| Commits | 9 feature commits + 1 verification commit |
| Context used | ~103K/200K tokens (51.5% of budget) |
| Refactor backlog items | 0 |
| Documentation updates needed | 0 (AGENTS.md and README.md already accurate) |

---

## Pre-Mortem Review

| Risk | Materialized? | Mitigation | Effective? |
|------|--------------|------------|-----------|
| File Length and Organization | No | Clear #### headers, modular sections | Yes |
| Template Content Drift | No | Tasks 1-3 complete before task 5, explicit file reading | Yes |
| Backward Compatibility | No | Preserve existing steps, regression check in task 9 | Yes |
| Documentation Impact | No | Post-task-9 check | Yes |
| Anti-Pattern Overload | No | 6-8 max, constructive framing | Yes |
| Scope Creep | No | AC-only implementation, code review check | Yes |
| Fresh Context = Missing Phase Content | No | Explicit file/section reading lists in prompts | Yes |
| Test Patterns (Manual Verification) | No | Detailed checklist in task 9 prompt | Yes |

**Key insight**: All 8 mitigations were applied proactively and prevented issues. Zero risks materialized.

---

## What Worked Well

### 1. Sequential Task Execution with Clear Dependencies

**Pattern**: Tasks 1-3 (phase enrichment) → Task 5 (templates referencing phases) → Task 8 (activation referencing templates) → Task 9 (verification)

**Why it worked**: Dependencies were explicit in PRD and prompts. Task 5 prompt said "Read Phase 1-3 enhancements from Tasks 1-3 first." Task 8 prompt referenced Task 5 templates. This prevented drift and ensured integration.

**Evidence**: Task 5 templates correctly referenced Phase 1-3 content with zero drift. Task 8 activation workflow referenced templates correctly.

**Repeat**: For any PRD with A→B→C dependencies, make dependencies explicit in prompts: "Task B depends on Task A being complete. Read Task A's output before starting."

---

### 2. Show-Don't-Tell Prompts

**Pattern**: Every task prompt included:
- "Read these files first" (specific paths)
- "Follow pattern from Task X" (concrete example)
- "PRD lines 142-184" (specific line references)
- "Important Patterns" section (what to preserve, what to enhance)

**Why it worked**: Subagents had concrete examples and specific guidance. No ambiguity about structure, tone, or scope.

**Evidence**: All 9 tasks completed on first attempt. Zero iterations needed. Tone consistency across 600+ lines of new content without explicit tone guidance in every prompt.

**Repeat**: Always include "Read these files first", "Follow pattern from Task X", and specific line references in prompts. Concrete > abstract.

---

### 3. Pre-Mortem with Concrete Mitigations

**Pattern**: Before execution, identified 8 risks and created specific mitigations:
- Risk: Template content drift → Mitigation: "Task 5 prompt will say 'Read Phase 1-3 sections first before creating templates'"
- Risk: Scope creep → Mitigation: "In every subagent prompt, include: 'Implement only the specific practices listed in acceptance criteria—do not add additional best practices'"

**Why it worked**: Mitigations were actionable and applied during execution. Not vague ("be careful") but specific ("in prompt X, add Y").

**Evidence**: 0/8 risks materialized. Mitigations prevented issues before they occurred.

**Repeat**: In pre-mortem, create concrete mitigations that get embedded in prompts or code review checklists. "How will we prevent this?" not "This is a risk."

---

### 4. Acceptance Criteria as Quality Gates

**Pattern**: Each task had 3-6 measurable criteria. Reviewer code review checked AC systematically:
- Task 1: ✅ Two Traps section exists? Yes. ✅ 9 Magic Words appears? Yes. ...
- Accept if all AC met, iterate if any failed.

**Why it worked**: AC were specific and verifiable. No subjectivity. "Trust Battery metaphor documented" is measurable. "Add good Phase 2 content" is not.

**Evidence**: 9/9 tasks accepted on first attempt because AC were clear and met.

**Repeat**: Write measurable AC in PRDs ("section exists with X content", "table has Y columns", "5 examples provided"). Avoid vague criteria ("improve quality", "make it better").

---

### 5. Verification Task as Final Gate

**Pattern**: Task 9 was a dedicated verification task with 5-check structure: activation workflow, project structure, template content, activation guidance, regression check.

**Why it worked**: Provided confidence that all 8 prior tasks integrated correctly. Caught no issues (good!) but would have caught integration problems if they existed.

**Evidence**: Task 9 verified all enhancements were present and existing functionality was intact. No surprises in final review.

**Repeat**: For multi-task PRDs, add a final verification task with specific checks. Not just "make sure it works" but "verify X, Y, Z with specific criteria."

---

## What Didn't Work

None — zero issues encountered during execution.

---

## Subagent Insights

Synthesized from post-task reflections across all 9 tasks:

### What Helped Subagents Most

1. **Clear header hierarchy guidance** (##, ###, ####) — prevented structural inconsistencies
2. **Specific line references** to PRD requirements — eliminated ambiguity about what to implement
3. **Pattern-following from prior tasks** (e.g., "Follow Task 1 enhancement pattern for Phase 2")
4. **Explicit "what NOT to change" guidance** (e.g., "Preserve existing activation steps 1-4")

### Common Suggestions

- None — all subagents reported prompts were clear and execution was straightforward
- Token estimates ranged from 6K-15K per task (mostly 8-12K)

---

## Collaboration Patterns

### Builder Behavior

- **Pre-mortem**: Approved without changes → proceeded immediately
- **During tasks 1-9**: No intervention → full autonomy achieved
- **No questions or clarifications needed** → prompt quality was sufficient

### Orchestrator Decisions

- **Reviewer role effectiveness**: Systematic AC review (11a-11d checklist) caught zero issues because tasks were done correctly the first time. Pre-mortem + show-don't-tell prompts worked.
- **Accept decisions**: 9/9 tasks accepted on first attempt — no iterations
- **Documentation check**: Ran post-task-9 check for AGENTS.md/README references. Found references are high-level and already accurate—no updates needed.

---

## Recommendations for Next PRD

### Continue

1. **Pre-mortem with concrete mitigations** — 0/8 risks materialized because mitigations were specific and actionable
2. **Show-don't-tell prompts** — "Read these files first" + "Follow pattern from Task X" + specific line references
3. **Sequential execution with dependencies** — A→B→C order with explicit dependencies in prompts
4. **Acceptance criteria as quality gates** — Measurable, verifiable criteria (not vague)
5. **Verification task at the end** — Dedicated final check with 5-check structure

### Stop

- None — workflow was effective throughout

### Start

1. **Token budget tracking per task** — Subagents reported 6K-15K tokens per task. For future PRDs, include rough token budget estimate in planning so we know if a task is underspecified (uses too many tokens) or overspecified (uses too few).
2. **Tone preservation check in code review** — Though tone was consistent across all 9 tasks without explicit guidance, add a "Tone Check" to 11c for user-facing content PRDs. Spot-read 2-3 paragraphs and verify warm/coaching/direct voice matches existing content.

---

## Refactor Backlog Items

None created during this PRD execution.

---

## Documentation Gaps

None — AGENTS.md § 10 (Tools) and README.md already accurately describe the onboarding tool. The enhancements improved content quality but didn't change the tool's purpose, activation behavior, or user-facing description.

---

## Execution Path Review

**Size assessed**: Large (9 tasks, content enhancement across 600+ lines, multiple dependencies)  
**Path taken**: PRD (recommended by orchestrator and approved by builder)  
**Decision tree followed?**: Yes — orchestrator recommended PRD path for multi-task work with dependencies  
**Notes**: PRD path was the right choice. Direct execution would have been fragile due to template→phase dependencies and risk of scope drift without pre-mortem.
