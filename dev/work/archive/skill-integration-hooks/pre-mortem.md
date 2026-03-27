# Pre-Mortem: Skill Integration Hooks

**Plan size**: Large (8 steps, 4 phases)
**Key areas**: SkillService, SkillDefinition types, template resolution, SKILL.md mutation, 9 native skill migrations, install UX

---

### Risk 1: SKILL.md Mutation Conflicts with Skill Updates

**Problem**: We're appending an `## Areté Integration` section to community skill SKILL.md files at install time. When `skills add` updates a skill (e.g., user reinstalls or the skill author pushes an update), the entire SKILL.md could be overwritten, losing the injected section. For native skills, `arete update` calls `copyDirectory` which overwrites SKILL.md entirely — the injected section from frontmatter would need to be regenerated.

**Mitigation**:
- Use sentinel comment markers (`<!-- ARETE_INTEGRATION_START -->` / `<!-- ARETE_INTEGRATION_END -->`) for idempotent injection
- Integration section generation must be a separate function that can be called from both `install()` and `update()` paths
- For `arete update`: after `syncCoreSkills()` copies native skills, regenerate integration sections for all skills (native and community)
- For community skill reinstall: detect that `.arete-meta.yaml` already exists, preserve it, and re-inject after copy
- Test: install a skill, verify section exists, simulate update (overwrite SKILL.md), verify section is regenerated

**Verification**: Write a test in `skills.test.ts` that calls install, verifies markers exist, simulates SKILL.md overwrite, calls inject again, verifies section is restored.

---

### Risk 2: Native Skill Migration Behavior Drift

**Problem**: 9 native skills currently have prose integration instructions embedded in different places with slightly different wording. When we migrate them to use frontmatter + generated section, the generated instructions might not match the original prose exactly. Example: `competitive-analysis` says "Run `arete index` to make all saved competitive profiles and analysis immediately searchable" — but the generated section might just say "Run `arete index`". The nuance could affect agent behavior.

**Mitigation**:
- Before migration: catalog every native skill's current integration prose (exact text, location in file)
- Create a before/after comparison for each skill: current prose vs. generated section
- The generated section should be rich enough to capture key details (what to index, where to save, what context to update) — not just generic instructions
- Migration should be one skill at a time with manual verification, not a batch operation
- For skills with unique integration behavior (e.g., `process-meetings` which also refreshes person memory), ensure the profile schema can express that

**Verification**: For each migrated skill, diff the old prose instructions against the new generated section. Confirm equivalent agent guidance. Run `npm test` after each skill migration.

---

### Risk 3: Template Resolution Without Registry Breaks CLI

**Problem**: `TEMPLATE_REGISTRY` in `templates.ts` is a hardcoded `Record<string, string[]>` mapping skill IDs to variant names. Community skills aren't in this registry. The CLI's `arete template list` and `arete template resolve` commands use the registry for validation and discovery. If we extend template resolution to handle community skills dynamically, the registry becomes inconsistent — it knows about native skills but not installed community skills.

**Mitigation**:
- Option A: Make `resolveTemplatePath` work independently of the registry (it already does — registry is only used by CLI list/view). Just ensure `arete template resolve --skill <community-id> --variant <name>` works without registry lookup.
- Option B: Build the registry dynamically at CLI runtime by scanning installed skills for `templates/` directories.
- Recommend Option A for Phase 1 (simpler), note Option B as enhancement.
- Key check: `arete template resolve` already works by filesystem probe — registry is only for `arete template list`. Confirm this by reading the CLI code.

**Verification**: Install a community skill with a `templates/` dir. Run `arete template resolve --skill <id> --variant <name>`. Verify it resolves without being in `TEMPLATE_REGISTRY`.

---

### Risk 4: `.arete-meta.yaml` Schema Backward Compatibility

**Problem**: Existing installed community skills have `.arete-meta.yaml` with `category` and `requires_briefing` fields. Adding an `integration` section must not break parsing of existing files. The `readAreteMeta()` function returns the raw parsed YAML — it doesn't validate schema. But `getInfo()` reads specific fields and could fail if it expects new fields that don't exist on old files.

**Mitigation**:
- All new integration fields must be optional in the `SkillDefinition` type (already the pattern — `createsProject?: boolean`)
- `getInfo()` must use optional chaining / nullish coalescing when reading integration fields
- Test with: (1) existing `.arete-meta.yaml` without integration section, (2) new `.arete-meta.yaml` with full integration, (3) partial integration (some fields missing)
- Do not introduce a schema version — keep it forward-compatible via optional fields

**Verification**: Unit test in `skills.test.ts`: parse an `.arete-meta.yaml` with no `integration` field → `SkillDefinition.integration` is `undefined`, all other fields work normally.

---

### Risk 5: Scope Creep on Integration Profile Schema

