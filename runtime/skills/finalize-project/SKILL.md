---
name: finalize-project
description: Complete projects, commit changes to context, and archive. Use when the user wants to finalize, complete, wrap up, or archive a project.
primitives:
  - Problem
  - User
  - Solution
  - Market
  - Risk
work_type: operations
category: essential
intelligence:
  - context_injection
  - memory_retrieval
  - inline_review
---

# Finalize Project Skill

Guide users through completing projects, committing changes to context, and archiving.

## When to Use

- "finalize project"
- "complete this project"
- "wrap up"
- "archive project"
- "commit changes"

Also when a project has:
- Completed its outputs
- Reached its goals (or decided to stop)
- Learnings ready to capture
- Context updates identified

## Workflow

### 1. Project Review

Review the project's current state:

```markdown
## Project Review: [Name]

**Status**: [Current status]
**Goal**: [Original goal]
**Achieved**: [What was accomplished]

### Outputs Complete?
- [ ] [Output 1]: [Status]
- [ ] [Output 2]: [Status]

### Success Criteria Met?
- [ ] [Criterion 1]: [Result]
- [ ] [Criterion 2]: [Result]

### Outstanding Items
- [Any loose ends]
```

### 2. Identify Context Updates

Determine what should update core context:

```markdown
## Context Updates Needed

### business-overview.md
- [ ] No changes needed
- [ ] Update: [What and why]

### business-model.md
- [ ] No changes needed
- [ ] Update: [What and why]

### competitive-landscape.md
- [ ] No changes needed
- [ ] Update: [What and why]

### products-services.md
- [ ] No changes needed
- [ ] Update: [What and why]

### goals/strategy.md
- [ ] No changes needed
- [ ] Update: [What and why]

### users-personas.md
- [ ] No changes needed
- [ ] Update: [What and why]
```

### 3. Archive Old Context

For each context file being updated:

1. **Copy current version**:
   ```
   context/[file].md → context/_history/YYYY-MM-DD_[file].md
   ```

2. **Add archive header**:
   ```markdown
   > **Archived**: YYYY-MM-DD
   > **Reason**: Updated based on [Project Name]
   > **Replaced by**: Current version in context/
   
   ---
   [Original content below]
   ```

### 4. Update Context Files

Apply updates to context files:

1. Make the changes
2. Update "Last Updated" date
3. Add to Change History section:
   ```markdown
   ## Change History
   - YYYY-MM-DD: [What changed] (from [Project Name])
   ```

### 5. Log to Memory

#### Decisions and Learnings

For key decisions and learnings from the project, append to `.arete/memory/items/decisions.md` and `.arete/memory/items/learnings.md` using the standard format — see [PATTERNS.md](../PATTERNS.md) (extract_decisions_learnings). You may add **Review Date** for decisions and **Project** where applicable.

#### Activity Log

Add entry to `.arete/activity/activity-log.md`:

```markdown
## YYYY-MM-DD
- Completed project: [Project name]
- Key outputs: [List main deliverables]
- Context updated: [List files changed]
- Key decisions logged: [List decisions]
```

### 6. Update Project README

Mark project as complete:

```markdown
**Status**: ~~Active~~ Archived
**Completed**: YYYY-MM-DD

## Completion Summary
[Brief summary of what was accomplished]

## Outputs
- [Link to output 1]
- [Link to output 2]

## Context Changes Made
- Updated [file]: [What changed]

## Learnings Captured
- [Link to learning in .arete/memory/items/learnings.md]
```

### 7. Archive Project

Move project to archive:

```bash
# Current location
projects/active/[project-name]/

# Archive location
projects/archive/YYYY-MM_[project-name]/
```

Use date prefix (YYYY-MM) for chronological sorting.

### 8. Final Checklist

Before archiving, confirm:

- [ ] All outputs complete or documented as incomplete
- [ ] Context files updated (with old versions archived)
- [ ] Key decisions logged to memory
- [ ] Key learnings logged to memory
- [ ] Activity log updated
- [ ] Project README marked as archived
- [ ] Project moved to archive folder
- [ ] Scratchpad reviewed for related items

### 9. Post-Finalization

After archiving:

1. **Prompt user to update QMD index**:
   ```
   Project archived! To make the new content searchable, run:
     qmd update
   ```

2. **Notify user** of completion:
   - What was archived
   - What context was updated
   - What's logged in memory

3. **Suggest next steps**:
   - Related projects to start
   - Follow-up items from scratchpad
   - Review dates for decisions

**Important**: Always prompt the user to run `qmd update` after finalization so the archived project and updated context become searchable.

## Partial Completion

If project is being stopped before full completion:

1. Document what was accomplished
2. Document why stopping
3. Note what would be needed to resume
4. Still archive with clear status
5. Consider if outputs are usable as-is

## Rollback

If context updates need to be reversed:

1. Find previous version in `context/_history/`
2. Copy back to `context/`
3. Log the rollback in activity log
4. Note why in the archived version
