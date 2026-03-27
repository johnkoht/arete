# Pre-Mortem: Intelligence Discoverability

## Risk 1: Compressed AGENTS.md Bloat

**Problem**: The pipe-delimited `[Intelligence]` section in dist/AGENTS.md is designed to be compact. Adding guidance lines could push the GUIDE over the 10KB threshold or make the compressed format hard to parse. The build script checks file size.

**Mitigation**: Keep compressed guidance to 1-2 lines max. Use the `|high_value:` pattern. Detailed guidance goes in the full `intelligence.md` source — the compressed version just needs enough to trigger the right behavior. Verify `npm run build` succeeds and check output size.

**Verification**: After T2/T3, run `npm run build` and check dist/AGENTS.md is under 10KB. Read the compressed `[Intelligence]` section and confirm it's parseable.

---

## Risk 2: Recipe Blocks Reference Wrong CLI Flags

**Problem**: The authoring guide copy-paste recipes could reference incorrect flags, deprecated syntax, or nonexistent options (e.g., `--memory` might not be a real flag). If skill authors paste broken commands, the experience is terrible.

**Mitigation**: Before writing recipes, verify each command's actual flags by running them in the test workspace or checking the CLI source. Cross-reference `packages/cli/src/commands/` for actual option definitions.

**Verification**: Every CLI command in the authoring guide has been verified against actual CLI source or test output.

---

## Risk 3: pm-workspace Rule Regression

**Problem**: Editing the pm-workspace.mdc rule could accidentally break the existing mandatory routing workflow — the most critical behavior in the system. Strengthening the briefing language could conflict with or override the skill-first routing mandate.

**Mitigation**: The briefing step goes AFTER routing (between "route to skill" and "execute skill"), never before or instead of routing. Keep the existing routing section untouched. Only add to the intelligence services section and the workflow table. Diff the change carefully.

**Verification**: After T4, read the full rule and confirm: (1) routing mandate untouched, (2) briefing step is in the right place, (3) no contradicting instructions.

---

## Risk 4: Cursor/Claude-Code Rule Sync

**Problem**: pm-workspace.mdc exists in both `cursor/` and `claude-code/` directories. If we update one and forget the other, they drift.

**Mitigation**: Edit cursor version first, then copy the exact change to claude-code. Diff the two files after to confirm they match.

**Verification**: `diff packages/runtime/rules/cursor/pm-workspace.mdc packages/runtime/rules/claude-code/pm-workspace.mdc` shows only expected differences (if any).

---

## Risk 5: Authoring Guide Scope Creep

**Problem**: T1 (authoring guide) is the largest task. It could balloon — documenting every edge case, every frontmatter field, every service nuance. This delays everything else and produces a wall of text nobody reads.

**Mitigation**: Cap the guide at ~200 lines. Focus on the 6 recipes and keep each tight: command, what it returns, one example. The full intelligence.md has the detailed docs — the authoring guide is a quick-start, not a reference manual.

**Verification**: Check final line count. If over 250 lines, trim.

---

## Risk 6: build-agents.ts Compilation Format

**Problem**: The `intelligence.md` source gets compiled by `scripts/build-agents.ts` into a compressed pipe-delimited format. Adding new sections or changing the structure could confuse the compiler if it relies on specific heading patterns.

**Mitigation**: Read `scripts/build-agents.ts` to understand how guide sources are compiled before changing intelligence.md structure. Follow existing patterns (headings, sections) rather than inventing new structures.

**Verification**: `npm run build` succeeds and the compiled output contains the new content in the expected format.

---

## Summary

Total risks identified: 6
Categories covered: Scope Creep, Integration, Code Quality, Multi-IDE Consistency, Context Gaps, Platform Issues

**Key mitigations to apply during execution:**
1. Verify every CLI command in recipes against actual source
2. Keep compressed guidance lines to 1-2 max
3. Don't touch the routing mandate — briefing goes after routing
4. Sync both rule directories
5. Cap authoring guide at ~200 lines
6. Check build-agents.ts compilation patterns before editing intelligence.md
