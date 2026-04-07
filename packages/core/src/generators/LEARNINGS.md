## How This Works

The `generators/` module contains pure functions for generating IDE-specific files from workspace configuration and skill definitions. Two generators exist:

- `claude-md.ts` — Generates `CLAUDE.md` content (identity, workspace structure, slash commands table, intelligence services, memory, working patterns, version footer). Pure function: `generateClaudeMd(config, skills) → string`.
- `skill-commands.ts` — Generates `.claude/commands/{name}.md` files from skill definitions. Each skill becomes a slash command that references its `SKILL.md` workflow. `generateSkillCommand(skill) → string`, `generateAllSkillCommands(skills) → Record<string, string>`.

Both are consumed by `ClaudeAdapter` in `packages/core/src/adapters/claude-adapter.ts`.

## Key References

- `packages/core/src/generators/index.ts` — Re-exports from both generators
- `packages/core/src/generators/claude-md.ts` — CLAUDE.md generation
- `packages/core/src/generators/skill-commands.ts` — Slash command generation
- `packages/core/src/adapters/claude-adapter.ts` — Consumer: calls `generateClaudeMd()` in `generateRootFiles()` and `generateAllSkillCommands()` in `generateCommands()`
- `packages/core/src/models/skills.ts` — `SkillDefinition` type (id, name, description, triggers, profile, requiresBriefing)

## Gotchas

- **Slash commands reference skills by relative path.** The generated command file contains `.agents/skills/{id}/SKILL.md` — this is the installed workspace path, not the source repo path. If the skill directory structure changes, command generation must be updated.

- **Profile references in commands use `.agents/profiles/{name}.md`.** When a skill has a `profile` field, the command instructs the agent to adopt that profile. The profile file must exist in the workspace (copied during `arete install`/`arete update` from `sourcePaths.profiles`).

- **Briefing integration is opt-in per skill.** Only skills with `requiresBriefing: true` in their definition include the `arete brief` CLI call in the generated command. Most skills do not require briefing.

## Invariants

- `generateClaudeMd()` is a pure function — no I/O, no side effects.
- `generateAllSkillCommands()` returns `Record<string, string>` where keys are filenames (`{skill-id}.md`) and values are command content.
- Every skill with a valid `id` gets a command file. No filtering by trigger type.
- The CLAUDE.md footer always includes `config.version` and current ISO timestamp.

## Pre-Edit Checklist

- [ ] If changing command format: verify Claude Code recognizes the new format (test with `arete install --ide claude`)
- [ ] If changing CLAUDE.md sections: verify section order matches Claude Code's context window priorities (identity first, patterns last)
- [ ] If adding new skill fields: update both `generateSkillCommand()` and the `SkillDefinition` type
- [ ] Run tests: `npx tsx --test packages/core/test/generators/` (if tests exist) or `npx tsx --test packages/core/test/adapters/claude-adapter.test.ts`
