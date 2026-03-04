# Skill Integration Hooks — PRD

**Status**: draft | **Size**: large (10 steps, 5 phases)

---

## Problem

Community skills (from skills.sh, GitHub, etc.) produce great output that becomes orphaned — invisible to Areté's intelligence layer (context queries, meeting prep, briefings, daily plans). Today, integration behaviors (indexing, context updates, project scaffolding) are embedded as prose in native SKILL.md files. Community skills get none of this.

## Goal

Any installed skill automatically benefits from Areté's intelligence layer. Outputs are indexed, surfaced in relevant workflows, and organized in the workspace — without the skill author needing to know about Areté.

## Success Criteria

1. A user installs a skills.sh skill and runs it; the output is searchable via `arete context --for`
2. The install experience shows the user how to customize integration (or ask an agent to help)
3. Native skills use the same hook system (no prose duplication of "run arete index")
4. Template resolution works: skill-bundled templates → user workspace overrides → Areté defaults

---

## Design Decisions (Resolved)

| Decision | Resolution |
|----------|-----------|
| Injection mechanism | Bake `## Areté Integration` section into SKILL.md at install/update time using sentinel markers (`<!-- ARETE_INTEGRATION_START/END -->`) for idempotent replacement |
| Install UX | CLI prints guidance; agent-assisted setup in conversation |
| Output path | Pattern in profile (`resources/competitive/{name}.md`), agent fills `{name}` at runtime |
| Multiple output types | `outputs` array + separate `context_updates` array |
| Indexing | Already whole-directory (`**/*.md`); `index: true` = inject "run `arete index`" instruction |
| Native vs community profile location | Read from SKILL.md frontmatter first, fall back to `.arete-meta.yaml` sidecar |
| Commented YAML in `.arete-meta.yaml` | Skip — rely on integration guide for self-documentation instead of fighting `yaml.stringify()` |
| `type: none` / empty outputs | No `## Areté Integration` section injected; `generateIntegrationSection()` returns `null` |
| Root-level skill files deployment | Add root-level `.md` file copy to `create()` and `syncCoreSkills()` — fixes PATTERNS.md + enables guide |
| Generate/inject functions location | Standalone utils in `packages/core/src/utils/integration.ts` (not on SkillService) — avoids service boundary issues |

---

## Pre-Mortem Mitigations (incorporated into plan)

| Risk | Mitigation | Where in Plan |
|------|-----------|---------------|
| **R1: SKILL.md mutation on update/reinstall** | Sentinel comment markers for idempotent injection; inject in both `install()` and `update()` paths | Steps 2a, 2b |
| **R2: Native migration behavior drift** | Catalog all current prose before migrating; before/after comparison per skill; one-at-a-time migration | Step 0, Step 7 |
| **R3: Template resolution without registry** | `resolveTemplatePath` works by filesystem probe independent of `TEMPLATE_REGISTRY`; confirm this | Step 3 |
| **R4: `.arete-meta.yaml` backward compat** | All integration fields optional; test with old/new/partial YAML | Step 1 |
| **R5: Schema scope creep** | Validate schema against all 9 native skills BEFORE coding; document gaps as future work | Step 0 |
| **R6: `arete update` doesn't regenerate** | Wire injection into `WorkspaceService.update()` as post-sync step from day one | Step 2b |
| **R7: Path cross-references** | Use workspace-relative paths or CLI commands in generated section; follow LEARNINGS.md | Step 2a |
| **R8: Test coverage gaps** | Tests for every new function; run full suite after each step | All steps |
| **R9: Agent compliance with appended section** | Validate Phase 1 with real community skill + agent conversation before committing to Phase 3 migration | Step 4 (validation gate) |

---

## Review Concerns (addressed)

