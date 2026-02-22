# Router Fix + Skill Rename — Research Notes

## Problem Statement

The skill/tool router misroutes queries when items share names. Specifically:
1. **Tools aren't in the routing candidate pool** — `arete route` and `arete skill route` only load skills, never tools. The `SkillCandidate` model supports `type: 'tool'` and scoring works (proven by existing test), but tools are never added to the candidate array.
2. **Naming collision** — Both the "Areté activation" skill and the "30/60/90 new job" tool are called `onboarding`. Even with tools in the pool, the shared name would cause ambiguous scoring.

## Key Files Discovered

### Router flow
- `packages/core/src/services/intelligence.ts` — `routeToSkill()` + `scoreMatch()` (lines 55-160)
- `packages/cli/src/commands/route.ts` — `arete route` command (only loads skills)
- `packages/cli/src/commands/skill.ts` — `arete skill route` subcommand (only loads skills)
- `packages/cli/src/commands/tool.ts` — ad-hoc `getToolsList()`/`getToolInfo()` (lines 121-170, CLI-only, not used in routing)

### Scoring algorithm (`scoreMatch`)
- ID token match: +20
- ID hyphen match: +15
- Trigger phrase match: +18 per match
- Description token overlap: +4 per word
- Description phrase match: +10
- Work type keyword match: +6
- Category bonus: +1-2
- Minimum threshold: score ≥ 4

### The collision
| Item | Location | Purpose |
|------|----------|---------|
| `onboarding` **skill** | `packages/runtime/skills/onboarding/SKILL.md` | Areté workspace activation (15-30 min setup) |
| `workspace-tour` **skill** | `packages/runtime/skills/workspace-tour/SKILL.md` | Orient users to workspace |
| `onboarding` **tool** | `.cursor/tools/onboarding/TOOL.md` (runtime: `packages/runtime/tools/onboarding/`) | 30/60/90 day plan for new job |

### Models
- `packages/core/src/models/skills.ts` — `SkillCandidate` already has `type?: 'skill' | 'tool'`, `lifecycle`, `duration`

### Tests
- `packages/core/test/services/intelligence.test.ts` — has `routeToSkill` tests including tool routing (but only when tool is manually added to candidates array)
- `packages/cli/test/golden/route.test.ts` — golden tests for route command

### Cross-references to update for rename
- `packages/runtime/skills/rapid-context-dump/SKILL.md` — references "onboarding skill", "onboarding-dump" folder
- `packages/runtime/rules/*/pm-workspace.mdc` — intent table, examples (both cursor/ and claude-code/)
- `packages/runtime/rules/*/routing-mandatory.mdc` — PM action list, examples
- `packages/runtime/GUIDE.md` — skill table, getting-started section
- `.agents/sources/guide/workflows.md` — workflow examples
- `.agents/sources/guide/tools-index.md` — tool references (stay as-is, correctly named "onboarding")

## Decisions Made
- Rename to `getting-started` (not workspace-setup, arete-setup, or setup-guide)
- Triggers should be lenient for natural variants ("help me setup arete", "set up my workspace", etc.)
- Keep `inputs/onboarding-dump/` folder name as-is (workspace path, renaming breaks existing users)
- Fix A (tools in router) before B (rename) so we can verify end-to-end
- Defer scoring improvements (Part C) until after A+B
