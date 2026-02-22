# Pre-Mortem: Krisp Recorder Integration

**Plan**: Krisp MCP integration — OAuth dynamic registration + MCP client + CLI wiring  
**Size**: Large (3 steps + new patterns: dynamic client registration, confidential OAuth, MCP JSON-RPC)  
**Date**: 2026-02-21

---

### Risk 1: `services/integrations.ts` — Private Method Is Fathom-Hardcoded

**Problem**: `getIntegrationStatus()` in `services/integrations.ts` is a private method with a general signature but a Fathom-only implementation — it checks `integration === 'fathom'` by name and returns `null` for everything else. A subagent wiring Krisp in Step 2 will add a `krisp` branch to `pull()` but may not notice this private method needs a parallel `krisp` branch, leaving `arete pull krisp` always returning "Integration not active."

**Mitigation**: Before wiring Step 2, read `services/integrations.ts` in full. The `getIntegrationStatus` private method must be extended to handle `krisp` (load tokens from credentials.yaml; return `active` if `access_token` is present, `inactive` otherwise). Document this dependency explicitly in the Step 2 task prompt.

**Verification**: After wiring, run `arete integration configure krisp` then `arete pull krisp` — if `getIntegrationStatus` is wrong, pull returns "not active" with no meetings pulled.

---

### Risk 2: MCP SDK Not in package.json — May Not Be Needed

**Problem**: `@modelcontextprotocol/client` is not in `packages/core/package.json`. The plan assumes using the SDK with `StreamableHTTPClientTransport`. However, Krisp's MCP endpoint is a plain JSON-RPC POST — we already proved this with `curl`. Adding the full MCP SDK adds an unvetted dependency with unknown transitive dependencies for what amounts to a single HTTP call pattern.

