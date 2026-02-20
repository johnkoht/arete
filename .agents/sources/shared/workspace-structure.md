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
├── templates/               # Template override space (see templates/README.md; defaults live in .agents/skills/)
├── .agents/skills/          # PM workflows (discovery, PRD, meeting prep, etc.)
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
│   ├── skills/        # Build skills (execute-prd, plan-to-prd, etc.)
│   └── sources/       # AGENTS.md source files
├── dev/               # Development tooling
│   ├── catalog/       # Machine-friendly capability inventory (tools/extensions/services/packages)
│   ├── plans/         # All plans and ideas (status determines lifecycle)
│   ├── archive/prds/  # Archived legacy PRD documents
│   └── autonomous/    # Autonomous execution templates
├── .cursor/           # Cursor IDE configuration (rules/, tools/)
├── .pi/               # Pi coding agent configuration (extensions/, skills/, agents/)
└── scripts/           # Build and integration scripts
```

**Key differences:**
- Build workspace has `memory/` at root; user workspace has `.arete/memory/`
- Build workspace has `.agents/skills/` for build skills; user workspace has product skills
- Build workspace has `dev/` directory for plans, archive, and autonomous tooling
- Plan system of record: `dev/work/plans/` (status field determines lifecycle); archive: `dev/work/archive/`
