# Agent Learning Fixes — Research Notes

## Questions Investigated

1. Are orchestrator/subagents instructed to update LEARNINGS.md?
2. Are they instructed to update memory/entries?
3. Are they instructed to update documentation?
4. Is there a consolidated close-out checklist?

## Findings

### 1. LEARNINGS.md

| Agent | Reads LEARNINGS.md | Updates LEARNINGS.md |
|-------|-------------------|---------------------|
| Developer (`developer.md`) | ✅ Step 1 | ✅ Step 5 |
| Reviewer (`reviewer.md`) | ✅ Technical Review Step 1 | ✅ Flags missing updates in AC Review Step 2 |
| Orchestrator (`orchestrator.md`) | ❌ Not mentioned | ❌ Not mentioned |
| Execute-PRD SKILL.md | ✅ Step 9 (pre-task check, includes in subagent prompts) | Not directly — delegates to developer |

**Gap**: Orchestrator agent file doesn't mention LEARNINGS.md at all. It relies on the SKILL.md workflow steps, but if used outside execute-prd, it won't carry this behavior.

### 2. Memory Entries

| Agent | Creates entries | Updates MEMORY.md index |
|-------|----------------|------------------------|
| Developer | ❌ (correctly — not its job) | ❌ |
| Reviewer | ❌ (correctly — not its job) | ❌ |
| Orchestrator (`orchestrator.md`) | ❌ Not in agent file | ❌ Not in agent file |
| Execute-PRD SKILL.md | ✅ Step 20 (MANDATORY, blocks final report) | ✅ Step 20 |

**Gap**: Memory responsibility lives only in SKILL.md Step 20, not in the orchestrator agent persona. The orchestrator.md is only 19 lines total.

### 3. Documentation Updates

| Agent | Checks for doc impact | Updates docs |
|-------|----------------------|-------------|
| Developer | ❌ | ❌ |
| Reviewer | ❌ | ❌ |
| Orchestrator (`orchestrator.md`) | ❌ Not in agent file | ❌ |
| Execute-PRD SKILL.md | ✅ Pre-mortem Step 6 (risk category), Step 7 (doc mitigation, spawns doc subagent), Step 16 (holistic review), Step 21 (final report section) | ✅ Via doc subagent |

**Gap**: Documentation awareness is scattered across 4 different steps in the skill. No agent persona owns "think about documentation." Reviewer doesn't flag doc impact during code review.

### 4. Close-Out Checklist

**Current state**: Responsibilities are spread across SKILL.md Steps 16-21 without a consolidated checklist.

**What's covered (scattered)**:
- ✅ LEARNINGS.md updates (developer + reviewer)
- ✅ Memory entry creation (SKILL Step 20)
- ✅ MEMORY.md index update (SKILL Step 20)
- ✅ Documentation audit (SKILL Steps 7, 16, 21)
- ✅ Catalog update (SKILL Step 16)
- ✅ Pre-mortem analysis (SKILL Steps 17-18)
- ✅ Refactor items captured (Reviewer Step 4)

**What's missing**:
- ❌ AGENTS.md rebuild (if sources changed)
- ❌ Backlog cleanup
- ❌ Scratchpad updates

## Structural Issues

1. **`orchestrator.md` is paper-thin** — 19 lines total vs. developer (202 lines) and reviewer (151 lines). No "How You Think", no orientation, no failure modes, no heuristics, no definition of done.

2. **No consolidated close-out checklist** — The orchestrator has to remember to follow Steps 16-21 in sequence. A compact checklist would make it harder to skip items.

3. **Reviewer missing documentation awareness** — Senior engineers naturally flag "this change affects user-facing behavior, docs need updating" but the reviewer persona doesn't include this.

4. **Confusing overlap** — `engineering-lead.md` (189 lines, rich "How You Think", detailed heuristics) describes a "Senior Engineering Manager" but isn't the one running execute-prd. The `orchestrator.md` (19 lines) IS the one running execute-prd but has almost no substance.

## Mental Model: "Dropped Into the War Zone"

### Developer — feels equipped
- Clear identity, clear heuristics, clear red flags
- Knows when to stop and ask vs. push forward
- Minor wish: knowing what went wrong in previous tasks (orchestrator's job to feed)

### Reviewer — mostly equipped, one gap
- Detailed step-by-step checklist, LEARNINGS.md verification
- Gap: laser-focused on task code, never asked to think about doc staleness or user-facing behavior shift

### Orchestrator — feels naked
- 19 lines, no identity, no "How You Think"
- No orientation ritual (what to read first)
- No between-task intelligence (learn and adapt vs. mechanical dispatch)
- No definition of done-done (problem solved + learning captured + docs current)
- No failure mode awareness (what typically goes wrong)
- All intelligence lives in SKILL.md's 21 steps, not in the persona
