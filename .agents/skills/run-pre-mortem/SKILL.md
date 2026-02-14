---
name: run-pre-mortem
description: Run a pre-mortem risk analysis before starting multi-step work. Identifies risks across 8 categories and creates actionable mitigations. Use before plans, refactors, or new systems.
category: build
work_type: development
---

# Run Pre-Mortem Skill

Run a structured pre-mortem risk analysis before starting multi-step development work.

⚠️ **INTERNAL TOOLING** — For developing Areté itself, not for end users.

## When to Use

- ✅ Before executing approved plans (3+ steps or complex)
- ✅ Before large refactors (touching many files)
- ✅ Before new systems (integrations, providers, etc.)
- ❌ For single, well-understood tasks (overkill)

## Prerequisites

- A plan exists (approved or draft)
- You understand what needs to be built
- You're about to start implementation

## Workflow

### 1. Load the Template

Read `dev/templates/PRE-MORTEM-TEMPLATE.md` — this is the source of truth for risk categories and format.

### 2. Review the 8 Risk Categories

Work through each category from the template:

| Category | Key Question |
|----------|-------------|
| **Context Gaps** | Will future you/subagents have enough context? |
| **Test Patterns** | Do we have test patterns to follow? |
| **Integration** | How will pieces fit together? |
| **Scope Creep** | How to prevent over-implementation? |
| **Code Quality** | What patterns must be followed? |
| **Dependencies** | Are task dependencies clear? |
| **Platform Issues** | Any platform-specific risks? |
| **State Tracking** | How to track progress across sessions? |

### 3. Identify Risks

For each category, ask: "What could go wrong in THIS work?"

- Be specific: "Task B1 needs SearchProvider context from A1-A3"
- Not generic: "Things might break"

If a category doesn't apply, skip it (don't force risks).

### 4. Create Mitigations

For each risk, define:
- **Problem**: What could go wrong and why
- **Mitigation**: Specific, concrete action to prevent it
- **Verification**: How to check mitigation was applied

Use the template format:

```markdown
### Risk: [Short descriptive name]

**Problem**: [What could go wrong and why]

**Mitigation**: [Specific, concrete action to prevent it]

**Verification**: [How to check mitigation was applied]
```

### 5. Present to Builder

Output the complete pre-mortem with:
- All identified risks (typically 4-8)
- Concrete mitigations for each
- Verification criteria

Ask: "Do you see any other risks? Are these mitigations sufficient?"

### 6. Store for Reference

Save the pre-mortem analysis in context or to a file (e.g., plan header, scratchpad) so it can be referenced during execution.

During work: Before each task, check "Which mitigations apply here?"

## Output Format

```markdown
## Pre-Mortem: [Work Name]

### Risk 1: [Name]

**Problem**: [Description]

**Mitigation**: [Action]

**Verification**: [How to check]

---

### Risk 2: [Name]

**Problem**: [Description]

**Mitigation**: [Action]

**Verification**: [How to check]

---

[... continue for all risks ...]

## Summary

Total risks identified: [N]
Categories covered: [List]

**Ready to proceed with these mitigations?**
```

## Tips

**Be concrete**: "List files to read" beats "provide context"
**Be actionable**: Mitigations you can actually apply
**Be verifiable**: Know when mitigation was successful

## Example

See `dev/templates/PRE-MORTEM-TEMPLATE.md` for full examples from the intelligence-and-calendar PRD execution (8 risks, 0 materialized).

## References

- **Template**: `dev/templates/PRE-MORTEM-TEMPLATE.md` (8 risk categories, examples)
- **Example session**: `memory/entries/2026-02-09_builder-orchestration-learnings.md`
- **Used by**: `dev/skills/execute-prd/SKILL.md` (Phase 1: mandatory pre-mortem)
