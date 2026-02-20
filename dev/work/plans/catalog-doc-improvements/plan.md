---
slug: catalog-doc-improvements
title: Wire dev/catalog/capabilities.json into the agent workflow
status: building
size: small
created: 2026-02-20
tags: []
updated: 2026-02-20T18:56:50.264Z
---

# Wire dev/catalog/capabilities.json into the agent workflow

## Problem

The capability catalog (`dev/catalog/capabilities.json`) exists but is invisible to agents. Three gaps:

1. **AGENTS.md compression drops it** — `compressConventions()` in `scripts/build-agents.ts` hard-codes a summary that omits the catalog reference entirely, even though `builder/conventions.md` has a full "Capability registry check" section.
2. **execute-prd and /build don't update it** — after PRD execution or plan completion, nothing prompts catalog updates when tooling/extensions/services change.
3. **No build skills reference it** — `run-pre-mortem`, `review-plan`, and `prd-post-mortem` should be catalog-aware but aren't.

## Success Criteria

- `rg "catalog" AGENTS.md` returns at least one match (compressed conventions line)
- `rg "catalog"` returns matches in all 4 skill files (execute-prd, run-pre-mortem, review-plan, prd-post-mortem)
- `npm run typecheck` passes
- `npm test` passes

## Plan

### 1. `scripts/build-agents.ts` — Add catalog line to `compressConventions()`

Add after the `|execution:...` line (~line 342):

```
|catalog:dev/catalog/capabilities.json — check before changing tooling/extensions/services; update after changes
```

**AC**: Rebuilt AGENTS.md contains `catalog` in the `[Conventions]` section.

### 2. `.pi/skills/execute-prd/SKILL.md` — Add catalog check to Holistic Review (step 16)

Insert a new bullet after the "Documentation check" bullet (~line 360):

```
- **Catalog check**: If this PRD touched extensions, tools, services, integrations, or external packages, update `dev/catalog/capabilities.json` — add new entries, update paths/status/entrypoints, bump `lastUpdated`.
```

**AC**: Step 16 of execute-prd includes a catalog check bullet.

### 3. `.agents/skills/run-pre-mortem/SKILL.md` — Add catalog reference to risk table

Expand the `| **Dependencies** |` row (~line 44) to mention checking `dev/catalog/capabilities.json` for affected capabilities, `readBeforeChange` paths, and provenance.

**AC**: The Dependencies row references the catalog.

### 4. `.agents/skills/review-plan/SKILL.md` — Add Catalog row to all three checklists

Add a new row to each of Plan Review, PRD Review, and Implementation Review tables:

```
| Catalog | If work touches tooling/extensions/services, are `dev/catalog/capabilities.json` entries current? |
```

**AC**: All three checklist tables contain a Catalog row.

### 5. `.pi/skills/prd-post-mortem/SKILL.md` — Add catalog staleness section to output template

Insert after the `## Refactor Backlog` section in the template (~line 131):

```
## Catalog Updates Needed
Did this PRD add, change, or remove any capabilities tracked in `dev/catalog/capabilities.json`? If yes, list what needs updating.
```

**AC**: Post-mortem output template includes a "Catalog Updates Needed" section.

### 6. Rebuild & validate

```bash
npm run build:agents:dev
rg "catalog" AGENTS.md
rg "catalog" .pi/skills/execute-prd/SKILL.md
rg "catalog" .agents/skills/run-pre-mortem/SKILL.md
rg "catalog" .agents/skills/review-plan/SKILL.md
rg "catalog" .pi/skills/prd-post-mortem/SKILL.md
npm run typecheck
npm test
```

**AC**: All validation commands pass.

## Out of Scope

- Updating `dev/catalog/capabilities.json` content itself
- Adding catalog awareness to GUIDE MODE skills (user-facing)
- Automated catalog validation tooling

## Risks

- **Low**: Additive-only changes to documentation/prompts — no code logic changes
- Quality gates (`typecheck` + `test`) will catch any `build-agents.ts` syntax issues