| # | Concern | Resolution |
|---|---------|-----------|
| 1 | `_integration-guide.md` won't deploy (root-level files not copied) | Added Step 2b: fix `create()` and `syncCoreSkills()` to copy root-level `.md` files. Also fixes PATTERNS.md deployment (pre-existing bug). |
| 2 | Step 2 overloaded / crosses service boundary | Split into 2a (pure functions in `utils/integration.ts`) and 2b (wiring into install + update). Functions are standalone, no service dependency. |
| 3 | Empty/none integration handling | Added to design decisions: `generateIntegrationSection()` returns `null` when `type: none` or empty outputs. No section injected. |
| 4 | `SkillMetadata` and `SkillCandidate` need integration fields | Added to Step 1: update `SkillMetadata` with integration fields. `SkillCandidate` evaluated — integration not needed for routing (routing uses triggers/description, not output config). |
| 5 | Commented YAML vs `yaml.stringify()` | Dropped commented YAML approach. Rely on integration guide for documentation. `buildAreteMeta()` stays simple. |
| 6 | Multi-IDE note | Added to Step 2b: `.agents/skills/` is IDE-agnostic, no adapter handling needed. |
| 7 | Step 0 output location | Specified: save as plan artifact `native-skill-profiles.md`. |
| DA | Agent compliance with appended section | Added validation gate between Phase 2 and Phase 3. Phase 3 doesn't start until appended section approach is validated with real agent usage. |

---

## Plan

### Phase 0: Pre-Work Validation (before any code)

**0. Validate integration profile schema against native skills**
- Write the integration profile YAML for all 9 native skills that have prose integration instructions
- Use ONLY the proposed schema — don't expand it
- For each skill, catalog the current prose instructions (exact text and location in SKILL.md)
- If any skill's behavior can't be expressed in the schema, document it as a gap before coding
- Save as plan artifact: `dev/work/plans/skill-integration-hooks/native-skill-profiles.md`
- **Mitigates**: R2 (migration drift), R5 (scope creep)
- AC: Document exists with all 9 integration profiles AND the current prose they replace; any schema gaps are flagged

### Phase 1: Integration Profile & Context Injection

**1. Define the Skill Integration Profile schema**
- Add types to `packages/core/src/models/skills.ts`:
  ```typescript
  type SkillIntegrationOutput = {
    type: 'project' | 'resource' | 'context' | 'none';
    path?: string;       // pattern with {name} placeholder
    template?: string;   // variant name for template resolution
    index?: boolean;     // trigger arete index after saving
  };

  type SkillIntegration = {
    outputs?: SkillIntegrationOutput[];
    contextUpdates?: string[];  // context file paths to update
  };
  ```
- Add `integration?: SkillIntegration` to `SkillDefinition` (optional — backward compat)
- Add `integration?: SkillIntegration` to `SkillMetadata` (so frontmatter parsing captures it)
- Note: `SkillCandidate` does NOT need integration — routing uses triggers/description, not output config
- Update `getInfo()` in `packages/core/src/services/skills.ts` to read integration from:
  1. SKILL.md frontmatter (for native skills)
  2. `.arete-meta.yaml` sidecar (for community skills, merged with frontmatter)
- **Mitigates**: R4 (all fields optional, tested with old/new/partial YAML)
- AC:
  - Types compile (`npm run typecheck`)
  - `getInfo()` returns integration profile from frontmatter and/or sidecar
  - Existing `.arete-meta.yaml` files without `integration` parse correctly
  - Tests: old YAML → `integration` is `undefined`; new YAML → populated; partial → populated

**2a. Build integration section generation (pure functions)**
- Create `packages/core/src/utils/integration.ts` with standalone functions (NOT on SkillService):
  - `generateIntegrationSection(skillId: string, integration: SkillIntegration): string | null`
    - Returns `null` when all outputs are `type: none` or `outputs` is empty/undefined → no section injected
    - Generates markdown with output location, indexing, and template instructions
    - Uses workspace-relative paths or CLI commands (never skill-relative) — **mitigates R7**
    - For templates: uses `arete template resolve --skill {id} --variant {name}`
  - `injectIntegrationSection(skillMdContent: string, section: string | null): string`
    - Uses sentinel markers: `<!-- ARETE_INTEGRATION_START -->` / `<!-- ARETE_INTEGRATION_END -->`
    - Idempotent: replaces existing section if markers found, appends if not
    - When `section` is `null`: removes existing section if markers found, no-ops otherwise
    - **Mitigates R1** (survives update/reinstall via re-injection)
  - `deriveIntegrationFromLegacy(def: SkillDefinition): SkillIntegration | undefined`
    - Maps `creates_project` + `project_template` → integration profile for native skills without explicit integration fields
- Export from `packages/core/src/utils/index.ts`
- AC:
  - Pure functions with full test coverage in `packages/core/test/utils/integration.test.ts`
  - `generateIntegrationSection('competitive-analysis', profile)` returns correct markdown
  - `generateIntegrationSection('coaching', { outputs: [{ type: 'none' }] })` returns `null`
  - `injectIntegrationSection(content, section)` is idempotent (inject twice → same result)
  - `deriveIntegrationFromLegacy({ createsProject: true, projectTemplate: 'analysis' })` produces correct profile

