# Scripts LEARNINGS.md

Component-local gotchas and invariants for build scripts.

---

## 2026-03-03: build-agents.ts compression functions are hardcoded

**What broke**: Updated `.agents/sources/guide/intelligence.md` expecting `npm run build` to pick up changes in the compressed dist/AGENTS.md output. The changes didn't appear because `compressIntelligence()` returns a **static string** that ignores the source file content entirely.

**Why it matters**: Most compression functions in `build-agents.ts` are hardcoded — `compressIntelligence()`, `compressVision()`, `compressWorkspaceStructure()`, `compressWorkflows()` all return static strings. Only `compressCLICommands()`, `compressSkillsTable()`, and `compressRulesList()` actually parse their source files. When updating guide sources, you must also update the corresponding compression function.

**Affected functions**:
- `compressIntelligence()` — hardcoded, ignores intelligence.md
- `compressVision()` — hardcoded, ignores vision.md
- `compressWorkspaceStructure()` — hardcoded, ignores workspace-structure.md
- `compressWorkflows()` — hardcoded, ignores workflows.md
- `compressCLICommands()` — partially hardcoded (`tool_selection`, `scope`, `proactive` lines are static; command list is parsed)
- `compressSkillsTable()` — parses source file ✅
- `compressRulesList()` — parses source file ✅
- `compressMemorySection()` — parses source file ✅

**How to avoid**: When editing any `.agents/sources/` file, check the corresponding compression function in `scripts/build-agents.ts`. If the function is hardcoded, update both the source file AND the function. Verify by running `npm run build` and checking `dist/AGENTS.md` for the expected changes.
