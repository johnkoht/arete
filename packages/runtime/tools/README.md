# Areté Tools

> **For complete documentation** on tools and lifecycle workflows, see [GUIDE.md](../../GUIDE.md).

Tools are **lifecycle-based, stateful capabilities** that complement the Skills system. While Skills are stateless procedures you can invoke anytime, Tools have phases, track progress, and eventually complete or deprecate.

## Tools vs Skills

```
Skills                               Tools
─────────────────────────────        ──────────────────────────────
Stateless procedures                 Stateful capabilities
Always available                     Lifecycle-bound
Invoke anytime                       Activate → Progress → Complete
No persistence                       Project-based state
Examples: discovery, PRD             Examples: onboarding, product launch
```

**Use a Skill when**: You need to perform a repeatable workflow (write a PRD, run discovery, analyze competitors).

**Use a Tool when**: You need sustained support over time with progress tracking and eventual completion (onboarding at a new job, launching a product, quarterly planning cycle).

## How Tools Work

### 1. Tool Definition

Each tool lives in `.cursor/tools/[tool-name]/` with:

```
.cursor/tools/[tool-name]/
├── TOOL.md           # Tool definition (like SKILL.md for skills)
├── templates/        # Tool-specific templates
└── resources/        # Optional: curated resources, guides
```

The `TOOL.md` file defines:
- What the tool does and when to use it
- Phases and their goals
- Scope options (e.g., comprehensive vs streamlined)
- Project structure when activated
- Graduation/completion criteria

### 2. Tool Activation

When you activate a tool, it creates a project in `projects/active/`:

```
projects/active/[tool-instance]/
├── README.md         # Status, current phase, progress tracking
├── plan/             # Plans and schedules
├── inputs/           # Raw inputs during the tool's lifecycle
├── working/          # In-progress work
└── outputs/          # Deliverables and outcomes
```

The tool definition guides behavior; the project tracks state.

### 3. Tool Lifecycle

```
┌─────────────┐
│  Available  │  Tool exists in .cursor/tools/
└──────┬──────┘
       │ User activates
       ▼
┌─────────────┐
│   Active    │  Project created in projects/active/
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ In Progress │  Phases progress, state updates
└──────┬──────┘
       │ Graduation criteria met
       ▼
┌─────────────┐
│ Completing  │  Final review, outputs finalized
└──────┬──────┘
       │ Project archived
       ▼
┌─────────────┐
│  Archived   │  Tool instance complete
└─────────────┘
```

### 4. Tool Completion

Tools don't just expire—they **graduate**. Each tool defines clear graduation criteria. When met:

1. Review outputs and learnings
2. Promote any context updates (e.g., move draft context files to `context/`)
3. Log key decisions and learnings to memory
4. Archive the project
5. The tool instance is complete

## Available Tools

| Tool | Purpose | Lifecycle |
|------|---------|-----------|
| [onboarding](onboarding/TOOL.md) | 30/60/90 day new job success plan | 90-150 days |

## Using a Tool

Tools are now **discoverable via the router**. Just describe what you want to do, and the system will automatically route you to the right tool:

- "I'm starting a new job"
- "Help me onboard at my new role"
- "Seed my context from Fathom"
- "Import my meeting history"

The assistant will:
1. Route to the appropriate tool (via `arete route` or `arete skill route`)
2. Read the tool definition
3. Ask about scope preference (if applicable)
4. Create the project structure in `projects/active/[tool-name]/`
5. Guide you through the first phase

You can also activate a tool explicitly by saying "Start [tool-name] tool" or "Activate [tool-name]".

## Creating New Tools

Use the template at `.cursor/tools/_template/TOOL.md` as a starting point.

A good tool candidate has:
- **Defined lifecycle**: Clear start and end conditions
- **Phases**: Distinct stages with different goals
- **Progress tracking**: Measurable milestones
- **Completion criteria**: How you know it's done
- **Recurring value**: Others would benefit from the same workflow

### Tool Ideas

| Tool Idea | Lifecycle | Triggers |
|-----------|-----------|----------|
| Product Launch | Countdown to date | Launch complete + retrospective |
| Quarterly Planning | ~2-3 weeks cyclical | Planning period ends |
| Job Search | Indefinite | Offer accepted |
| Domain Learning | 30-60 days | Context built, fluency achieved |
| Team Transition | 60-90 days | New team fully onboarded |

## Design Principles

1. **Tools are templates, projects are instances** - The tool definition is reusable; each activation creates a unique project
2. **Progressive disclosure** - Comprehensive by default, streamlined options available
3. **Graduation over abandonment** - Clear criteria for completion, not just time passing
4. **Areté philosophy** - Tools embody excellence, helping you thrive not just survive
