# Eval-Driven Development

> Adopt eval-driven development practices inspired by Deep Agents' approach. Define behavioral evals during planning, write them during build, use them to guard against regressions.

## Source

- [Deep Agents Eval Blog](https://x.com/Vtrivedy10/status/2037203679997018362) — best practices for agent evals
- Discussion: 2026-03-28

## Core Principle

> Every eval is a vector that shifts system behavior.

Before building a feature, define *what good looks like* in a verifiable way. The eval becomes acceptance criteria with teeth.

---

## Proposed Workflow Integration

```
Plan → Evals → Pre-mortem → PRD → Build → Verify against evals
         ↑                              ↓
         └──────── dogfooding ──────────┘
```

### Planning Phase

Add an "Evals" section to plans that defines:

- **Correctness**: Does it do the right thing?
- **Efficiency**: Does it do it fast enough?
- **Robustness**: Does it handle edge cases gracefully?

Example:
```markdown
## Evals

### Correctness
- [ ] `arete brief --for "prep for 1:1 with Sarah"` returns Sarah's person file content
- [ ] `arete search "decision about API"` finds entry from last week

### Efficiency
- [ ] Brief assembly <3s for typical workspace
- [ ] Search <1s cold, <200ms warm

### Robustness
- [ ] Missing person file → suggests creation (not crash)
```

---

## Behavior Catalog

Define categories of behaviors that matter for Areté:

| Category | Example Behaviors |
|----------|-------------------|
| `intelligence` | Brief relevance, search ranking, entity resolution |
| `cli_ux` | Response time, error messages, help accuracy |
| `skill_execution` | Template loading, file creation, interrupt handling |
| `integration` | Calendar sync, Fathom auth, Notion import |
| `memory` | Decision persistence, retrieval accuracy, no duplicates |

---

## Ideal Trajectories for Skills

Define what well-executed skills look like:

```markdown
## meeting-prep ideal trajectory

1. Resolve meeting (1 call)
2. Load attendee profiles (parallel)
3. Search recent context (1 call)
4. Assemble brief (1 call)
5. Present document

Expected: 4-5 tool calls, <10s, no wasted searches
```

---

## Dogfooding → Eval Pipeline

Formalize the loop:

```
Error/friction in daily use
    ↓
Capture in scratchpad/issue
    ↓
Write eval that would have caught it
    ↓
Fix the issue
    ↓
Eval passes (guards regression)
```

---

## Implementation Phases

### Phase 1: Process (No Infrastructure)

- [ ] Add "Evals" section to plan template
- [ ] Update plan-to-prd skill to require eval specs
- [ ] Trial on 2-3 plans to validate approach

### Phase 2: Structure

- [ ] Create `tests/evals/` directory structure by category
- [ ] Define eval tagging convention (correctness, efficiency, robustness)
- [ ] Document ideal trajectory format for skills

### Phase 3: Tooling

- [ ] Eval runner that filters by tag/category
- [ ] CI integration for eval runs on PRs
- [ ] Trace storage for analyzing failures

### Phase 4: Metrics

- [ ] Define correctness, latency ratio, cost ratio metrics
- [ ] Dashboard or report for eval trends over time
- [ ] Coverage tracking (which behaviors have evals?)

---

## Changes to Existing Artifacts

| Artifact | Change |
|----------|--------|
| Plan template | Add "Evals" section |
| PRD template | Require eval file paths in AC |
| Pre-mortem | Add "What if eval is wrong?" risk category |
| Post-mortem | Add eval coverage gap analysis |
| execute-prd | Verify evals pass before marking task complete |

---

## Open Questions

- Should evals live in `tests/evals/` or colocated with features?
- How to handle evals that require real workspace state (fixtures vs. real data)?
- LLM-as-judge for semantic correctness — which model, what prompts?
- How to measure skill "efficiency" when ideal trajectory varies by context?

---

## Success Criteria

- Plans include verifiable eval specs before PRD conversion
- Regressions caught by evals before shipping (not after dogfooding)
- Eval coverage visible and tracked over time
- Reduced back-and-forth on "is this done?" — evals answer definitively
