# AI Configuration PRD Execution — 2026-03-08

## Summary

Completed the ai-config PRD: unified AI configuration for Areté with AIService wrapping pi-ai, backend migration from pi-coding-agent, and CLI credential/config management.

## Metrics

- **Tasks**: 5/5 complete (100%)
- **Success Rate**: 100% first-attempt (some iterate cycles for DRY/doc fixes)
- **Iterations**: 3 total (AI-3 docs, AI-4 DRY, AI-5 docs)
- **Tests Added**: ~75 new tests
- **Final Test Count**: 1528 passing
- **Pre-mortem Risks**: 0/8 materialized
- **Token Usage**: ~100K total (~20K orchestrator, ~80K subagents)

## What Worked Well

1. **Detailed task prompts with explicit patterns**: Tasks that included TypeBox schema examples, output format specs, and exact file paths executed cleanly. Ambiguity = iteration.

2. **Pre-mortem mitigations embedded in prompts**: Explicitly referencing risks ("Clone frontmatter before mutating per LEARNINGS.md") prevented bugs.

3. **testDeps injection pattern**: Consistently used for mocking pi-ai without real API calls. Pattern from qmd.ts scaled well.

4. **Reviewer pre-work sanity checks**: Caught missing context (e.g., testProviderConnection not exported) before developer started.

5. **Reviewer documentation gap detection**: Caught missing AGENTS.md updates in AI-3 and AI-5.

## What Didn't Work

1. **build:agents:dev script doesn't exist**: Task referenced non-existent script. Dev AGENTS.md is hand-maintained. Workaround was trivial but shows stale task templates.

2. **DRY violations in iterate cycles**: AI-4 had duplicate aiConfig objects caught in review. Could prevent with explicit "extract constants for repeated structures" in prompt.

## Collaboration Patterns Observed

- Builder approved pre-mortem quickly and let execution proceed autonomously
- No mid-execution corrections needed — task descriptions were clear enough

## Subagent Insights (Synthesized)

| Task | Key Insight |
|------|------------|
| AI-1 | ajv ESM import requires named import `{ Ajv }` not default |
| AI-2 | Gray-matter caching gotcha from LEARNINGS.md prevented bug |
| AI-3 | Dynamic import for @inquirer/prompts essential per LEARNINGS.md |
| AI-4 | Detailed task description enabled smooth phase separation |
| AI-5 | Direct YAML manipulation needed for nested config (updateManifestField is top-level only) |

## System Improvements Applied

- `packages/core/src/services/LEARNINGS.md` — Added AIService section with config DI pattern and ajv import gotcha
- `packages/apps/backend/LEARNINGS.md` — Added AIService Integration section, marked Pi SDK section as superseded
- `.agents/sources/shared/cli-commands.md` — Added AI Configuration section with credentials and config commands
- `AGENTS.md` — Added credentials and config command entries
- `dev/catalog/capabilities.json` — Added ai-service entry

## Recommendations

### Continue
- Explicit output format specs in task descriptions
- Pre-mortem mitigations embedded in subagent prompts
- Reviewer pre-work sanity checks for context completeness
- testDeps injection pattern for external service mocking

### Stop
- Referencing build scripts that may not exist (verify first)

### Start
- Add "extract constants for repeated structures" to standard DRY guidance
- Consider adding `updateNestedConfig()` to WorkspaceService for nested YAML updates

## Dependencies Unblocked

This PRD completion unblocks:
- **Intelligence Tuning (INT-1 through INT-5)**: Can now use AIService for extraction, summarization, confidence scoring
- **CLI extraction commands**: Can use AIService.callStructured() for typed responses

## Files Changed (Summary)

### New Files
- `packages/core/src/services/ai.ts` — AIService class
- `packages/core/src/credentials.ts` — Credential management
- `packages/cli/src/commands/credentials.ts` — Credentials CLI
- `packages/cli/src/commands/config.ts` — Config CLI

### Modified
- `packages/core/src/factory.ts` — AIService wiring
- `packages/core/src/models/workspace.ts` — AITask, AITier, AIConfig types
- `packages/core/src/config.ts` — AI defaults
- `packages/apps/backend/src/services/agent.ts` — pi-ai migration
- `packages/apps/backend/package.json` — Removed pi-coding-agent
- `packages/cli/src/commands/onboard.ts` — AI configuration step

---

**Build memory entry created**: 2026-03-08
