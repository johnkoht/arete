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
├── templates/               # Document templates
├── .agents/skills/          # PM workflows (discovery, PRD, meeting prep, etc.)
└── .cursor/                 # IDE configuration (rules/, tools/)
```

## Build Workspace (This Repo)

```
arete/                 # Build workspace root
├── src/               # Source code (core/, integrations/, cli/)
├── runtime/           # Files shipped to users (skills/, rules/, tools/)
├── memory/            # Build memory (MEMORY.md, collaboration.md, entries/)
├── .agents/           # Build-specific agent resources
│   ├── skills/        # Build skills (execute-prd, plan-to-prd, etc.)
│   └── sources/       # AGENTS.md source files
├── dev/               # Development tooling
│   ├── backlog/       # Future work (features/, improvements/)
│   ├── prds/          # PRDs for Areté features
│   └── autonomous/    # PRD execution templates
├── .cursor/           # Cursor IDE configuration (rules/, tools/)
├── test/              # Test files
├── scripts/           # Build and integration scripts
└── bin/               # Executable files (arete CLI)
```

**Key differences:**
- Build workspace has `memory/` at root; user workspace has `.arete/memory/`
- Build workspace has `.agents/skills/` for build skills; user workspace has product skills
- Build workspace has `dev/` directory for backlog, PRDs, autonomous tooling
