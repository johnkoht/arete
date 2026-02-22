# Review: Krisp Recorder Integration Plan

**Type**: Plan (pre-execution)  
**Audience**: Builder — internal integration work in `packages/`; output is user-facing meeting files  
**Reviewed against**: Plan as presented (pre-discovery version) + codebase context

---

## Concerns

### 1. Scope — Plan Is Stale (Pre-Discovery)

The plan being reviewed still contains the "Critical Gate" and Step 1 as an open investigation. This session resolved that gate: dynamic client registration at `https://mcp.krisp.ai/.well-known/oauth-registration` works without authentication and returns `client_id` + `client_secret` immediately. The updated `plan.md` was saved but the version used for this review is pre-discovery.

**Impact**: An engineering team reading this plan would spend time on Step 1 that's already done, or worse, implement a flow that's been superseded.

**Suggestion**: Confirm the PRD/task prompts are built from the updated `plan.md` (3 steps, gate cleared), not this version.

---

### 2. Risks — Auth Model Description Is Wrong

The plan describes the auth flow as "OAuth 2.0 + PKCE browser flow" and the risks section frames it as a public PKCE client (`token_endpoint_auth_method: none`). The discovery session proved Krisp requires `client_secret_basic` — a confidential client. The token endpoint exchange needs HTTP Basic auth with the `client_secret`.

**Impact**: A subagent reading this plan literally will implement a pure public PKCE client without a `client_secret`. The token exchange will return a 401 from Krisp. Tests will pass (the mock doesn't enforce `client_secret_basic`), but the live flow will fail silently.

**Suggestion**: The PRD task prompt for the client must explicitly state: "This is a confidential client. Use `client_secret_basic` at the token endpoint (HTTP Basic auth: `client_id:client_secret`). Store 5 credential fields: `client_id`, `client_secret`, `access_token`, `refresh_token`, `expires_at`."

---

### 3. Risks — `auth.type: 'oauth2'` Is a Type Error

The plan specifies `auth.type: 'oauth2'` in the `registry.ts` entry. The actual type in `packages/core/src/models/integrations.ts` is:

```typescript
type IntegrationAuth = {
  type: 'api_key' | 'oauth' | 'none';
  ...
};
```

The value `'oauth2'` is not assignable — `npm run typecheck` would fail. The correct value is `'oauth'`.

**Suggestion**: Update registry.ts entry to use `auth: { type: 'oauth' }`. No type file changes needed — `'oauth'` is already in the union.

---

### 4. Completeness — `credentials.yaml.example` Not in Scope

The plan adds Krisp credential storage to `credentials.yaml`, but doesn't include updating `.credentials/credentials.yaml.example` with the Krisp section. Users setting up a new workspace will have no template to follow.

**Suggestion**: Add to Step 2 (or Step 3): update `.credentials/credentials.yaml.example` with:
```yaml
krisp:
  client_id: ""         # set automatically by arete integration configure krisp
  client_secret: ""     # set automatically by arete integration configure krisp
  access_token: ""      # set automatically by arete integration configure krisp
  refresh_token: ""     # set automatically by arete integration configure krisp
  expires_at: ""        # ISO timestamp, managed automatically
```

---

### 5. Completeness — `save.ts` Dependency on Confirmed Schemas Not Explicit

The plan has `types.ts` and `save.ts` in the same step. But `save.ts` cannot be correctly implemented until `types.ts` is verified against the real `tools/list` response. This intra-step dependency is implicit.

**Suggestion**: In the PRD task for Step 1, explicitly sequence: (1) write `types.ts` with unverified assumptions, (2) call `tools/list` with real Krisp Core token, (3) update `types.ts`, (4) then write `save.ts`. Make this a hard gate within the step.

---

### 6. Dependencies — `@modelcontextprotocol/client` Not in package.json

The plan calls for using `@modelcontextprotocol/client` with `StreamableHTTPClientTransport` but this package is not in `packages/core/package.json`. The Krisp MCP endpoint is plain JSON-RPC POST — we proved this with `curl`. A thin `fetch` wrapper may be sufficient and avoids an unvetted dependency.

**Suggestion**: Before committing to the SDK, evaluate whether `fetch` + a 30-line JSON-RPC wrapper suffices (matching the Fathom `request()` pattern). If the SDK is used, explicitly add it to `packages/core/package.json` as part of Step 1. The task prompt should make this decision explicit, not leave it to the implementer.

---

### 7. Completeness — No Acceptance Criteria Per Step

Each step describes what to build but not what "done" looks like. Acceptance criteria prevent subagents from shipping partial implementations or making scope decisions that should belong to the builder.

**Suggestion**: Add explicit ACs to each step in the PRD. Examples:
- Step 1 AC: "`npm run typecheck` passes, `npm test` passes including token refresh test, `pullKrisp()` returns a `MeetingForSave` array from mocked MCP responses"
- Step 2 AC: "`arete pull krisp` command exists and routes to `pullKrisp`, `arete integration configure krisp` stores all 5 credential fields in credentials.yaml"
- Step 3 AC: "`npm test` passes full suite, registry.md updated, GUIDE.md updated"

---

## Strengths

- **Clear integration pattern to follow**: Fathom is an excellent reference — file layout (`types.ts`, `client.ts`, `save.ts`, `index.ts`), storage pattern, `MeetingForSave` interface reuse. This reduces novelty and accelerates Step 1.
- **Thorough out-of-scope section**: Webhook sync, AI Voice SDK, Windows/Linux, Granola — each one is a real scope trap that's been explicitly cut. This is well-done.
- **Discovery session de-risked the hardest part**: Dynamic registration was proven to work before a line of code was written. That's exactly the right sequencing.
- **Pre-mortem coverage**: The 8 risks identified in the pre-mortem are specific and actionable. The highest-severity ones (Fathom-hardcoded `getIntegrationStatus`, partial credential state) are concrete and verifiable.

---

## Devil's Advocate

**If this fails, it will be because** the OAuth client is implemented as a pure PKCE public client (following the plan's description), and the token exchange fails with a 401 from Krisp's token endpoint. The failure is hard to catch — tests use mocks that don't enforce `client_secret_basic`, typecheck passes, and the OAuth flow gets to the redirect step. The failure surfaces only when a real user runs `arete integration configure krisp`, the browser opens, they log in, the redirect completes — and then nothing happens. The token exchange silently fails and credentials are never stored. The user has no idea why the integration isn't working.

**The worst outcome would be** shipping the full integration, it passes all automated quality gates, the feature is documented and in GUIDE.md — but every real user who tries to configure it hits a silent auth failure. We don't discover this until someone reports "configure krisp doesn't seem to work" and we have to trace back through the OAuth flow to find the missing `client_secret_basic` auth header. This is the kind of bug that's embarrassing to ship and subtle to diagnose.

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

**The plan is structurally sound and the discovery session did exactly the right pre-build validation.** The concerns above are all addressable in the PRD task prompts — they don't require changes to the overall architecture or sequencing.

**Required before engineering starts** (Concerns 2 and 3 must be fixed in task prompts — they will cause silent failures or typecheck errors otherwise):
- Concern 2: Auth model corrected to confidential client + `client_secret_basic` in task prompt
- Concern 3: `auth.type: 'oauth'` (not `'oauth2'`) in task prompt

**Recommended before engineering starts** (Concerns 4, 5, 6, 7 improve quality and reduce mid-step ambiguity):
- Concern 4: Add `credentials.yaml.example` update to scope
- Concern 5: Explicit intra-step sequencing for types → verify → save
- Concern 6: Decide SDK vs fetch before writing client.ts
- Concern 7: Add acceptance criteria per step
