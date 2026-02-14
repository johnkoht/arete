# Pre-Mortem Template

Use this template before starting multi-step work (PRDs, large refactors, new systems).

## Purpose

Identify risks before starting, create actionable mitigations, prevent problems proactively.

## When to Use

- ✅ PRD execution (multiple tasks with dependencies)
- ✅ Complex refactors (touching many files)
- ✅ New systems (unfamiliar patterns)
- ✅ Integration work (multiple services/components)
- ❌ Single, well-understood tasks (overkill)

## Risk Categories

Consider these when brainstorming risks:

| Category | Key Question | Example |
|----------|-------------|---------|
| **Context Gaps** | Will subagents/future you have enough context? | "B1 needs to know about SearchProvider from A1-A3" |
| **Test Patterns** | Do we have test patterns to follow? | "Need to reference testDeps pattern from qmd.ts" |
| **Integration** | How will pieces fit together? | "B2 async change might break callers" |
| **Scope Creep** | How to prevent over-implementation? | "Strict acceptance criteria adherence" |
| **Code Quality** | What patterns must be followed? | ".js imports, no any, error handling" |
| **Dependencies** | Are task dependencies clear? | "Can't do B1 until A3 is done" |
| **Platform Issues** | Any platform-specific risks? | "ical-buddy might not be installed" |
| **State Tracking** | How to track progress across sessions? | "Update prd.json after each task" |

## Template

For each identified risk:

```markdown
### Risk: [Short descriptive name]

**Problem**: [What could go wrong and why]

**Mitigation**: [Specific, concrete action to prevent it]

**Verification**: [How to check mitigation was applied]
```

## Example (From intelligence-and-calendar PRD)

### Risk: Fresh Context = Missing Dependencies

**Problem**: Subagent for B1 (memory retrieval) needs to know about A1-A3 (SearchProvider interface, QMD provider, fallback provider). Fresh context means they won't have the full picture.

**Mitigation**: In subagent prompt, explicitly list files to read first:
- "Before starting, read: src/core/search.ts, src/core/search-providers/qmd.ts, test/core/search.test.ts"
- Include mini-context summary: "SearchProvider interface is complete with QMD and fallback implementations"

**Verification**: Check that prompt includes file reading list before spawning subagent.

---

### Risk: Test Failures Without Context

**Problem**: Subagent implements B1, tests fail because they don't understand A3's testDeps pattern or existing test structure.

**Mitigation**:
- Before spawning B1 agent, review existing test patterns (test/core/search.test.ts, test/core/search-providers/*.test.ts)
- In prompt: "Follow testDeps pattern from qmd.test.ts for mocking providers"
- If tests fail, review will identify pattern mismatches and provide specific examples

**Verification**: Check prompt includes "testDeps pattern from qmd.ts" reference.

---

### Risk: Integration Issues Between Tasks

**Problem**: B1 and B2 both upgrade different services. They pass individually but briefing.ts (B3) fails because they made incompatible assumptions about score normalization.

**Mitigation**:
- After B1 completes, test the integration myself before spawning B2
- Run `npm test` across full suite, not just new tests
- Review type changes in src/types.ts to ensure consistency
- Before B3, verify B1+B2 together work correctly

**Verification**: After each task, check that full test suite passes (not just new tests).

## During Execution

1. **Reference continuously**: Before each task, check: "Which pre-mortem mitigations apply here?"
2. **Verify application**: After each task, confirm: "Did I apply the relevant mitigations?"
3. **Update if needed**: If new risks emerge, add them to the pre-mortem

## Post-Mortem

After completion, analyze effectiveness:

| Risk | Materialized? | Mitigation Applied? | Effective? | Notes |
|------|--------------|---------------------|-----------|-------|
| Fresh context | No | Yes (file lists) | Yes | All subagents had full context |
| Test patterns | No | Yes (testDeps ref) | Yes | Consistent mocking throughout |
| Integration | No | Yes (full suite) | Yes | Caught async changes breaking callers |
| ... | ... | ... | ... | ... |

**Document learnings** in build memory entry.

## Success Indicators

- **0 risks materialized** = Perfect execution
- **Mitigations applied** = Pre-mortem was actionable
- **Patterns emerged** = Some mitigations became reusable templates
- **Surprises documented** = Post-mortem captured what wasn't anticipated

## References

- **Example Session**: `.cursor/build/entries/2026-02-09_builder-orchestration-learnings.md`
- **Skill**: `.cursor/build/skills/execute-prd/SKILL.md` (includes mandatory pre-mortem)
- **Rule**: `.cursor/rules/dev.mdc` (pre-mortem guidance for complex work)
