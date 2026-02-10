# Multi-IDE Support: Abstraction Layer + Adapter Pattern (v2)

## Context

Areté is currently Cursor-only. The workspace structure, rules format (`.mdc`), and directory layout (`.cursor/`) are all hardcoded. To support Claude Code (especially Claude Co-work) and future systems, we need an IDE adapter abstraction that lets the same canonical workspace produce IDE-specific output.

**Primary focus:** GUIDE mode (end-user PM workspace) in Claude Code / Co-work.
**Secondary (deferred to follow-up):** BUILDER mode in Claude Code for developer portability.

**First release scope:** Phases 1–5 + 7. Phase 6 (Builder mode) is explicitly deferred.

**PRD gateway note:** This plan has 7 phases across 9 new files and 9 modified files. Per `plan-pre-mortem.mdc`, this qualifies for the PRD path. If executing via Cursor Plan Mode or execute-prd, offer the PRD path per plan-pre-mortem.mdc. The pre-mortem is included in this document.

---

## What's Already Portable (no changes needed)
- Intelligence layer: context injection, memory retrieval, entity resolution, briefing
- Skill router + model router
- Skills (`.agents/skills/` — already IDE-agnostic)
- Business content: `context/`, `goals/`, `projects/`, `people/`, `resources/`, `.arete/memory/`
- Configuration: `arete.yaml`, `.credentials/`