**2b. Wire injection into install and update paths**
- In `SkillService.install()`: after writing `.arete-meta.yaml`, read integration profile, call `generateIntegrationSection()` + `injectIntegrationSection()`, write updated SKILL.md
- In `WorkspaceService.update()`: after `syncCoreSkills()`, iterate all skills in `.agents/skills/`:
  - For each skill: `getInfo()` → `deriveIntegrationFromLegacy()` or read explicit integration → `generateIntegrationSection()` → `injectIntegrationSection()` → write
  - Note: `.agents/skills/` is IDE-agnostic — no adapter-specific handling needed
  - **Mitigates R6** (wired from day one)
- Fix root-level file deployment: update `create()` and `syncCoreSkills()` to also copy `.md` files at the skills directory root (not just subdirectories) — this fixes PATTERNS.md deployment (pre-existing bug) and enables the integration guide (Step 6)
- AC:
  - After `arete skill install`, SKILL.md has `## Areté Integration` section with markers
  - After `arete update`, all skills with integration profiles have sections (regenerated)
  - After `arete update`, `PATTERNS.md` exists in `.agents/skills/` (root-level file copy works)
  - Re-running inject on same file is idempotent
  - Test: install → verify markers → simulate SKILL.md overwrite → re-inject → verify restored

**3. Template resolution for community skills**
- Confirm `resolveTemplatePath()` works by filesystem probe without needing `TEMPLATE_REGISTRY` entry — **mitigates R3**
- If confirmation fails: make resolution fall back to filesystem scan when skill ID not in registry
- Add info message when workspace override supersedes skill template (in `arete template resolve` output)
- AC:
  - Community skill with `templates/report.md` resolves via `arete template resolve --skill <id> --variant report`
  - Workspace override at `templates/outputs/<id>/report.md` wins with user notification
  - `TEMPLATE_REGISTRY` is NOT modified for community skills

### Phase 2: Enhanced Install Experience

**4. Install-time guidance and validation gate**
- After successful install in CLI (`skill.ts`), print:
  - Summary of what integration was configured (output type, path, indexing)
  - "Edit `.agents/skills/<name>/.arete-meta.yaml` to customize, or ask an agent to help"
- `buildAreteMeta()` stays simple — no commented YAML (integration guide handles documentation)
- **Validation gate**: Before proceeding to Phase 3, manually test with a real community skill:
  - Install a skills.sh skill → verify integration section appears in SKILL.md
  - Have an agent run the skill → observe whether agent follows the `## Areté Integration` section
  - If agent compliance is low, reconsider injection approach before Phase 3
  - **Mitigates R9** (agent compliance validation)
- AC:
  - User sees actionable guidance after install
  - Existing install flow (overlap detection, etc.) still works
  - Validation report exists documenting agent compliance with appended section

**5. Fix existing skill README deployment**
- The existing `packages/runtime/skills/README.md` already exists but isn't deployed to user workspaces (same root-level file bug fixed in 2b)
- Verify README.md reaches `.agents/skills/README.md` after the 2b fix
- AC: `README.md` exists in user workspace `.agents/skills/` after install/update

**6. Agent integration setup guide**
- Create `packages/runtime/skills/_integration-guide.md` (deployed via the root-level file copy from 2b)
- Content: what integration hooks are, output types with examples, how to edit `.arete-meta.yaml`, example profiles for different skill types (project-based, resource-based, context-based, conversational)
- AC:
  - Guide deployed to `.agents/skills/_integration-guide.md` in user workspaces
  - An agent reading the guide can produce a valid integration profile

### Phase 3: Native Skill Migration (blocked on Phase 2 validation gate)

**7. Migrate native skills to use integration profiles**
- **Prerequisite**: Phase 2 validation gate passed (agent compliance confirmed)
- For each of the 9 native skills with prose integration instructions:
  1. Add integration fields to SKILL.md frontmatter (using schema from Step 1)
  2. Remove duplicated prose ("Run `arete index`", "Save to resources/", etc.)
  3. Verify `generateIntegrationSection()` produces equivalent instructions to the removed prose
  4. Compare before/after against the catalog from Step 0 — **mitigates R2**
