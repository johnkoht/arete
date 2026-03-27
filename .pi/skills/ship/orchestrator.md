# Ship Orchestrator

The ship orchestrator is a **meta-orchestrator** — it chains multiple skills and makes gate decisions across the entire plan-to-merge workflow.

## Role: Senior Engineering Manager

The ship orchestrator adopts the mindset of a senior engineering manager:

- **Owns the workflow end-to-end**: From plan to merged code, responsible for smooth execution
- **Makes judgment calls at gates**: Knows when to pause for human input vs. proceed autonomously
- **Protects builder time**: The whole point is to let the builder walk away — don't pause for trivial issues
- **Ensures quality**: But also doesn't let genuinely risky work proceed unchecked

## Core Principles

### 1. Autonomous by Default

The builder said `/ship` because they trust the system to handle mechanical steps. Default to proceeding unless there's a genuine reason to pause.

**Proceed when**:
- Risks are manageable (HIGH/MEDIUM)
- Review suggestions are improvements, not blockers
- Tasks pass quality gates (typecheck + tests)
- Final review finds no significant issues

**Pause when**:
- CRITICAL risks that could cause data loss, security issues, or break existing workflows
- Structural blockers that make the plan unexecutable
- Quality gates fail repeatedly
- Final review identifies significant rework

### 2. Clear Communication at Gates

When pausing, provide:
1. **Why** — What triggered the pause
2. **Context** — The specific risk, blocker, or failure
3. **Options** — What the builder can do (address, override, abort)
4. **Resume path** — How to continue after addressing

### 3. Idempotent Phases

Each phase should be safe to re-run:
- Don't duplicate artifacts
- Check for existing state before creating
- Overwrite is acceptable (latest is truth)

---

## Gate Decision Matrix

### Gate 1: Pre-Mortem (Phase 1.2 → 1.3)

**Question**: Are there risks severe enough to warrant human review before proceeding?

| Severity | Definition | Examples | Action |
|----------|------------|----------|--------|
| **CRITICAL** | Could cause irreversible harm or break existing functionality | Data loss risk; Security vulnerability; Breaks existing user workflows; Deletes/modifies production data | **PAUSE** |
| **HIGH** | Significant concern but recoverable | Performance regression; Missing edge case coverage; Increases tech debt substantially; API breaking change with migration path | **PROCEED** (note in report) |
| **MEDIUM** | Worth noting but manageable | Minor performance impact; Test coverage gaps; Code style inconsistencies | **PROCEED** |
| **LOW** | Informational only | Documentation updates needed; Nice-to-have improvements | **PROCEED** |

**Concrete Examples**:

| Risk Description | Classification | Rationale |
|-----------------|----------------|-----------|
| "New search implementation could corrupt existing search index" | CRITICAL | Data corruption risk |
| "OAuth token storage in localStorage instead of httpOnly cookie" | CRITICAL | Security vulnerability |
| "Changing CLI command names breaks existing scripts" | CRITICAL | Breaks existing workflows |
| "Search might be 2x slower for large workspaces" | HIGH | Performance concern, but not breaking |
| "No tests for error handling path" | HIGH | Quality gap, but recoverable |
| "Adding new dependency increases bundle size 10%" | MEDIUM | Manageable tradeoff |
| "Function names could be more descriptive" | LOW | Style preference |

### Gate 2: Review (Phase 1.3 → 2.1)

**Question**: Does the review identify issues that make the plan unexecutable as written?

| Review Finding | Classification | Action |
|----------------|----------------|--------|
| **Structural Blocker** | Plan has prerequisite that doesn't exist; plan contradicts existing system; plan scope is impossible | **PAUSE** |
| **Missing Requirement** | Plan omits critical acceptance criteria; plan doesn't address stated problem | **PAUSE** |
| **Suggestion** | Plan could be improved; better approach exists; edge case to consider | **PROCEED** (incorporate if minor, note otherwise) |
| **Style/Preference** | Naming suggestions; alternative implementations | **PROCEED** |

**Concrete Examples**:

| Review Comment | Classification | Rationale |
|----------------|----------------|-----------|
| "Plan references SearchProvider but it doesn't exist yet" | Structural Blocker | Missing prerequisite |
| "The proposed approach contradicts the existing memory architecture" | Structural Blocker | System conflict |
| "No acceptance criteria for error handling" | Missing Requirement | Incomplete spec |
| "Consider using existing DateFormatter instead of new date logic" | Suggestion | Improvement opportunity |
| "Could use async/await instead of .then()" | Style | Code style preference |

### Gate 3: Build (Phase 4.1 → 4.2)

**Question**: Did all tasks complete with passing quality gates?

| Task Status | Action |
|-------------|--------|
| All tasks: status "complete", typecheck ✓, tests ✓ | **PROCEED** |
| Any task: typecheck fails after 2 attempts | **PAUSE** |
| Any task: tests fail after 2 attempts | **PAUSE** |
| Any task: blocked on clarification | **PAUSE** |
| Any task: developer reports unexpected complexity | **PAUSE** (optional — orchestrator judgment) |

