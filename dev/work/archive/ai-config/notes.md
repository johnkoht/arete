# Plan: Areté AI Configuration

**Status**: draft
**Size**: medium (5 tasks)
**Dependency**: This must be completed before Intelligence Tuning (INT-1 through INT-5)

---

## Problem Statement

Areté currently has no consistent AI configuration:
- CLI has no AI capability (can't call LLMs)
- Backend uses hardcoded env var (`ANTHROPIC_API_KEY`)
- No multi-model support (can't use fast models for cheap tasks)
- No way to configure AI during onboarding
- Skills can't leverage AI-powered services

**User Impact**: 
- CLI users can't use AI features
- No cost optimization (using expensive models for simple tasks)
- Fragmented configuration across env vars, no central management

---

## Goals

1. **Unified AI configuration** — Single source of truth for AI settings
2. **Multi-provider support** — Anthropic, OpenAI, Google
3. **Multi-model support** — Fast, standard, frontier tiers
4. **Task-based routing** — Different tasks use different tiers
5. **Secure credential storage** — API keys separate from config
6. **Onboarding integration** — Collect API keys during setup

---

## Plan:

### AI-1: Core AI Service Foundation

**Goal**: Create the core AI service with multi-provider, multi-model support

**Tasks**:
1. Add `ai` section to `AreteConfig` type
2. Create `AICredentials` type and loader (`~/.arete/credentials.yaml`)
3. Create `AIService` in `@arete/core`:
   - `call(task: AITask, prompt: string): Promise<string>`
   - `isConfigured(): boolean`
   - `getAvailableProviders(): Provider[]`
4. Implement provider adapters (Anthropic, OpenAI, Google)
5. Add credential resolution: env var > credentials file

**Acceptance Criteria**:
- [ ] `AIService` can call multiple providers
- [ ] Credentials loaded from file or env
- [ ] Task → tier → model resolution works
- [ ] Graceful error when no API key configured

**Files to Create/Modify**:
- `packages/core/src/services/ai.ts` (new)
- `packages/core/src/models/workspace.ts` (extend AreteConfig)
- `packages/core/src/config.ts` (load credentials)

---

### AI-2: CLI Credential Management

**Goal**: CLI commands to manage API keys

**Tasks**:
1. Create `arete credentials set <provider>` — interactive API key entry
2. Create `arete credentials show` — list configured providers (keys hidden)
3. Create `arete credentials test` — verify API keys work
4. Store to `~/.arete/credentials.yaml` with 600 permissions

**Acceptance Criteria**:
- [ ] `arete credentials set anthropic` prompts for key, saves securely
- [ ] `arete credentials show` lists providers without exposing keys
- [ ] `arete credentials test` verifies each configured provider
- [ ] File created with restrictive permissions

**Files to Create/Modify**:
- `packages/cli/src/commands/credentials.ts` (new)
- `packages/core/src/credentials.ts` (new)

---

### AI-3: Onboarding Integration

**Goal**: Collect API keys during `arete onboard`

**Tasks**:
1. Add AI configuration step after profile setup
2. Multi-select providers to configure
3. Validate API keys before saving
4. Write default tier config to `arete.yaml`
5. Make onboarding idempotent (can re-run to add providers)

**Acceptance Criteria**:
- [ ] `arete onboard` prompts for AI configuration
- [ ] User can skip AI setup (Cursor fallback still works)
- [ ] API keys validated before saving
- [ ] Running onboard again allows adding new providers
- [ ] Default tier/task config written to `arete.yaml`

**Files to Modify**:
- `packages/cli/src/commands/onboard.ts`

---

### AI-4: Config CLI Commands

**Goal**: CLI commands to view and modify AI settings

**Tasks**:
1. Create `arete config show ai` — display AI configuration
2. Create `arete config set ai.tiers.fast <model>` — change tier model
3. Create `arete config set ai.tasks.summary <tier>` — change task mapping
4. Validate model names and tier references

**Acceptance Criteria**:
- [ ] `arete config show ai` displays full AI config
- [ ] `arete config set` modifies `arete.yaml`
- [ ] Invalid model/tier names rejected with helpful error
- [ ] Changes take effect on next command

**Files to Modify**:
- `packages/cli/src/commands/config.ts` (new or extend)

---

### AI-5: Backend Integration

**Goal**: Backend uses AIService instead of hardcoded env var

**Tasks**:
1. Initialize `AIService` on backend startup
2. Replace `getEnvApiKey('anthropic')` with `aiService.call()`
3. Update meeting processing to use task-based routing
4. Keep env var support as fallback/override

**Acceptance Criteria**:
- [ ] Backend uses `AIService` for all AI calls
- [ ] Task-based model selection works
- [ ] Env var override still works for deployment
- [ ] Error handling when no AI configured

**Files to Modify**:
- `packages/apps/backend/src/services/agent.ts`
- `packages/apps/backend/src/index.ts`

---

## Config Schema

```yaml
# arete.yaml
ai:
  providers:
    anthropic:
      enabled: true
    openai:
      enabled: false
    google:
      enabled: true

  tiers:
    fast: "gemini-2.0-flash"
    standard: "claude-sonnet-4-20250514"
    frontier: "claude-3-opus"

  tasks:
    summary: fast
    extraction: fast
    decision_extraction: standard
    learning_extraction: standard
    stance_extraction: standard
    people_classification: standard
    significance_analysis: frontier
    reconciliation: fast
```

```yaml
# ~/.arete/credentials.yaml (600 permissions)
anthropic:
  api_key: "sk-ant-..."
google:
  api_key: "..."
```

---

## Build Order

```
AI-1 (Core Service) ──► AI-2 (Credentials CLI) ──► AI-3 (Onboarding)
                                                          │
                                                          ▼
                                               AI-4 (Config CLI)
                                                          │
                                                          ▼
                                               AI-5 (Backend)
```

---

## Dependencies

- **Blocks**: Intelligence Tuning (INT-1 through INT-5) depends on this
- **Blocks**: CLI extraction commands depend on this
- **Enables**: Multi-model cost optimization

---

## Out of Scope

- UI for AI configuration (use CLI)
- Model fine-tuning
- Usage tracking/billing
- Rate limiting

---

## Technical Context

### Current State
- Backend uses `ANTHROPIC_API_KEY` env var via `getEnvApiKey('anthropic')`
- CLI has NO AI capability
- `arete onboard` collects name, email, company but no AI config
- Config lives in `arete.yaml` (workspace) and `~/.arete/config.yaml` (global)

### Resolution Priority
- **Credentials**: env var > `~/.arete/credentials.yaml`
- **Config**: `arete.yaml` (workspace) > `~/.arete/config.yaml` (global) > defaults

### Why Multi-Model?
| Task | Requirement | Ideal Tier |
|------|-------------|------------|
| Summary | Good writing, fast | Fast |
| Action item extraction | Pattern matching | Fast |
| Decision extraction | Judgment | Standard |
| Significance analysis | Deep reasoning | Frontier |
| Reconciliation | Matching | Fast |

Using frontier models for simple tasks wastes money. Using fast models for complex reasoning loses quality.
