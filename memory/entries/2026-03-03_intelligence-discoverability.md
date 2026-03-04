# Intelligence Discoverability

**Date**: 2026-03-03  
**Type**: Documentation  
**PRD**: `dev/work/plans/intelligence-discoverability/prd.md`

## What Changed

Made Areté's intelligence layer (context, briefing, memory search, entity resolution, people intelligence) more discoverable for custom skill authors and more proactively used by agents.

### Deliverables

1. **Skill Authoring Guide** (`packages/runtime/skills/_authoring-guide.md`) — New guide with 6 copy-paste intelligence recipe blocks (context, briefing, people resolution, memory search, commitments, entity relationships), frontmatter reference, and a complete example skill (stakeholder-update).

2. **AGENTS.md Intelligence Guidance** (`.agents/sources/guide/intelligence.md` + `scripts/build-agents.ts`) — Added "High-Value Patterns" section with 8 proactive patterns telling agents when to reach for each service. Added "proactively use when" annotations to each service section. Updated `compressIntelligence()` with `|high_value:` and `|scope:` lines.

3. **CLI Commands Guidance** (`.agents/sources/shared/cli-commands.md` + `scripts/build-agents.ts`) — Added Intelligence Quick Reference table before command list. Added `arete people show --memory` to intelligence section. Added scope descriptions. Updated `compressCLICommands()` hardcoded lines.

4. **pm-workspace Rule** (`packages/runtime/rules/cursor/pm-workspace.mdc` + `claude-code/`) — Strengthened `requires_briefing: true` to MUST language. Integrated briefing check into mandatory workflow (step 3: LOAD → BRIEF → EXECUTE). Added community skill guidance.

5. **Skills README** (`packages/runtime/skills/README.md`) — Expanded "Creating Your Own Skills" from 4 lines to full section with intelligence and integration guide links, frontmatter reference, and See Also.

### Files Changed

- `packages/runtime/skills/_authoring-guide.md` (new)
- `.agents/sources/guide/intelligence.md`
- `.agents/sources/shared/cli-commands.md`
- `scripts/build-agents.ts` (compressIntelligence, compressCLICommands)
- `packages/runtime/rules/cursor/pm-workspace.mdc`
- `packages/runtime/rules/claude-code/pm-workspace.mdc`
- `packages/runtime/skills/README.md`
- `scripts/LEARNINGS.md` (new)

## Key Decisions

- **Instruction-based, not automatic**: `requires_briefing: true` triggers agent instructions to run `arete brief`, not automatic CLI-level execution. Consistent with how everything else works in the system.
- **Both source AND compression function**: Guide source files and `build-agents.ts` compression functions must be updated together. Compression functions for intelligence, vision, workspace, and workflows are hardcoded static strings.
- **`brief --for` as default recommendation**: Changed the primary recommendation from `context --for` to `brief --for` for general knowledge queries, since brief searches everything (context + memory + entities) while context only searches workspace files.

## Learnings

- **build-agents.ts compression functions are hardcoded**: 4 of 8 compression functions ignore their source file entirely and return static strings. This was caught during review — the PRD originally assumed updating intelligence.md would flow through `npm run build`. Added `scripts/LEARNINGS.md` to document this.
- **Do not skip planning**: Jumped from plan discussion straight to writing a PRD by hand — skipping the formal plan step, plan approval, pre-mortem gate, and the plan-to-prd skill. This is wrong even when scope feels clear. The correct flow is: plan → approval → pre-mortem (if 3+ steps) → offer PRD path → use plan-to-prd skill. Never write a PRD directly. The builder let it proceed this time but the process exists to give the builder checkpoints to shape work before it's locked in.

## Metrics

- 5/5 tasks complete
- 0 code changes (docs only)
- 1235 tests passing, 0 failures
- dist/AGENTS.md: 9.59 KB (under 10KB threshold)
- 6 pre-mortem risks, 1 materialized (hardcoded compression — caught in review, mitigated)
