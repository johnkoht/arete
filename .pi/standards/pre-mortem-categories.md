# Pre-Mortem Risk Categories

> Canonical list of risk categories for pre-mortem analysis.
> Referenced by: run-pre-mortem, execute-prd, ship.
> Source: execute-prd (most complete set, 11 categories including learnings-driven additions).

---

## Risk Categories

| Category | Key Question | Example |
|----------|-------------|---------|
| **Context Gaps** | Will subagents/future you have enough context? | "B1 needs to know about SearchProvider from A1-A3" |
| **Test Patterns** | Do we have test patterns to follow? | "Need to reference testDeps pattern from qmd.ts" |
| **Integration** | How will pieces fit together? | "B2 async change might break callers" |
| **Scope Creep** | How to prevent over-implementation? | "Strict acceptance criteria adherence" |
| **Code Quality** | What patterns must be followed? | ".js imports, no any, error handling" |
| **Reuse / Duplication** | Could subagent reimplement instead of reuse? | "Use getSearchProvider(); don't add new search logic" |
| **Dependencies** | Are task dependencies clear? | "Can't do B1 until A3 is done" |
| **Platform Issues** | Any platform-specific risks? | "ical-buddy might not be installed" |
| **State Tracking** | How to track progress across sessions? | "Update prd.json after each task" |
| **Documentation** | What docs need updates? | "README install flow, ONBOARDING paths" |
| **Build Scripts** | Do referenced scripts exist? | "Verify `npm run build:agents:dev` exists before putting in prompts" |

## When to Skip Categories

If a category doesn't apply to the specific work, skip it. Don't force risks. Typical PRDs generate 6-10 risks, not 11.

## Risk Entry Format

```markdown
### Risk: [Short descriptive name]

**Problem**: [What could go wrong and why]

**Mitigation**: [Specific, concrete action to prevent it]

**Verification**: [How to check mitigation was applied]
```

## Proven Mitigation Patterns

These mitigation strategies have 100% effectiveness across 51 PRD executions:

1. **File reading lists** — "Before starting, read: [exact paths]" in subagent prompts
2. **Pattern references** — "Follow [pattern] from [file:line]" (show, don't describe)
3. **Pre-mortem mitigations in task prompts** — embed mitigations directly in the developer's prompt, not just documented
4. **Phantom task detection** — check if proposed features already exist before starting (saved 80% of work on reimagine-v2)
5. **Sequential subagent execution** — never parallel on shared codebase
