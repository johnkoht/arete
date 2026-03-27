# Progress Log — ai-config

Started: 2026-03-08T15:20:00.000Z
Completed: 2026-03-08T17:00:00.000Z

## PRD Goal
Establish unified AI configuration for Areté: create AIService wrapper around pi-ai, migrate backend from pi-coding-agent to direct pi-ai calls, add CLI credential management, onboarding integration, and config commands.

## Tasks
1. AI-1: Core AIService Foundation ✅
2. AI-2: Backend Migration to pi-ai ✅
3. AI-3: CLI Credential Management ✅
4. AI-4: Onboarding Integration ✅
5. AI-5: Config CLI Commands ✅

---

## Post-Completion Fixes

Issues found during manual testing after PRD completion.

**Commits**: 0e5d045, 382f7ab, 0ac2705, 15b3ced, 0d79c69

### Fixes Applied
1. **Wrong validation model**: `claude-haiku` → `claude-3-5-haiku-latest` (model didn't exist)
2. **Show masked key after entry**: User couldn't see what they pasted
3. **Default fast tier**: Changed from `gemini-2.0-flash` to `claude-3-5-haiku-latest` (onboarding only configures Anthropic)
4. **Test isolation**: Added `getApiKey` mock so tests don't find real credentials
5. **Duplicate type**: Removed duplicate `MeetingExtraction` interface in backend

### Documentation Added
- `packages/apps/backend/LEARNINGS.md`: `npm run typecheck` doesn't check backend
- `dev/work/backlog/enhancements/multi-provider-onboarding.md`: Future enhancement for configuring multiple providers during onboarding

---

## Task AI-5: Config CLI Commands

**Status**: ✅ Complete (1st attempt)
**Commit**: f645b3b

### Summary
Added CLI commands to view and modify AI configuration:
- `arete config show ai` — displays tiers, tasks, and configured providers
- `arete config set ai.tiers.<tier> <model>` — sets model for a tier
- `arete config set ai.tasks.<task> <tier>` — sets tier for a task

### Implementation Details
- Validates tier names (fast, standard, frontier)
- Validates task names (6 AI tasks)
- Warns for unknown models via pi-ai validation (but allows)
- Updates arete.yaml directly with YAML parse/stringify
- Added missing AITask, AITier, AIConfig exports to @arete/core

### Files Created/Modified
- `packages/cli/src/commands/config.ts` (NEW)
- `packages/cli/src/index.ts` (register command + help text)
- `packages/cli/test/commands/config.test.ts` (14 tests)
- `packages/core/src/models/index.ts` (type exports)

### Quality
- Tests: 1530 passing
- Typecheck: ✅

---

## Task AI-4: Onboarding Integration

**Status**: ✅ Complete (1 iterate cycle for DRY refactor)
**Commits**: fdc5441, e85d4d8

### Summary
Added AI configuration step to `arete onboard`:
- Prompts for Anthropic API key after profile setup (skippable)
- Validates key with test call before saving
- Writes default tier config to arete.yaml
- `--skip-ai` flag for non-interactive mode
- Re-running allows updating existing key

### Files Modified
- `packages/cli/src/commands/credentials.ts` (export testProviderConnection)
- `packages/cli/src/commands/onboard.ts` (AI configuration phase)
- `packages/cli/test/commands/onboard.test.ts` (3 new tests)

### Quality
- Tests: 1514 passing
- Typecheck: ✅

---

## Task AI-3: CLI Credential Management

**Status**: ✅ Complete (1 iterate cycle for documentation)
**Commits**: 58638b3, 43365a0

### Summary
Added CLI commands to manage AI provider credentials:
- `arete credentials set <provider>` — prompts for key (masked), validates, saves securely
- `arete credentials show` — lists configured providers with masked keys
- `arete credentials test` — verifies each provider with test call

### Files Created/Modified
- `packages/cli/src/commands/credentials.ts` (NEW)
- `packages/cli/src/index.ts` (register command)
- `packages/cli/test/commands/credentials.test.ts` (17 tests)
- `.agents/sources/shared/cli-commands.md` (documentation)
- `AGENTS.md` (documentation)

### Quality
- Tests: 1511 passing
- Typecheck: ✅

---

## Task AI-2: Backend Migration to pi-ai

**Status**: ✅ Complete (1st attempt)
**Commit**: bc4cec74bac6a0e7ba3356cf6540c47e92fda6e1

### Summary
Replaced pi-coding-agent with direct AIService calls for meeting processing:
- Backend handles file operations directly via fs + gray-matter
- AIService.callStructured() with TypeBox schema for extraction
- Module-level AIService initialization at server startup
- Testable architecture via dependency injection

### Files Modified
- `packages/apps/backend/src/services/agent.ts` (REWRITTEN)
- `packages/apps/backend/src/index.ts` (startup config loading)
- `packages/apps/backend/test/services/agent.test.ts` (14 tests)
- `packages/apps/backend/package.json` (removed pi-coding-agent)
- `packages/apps/backend/LEARNINGS.md` (AIService pattern documented)

### Quality
- Tests: 1494 passing
- Typecheck: ✅

---

## Task AI-1: Core AIService Foundation

**Status**: ✅ Complete (1st attempt)
**Commit**: 049fd26fdb5e8ac9f22353656baafc0927b9274b

### Summary
Created AIService in @arete/core wrapping pi-ai with:
- Task-based model routing (task → tier → model)
- Structured output via callStructured() with TypeBox + ajv
- Credential management from ~/.arete/credentials.yaml (600 permissions)
- Env var override (env > file)
- Descriptive errors for missing configuration

### Files Created/Modified
- `packages/core/src/services/ai.ts` (NEW)
- `packages/core/src/credentials.ts` (NEW)
- `packages/core/src/models/workspace.ts` (types)
- `packages/core/src/config.ts` (defaults)
- `packages/core/src/factory.ts` (wiring)
- `packages/core/test/services/ai.test.ts` (22 tests)
- `packages/core/test/credentials.test.ts` (17 tests)
- `dev/catalog/capabilities.json` (ai-service entry)

### Quality
- Tests: 1496 passing
- Typecheck: ✅

---
