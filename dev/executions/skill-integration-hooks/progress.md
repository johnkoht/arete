# Progress Log — skill-integration-hooks

Started: 2026-03-02T05:12:00Z

## Task 0: Validate integration profile schema (1/11) ✅
- Cataloged all 9 native skills with prose integration instructions
- Wrote proposed integration profiles using only the proposed schema
- Identified 3 minor schema gaps (none requiring expansion)
- Saved to dev/work/plans/skill-integration-hooks/native-skill-profiles.md
- No code changes

## Task 1: Define Skill Integration Profile schema (2/11) ✅
- Added `SkillIntegrationOutputType`, `SkillIntegrationOutput`, `SkillIntegration` types to `packages/core/src/models/skills.ts`
- Added optional `integration?: SkillIntegration` to both `SkillDefinition` and `SkillMetadata`; `SkillCandidate` untouched
- Exported 3 new types from `packages/core/src/models/index.ts`
- Added `parseIntegration()` helper with defensive parsing (non-object → undefined, outputs not array → undefined)
- Updated `getInfo()` to read `integration` from merged frontmatter+sidecar (sidecar replaces frontmatter per existing pattern)
- Added 9 tests in `packages/core/test/services/skills.test.ts` using mock StorageAdapter
- Commit: f44ac40
- typecheck: ✓ | tests: ✓ (all new tests pass; 4 pre-existing adapter test failures unrelated to this task)

## Task 2a: Build integration section generation — pure functions (3/11) ✅
- Created `packages/core/src/utils/integration.ts` with three exported pure functions
- `generateIntegrationSection(skillId, integration)`: returns null for empty/none outputs; generates workspace-relative markdown for project/resource/context types with template CLI commands and indexing guidance
- `injectIntegrationSection(skillMdContent, section)`: idempotent injection via `<!-- ARETE_INTEGRATION_START/END -->` markers; handles append, replace, and removal
- `deriveIntegrationFromLegacy(def)`: maps `createsProject:true + projectTemplate` to SkillIntegration; returns undefined when no legacy fields
- Exported all three from `packages/core/src/utils/index.ts`
- 35 tests in `packages/core/test/utils/integration.test.ts` — full coverage including idempotency, null removal, type:none filtering, workspace-relative path assertions, CLI command format
- Commit: e70c153
- typecheck: ✓ | tests: ✓ (35/35 pass; 4 pre-existing adapter failures unchanged)

**Reflection**: LEARNINGS.md in `packages/runtime/skills/` reinforced the workspace-relative path requirement. The sentinel marker approach for idempotency (R1 mitigation) was clean to implement — replace-in-place when markers exist, append when not. The test for `removes markers and restores clean content (null section, content before)` caught a subtle trim-collapse issue early, making the removal logic robust. ~4K tokens estimated.

## Task 3 Fix: Update template resolve test for community skill support (follow-up) ✅

**What was done:**
The "exits with error for unknown skill" test in `packages/cli/test/commands/template.test.ts` was asserting `result.error.includes('Unknown skill')`, but task-3's implementation removed the TEMPLATE_REGISTRY validation gate so unknown skills are now allowed (community skill support). Unknown skills now go through `resolveTemplatePath` → null → `"No template found"` error.

Updated the test to:
- Keep expecting `success: false` (unknown skill with no template file still errors)
- Change error assertion from `'Unknown skill'` to `'No template found'`
- Added a comment explaining the new behavior (community skills bypass registry, fail via filesystem probe)

**File changed:** `packages/cli/test/commands/template.test.ts`
**Commit:** 976b18a (amended task-3 commit)
- typecheck: ✓
- tests: ✓ (all template tests pass)

## Task 2b: Wire injection into install/update + fix root-level file deployment (4/11) ✅

**What was done:**

