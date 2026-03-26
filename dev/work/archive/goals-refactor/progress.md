# Goals Refactor Progress

## Task 2.5: Update CLI Seed

**Status**: Complete  
**Commit**: 9c5b1b5

### Summary
Updated the seed command to create individual goal files instead of copying `quarter.md` from fixtures. New workspaces now get example goal files with proper frontmatter structure.

### Files Changed
- `packages/cli/src/commands/seed.ts` — Modified to seed individual goal files
- `test-data/goals/2026-Q1-1-ship-onboarding-v2.md` — New fixture goal file
- `test-data/goals/2026-Q1-2-admin-setup-discovery.md` — New fixture goal file

### Implementation Details
1. Added `goals` stat tracking separate from `plans`
2. Check for legacy `quarter.md` — if exists, skip individual goal seeding (backward compat)
3. Created two example goal files with frontmatter matching the `Goal` type
4. Kept week.md seeding from plans/ unchanged

### Quality Checks
- typecheck: ✓
- tests: ✓ (1868 passed)

### Reflection
Straightforward task. The existing seed structure made it easy to add the new goal seeding logic. The backward compatibility check ensures existing workspaces with `quarter.md` aren't disrupted. ~5 minutes implementation, ~3 minutes testing.

---

## Task 5: Update Goals-Alignment Skill

**Status**: Complete  
**Commit**: c326147

### Summary
Updated the goals-alignment skill to read individual goal files from `goals/*.md` instead of `quarter.md`. The skill now parses frontmatter to extract `orgAlignment` field for building the alignment table. Added graceful fallback to legacy `quarter.md` format.

### Files Changed
- `packages/runtime/skills/goals-alignment/SKILL.md` — Updated to read individual goal files with frontmatter

### Implementation Details
1. Step 1 now reads `goals/*.md` (excluding `strategy.md`) and parses frontmatter for `id`, `title`, `status`, `orgAlignment`
2. Filters to `status: active` goals for the current quarter
3. Added fallback: if no individual files, reads `goals/quarter.md` (legacy format)
4. Step 2 updated with example table format showing Goal → Org Alignment → Status
5. References section updated with individual goals path and frontmatter structure documentation
6. Error handling updated for missing `orgAlignment` frontmatter

### Quality Checks
- typecheck: N/A (skill markdown file only)
- tests: N/A (skill markdown file only)

### Reflection
Clean skill update. The existing alignment table format was preserved while adding the new individual file reading. The frontmatter documentation in References section helps future maintainers understand the expected structure. ~10 minutes implementation.
