# Review: Intelligence Discoverability PRD

**Type**: PRD  
**Audience**: Both — Builder (T2/T3/T4 change dev tooling and GUIDE compilation) and User (T1/T5 change runtime skill authoring docs)

## Concerns

1. **Compressed Intelligence is Hardcoded (Critical)**
   The `compressIntelligence()` function in `scripts/build-agents.ts` returns a **static string** — it completely ignores the intelligence.md source file content. T2 says "update intelligence.md" and expects `npm run build` to pick it up, but it won't. The compressed `[Intelligence]` section in dist/AGENTS.md must be updated by editing the `compressIntelligence()` function directly.
   - **Suggestion**: T2 must update BOTH intelligence.md (full source) AND `compressIntelligence()` in build-agents.ts (compressed output). Add this to AC explicitly.

2. **Same Issue for CLI Commands Compression**
   `compressCLICommands()` does parse the source file, but it only captures `- \`arete ...\`` lines and the hardcoded `tool_selection` / `context_scope` / `memory_scope` lines. If T3 adds a "Quick Reference" callout as prose, it won't survive compression.
   - **Suggestion**: T3 should update the hardcoded lines in `compressCLICommands()` as well, or add new `|` lines that carry the guidance.

3. **Missing: `--memory` flag verification**
   Risk 2 from pre-mortem. T1 and T3 reference `arete people show --memory` but we should verify this flag actually exists before baking it into recipes.
   - **Suggestion**: Check `packages/cli/src/commands/` for people show options before writing recipes.

4. **T5 Links to Guide Files That Are Compiled Away**
   T5 says "link to _authoring-guide.md and _integration-guide.md" from the skills README. But these files live in `packages/runtime/skills/` (the source), which gets copied to user workspaces as `.agents/skills/`. The links should be relative and work in both the repo and installed workspace.
   - **Suggestion**: Use relative paths that work from `.agents/skills/README.md` → `.agents/skills/_authoring-guide.md`.

5. **No Task Touches the `compressCLICommands` Hardcoded Lines**
   The `tool_selection`, `context_scope`, and `memory_scope` lines in the build script are critical guidance that agents see. They're actually pretty good already but could be enhanced. No task explicitly calls this out.
   - **Suggestion**: Add to T3's scope: update the hardcoded lines in `compressCLICommands()` to include scope info and `--memory` callout.

## Strengths

- Good scope boundaries — docs-only, no core code changes
- Smart dependency ordering (T1 → T5)
- Pre-mortem catches the right risks (especially rule regression and recipe verification)
- Addresses all three discoverability gaps (skill authors, agents, rule strength)

## Devil's Advocate

**If this fails, it will be because...** the compressed AGENTS.md guidance gets stale as the intelligence.md source evolves. We're creating two places that need updating (source + compression function) but nothing enforces they stay in sync. Future edits to intelligence.md will silently fail to update the compressed output.

**The worst outcome would be...** skill authors paste recipe blocks with wrong flags and get cryptic errors. We'd be teaching people to use a broken workflow, which is worse than no guide at all.

## Verdict

- [x] **Approve with suggestions** — Address the hardcoded compression issue (concerns 1, 2, 5) and verify CLI flags (concern 3) before execution. These are easy additions, not scope changes.

## Required PRD Updates

1. T2 AC: Add "Update `compressIntelligence()` in `scripts/build-agents.ts` to include high-value guidance line(s)"
2. T3 AC: Add "Update hardcoded lines in `compressCLICommands()` to include scope info and people show --memory"
3. T1/T3: Verify `arete people show --memory` flag exists before writing recipes
4. T5: Specify relative link paths that work in installed workspaces
