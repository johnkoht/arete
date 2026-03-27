# Memory Synthesis for Workspace Areas Refactor

## Recent Context (last 14 days)

1. **Goals/Commitments Integration Pattern** (2026-03-19): Adding optional fields to existing entities works well. `goalSlug?: string` was added to commitments with manual linking via numbered list — same pattern applies to `area?: string`.

2. **Service LEARNINGS.md Patterns**: Context service modifications are high-risk — must run existing tests before and after. Services use constructor DI with `StorageAdapter`, not direct fs calls.

## Past Learnings

3. **Use existing parsing patterns**: `goal-parser.ts` uses the `yaml` package and `parseFrontmatter()` — follow this for area YAML parsing.

4. **Services must NOT call fs directly**: All file I/O through `StorageAdapter`. Violating this makes services untestable.

5. **createServices() is async**: CLI commands `await createServices(process.cwd())`. New AreaParser service follows this pattern.

## Builder Preferences

6. **Always use plan-to-prd skill**: Never write PRDs directly — use the skill for correct structure and prd.json generation.

7. **CLI: established patterns over bare minimum**: Check how similar flows work (seed, setup) and match their UX.

8. **Audit all instances of a pattern**: Before changing context service category handling, check ALL code that switches on category values.

## Risks to Avoid

9. **From pre-mortem**: Context service regression is highest risk. Add tests BEFORE modifying getRelevantContext().

10. **From review**: Don't create new template directory — use DEFAULT_FILES or existing template resolution.
