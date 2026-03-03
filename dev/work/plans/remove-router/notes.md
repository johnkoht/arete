# Remove Router — Working Notes

## Exploration Summary (2026-03-02)

### Files explored
- `packages/core/src/services/intelligence.ts` — routeToSkill (~120 lines), scoreMatch, tokenize, STOP_WORDS, WORK_TYPE_KEYWORDS. assembleBriefing + prepareForSkill are the valuable parts (stay).
- `packages/cli/src/commands/route.ts` — 92 lines, standalone command
- `packages/cli/src/commands/skill.ts` — skill route subcommand at lines 209-285
- `packages/cli/src/lib/tool-candidates.ts` — only used by routing commands
- `packages/runtime/rules/cursor/routing-mandatory.mdc` — forces router call before every PM action
- `packages/runtime/rules/cursor/pm-workspace.mdc` — intent table (lines 154-176), tool table (199-202), intelligence services table (290-297), pre-flight checklist (345-370), intelligence patterns (get_meeting_context, extract_decisions_learnings)
- `packages/core/src/compat/intelligence.ts` — routeToSkill compat shim
- `packages/core/src/models/skills.ts` — RoutedSkill type (can remove), SkillCandidate (stays — used by SkillContext)
- `packages/core/src/model-router.ts` — classifyTask (independent, stays)
- `packages/core/test/services/intelligence.test.ts` — ~470 lines of routing tests, ~150 lines of briefing tests

### Key dependencies
- `SkillCandidate` type is used by `prepareForSkill()` → `SkillContext` — cannot remove
- `RoutedSkill` type is only returned by `routeToSkill()` — can remove
- `tool-candidates.ts` is only imported by `route.ts` and `skill.ts` (routing path) — can remove
- `classifyTask` / model-router.ts is completely independent — stays

### Test impact
- `intelligence.test.ts`: 62 describe/it blocks, ~73 routeToSkill references
- `golden/route.test.ts`: entire file is routing tests
- Expected test count drop: ~1051 → ~900

### Intelligence service flow today
1. Skills declare `intelligence: [context_injection, memory_search]` and `requires_briefing: true/false` in frontmatter
2. `pm-workspace.mdc` has "When to Use Intelligence Services" table — supplemental, not enforced
3. `AGENTS.md` has `tool_selection` mapping: "What do you know about X?" → context --for
4. Router acts as mandatory checkpoint that keeps agents in "Areté tool" mindset
5. Without router, info queries ("what do we know about X") may bypass intelligence services entirely

### Design insight
The router's value isn't its matching — it's its **mandatoriness**. The three-path checklist preserves this effect by making information queries an explicit, enforced path that routes to intelligence services, rather than a vague "supplemental context-gathering" afterthought.
