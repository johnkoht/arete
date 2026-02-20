---
title: User Rule Overrides
slug: user-rule-overrides
status: idea
size: unknown
tags: [improvement]
created: 2026-02-20T03:47:16Z
updated: 2026-02-20T03:47:16Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# User Rule Overrides

**Added**: 2026-02-13  
**Priority**: Low  
**Status**: Future consideration

## Problem

Currently, `arete update` overwrites all rules in `.cursor/rules/` (or `.claude/rules/`). If a user has customized a rule locally, their changes are lost on update.

## Context

- Transpiler deletes all `.mdc`/`.md` files in rules directory before re-transpiling from source
- No mechanism to preserve user modifications
- Previously had an auto-generated header warning users, but it broke Cursor's frontmatter parsing (removed 2026-02-13)

## Potential Solutions

1. **Preserve pattern**: Similar to how `syncDirectory` has a `preserve` array, add a mechanism for rules that should not be overwritten
2. **Override directory**: Support a `.cursor/rules-overrides/` directory where user rules take precedence
3. **Merge strategy**: For rules that exist in both source and workspace, merge user modifications with upstream changes
4. **Lock file**: User can create `.cursor/rules/.keep` listing rules that should not be updated
5. **Diff on update**: Show user what would change and let them accept/reject per-rule

## Considerations

- Most users probably don't customize rules
- Those who do likely want full control
- Simpler approach (e.g., preserve list or override dir) probably sufficient

## Related

- Rule transpilation: `src/core/rule-transpiler.ts`
- Update command: `src/commands/update.ts`
