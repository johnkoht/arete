---
title: Areté AI Configuration
slug: ai-config
status: building
size: medium
tags: [ai, intelligence, backend, cli]
created: 2026-03-08T05:05:45.242Z
updated: 2026-03-08T05:33:30.061Z
completed: null
execution: null
has_review: true
has_pre_mortem: false
has_prd: true
steps: 5
---

# Areté AI Configuration

**Size**: Medium (5 tasks)  
**Dependencies**: Blocks Intelligence Tuning (INT-1 through INT-5)

---

## Problem Statement

Areté currently has no consistent AI configuration:
- CLI has no AI capability (can't call LLMs)
- Backend uses pi-coding-agent for meeting processing (overkill — spawns full agent session for simple LLM calls)
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
2. **Multi-provider support** — Via pi-ai (Anthropic, OpenAI, Google, etc.)
3. **Multi-model support** — Fast, standard, frontier tiers
4. **Task-based routing** — Different tasks use different tiers
5. **Secure credential storage** — API keys in `~/.arete/credentials.yaml`
6. **Onboarding integration** — Collect API keys during setup
7. **Backend simplification** — Replace pi-coding-agent with pi-ai direct calls

---

## Decisions Made

| Question | Decision |
|----------|----------|
| Provider adapters | Use pi-ai (no custom adapters) |
| Backend architecture | Replace pi-coding-agent with pi-ai direct calls |
| Task types | Closed set (Areté controls it) |
| Phasing | Single plan, no phases |

---

## Plan:

### AI-1: Core AIService Foundation

Create `AIService` in `@arete/core` that wraps pi-ai:

- `AIService.create(config)` — factory with config
- `call(task, prompt, options?)` — task → tier → model routing via pi-ai
- `callStructured<T>(task, prompt, schema)` — returns parsed JSON (for extractions)
- `isConfigured()` — check if any provider has credentials
- `getAvailableProviders()` — list configured providers

Credential loading: `loadCredentials()` reads `~/.arete/credentials.yaml` → sets `process.env.ANTHROPIC_API_KEY`, etc. → pi-ai's `getEnvApiKey()` picks them up.

**Acceptance Criteria**:
- [ ] `AIService` can call pi-ai with task-based model routing
- [ ] `callStructured()` returns typed JSON responses
- [ ] Credentials loaded from `~/.arete/credentials.yaml` (600 permissions)
- [ ] Env var override works (env > file)
- [ ] Graceful error when no API key configured
- [ ] `dev/catalog/capabilities.json` updated with `ai-service` entry
- [ ] Tests with mocked pi-ai calls

**Files**:
- `packages/core/src/services/ai.ts` (new)
- `packages/core/src/credentials.ts` (new)
- `packages/core/src/models/workspace.ts` (extend AreteConfig with `ai` section)

---

### AI-2: Backend Migration to pi-ai

Replace pi-coding-agent with pi-ai direct calls in backend:

- Remove `@mariozechner/pi-coding-agent` dependency
- Use `AIService` for meeting processing (summarization, extraction)
- Keep structured output parsing for action items, decisions, learnings

**Acceptance Criteria**:
- [ ] `runProcessingSession()` uses AIService instead of pi-coding-agent
- [ ] Meeting processing produces same output format
- [ ] `pi-coding-agent` removed from backend `package.json`
- [ ] Existing tests pass with mocked AIService
- [ ] Error handling for no API key

**Files**:
- `packages/apps/backend/src/services/agent.ts` (rewrite)
- `packages/apps/backend/package.json` (remove pi-coding-agent)

---

### AI-3: CLI Credential Management

CLI commands to manage API keys:

- `arete credentials set <provider>` — interactive API key entry
- `arete credentials show` — list configured providers (keys masked)
- `arete credentials test` — verify API keys work
- Store to `~/.arete/credentials.yaml` with 600 permissions

**Acceptance Criteria**:
- [ ] `arete credentials set anthropic` prompts for key, saves securely
- [ ] `arete credentials show` lists providers without exposing keys
- [ ] `arete credentials test` verifies each configured provider
- [ ] File created with 0600 permissions
- [ ] Help text explains env var override

**Files**:
- `packages/cli/src/commands/credentials.ts` (new)

---

### AI-4: Onboarding Integration

Add AI configuration step to `arete onboard`:

- After profile setup, prompt: "Enter your Anthropic API key (or press Enter to skip)"
- Validate key before saving
- Write default tier config to `arete.yaml`
- Idempotent: re-running allows adding/updating keys

**Acceptance Criteria**:
- [ ] `arete onboard` prompts for Anthropic API key
- [ ] User can skip (Enter) — onboarding continues
- [ ] API key validated before saving (test call)
- [ ] Default tier config written to `arete.yaml`
- [ ] Re-running onboard allows updating key

**Files**:
- `packages/cli/src/commands/onboard.ts` (extend)

---

### AI-5: Config CLI Commands

CLI commands to view and modify AI settings:

- `arete config show ai` — display AI configuration
- `arete config set ai.tiers.fast <model>` — change tier model  
- `arete config set ai.tasks.summary <tier>` — change task mapping
- Validate model names against pi-ai's model list

**Acceptance Criteria**:
- [ ] `arete config show ai` displays full AI config
- [ ] `arete config set` modifies `arete.yaml`
- [ ] Invalid model names rejected with helpful error
- [ ] Changes take effect on next command

**Files**:
- `packages/cli/src/commands/config.ts` (extend)

---

## Config Schema

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
AI-1 (Core AIService) ──► AI-2 (Backend Migration) ──► AI-3 (Credentials CLI)
                                                              │
                                                              ▼
                                                   AI-4 (Onboarding)
                                                              │
                                                              ▼
                                                   AI-5 (Config CLI)
```

---

## Out of Scope

- UI for AI configuration (use CLI)
- Multi-provider onboarding (Anthropic only for V1; add others via `arete credentials set`)
- Model fine-tuning
- Usage tracking/billing
- Rate limiting

---

## Technical Context

### Current State
- Backend uses `pi-coding-agent` for meeting processing (spawns full agent session)
- Backend uses `getEnvApiKey('anthropic')` from `pi-ai` for API key validation
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

---

## Dependencies

- **Blocks**: Intelligence Tuning (INT-1 through INT-5)
- **Blocks**: CLI extraction commands
- **Enables**: Multi-model cost optimization