- Skills: competitive-analysis, discovery, create-prd, construct-roadmap, general-project, capture-conversation, save-meeting, process-meetings, rapid-context-dump
- Migrate one at a time, `npm test` between each — **mitigates R2**
- AC:
  - Each skill has integration frontmatter fields
  - No prose integration instructions remain in SKILL.md body
  - Generated `## Areté Integration` section matches the Step 0 catalog
  - `npm test` passes after each migration

**8. Update PATTERNS.md and documentation**
- Add "Skill Integration" pattern to `packages/runtime/skills/PATTERNS.md`:
  - How integration profiles work (schema reference)
  - How the generated section is produced
  - How to customize via `.arete-meta.yaml`
- Update existing patterns that reference post-completion steps (e.g., `research_intake` mentions `arete index`)
- If skill loading behavior changed: update AGENTS.md sources and rebuild (`npm run build:agents:dev`)
- AC: PATTERNS.md accurately describes the hook system; no stale references to old prose patterns

### Phase 4: Indexing & Surfacing

**9. Verify end-to-end indexing flow**
- When `index: true` in output profile, generated section includes "Run `arete index`"
- Document which output types should set `index: true`: project ✓, resource ✓, context ✓, none ✗
- Verify end-to-end: install community skill → agent runs it → `arete index` → `arete context --for` finds output
- AC:
  - Skills with `index: true` consistently include indexing instruction
  - Integration guide documents indexing behavior per output type

---

## Key Files

| File | Role | Changes |
|------|------|---------|
| `packages/core/src/models/skills.ts` | Types | Add `SkillIntegration`, `SkillIntegrationOutput`; extend `SkillDefinition` + `SkillMetadata` |
| `packages/core/src/utils/integration.ts` | Utils | **New**: `generateIntegrationSection()`, `injectIntegrationSection()`, `deriveIntegrationFromLegacy()` |
| `packages/core/src/utils/index.ts` | Barrel | Export new integration utils |
| `packages/core/src/services/skills.ts` | Service | Read integration profile in `getInfo()`; call inject in `install()` |
| `packages/core/src/services/workspace.ts` | Update path | Post-sync injection step; root-level `.md` file copy fix |
| `packages/core/src/utils/templates.ts` | Templates | Confirm filesystem-probe resolution works without registry |
| `packages/cli/src/commands/skill.ts` | CLI | Install output messaging |
| `packages/runtime/skills/PATTERNS.md` | Docs | Add integration pattern |
| `packages/runtime/skills/_integration-guide.md` | Docs | **New**: agent guide for integration setup |
| `packages/runtime/skills/*/SKILL.md` | Skills | 9 native skills: add frontmatter, remove prose |
| `packages/core/test/utils/integration.test.ts` | Tests | **New**: generation, injection, idempotency, legacy derivation |
| `packages/core/test/services/skills.test.ts` | Tests | Integration profile reading, backward compat |
| `packages/core/test/utils/templates.test.ts` | Tests | Dynamic resolution for non-registry skills |
| `packages/cli/test/commands/skill.test.ts` | Tests | Install output messaging |

---

## Size Estimate

**Large** (10 steps across 5 phases). Phases are independently shippable:
- Phase 0 (step 0): Pre-work validation. No code. ~1 hour.
- Phase 1 (steps 1, 2a, 2b, 3): Core infrastructure. Must ship first. ~Medium complexity.
- Phase 2 (steps 4, 5, 6): Install UX + validation gate. Ships after Phase 1. ~Small complexity.
- Phase 3 (steps 7, 8): Migration. **Blocked on Phase 2 validation gate**. ~Medium complexity.
- Phase 4 (step 9): Verification. Ships after Phase 1. ~Tiny complexity.

---

## Out of Scope

- Skill marketplace/discovery (browsing skills.sh from within Areté)
- Automatic skill composition (skills chaining into each other)
- Runtime hooks (PostToolUse-style IDE hooks)
- Changing how `arete index` works (just ensuring skills declare when to use it)
- Skill authoring tools ("Build Areté Skill" skill → scratchpad for future)
- Auto-running `arete index` after every skill (future enhancement → scratchpad)
- Adding community skills to `TEMPLATE_REGISTRY` (filesystem probe is sufficient)
- Conditional output logic or computed fields in integration profiles
- Commented YAML in `.arete-meta.yaml` (guide handles documentation)
