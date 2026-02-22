## How This Works

`packages/runtime/tools/` contains **lifecycle-based tools** that get copied into end-user workspaces during `arete install` and `arete update`. Tools are distinct from Skills: skills are stateless procedures invocable anytime; tools have phases, track progress, and eventually complete. Each tool lives in its own subdirectory with a `TOOL.md` definition file and optional `templates/` and `resources/` subdirectories. At install time, `WorkspaceService.create()` copies all tool directories from this folder into the IDE-specific tools directory in the user's workspace (`.cursor/tools/` for Cursor, `.claude/tools/` for Claude Code). At update time, `WorkspaceService.update()` backfills missing files within each tool directory without overwriting existing ones.

## Key References

- `packages/runtime/tools/onboarding/` — 30/60/90 day new-job onboarding tool
- `packages/runtime/tools/seed-context/` — one-time context seeding tool
- `packages/runtime/tools/_template/` — scaffold for creating new tools
- `packages/runtime/tools/README.md` — tool framework overview, lifecycle, design principles
- `packages/core/src/services/workspace.ts` — `WorkspaceService.create()` (tool copy) and `update()` (tool file-level backfill)
- `packages/core/src/adapters/cursor-adapter.ts` / `claude-adapter.ts` — `toolsDir()` returns `.cursor/tools` or `.claude/tools`
- `packages/core/src/compat/workspace.ts` — `getSourcePaths()`: resolves to `packages/runtime/` (dev/symlink) or `dist/` (npm install)
- Memory entry: `2026-02-21_tools-copy-regression-fix.md`

## Gotchas

- **`dist/tools/` does NOT need manual mirroring.** `dist/` is gitignored and is not a committed directory. The npm package ships `packages/runtime/` directly via the `files` field in `package.json` (`"files": ["packages/cli/bin/", "packages/core/dist/", "packages/runtime/", ...]`). When `useRuntime = false` (npm install context), `getSourcePaths()` resolves to `dist/` — but this `dist/` is created by the build pipeline during `npm publish` (via `prepublishOnly` → `npm run build`), not manually maintained. For development, `useRuntime = true` (set when `!packageRoot.includes('node_modules')`) resolves directly to `packages/runtime/`. **No manual mirroring step is needed for content changes to `packages/runtime/tools/`.** (Previous entry incorrectly stated dist/tools/ was a committed directory requiring manual sync — corrected 2026-02-22.)

- **TOOL.md content is never IDE-transformed — always use path-agnostic references.** `ClaudeAdapter.transformRuleContent()` (`.cursor/` → `.claude/`) only applies to rule files (`.mdc`). TOOL.md files are copied verbatim. Never write hardcoded `.cursor/tools/...` or `.claude/tools/...` paths inside a TOOL.md — they will be wrong for users on the other IDE. Use relative, path-agnostic references instead (e.g., "see `resources/reading-list.md` in this tool's directory"). Contrast with rules in `packages/runtime/rules/` which correctly use `.cursor/` paths and get transformed at install time.

- **Tools were dropped from `WorkspaceService.create()` during the CLI refactor (regression, 2026-02-15).** The old `src/commands/install.ts` had an explicit `copyDirectoryContents(sourcePaths.tools, workspacePaths.tools)` call. When the CLI was rebuilt as a thin wrapper over `WorkspaceService`, skills and rules were ported but tools were omitted. Fixed 2026-02-21: `create()` now copies all tool directories and `update()` now does file-level backfill. Lesson: when porting "copy assets" logic, enumerate all asset types (skills, tools, rules, templates, guide) and confirm each has a corresponding implementation block.

- **Update backfill is file-level, not directory-level.** `WorkspaceService.update()` walks individual files within each source tool directory and adds any that are missing at the destination. It does NOT overwrite existing files. This means: (1) net-new tool directories are added, (2) missing files within an existing tool dir (e.g. a new `templates/` subdir) are added, (3) user-modified files are never overwritten. The previous directory-level check (`if (!destExists) copy whole dir`) was replaced with file-level backfill mirroring the template backfill pattern (`storage.list({ recursive: true })` + `srcFile.slice(srcDir.length + 1)`).

## Invariants

- Every tool directory must contain a `TOOL.md` with frontmatter (`name`, `description`, `lifecycle`, `duration`, `triggers`).
- Content changes to `packages/runtime/tools/` do not require manual dist/ mirroring — `packages/runtime/` is shipped directly via npm `files` field. (LEARNINGS.md is a developer artifact and is not shipped.)
- TOOL.md files must not contain hardcoded `.cursor/` or `.claude/` path prefixes in their content.
- `_template/` is a scaffold for new tools — it is intentionally copied to user workspaces as a reference.

## Testing Gaps

- No test that runs `diff -r packages/runtime/tools/ dist/tools/` and asserts they are identical. This sync is currently verified only manually. A CI check would prevent the dist/ drift failure mode.
- No test that exercises the tool routing (`arete route "I'm starting a new job"`) end-to-end in an installed workspace.

## Patterns That Work

- **No dist/ sync check needed** — `packages/runtime/` ships directly. The old `diff -r` pattern is obsolete since `dist/` is gitignored and created only during `npm publish`.
- **Relative paths in TOOL.md**: reference sibling files as `templates/filename.md` or `resources/filename.md` without any IDE prefix. Agents know where they loaded the TOOL.md from and can resolve relative references.
- **File-level backfill pattern** (for future tool-adjacent service work): `storage.list(srcDir, { recursive: true })` → `srcFile.slice(srcDir.length + 1)` for relative path → check `destExists` → `mkdir(join(dest, '..'))` + `write`. See `workspace.ts` `update()` tools block.

## Pre-Edit Checklist

- [ ] No manual dist/ mirroring needed — `packages/runtime/` ships directly via npm `files` field
- [ ] Do not add hardcoded `.cursor/` or `.claude/` path prefixes to TOOL.md content
- [ ] If adding a new tool directory: ensure it has a valid `TOOL.md` with `triggers` frontmatter field (required for routing)
- [ ] Run `npm run typecheck && npm test` if any `workspace.ts` changes were made alongside content changes
