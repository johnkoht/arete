# Post-Implementation Heuristic Tests

**Date**: 2026-02-14  
**AGENTS.md version**: New compressed format (~6.45KB, pipe-delimited with compressed sections)  
**Purpose**: Test agent behavior with new AGENTS.md compilation system and compare to baseline

---

## Test Execution Notes

These tests require **fresh agent contexts** to observe actual behavior. Each test should be run in a **NEW conversation** with a **NEW agent instance** to capture genuine skill identification and routing behavior with the new compressed format.

**Why fresh contexts are required**: Agent behavior is influenced by prior context and instructions. To measure whether the new AGENTS.md format improves skill discovery, each test must start from a clean slate with only the new AGENTS.md in context.

**Limitation**: This post-test template is created by an agent that cannot spawn independent contexts. Manual testing by the builder is required to populate results.

**What changed**: AGENTS.md is now generated from `.agents/sources/` via `npm run build:agents`. The format is more compressed with pipe-delimited fields and consolidated sections. See AGENTS.md header for generation timestamp.

---

## Test 1: PRD Creation

**Prompt**: "How would you help me create a PRD? What skills and tools would you use?"

**What to observe**:
- Does agent find skills from compressed [Skills] index?
- Does agent correctly parse pipe-delimited format?
- Does agent read skill file directly without router call?
- Does agent understand the triggers/does fields?

**Expected behavior (new format)**:
- Agent should identify relevant build skills from compressed Skills index
- Should read skill file at `.agents/skills/` path shown in index
- Should NOT need router call (format is clear and scannable)
- Should correctly interpret `triggers:` and `does:` fields

**Results**: [To be filled manually]

```
Date tested: ________
Agent model: ________
Skills identified: ________
Router called: Yes/No
Skill file read: Yes/No
Format comprehension issues: None / [describe]
Notes: ________
```

**Comparison to Baseline**:

| Metric | Baseline | Post | Better/Worse/Same |
|--------|----------|------|-------------------|
| Skills identified | ___ | ___ | ___ |
| Router called | ___ | ___ | ___ |
| Time to skill file | ___ | ___ | ___ |
| Format confusion | ___ | ___ | ___ |

---

## Test 2: Meeting Prep

**Prompt**: "I have a meeting with Sarah tomorrow. What would you do to help me prepare?"

**What to observe**:
- Does agent identify correct skill from compressed index?
- Does agent understand this is a USER skill (not BUILD)?
- Does agent parse the skills root path correctly?
- Does agent call router before reading skill?

**Expected behavior (new format)**:
- Agent should identify relevant skill from Skills index
- Should understand `.agents/skills/` root path
- Should read skill file directly
- Should NOT need router call

**Results**: [To be filled manually]

```
Date tested: ________
Agent model: ________
Skills identified: ________
Router called: Yes/No
Skill file read: Yes/No
Path resolution issues: None / [describe]
Notes: ________
```

**Comparison to Baseline**:

| Metric | Baseline | Post | Better/Worse/Same |
|--------|----------|------|-------------------|
| Skills identified | ___ | ___ | ___ |
| Router called | ___ | ___ | ___ |
| Path correctness | ___ | ___ | ___ |
| Format confusion | ___ | ___ | ___ |

---

## Test 3: Unknown Request

**Prompt**: "Can you help me with something that's not a PM workflow — like refactoring this function?"

**What to observe**:
- Does agent recognize this isn't a skill-based task?
- Does agent try to force a match from Skills section?
- Does agent proceed normally with general coding help?
- Does compressed format cause agent to over-index on skills?

**Expected behavior (new format)**:
- Agent should recognize non-PM request
- Should proceed with normal agent capabilities
- Should NOT try to force-fit into a skill from index
- Compressed format should NOT increase false positive matches

**Results**: [To be filled manually]

```
Date tested: ________
Agent model: ________
Behavior: ________
Did agent force skill match: Yes/No
Format impact on behavior: None / [describe]
Notes: ________
```

**Comparison to Baseline**:

| Metric | Baseline | Post | Better/Worse/Same |
|--------|----------|------|-------------------|
| Correct recognition | ___ | ___ | ___ |
| False skill match | ___ | ___ | ___ |
| Natural behavior | ___ | ___ | ___ |

---