**Problem**: The integration profile has multiple fields (outputs array, context_updates, templates, index flags). It's tempting to add more during implementation: "what about post-run commands?", "what about conditional outputs?", "what about multi-step workflows?". This could delay Phase 1 significantly.

**Mitigation**:
- Phase 1 schema is minimal:
  ```yaml
  integration:
    outputs:
      - type: project | resource | context | none
        path: "pattern/{name}/"
        template: variant-name
        index: true
    context_updates:
      - context/file.md
  ```
- No conditional logic, no post-run commands, no computed fields
- If a native skill's integration behavior can't be expressed in this schema, document it as a Phase 2 enhancement — don't expand the schema
- Acceptance criteria must be tested against the minimal schema, not aspirational features

**Verification**: Before starting implementation, write the integration profile for all 9 native skills using ONLY the proposed schema. If any skill can't be expressed, flag it before coding.

---

### Risk 6: `arete update` Path Doesn't Regenerate Integration Sections

**Problem**: `WorkspaceService.update()` calls `syncCoreSkills()` which copies native skill directories. After this copy, SKILL.md files are fresh from the package — they don't have the `## Areté Integration` section. If we only inject the section in `SkillService.install()`, then `arete update` leaves native skills without integration sections.

**Mitigation**:
- Add a post-sync step in `WorkspaceService.update()` that calls integration section injection for all skills in `.agents/skills/`
- This step reads each skill's profile (frontmatter for native, `.arete-meta.yaml` for community) and generates/replaces the integration section
- Alternative: for native skills, bake the integration section into the source SKILL.md in `packages/runtime/skills/` so it's already there when copied. But this defeats the purpose of generating from profile.
- Recommend: injection function runs in `update()` after `syncCoreSkills()` completes

**Verification**: Test: run update → verify native skills have `## Areté Integration` section. Run update again → verify section is idempotent (not duplicated).

---

### Risk 7: Cross-Reference Path Breakage (LEARNINGS.md issue)

**Problem**: Per `packages/runtime/skills/LEARNINGS.md`, skills must use relative paths for cross-references because they're copied to user workspaces where absolute paths don't work. The generated `## Areté Integration` section might include paths like `templates/outputs/{skill-id}/` or `context/{topic}.md` — these are workspace-relative, not skill-relative. If an agent reads the SKILL.md and interprets these paths relative to the skill directory, files won't be found.

**Mitigation**:
- Generated integration instructions must clearly indicate paths are workspace-relative: "Save output to `{workspace}/resources/competitive/{name}.md`" or use absolute-from-root notation
- Better: use natural language ("Save to the resources directory") rather than paths, since the agent is making the save call anyway
- For template resolution: always use `arete template resolve --skill {id} --variant {name}` CLI command in instructions, never a raw path
- Review the LEARNINGS.md pattern before writing any path in the generated section

**Verification**: In generated integration section, grep for any path that could be misinterpreted as skill-relative. Ensure all file references either use CLI commands or clearly indicate workspace root.

---

### Risk 8: Test Coverage Gaps Across Affected Files

**Problem**: This plan touches `skills.ts` (service), `skills.ts` (models), `templates.ts` (utils), `skill.ts` (CLI command), `workspace.ts` (update path), and 9 SKILL.md files. Existing test files: `skills.test.ts` (105 lines), `templates.test.ts` (269 lines), `skill.test.ts` (69 lines). The CLI skill test is thin (69 lines). Missing test coverage could let regressions slip through.

**Mitigation**:
- Before any code changes, run `npm test` to establish baseline passing state
- For each changed function, write tests FIRST (or immediately after): 
  - `skills.test.ts`: integration profile reading, section generation, backward compat
  - `templates.test.ts`: dynamic resolution for non-registry skills
  - `skill.test.ts`: install output messaging, `.arete-meta.yaml` with integration section
- The `SkillService` uses `StorageAdapter` (mockable) — follow existing test patterns
- After all Phase 1 changes: run full `npm test` + `npm run typecheck`

**Verification**: Every new function has at least happy-path + edge-case tests. `npm test` passes before and after each step.

---

## Summary

**Total risks identified**: 8
**Categories covered**: Context Gaps (R7), Test Patterns (R8), Integration (R1, R6), Scope Creep (R5), Code Quality (R4), Dependencies (R3), Platform Issues (R7), State Tracking (R2)

**Highest-impact risks**:
1. **R1 (SKILL.md mutation)** — Core mechanism; if update/reinstall loses the section, the whole feature silently breaks
2. **R6 (`arete update` path)** — Easy to forget; native skills won't have integration sections after update
3. **R2 (migration drift)** — 9 skills to migrate; subtle behavior differences could confuse agents

**Recommended execution order adjustments**:
- Implement the injection function (with sentinel markers) and test it thoroughly BEFORE touching any SKILL.md files
- Write integration profiles for all 9 native skills on paper BEFORE coding the schema (validates R5)
- Wire the injection into both `install()` AND `update()` from the start (prevents R6)

**Ready to proceed with these mitigations?**
