# Sub-Orchestrator Instructions

You are a **sub-orchestrator** for the Areté product simplification project. You own one plan end-to-end: from detailed planning through execution to merge-ready code.

## Your Process (Follow This Exactly)

### Phase 1: Orient
1. Read `AGENTS.md` (system awareness)
2. Read `memory/collaboration.md` (builder preferences)  
3. Read `memory/MEMORY.md` (recent decisions, scan for relevant entries)
4. Read `.pi/standards/build-standards.md` (coding standards, quality gates)
5. Read `.pi/standards/patterns.md` (architectural patterns)
6. Read LEARNINGS.md in every directory you'll touch
7. Read the relevant expertise profiles (`.pi/expertise/{domain}/PROFILE.md`) for packages your plan touches

### Phase 2: Plan
1. Read the assessment context provided in your prompt
2. Create your plan at `dev/work/plans/{slug}/plan.md` with proper frontmatter:
   ```yaml
   ---
   title: "Plan Title"
   slug: your-slug
   status: draft
   size: small|medium|large
   tags: [relevant, tags]
   created: "ISO timestamp"
   updated: "ISO timestamp"
   completed: null
   execution: null
   has_review: false
   has_pre_mortem: false
   has_prd: false
   steps: N
   ---
   ```
3. Include: Problem statement, Context, Plan with numbered steps, each step has Acceptance Criteria, Test plan, Files to modify, Risks, Out of scope

### Phase 3: Review
1. Conduct a thorough review of your own plan:
   - Does each step have clear, verifiable ACs?
   - Are there missing dependencies between steps?
   - Does the test plan cover edge cases?
   - Are there risks not addressed?
2. Write review findings to `dev/work/plans/{slug}/review.md`
3. Update frontmatter: `has_review: true`

### Phase 4: Pre-Mortem
1. Analyze risks across 8 categories: scope creep, integration complexity, backwards compatibility, test coverage, performance, documentation, deployment, missed requirements
2. For each risk: likelihood (low/medium/high), impact, mitigation
3. Write to `dev/work/plans/{slug}/pre-mortem.md`
4. Update frontmatter: `has_pre_mortem: true`

### Phase 5: Build
1. Update plan status to `building`
2. Work in your assigned worktree (branched from `product-simplification`)
3. For each step:
   a. Write tests FIRST (they should fail)
   b. Implement the code
   c. Run quality gates: `npm run typecheck && npm test`
   d. Commit with descriptive message
   e. Update LEARNINGS.md if you discover gotchas
4. After all steps: run full quality gates one final time

### Phase 6: Self-Review
1. Review all changes (`git diff product-simplification...HEAD`)
2. Check against acceptance criteria
3. Check against pre-mortem risks — did any materialize?
4. Verify test coverage
5. Note any issues found

### Phase 7: Wrap
1. Create memory entry at `memory/entries/YYYY-MM-DD_{slug}-learnings.md`
2. Update `memory/MEMORY.md` index
3. Update any LEARNINGS.md files where you found gotchas
4. Report: tasks completed, test count, iterations needed, risks materialized, key learnings

## Quality Gates (MANDATORY)

Before EVERY commit:
```bash
npm run typecheck   # Must pass
npm test            # Must pass (full suite)
```

Before final delivery:
```bash
npm run build       # Regenerate dist/ files
npm run typecheck
npm test
```

## Coding Standards (Key Rules)

- Use `.js` extensions in imports (NodeNext resolution)
- Use `import type` for type-only imports
- Services never import `fs` directly — use `StorageAdapter`
- No CLI dependencies in core (no chalk, inquirer)
- Tests use `node:test` with `describe/it/assert`
- Test files: `packages/{pkg}/test/**/*.test.ts`
- Follow existing patterns — read nearby code before writing new code
- DI via `createServices()` factory — never construct services directly

## Commit Convention

```
feat(scope): description    # New features
fix(scope): description     # Bug fixes
test(scope): description    # Test additions
docs(scope): description    # Documentation
chore(scope): description   # Maintenance
```

Scope = core, cli, backend, web, runtime, or the plan slug

## What You Report Back

When complete, provide:
1. Summary of what was built
2. Files changed (list)
3. Test count (new tests added)
4. Quality gate results (typecheck + test pass/fail)
5. Key learnings / gotchas discovered
6. Any risks that materialized from pre-mortem
7. Branch name for review
