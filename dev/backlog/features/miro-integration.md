# Miro Integration

**Status**: Backlog  
**Priority**: Medium  
**Effort**: Medium (4–6 tasks)  
**Owner**: TBD

---

## Overview

Add a Miro integration so users can create boards from templates (e.g. discovery) directly from Areté. Enables "spin up a Miro board from my template" when starting discovery, competitive analysis, or other workflows.

---

## Problem

- Users already use Miro templates for discovery, workshops, and planning.
- Manually creating a board from a template and linking it to a project is friction.
- No connection between Areté projects and Miro boards; context lives in two places.
- Discovery (and other) skills can’t offer "create Miro board" as part of the workflow.

---

## Solution

**1. Miro integration** (new integration, push-focused)

- **Location**: `src/integrations/miro/`
- **Capabilities**: `push` (create board from template); optional `pull` later (fetch board metadata/export).
- **Config**: API token, named template IDs (e.g. `discovery`, `competitive-analysis`) in `arete.yaml` or `.credentials/`.
- **CLI**: `arete push miro --template <name> [--project <slug>]` → create board, return URL, optionally write link to project README.

**2. Integration structure** (follow AGENTS.md §2)

```
src/integrations/miro/
├── client.ts   # Miro REST API client (auth, create board from template)
├── types.ts    # Board, template, config types
├── config.ts   # Load template IDs, credentials
├── save.ts     # (Optional) Write board URL to project README
└── index.ts    # CLI commands, register in registry
```

**3. Skill integration**

- **Discovery skill**: Optional step after "Set up workspace" — "Create Miro board from template?" → run `arete push miro --template discovery --project <name>`, add board URL to project.
- **Other skills** (e.g. competitive-analysis, create-prd) could later offer the same pattern with different template names.
- Miro remains optional; skills work with or without the integration configured.

**4. Configuration**

```yaml
# arete.yaml (example)
integrations:
  miro:
    templates:
      discovery: "<miro-template-id>"
      competitive-analysis: "<miro-template-id>"
# API token in .credentials/miro.json or env MIRO_ACCESS_TOKEN
```

---

## Tasks (Draft)

1. **Miro API client**
   - Implement client for Miro REST API (auth, create board from template).
   - Types for board, template, API responses.
   - Config loading (token, template IDs).

2. **Config and credentials**
   - Document how to obtain Miro API token and template IDs.
   - Add `arete integration configure miro` (or use existing integration config pattern).
   - Store token in `.credentials/` (gitignored).

3. **Push command**
   - `arete push miro --template <name> [--project <slug>] [--json]`.
   - Create board from template, output URL; if `--project` given, write link to project README.

4. **Registry and CLI**
   - Register Miro in `src/integrations/registry.ts` with `implements: ['push']`.
   - Wire command in CLI.

5. **Discovery skill enhancement**
   - Add optional step: "Create Miro board from template?" when starting discovery.
   - If yes and Miro configured, run push command and add board URL to project README.

6. **Tests and docs**
   - Unit tests for client (mocked API); test config loading.
   - Update AGENTS.md §2 (Integrations) and any user-facing integration docs.

---

## References

- **Integrations pattern**: AGENTS.md §2 (Integrations System); `src/integrations/fathom/` or `src/integrations/registry.ts`.
- **Discovery skill**: `.agents/skills/discovery/SKILL.md`.
- **Miro API**: [Miro Developer Platform](https://developers.miro.com/) (REST API, board creation, templates).

---

## Notes

- Miro’s “create board from template” may require specific API endpoints or template sharing flow; verify API docs before implementation.
- Consider rate limits and error messages (e.g. invalid template ID, expired token).
- Future: `pull` to sync board metadata or export to workspace for context injection.