**(A) SkillService.install() — skills.ts**
- Added imports: `generateIntegrationSection`, `injectIntegrationSection`, `deriveIntegrationFromLegacy` from `../utils/integration.js`
- Added `private injectIntegrationIntoSkill(skillPath)` helper used by the skillssh install path
- skillssh path: after writing `.arete-meta.yaml`, calls `injectIntegrationIntoSkill(p)` if SKILL.md exists
- local path: after writing `.arete-meta.yaml`, inline injection using the `info` already fetched for the return value (avoids double `getInfo` call)
- Skills with no integration profile (no `creates_project`, no `integration` field) are left unchanged

**(B) WorkspaceService.update() — workspace.ts**
- Added imports for `SkillService` (from `./skills.js`) and all three integration utils
- After `syncCoreSkills()` block: unconditional loop over `paths.agentSkills` subdirectories
- Instantiates `new SkillService(this.storage)` inline (stateless, no constructor change)
- For each skill: derives integration → generates section → injects → writes; non-fatal errors skipped
- Loop is independent of `options.sourcePaths` so it runs even when called with `{}`

**(C) Root-level .md file deployment — workspace.ts**
- `create()`: after skill subdirectory loop, calls `this.storage.list(sourcePaths.skills, { extensions: ['.md'] })` and copies each root-level .md to `.agents/skills/{filename}` — skip-if-exists
- `syncCoreSkills()`: after subdirectory loop, same list call; filters with `rel.includes('/')` check to exclude subdirectory files; always overwrites (core content)

**Files changed:**
- `packages/core/src/services/skills.ts` — added injection in both install paths + private helper
- `packages/core/src/services/workspace.ts` — added injection loop in update(), root-level .md copy in create() and syncCoreSkills()
- `packages/core/test/services/skills.test.ts` — 4 new tests for install injection (local path)
- `packages/core/test/services/workspace.test.ts` — 9 new tests (5 update injection + 4 root-level .md deployment)

**Quality checks:**
- typecheck: ✓
- tests: ✓ (13 new tests all pass; same 4 pre-existing adapter failures)
- Commit: 245c669

**Reflection**: LEARNINGS.md was directly helpful — the "no direct fs" invariant and StorageAdapter DI pattern meant injection code was immediately testable with mock storage. The `list()` non-recursive default (confirmed by reading `file.ts`) meant no extra filter needed in `create()`, though `syncCoreSkills()` adds the explicit separator check as a safety invariant (per task spec). The R1 mitigation (sentinel markers = idempotency) from the prior task paid off here: the injection loop in `update()` just unconditionally calls inject on every skill and the markers guarantee no duplication. Harder than expected: understanding the two separate install paths (skillssh + local) and the correct insertion point for each. The private helper avoids duplication for the skillssh path while the local path inlines it to reuse the already-fetched `info`. ~5.5K tokens estimated.

## Task 6: Create agent integration setup guide (6/11) ✅

**What was done:**
Created `packages/runtime/skills/_integration-guide.md` — a concise, scannable reference for agents helping users configure integration for installed community skills.

Guide covers:
- What integration hooks are (behavioral context injection via `## Areté Integration` section; generated from `.arete-meta.yaml`)
- Output types table with defaults (`project`, `resource`, `context`, `none`)
- Full `.arete-meta.yaml` schema with field reference table
- Example profiles for each output type (project-based, resource-based, context-based, conversational/none)
- Template resolution order (workspace override → skill-bundled → Areté default)
- Indexing guidance with output-type lookup table

File will be deployed to `.agents/skills/_integration-guide.md` in user workspaces via the root-level `.md` file copy from task-2b.

**Files changed:**
- `packages/runtime/skills/_integration-guide.md` — created

**Quality checks:** Documentation only — no typecheck/test needed.
**Commit:** 9791dc3

**Reflection:** Straightforward write task. The native-skill-profiles.md examples were directly useful for concrete YAML blocks. Used PATTERNS.md as tone/format reference — tables and code blocks over prose. ~1.5K tokens.

## Task 8: Update PATTERNS.md and documentation (8/11) ✅

**What was done:**

