---
title: Lock Scope And Success Criteria For User Journe Spec
slug: lock-scope-and-success-criteria-for-user-journe-spec
status: completed
size: medium
created: 2026-02-17T05:19:51.574Z
updated: 2026-02-17T18:26:42.872Z
completed: 2026-02-17T00:00:00Z
blocked_reason: null
previous_status: null
has_review: true
has_pre_mortem: true
has_prd: true
backlog_ref: null
steps: 5
---

Absolutely — here’s a concrete plan based on our convo.

Plan:
1. **Lock template architecture + override contract** — Define and document the canonical resolution order for skill templates.
   - AC: Template resolution order is explicit and stable:  
     `workspace override → skill-local default → legacy runtime path (temporary fallback during migration)`.
   - AC: Workspace override convention is finalized (recommended):  
     `templates/outputs/<skill-id>/<template-name>.md` and optional `default.md`.
   - AC: `arete.yaml` is used only for optional default selection (e.g., prefer `default`/`simple`), not required for discovering overrides.

2. **Add skill-local template support for create-prd (and pattern for other skills)** — Co-locate defaults with the skill while preserving backward compatibility.
   - AC: `create-prd` can load templates from its own `templates/` directory (e.g., simple/regular/full).
   - AC: Existing workspaces that still use current paths continue to work (no breaking change).
   - AC: Single-template skills are supported via `default.md` convention.

3. **Implement workspace template override loading** — Make user customization zero-config via files.
   - AC: If `templates/outputs/create-prd/...` exists, it is used instead of skill default.
   - AC: If multiple variants exist, selection logic remains clear and deterministic.
   - AC: If only one override exists (`default.md`), flow can use it directly without ambiguity.

4. **Ensure templates and GUIDE ship into installed workspaces** — Fix installer/update behavior gaps.
   - AC: `arete install` copies default runtime templates into workspace `templates/**` when missing.
   - AC: `arete install` includes `GUIDE.md` at workspace root.
   - AC: `arete update` backfills missing `GUIDE.md` and missing template files without clobbering user-customized files.

5. **Add/update tests (unit + integration-focused CLI behavior)** — Validate end-to-end install/update/template behavior.
   - AC: Tests cover template precedence (override > skill-local > fallback).
   - AC: Tests cover install outputs: `GUIDE.md` exists and templates are present in new workspace.
   - AC: Tests cover update backfill behavior and non-destructive handling of user-edited templates.
   - AC: Include at least one integration-style scenario (CLI command flow) for install/update template + guide guarantees.

6. **Update docs and migration notes** — Align user-facing docs with behavior.
   - AC: Document where defaults live (skill-local) and where users override (`templates/outputs/<skill-id>/`).
   - AC: Document optional `arete.yaml` template-default key (if implemented).
   - AC: Document `GUIDE.md` presence guarantee in new workspace and update behavior.

7. **Run quality gates + ship** — Verify no regressions.
   - AC: `npm run typecheck` passes.
   - AC: `npm test` passes.
   - AC: Integration test command/scope used for this change passes (as requested).

- **Size**: large  
- **Steps**: 7  
- **Key risks**: backward-compat template loading, accidental overwrite of user custom templates, ambiguous template selection, install/update drift  
- **Dependencies**: agreement on path conventions, update policy for backfill vs overwrite, create-prd template selection behavior

Given this is **large** and architecture-affecting, I recommend PRD path next (`/prd`) before implementation.