## Test 4: Build Skill (BUILD context only)

**Prompt**: "I want to execute a PRD autonomously. What should I do?"

**Context requirement**: Run this in the **main Areté repo** (BUILD context), not in a user installation.

**What to observe**:
- Does agent find `execute-prd` skill from compressed index?
- Does agent correctly parse the triggers and does fields?
- Does agent understand the orchestrator/reviewer pattern from `does:` field?
- Does agent read skill file at correct path?

**Expected behavior (new format)**:
- Agent should identify execute-prd from Skills section
- Should parse: `triggers:"User says Execute this PRD..."` and `does:"Autonomous PRD execution..."`
- Should read `.agents/skills/execute-prd/SKILL.md`
- Should describe workflow based on compressed `does:` field

**Results**: [To be filled manually]

```
Date tested: ________
Agent model: ________
Skills identified: ________
Workflow described: Yes/No
Path correct: Yes/No
Parsing issues: None / [describe]
Notes: ________
```

**Comparison to Baseline**:

| Metric | Baseline | Post | Better/Worse/Same |
|--------|----------|------|-------------------|
| Skills identified | ___ | ___ | ___ |
| Workflow accuracy | ___ | ___ | ___ |
| Path correctness | ___ | ___ | ___ |
| Format clarity | ___ | ___ | ___ |

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

**Format Comprehension**:
- Can agents parse pipe-delimited format? ___
- Can agents extract triggers/does fields? ___
- Does compressed format improve/degrade readability? ___

**Router Dependency**:
- Did router calls decrease vs baseline? ___
- Can agents work directly from index now? ___

**Skill Identification Accuracy**:
- Improved/same/worse vs baseline? ___
- Any false positives or negatives? ___

**Non-PM Request Handling**:
- Improved/same/worse vs baseline? ___
- Does compression affect general task handling? ___

### Comparison to Baseline

**Improvements observed**:
[List specific improvements, e.g.:]
- Router calls reduced from X to Y
- Skill identification faster
- Format more scannable
- [Add more]

**Regressions observed**:
[List any regressions, e.g.:]
- Parsing errors with pipe delimiters
- Confusion about path resolution
- Over-indexing on skills for non-PM tasks
- [Add more]

**Format-Specific Findings**:
- How well did agents handle the compressed pipe-delimited format?
- Did the `triggers:` and `does:` fields provide sufficient context?
- Did the HOW TO USE section work as intended?
- Did agents correctly identify BUILD vs USER skills?

### Conclusion

**Overall Assessment**: Pass / Fail / Needs Iteration

**Pass Criteria** (all must be true):
- [ ] All 4 tests show correct skill identification
- [ ] No significant regressions vs baseline
- [ ] Router calls reduced or same (not increased)
- [ ] Format comprehension successful (no parsing errors)
- [ ] Non-PM tasks handled correctly

**Next Steps**:
[If failing, what needs to change?]

---

## Testing Instructions (for builder)

1. **Start fresh conversation** for each test
2. **Use the exact prompt** shown above
3. **Record observations** in the Results section
4. **Fill comparison tables** vs baseline results
5. **Note timestamps** to track context freshness
6. **Document any format-specific issues** (parsing, comprehension)
7. **Save this file** after manual testing completes
8. **If tests fail**: Create iteration task (Task 11) with specific fixes

### Format-Specific Testing Notes

When testing, pay special attention to:
- Does the agent correctly parse `||` (double pipe) separators?
- Does the agent understand nested structure (e.g., `[Skills]|root:.agents/skills`)?
- Does the agent extract information from `triggers:` and `does:` fields?
- Does the agent follow the HOW TO USE instructions at the top?

These observations will inform whether the compressed format achieves the goal of improving agent comprehension without sacrificing clarity.

---

## Post-Test Reflection

**Token Budget Analysis**:
- Estimated tokens used in tests: ___ (to be filled)
- AGENTS.md size: ~6.45KB = ~1,612 tokens
- Baseline size: ~6KB = ~1,500 tokens
- Token delta: +112 tokens (~7% increase)

**ROI Assessment**:
- Does the format clarity improvement justify the token increase? ___
- Would further compression be beneficial? ___
- Are there sections that could be more concise? ___

**Format Iteration Ideas** (if needed):
[Record any ideas for format improvements based on test results]
