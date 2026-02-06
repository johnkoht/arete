# PRD Placement: Build Folder, Not Projects

**Date**: 2026-02-06

## What Happened

PRDs for Areté feature development (Meeting Propagation, Meeting Intelligence) were initially created in `projects/active/meeting-*-prd/`. That was wrong.

## Correct Placement

**PRDs for Areté development belong in `.cursor/build/prds/`**, not in `projects/active/`.

### Why

- **`projects/active/`** is for PMs *using* Areté — their discovery, PRD, and analysis projects. It is the user workspace.
- **`.cursor/build/`** is internal build tooling — never shipped to users. PRDs that describe Areté features we are building are build artifacts.

### Structure

```
.cursor/build/prds/
├── meeting-propagation/
│   ├── README.md
│   └── prd.md
├── meeting-intelligence/
│   ├── README.md
│   └── prd.md
└── {feature-name}/
    ├── README.md
    └── prd.md
```

### Migration Done

- Moved Meeting Propagation and Meeting Intelligence PRDs from `projects/active/` to `.cursor/build/prds/`.
- Removed `projects/active/meeting-propagation-prd/` and `projects/active/meeting-intelligence-prd/`.

## Rules Updated

- **dev.mdc**: Added "PRDs for Areté features go in `.cursor/build/prds/`".
- **prd-to-json skill**: Updated to look in `.cursor/build/prds/` first.
- **AGENTS.md**: Documented PRD placement in Common Patterns.
