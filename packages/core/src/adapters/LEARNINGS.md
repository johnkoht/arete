## How This Works

The adapters layer provides IDE-specific implementations for workspace generation. `CursorAdapter` and `ClaudeAdapter` implement the `IDEAdapter` interface from `ide-adapter.ts`. Key methods include `generateRootFiles()` (creates AGENTS.md/CLAUDE.md), `formatRule()` (IDE-specific rule formatting), and `transformRuleContent()` (path transformations for Claude). Shared helpers for reading `dist/AGENTS.md` are in `read-agents-md.ts`.

## Key References

- `packages/core/src/adapters/ide-adapter.ts` — `IDEAdapter` interface definition
- `packages/core/src/adapters/read-agents-md.ts` — Shared helpers: `readPrebuiltAgentsMd()`, `generateMinimalAgentsMd()`
- `packages/core/src/adapters/cursor-adapter.ts` — Cursor IDE implementation
- `packages/core/src/adapters/claude-adapter.ts` — Claude Code implementation
- `packages/core/src/adapters/index.ts` — Factory functions: `getAdapter()`, `detectAdapter()`, `getAdapterFromConfig()`
- `packages/core/src/services/workspace.ts` — `create()` and `update()` call `generateRootFiles()`
- `scripts/build-agents.ts` — Generates `dist/AGENTS.md` (comprehensive GUIDE version)

## Gotchas

- **`generateRootFiles()` reads `dist/AGENTS.md` at runtime.** The adapters use `getPackageRoot()` to find the package root and read `dist/AGENTS.md`. If this file is missing (e.g., in a broken package or during development before running `npm run build:agents:prod`), the adapters fall back to a minimal version with basic routing and CLI commands. Always ensure `dist/AGENTS.md` is built before publishing or testing the full install flow.

- **Claude adapter transforms `.cursor/` paths to `.claude/` paths.** When `dist/AGENTS.md` is read by `ClaudeAdapter.generateRootFiles()`, the content is passed through `transformPathsForClaude()` which replaces `.cursor/` → `.claude/`, `.cursor/skills/` → `.agents/skills/`, and `.mdc` → `.md`. This ensures Claude workspaces reference the correct paths. The BUILD vs USER context lines in the workspace section are NOT transformed (they describe the repo structure, not user paths).

- **`update()` always regenerates AGENTS.md/CLAUDE.md.** This is intentional — when the user runs `arete update`, they get the latest comprehensive AGENTS.md from the installed npm package. The version footer is re-generated with the current timestamp, so the file always shows when it was last refreshed.

- **Adapters may use `fs` directly (infrastructure exception).** Unlike services which must use `StorageAdapter`, adapters are infrastructure-level code that runs during install/update. They use `existsSync` and `readFileSync` directly for reading `dist/AGENTS.md` and detecting workspace type. This is documented in the file headers.

- **Capability probe pattern for adapter feature opt-in** (2026-04-23, topic-wiki-memory): When a new feature (like memory injection into CLAUDE.md) is supported by one adapter but not another, add an optional capability method to the interface: `supportsMemoryInjection?(): boolean`. `ClaudeAdapter` returns `true` and accepts the new param; `CursorAdapter` returns `false` and explicitly ignores the param (with a doc comment pointing to the follow-up plan that will implement the cursor path). Callers (`WorkspaceService.regenerateRootFiles`) check the capability before even loading the data to pass — adapters that opt out never see the arg. This lets Phase B ship without breaking Cursor users AND without hiding a "silent accept-and-drop" footgun. The interface method is optional (`?:`) so adapters that predate the capability stay valid without changes.

- **Double-fallback: don't write stubs over good files** (2026-04-23, topic-wiki-memory): The ClaudeAdapter originally caught generator exceptions internally and returned `generateMinimalAgentsMd()`. The service then wrote that stub over the user's existing CLAUDE.md — a generator bug would replace good content with a skeleton. The fix is: adapters propagate generator errors (no internal catch), and `WorkspaceService.regenerateRootFiles` owns the fallback policy. On double-throw, check if the file exists: if yes, don't write (preserve existing); if no, write the minimal stub (fresh-install safety). The adapter exposes a `generateMinimalRootFiles?()` method for the stub content. Split responsibilities: adapters GENERATE, services WRITE.

## Invariants

- `CursorAdapter.generateRootFiles()` returns `{ 'AGENTS.md': content }` — always this exact key.
- `ClaudeAdapter.generateRootFiles()` returns `{ 'CLAUDE.md': content }` — always this exact key (NOT AGENTS.md).
- Both adapters append a version footer with `config.version` and current ISO timestamp.
- Path transformation in `ClaudeAdapter` preserves `.agents/skills/` (not `.claude/skills/`) for skill paths.
- The fallback minimal AGENTS.md/CLAUDE.md includes basic routing instructions and a subset of CLI commands so agents can still function if `dist/AGENTS.md` is missing.
- `generateCommands?()` is optional on `IDEAdapter`. Only `ClaudeAdapter` implements it. Callers must use `typeof adapter.generateCommands === 'function'` — never `instanceof ClaudeAdapter`. This keeps `workspace.ts` decoupled from concrete adapter types.
- `workspace.ts` does NOT import any concrete adapter class. All adapter-specific dispatch uses interface methods or `adapter.target`.

## Pre-Edit Checklist

- [ ] If changing `generateRootFiles()`: ensure both adapters are updated consistently
- [ ] If changing the shared helpers (`read-agents-md.ts`): both adapters use them, verify no regressions
- [ ] If changing path transformations: update both `transformRuleContent()` and `transformPathsForClaude()`
- [ ] If adding new sections to `dist/AGENTS.md`: verify Claude adapter transformation doesn't break them
- [ ] Run `npm run build:agents:prod` before testing install/update flows
- [ ] Run tests: `npm test` (includes adapter tests in `packages/core/test/adapters/`)
