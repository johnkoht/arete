# Review: Work Directory Cleanup & Consolidation

**Type**: Plan (pre-execution)
**Audience**: Builder — internal tooling for developing Areté

## Concerns

### 1. **Dependency ordering — Step 4 depends on Steps 2 & 3 but also conflicts with them**

Step 4 (migrate existing items) moves files into `dev/work/plans/`. But Step 2 (update persistence layer) changes `DEFAULT_PLANS_DIR` to `dev/work/plans`. If you do Step 2 first, the extension will immediately look for plans in `dev/work/plans/` — which is empty until Step 4 runs. This means between Steps 2 and 4, `/plan list` shows nothing and `/plan open` breaks for existing plans.

- **Suggestion**: Either (a) do the file migration (Step 4) *before* updating the code paths (Step 2), or (b) create `dev/work/plans/` and move the *current* plan (`work-directory-cleanup`) there as part of Step 2 so there's at least one functional plan during development. Option (a) is cleaner — migrate first, then update code to point at the new location.

### 2. **Step 2 is overloaded — persistence changes + command changes + PRD flow changes**

Step 2 has 12 bullet points spanning three concerns: new persistence functions (`listBacklog`, `moveItem`, etc.), hardcoded path updates in commands.ts, and PRD/build flow changes. These are independently testable and should arguably be separate steps. If one breaks, the whole step is blocked.

- **Suggestion**: Consider splitting Step 2 into: (2a) Change `DEFAULT_PLANS_DIR` + update notification strings, (2b) Add new persistence functions (listBacklog, moveItem, promote, shelve, archive), (2c) Update `/prd` and `/build` handlers. This doesn't change the work, just makes it more granular for execution. If keeping as one step, at least note the internal ordering: path constants first, persistence functions second, command handlers third.

### 3. **`/plan backlog` (no args) = shelve — easy to trigger accidentally**

If a user types `/plan backlog` intending to see the backlog (a common first instinct), they'll accidentally shelve their current plan instead. The "no args = shelve" convention is surprising — every other `/plan` subcommand with no args either shows help or lists items (`/plan list`, `/plan status`).

- **Suggestion**: Make `/plan backlog` with no args show the backlog list (same as `/plan backlog list`). Use `/plan shelve` or `/plan backlog shelve` for the shelve action. This is more intuitive and prevents accidents.

### 4. **Backlog frontmatter for existing items — most don't have any**

The current `dev/backlog/` items are plain markdown files without YAML frontmatter. Step 4 says "add tags based on former category" but doesn't specify what happens to files without frontmatter. Will `listBacklog()` fail on files without `---` delimiters? The current `parseFrontmatter()` returns defaults, but `splitFrontmatterAndContent()` returns `null` if the file doesn't start with `---`.

- **Suggestion**: `listBacklog()` must handle files without frontmatter gracefully — derive title from filename, set status to `idea`, tags from parent folder name, size to `unknown`. Add this as an explicit AC for Step 2.

### 5. **`/plan archive` (no args) is ambiguous too**

The plan says `/plan archive <slug>` archives a plan by slug, and `/plan archive list` lists archived items. But what does `/plan archive` with no args do? Archive the current plan? Show the list? The plan doesn't specify.

- **Suggestion**: `/plan archive` with no args should archive the current active plan (if one exists), with a confirmation prompt. This parallels the shelve pattern. Or — consistent with Concern 3 — make no-args show the list, and require `/plan archive current` or similar for archiving.

### 6. **Missing: `/plan backlog new` or `/plan backlog add`**

The plan covers promoting, shelving, listing, and editing backlog items — but how does a new backlog item get *created*? Currently in `dev/backlog/`, you'd just create a file. Is the expectation that users manually create files, or should there be a `/plan backlog add "Slack integration"` command?

- **Suggestion**: At minimum, document the expected flow for creating new backlog items (even if it's "just create a file"). Consider adding `/plan backlog add <title>` that creates a flat file with proper frontmatter — it's a small addition that makes the system self-contained.

### 7. **Tags serialization in YAML — bracket syntax needs testing**

The plan adds `tags: [feature, integration]` to frontmatter. The current `serializeFrontmatter()` does simple `key: value` serialization. YAML array syntax (`[a, b]`) works, but `parseFrontmatter()` does simple `slice(colonIndex + 1).trim()` — it won't parse `[feature, integration]` into an array. It'll be stored as a string.

- **Suggestion**: This is called out in Step 1 ACs ("tags serialize/parse correctly"), but flag it as a specific implementation risk. The parser needs to detect `[...]` and split by comma. Add test cases: empty tags `[]`, single tag `[feature]`, multiple tags `[feature, integration, refactor]`, no tags field (default to `[]`).

## Strengths

- **Clear problem statement and motivation** — the 4-directory fragmentation is a real pain point, well articulated
- **Thorough pre-mortem** — 8 risks identified with concrete mitigations; two key decisions (backlog edit approach, WORK.md deferral) already resolved
- **Good design decision to defer WORK.md** — commands as the interface is the right call
- **Smart "simple approach" for backlog edit** — avoiding state machine complexity is the right Phase 1 choice
- **Unified frontmatter schema** — single schema across all work items eliminates format drift
- **Phase split** — Phase 1 (structure/migration) is independently valuable even if Phase 2 (commands) slips

## Devil's Advocate

**If this fails, it will be because...** the migration in Step 4 is a manual triage of 70+ items, done in a single session, with subjective criteria. The builder will get fatigued halfway through and start making rushed decisions. Some items will end up in the wrong bucket, and because there's no undo mechanism, fixing triage mistakes requires manually moving folders again. The validation grep in Step 3 will also miss path references embedded in markdown prose (e.g., a memory entry that says "see the PRD at dev/prds/foo/prd.md" — technically historical and acceptable, but a future agent might follow that stale path).

**The worst outcome would be...** a mid-migration state where old directories are deleted but the code hasn't been updated yet (or vice versa), leaving the plan-mode extension broken. If the builder has to stop mid-execution (session timeout, context limit), the workspace is in an inconsistent state: some plans in `dev/plans/`, some in `dev/work/plans/`, code pointing at one or the other. Recovery requires knowing exactly what was and wasn't moved.

## Verdict

- [ ] Approve — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended

### Required before building:
- **Resolve Concern 3**: Change `/plan backlog` (no args) to show list, not shelve. Use `/plan shelve` or `/plan backlog shelve` for the shelve action. This prevents accidental data movement.

### Recommended:
- **Concern 1**: Reorder to migrate files (Step 4) before updating code paths (Step 2), or at least note the dependency explicitly
- **Concern 4**: Add explicit handling for backlog files without frontmatter
- **Concern 6**: Document how new backlog items are created (even if manual)
- **Concern 7**: Add specific test cases for tags parsing in Step 6

### Nice to have:
- **Concern 2**: Split Step 2 into sub-steps for clearer execution
- **Concern 5**: Decide `/plan archive` no-args behavior
