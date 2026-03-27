# Baseline Heuristic Tests (Pre-Implementation)

**Date**: 2026-02-14  
**AGENTS.md version**: Current compressed format (~6KB, pipe-delimited)  
**Purpose**: Capture agent behavior before any format changes to establish comparison baseline

---

## Test Execution Notes

These tests require **fresh agent contexts** to observe actual behavior. Each test should be run in a **NEW conversation** with a **NEW agent instance** to capture genuine skill identification and routing behavior.

**Why fresh contexts are required**: Agent behavior is influenced by prior context and instructions. To measure whether AGENTS.md format changes affect skill discovery, each test must start from a clean slate with only AGENTS.md in context.

**Limitation**: This baseline template is created by an agent that cannot spawn independent contexts. Manual testing by the builder is required to populate results.

---

## Test 1: PRD Creation

**Prompt**: "How would you help me create a PRD? What skills and tools would you use?"

**What to observe**:
- Does agent mention the skills index or routing?
- Which specific skills are identified?
- Does agent read skill files directly?
- Does agent call `arete skill route` or `arete route` first?

**Expected behavior (current format)**:
- Agent should identify `create-prd` skill from compressed Skills index
- Should read skill file at path shown in index
- May or may not call router (we're measuring current behavior)

**Results**: [To be filled manually]

```
Date tested: ________
Agent model: ________
Skills identified: ________
Router called: Yes/No
Skill file read: Yes/No
Notes: ________
```

---

## Test 2: Meeting Prep

**Prompt**: "I have a meeting with Sarah tomorrow. What would you do to help me prepare?"

**What to observe**:
- Does agent identify `meeting-prep` skill from index?
- Does agent call router before reading skill?
- Does agent describe the workflow from the skill?
- Does agent start searching/working without mentioning skill?

**Expected behavior (current format)**:
- Agent should identify meeting-prep from Skills index
- Should read `.agents/skills/meeting-prep/SKILL.md`
- Current hypothesis: may still call router due to habit

**Results**: [To be filled manually]

```
Date tested: ________
Agent model: ________
Skills identified: ________
Router called: Yes/No
Skill file read: Yes/No
Notes: ________
```

---

## Test 3: Unknown Request

**Prompt**: "Can you help me with something that's not a PM workflow — like refactoring this function?"

**What to observe**:
- Does agent recognize this isn't a PM-specific task?
- Does agent try to force a skill match?
- Does agent proceed normally with general coding help?
- Does agent get confused or over-index on Skills section?

**Expected behavior (current format)**:
- Agent should recognize non-PM request
- Should proceed with normal agent capabilities
- Should NOT try to force-fit into a skill

**Results**: [To be filled manually]

```
Date tested: ________
Agent model: ________
Behavior: ________
Did agent force skill match: Yes/No
Notes: ________
```

---

## Test 4: Build Skill (BUILD context only)

**Prompt**: "I want to execute a PRD autonomously. What should I do?"

**Context requirement**: Run this in the **main Areté repo** (BUILD context), not in a user installation.

**What to observe**:
- Does agent identify `execute-prd` skill from builder index?
- Does agent describe the workflow?
- Does agent mention the orchestrator/reviewer pattern?
- Does agent know about `.agents/skills/execute-prd/`?

**Expected behavior (current format)**:
- Agent should identify execute-prd from Skills section
- Should read `.agents/skills/execute-prd/SKILL.md`
- Should describe autonomous execution pattern

**Results**: [To be filled manually]

```
Date tested: ________
Agent model: ________
Skills identified: ________
Workflow described: Yes/No
Path correct: Yes/No
Notes: ________
```

---

## Summary and Analysis

[To be filled after all 4 tests are completed manually]

### Success Rate

- Test 1 (PRD Creation): ___/1
- Test 2 (Meeting Prep): ___/1
- Test 3 (Unknown Request): ___/1
- Test 4 (Build Skill): ___/1

**Overall**: ___/4 tests successful

### Key Observations

- **Router dependency**: ___
- **Skill identification accuracy**: ___
- **Format comprehension**: ___
- **Non-PM request handling**: ___

### Baseline for Comparison

After implementation changes, run identical tests and compare:
- Did skill identification improve/degrade?
- Did router calls decrease (indicating better passive context)?
- Did non-PM handling remain stable?
- Did BUILD skills remain accessible?

---

## Testing Instructions (for builder)

1. **Start fresh conversation** for each test
2. **Use the exact prompt** shown above
3. **Record observations** in the Results section
4. **Note timestamps** to track context freshness
5. **Save this file** after manual testing completes
6. **Compare to post-tests** after format changes

This baseline establishes the "before" state for measuring improvement from format changes.
