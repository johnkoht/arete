# Review: Workspace Areas Refactor

**Type**: Plan (pre-execution)
**Audience**: User (end-user functionality for PMs using Areté)

---

## Concerns

### 1. **Dependencies — Task ordering is wrong in Phase 1**

The plan states task order `1 → 2 → 3 → 4 → 5 → 6` and describes it as "templates → context → parser → CLI → schemas." This is mostly correct but has an issue:

- **Task 4 (CLI `arete create area`)** depends on Task 1 (template exists) but is independent of Tasks 2 and 3. It could run in parallel with them.
- **Task 5 (goals with area links)** and **Task 6 (commitments with area)** are independent of each other and of Tasks 2-4. They only need the `Goal` and `Commitment` types defined, which exist already. They could run in parallel.
- **Task 3 (area parser)** is the true gate for Phase 2, which the plan correctly notes, but the linear ordering unnecessarily serializes independent work.

**Suggestion**: Clarify which tasks are truly sequential vs. parallelizable:
- `1 → [2, 3, 4] (parallel) → [5, 6] (parallel)` would be more accurate.
- Keep the serial notation if you plan single-agent execution, but note the real dependency graph.

### 2. **Scope — Context service category type needs updating**

The plan says to add `'area-context'` and `'area'` as new categories for `ContextFile`. However, the current `category` type is a union literal: `'context' | 'goals' | 'projects' | 'people' | 'resources' | 'memory'` (defined in `packages/core/src/models/context.ts:15`). Adding new categories requires:

- Updating the `ContextFile['category']` union type
- Updating the `determinePrimitive()` function to handle `context/` subdirectories
- Updating `getContextInventory()` which also does `relPath.startsWith('context/')` checks
- Updating the semantic search category inference (lines ~338 and ~522 in `context.ts`)

The plan doesn't call out these downstream changes. A new `'area'` category would affect any code that switches on category.

**Suggestion**: Either (a) reuse the existing `'context'` category for both `context/**/*.md` and `areas/*.md` files (simpler, less breakage), or (b) explicitly list all files that need the new category values added. Option (a) is safer — the semantic search provider already catches `context/` prefix files and labels them `'context'`.

### 3. **Patterns — No runtime templates directory exists**

The plan says "Create `packages/runtime/templates/area.md`" but there is no `packages/runtime/templates/` directory. Templates in this project live in two places:
- `DEFAULT_FILES` in `packages/core/src/workspace-structure.ts` (inline string content)
- Skill-specific templates referenced via `arete template resolve`

**Suggestion**: Follow the existing pattern — either add area template content to `DEFAULT_FILES` in `workspace-structure.ts`, or use the template resolution system (`templates/outputs/`). Don't create a new `packages/runtime/templates/` directory that breaks convention.

### 4. **Completeness — Missing `arete create` command group scaffolding**

The plan says "Add `arete create` command group (new command file)" but the CLI currently has no `create` command. Creating a new command group requires:
- New file: `packages/cli/src/commands/create.ts`
- Registration in the main CLI entry point (likely `packages/cli/src/index.ts` or similar)
- Following the pattern used by `commitments.ts`, `people.ts`, etc. (subcommand registration via `registerXCommand(program)`)

This is straightforward but the plan should call out the registration step explicitly.

**Suggestion**: Add explicit AC: "`arete create` is registered in the CLI entry point and `arete create --help` shows available subcommands."

### 5. **Acceptance Criteria — Several ACs are not testable as written**

| Task | AC Issue |
|------|----------|
| Task 1 | "Templates exist and are copied to new workspaces" — How is "copied" tested? Need: `arete install` in a temp dir, verify `areas/` dir exists |
| Task 2 | "Files in `context/glance-communications/` appear in `arete brief` output" — Good but needs test fixture setup |
| Task 7 | "Meeting prep for 'CoverWhale Sync' auto-pulls Glance Communications context" — This is a skill behavior (prompt-based), not a unit-testable function |
| Task 11 | "New users understand area-based workflow" — Not testable. Rephrase as: "GUIDE.md contains Areas section with lifecycle documentation" |

**Suggestion**: For skill tasks (7-10), acceptance criteria should focus on the _data flow_ (area parser returns correct result, context includes area files) rather than end-to-end skill behavior, which happens in natural language prompts and is hard to verify programmatically.

### 6. **Backward Compatibility — `context/` subdirectory scanning could surface noise**

Currently, `context/` contains only top-level files (`business-overview.md`, `competitive-landscape.md`, etc.) plus `_history/`. The plan proposes scanning `context/**/*.md` for area-specific context. This means:
- `context/_history/` files would suddenly appear in context bundles
- Any markdown files users put in `context/` subdirectories would be surfaced

The existing `getContextInventory()` already scans `context/` recursively — but `getRelevantContext()` only reads specific primitive-mapped files. Adding a recursive scan to `getRelevantContext()` changes what context gets injected.

**Suggestion**: Add an explicit exclude list (`_history`) and document which `context/` subdirectory patterns are treated as area context vs. ignored.

