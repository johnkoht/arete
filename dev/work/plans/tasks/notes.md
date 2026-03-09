# Tasks — Discussion Notes

## Context (2026-03-08)

Exploring whether Areté needs a **Task** primitive separate from **Commitment**.

### The "Primary Tool" Bet

User is evaluating whether Areté becomes the user's primary tool — managing role, context, and actions in a single place. This would be easier than Notion/Asana for personal productivity, but requires:

1. Having the right primitives (tasks, meetings, goals, etc.)
2. Ability to sync with external tools if users have them

### Two Kinds of Primitives

| Type | Examples | Purpose |
|------|----------|---------|
| **Product Primitives** | Problem, User, Solution, Market, Risk | Conceptual model for product thinking |
| **Object Primitives** | Meeting, Person, Project, Task, Goal | Data entities in the system |

Product primitives are defined in `packages/core/src/models/common.ts`:
```typescript
export type ProductPrimitive = 'Problem' | 'User' | 'Solution' | 'Market' | 'Risk';
```

Object primitives are implicit across:
- `workspace-structure.ts` (directories)
- `models/entities.ts` (Person, Meeting, Project, Commitment)
- `models/memory.ts` (Decision, Learning, Observation)

### The Gap

**Commitments** = relational (I owe Sarah / Sarah owes me)
**Tasks** = personal (just work I need to do)

Example non-commitment tasks:
- "Review the Q2 roadmap draft" — no person attached
- "Research competitor pricing" — for myself
- "Prep for board meeting" — a task, not a promise

These currently scatter across scratchpad, week priorities, project files.

### Decision Points

1. **Formalize Task?** Yes — needed for Cmd+K UX, sync story, "primary tool" bet
2. **Storage?** Structured (`.arete/tasks.yaml`) — matches Commitments, better for queries/sync
3. **Keep it lean** — no subtasks, priorities, labels. Text + status + due + project.
4. **Elevation paths** — Task → Priority, Task → Commitment

### Related Plans

- **Command Palette**: Cmd+K needs to know where "add task" goes
- **Meeting Enhancements**: Action items from meetings → Tasks or Commitments
- **External Sync**: Future sync with Linear/Asana/Notion
