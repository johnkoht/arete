Written to `dev/work/plans/krisp-recorder-integration/review-engineering-lead.md` — 271 lines.

---

## The short version

**Don't spawn developers yet. Fix 2 blockers first, then 6 quality gaps.**

### 🔴 Blockers (will cause developer failure)

**1. tools/list gate requires a real Krisp Core account** — a developer subagent cannot call `tools/list` autonomously. Either you provide fixture JSON from a real account before Task 1 starts (best), or you explicitly defer `save.ts` to a builder-gated subtask between Task 1 and Task 2. The PRD currently leaves the developer at an impossible gate.

**2. OAuth browser flow placement is ambiguous** — if a developer implements the localhost server + PKCE + token exchange inline in `integration.ts` CLI command, it's untestable. The confidential client pattern (`client_secret_basic`) then has zero test coverage. The PRD must explicitly state: "OAuth flow lives in `KrispMcpClient.configure()` in `client.ts`. CLI calls the client and handles persistence."

### 🟡 Quality gaps (won't block compilation, but will leave holes)

3. **Dual-write for configure**: `configure krisp` must write to **both** credentials.yaml (so `getIntegrationStatus` → `pull` works) AND `arete.yaml` (so `integration list` shows active). The PRD implies this but a developer reading it will likely do only one.
4. **Wrong reference file**: Task 1 says "follow `fathom/config.ts` pattern" for credentials — but `fathom/config.ts` is just two constants. The actual credential loading pattern is in `fathom/client.ts` (`loadFathomApiKey()`).
5. **Three files must be CREATED, not updated**: `packages/runtime/GUIDE.md`, `packages/core/src/integrations/LEARNINGS.md`, and `packages/runtime/integrations/configs/` directory — none exist. "Add to" will confuse the developer.
6. **`pull.ts` error message not in scope**: The hardcoded `'Available: calendar, fathom'` string needs `krisp` added — not mentioned in Task 2's file list.
7. **Six test gaps**: both-tokens-expired (no test, no error path), 403 Core plan gate, post-refresh token persistence assertion, atomic write verification, null MCP field handling in transform, and `callTool` needs two explicit assertions (bearer header + JSON-RPC body).

### ✅ What's solid

The auth model documentation is excellent — `client_secret_basic` + PKCE is explicit with the exact implementation detail. The `'oauth'` not `'oauth2'` catch prevents an immediate typecheck failure. The pre-mortem's 8 risks are all actionable and verifiable. The no-SDK decision is correct. The task sequencing is strictly right. This is good planning work — it just needs these specific fixes before it's execution-ready.