### 7. **Risks — Area parser YAML parsing is underspecified**

The plan says "Parse area files: extract YAML frontmatter (recurring_meetings)" but doesn't specify:
- What happens when `recurring_meetings` is empty or missing?
- How meeting title matching works (exact? case-insensitive? fuzzy?)
- How `getAreaForMeeting()` handles multiple areas matching the same meeting title
- Whether area slugs must match directory names in `context/`

The existing `goal-parser.ts` uses the `yaml` package and `parseFrontmatter()` — a good pattern to follow. But the plan should specify matching semantics.

**Suggestion**: Add to Task 3 ACs:
- "Returns `null` when no area matches a meeting title"
- "Matching is case-insensitive substring on meeting title"
- "When multiple areas match, returns highest-confidence match"

### 8. **Completeness — No migration or seeding story**

The plan says "Don't auto-migrate; document manual setup" but doesn't include any task for creating example/seed areas. Users with existing workspaces get nothing — they'd need to manually create area files.

**Suggestion**: Consider adding a subtask to Task 4 or Task 12: "Add `arete create area --interactive` that prompts for name, recurring meetings, and description." This matches the project's pattern of interactive setup (seen in `seed.ts`, `onboard.ts`).

### 9. **Completeness — Search index not updated**

When new `areas/*.md` files are created, they need to be indexed for `arete search` to find them. The plan doesn't mention running `arete index` after area creation, or updating the search indexer to include `areas/` as a scan path.

**Suggestion**: Add to Task 4 AC: "`arete create area` runs `arete index` after creating files (or prompts user to do so)." Check whether the search indexer already picks up `areas/` or needs a path addition.

### 10. **Scope — `areas/` vs. `context/{area-slug}/` creates dual-location confusion**

The plan creates both:
- `areas/{slug}.md` — the area definition file
- `context/{slug}/` — area-specific context files

This means area-related content lives in two different directories. Users need to know: "area definition goes in `areas/`, area context goes in `context/{slug}/`." The context service needs to correlate these.

**Suggestion**: Consider whether `areas/{slug}/` could be self-contained (area.md + context files in the same directory). This simplifies the mental model. If dual-location is intentional, document the reason clearly in Task 11.

---

## Strengths

- **Clear phase separation** — Core structure before skill updates is the right order. Phase 2 correctly depends on Task 3 (area parser).
- **Optional `area` field** — Making `area?: string` optional on goals and commitments is the right backward-compatible approach. No migration needed.
- **Reuses existing parsing patterns** — The plan correctly identifies `yaml` package and frontmatter parsing as the pattern to follow (matches `goal-parser.ts`).
- **Good risk identification** — "Add tests for existing context paths before modifying" is exactly right. Context service regression is the highest-risk item.
- **Sensible out-of-scope boundaries** — Deferring automated area creation, archival, and external system sync keeps this focused.
- **AreaMatch interface is well-designed** — `{ areaSlug, matchType, confidence }` supports both exact recurring matches and fuzzy inference, enabling gradual intelligence improvement.

---

## Devil's Advocate

**If this fails, it will be because...** the context service changes in Task 2 regress existing context assembly. The current `getRelevantContext()` is finely tuned — it scans specific files, applies token overlap, manages semantic search score upgrading, and caps results at `maxFiles`. Adding recursive `context/**/*.md` scanning and a new `areas/` scan could: (a) surface irrelevant files that dilute context quality, (b) hit the `maxFiles` cap earlier and push out more relevant primitive files, or (c) break the category-based confidence calculation. The plan acknowledges this risk but the mitigation ("add tests before modifying") needs to be Task 2's first subtask, not an afterthought.

**The worst outcome would be...** existing meeting-prep and daily-plan workflows silently degrade because the context service now includes area files with low relevance, pushing out the company-level context that skills currently rely on. Users wouldn't see an error — they'd just get worse prep briefs. This is the "works but worse" failure mode that's hardest to catch.

---

## Verdict

- [ ] Approve
- [x] **Approve with suggestions** — Address the following before converting to PRD:

### Must address:
1. **Concern #2**: Decide on category strategy (`'context'` reuse vs. new `'area'` category) and list all files that need changes
2. **Concern #3**: Use existing template patterns (`DEFAULT_FILES` or template resolution), not `packages/runtime/templates/`
3. **Concern #6**: Add `_history` exclusion and document `context/` subdirectory scanning rules
4. **Concern #7**: Specify area-to-meeting matching semantics in Task 3 ACs

### Should address:
5. **Concern #5**: Make skill task ACs (7-10) testable at the data-flow level
6. **Concern #9**: Add search indexing step to area creation
7. **Concern #10**: Resolve or document the dual-location (`areas/` + `context/{slug}/`) design decision

### Nice to address:
8. **Concern #1**: Document the real dependency graph even if executing serially
9. **Concern #4**: Add CLI registration AC
10. **Concern #8**: Consider interactive area creation for existing workspaces
