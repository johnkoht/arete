# Claude Code-Friendly Workspace Support

**Date**: 2026-04-05
**Branch**: `worktree-claude-code-friendly`
**Scope**: IDE adapter system, slash command generation, profiles, rules consolidation

## Metrics

- Files changed: ~25
- New tests: 1 (workspace update --ide claude flow)
- New skills: 3 (wrap, pre-mortem, review-plan)
- New profiles: 3 (pm-orchestrator, pm-advisor, plan-reviewer)
- Slash commands generated: per-skill `.claude/commands/` files

## Pre-mortem Effectiveness

N/A — this work was direct implementation, not a multi-phase PRD.

## What Worked

- **Slash command generation pattern**: Skills define triggers in SKILL.md frontmatter; `generateAllSkillCommands()` in `packages/core/src/generators/skill-commands.ts` reads them and produces one `.md` file per skill in `.claude/commands/`. Clean separation between skill definition and IDE integration.
- **Profiles system**: `.agents/profiles/` directory with markdown profiles (pm-orchestrator.md, pm-advisor.md, plan-reviewer.md) that skills reference via `$argument` syntax. Profiles are always refreshed on `arete update` since they're reference docs, not user content.
- **IDE adapter interface design**: `IDEAdapter` interface with optional `generateCommands?()` method. Cursor adapter doesn't implement it (returns undefined), Claude adapter does. Interface dispatch (`typeof adapter.generateCommands === 'function'`) avoids coupling to concrete types.
- **Rules consolidation for Claude Code**: Claude Code only needs 3 rules (agent-memory, context-management, project-management) vs Cursor's 7. The rest of the guidance is consolidated into CLAUDE.md. The `update()` method handles rule migration by removing rules not in the reduced allow list.

## What Didn't Work

- **Initial `instanceof ClaudeAdapter` checks**: Three places in `workspace.ts` used `instanceof` to gate Claude-specific behavior. This couples the service layer to a concrete adapter class. Refactored to use interface dispatch and `adapter.target === 'claude'` checks instead.
- **Missing `--json` guard on `--ide` validation**: The CLI `update` command's IDE validation exited with chalk text even in `--json` mode, inconsistent with every other error path that checks `opts.json` first.

## Recommendations

- When adding IDE-specific behavior, prefer optional interface methods over `instanceof` checks.
- All CLI error exits should check `opts.json` before emitting formatted text.
- The `generateCommands()` pattern could be extended to other IDEs that support slash commands.

## Follow-ups

- Consider adding automated test for `transformRuleContent()` over all rule files (testing gap noted in rules LEARNINGS.md).
- The `claude-code/` rules directory now has fewer files than `cursor/` — the "identical content" invariant in rules LEARNINGS.md needed updating.
