# 2026-02-17: Template Resolver CLI + Unified Override Paths

## What changed

Added `arete template resolve/list/view` CLI commands and unified all workspace template override paths to `templates/outputs/{skill-id}/{variant}.md`.

## Why

Template resolution was agent-interpreted — each skill's SKILL.md had a multi-step prose flowchart that agents were supposed to follow. This was fragile: agents understood the resolution order conceptually but still fell back to skill defaults or training when generating content, even after being explicitly told not to.

The fix moves resolution to code. `resolveTemplateContent()` is the single source of truth. SKILL.md instructions collapse from a 10-line flowchart to one CLI command the agent runs.

## Architecture decisions

**Decision 1 — Unified override path**: All workspace template overrides now live at `templates/outputs/{skill-id}/{variant}.md`. Previously different template categories used different paths (`templates/meeting-agendas/`, `templates/plans/`, `templates/projects/`). The unified path makes the pattern learnable and the CLI command simple.

**Decision 2 — CLI resolver**: `arete template resolve --skill <id> --variant <name>` handles resolution deterministically. The agent calls the command, gets back template content, uses it. Resolution logic lives in `resolveTemplatePath()` (TypeScript), not in prose instructions.

**TEMPLATE_REGISTRY**: Single source of truth for all known skill/variant combinations. Powers CLI validation and `template list` output. Lives in `packages/core/src/utils/templates.ts`.

## Files changed

- `packages/core/src/utils/templates.ts` — added `TEMPLATE_REGISTRY`, `resolveTemplateContent()`
- `packages/core/src/utils/index.ts` — export new symbols
- `packages/cli/src/commands/template.ts` — full rewrite: `resolve`, `list`, `view` commands
- `packages/runtime/skills/*/SKILL.md` — 9 files: all template load instructions → `arete template resolve` command
- `packages/runtime/skills/PATTERNS.md` — updated Template Resolution pattern
- `packages/runtime/templates/README.md` — unified override paths, CLI-based prompts
- `packages/runtime/GUIDE.md` — updated quick-reference table

## Tests added

- Unit: `TEMPLATE_REGISTRY` structure and completeness (4 tests)
- Unit: `resolveTemplateContent()` — null, skill-local, override precedence (3 tests)
- CLI: `template resolve` — skill-local, workspace override, --path flag, unknown skill/variant (6 tests)
- CLI: `template list` — lists all skills, detects hasOverride (2 tests)
- CLI: `template view` — returns content, errors for unknown skill (2 tests)

## Learnings

- Agent-interpreted logic is always fragile — instructions get misread, assumptions get made. Any logic that needs to be deterministic (file resolution, path lookup, registry validation) should live in code exposed as a CLI command.
- The prose-flowchart-vs-command pattern: when you find yourself writing a multi-step "attempt to read X, if exists use it, else try Y" prose block in a SKILL.md, that's a signal the logic belongs in the CLI.