**Mitigation**: Evaluate whether `@modelcontextprotocol/client` is actually needed or whether a thin `fetch`-based JSON-RPC wrapper (like Fathom's own `request()` method) is sufficient. The MCP protocol over Streamable HTTP is just `POST /mcp` with `{ jsonrpc: "2.0", method: "tools/call", params: { name, arguments }, id }` — implementable with `fetch` in ~30 lines. If the SDK adds real value (connection management, retry, streaming), add it explicitly to package.json; otherwise skip it. Either way, confirm the choice before writing `client.ts`.

**Verification**: If SDK is used, `packages/core/package.json` has `@modelcontextprotocol/client` in `dependencies`. If not, `client.ts` has a direct `fetch`-based `callTool()` method with the JSON-RPC shape.

---

### Risk 3: Tool Schemas Unknown Until Live Account

**Problem**: `types.ts` must be written before we know the exact shape of `search_meetings` params and `get_document` responses. The subagent will write types based on reasonable assumptions. If the real schema differs (different field names, unexpected nesting, different date formats), `save.ts` will silently produce empty or malformed meeting files.

**Mitigation**: Treat types as a two-pass exercise. Pass 1: write `types.ts` with reasonable types annotated `// UNVERIFIED — confirm with tools/list`. Pass 2: early in Step 1 dev, call `tools/list` and `tools/call search_meetings` with a real Krisp Core account token; update types accordingly before `save.ts` is written. Do not write `save.ts` until types are confirmed.

**Verification**: `types.ts` has a comment block at the top stating either "Verified against tools/list YYYY-MM-DD" or "UNVERIFIED — pending live account test." `save.ts` is not written until the verified version exists.

---

### Risk 4: Partial Credential State After OAuth Failure

**Problem**: The OAuth flow for Krisp has more steps than Fathom (5 fields vs. 1): dynamic registration → browser flow → token exchange. If any step fails mid-way (browser closed before redirect, network error during token exchange, port collision on localhost callback), `credentials.yaml` may be left with `client_id`/`client_secret` populated but no tokens — or corrupted YAML. A subsequent `arete pull krisp` will fail with a confusing error.

**Mitigation**: Implement `arete integration configure krisp` as an all-or-nothing write: collect all 5 credential fields first, then write them to credentials.yaml in a single operation. Never write partial state. If any step fails before token exchange completes, write nothing. Add clear error messages for each failure mode: "Browser closed before completing login — run configure again", "Port 8787 in use — try again", "Token exchange failed — run configure again."

**Verification**: Simulate a failed flow (interrupt mid-browser-redirect) and confirm credentials.yaml has no partial `krisp:` section afterward.

---

### Risk 5: Localhost Callback Port Collision

**Problem**: The OAuth PKCE flow requires a localhost redirect URI. We registered `http://localhost:8787/callback` in our test, but port 8787 may be in use at configure-time. Node's `http.createServer` will throw `EADDRINUSE` and the OAuth flow will fail with a confusing error, or worse, never redirect at all.

**Mitigation**: Use a dynamic port: bind to `localhost:0` to get an OS-assigned free port, then construct the `redirect_uri` from the actual bound port. Pass this dynamic `redirect_uri` in the authorization URL. **Important**: this means the `redirect_uri` used at auth time must match what was registered — either (a) re-register a new client each configure run with the dynamic port, or (b) register with a range of ports and pick a free one. Option (a) is simpler: dynamic registration is cheap (no auth, instant). Include `redirect_uris: ["http://localhost:{dynamic_port}/callback"]` in the registration payload.

**Verification**: Test configure with port 8787 manually blocked (`nc -l 8787`). OAuth flow should still complete on a different port.

---

### Risk 6: `getIntegrationStatus` Refactor Required Before Tests Pass

**Problem**: The existing integration CLI test (`packages/cli/test/commands/integration.test.ts`) and wiring tests will need the Krisp status check to work correctly. But `getIntegrationStatus` is a private method in `IntegrationService` — it can't be tested in isolation. If the logic is wrong, the only symptom is "Integration not active" at runtime, which is hard to catch in unit tests that mock the service.

**Mitigation**: When adding the `krisp` branch to `getIntegrationStatus`, also refactor the method to be more generic: extract a shared `loadOAuthCredentials(workspaceRoot, name)` helper that reads the named key from credentials.yaml. This makes both the Krisp path and future OAuth integrations testable. The test should verify the configure → status → pull flow end-to-end with mocked credentials.

**Verification**: `npm test` passes including a test that mocks a `krisp:` credentials.yaml entry and asserts `getIntegrationStatus` returns `'active'`.

---

### Risk 7: No Existing OAuth Test Pattern in the Codebase

**Problem**: The existing integration tests cover Fathom (API key, simple `fetch` mock) and calendar (no auth). There is no OAuth test pattern in the test suite. A subagent writing Krisp tests without a reference pattern may write incomplete tests (testing only the happy path, skipping token refresh) or tests that try to actually open a browser.

**Mitigation**: Define the test strategy explicitly in the task prompt:
- OAuth browser flow: not unit-tested (untestable without a browser). Test only token storage and retrieval.
- Token refresh logic: fully unit-tested — mock a credentials.yaml with an expired `access_token`, verify the client calls the token endpoint and stores the new tokens.
- MCP tool calls: mock the `fetch` response and verify correct JSON-RPC shape is sent and response is parsed correctly.
- Transform (`save.ts`): snapshot-style tests with fixture MCP responses → verify `MeetingForSave` shape.

**Verification**: Test file covers: (1) token refresh when expired, (2) token used directly when not expired, (3) MCP call shape, (4) transform output shape. No test tries to open a browser.

---

### Risk 8: `IntegrationDefinition` Type May Not Support OAuth Auth Shape

**Problem**: The `IntegrationDefinition` type in `models/integrations.ts` currently has `auth: { type: 'api_key' | 'none', envVar?, configKey?, instructions? }`. Adding Krisp with `auth.type: 'oauth2'` will either fail TypeScript (`type: 'oauth2'` is not assignable) or require a type change that could break existing code.

**Mitigation**: Before writing `registry.ts`, read `packages/core/src/models/integrations.ts` to check the `IntegrationDefinition` type. If `auth.type` is a union, extend it to include `'oauth2'`. Add any OAuth-specific auth fields (`callbackPort?`, `scopes?`) as optional properties. Check all callers of `IntegrationDefinition.auth` to ensure the discriminated union is handled correctly everywhere.

**Verification**: `npm run typecheck` passes after adding the `krisp` entry to `registry.ts`.

---

## Summary

**Total risks identified**: 8  
**Categories covered**: Integration, Dependencies, Context Gaps, State Tracking, Platform Issues, Test Patterns, Code Quality, Scope Creep

**Highest severity** (would silently break without a clear error):
- Risk 1: `getIntegrationStatus` hardcoded for Fathom — pulls always fail for Krisp
- Risk 3: Tool schemas unverified — save.ts produces empty/malformed meeting files
- Risk 4: Partial credential state — confusing failure mode after OAuth interruption

**Recommended sequence guard**:
1. Before Step 1: call `tools/list` with a real Krisp Core account to confirm types. Do not write `save.ts` until types are verified.
2. Before Step 2 wiring: read `services/integrations.ts` and `models/integrations.ts` in full before touching either.
3. Before testing: define OAuth test strategy explicitly (no browser tests; mock token exchange and MCP calls).

**Ready to proceed with these mitigations?**
