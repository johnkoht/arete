## Review: Areté AI Configuration Plan

**Type**: Plan (pre-execution)  
**Audience**: Builder (internal tooling for Areté development)

---

### Concerns

#### 1. **Scope: Provider Adapters are Substantial Work**

The plan calls for building adapters for 3 providers (Anthropic, OpenAI, Google). Each needs:
- API client setup
- Error handling (rate limits, auth failures, model not found)
- Response parsing
- Retry logic

**Suggestion**: Consider using [Vercel AI SDK](https://sdk.vercel.ai/) or similar. It provides:
- Multi-provider abstraction out of the box
- Streaming support
- Unified error handling
- Well-tested production code

If you want to keep control, scope V1 to **Anthropic only** (already in use), add OpenAI/Google later.

#### 2. **Architecture: Relationship to pi-ai/pi-coding-agent Unclear**

Current backend uses:
```typescript
import { createAgentSession } from '@mariozechner/pi-coding-agent';
import { getEnvApiKey } from '@mariozechner/pi-ai';
```

The plan creates a new `AIService` in `@arete/core`. But the backend's agent orchestration (meeting processing) already has its own LLM path via pi-coding-agent.

**Question**: Is AIService for:
- **Direct LLM calls** (summaries, extractions) — separate from agent orchestration?
- **Replacing** pi-ai's credential handling?

If the former: Make this explicit in AI-5's scope. The backend has TWO AI paths:
1. Agent orchestration (pi-coding-agent, keep as-is)
2. Direct LLM calls (new AIService)

**Suggestion**: Clarify in AI-5: "AIService handles direct LLM calls (summarization, extraction). Agent orchestration via pi-coding-agent remains unchanged and continues using ANTHROPIC_API_KEY."

#### 3. **Dependencies: Task Order May Not Be Optimal**

The plan shows:
```
AI-1 (Core) → AI-2 (Credentials CLI) → AI-3 (Onboarding) → AI-4 (Config CLI) → AI-5 (Backend)
```

But AI-5 (Backend Integration) is what unblocks Intelligence Tuning. If INT-1 through INT-5 are waiting, consider:

```
AI-1 (Core + Backend-minimal) → AI-5 (Backend Integration) → AI-2/AI-3/AI-4 (CLI polish)
```

**Suggestion**: If unblocking INT-1 is urgent, consider a **Phase 1** (core + backend) and **Phase 2** (CLI commands, onboarding) split.

#### 4. **Patterns: Task Types Are Hardcoded**

The schema shows:
```yaml
tasks:
  summary: fast
  extraction: fast
  decision_extraction: standard
```

This is a fixed set of task types. What if:
- A new skill needs a task type not in the list?
- A user wants to customize beyond the predefined tasks?

**Suggestion**: Either:
- Document that task types are a closed set (Areté controls them), or
- Add a `custom:` section for user-defined task→tier mappings

#### 5. **Catalog**: Update Required After Completion

The capabilities catalog (`dev/catalog/capabilities.json`) doesn't have an entry for AI configuration. This will be a new core service.

**Suggestion**: Add catalog entry to AI-1 acceptance criteria:
- [ ] `dev/catalog/capabilities.json` updated with `ai-service` capability

#### 6. **Multi-IDE**: Not Applicable

This is core/CLI/backend work — no `.agents/sources/` or rules changes. Multi-IDE consistency concern doesn't apply.

#### 7. **Testing**: Backend Integration Testing is Tricky

AI-5 modifies `agent.ts` to use AIService. The existing tests mock `getEnvApiKey`. New tests need to:
- Mock AIService
- Test fallback to env var
- Test error cases (no credentials)

**Suggestion**: In AI-5 acceptance criteria, specify:
- [ ] Tests mock AIService, not real API calls
- [ ] Error handling tests: no credentials, invalid key, provider error

#### 8. **Scope Creep Risk: Onboarding**

AI-3 touches onboarding, which is user-facing UX. The current onboard is simple (name, email, company). Adding API key collection adds:
- Provider selection UI
- Key validation calls
- Error messaging
- Optional skip path

This could balloon.

**Suggestion**: Keep AI-3 minimal:
- Single provider prompt: "Enter your Anthropic API key (or press Enter to skip)"
- Multi-provider can be a follow-up

---

### Strengths

- **Clear problem statement**: The fragmentation issue is real and well-articulated
- **Good scope boundaries**: Out-of-scope items are explicit (no UI, no fine-tuning, no billing)
- **Task decomposition is clean**: Each task has focused acceptance criteria
- **Config schema is concrete**: YAML examples make the design tangible
- **Build order is sensible**: Dependencies are explicit

---

### Devil's Advocate

**If this fails, it will be because...**

We underestimate the surface area of provider adapters. Anthropic, OpenAI, and Google all have different:
- Auth mechanisms (API key vs service account)
- Error formats
- Rate limit behaviors
- Model naming conventions

Building 3 robust adapters is 3x the work of one, not 1.1x. If we ship brittle adapters, every provider failure becomes an Areté bug.

**The worst outcome would be...**

We build AIService, migrate the backend to use it, and then discover it doesn't integrate cleanly with pi-coding-agent's auth flow. Now we have two credential systems that users need to configure, and meeting processing breaks because of credential resolution conflicts.

---

### Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

**Recommendations before proceeding:**

1. **Clarify the relationship** between AIService and pi-ai/pi-coding-agent (Concern #2)
2. **Decide on provider scope** for V1 — all 3 or Anthropic-only? (Concern #1)
3. **Consider phase split** if INT-1 needs to start soon (Concern #3)
4. **Add catalog update** to AI-1 acceptance criteria (Concern #5)
