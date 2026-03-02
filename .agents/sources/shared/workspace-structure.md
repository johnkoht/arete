# Workspace Structure

## User Workspace (Installed)

```
your-workspace/
├── now/                     # Current focus (scratchpad, week, today, agendas)
├── goals/                   # Strategy and goals (strategy, quarter, initiatives)
├── context/                 # Core context (business, users, products, competitive)
├── projects/                # Project workspaces (active/, archive/)
├── resources/               # Raw inputs (meetings/, notes/)
├── .arete/                  # System-managed (memory/, activity/)
├── people/                  # People tracking (internal/, customers/, users/)
├── templates/               # Template override space (see templates/README.md; defaults live in .pi/skills/)
├── .pi/skills/          # PM workflows (discovery, PRD, meeting prep, etc.)
└── .cursor/                 # IDE configuration (rules/, tools/)
```

## Build Workspace (This Repo)

```
arete/                 # Build workspace root
├── packages/          # Monorepo packages
│   ├── core/          # @arete/core (services, adapters)
│   ├── cli/           # @arete/cli (thin CLI over core)
│   └── runtime/       # Skills, rules, tools, templates
├── memory/            # Build memory (MEMORY.md, collaboration.md, entries/)
├── .agents/           # Build-specific agent resources
│   └── sources/       # AGENTS.md source files (guide only)
├── dev/               # Development tooling
│   ├── catalog/       # Machine-friendly capability inventory (tools/extensions/services/packages)
│   ├── plans/         # All plans and ideas (status determines lifecycle)
│   ├── archive/prds/  # Archived legacy PRD documents
│   └── autonomous/    # Autonomous execution templates
├── .pi/               # Pi coding agent configuration
│   ├── skills/        # Build skills (execute-prd, plan-to-prd, etc.)
│   ├── agents/        # Role definitions (orchestrator, reviewer, developer, etc.)
│   ├── expertise/     # Domain profiles (core/, cli/)
│   ├── standards/     # Build standards, patterns, maintenance
│   └── extensions/    # Plan-mode extension
└── scripts/           # Build and integration scripts
```

**Key differences:**
- Build workspace has `memory/` at root; user workspace has `.arete/memory/`
- Build workspace has `.pi/skills/` for build skills; user workspace has product skills
- Build workspace has `dev/` directory for plans, archive, and autonomous tooling
- Plan system of record: `dev/work/plans/` (status field determines lifecycle); archive: `dev/work/archive/`
