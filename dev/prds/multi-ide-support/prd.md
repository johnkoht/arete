# PRD: Multi-IDE Support

**Version**: 1.0  
**Status**: Draft  
**Date**: 2026-02-10  
**Branch**: `feature/multi-ide-support`  
**Depends on**: Existing workspace and rule infrastructure

---

## 1. Problem & Goals

### Problem

Areté is currently Cursor-only. The workspace structure, rules format (`.mdc`), and directory layout (`.cursor/`) are all hardcoded. To support Claude Code (especially Claude Co-work for GUIDE mode) and future IDEs, we need an IDE adapter abstraction that lets the same canonical workspace produce IDE-specific output.

Current hardcoded dependencies:
- `.cursor/` directory structure assumed in workspace detection
- `.mdc` rule format with Cursor-specific frontmatter
- Hardcoded paths in `getWorkspacePaths()`, `WORKSPACE_DIRS`, install/update commands
- No mechanism to generate IDE-specific root files (e.g., `CLAUDE.md` for Claude Code)

### Goals

1. **IDE adapter abstraction**: Define an `IDEAdapter` interface that encapsulates all IDE-specific behavior (directory names, rule formats, path transformations, root file generation)
2. **Rule transpilation**: Build a system to transpile canonical `.mdc` rules into target IDE formats on install/update
3. **Claude Code support**: Enable GUIDE mode (end-user PM workspace) to work in Claude Code with proper rule loading and agent behavior
4. **Backward compatibility**: Existing Cursor workspaces continue to work identically; no breaking changes
5. **Future extensibility**: Make it straightforward to add new IDE targets (Windsurf, Cline, etc.) by implementing the adapter interface

### Out of Scope (First Release)

- **Builder mode in Claude Code** (Phase 6) — explicitly deferred to follow-up release
- Native Claude Code skill discovery (symlinks to `.claude/skills/`) — can add later if needed
- Cross-IDE workspace migration commands — users create new workspaces with `--ide` flag
- Workspace-level IDE switching — one `ide_target` per workspace for v1

---

## 2. Architecture Decisions

### Adapter Pattern

All IDE-specific behavior lives behind the `IDEAdapter` interface:

```
IDEAdapter (interface)
├── CursorAdapter      — .cursor/, .mdc, no path transforms
├── ClaudeAdapter      — .claude/, .md, path transforms, CLAUDE.md generation
└── (future adapters)  — Windsurf, Cline, etc.
```

The adapter provides:
- Config directory name (`.cursor` vs `.claude`)
- Rule file extension (`.mdc` vs `.md`)
- Rule format transformation (frontmatter + content)
- Path transformations (`.cursor/` → `.claude/` in rule content)
- Root file generation (`CLAUDE.md` for Claude Code)
- Workspace detection

### Detection Priority

When determining which adapter to use:
1. `arete.yaml` → `ide_target` field (if set) — highest priority
2. Which IDE config dir exists (`.cursor/` or `.claude/`) — fallback
3. Default: `cursor` — backward compatibility

### Rule Transpilation

Rules are stored canonically in `runtime/rules/*.mdc` (source). On install/update:
1. Read canonical `.mdc` files from source
2. Parse YAML frontmatter (`description`, `globs`, `alwaysApply`)
3. Extract markdown body
4. Pass to adapter's `formatRule()` for target-specific formatting
5. Apply content transformations (path rewrites)
6. Write to target IDE's rules directory

Transpiled files include an auto-generated header warning users to edit the canonical source, not the generated file.

### Cursor vs Claude Rule Formats

**Cursor (`.mdc`):**
```markdown
---
description: Rule description
globs: ["**/*.ts"]
alwaysApply: true
---

Rule content here
```

**Claude Code (`.md`):**
```markdown
---
description: Rule description
globs:
  - "**/*.ts"
---

Rule content here
```

Differences:
- File extension: `.mdc` vs `.md`
- Frontmatter: Cursor uses `alwaysApply: true`; Claude omits globs entirely for always-loaded rules
- Rule content: Claude rules need `.cursor/` paths replaced with `.claude/`

### CLAUDE.md Generation

Claude Code loads `CLAUDE.md` as the primary agent context file. The `ClaudeAdapter` generates this file containing:

