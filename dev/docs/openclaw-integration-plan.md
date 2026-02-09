# Areté on OpenClaw: Distribution Architecture Plan

> **Status**: Exploratory
> **Created**: 2026-02-05

## Executive Summary

Transform Areté from a Cursor-native workspace into a **portable PM system** that runs on OpenClaw, enabling:

- Multi-channel access (WhatsApp, Telegram, Discord, Web)
- ClawHub marketplace distribution
- Local or cloud deployment options
- Persistent memory and context across devices

## Compatibility Analysis

### What Maps Directly

| Areté                                | OpenClaw                             | Notes                                      |
| ------------------------------------ | ------------------------------------ | ------------------------------------------ |
| `.cursor/skills/*.SKILL.md`          | `workspace/skills/*.SKILL.md`        | Same AgentSkills format                    |
| `memory/items/`, `memory/summaries/` | `MEMORY.md` + `memory/YYYY-MM-DD.md` | Similar layered structure                  |
| `context/` files                     | Workspace root files                 | Maps to `SOUL.md`, `USER.md`, custom `.md` |
| QMD integration                      | `memory.backend = "qmd"`             | Native OpenClaw support                    |

### What Needs Adaptation

- **Areté Tools** (onboarding with phases/state): Would become stateful skills with file-based state tracking
- **Projects structure**: Custom convention to document; agent manages via file ops
- **Cursor Rules**: Drop or convert to `AGENTS.md` / `SOUL.md` equivalents

## Proposed Architecture

### 1. Areté Workspace Template

An OpenClaw workspace template published as a GitHub repo:

```
arete-workspace/
├── AGENTS.md            # Agent behavior (from pm-workspace.mdc)
├── SOUL.md              # PM persona definition
├── USER.md              # User preferences (filled on setup)
├── MEMORY.md            # Long-term curated memory
├── memory/              # Daily logs (YYYY-MM-DD.md)
├── context/             # Business context (unchanged)
│   ├── business-overview.md
│   ├── products-services.md
│   └── ...
├── projects/            # Project structure (unchanged)
│   ├── active/
│   └── archive/
├── skills/              # Areté skills (OpenClaw format)
│   ├── discovery/SKILL.md
│   ├── create-prd/SKILL.md
│   ├── synthesize/SKILL.md
│   └── ...
├── templates/           # Output templates (unchanged)
└── scratchpad.md
```

### 2. Areté Skill Pack (ClawHub)

Publish Areté skills to ClawHub for easy installation:

```bash
clawhub install arete-discovery
clawhub install arete-prd
clawhub install arete-synthesis
# Or install all:
clawhub install arete-pm-pack
```

Each skill would include:

- `SKILL.md` with OpenClaw-compatible metadata
- Gating requirements (e.g., workspace files that must exist)
- Instructions that reference `{baseDir}` for templates

### 3. Memory Architecture Mapping

**Areté's 3-layer memory → OpenClaw memory:**

- **L1 Resources** (`resources/meetings/`, `resources/notes/`): Keep as workspace files, index via QMD
- **L2 Items** (`memory/items/decisions.md`, etc.): Map to `MEMORY.md` sections or dedicated files
- **L3 Summaries** (`memory/summaries/`): Map to `MEMORY.md` curated sections

Enable QMD backend for semantic search:

```json
{
  "memory": {
    "backend": "qmd",
    "qmd": {
      "paths": [
        { "name": "context", "path": "context/", "pattern": "**/*.md" },
        { "name": "projects", "path": "projects/", "pattern": "**/*.md" }
      ]
    }
  }
}
```

## Distribution Options

### Option A: ClawHub Skill Pack Only

- Publish skills to ClawHub
- Users set up their own workspace structure
- Lowest friction, highest flexibility
- **Best for**: Existing OpenClaw users who want PM capabilities

### Option B: Full Workspace Template

- GitHub template repo with complete workspace
- Users fork/clone and configure
- More opinionated, better out-of-box experience
- **Best for**: New users who want turnkey PM system

### Option C: Hybrid (Recommended)

- Core skills on ClawHub (discoverable, updatable)
- Workspace template on GitHub (structure, context templates)
- Setup wizard skill that initializes workspace
- **Best for**: Maximum reach with good UX

## Key Decisions Needed

1. **Cursor co-existence**: Do we maintain Cursor compatibility, or go OpenClaw-only?
   - Recommendation: Maintain both - Cursor for deep work, OpenClaw for mobile/async

2. **Context initialization**: How do users populate `context/` files?
   - Option: Interactive onboarding skill that asks questions and generates files

3. **Project state management**: How to track project phases without Cursor's file editing UX?
   - Option: `projects/active/[name]/state.json` + skill that manages transitions

4. **Tool lifecycle patterns**: How to port Areté Tools (like onboarding)?
   - Option: Convert to stateful skills with file-based checkpoints

## Migration Path

### Phase 1: Skill Porting

- Convert existing Areté skills to OpenClaw format
- Test in local OpenClaw workspace
- Ensure they work without Cursor-specific features

### Phase 2: Workspace Template

- Create OpenClaw workspace template
- Document structure and conventions
- Create setup/onboarding skill

### Phase 3: ClawHub Publishing

- Publish individual skills to ClawHub
- Create meta-package for full install
- Add to ClawHub search index

### Phase 4: Documentation and Launch

- User guide for OpenClaw deployment
- Comparison: Cursor vs OpenClaw usage patterns
- Community feedback loop

## Trade-offs Summary

| Gain                                    | Lose                            |
| --------------------------------------- | ------------------------------- |
| Multi-channel (WhatsApp, Telegram, Web) | Cursor's rich file editing UX   |
| Mobile access                           | IDE integration (linting, etc.) |
| Cloud deployment options                | Cursor Rules system             |
| ClawHub marketplace distribution        | Tight code workspace coupling   |
| Community skill sharing                 | Local-first simplicity          |

## Open Questions

1. Does OpenClaw's Pi agent have sufficient capability for PM workflows (no code execution, mostly text/markdown)?
2. How do we handle media (mockups, diagrams) in chat interfaces?
3. What's the user experience for reviewing/editing PRDs via WhatsApp?
4. Should we build a custom PM persona/model configuration?

## Next Steps

1. Create a proof-of-concept by porting one skill (e.g., `discovery`)
2. Test in local OpenClaw setup
3. Evaluate UX for core PM workflows
4. Decide on distribution strategy based on findings

## References

- [OpenClaw Documentation](https://docs.openclaw.ai/)
- [ClawHub Marketplace](https://clawhub.ai)
- [OpenClaw Skills Guide](https://docs.openclaw.ai/tools/skills)
- [OpenClaw Memory System](https://docs.openclaw.ai/concepts/memory)
