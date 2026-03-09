# PRD: Areté AI Configuration

**Version**: 1.0  
**Status**: Draft  
**Date**: 2026-03-08  
**Depends on**: None (foundational)
**Blocks**: Intelligence Tuning (INT-1 through INT-5)

---

## 1. Problem & Goals

### Problem

Areté currently has no consistent AI configuration:

- **CLI has no AI capability** — cannot call LLMs directly, limiting what skills and tools can do
- **Backend uses pi-coding-agent** — spawns a full agent session (with file tools) for simple meeting processing; overkill for summarization/extraction
- **No multi-model support** — using expensive models for simple tasks wastes money; using cheap models for complex reasoning loses quality
- **No credential management** — relies on environment variables only, no way to configure during onboarding
- **Fragmented configuration** — no central place to configure AI settings

### Goals

1. **Unified AI configuration** — Single source of truth for AI settings in `arete.yaml`
2. **Use pi-ai directly** — Leverage existing multi-provider library (Anthropic, OpenAI, Google, Bedrock) without building custom adapters
3. **Multi-model support** — Fast, standard, frontier tiers for cost optimization
4. **Task-based routing** — Different tasks use different tiers automatically
5. **Secure credential storage** — API keys in `~/.arete/credentials.yaml` with restricted permissions
6. **Onboarding integration** — Collect API keys during `arete onboard`
7. **Backend simplification** — Replace pi-coding-agent with pi-ai direct calls

### Out of Scope

- UI for AI configuration (use CLI)
- Multi-provider onboarding (Anthropic only for V1; add others via `arete credentials set`)
- Model fine-tuning
- Usage tracking/billing
- Rate limiting

---

## 2. Architecture Decisions

### Use pi-ai Directly

pi-ai (`@mariozechner/pi-ai`) already provides:
- Multi-provider support (Anthropic, Google, OpenAI, Bedrock, etc.)
- Model registry with `getModel(provider, modelId)`
- Env-based API key resolution via `getEnvApiKey(provider)`
- Streaming with tool calling support

We wrap pi-ai with a thin `AIService` that adds:
- Task → tier → model routing
- Credential loading from file (sets env vars that pi-ai reads)
- Areté-specific configuration

### Credential Resolution

Priority: `env var > ~/.arete/credentials.yaml`

```yaml
# ~/.arete/credentials.yaml (0600 permissions)
anthropic:
  api_key: "sk-ant-..."
google:
  api_key: "..."
```

`loadCredentials()` reads this file and sets `process.env.ANTHROPIC_API_KEY`, etc. — pi-ai's `getEnvApiKey()` picks them up automatically.

### Task Routing

Tasks are a closed set controlled by Areté. Users configure which tier each task uses, and which model each tier maps to.

```yaml
# arete.yaml
ai:
  tiers:
    fast: "gemini-2.0-flash"
    standard: "claude-sonnet-4-20250514"
    frontier: "claude-3-opus"

  tasks:
    summary: fast
    extraction: fast
    decision_extraction: standard
    learning_extraction: standard
    significance_analysis: frontier
    reconciliation: fast
```

### Backend Simplification

Current: Backend uses `createAgentSession()` from pi-coding-agent, which spawns a full agent with file read/write tools.

New: Backend uses `AIService.call()` for direct LLM calls. Meeting processing becomes:
1. Read meeting file (backend does this)
2. Call LLM with extraction prompt via AIService
3. Parse structured response
4. Write results back (backend does this)

No agent session, no tools overhead.

---

## 3. User Stories

### Core Infrastructure

1. As a developer, I can use `AIService` to make LLM calls with task-based model routing
2. As the backend, I can process meetings using direct LLM calls (no agent session overhead)

### CLI Configuration

3. As a PM, I can run `arete credentials set anthropic` to configure my API key interactively
4. As a PM, I can run `arete credentials show` to see which providers are configured (keys hidden)
5. As a PM, I can run `arete credentials test` to verify my API keys work

### Onboarding

6. As a new user, `arete onboard` prompts me for an Anthropic API key (optional)
7. As a user, I can skip AI setup during onboarding and add credentials later

### Configuration

8. As a PM, I can run `arete config show ai` to see my current AI configuration
9. As a PM, I can run `arete config set ai.tiers.fast gemini-2.0-flash` to change which model a tier uses

---

## 4. Requirements

### 4.1 AIService (`packages/core/src/services/ai.ts`)

**Types:**
- `AIService`: Class with factory, call methods, and configuration
- `AITask`: Union type of known task names (`'summary' | 'extraction' | 'decision_extraction' | ...`)
- `AITier`: `'fast' | 'standard' | 'frontier'`
- `AIConfig`: Configuration shape for `arete.yaml` ai section

**Methods:**
- `AIService.create(config: AIConfig): AIService` — factory with config
- `call(task: AITask, prompt: string, options?): Promise<string>` — task → tier → model → pi-ai call
- `callStructured<T>(task: AITask, prompt: string, schema: TSchema): Promise<T>` — returns typed JSON
- `isConfigured(): boolean` — true if any provider has credentials
- `getAvailableProviders(): Provider[]` — list providers with valid credentials

