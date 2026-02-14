# Build Rules

Build rules in `.cursor/rules/` define standards and workflows for developing Areté itself.

| Rule | Path | Purpose |
|------|------|---------|
| **arete-vision.mdc** | `.cursor/rules/arete-vision.mdc` | Product philosophy — "Does it help the product builder achieve arete?" Guides all feature and design decisions. |
| **dev.mdc** | `.cursor/rules/dev.mdc` | Core development practices: build skills, build memory, execution path decision tree, quality practices, TypeScript/Node.js conventions, Python conventions, pre-mortem guidelines, skill/rule change checklist, multi-IDE consistency, documentation planning. |
| **testing.mdc** | `.cursor/rules/testing.mdc` | Testing requirements: all code changes must include tests. TypeScript tests (`node:test` + `node:assert/strict`), Python tests (`unittest`), test structure (Arrange-Act-Assert), test mapping, quality gates (typecheck + test:all). |
| **agent-memory.mdc** | `.cursor/rules/agent-memory.mdc` | Memory management for AI agents building Areté: memory locations (entries, collaboration.md, MEMORY.md), when to create entries, when to synthesize collaboration profile, how to leverage build memory before starting work. |
| **plan-pre-mortem.mdc** | `.cursor/rules/plan-pre-mortem.mdc` | Mandatory pre-mortem workflow when in Plan Mode or creating multi-step plans. Includes PRD gateway: offer PRD path for plans with 3+ steps, new systems, integrations, or large refactors. |

## Usage

These rules are automatically applied when working in the Areté build context (BUILDER mode). They inform agent behavior for:

- **arete-vision.mdc** — Always applied; informs every decision
- **dev.mdc** — Code changes, refactors, new features
- **testing.mdc** — All code changes (mandatory test coverage)
- **agent-memory.mdc** — Memory capture, collaboration profile updates
- **plan-pre-mortem.mdc** — Multi-step plans, complex work, PRD execution

## Related Content

- Build skills: `.agents/sources/builder/skills-index.md`
- Build conventions: `.agents/sources/builder/conventions.md`
- Build memory: `.agents/sources/builder/memory.md`
