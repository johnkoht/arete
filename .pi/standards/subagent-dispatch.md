# Subagent Dispatch Protocol

> Canonical reference for dispatching subagents (developer, reviewer) in BUILD skills.
> Referenced by: execute-prd, ship, audit.

---

## Tool Reference

```typescript
// Dispatch a developer to implement a task
subagent({ agent: "developer", task: "<prompt>", agentScope: "project" })

// Dispatch a reviewer for sanity check or code review
subagent({ agent: "reviewer", task: "<prompt>", agentScope: "project" })
```

**Parameters**:
- `agent`: Name of the agent definition in `.pi/agents/<name>.md`
- `task`: The full prompt/instructions for the subagent
- `agentScope`: Must be `"project"` to load project-level agent definitions from `.pi/agents/`

**Returns**: The subagent's final assistant message (text).

**Important**: All subagent calls inherit the current working directory. Run from the **worktree root** so subagents work in the correct location.

## Pre-Flight Check (MANDATORY)

Before dispatching any subagent, verify the tool is available:

```typescript
subagent({ action: "list" })
```

- **If succeeds**: Tool available. Proceed.
- **If fails**: HALT. Notify the builder with options: (1) fix and retry, (2) continue as single agent (reduced quality), (3) abort. **No silent fallback.**

## Prompt Template (Proven Pattern)

The following structure has 95%+ first-attempt success rate across 51 PRD executions:

```markdown
You are implementing Task [ID] from [prd-name] PRD.

**PRD Goal**: [1 sentence]
**Task ID**: [id]
**Title**: [title]
**Description**: [full description]

**Acceptance Criteria**:
- [bullet 1]
- [bullet 2]

**Execution State Path**: dev/executions/{slug}/

**Context - Read These Files First**:
1. `.pi/expertise/{area}/PROFILE.md` — domain map
2. [file] — [why relevant]
3. [LEARNINGS.md path] — component gotchas

**Important Patterns**:
- [Pattern]: Reference [specific file]

**Reuse & Design**:
- Use existing services/helpers per AGENTS.md. Do not reimplement.
- Apply DRY/KISS. Prefer existing modules over new ones.

**Pre-Mortem Mitigations Applied**:
- [Mitigation 1]
- [Mitigation 2]

After implementation:
1. Run npm run typecheck (must pass)
2. Run npm test (must pass)
3. Commit with message: "[type]([scope]): [description]"
4. Update prd.json and progress.md

**Signals** (include in your completion report):
- REUSE: [helper you used that was in your prompt]
- MISSING_CONTEXT: [thing you had to discover yourself]
- NEW_PATTERN: [pattern you created that could be reused]
- BLOCKER_RESOLVED: [issue you resolved]
- NOTHING_NOVEL: [if implementation followed existing patterns exactly]
```

## Key Principles (from learnings)

1. **Explicit file lists** — list every file the subagent should read, with why. This is the #1 success factor.
2. **Pre-mortem mitigations in prompt** — embed relevant mitigations directly. 0 risks materialized in PRDs that do this.
3. **Show, don't describe** — "Follow testDeps pattern from `qmd.ts`" beats "use good patterns."
4. **Sequential execution** — never run parallel subagents that edit the same codebase. Lock contention causes failures. (Evidence: reimagine-v1 2026-03-05, workspace-areas 2026-03-25)
5. **LEARNINGS.md injection** — include relevant LEARNINGS.md files in context to prevent regressions.
6. **Expertise profiles** — include `.pi/expertise/{domain}/PROFILE.md` as the first context file for domain-specific work.

## Expertise Profile Selection

| Task touches | Attach |
|-------------|--------|
| `packages/core/` | `.pi/expertise/core/PROFILE.md` |
| `packages/cli/` | `.pi/expertise/cli/PROFILE.md` |
| `packages/apps/backend/` | `.pi/expertise/backend/PROFILE.md` |
| `packages/apps/web/` | `.pi/expertise/web/PROFILE.md` |
| Both core and cli | Both profiles |
| Docs, config, `.pi/` only | No profile needed |

### Profile Section Extraction (for reviewer context)

- **Core**: `## Invariants`, `## Anti-Patterns & Common Mistakes`, `## Key Abstractions & Patterns`
- **CLI**: `## Purpose & Boundaries`, `## Command Architecture` + first 100 lines of `## Command Map`
- **Fallback**: First 150-200 lines of the profile
