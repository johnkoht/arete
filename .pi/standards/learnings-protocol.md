# LEARNINGS.md Protocol

> Canonical reference for creating, finding, updating, and enforcing LEARNINGS.md files.
> Referenced by: developer.md, reviewer.md, orchestrator.md, hotfix, execute-prd, maintenance.md.

---

## Path Resolution

When you need to find or create a LEARNINGS.md:

1. Check for LEARNINGS.md in the affected file's directory
2. If not found, check the parent directory
3. Continue up to the package root (e.g., `packages/core/`)
4. If none found and the gotcha is non-obvious, create one in the directory of the primary changed file

## When to Create/Update

Update the nearest LEARNINGS.md for **any of these three cases**:

1. **Regression or bug fix** — what broke, why, and how to avoid it
2. **First use of an API, function, or pattern in this codebase** — e.g., first use of `confirm()`, a new DI approach, a dynamic import
3. **Non-obvious design decision** — something a future developer would reasonably do differently and shouldn't

If none of these cases apply, write `None — [reason]` in your completion report's Documentation Updated section. Do not silently skip.

## Entry Format

```markdown
### [Title] ([date])

**What broke / What's new / What was decided**: [description]
**Why**: [root cause or rationale]
**Fix / Pattern / Decision**: [what you did or chose]
**Prevention / Usage / Constraint**: [how to avoid or apply in future]

Source: [PRD name or ticket]
```

## 7-Section Template (for new LEARNINGS.md files)

```markdown
# {Component Name} — Learnings

## Gotchas
- **{Title}** ({date}): {description}. Fix: {how to avoid}. Source: {origin}.

## Invariants
- **{Rule}**: {what must always be true}. Violating this causes: {consequence}.

## Pre-Edit Checklist
Before editing files in this directory:
- [ ] {check item}

## Patterns
- **{Pattern name}**: {description}. Example: `{file path}`.

## Anti-Patterns
- **{Anti-pattern}**: {what not to do}. Instead: {what to do}.

## Test Considerations
- {testing notes}

## References
- {related LEARNINGS.md files or docs}
```

## Enforcement

- **Developer**: Always update for the 3 cases above. Empowered to create LEARNINGS.md proactively.
- **Reviewer**: Verify LEARNINGS.md updated after regressions and first-use patterns. **Block approval if missing.**
- **Orchestrator**: Verify during holistic review. Include relevant LEARNINGS.md in subagent context.

## Known Locations

```
.pi/skills/LEARNINGS.md
.pi/skills/execute-prd/LEARNINGS.md
.pi/skills/ship/LEARNINGS.md
.pi/skills/audit/LEARNINGS.md
.pi/skills/review-plan/LEARNINGS.md
.pi/extensions/plan-mode/LEARNINGS.md
packages/core/src/search/LEARNINGS.md
packages/core/src/services/LEARNINGS.md
packages/core/src/integrations/LEARNINGS.md
packages/core/src/integrations/krisp/LEARNINGS.md
packages/core/src/integrations/notion/LEARNINGS.md
packages/core/src/adapters/LEARNINGS.md
packages/cli/src/commands/LEARNINGS.md
packages/cli/LEARNINGS.md
packages/runtime/rules/LEARNINGS.md
packages/runtime/skills/LEARNINGS.md
packages/runtime/tools/LEARNINGS.md
packages/apps/backend/LEARNINGS.md
packages/apps/web/LEARNINGS.md
scripts/LEARNINGS.md
.agents/LEARNINGS.md
```
