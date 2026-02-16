# Build Rules

Build rules in `.cursor/rules/` define standards and workflows for developing Areté itself. **Dev agents**: Cursor (IDE) and Pi (terminal-native) are both supported; `.pi/` contains Pi configuration.

| Rule | Path | Purpose |
|------|------|---------|
| **dev.mdc** | `.cursor/rules/dev.mdc` | Quality gates, execution path decision tree, code review checklist, skill/rule change procedures, multi-IDE consistency, documentation planning. |
| **testing.mdc** | `.cursor/rules/testing.mdc` | Testing requirements: all code changes must include tests. TypeScript tests (`node:test` + `node:assert/strict`), Python tests (`unittest`), test structure (Arrange-Act-Assert), test mapping, quality gates (typecheck + test:all). |
| **plan-pre-mortem.mdc** | `.cursor/rules/plan-pre-mortem.mdc` | Mandatory pre-mortem workflow when in Plan Mode or creating multi-step plans. Includes PRD gateway: offer PRD path for plans with 3+ steps, new systems, integrations, or large refactors. |

## What Moved to AGENTS.md

The following are now in **AGENTS.md** (compressed, always-loaded):

- **Product philosophy** (was `arete-vision.mdc`) → `[Vision]` section
- **Memory management** (was `agent-memory.mdc`) → `[Memory]` section + `builder/memory.md` source
- **Conventions** (was in `dev.mdc`) → `[Conventions]` section + `builder/conventions.md` source

## Usage

These rules are automatically applied when working in the Areté build context. They inform agent behavior for:

- **dev.mdc** — Quality gates, checklists, procedural workflows
- **testing.mdc** — All code changes (mandatory test coverage)
- **plan-pre-mortem.mdc** — Multi-step plans, complex work, PRD execution

## Related Content

- Build skills: `.agents/sources/builder/skills-index.md`
- Build conventions: `.agents/sources/builder/conventions.md`
- Build memory: `.agents/sources/builder/memory.md`