## What Needs Adaptation
- Rules: `.cursor/rules/*.mdc` → `.claude/rules/*.md` (different frontmatter)
- IDE config directory: `.cursor/` → `.claude/`
- Tools/integrations paths inside `.cursor/` → inside `.claude/`
- `CLAUDE.md` generation (Claude Code needs this; Cursor doesn't)
- Rule *content* referencing `.cursor/` paths (pm-workspace.mdc mentions `.cursor/tools/`, `.cursor/integrations/`)
- Workspace detection (`isAreteWorkspace()`)
- Path resolution (`getWorkspacePaths()`)
- Install/update commands

---

## Phase 1: IDE Adapter Abstraction

**Goal:** Introduce the `IDEAdapter` interface and two implementations. Wire into path resolution. No behavior change for existing Cursor workspaces.

### 1.1 Create `src/core/ide-adapter.ts` (NEW)

```typescript
export type IDETarget = 'cursor' | 'claude';

export interface CanonicalRule {
  name: string;           // e.g., 'routing-mandatory'
  description: string;
  content: string;        // Markdown body (no frontmatter)
  globs?: string[];
  alwaysApply?: boolean;
}

export interface IDEAdapter {
  readonly target: IDETarget;
  readonly configDirName: string;   // '.cursor' | '.claude'
  readonly ruleExtension: string;   // '.mdc' | '.md'

  getIDEDirs(): string[];
  rulesDir(): string;               // relative to workspace root
  toolsDir(): string;
  integrationsDir(): string;

  formatRule(rule: CanonicalRule): string;
  transformRuleContent(content: string): string;
  generateRootFiles(config: AreteConfig, workspaceRoot: string): Record<string, string>;
  detectInWorkspace(workspaceRoot: string): boolean;
}
```

### 1.2 Create `src/core/adapters/cursor-adapter.ts` (NEW)

- `configDirName: '.cursor'`, `ruleExtension: '.mdc'`
- `getIDEDirs()` → `['.cursor', '.cursor/rules', '.cursor/tools', '.cursor/integrations', '.cursor/integrations/configs']`
- `formatRule()` → YAML frontmatter with `description`, `globs`, `alwaysApply` + `---` + content
- `transformRuleContent()` → no-op (paths already reference `.cursor/`)
- `generateRootFiles()` → `{}` (Cursor doesn't need extra root files)
- `detectInWorkspace()` → `existsSync(join(root, '.cursor'))`

### 1.3 Create `src/core/adapters/claude-adapter.ts` (NEW)

- `configDirName: '.claude'`, `ruleExtension: '.md'`
- `getIDEDirs()` → `['.claude', '.claude/rules', '.claude/tools', '.claude/integrations', '.claude/integrations/configs']`
- `formatRule()` → Claude Code rule format (see "Claude Code Rule Format" section below)
- `transformRuleContent()` → replaces `.cursor/tools/` → `.claude/tools/`, `.cursor/integrations/` → `.claude/integrations/`, `.cursor/rules/` → `.claude/rules/`
- `generateRootFiles()` → generates `CLAUDE.md` (see Phase 4)
- `detectInWorkspace()` → `existsSync(join(root, '.claude'))`

**Claude Code Rule Format** (target format for `formatRule()`):
```markdown
---
description: <description text>
globs:
  - <glob pattern>
---

<rule content in markdown>
```
Claude Code loads `.md` files from `.claude/rules/`. Files with `globs` frontmatter are conditionally loaded. Files without globs (or with a catch-all glob) are always loaded. The `alwaysApply` field is not used — omit globs entirely for always-loaded rules.

### 1.4 Create `src/core/adapters/index.ts` (NEW)

```typescript
export function getAdapter(target: IDETarget): IDEAdapter;
export function detectAdapter(workspaceRoot: string): IDEAdapter;
export function getAdapterFromConfig(config: AreteConfig): IDEAdapter;
```

Detection priority:
1. `arete.yaml` → `ide_target` field (if set)
2. Which IDE config dir exists (`.cursor/` or `.claude/`)
3. Default: `cursor` (backward compat)

### 1.5 Modify `src/types.ts`

Add `IDETarget` type. Add `ide_target?: IDETarget` to `AreteConfig`.

Rename `cursor` → `ideConfig` in `WorkspacePaths`. **Confirmed:** `paths.cursor` is not referenced anywhere in the codebase — only the property definition in `types.ts:62` and assignment in `workspace.ts:57`. This is a safe rename touching only those 2 files. No deprecation getter needed.

### 1.6 Modify `src/core/workspace.ts`

- `isAreteWorkspace()`: change line 27 to check for `.cursor` OR `.claude`:
  ```typescript
  const hasIDEDir = existsSync(join(dir, '.cursor')) || existsSync(join(dir, '.claude'));
  ```
- `getWorkspacePaths()`: accept optional `IDEAdapter` parameter. When omitted, call `detectAdapter(workspaceRoot)`. Delegate IDE-specific paths (ideConfig, rules, tools, integrations) to adapter. All other paths unchanged.

**Backward compat:** When adapter is omitted, existing call sites need zero changes — `detectAdapter()` will find `.cursor/` and return the cursor adapter by default.

### 1.7 Modify `src/core/workspace-structure.ts`

- Remove hardcoded `.cursor` entries (lines 40-46) from `WORKSPACE_DIRS`
- Rename to `BASE_WORKSPACE_DIRS` (IDE-agnostic dirs only)
- `ensureWorkspaceStructure()` accepts optional `IDEAdapter`, combines `BASE_WORKSPACE_DIRS` + `adapter.getIDEDirs()`

---

## Phase 2: Rule Transpilation System

**Goal:** Parse canonical `.mdc` rules, transpile to target IDE format on install/update.

**Key clarification:** The transpiler reads from `getSourcePaths().rules` (which resolves to `runtime/rules/` in dev or `dist/rules/` when packaged), not a hardcoded path. This matches how install.ts currently resolves source paths.

### 2.1 Create `src/core/rule-transpiler.ts` (NEW)

```typescript
export interface ParsedRule {
  name: string;
  frontmatter: { description?: string; globs?: string[]; alwaysApply?: boolean };
  content: string;  // Markdown body without frontmatter
}

/** Parse a .mdc file into frontmatter + content */
export function parseRule(filePath: string): ParsedRule;

/** Convert parsed rule to target IDE format */
export function transpileRule(rule: ParsedRule, adapter: IDEAdapter): { filename: string; content: string };

/** Transpile all rules from source dir to dest dir (filtered by allowList) */
export function transpileRules(
  srcDir: string,
  destDir: string,
  adapter: IDEAdapter,
  allowList: string[]
): SyncResults;
```

Uses the `yaml` package (already a dependency) for robust frontmatter parsing. Handles the 3 simple fields: `description`, `globs`, `alwaysApply`.

**Files to read before implementing:** `src/commands/install.ts` (rule copy block, lines 176-200), `src/core/workspace-structure.ts` (`PRODUCT_RULES_ALLOW_LIST`), one sample `runtime/rules/routing-mandatory.mdc` (frontmatter shape).

### 2.2 Modify `src/commands/install.ts`

Replace direct file copy of rules (lines 176-200) with:
```typescript
const transpileResults = transpileRules(
  sourcePaths.rules,
  workspacePaths.rules,
  adapter,
  PRODUCT_RULES_ALLOW_LIST
);
```

Also generate root files after install:
```typescript
const rootFiles = adapter.generateRootFiles(manifest, targetDir);
for (const [path, content] of Object.entries(rootFiles)) {
  writeFileSync(join(targetDir, path), content);
}
```

Add auto-generated header to transpiled rules: `<!-- AUTO-GENERATED by Areté — edit canonical source in runtime/rules/, not this file -->`

### 2.3 Modify `src/commands/update.ts`

Replace `syncDirectory` for rules (line 246) with `transpileRules()`. Regenerate root files (CLAUDE.md) on every update to prevent staleness.

---

## Phase 3: Config & CLI Integration

**Goal:** Wire `--ide` flag into install, persist in config, use in update/status.

### 3.1 Modify `arete.yaml` schema

Add `ide_target` field:
```yaml
schema: 1
version: '0.1.0'
source: npm
ide_target: cursor    # or 'claude'
agent_mode: guide
```

### 3.2 Modify `src/core/config.ts`

- Add `ide_target: undefined` to default config (auto-detect)

### 3.3 Modify `src/cli.ts`

Add `--ide <target>` option to install command:
```typescript
.option('--ide <target>', 'IDE target: cursor or claude')
```

### 3.4 Modify `src/commands/install.ts`

- Accept `ide?: IDETarget` in `InstallOptions`
- Resolve adapter from `--ide` flag (default: `cursor`)
- Pass adapter to `getWorkspacePaths()`, `ensureWorkspaceStructure()`, `transpileRules()`
- Write `ide_target` to `arete.yaml` manifest

### 3.5 Modify `src/commands/update.ts`

- Load adapter from config's `ide_target` via `getAdapterFromConfig(config)`
- Pass to transpileRules and ensureWorkspaceStructure

### 3.6 Modify `src/commands/status.ts`

- Show detected IDE target in status output
- Warn if both `.cursor/` and `.claude/` exist but `ide_target` is not set

### 3.7 Modify `src/commands/skill.ts`

- Fix message text at line 410: replace `.cursor/skills` with `.agents/skills`

---

## Phase 4: CLAUDE.md Generation

**Goal:** Generate `CLAUDE.md` for Claude Code workspaces with critical agent behavior instructions.

### 4.1 Implement in `src/core/adapters/claude-adapter.ts`

The `generateRootFiles()` method produces `CLAUDE.md` containing:

1. **Project overview** — what this Areté workspace is
2. **MANDATORY routing workflow** — the route → load skill → execute sequence from `routing-mandatory.mdc`, explicitly inlined so Claude Code agents follow it even if individual rule files aren't loaded:
   ```
   Before ANY PM action:
   1. ROUTE: arete skill route "<user message>"
   2. LOAD: Read the matched skill's SKILL.md from .agents/skills/
   3. EXECUTE: Follow the skill's complete workflow
   ```
3. **Workspace structure** — directory overview
4. **Agent mode** — BUILDER vs GUIDE detection (from `arete-context.mdc`)
5. **Memory management** — where to write decisions/learnings
6. **Key CLI commands** — `arete route`, `arete brief`, `arete context`, `arete memory search`
7. **Version/hash** — timestamp and version for staleness detection

### 4.2 Strategy: `CLAUDE.md` + `.claude/rules/*.md`

- `CLAUDE.md` — always-loaded master overview. Contains the mandatory routing workflow and workspace structure. This is the critical path for correct agent behavior.
- `.claude/rules/*.md` — topic-specific rules (memory management, context management, project management). Transpiled from `runtime/rules/*.mdc`.

This mirrors Cursor's `alwaysApply: true` vs glob-scoped rules.

---

## Phase 5: Skill Location Strategy

**Goal:** Verify skills work across both IDEs. Minimal code changes.

### 5.1 Keep `.agents/skills/` as canonical location (Option A)

Skills are already IDE-agnostic at `.agents/skills/`. Both Cursor and Claude Code can read files at any path. The routing-mandatory rule and `CLAUDE.md` explicitly tell the agent where to find skills.

**No symlinks to `.claude/skills/`** in this release. If native Claude Code skill discovery is needed later, it can be added as a non-breaking enhancement.

### 5.2 Verify skill paths in rule content

Confirm all rule content references `.agents/skills/` (not `.cursor/skills/`). Current grep shows this is already the case.

---

## Phase 6: Builder Mode in Claude Code (DEFERRED)

**Explicitly deferred to a follow-up release.** GUIDE mode ships first.

When implemented later:
- Add `dev:claude-setup` npm script or `arete dev setup-claude` command
- Generate `.claude/CLAUDE.md` with builder-mode instructions
- Transpile `dev.mdc`, `testing.mdc` to `.claude/rules/`

---

## Phase 7: Testing & Verification

**Follow existing test patterns.** Reference `test/core/workspace.test.ts` for workspace/path behavior patterns (temp dirs, strict assertions).

### 7.1 Unit tests (NEW files)

| File | Tests |
|------|-------|
| `test/core/adapters/cursor-adapter.test.ts` | formatRule output matches .mdc format, getIDEDirs, transformRuleContent is no-op |
| `test/core/adapters/claude-adapter.test.ts` | formatRule output matches Claude .md format, transformRuleContent replaces paths, generateRootFiles produces CLAUDE.md |
| `test/core/rule-transpiler.test.ts` | parseRule for each rule in PRODUCT_RULES_ALLOW_LIST, transpileRule for both adapters, edge case: multiline description |
| `test/core/adapters/index.test.ts` | detectAdapter with .cursor only, .claude only, both, neither; getAdapterFromConfig |

### 7.2 Integration tests

- `arete install /tmp/test-cursor --ide cursor` → produces identical output to current behavior
- `arete install /tmp/test-claude --ide claude` → produces `.claude/` with `CLAUDE.md` and `.claude/rules/*.md`
- `arete update` in both → regenerates rules correctly
- `arete status` in both → shows correct IDE target

### 7.3 Verification checklist

1. `npm run typecheck` — zero errors
2. `npm run test` — all tests pass (existing + new)
3. Cursor install produces identical output to current behavior (regression)
4. Claude install produces `.claude/CLAUDE.md` with mandatory routing workflow
5. `arete route "prep for my meeting"` returns same skill in both (IDE-agnostic)
6. Open Claude Code workspace → verify CLAUDE.md loaded, rules picked up, agent follows routing

---

## Files to Create

| File | Description |
|------|-------------|
| `src/core/ide-adapter.ts` | IDEAdapter interface, IDETarget type, CanonicalRule type |
| `src/core/adapters/cursor-adapter.ts` | Cursor implementation |
| `src/core/adapters/claude-adapter.ts` | Claude Code implementation + CLAUDE.md generation |
| `src/core/adapters/index.ts` | Registry, factory, detection logic |
| `src/core/rule-transpiler.ts` | Rule parsing + transpilation |
| `test/core/adapters/cursor-adapter.test.ts` | Cursor adapter tests |
| `test/core/adapters/claude-adapter.test.ts` | Claude adapter tests |
| `test/core/adapters/index.test.ts` | Detection/factory tests |
| `test/core/rule-transpiler.test.ts` | Transpiler tests |

## Files to Modify

| File | Changes |
|------|---------|
| `src/types.ts` | Add `IDETarget` type, `ide_target` to AreteConfig, rename `cursor` → `ideConfig` in WorkspacePaths |
| `src/core/workspace.ts` | `isAreteWorkspace()` checks `.cursor` OR `.claude`; `getWorkspacePaths()` delegates to adapter |
| `src/core/workspace-structure.ts` | Extract IDE dirs from WORKSPACE_DIRS → adapter; `ensureWorkspaceStructure()` accepts adapter |
| `src/core/config.ts` | Add `ide_target` to defaults |
| `src/commands/install.ts` | Add `--ide` flag, use adapter for dirs/rules/root files, write ide_target to manifest |
| `src/commands/update.ts` | Load adapter from config, use transpileRules, regenerate root files |
| `src/commands/status.ts` | Show IDE target, warn on mixed state |
| `src/commands/skill.ts` | Fix `.cursor/skills` message → `.agents/skills` (line 410) |
| `src/cli.ts` | Add `--ide` option to install command |

---

## Pre-Mortem (8 Risk Categories)

### 1. Context Gaps

**Risk: Implementer missing context for transpiler/CLAUDE.md**
- Problem: Whoever implements Phase 2 or Phase 4 may not understand how install/update currently copy rules or how Cursor interprets .mdc frontmatter.
- Mitigation: Before implementing Phase 2, read: `src/commands/install.ts` (rule copy block), `src/core/workspace-structure.ts` (PRODUCT_RULES_ALLOW_LIST), `runtime/rules/routing-mandatory.mdc` (frontmatter shape). Before Phase 4, read: `routing-mandatory.mdc` and `pm-workspace.mdc` (skill table + routing workflow).
- Verification: Implementation task descriptions include "Read these files first: …"

### 2. Test Patterns

**Risk: New tests inconsistent with existing patterns**
- Problem: New adapter/transpiler tests might not follow existing mocking/structure.
- Mitigation: Follow patterns in `test/core/workspace.test.ts` (temp dirs, strict assertions). Add one test with multiline description to catch edge cases.
- Verification: New tests use same describe/it structure, strict assertions, no external I/O.

### 3. Integration

**Risk: getWorkspacePaths(adapter) breaks callers**
- Problem: Changing signature could break the 15+ call sites.
- Mitigation: Keep backward compatible — when adapter is omitted, `detectAdapter(workspaceRoot)` is called internally. Existing call sites need zero changes.
- Verification: Full test suite passes after Phase 1. Integration tests cover both `--ide cursor` and `--ide claude`.

### 4. Scope Creep

**Risk: Builder mode and optional features expanding scope**
- Problem: Phase 6 (Builder mode) or skill symlinks (Phase 5 Option B) grow scope and delay GUIDE mode.
- Mitigation: Phase 6 explicitly deferred. Option B (symlinks) rejected for v1. First release = Phases 1–5 + 7 only.
- Verification: Acceptance criteria state "Phase 6 excluded from first release."

### 5. Code Quality

**Risk: IDE-specific paths leaking outside adapters**
- Problem: Hardcoded `.cursor` or `.mdc` strings creep into shared code.
- Mitigation: All IDE-specific strings live in adapter implementations and rule-transpiler only. Run `grep -r '\.cursor' src/` after each phase.
- Verification: Code review checklist: "No raw .cursor / .mdc in core or commands except via adapter/transpiler."

### 6. Dependencies

**Risk: Phase ordering violations**
- Problem: Starting Phase 3 before Phase 2 is complete forces rework.
- Mitigation: Strict order: 1 → 2 → 3 → 4. Phase 5 and 7 can run parallel with 4.
- Verification: No Phase 3 task starts before Phase 2 tests pass.

### 7. Platform / External

**Risk: Claude Code convention changes (rules format, CLAUDE.md loading)**
- Problem: Anthropic changes how `.claude/rules/` or `CLAUDE.md` works.
- Mitigation: All Claude-specific behavior isolated in `claude-adapter.ts` (single file). Add comment: "Conventions as of 2026-02; verify against Claude Code docs." The adapter pattern means only one file changes.
- Verification: `claude-adapter.ts` is the only place mentioning Claude-specific paths/formats.

**Risk: Agent behavioral differences between Cursor and Claude Code**
- Problem: Same rule content interpreted differently by different agents.
- Mitigation: Start with a subset of verified skills (daily-plan, meeting-prep, create-prd). CLAUDE.md includes Claude-specific behavioral guidance. Build a compatibility matrix (skill × IDE × status) as skills are validated.
- Verification: Compatibility matrix doc exists and is updated as testing proceeds.

### 8. State / Consistency

**Risk: Rule content drift between IDEs**
- Problem: Rule files in `.cursor/rules/` and `.claude/rules/` diverge via manual edits.
- Mitigation: Rules are ALWAYS transpiled from canonical source on install/update. Transpiled files include auto-generated header: `<!-- AUTO-GENERATED — edit canonical source, not this file -->`. `arete update` regenerates all rules.
- Verification: `arete update` overwrites all IDE-specific rules (no preserve for rules).

**Risk: Dual-IDE workspace with divergent state**
- Problem: Both `.cursor/` and `.claude/` exist with different ide_target expectations.
- Mitigation: Commands use `config.ide_target` when set (highest priority). `arete status` warns when both dirs exist without explicit `ide_target`.
- Verification: Tests cover: ide_target set, unset with only .cursor, unset with only .claude, both dirs exist.

**Risk: CLAUDE.md gets stale**
- Problem: Generated once on install, never refreshed.
- Mitigation: `arete update` ALWAYS regenerates CLAUDE.md. File includes version/timestamp for staleness detection.
- Verification: Update integration test verifies CLAUDE.md timestamp changes after update.

---

## Implementation Order

```
Phase 1 (Adapter abstraction) ─── Foundation
    │
Phase 2 (Rule transpilation) ─── Depends on Phase 1
    │
Phase 3 (Config & CLI)       ─── Depends on Phase 1 + 2
    │
Phase 4 (CLAUDE.md)          ─┬─ Depends on Phase 3
Phase 5 (Skill verification)  ┘  Parallel with Phase 4
    │
Phase 7 (Testing)            ─── Alongside each phase
    │
Phase 6 (Builder mode)       ─── DEFERRED to follow-up
```