**Behavior:**
- `call()` resolves task → tier → model via config, then calls pi-ai
- Credentials loaded from `~/.arete/credentials.yaml` at startup (if exists), set as env vars
- Env var override: if `ANTHROPIC_API_KEY` is already set, don't overwrite from file
- Graceful error when no credentials configured (throw descriptive error)

### 4.2 Credential Management (`packages/core/src/credentials.ts`)

**Functions:**
- `loadCredentials(): void` — reads `~/.arete/credentials.yaml`, sets env vars
- `saveCredential(provider: string, apiKey: string): Promise<void>` — writes to credentials file
- `getCredentialPath(): string` — returns `~/.arete/credentials.yaml`
- `getConfiguredProviders(): Provider[]` — list providers with credentials (from env or file)

**Behavior:**
- File created with 0600 permissions (owner read/write only)
- YAML format for human readability
- Does not overwrite env vars that are already set

### 4.3 AreteConfig Extension (`packages/core/src/models/workspace.ts`)

**Schema addition:**
```typescript
ai?: {
  tiers?: {
    fast?: string;      // model id
    standard?: string;
    frontier?: string;
  };
  tasks?: Record<AITask, AITier>;
}
```

**Defaults:**
```yaml
ai:
  tiers:
    fast: "gemini-2.0-flash"
    standard: "claude-sonnet-4-20250514"
    frontier: "claude-3-opus"
  tasks:
    summary: fast
    extraction: fast
    decision_extraction: standard
    learning_extraction: standard
    significance_analysis: frontier
    reconciliation: fast
```

### 4.4 Backend Migration (`packages/apps/backend/src/services/agent.ts`)

**Changes:**
- Remove imports from `@mariozechner/pi-coding-agent`
- Import `AIService` from `@arete/core`
- Rewrite `runProcessingSession()`:
  1. Read meeting file content
  2. Call `aiService.callStructured()` with extraction prompt
  3. Parse response into staged sections (action items, decisions, learnings)
  4. Write results back to meeting file
- Remove `@mariozechner/pi-coding-agent` from `package.json`

**Prompts:**
- Summarization: "Summarize this meeting in 2-4 sentences..."
- Extraction: "Extract action items, decisions, and learnings from this meeting..."
- Output as structured JSON with TypeBox schema validation

### 4.5 CLI Credentials Command (`packages/cli/src/commands/credentials.ts`)

**Subcommands:**
- `arete credentials set <provider>` — prompt for API key, validate, save
- `arete credentials show` — list configured providers with masked keys
- `arete credentials test` — verify each provider by making a test call

**Behavior:**
- `set`: Interactive prompt for key, validate by making test call, save to file
- `show`: Read from env + file, show provider names and "configured" status, mask actual keys
- `test`: For each configured provider, make a simple test call, report success/failure

### 4.6 Onboarding Integration (`packages/cli/src/commands/onboard.ts`)

**Changes:**
- After profile setup (name, email, company), add AI configuration step
- Prompt: "Enter your Anthropic API key (or press Enter to skip):"
- If provided: validate key with test call, save to credentials file, write default AI config to `arete.yaml`
- If skipped: continue without AI config, note in output that user can run `arete credentials set` later
- Idempotent: re-running onboard with existing credentials prompts to update

### 4.7 Config CLI Commands (`packages/cli/src/commands/config.ts`)

**New subcommands:**
- `arete config show ai` — display AI configuration (tiers, tasks, configured providers)
- `arete config set ai.tiers.<tier> <model>` — change model for a tier
- `arete config set ai.tasks.<task> <tier>` — change tier for a task

**Validation:**
- Model names validated against pi-ai's model list (warn if unknown, allow anyway)
- Tier names must be `fast | standard | frontier`
- Task names must be in known task list

---

## 5. Task Breakdown

### Task AI-1: Core AIService Foundation

Create `AIService` in `@arete/core` that wraps pi-ai:

**Subtasks:**
- Add `ai` section to `AreteConfig` type in `packages/core/src/models/workspace.ts`
- Create `packages/core/src/credentials.ts` with `loadCredentials()`, `saveCredential()`, `getConfiguredProviders()`
- Create `packages/core/src/services/ai.ts` with `AIService` class
- Implement `AIService.create()`, `call()`, `callStructured()`, `isConfigured()`, `getAvailableProviders()`
- Update `dev/catalog/capabilities.json` with `ai-service` entry
- Add tests with mocked pi-ai calls

**Acceptance Criteria:**
- [ ] `AIService` can call pi-ai with task-based model routing
- [ ] `callStructured()` returns typed JSON responses
- [ ] Credentials loaded from `~/.arete/credentials.yaml` (600 permissions)
- [ ] Env var override works (env > file)
- [ ] Graceful error when no API key configured
- [ ] `dev/catalog/capabilities.json` updated with `ai-service` entry
- [ ] Tests with mocked pi-ai calls

