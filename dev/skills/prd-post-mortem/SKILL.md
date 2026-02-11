---
name: prd-post-mortem
description: Systematic post-mortem analysis after PRD execution. Analyzes outcomes, extracts learnings, synthesizes subagent reflections, and creates memory entry. Use after completing a PRD via execute-prd.
category: build
work_type: analysis
primitives: []
requires_briefing: false
---

# PRD Post-Mortem Skill

Conduct systematic post-mortem analysis after autonomous PRD execution. Extracts learnings, analyzes pre-mortem effectiveness, synthesizes subagent insights, and updates build memory.

## When to Use

- After completing a PRD via execute-prd skill
- User says: "Create the post-mortem" or "Extract learnings from this PRD"
- At end of PRD execution before closing

## Workflow

### 1. Gather Data

Read these files:
- `dev/autonomous/prd.json` — Task outcomes, statuses, iteration counts, commit SHAs
- `dev/autonomous/progress.txt` — Subagent reflections, learnings, implementation notes
- `dev/prds/{feature-name}/prd.md` — Original PRD with pre-mortem (if included)

### 2. Analyze Metrics

Calculate and record:
- **Tasks**: Total, completed, failed, success rate
- **Iterations**: Total iterations required across all tasks
- **Tests**: Tests added, final test count, pass rate
- **Pre-mortem**: Risks identified, risks materialized, mitigation effectiveness
- **Commits**: Total commits, commit SHAs
- **Token usage**: Orchestrator estimate + subagent estimates (if captured)

### 3. Synthesize Subagent Reflections

From progress.txt, extract and group:
- **Memory effectiveness**: What % of reflections mentioned progress.txt, MEMORY.md, collaboration.md helping?
- **Rule patterns**: Which rules were most cited as helpful? Any confusion?
- **Common suggestions**: What improvements did multiple subagents suggest?
- **Token patterns**: Average by task complexity (tiny/small/medium/large)

### 4. Pre-Mortem Review

For each pre-mortem risk:
- Did it materialize? (Yes/No)
- Was mitigation applied? (Yes/No)
- Was mitigation effective? (Yes/No/Partial)
- Evidence (from task outcomes)

Create effectiveness table.

### 5. Extract Key Learnings

Identify:
- **What worked well**: Patterns that drove success (be specific)
- **What didn't work**: Patterns that caused friction or failure
- **Surprises**: Positive or negative outcomes not anticipated
- **Collaboration patterns**: How did builder interact? Preferences observed?

### 6. Generate Recommendations

**For immediate use**:
- System updates (skills, rules, templates)
- Documentation updates (AGENTS.md, README)
- Refactor backlog items to address
- Process improvements

**For future PRDs**:
- Prompt template improvements
- Workflow refinements
- New pre-mortem categories
- Rule adjustments

### 7. Create Memory Entry

Write `dev/entries/YYYY-MM-DD_{feature-name}-learnings.md`:

```markdown
# {Feature Name} - PRD Execution Learnings
**Date**: YYYY-MM-DD
**PRD**: dev/prds/{feature-name}/prd.md
**Branch**: {branch-name}
**Status**: Complete

## Metrics
- Tasks: X/Y (Z% success rate)
- Iterations: N required
- Tests: +X tests (total: Y/Y passing)
- Pre-mortem: A/B risks materialized
- Commits: N commits
- Token usage: ~XK tokens

## Pre-Mortem Effectiveness
| Risk | Materialized? | Mitigation Effective? | Evidence |
|------|--------------|----------------------|----------|
| ... | ... | ... | ... |

## What Worked Well
1. [Specific pattern] - [Evidence/outcome]
2. ...

## What Didn't Work
1. [Issue] - [Impact]
2. ...

## Subagent Insights
- Memory: X% found progress.txt valuable; Y% referenced MEMORY.md
- Rules: Most helpful = {rule names}; confusion = {issues if any}
- Common suggestions: [list]
- Token patterns: Tiny=XK, Small=YK, Medium=ZK, Large=AK

## Collaboration Patterns
- Builder interactions: [observations]
- Preferences: [what builder valued]

## Recommendations
### Immediate
1. [Update] - [Why] - [Where]

### For Next PRD
1. [Improvement] - [Rationale]

## Refactor Backlog
- [Item 1] - Priority: Low/Medium/High
- [Item 2] - ...

## Learnings
[Key insights for collaboration.md or future reference]
```

### 8. Update Build Memory Index

Add line to `dev/MEMORY.md`:
```markdown
- YYYY-MM-DD: {Feature name} — {one-line summary}. See dev/entries/YYYY-MM-DD_{feature-name}-learnings.md
```

### 9. Update Collaboration Profile

Run the **synthesize-collaboration-profile** skill (`dev/skills/synthesize-collaboration-profile/SKILL.md`) to push learnings from the new entry (and any other recent entries) into `dev/collaboration.md`. If the builder prefers to defer, end with: "Consider running **synthesize-collaboration-profile** when convenient to update the profile from entry learnings."

## Output Format

**During execution:**
Show progress briefly (don't repeat entire workflow).

**Final output:**
```markdown
# Post-Mortem Complete: {Feature Name}

**Memory entry created**: dev/entries/{date}_{name}-learnings.md
**MEMORY.md updated**: Added entry line
**Collaboration**: [Ran synthesize-collaboration-profile — profile updated | Consider running synthesize-collaboration-profile to update profile from entry learnings]

## Quick Summary
- {X}/{Y} tasks successful ({Z}% first-attempt)
- {A}/{B} pre-mortem risks materialized
- {N} key learnings extracted
- {M} recommendations for next PRD

See the memory entry for full analysis.
```

## Success Criteria

- ✅ Memory entry created with all 9 sections
- ✅ MEMORY.md updated with entry line
- ✅ Learnings extracted and actionable
- ✅ Recommendations specific and prioritized
