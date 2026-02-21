## How This Works

`packages/runtime/rules/` contains **PRODUCT rules** — rules that get copied into end-user workspaces during `arete install`. They are distinct from **BUILD rules** (`.cursor/rules/*.mdc`), which govern Areté development. The runtime rules are stored in two subdirectories: `cursor/` (`.mdc` extension, used as-is for Cursor IDE) and `claude-code/` (`.md` extension, for Claude Code). Both directories contain the same 7 rule files. The canonical source for content is `cursor/` — when adding or editing rules, edit `cursor/` first, then mirror to `claude-code/`. Both directories use `.mdc` extension and contain identical content at commit time. At install time, `workspace.ts` copies rules and renames files using `adapter.ruleExtension` (`.mdc` for Cursor, `.md` for Claude Code). The `ClaudeAdapter` in `packages/core/src/adapters/claude-adapter.ts` has a `transformRuleContent()` method that can convert `.cursor/` paths → `.claude/` and `.mdc` → `.md`, but this is NOT invoked during install — content is copied as-is. The rule files are: `agent-memory.mdc`, `arete-vision.mdc`, `context-management.mdc`, `pm-workspace.mdc`, `project-management.mdc`, `qmd-search.mdc`, `routing-mandatory.mdc`.

## Key References

- `packages/runtime/rules/cursor/` — canonical rule sources (`.mdc` extension)
- `packages/runtime/rules/claude-code/` — transformed copies (`.md` extension)
- `packages/core/src/adapters/claude-adapter.ts` — `ClaudeAdapter.transformRuleContent()` (L62-66): does `.cursor/` → `.claude/`, `.mdc` → `.md`
- `packages/core/src/adapters/ide-adapter.ts` — `IDEAdapter` interface, `CanonicalRule` type
- `packages/core/src/adapters/cursor-adapter.ts` — Cursor-side adapter
- Memory entries: `2026-02-13_multi-ide-path-fix.md`, `2026-02-12_rules-architecture-refactor-learnings.md`

## Gotchas

- **Never write "either/or" path patterns in rule content.** Writing `.cursor/tools/X or .claude/tools/X` in a rule produces `.claude/tools/X or .claude/tools/X` after `transformRuleContent()` runs — the `.cursor/` half is transformed, leaving a broken duplicate. This is exactly what happened in `2026-02-13_multi-ide-path-fix.md`: a tool routing change added `or .claude/` alternatives in `pm-workspace.mdc` and `routing-mandatory.mdc`, breaking 5 path patterns. The fix was reverting to single `.cursor/` paths in all rules.

- **Always use `.cursor/` paths in rule content — never `.claude/`.** `ClaudeAdapter.transformRuleContent()` transforms `.cursor/` → `.claude/` automatically. If you hardcode `.claude/` in a rule, Claude Code users get it twice (both the original `.claude/` and a no-op transform of any adjacent `.cursor/` path). Correct: `.cursor/tools/onboarding/TOOL.md`. Broken: `.cursor/tools/X or .claude/tools/X`. From `2026-02-13_multi-ide-path-fix.md`.

- **Both `cursor/` and `claude-code/` use `.mdc` extension with identical content.** The `claude-code/` files are NOT pre-transformed at commit time — they are exact copies of `cursor/`. Extension renaming (`.mdc` → `.md`) happens at install time via `adapter.ruleExtension` in `workspace.ts`. When adding a new rule: create it in `cursor/` with `.mdc`, then copy identically to `claude-code/` with `.mdc` extension.

- **BUILD rules (`.cursor/rules/*.mdc`) and PRODUCT rules (`packages/runtime/rules/`) are different audiences — do NOT confuse them.** BUILD rules enforce quality gates, testing, and pre-mortem workflows for Areté contributors. PRODUCT rules guide AI agents in end-user workspaces doing PM work. From `2026-02-12_rules-architecture-refactor-learnings.md`: "These serve different audiences and should not be confused." Before editing, confirm which audience your change targets.

- **The 5 old BUILD rules (`pm-workspace.mdc`, `routing-mandatory.mdc`, `qmd-search.mdc`, `context-management.mdc`, `project-management.mdc`) were deleted from `.cursor/rules/` in the 2026-02-12 refactor.** Those names now exist only in `packages/runtime/rules/` (PRODUCT side). If you see a reference to them in `.cursor/rules/`, it's stale — they were removed. From `2026-02-12_rules-architecture-refactor-learnings.md`.

- **Rule content changes must be manually mirrored to both `cursor/` and `claude-code/`.** There is no build step that auto-generates `claude-code/` from `cursor/`. Editing only `cursor/` leaves `claude-code/` out of sync. Always update both subdirectories.

## Invariants

- Rule files in `cursor/` must contain only `.cursor/` path references — never `.claude/`, never `or .claude/` alternatives.
- `claude-code/` files are identical copies of `cursor/` files (same `.mdc` extension, same content). Extension renaming happens at install time.
- The set of files in `cursor/` and `claude-code/` must match (same 7 files, different extensions).

## Testing Gaps

- No automated test that runs `transformRuleContent()` over all `cursor/` rule files and asserts no broken path patterns (e.g. double `.claude/` references). The 2026-02-13 incident was caught by code review, not a test.
- Pre-commit check exists in `dev.mdc` (`rg "\.cursor.*or.*\.claude"`) but it's a manual step, not automated.

## Patterns That Work

- **Pre-commit grep before any rule edit**: `rg "\.cursor.*or.*\.claude|\.claude.*or.*\.cursor" packages/runtime/rules/` catches "either/or" patterns before they reach commit. From `dev.mdc` Multi-IDE Consistency Check section (added after `2026-02-13_multi-ide-path-fix.md`).
- **Edit `cursor/` first, then apply transforms to `claude-code/`**: Treat `cursor/` as the single source of truth and derive `claude-code/` mechanically.

## Pre-Edit Checklist

- [ ] Run `rg "\.cursor.*or.*\.claude|\.claude.*or.*\.cursor" packages/runtime/rules/` — must return no matches before AND after your change
- [ ] Confirm you're editing PRODUCT rules (`packages/runtime/rules/`) not BUILD rules (`.cursor/rules/`)
- [ ] Update BOTH `cursor/` and `claude-code/` — never just one (content must be identical)
- [ ] Run `npm run typecheck` and `npm test` to confirm no TS or test regressions
- [ ] If rule changes affect `arete install` behavior: test by running `arete install` in a temp directory