**Files:**
- `packages/core/src/services/ai.ts` (new)
- `packages/core/src/credentials.ts` (new)
- `packages/core/src/models/workspace.ts` (extend AreteConfig)
- `packages/core/test/services/ai.test.ts` (new)
- `packages/core/test/credentials.test.ts` (new)
- `dev/catalog/capabilities.json` (update)

---

### Task AI-2: Backend Migration to pi-ai

Replace pi-coding-agent with pi-ai direct calls in backend:

**Subtasks:**
- Remove `@mariozechner/pi-coding-agent` from backend `package.json`
- Rewrite `runProcessingSession()` to use `AIService`
- Create extraction prompt that returns structured JSON
- Parse response and write staged sections to meeting file
- Update existing tests to mock `AIService` instead of pi-coding-agent

**Acceptance Criteria:**
- [ ] `runProcessingSession()` uses AIService instead of pi-coding-agent
- [ ] Meeting processing produces same output format (staged sections)
- [ ] `pi-coding-agent` removed from backend `package.json`
- [ ] Existing tests pass with mocked AIService
- [ ] Error handling for no API key

**Files:**
- `packages/apps/backend/src/services/agent.ts` (rewrite)
- `packages/apps/backend/package.json` (remove dependency)
- `packages/apps/backend/test/services/agent.test.ts` (update mocks)

---

### Task AI-3: CLI Credential Management

CLI commands to manage API keys:

**Subtasks:**
- Create `packages/cli/src/commands/credentials.ts`
- Implement `arete credentials set <provider>` with interactive prompt and validation
- Implement `arete credentials show` with masked output
- Implement `arete credentials test` with provider health check
- Register commands in CLI entry point
- Add tests for each subcommand

**Acceptance Criteria:**
- [ ] `arete credentials set anthropic` prompts for key, saves securely
- [ ] `arete credentials show` lists providers without exposing keys
- [ ] `arete credentials test` verifies each configured provider
- [ ] File created with 0600 permissions
- [ ] Help text explains env var override

**Files:**
- `packages/cli/src/commands/credentials.ts` (new)
- `packages/cli/src/index.ts` (register command)
- `packages/cli/test/commands/credentials.test.ts` (new)

---

### Task AI-4: Onboarding Integration

Add AI configuration step to `arete onboard`:

**Subtasks:**
- Add AI prompt step after profile setup
- Validate API key before saving (test call)
- Write credentials to `~/.arete/credentials.yaml`
- Write default AI config to `arete.yaml`
- Handle skip gracefully
- Make re-running idempotent (allow updating existing credentials)

**Acceptance Criteria:**
- [ ] `arete onboard` prompts for Anthropic API key
- [ ] User can skip (Enter) — onboarding continues
- [ ] API key validated before saving (test call)
- [ ] Default tier config written to `arete.yaml`
- [ ] Re-running onboard allows updating key

**Files:**
- `packages/cli/src/commands/onboard.ts` (extend)
- `packages/cli/test/commands/onboard.test.ts` (extend)

---

### Task AI-5: Config CLI Commands

CLI commands to view and modify AI settings:

**Subtasks:**
- Add `arete config show ai` subcommand
- Add `arete config set ai.tiers.<tier> <model>` subcommand
- Add `arete config set ai.tasks.<task> <tier>` subcommand
- Validate model names against pi-ai model list
- Validate tier and task names against known sets
- Add tests for each subcommand

**Acceptance Criteria:**
- [ ] `arete config show ai` displays full AI config
- [ ] `arete config set` modifies `arete.yaml`
- [ ] Invalid model names rejected with helpful error
- [ ] Changes take effect on next command

**Files:**
- `packages/cli/src/commands/config.ts` (extend)
- `packages/cli/test/commands/config.test.ts` (extend)

---

## 6. Dependencies Between Tasks

```
AI-1 (Core AIService)
  ↓
AI-2 (Backend Migration) ← depends on AI-1
  ↓
AI-3 (Credentials CLI) ← depends on AI-1 (uses credentials module)
  ↓
AI-4 (Onboarding) ← depends on AI-3 (reuses credentials logic)
  ↓
AI-5 (Config CLI) ← depends on AI-1 (uses AIConfig types)
```

Execution order: AI-1 → AI-2 → AI-3 → AI-4 → AI-5

---

## 7. Testing Strategy

- All AIService tests mock pi-ai calls (no real API calls)
- Credentials tests use temp directories for file operations
- Backend tests mock AIService (no real API calls)
- CLI tests mock core services and file system
- `npm run typecheck` and `npm test` after every task

---

## 8. Success Criteria

- `AIService.call('summary', prompt)` routes to configured fast model
- `AIService.callStructured('extraction', prompt, schema)` returns typed JSON
- Backend processes meetings without pi-coding-agent dependency
- `arete credentials set anthropic` saves key securely
- `arete credentials test` verifies configured providers
- `arete onboard` collects API key and writes config
- `arete config show ai` displays current AI configuration
- All existing tests continue to pass
- No pi-coding-agent in production dependencies for backend