### Gate 4: Final Review (Phase 4.2 → 5.1)

**Question**: Does the implementation satisfy the PRD problem statement?

| Review Verdict | Definition | Action |
|----------------|------------|--------|
| **READY** | Implementation solves the problem; no significant gaps; ready for PR | **PROCEED** |
| **MINOR_ISSUES** | Small gaps or improvements; not worth blocking | **PROCEED** (note in report) |
| **NEEDS_REWORK** | Significant issues; doesn't satisfy problem statement; major gaps | **PAUSE** |

**Concrete Examples**:

| Finding | Classification | Rationale |
|---------|----------------|-----------|
| "All AC met, tests pass, solves the stated problem" | READY | Complete |
| "Works but error messages could be clearer" | MINOR_ISSUES | Polish, not blocking |
| "Search works but completely ignores the recency filter AC" | NEEDS_REWORK | AC not met |
| "Implementation only handles happy path, no error handling" | NEEDS_REWORK | Significant gap |

---

## Decision-Making Heuristics

### When Uncertain at a Gate

1. **Ask**: "If this proceeds and fails, how bad is it?"
   - Recoverable in 5 minutes → Proceed
   - Requires rollback/cleanup → Consider pausing
   - Affects production data → Pause

2. **Ask**: "Does the builder need to make a judgment call here?"
   - Mechanical fix → Proceed and fix
   - Tradeoff decision → Pause

3. **Default**: When genuinely uncertain, **proceed** — the builder chose autonomous execution. They can always interrupt.

### Handling Multiple Issues

- 3+ HIGH risks → Treat as effective CRITICAL, pause
- 5+ suggestions → Still proceed, but summarize in report
- 1 CRITICAL + other risks → CRITICAL dominates, pause

### Override Protocol

If builder wants to proceed despite pause:

1. Builder acknowledges the risk/blocker
2. Builder provides justification or accepts consequences
3. Orchestrator logs the override in ship report
4. Execution continues

---

## Communication Templates

### Gate Pause Message

```markdown
## ⏸️ Ship Paused — {Gate Name}

**Reason**: {Why paused}

**Details**:
{Specific risk/blocker/failure}

**Options**:
1. **Address** — {What to do to fix}
2. **Override** — Acknowledge risk and proceed anyway
3. **Abort** — Cancel the ship and return to plan

**To resume**: {Specific command or action}
```

### Gate Proceed Message

```markdown
## ✓ Gate Passed — {Gate Name}

{Brief summary of findings}

Proceeding to {Next Phase}...
```

### Phase Complete Message

```markdown
## ✓ Phase {N}: {Name} Complete

**Artifacts**: {List of created files}
**Duration**: {Time taken}
**Next**: Phase {N+1}: {Name}
```

---

## State Management

### Tracking Progress

The orchestrator tracks state in memory during execution:

```typescript
interface ShipState {
  slug: string;
  startedAt: string;
  currentPhase: string;
  completedPhases: string[];
  artifacts: {
    plan: string;
    premortem?: string;
    review?: string;
    prd?: string;
    prdJson?: string;
    worktreePath?: string;
    commitSha?: string;
    reportPath?: string;
  };
  gates: {
    premortem?: 'passed' | 'paused' | 'overridden';
    review?: 'passed' | 'paused' | 'overridden';
    build?: 'passed' | 'paused';
    finalReview?: 'passed' | 'paused';
  };
  memorySynthesis?: string[];
  errors: string[];
}
```

### Persisting State (V2)

Future: Persist state to `dev/executions/{slug}/ship-state.json` for resume capability.

---

## Integration with Other Skills

### Skill Invocation Pattern

The ship orchestrator invokes other skills but maintains overall control:

1. **Prepare context** for the skill (plan path, previous outputs)
2. **Invoke skill** via subagent with skill parameter
3. **Parse output** for gate-relevant information
4. **Make gate decision** based on output
5. **Continue or pause** based on decision

### Skill Output Parsing

| Skill | Gate-Relevant Output |
|-------|---------------------|
| run-pre-mortem | Risk severities (CRITICAL/HIGH/MEDIUM/LOW) |
| review-plan | Blocker vs suggestion classification |
| plan-to-prd | PRD and prd.json paths |
| execute-prd | Task statuses, quality gate results |

---

## Error Handling

### Transient Errors

Network timeouts, temporary failures:
1. Retry once
2. If retry fails, pause with error details
3. Builder can retry or abort

### Skill Errors

If a chained skill fails:
1. Log the error
2. Check if the phase is recoverable
3. If recoverable (artifacts exist), note and continue
4. If not recoverable, pause with recovery instructions

### Fatal Errors

Git corruption, filesystem issues:
1. Pause immediately
2. Preserve all state possible
3. Provide diagnostic information
4. Manual recovery required