1. **Project overview** — what this Areté workspace is
2. **MANDATORY routing workflow** — explicitly inlined (not just referenced) so agents follow skill-based workflows even if individual rule files aren't loaded
3. **Workspace structure** — directory overview
4. **Agent mode** — BUILDER vs GUIDE detection
5. **Memory management** — where to write decisions/learnings
6. **Key CLI commands** — intelligence services, skill routing
7. **Version/timestamp** — for staleness detection

### Skills Location

Skills remain at `.agents/skills/` (already IDE-agnostic). Both Cursor and Claude Code can read files at any path. The routing-mandatory rule and `CLAUDE.md` explicitly tell agents where to find skills.

---

## 3. User Stories

### Installation

1. As a user, I can run `arete install --ide cursor` to create a Cursor-compatible workspace (default, backward compatible)
2. As a user, I can run `arete install --ide claude` to create a Claude Code-compatible workspace with `.claude/` structure and `CLAUDE.md`
3. As a developer, I can add a new IDE by implementing the `IDEAdapter` interface without modifying core workspace or command logic

### Workspace Detection

4. As a user with an existing Cursor workspace, `arete status` and `arete update` work without changes (auto-detects `.cursor/`)
5. As a user with a Claude Code workspace, `arete status` shows `ide: claude` and `arete update` regenerates `.claude/` rules correctly

### Rules Management

6. As a maintainer, when I update a rule in `runtime/rules/*.mdc`, running `arete update` in any workspace transpiles it to the correct target format
7. As a user, I see an auto-generated header in transpiled rules warning me not to edit them directly

### Agent Behavior

8. As a PM using Areté in Claude Code, agents load `CLAUDE.md` and follow the mandatory routing workflow (route → load skill → execute)
9. As a PM using Areté in Claude Code, agents know to look for skills in `.agents/skills/` and write memory to `.arete/memory/items/`

---

## 4. Requirements

### 4.1 IDE Adapter Interface (`src/core/ide-adapter.ts`)

**Create new file.**

**Types:**
- `IDETarget = 'cursor' | 'claude'`
- `CanonicalRule`: `{ name: string; description: string; content: string; globs?: string[]; alwaysApply?: boolean }`
- `IDEAdapter`: Interface with:
  - `readonly target: IDETarget`
  - `readonly configDirName: string` (`.cursor` or `.claude`)
  - `readonly ruleExtension: string` (`.mdc` or `.md`)
  - `getIDEDirs(): string[]` — list of IDE-specific dirs to create
  - `rulesDir(): string` — relative path to rules dir
  - `toolsDir(): string` — relative path to tools dir
  - `integrationsDir(): string` — relative path to integrations dir
  - `formatRule(rule: CanonicalRule): string` — convert to target format
  - `transformRuleContent(content: string): string` — path rewrites
  - `generateRootFiles(config: AreteConfig, workspaceRoot: string): Record<string, string>` — map of filename → content
  - `detectInWorkspace(workspaceRoot: string): boolean` — check if this IDE's config dir exists

**Acceptance Criteria:**
- TypeScript interface compiles with strict mode
- All methods documented with JSDoc comments
- `IDETarget` exported as a type
- `CanonicalRule` exported as a type

---

### 4.2 Cursor Adapter (`src/core/adapters/cursor-adapter.ts`)

**Create new file.**

