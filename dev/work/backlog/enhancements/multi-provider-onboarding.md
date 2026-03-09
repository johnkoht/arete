# Multi-Provider AI Onboarding

## Problem
Currently `arete onboard` only asks for Anthropic API key and defaults all tiers to Anthropic models. Users who want to use Google (Gemini) or OpenAI as their fast tier, or mix providers, have no guided path during onboarding.

## Current Behavior
1. Onboard prompts for Anthropic API key only
2. Defaults all tiers to Anthropic models (haiku/sonnet/opus)
3. Users must manually run `arete credentials set <provider>` and `arete config set ai.tiers.<tier> <model>` for other providers

## Proposed Enhancement

### Option A: Sequential provider prompts
After Anthropic, offer to add Google and OpenAI keys:
```
✔ Enter your Anthropic API key: [masked]
? Would you like to add another provider? (Gemini, OpenAI) [y/N]
```

### Option B: Provider selection menu
Let user choose which providers to configure:
```
? Which AI providers would you like to configure? (space to select)
❯ ◉ Anthropic (Claude)
  ◯ Google (Gemini)
  ◯ OpenAI (GPT-4)
```

### Option C: Smart tier defaults
After collecting keys, suggest optimal tier assignments:
```
Based on your configured providers:
  fast:     gemini-2.0-flash (Google - fastest/cheapest)
  standard: claude-sonnet-4  (Anthropic)
  frontier: claude-3-opus    (Anthropic)

Accept these defaults? [Y/n]
```

## Implementation Notes
- `testProviderConnection` already supports anthropic, google, openai
- `VALIDATION_MODELS` has models defined for each
- `arete credentials set` flow can be reused
- Need to update `DEFAULT_AI_CONFIG` based on which providers are configured

## Priority
Low - current workaround (manual `arete credentials set` + `arete config set`) works fine

## Created
2026-03-08 — from ai-config PRD feedback
