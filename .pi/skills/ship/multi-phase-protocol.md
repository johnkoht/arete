---
name: multi-phase-protocol
description: Ship multi-phase mode protocol. Phase briefing format, sub-orchestrator dispatch, post-phase gate, branch strategy, and project-working-memory.md structure for plans with explicit phases.
---

# Multi-Phase Protocol

> Referenced by: `.pi/skills/ship/SKILL.md` § Multi-Phase Mode

Used when ship detects explicit phase sections (## Phase 1, ## Phase 2) in the plan.

---

## Setup

1. Run ship Phases 0-3 normally (build log, pre-mortem, review, PRD, worktree on `feature/{slug}`)
2. Create `dev/executions/{slug}/project-working-memory.md` (cross-phase context)
3. Parse plan into phase sections — one briefing per phase

---

## Phase Loop

For each phase N in dependency order:

### Branch

```bash
git checkout -b feature/{slug}-phase-N feature/{slug}
```

### Phase Briefing

Meta-orchestrator writes this before dispatching:

```markdown
## Phase N: {Phase Title}
**Branch**: feature/{slug}-phase-N (off feature/{slug})
**Execution state**: dev/executions/{slug}-phase-N/

### Tasks and ACs
[copied from plan phase section]

### Prior Phase Context
[from project-working-memory.md — Phase N-1 Outputs + Gate Feedback]

### Integration Points
[what this phase needs from prior phases; shared utilities available]

### Constraints
[from prior phase gate feedback, or explicit plan constraints]
```

### Dispatch Sub-Orchestrator

```typescript
subagent({
  agent: "orchestrator",
  agentScope: "project",
  task: `Load execute-prd skill (.pi/skills/execute-prd/SKILL.md).

Execute Phase ${N} of ${slug}.

Phase briefing:
${phaseBriefing}

Instructions:
- Branch: feature/${slug}-phase-N (already created)
- Generate prd.json mechanically from the tasks/ACs in the briefing
- If phase has 7+ tasks or unclear scope, also create prd.md
- Execution state: dev/executions/${slug}-phase-${N}/
- Read project-working-memory.md before starting`
})
```

### Post-Phase Gate

After sub-orchestrator completes:

```typescript
subagent({
  agent: "reviewer",
  agentScope: "project",
  task: `Phase gate review for ${slug} Phase ${N}.

Diff to review: git diff feature/${slug}...feature/${slug}-phase-N
Phase goals: ${phaseBriefing.tasksAndACs}
Prior context: ${phaseBriefing.priorPhaseContext}

Check:
1. Phase goals met? (all ACs satisfied?)
2. Integrates cleanly with prior phases? (no conflicts with Phase N-1 outputs)
3. Sets up Phase ${N+1} correctly? (expected outputs present?)

Return GATE_PASS or GATE_FAIL with specific feedback.`
})
```

### Gate Decision

| Result | Action |
|--------|--------|
| GATE_PASS | Merge phase branch → update project-working-memory.md → proceed to Phase N+1 |
| GATE_FAIL (attempt 1) | Send back to sub-orchestrator with reviewer feedback |
| GATE_FAIL (attempt 2) | **PAUSE**: report to builder with options (see below) |
| Builder interrupts | Pause at next gate boundary |

**GATE_FAIL escalation options** (present all three — do not choose for the builder):

| Option | Meaning | When appropriate |
|--------|---------|-----------------|
| **Fix** | Re-brief sub-orchestrator with reviewer findings + builder guidance | Failure is scoped; clear path to resolution |
| **Abort phase** | Stop the entire ship run; leave feature/{slug} at last GATE_PASS state | Phase goals conflict with reality; too risky to continue |
| **Override** | Accept the phase output as-is with documented limitations | Reviewer concern is stylistic or low-risk; builder accepts the trade-off |

**Phase failure cascade**: If a phase is aborted, all subsequent phases that depend on its outputs must also be aborted. Report which phases are affected before the builder decides.

### Merge After Gate Pass

```bash
git checkout feature/{slug}
git merge feature/{slug}-phase-N --no-ff -m "feat: {slug} phase N complete"
git branch -d feature/{slug}-phase-N
```

### Update Project Working Memory

```markdown
## Phase N Outputs
- {file}: {what was created/changed}
- {pattern name}: {description and file:line}

## Phase N Gate Feedback
- {reviewer finding for next phase to address}

## Phase N+1 Pre-Work Context
- Must import {X} from Phase N's {file}
- {constraint from gate feedback}
```

---

## After All Phases

Continue with ship Phases 5-6 (wrap, report, merge) against `feature/{slug}`.

---

## Branch Strategy

```
main
└── feature/{slug}              ← meta-orchestrator's project branch
    ├── feature/{slug}-phase-1  ← sub-orchestrator 1 (deleted after merge)
    ├── feature/{slug}-phase-2  ← sub-orchestrator 2 (deleted after merge)
    └── ...                     (each phase branch off project branch)
```

---

## Autonomous Authority Model

- **Within a phase**: Sub-orchestrator has full authority (it's running /build)
- **Between phases**: Meta-orchestrator proceeds if GATE_PASS, pauses only for:
  - GATE_FAIL after 2 attempts
  - Cross-phase integration issue detected
  - Builder explicitly interrupts
- **FYI notifications**: Brief gate completion note to builder at each phase (not a blocker)
- **Builder override**: Can always interrupt via "pause" or specify changes before next phase begins
