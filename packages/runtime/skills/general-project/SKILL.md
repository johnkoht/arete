---
name: general-project
description: Start a general-purpose project for work that doesn't fit specialized categories. Use for domain ownership, migration projects, ongoing operational work, or ad-hoc project structures.
work_type: general
category: default
creates_project: true
project_template: general
primitives: []
intelligence:
  - context_injection
requires_briefing: false
---

# General Project Skill

Create a general-purpose project for work that doesn't fit specialized categories like discovery, competitive analysis, PRDs, or roadmaps.

## When to Use

- "start a project"
- "new project"
- "create project for [topic]"
- "general project"
- "project for [topic]"

## When NOT to Use

Use a specialized skill instead when the work type is clear:

- Discovery work → use `discovery` skill
- Competitive analysis → use `competitive-analysis` skill
- PRD/requirements → use `create-prd` skill
- Roadmap planning → use `construct-roadmap` skill

## Workflow

### 1. Project Setup

Create the project folder and populate README.md from the template.

**Load project README template** — run this command and use its output as the README structure:
```
arete template resolve --skill general-project --variant project
```

**Default folder structure** (use when user says "just start" or skips categorization):
```
projects/active/[topic]-project/
├── README.md          ← from template above
├── inputs/
├── working/
└── outputs/
```

### 2. Optional: Categorize Work Type

Ask the user what type of work this is — but accept minimal answers or "just start":

- Domain ownership
- Migration project
- Ongoing operational work
- Research/exploration
- Ad-hoc project
- Other

**If the user skips or gives a brief answer**: Use sensible defaults and proceed. Don't block project creation on categorization.

### 3. Customize Template

Help the user customize the README based on their needs:

- **Minimal project?** Keep: Overview, Tasks, Status Updates. Remove optional sections (Phases, Active Threads, Stakeholders).
- **Complex project?** Keep all sections and customize phases for their work type.

### 4. Ongoing Work

As the project progresses:

1. Capture inputs in `inputs/`
2. Draft and iterate in `working/`
3. Produce outputs in `outputs/`
4. Update Status Updates section regularly
5. Check off Tasks and Success Criteria as completed

### 5. Process Bulk Inputs (Optional)

If the user has dropped multiple files into `inputs/`, use the **research_intake** pattern from PATTERNS.md.

**Quick summary**: Scan inputs → analyze each → synthesize themes → update README → run `arete index` → cleanup intermediate files.

See `packages/runtime/skills/PATTERNS.md § research_intake` for the full workflow.

### 6. Finalize

When the project is complete:

1. Review outputs with user
2. Identify context updates (if any work affects workspace context)
3. Log key learnings to `.arete/memory/items/learnings.md`
4. Run `arete index` to make all project content searchable
5. Use `finalize-project` skill to archive
