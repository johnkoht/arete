# Review: Skill Integration Hooks PRD

**Type**: PRD (pre-implementation)
**Audience**: Builder (Areté development) with user-facing UX implications

---

## Concerns

### 1. **Completeness / Deployment Gap**: `_integration-guide.md` won't deploy to user workspaces

`syncCoreSkills()` in `workspace.ts` uses `listSubdirectories()` — it only copies skill **subdirectories** (e.g., `competitive-analysis/`, `discovery/`), not root-level files in the skills directory. The proposed `_integration-guide.md` at `packages/runtime/skills/_integration-guide.md` will exist in the source package but **never reach** `.agents/skills/_integration-guide.md` in user workspaces.

Same issue likely affects `PATTERNS.md` and `LEARNINGS.md` (they exist in the source but aren't deployed via subdirectory copy). Skills reference `../PATTERNS.md` via relative links — this may already be broken in user workspaces, or there's an undocumented deployment path.

- **Suggestion**: Either (a) add a root-level file copy step to `syncCoreSkills()`/`create()` for `*.md` files at the skills root, or (b) place the guide inside a pseudo-skill directory like `.agents/skills/_guides/integration.md`, or (c) deploy it via a different mechanism (e.g., alongside rules or as a workspace-root doc). Investigate whether PATTERNS.md is actually available in user workspaces today — if it's not, that's a pre-existing bug to fix as part of this work.

### 2. **Dependencies**: Step 2 has too many responsibilities

Step 2 ("Build SKILL.md integration section injection") does four distinct things:
1. Create `generateIntegrationSection()` function
2. Create `injectIntegrationSection()` function with sentinel markers
3. Wire into `SkillService.install()`
4. Wire into `WorkspaceService.update()` post-sync

The `WorkspaceService.update()` wiring crosses a service boundary — `SkillService` and `WorkspaceService` are separate classes. The update path needs `SkillService.getInfo()` to read integration profiles, but `WorkspaceService` doesn't currently depend on `SkillService`.

- **Suggestion**: Split Step 2 into 2a (pure functions: `generateIntegrationSection` + `injectIntegrationSection`) and 2b (wiring into install + update paths). This also makes 2a independently testable. For the service boundary: either make the generate/inject functions standalone utils (not on SkillService), or inject SkillService into WorkspaceService. Check `factory.ts` wiring.

### 3. **Edge Cases**: What happens when integration profile is empty/none?

The plan covers "skill with no integration section" (backward compat) but doesn't address: what if a skill explicitly sets `integration.outputs: []` or `integration.outputs: [{ type: none }]`? Should `generateIntegrationSection()` return an empty string? Should it still inject sentinel markers (empty section)? Should it skip injection entirely?

This matters because some community skills (coaching, advisory) genuinely have no persistent output. If a user sets `type: none`, the generated section shouldn't say "Save output to..." with no path.

- **Suggestion**: Add to Step 2 AC: "When integration has `type: none` or empty outputs, no `## Areté Integration` section is injected (or section is injected with only 'This skill produces no persistent output')."

### 4. **Backward Compatibility**: `SkillMetadata` and `SkillCandidate` types also need integration fields

`SkillDefinition` gets the new `integration` field, but `SkillMetadata` (extracted from frontmatter) and `SkillCandidate` (used for routing) are separate types in `skills.ts`. If frontmatter contains integration fields, `SkillMetadata` should parse them. If routing needs to know about output type (e.g., to distinguish project-creating skills), `SkillCandidate` may need it too.

- **Suggestion**: Add to Step 1: "Update `SkillMetadata` to include integration fields. Evaluate whether `SkillCandidate` needs them for routing." This prevents a type inconsistency where frontmatter has integration data but the metadata type can't represent it.

### 5. **Scope Boundary**: Step 4's `buildAreteMeta()` with commented YAML may conflict with YAML spec

YAML comments are valid, but `yaml.stringify()` (used in `buildAreteMeta()`) doesn't produce comments. Adding commented-out fields means switching from `stringify()` to a manual template or using a YAML library that preserves comments.

- **Suggestion**: Either (a) use a string template instead of `stringify()` for the commented section, appending it after the YAML block, or (b) just omit commented fields and rely on the integration guide document for self-documentation. Option (b) is simpler and avoids YAML tooling issues.

### 6. **Multi-IDE Consistency**: No explicit mention of Claude Code / .claude/ path handling

The PRD mentions SKILL.md injection and `.arete-meta.yaml` — these are in `.agents/skills/` which is IDE-agnostic. Good. But `arete update` uses IDE-specific adapters, and Step 2 wires injection into the update path. Confirm that the adapter doesn't affect skills directory paths.

- **Suggestion**: Add a one-line note to Step 2: "Skills path (`.agents/skills/`) is IDE-agnostic — no adapter-specific handling needed." This prevents future confusion.

### 7. **Acceptance Criteria Gap**: Step 0 output location undefined

Step 0 says "A document exists with all 9 integration profiles AND the current prose they replace" — but where does this document live? Is it a plan artifact? A file in the repo? A temporary working doc?

- **Suggestion**: Specify: "Save as `dev/work/plans/skill-integration-hooks/native-skill-profiles.md`" (plan artifact). This ensures it's accessible during Phase 3 migration.

---

## Strengths

- **Pre-mortem mitigations are well-integrated** — every step references which risks it addresses, with specific test criteria. This is significantly better than a separate pre-mortem that nobody reads during execution.
- **Phase 0 pre-work validation** is smart — writing all 9 profiles before coding catches schema gaps early with zero code cost. Good application of the "validate before you build" principle.
- **Sentinel marker approach** for SKILL.md injection is the right call — idempotent, survives updates, clearly delimited. Standard pattern.
- **Out of scope is well-defined** — explicitly excluding TEMPLATE_REGISTRY changes, auto-indexing, and conditional logic prevents the most likely scope creep vectors.
- **Phased delivery** with independent shipability is realistic. Phase 1 alone delivers the core value; phases 2-4 are polish.
- **Key files table** makes the impact surface area clear for any reviewer or implementer.

---

## Devil's Advocate

**If this fails, it will be because...** the "behavioral context injection" (baking instructions into SKILL.md) doesn't actually change agent behavior reliably. The entire premise is that an agent reading SKILL.md will follow the `## Areté Integration` section's instructions — save to the right place, run `arete index`, update context files. But agents are probabilistic. A long, complex SKILL.md with a community skill's own multi-step workflow might cause the agent to deprioritize or skip the appended integration section. Native skills currently embed these instructions inline within the workflow steps (e.g., "Step 5: Save and run `arete index`") — a separate section at the end is structurally weaker for agent compliance. If agents ignore the section 30% of the time, the intelligence layer stays orphaned for community skills despite the infrastructure being "in place."

**The worst outcome would be...** shipping all 4 phases, migrating 9 native skills away from inline prose to a generated section, and discovering that the generated section is less effective at guiding agent behavior than the original inline instructions were. You'd have done significant work to make things slightly worse for native skills while only marginally better for community skills. The migration (Phase 3) is the riskiest phase because it's irreversible in practice — once prose is removed, reverting means re-authoring all 9 skills.

---

## Verdict

- [ ] Approve
- [x] **Approve with suggestions** — Minor-to-moderate improvements recommended
- [ ] Revise

**Summary**: The PRD is solid — well-scoped, pre-mortem integrated, phased correctly. The deployment gap for `_integration-guide.md` (#1) is a real blocker that needs resolution before Step 5. The Step 2 service boundary crossing (#2) should be addressed in task breakdown. The devil's advocate concern about agent compliance with appended sections is worth monitoring — consider testing with a real community skill + agent conversation before migrating native skills (i.e., validate Phase 1 before committing to Phase 3).

**Recommended sequencing change**: After Phase 1, do a manual validation — install a real community skill, configure its integration profile, and have an agent run it. Observe whether the agent follows the `## Areté Integration` section. If compliance is low, reconsider the injection approach before Phase 3.
