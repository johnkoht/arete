# Agent mode: BUILDER vs GUIDE

**Date**: 2026-02-07

## Context

Two high-level contexts for the product: building Areté (this repo) vs using Areté (end-user workspace). The agent and CLI need to know which mode they are in so that build rules, build memory, and build skills are not used in production.

## What was done

- **agent_mode in arete.yaml**: New key `agent_mode: builder | guide`. Repo has `agent_mode: builder`; `arete install` writes `agent_mode: guide` in the new workspace.
- **AGENT_MODE env override**: Optional `AGENT_MODE=BUILDER` or `AGENT_MODE=GUIDE` for testing (e.g. force GUIDE in repo). Resolution: env > arete.yaml > infer (src/cli.ts + .cursor/build/ → builder, else guide).
- **Config**: `getAgentMode(workspacePath)` in `src/core/config.ts`; `AgentMode` type and `agent_mode` on `AreteConfig` in `src/types.ts`.
- **Context selector rule**: `.cursor/rules/arete-context.mdc` — always applied; defines BUILDER (build memory, dev/testing rules, .cursor/build/) vs GUIDE (product skills only, memory/items/, no build rules).
- **Install**: Writes `agent_mode: guide` in manifest; copies only **product** rules (allow-list in `workspace-structure.ts`: arete-context, arete-vision, pm-workspace, agent-memory, context-management, project-management, qmd-search). Build-only rules (dev.mdc, testing.mdc) are not copied to user workspaces.
- **Build-only rule scope**: dev.mdc and testing.mdc start with "Only when in Build Context (BUILDER mode); if guide, ignore this rule."
- **CLI**: `arete route --json` includes `agent_mode` in output. Config exports `getAgentMode`.
- **AGENTS.md**: New "Context: BUILDER vs GUIDE" section at top; documents override.

## References

- Plan: Build vs Arete System Context (BUILDER vs GUIDE, agent_mode in arete.yaml)
- `.cursor/rules/arete-context.mdc` — source of truth for the agent
- `src/core/config.ts` — getAgentMode(), loadConfig() with agent_mode
