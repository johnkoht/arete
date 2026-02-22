# Pre-Mortem: Work Directory Cleanup & Consolidation

## Risk 1: Incomplete Path Reference Migration

**Problem**: Grep found 50+ references to `dev/plans/`, `dev/prds/`, `dev/backlog/`, and `dev/archive/` across TypeScript code, skill files, AGENTS.md sources, memory entries, collaboration.md, .cursor/rules, and .pi/APPEND_SYSTEM.md. Missing even one creates a silently broken workflow — e.g., `/build` sends the agent to a PRD path that doesn't exist.

The references are spread across:
- `.pi/extensions/plan-mode/` (6 files: persistence.ts, commands.ts, index.ts, utils.test.ts, commands.test.ts)
- `.agents/skills/` (5 skill files: execute-prd, plan-to-prd, prd-to-json, prd-post-mortem + sources)
- `.agents/sources/` (3 files: workspace-structure.md, memory.md, conventions.md)
- `.pi/APPEND_SYSTEM.md` (2 references)
- `.cursor/rules/dev.mdc` (1 reference)
- `memory/` entries and `memory/collaboration.md` (~25 references — historical)
- `src/core/briefing.ts` (1 comment reference)

**Mitigation**:
1. Before committing Step 3, run comprehensive grep: `grep -rn "dev/plans\b\|dev/prds\|dev/backlog\|dev/archive" --include="*.ts" --include="*.md" --include="*.mdc" .`
2. Create a checklist of every file with a reference; check off each one as updated
3. Memory entries are historical — do NOT update old entries (they document what happened at that time). Only update `collaboration.md` and `MEMORY.md` index.
4. Run grep again after all changes; the only remaining hits should be in `memory/entries/` (historical) and `dev/work/archive/` (migrated content)

**Verification**: Final grep returns zero hits in: `.pi/`, `.agents/`, `.cursor/`, `src/`, `memory/collaboration.md`, `memory/MEMORY.md`. Memory entry hits are acceptable (historical).

---

## Risk 2: Command Dispatcher Routing Ambiguity

**Problem**: The current `/plan` command dispatcher uses a simple `switch` on the first word after `/plan`. Adding `backlog` and `archive` as subcommands means we need two-level routing: `/plan backlog list`, `/plan backlog edit <slug>`, `/plan backlog promote <slug>`, `/plan archive list`, `/plan archive <slug>`. The current switch statement doesn't handle this — it would match `backlog` as the command and need to parse the rest.

Additionally, `/plan backlog` with no additional args means "shelve current plan" — this conflicts with the pattern where other no-arg subcommands might be expected to show help.

**Mitigation**:
1. When `cmd === "backlog"`, parse `subcommand[1]` for the sub-subcommand (`list`, `edit`, `promote`, or undefined for shelve)
2. When `cmd === "archive"`, parse `subcommand[1]` for `list` or treat remaining as slug
3. Add a `handleBacklog(args, ctx, pi, state)` function that handles its own sub-routing
4. Add a `handleArchive(args, ctx, pi, state)` function similarly
5. Update the "Unknown subcommand" message to include `backlog` and `archive`

**Verification**: Test all command variations: `/plan backlog`, `/plan backlog list`, `/plan backlog edit foo`, `/plan backlog promote foo`, `/plan archive`, `/plan archive list`, `/plan archive foo`.

---

## Risk 3: Flat File vs. Folder Parsing Divergence

**Problem**: `listBacklog()` must handle two different structures — flat `.md` files with frontmatter AND folders containing `plan.md` with frontmatter. The existing `listPlans()` only handles folders. If the parsing logic diverges (e.g., flat files use slightly different frontmatter conventions), listing and editing become inconsistent.

Also: when scanning backlog, a flat file `backlog/foo.md` has slug `foo`, and a folder `backlog/bar/plan.md` also has slug `bar`. What if both `foo.md` and `foo/` exist? That's a slug collision.

**Mitigation**:
1. Extract a shared `parseFrontmatterFromPath(path)` that works for any `.md` file
2. In `listBacklog()`: for each entry, check `isDirectory()` first — if folder, parse `plan.md` inside it; if file ending in `.md`, parse the file directly; skip other entries
3. Slug extraction: flat file slug = filename without `.md`; folder slug = directory name
4. Add a validation check: if both `foo.md` and `foo/` exist, warn and prefer the folder (it has more artifacts)
5. On `promoteBacklogItem()`: if the source is a flat file, delete the file after creating the folder; verify no orphan remains

**Verification**: Test with: (a) backlog containing only flat files, (b) only folders, (c) mixed, (d) slug collision case.

---

## Risk 4: `/plan backlog edit` State Management

**Problem**: Currently, plan mode state (`PlanModeState`) tracks a single active plan via `currentSlug`, `planText`, `todoItems`, etc. When editing a backlog item, what happens to this state? If a user has an active plan open and runs `/plan backlog edit`, do we lose their current plan context?

Also: saving during backlog edit needs to write to `backlog/` not `plans/`. The existing `/plan save` writes to `plans/` — this would be wrong for a backlog edit session.

**Mitigation**:
1. Add an `editingContext` field to state: `{ type: 'plan' | 'backlog', slug: string, dir: string }` — tracks where to save
2. Before opening a backlog item for edit, check for unsaved changes on current plan (same pattern as `handlePlanNew`)
3. Override save behavior: when `editingContext.type === 'backlog'`, save to `backlog/` directory
4. When exiting backlog edit (via promote, or starting a new plan), restore previous plan context or clear it
5. Alternative simpler approach: `/plan backlog edit` just reads the content into the chat context and tells the agent about it, but doesn't load it into the plan state machine. Edits are done via the `write` tool directly. This avoids state complexity.