**Implementation:**
- `target: 'cursor'`
- `configDirName: '.cursor'`
- `ruleExtension: '.mdc'`
- `getIDEDirs()` → `['.cursor', '.cursor/rules', '.cursor/tools', '.cursor/integrations', '.cursor/integrations/configs']`
- `rulesDir()` → `.cursor/rules`
- `toolsDir()` → `.cursor/tools`
- `integrationsDir()` → `.cursor/integrations`
- `formatRule(rule)` → YAML frontmatter with `description`, `globs`, `alwaysApply`, followed by `---\n\n` and content
- `transformRuleContent(content)` → no-op (return content unchanged)
- `generateRootFiles()` → `{}` (Cursor doesn't need extra root files)
- `detectInWorkspace(root)` → `existsSync(join(root, '.cursor'))`

**Acceptance Criteria:**
- Implements `IDEAdapter` interface completely
- `formatRule()` produces valid YAML frontmatter matching Cursor's `.mdc` format
- `detectInWorkspace()` returns true for workspaces with `.cursor/` dir
- All methods have unit tests

---

### 4.3 Claude Adapter (`src/core/adapters/claude-adapter.ts`)

**Create new file.**

**Implementation:**
- `target: 'claude'`
- `configDirName: '.claude'`
- `ruleExtension: '.md'`
- `getIDEDirs()` → `['.claude', '.claude/rules', '.claude/tools', '.claude/integrations', '.claude/integrations/configs']`
- `rulesDir()` → `.claude/rules`
- `toolsDir()` → `.claude/tools`
- `integrationsDir()` → `.claude/integrations`
- `formatRule(rule)` → Claude Code `.md` format:
  - YAML frontmatter with `description` and `globs` (if provided; omit `globs` key entirely for always-loaded rules)
  - No `alwaysApply` field (not used by Claude Code)
  - Example: `---\ndescription: ...\nglobs:\n  - "**/*"\n---\n\n{content}`
- `transformRuleContent(content)` → replaces:
  - `.cursor/tools/` → `.claude/tools/`
  - `.cursor/integrations/` → `.claude/integrations/`
  - `.cursor/rules/` → `.claude/rules/`
  - `.cursor/skills/` → `.agents/skills/` (if found, though this shouldn't exist)
- `generateRootFiles(config, root)` → produces `CLAUDE.md` with:
  1. Project overview (what Areté is)
  2. Mandatory routing workflow (inlined from `routing-mandatory.mdc`)
  3. Workspace structure (directory listing)
  4. Agent mode detection (BUILDER vs GUIDE)
  5. Memory management (where to write decisions/learnings)
  6. Key CLI commands (`arete route`, `arete brief`, `arete context`, `arete memory search`)
  7. Version and timestamp for staleness detection
- `detectInWorkspace(root)` → `existsSync(join(root, '.claude'))`

**Acceptance Criteria:**
- Implements `IDEAdapter` interface completely
- `formatRule()` produces valid YAML frontmatter matching Claude Code's `.md` format
- `formatRule()` omits `globs` key when `rule.alwaysApply` is true (Claude convention: no globs = always loaded)
- `transformRuleContent()` replaces all `.cursor/` paths with `.claude/` equivalents
- `generateRootFiles()` produces `CLAUDE.md` with all 7 sections
- `CLAUDE.md` includes the full routing workflow (route → load skill → execute) inlined, not just a reference
- `detectInWorkspace()` returns true for workspaces with `.claude/` dir
- All methods have unit tests

---

### 4.4 Adapter Factory (`src/core/adapters/index.ts`)

**Create new file.**

**Functions:**
- `getAdapter(target: IDETarget): IDEAdapter` — returns adapter instance for specified target
- `detectAdapter(workspaceRoot: string): IDEAdapter` — detects which adapter to use based on which IDE dir exists; defaults to `cursor` if neither exists
- `getAdapterFromConfig(config: AreteConfig): IDEAdapter` — uses `config.ide_target` if set; otherwise calls `detectAdapter()`

**Detection logic in `detectAdapter()`:**
1. Check if `.cursor/` exists → return `CursorAdapter`
2. Check if `.claude/` exists → return `ClaudeAdapter`
3. Default: return `CursorAdapter` (backward compat)

**Acceptance Criteria:**
- `getAdapter()` returns correct adapter instance for 'cursor' and 'claude'
- `detectAdapter()` returns `CursorAdapter` when only `.cursor/` exists
- `detectAdapter()` returns `ClaudeAdapter` when only `.claude/` exists
- `detectAdapter()` returns `CursorAdapter` when neither exists (default)
- `getAdapterFromConfig()` respects `config.ide_target` when set
- `getAdapterFromConfig()` falls back to detection when `ide_target` is undefined
- All functions have unit tests covering each branch

---

### 4.5 Types Update (`src/types.ts`)

**Modify existing file.**

**Changes:**
- Add `IDETarget` type import (re-export from `ide-adapter.ts`)
- Add `ide_target?: IDETarget` field to `AreteConfig` interface
- Rename `WorkspacePaths.cursor` to `WorkspacePaths.ideConfig`

**Acceptance Criteria:**
- `IDETarget` type available for import by other modules
- `AreteConfig.ide_target` is optional
- `WorkspacePaths.ideConfig` replaces `WorkspacePaths.cursor`
- No references to `paths.cursor` remain in the codebase (only `paths.ideConfig`)
- TypeScript compiler shows no errors
- All existing tests pass after rename

---

### 4.6 Workspace Detection Update (`src/core/workspace.ts`)

**Modify existing file.**

**Changes:**
- `isAreteWorkspace(dir)`: Line 27 changes from `existsSync(join(dir, '.cursor'))` to `existsSync(join(dir, '.cursor')) || existsSync(join(dir, '.claude'))`
- `getWorkspacePaths(workspaceRoot, adapter?)`: Accept optional `adapter` parameter; when omitted, call `detectAdapter(workspaceRoot)` internally
- Delegate `ideConfig`, `rules`, `tools`, `integrations` paths to adapter methods
- All other paths (context, memory, projects, etc.) remain unchanged

**Example signature:**
```typescript
export function getWorkspacePaths(
  workspaceRoot: string,
  adapter?: IDEAdapter
): WorkspacePaths {
  const adp = adapter || detectAdapter(workspaceRoot);
  return {
    root: workspaceRoot,
    ideConfig: join(workspaceRoot, adp.configDirName),
    rules: join(workspaceRoot, adp.rulesDir()),
    tools: join(workspaceRoot, adp.toolsDir()),
    integrations: join(workspaceRoot, adp.integrationsDir()),
    // ... rest unchanged
  };
}
```

**Acceptance Criteria:**
- `isAreteWorkspace()` returns true for workspaces with `.cursor/` OR `.claude/`
- `getWorkspacePaths()` without `adapter` arg works identically to current behavior (auto-detects)
- `getWorkspacePaths()` with explicit `adapter` arg uses that adapter's paths
- All existing call sites (15+ locations) continue to work without changes
- All existing workspace tests pass
- TypeScript compiler shows no errors

---

### 4.7 Workspace Structure Update (`src/core/workspace-structure.ts`)

**Modify existing file.**

**Changes:**
- Rename `WORKSPACE_DIRS` → `BASE_WORKSPACE_DIRS`
- Remove `.cursor`, `.cursor/rules`, `.cursor/tools`, `.cursor/integrations`, `.cursor/integrations/configs` from `BASE_WORKSPACE_DIRS` (lines 40-46)
- `ensureWorkspaceStructure(workspaceRoot, options?)` accepts optional `adapter?: IDEAdapter` in options
- When adapter is provided, combine `BASE_WORKSPACE_DIRS` + `adapter.getIDEDirs()` for the full list
- When adapter is omitted, use `detectAdapter(workspaceRoot)` internally (backward compat)

**Acceptance Criteria:**
- `BASE_WORKSPACE_DIRS` contains no IDE-specific paths
- `ensureWorkspaceStructure()` without adapter arg behaves identically to current (auto-detects)
- `ensureWorkspaceStructure()` with adapter arg creates adapter-specific dirs
- Cursor workspaces get `.cursor/` structure; Claude workspaces get `.claude/` structure
- All existing tests pass

---

### 4.8 Rule Transpiler (`src/core/rule-transpiler.ts`)

**Create new file.**

**Read before implementing:**
- `src/commands/install.ts` lines 176-199 (current rule copy block)
- `src/core/workspace-structure.ts` lines 57-66 (`PRODUCT_RULES_ALLOW_LIST`)
- `runtime/rules/routing-mandatory.mdc` (frontmatter shape example)

**Types:**
- `ParsedRule`: `{ name: string; frontmatter: { description?: string; globs?: string[]; alwaysApply?: boolean }; content: string }`

**Functions:**
- `parseRule(filePath: string): ParsedRule` — reads `.mdc` file, parses YAML frontmatter, extracts content body
- `transpileRule(rule: ParsedRule, adapter: IDEAdapter): { filename: string; content: string }` — converts parsed rule to target format using adapter's `formatRule()` and `transformRuleContent()`
- `transpileRules(srcDir: string, destDir: string, adapter: IDEAdapter, allowList: string[]): SyncResults` — batch transpile all rules from source to dest

**Implementation notes:**
- Use `yaml` package (already a dependency) for frontmatter parsing
- Handle multiline description fields correctly
- Add auto-generated header to each transpiled rule: `<!-- AUTO-GENERATED by Areté — edit canonical source in runtime/rules/, not this file -->`
- `transpileRules()` should mirror `syncDirectory()` pattern from `update.ts`: clear dest, write transpiled rules, return results

**Acceptance Criteria:**
- `parseRule()` correctly parses all 8 rules in `PRODUCT_RULES_ALLOW_LIST`
- `parseRule()` handles multiline description fields without corruption
- `parseRule()` handles rules with and without `globs` and `alwaysApply`
- `transpileRule()` produces correctly formatted output for both adapters
- `transpileRule()` includes auto-generated header
- `transpileRules()` only transpiles rules in allowList (skips dev.mdc, testing.mdc, etc.)
- All functions have unit tests
- Edge case test: rule with multiline description

---

### 4.9 Config Update (`src/core/config.ts`)

**Modify existing file.**

**Changes:**
- Add `ide_target: undefined` to `DEFAULT_CONFIG`

**Acceptance Criteria:**
- Default config includes `ide_target: undefined`
- Config loading and merging work correctly with new field
- TypeScript compiler shows no errors

---

### 4.10 CLI Flag (`src/cli.ts`)

**Modify existing file.**

**Changes:**
- Add `.option('--ide <target>', 'Target IDE: cursor or claude', 'cursor')` to install command (after `--source` option, around line 62)

**Acceptance Criteria:**
- `arete install --ide cursor` passes 'cursor' to install command
- `arete install --ide claude` passes 'claude' to install command
- `arete install` without `--ide` defaults to 'cursor'
- `arete install --ide invalid` shows an error (validation in install.ts)

---

### 4.11 Install Command Update (`src/commands/install.ts`)

**Modify existing file.**

**Read before implementing:**
- `src/commands/install.ts` lines 176-199 (current rule copy block to replace)
- `src/core/rule-transpiler.ts` (after implementing 4.8)

**Changes:**
- Add `ide?: string` to `InstallOptions` type
- Validate `ide` is 'cursor' or 'claude'; default to 'cursor' if omitted or invalid
- Get adapter: `const adapter = getAdapter(ide as IDETarget)`
- Pass adapter to `getWorkspacePaths(targetDir, adapter)` and `ensureWorkspaceStructure(targetDir, { adapter })`
- Replace rule copy block (lines 176-199) with:
  ```typescript
  const transpileResults = transpileRules(
    sourcePaths.rules,
    workspacePaths.rules,
    adapter,
    PRODUCT_RULES_ALLOW_LIST
  );
  ```
- After workspace setup completes, generate root files:
  ```typescript
  const rootFiles = adapter.generateRootFiles(manifest, targetDir);
  for (const [filename, content] of Object.entries(rootFiles)) {
    writeFileSync(join(targetDir, filename), content);
  }
  ```
- Write `ide_target: adapter.target` to manifest (`arete.yaml`)

**Acceptance Criteria:**
- `arete install --ide cursor` creates identical output to current install (regression test)
- `arete install --ide claude` creates `.claude/` structure with `.md` rules and `CLAUDE.md`
- Invalid `--ide` value shows error and exits
- Manifest includes `ide_target` field matching the adapter used
- Rules are transpiled (not copied) and include auto-generated header
- Root files generated by adapter are written to workspace root
- All existing install tests pass
- New integration test: install with `--ide claude` produces expected structure

---

### 4.12 Update Command Update (`src/commands/update.ts`)

**Modify existing file.**

**Changes:**
- Load adapter from config: `const adapter = getAdapterFromConfig(config)`
- Pass adapter to `getWorkspacePaths()` and `ensureWorkspaceStructure()`
- Replace rule sync (line 246) from `syncDirectory(sourcePaths.rules, paths.rules, ...)` to:
  ```typescript
  const rulesResult = transpileRules(
    sourcePaths.rules,
    paths.rules,
    adapter,
    PRODUCT_RULES_ALLOW_LIST
  );
  ```
- After syncing rules, regenerate root files:
  ```typescript
  const rootFiles = adapter.generateRootFiles(config, workspaceRoot);
  for (const [filename, content] of Object.entries(rootFiles)) {
    writeFileSync(join(workspaceRoot, filename), content);
  }
  ```

**Acceptance Criteria:**
- `arete update` in Cursor workspace works identically to current behavior
- `arete update` in Claude workspace regenerates `.claude/rules/*.md` correctly
- `arete update` always regenerates root files (e.g., `CLAUDE.md` gets refreshed with new timestamp)
- Rules are transpiled (not copied) on every update
- All existing update tests pass
- New integration test: update in Claude workspace refreshes rules and CLAUDE.md

---

### 4.13 Status Command Update (`src/commands/status.ts`)

**Modify existing file.**

**Changes:**
- Add IDE target to status output:
  - In JSON mode: `status.ide = config.ide_target || 'cursor'`
  - In human-readable mode: Add line after "Source" showing `IDE: cursor` or `IDE: claude`
- Add warning when both `.cursor/` and `.claude/` exist but `ide_target` is not set in config:
  - Message: `⚠️ Both .cursor/ and .claude/ directories exist. Set 'ide_target' in arete.yaml to avoid ambiguity.`

**Acceptance Criteria:**
- `arete status` shows IDE target in both JSON and human-readable modes
- Warning appears when both IDE dirs exist and `ide_target` is undefined
- No warning when only one IDE dir exists
- No warning when `ide_target` is explicitly set
- All existing status tests pass

---

### 4.14 Skill Command Fix (`src/commands/skill.ts`)

**Modify existing file.**

**Changes:**
- Line 410: Replace `.cursor/skills` message with `.agents/skills`
- This is a minor bug fix unrelated to multi-IDE but discovered during planning

**Acceptance Criteria:**
- Message text no longer references `.cursor/skills`
- Message correctly references `.agents/skills`

---

### 4.15 Unit Tests - Adapters (`test/core/adapters/`)

**Create new test files.**

**Read before implementing:**
- `test/core/workspace.test.ts` (for test patterns: temp dirs, strict assertions)

**Files to create:**
- `test/core/adapters/cursor-adapter.test.ts`
- `test/core/adapters/claude-adapter.test.ts`
- `test/core/adapters/index.test.ts`

**Test coverage:**
- **Cursor adapter:**
  - `formatRule()` produces valid YAML frontmatter matching `.mdc` format
  - `formatRule()` handles rules with and without `globs` and `alwaysApply`
  - `getIDEDirs()` returns correct list
  - `transformRuleContent()` returns content unchanged (no-op)
  - `detectInWorkspace()` returns true when `.cursor/` exists, false otherwise
- **Claude adapter:**
  - `formatRule()` produces valid YAML frontmatter matching `.md` format
  - `formatRule()` omits `globs` key when `rule.alwaysApply` is true
  - `transformRuleContent()` replaces all `.cursor/` paths with `.claude/`
  - `generateRootFiles()` produces `CLAUDE.md` with all required sections
  - `CLAUDE.md` includes full routing workflow inlined
  - `detectInWorkspace()` returns true when `.claude/` exists, false otherwise
- **Factory:**
  - `getAdapter('cursor')` returns `CursorAdapter`
  - `getAdapter('claude')` returns `ClaudeAdapter`
  - `detectAdapter()` with only `.cursor/` → `CursorAdapter`
  - `detectAdapter()` with only `.claude/` → `ClaudeAdapter`
  - `detectAdapter()` with neither → `CursorAdapter` (default)
  - `detectAdapter()` with both → (first match wins; document behavior)
  - `getAdapterFromConfig()` uses `config.ide_target` when set
  - `getAdapterFromConfig()` falls back to detection when `ide_target` undefined

**Acceptance Criteria:**
- All tests follow patterns from `test/core/workspace.test.ts` (temp dirs, strict assertions)
- All tests pass
- Code coverage for adapter modules is >90%

---

### 4.16 Unit Tests - Transpiler (`test/core/rule-transpiler.test.ts`)

**Create new test file.**

**Test coverage:**
- `parseRule()` for each rule in `PRODUCT_RULES_ALLOW_LIST` (8 rules)
- `parseRule()` handles multiline description correctly
- `parseRule()` handles rules with and without `globs`
- `parseRule()` handles rules with and without `alwaysApply`
- `transpileRule()` with CursorAdapter produces valid `.mdc` format
- `transpileRule()` with ClaudeAdapter produces valid `.md` format
- `transpileRule()` includes auto-generated header
- `transpileRules()` only processes rules in allowList
- `transpileRules()` returns correct `SyncResults`

**Acceptance Criteria:**
- All tests pass
- Edge case covered: multiline description field
- Code coverage for transpiler module is >90%

---

### 4.17 Integration Test - Install (`test/commands/install.test.ts`)

**Modify existing test file (or create if doesn't exist).**

**New tests:**
- `arete install /tmp/test-cursor --ide cursor` produces identical output to current behavior (regression)
- `arete install /tmp/test-claude --ide claude` produces:
  - `.claude/` directory structure
  - `.claude/rules/*.md` files (transpiled)
  - `CLAUDE.md` at workspace root
  - `arete.yaml` with `ide_target: claude`
- Verify transpiled rules include auto-generated header
- Verify `CLAUDE.md` contains all required sections

**Acceptance Criteria:**
- Both integration tests pass
- Cursor install produces identical output to baseline
- Claude install produces expected `.claude/` structure
- Cleanup (remove temp dirs) after tests

---

### 4.18 Integration Test - Update (`test/commands/update.test.ts`)

**Modify existing test file (or create if doesn't exist).**

**New tests:**
- `arete update` in Cursor workspace:
  - Regenerates `.cursor/rules/*.mdc` correctly
  - No `CLAUDE.md` generated
  - Works identically to current behavior
- `arete update` in Claude workspace:
  - Regenerates `.claude/rules/*.md` correctly
  - Regenerates `CLAUDE.md` with updated timestamp
  - `CLAUDE.md` timestamp changes after update

**Acceptance Criteria:**
- Both integration tests pass
- Update preserves workspace structure
- Rules are re-transpiled (not just synced)
- Root files regenerated on every update

---

### 4.19 Integration Test - Skill Routing (`test/integration/skill-routing.test.ts`)

**Create new test file (optional but recommended).**

**Test:**
- Install both Cursor and Claude workspaces
- Run `arete route "prep for my meeting"` in both
- Verify both return same skill (`meeting-prep`)
- Verify routing is IDE-agnostic

**Acceptance Criteria:**
- Test passes in both workspace types
- Skill router returns identical results regardless of IDE

---

### 4.20 Verification Checklist

**After all tasks complete, verify:**

- [ ] `npm run typecheck` — zero errors
- [ ] `npm run test` — all tests pass (existing + new)
- [ ] Cursor install produces identical output to current behavior (no regression)
- [ ] Claude install produces `.claude/CLAUDE.md` with mandatory routing workflow
- [ ] `arete route "prep for my meeting"` returns same skill in both Cursor and Claude workspaces
- [ ] Open Claude Code workspace → verify `CLAUDE.md` loaded, rules picked up, agent follows routing
- [ ] Run `grep -r '\.cursor' src/` → no raw `.cursor` strings in shared code (only in adapters)

---

## 5. Dependencies

### Task Execution Order

```
Phase 1: Foundation
├── 4.1 IDE Adapter Interface
├── 4.2 Cursor Adapter
├── 4.3 Claude Adapter
├── 4.4 Adapter Factory
├── 4.5 Types Update
├── 4.6 Workspace Detection Update
└── 4.7 Workspace Structure Update

Phase 2: Transpilation
├── 4.8 Rule Transpiler (depends on Phase 1)
└── 4.16 Transpiler Tests (depends on 4.8)

Phase 3: CLI & Commands
├── 4.9 Config Update (depends on Phase 1)
├── 4.10 CLI Flag (depends on Phase 1)
├── 4.11 Install Update (depends on Phases 1, 2)
├── 4.12 Update Update (depends on Phases 1, 2)
├── 4.13 Status Update (depends on Phase 1)
└── 4.14 Skill Fix (independent)

Phase 4: Testing
├── 4.15 Adapter Tests (depends on Phase 1)
├── 4.17 Install Integration Test (depends on 4.11)
├── 4.18 Update Integration Test (depends on 4.12)
├── 4.19 Skill Routing Test (optional)
└── 4.20 Final Verification (depends on all)
```

**Sequential execution recommended**: Phase 1 → Phase 2 → Phase 3 → Phase 4

Within each phase, tasks can run in parallel except where noted.

---

## 6. Pre-Mortem (from backlog)

The backlog document includes a comprehensive 8-category pre-mortem. Key mitigations to apply during execution:

### 1. Context Gaps
- **Problem**: Implementer missing context for transpiler/CLAUDE.md
- **Mitigation**: Every task prompt must include "Read these files first: ..." with specific file paths and line ranges
- **Files to reference**:
  - For Phase 2 (transpiler): `src/commands/install.ts` lines 176-199, `src/core/workspace-structure.ts` lines 57-66, `runtime/rules/routing-mandatory.mdc`
  - For Phase 3 (CLI): `src/cli.ts` lines 60-65, `src/commands/install.ts` install flow
  - For Phase 4 (tests): `test/core/workspace.test.ts` for patterns

### 2. Test Patterns
- **Problem**: New tests inconsistent with existing patterns
- **Mitigation**: Follow patterns in `test/core/workspace.test.ts` (temp dirs, strict assertions)
- **Verification**: New tests use same describe/it structure, no external I/O

### 3. Integration
- **Problem**: `getWorkspacePaths(adapter?)` breaks callers
- **Mitigation**: Keep backward compatible — when adapter omitted, `detectAdapter()` called internally
- **Verification**: Full test suite passes after Phase 1; integration tests cover both `--ide cursor` and `--ide claude`

### 5. Code Quality
- **Problem**: IDE-specific paths leaking outside adapters
- **Mitigation**: All IDE-specific strings live in adapter implementations and rule-transpiler only
- **Verification**: Run `grep -r '\.cursor' src/` after each phase; code review checklist includes "No raw .cursor / .mdc in core or commands except via adapter/transpiler"

### 6. Dependencies
- **Problem**: Phase ordering violations
- **Mitigation**: Strict order: 1 → 2 → 3 → 4
- **Verification**: No Phase 3 task starts before Phase 2 tests pass

### 7. Platform / External
- **Problem**: Claude Code convention changes
- **Mitigation**: All Claude-specific behavior isolated in `claude-adapter.ts`; add comment "Conventions as of 2026-02; verify against Claude Code docs"
- **Verification**: `claude-adapter.ts` is the only place mentioning Claude-specific paths/formats

### 8. State / Consistency
- **Problem**: Rule content drift between IDEs
- **Mitigation**: Rules are ALWAYS transpiled from canonical source on install/update; transpiled files include auto-generated header
- **Verification**: `arete update` overwrites all IDE-specific rules (no preserve for rules)

---

## 7. Success Metrics

- **Zero regressions**: Existing Cursor workspaces work identically before and after
- **Claude Code functional**: PM can use daily-plan, meeting-prep, create-prd skills in Claude Code
- **Clean abstraction**: Adding a new IDE requires only implementing `IDEAdapter` interface (no core changes)
- **Test coverage**: >90% coverage for new modules (adapters, transpiler)
- **Type safety**: Zero TypeScript errors in strict mode

---

## 8. Out of Scope (Deferred to Follow-Up)

- **Phase 6: Builder mode in Claude Code** — Requires dev.mdc and testing.mdc transpilation, CLAUDE.md with builder instructions
- **Native Claude skill discovery** — Symlinks from `.claude/skills/` to `.agents/skills/`
- **Cross-IDE migration** — Commands to convert workspace from one IDE to another
- **Multi-IDE workspaces** — Supporting both `.cursor/` and `.claude/` in one workspace with switching
- **IDE-specific skill customization** — Different skills per IDE

---

## 9. Notes for Autonomous Execution

**Show, Don't Tell**: Every task prompt should reference specific example files with line ranges. Example:
- "Follow the provider pattern from `src/core/search.ts` lines 45-62"
- "Match the test structure in `test/core/workspace.test.ts` lines 38-72"

**Explicit Autonomy**: Subagents should not ask for permission to write files, commit, or proceed. The orchestrator grants autonomy upfront.

**Full Verification After Each Task**:
1. Code review (6-point checklist)
2. `npm run typecheck` must pass
3. `npm test` (full suite, not just new tests) must pass
4. Check for leaked hardcoded paths (`grep -r '\.cursor' src/`)

**Sequential with Inheritance**: Each task builds on clean, tested work from prior tasks. The TypeScript compiler guides propagation (e.g., when `WorkspacePaths.cursor` is renamed, TypeScript shows all places that need updating).