1. **Updated `research_intake` pattern step 5** — Replaced ad-hoc "Run `arete index`" prose with a reference to the new `skill_integration` pattern. Instruction now reads: follow [skill_integration](#skill_integration); if `index: true` is set in the profile, Areté handles indexing automatically.

2. **Added `skill_integration` pattern** at end of PATTERNS.md (after `research_intake`) covering:
   - Purpose: declare how a skill's outputs integrate with the workspace
   - How it works: frontmatter/sidecar → `generateIntegrationSection()` → `injectIntegrationSection()` → sentinel markers in SKILL.md
   - Schema block (YAML): `outputs[]` with type/path/template/index, `context_updates`
   - Community skill configuration: references `_integration-guide.md` via relative path (`./`)
   - Customization: edit `.arete-meta.yaml` → re-run `arete update`

**AGENTS.md sources check**: No sources under `.agents/sources/` reference PATTERNS.md integration content — no rebuild needed.

**LEARNINGS.md path convention**: Cross-reference to `_integration-guide.md` uses `./` relative path per the convention documented in `packages/runtime/skills/LEARNINGS.md`.

**Acceptance criteria check**:
- ✅ New `skill_integration` section added to PATTERNS.md
- ✅ Pattern documents schema, generation mechanism, customization via .arete-meta.yaml
- ✅ `research_intake` step 5 updated to reference hook system instead of ad-hoc prose
- ✅ `grep "Run \`arete index\`" PATTERNS.md` → zero results
- ✅ AGENTS.md sources don't reference integration content → no rebuild
- ✅ Relative path used for `_integration-guide.md` cross-reference

**Files changed:**
- `packages/runtime/skills/PATTERNS.md` — updated research_intake step 5 + added skill_integration section

**Quality checks:** Documentation only — no typecheck/test needed.
**Commit:** fdeed79

**Reflection:** Straightforward documentation task. LEARNINGS.md was directly useful — immediately confirmed the relative path requirement for `_integration-guide.md` reference. The `research_intake` update required replacing rather than augmenting (task said "instead") which made the intent cleaner. ~1K tokens.

---

## Task 4: Install-time guidance and validation gate (5/11) ✅

**What was done:**
Updated `installSkillAction` in `packages/cli/src/commands/skill.ts`:

1. **Moved `services.skills.get()` call** to top of action (before `--json` early return) so skill info is available for both the JSON path and the human-readable path.

2. **`--json` path**: Now includes an `integration` key in the JSON response when the installed skill has an integration profile. Each output entry includes `type`, and optionally `path` and `index`. No integration key emitted when profile is absent (clean/backward-compatible output).

3. **Human-readable path**: After `success()` and `listItem('Location', ...)`:
   - If skill has `integration.outputs`, prints `Output type` and `Output path` (first output)
   - If any output has `index: true`, prints "Run `arete index`" hint
   - Always prints guidance: `Edit .agents/skills/<name>/.arete-meta.yaml to customize integration, or ask an agent to help set it up.`

4. **`--yes` handling**: Guidance prints before the early return — it's informational, not interactive.

5. **Overlap detection unchanged**: `detectOverlapRole` still runs when not `--yes` using the same `installedSkill` variable.

**Files changed:**
- `packages/cli/src/commands/skill.ts` — restructured post-install output, moved skill.get() call, added integration summary + guidance
- `packages/cli/test/commands/skill.test.ts` — added `createSkillWithIntegration()` helper + 7 new tests

**New tests (all pass):**
- guidance prints for skill with no integration (plain fixture)
- guidance prints even with `--yes` (not skipped by early return)
- output type + path printed when integration profile present
- `arete index` hint when `index: true` output present
- no `arete index` hint when no `index: true` outputs
- `integration` key in `--json` output when profile exists (with type, path, index)
- no `integration` key in `--json` output when no profile

**Quality checks:**
- typecheck: ✓
- tests: ✓ (970 total, 964 pass — +10 new tests, net -1 pre-existing failure vs baseline)
- Commit: dc87ed7

**Reflection**: The existing code already had `services.skills.get()` call later in the function for overlap detection, so hoisting it was a natural refactor with no logic change. Reading the full `installSkillAction` flow before writing made the restructuring clear and safe. ~2K tokens.