**Verification**: Test sequence: open plan A → /plan backlog edit B → make changes → /plan save (saves to backlog) → /plan open A (restores plan A context).

---

## Risk 5: Migration Triage Decisions Are Subjective

**Problem**: Step 4 requires triaging 31 plans + 22 backlog items + 6 PRDs + 17 archived PRDs. The plan says "audit and triage" but doesn't define criteria for what's active vs. backlog vs. archive. Without clear criteria, the builder has to make 76 individual decisions, or the agent makes arbitrary choices.

**Mitigation**:
1. Define clear triage rules before starting:
   - **Archive**: Any plan with `status: complete` or whose PRD was already executed (check `dev/archive/prds/`)
   - **Archive**: Any plan that hasn't been touched in 30+ days AND has no PRD
   - **Active**: Any plan with `status: building` or `status: ready`
   - **Backlog**: Everything else
2. Present the proposed triage as a table to the builder for approval before executing moves
3. Don't try to add frontmatter to every backlog item — many existing backlog files don't have it. Add minimal frontmatter (title, slug, status: idea, tags based on former subfolder)

**Verification**: Builder approves triage table before any files are moved.

---

## Risk 6: `execute-prd` Skill Backlog Path Change

**Problem**: The `execute-prd` skill has 4 references to `dev/backlog/improvements/` for creating refactor backlog items during PRD execution. This is a runtime behavior — an executing agent creates new backlog items. If we change the path but the agent is mid-execution with the old skill loaded, it writes to the old path.

Also: the old path had subcategories (`improvements/`). The new structure is flat. The skill instructions need to change from `dev/backlog/improvements/refactor-foo.md` to `dev/work/backlog/refactor-foo.md`.

**Mitigation**:
1. Update all 4 references in `execute-prd/SKILL.md` to use `dev/work/backlog/`
2. Drop the `improvements/` subfolder — tags in frontmatter replace it
3. Add a note in the skill: "Save with frontmatter: `status: idea`, `tags: [improvement, refactor]`"
4. No mid-execution conflict risk for this plan since we're doing infrastructure, not running PRDs concurrently

**Verification**: Grep `execute-prd/SKILL.md` for `backlog` — all references should point to `dev/work/backlog/`.

---

## Risk 7: WORK.md Becomes Stale Immediately

**Problem**: Step 5 creates WORK.md as a manually maintained index. The moment anyone creates a new plan or moves something to backlog, WORK.md is out of date. Manual maintenance of indexes is a known failure mode — it works for a week then gets ignored.

**Mitigation**:
1. Accept that WORK.md will be manually maintained for now (it's in Out of Scope)
2. Keep it simple: just a table, not prose. Easy to update.
3. Add a comment at the top: `<!-- Keep in sync with backlog/, plans/, archive/ contents -->`
4. Consider: should we skip WORK.md entirely in Phase 1 and add it when we have auto-generation? This would reduce scope without losing value.
5. Recommendation: **Defer WORK.md to a future step.** The directory structure itself is the source of truth. `/plan list`, `/plan backlog list`, `/plan archive list` are the programmatic ways to see status.

**Verification**: Decide before building: include or defer WORK.md.

---

## Risk 8: PRD Now Lives Inside Plan Folder — `/build` Path Resolution

**Problem**: Currently `/build` looks for the PRD at `dev/prds/{feature-slug}/prd.md`, and `resolvePrdFeatureSlug()` reads the PRD artifact from the plan folder to extract a potentially different feature slug. With PRDs moving inside plan folders (`dev/work/plans/{slug}/prd.md`), the indirection changes:
- The PRD is already in the plan folder, so `loadPlanArtifact(slug, "prd.md")` still works
- But the `/build` message to the agent says `The PRD is at dev/prds/{slug}/prd.md` — this hardcoded string needs to change
- The `plan-to-prd` skill creates an `EXECUTE.md` handoff file with hardcoded paths — this also needs updating
- `prd-to-json` writes to `dev/autonomous/prd.json` — this is moving to `dev/executions/` (other agent's work), but we need to know what to reference in the interim

**Mitigation**:
1. Update `/build` handler message to reference `dev/work/plans/{slug}/prd.md`
2. Update `plan-to-prd/SKILL.md` EXECUTE.md template to use new path
3. For `prd.json` location: keep referencing `dev/autonomous/prd.json` for now since the executions agent hasn't finished yet. Add a TODO comment.
4. `resolvePrdFeatureSlug()` can be simplified since PRD is always at `plans/{slug}/prd.md` — the feature slug IS the plan slug now

**Verification**: Run through the full flow mentally: `/plan save` → `/prd` → `/build` — trace every path reference and confirm they all resolve correctly.

---

## Summary

Total risks identified: **8**
Categories covered: Context Gaps, Integration, Scope Creep, Code Quality, State Tracking, Dependencies

| # | Risk | Severity | Likelihood |
|---|------|----------|------------|
| 1 | Incomplete path migration | High | High |
| 2 | Command routing ambiguity | Medium | Medium |
| 3 | Flat file vs. folder parsing | Medium | Medium |
| 4 | Backlog edit state management | Medium | High |
| 5 | Migration triage subjectivity | Low | High |
| 6 | execute-prd backlog path | Medium | Low |
| 7 | WORK.md staleness | Low | High |
| 8 | PRD path resolution in /build | High | Medium |

**Key recommendations**:
- Risk 1 is the biggest: create a reference checklist before starting
- Risk 4 needs a design decision: full state management or simple read-into-context approach
- Risk 7 suggests deferring WORK.md to reduce scope
- Risk 8 requires tracing the full `/plan → /prd → /build` flow path-by-path

**Ready to proceed with these mitigations?**
