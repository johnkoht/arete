## Pre-Mortem: Google Workspace CLI Integration

### Risk 1: GWS CLI Output Format Assumptions

**Problem**: The entire adapter layer assumes `gws` outputs consistent, parseable JSON via `--format json`. If the JSON schema varies between versions, changes silently between services, or includes unexpected fields/nesting, every adapter breaks at runtime with opaque parse errors. Unlike a typed SDK, there's no compile-time contract — we're parsing shell output.

**Mitigation**: Build `gwsExec()` with defensive parsing from day one. Capture raw stdout/stderr before parsing. Write adapter tests against fixture JSON files (snapshot from real `gws` output). Add a `gws --version` check on detection and log it so we can correlate failures with version changes. Each adapter should validate the shape it expects (e.g., "response has `threads` array") and throw descriptive errors, not crash on `undefined`.

**Verification**: Test suite includes fixture-based adapter tests for each service. `gwsExec()` logs raw output on parse failure. Version is captured during `arete integration configure`.

---

### Risk 2: Email Triage Quality — Agent Judgement Is Unbounded

**Problem**: The email triage model relies on "agent uses best judgement" for what's important. Without clear heuristics or guardrails, the agent could over-save (workspace bloat, noise) or under-save (missing critical customer threads). Different LLM runs may produce inconsistent triage decisions for the same inbox. This is the hardest part of the entire plan — and it's hand-waved as "best judgement."

**Mitigation**: Define a concrete triage rubric in the `email-triage` skill (not just "use judgement"). Categories: customer-facing threads, threads with known people from `people/`, threads containing action language ("please", "by Friday", "need from you"), decision language ("decided", "agreed", "going with"). Start conservative — save less, notify more. The `email_review: true` config exists as an escape valve. Add a triage summary log so the user can audit what was saved/skipped/notified after each pull.

**Verification**: First 5 email pulls are run with `email_review: true` to calibrate. Triage log exists and is reviewable. Skill definition includes explicit rubric, not just "best judgement."

---

### Risk 3: Two Auth Systems — Google Calendar OAuth vs GWS Auth

**Problem**: After this integration, users will have two separate Google auth paths: the existing Calendar OAuth flow (managed by Arete, tokens in `.credentials/credentials.yaml`) and `gws auth login` (managed by the `gws` binary). These can drift — one expires while the other works, or they authenticate to different Google accounts. This creates confusing failure modes ("Calendar works but Gmail doesn't") and support burden.

**Mitigation**: Phase 0 detection should check which Google account `gws` is authed to and compare with the Calendar integration's account (if configured). Surface a warning during `arete integration configure google-workspace` if accounts don't match. Document clearly that Calendar uses its own auth. In the plan's section 11, the "migrate Calendar to GWS later" option becomes more important — consider promoting it to Phase 2 or 3 rather than "future."

**Verification**: `arete status` shows both Google auth states and flags account mismatches. Integration configure warns on mismatch.

---

### Risk 4: `gwsExec()` as a Shell-Out — Performance and Error Handling

**Problem**: Every GWS operation spawns a child process, waits for the Rust binary to start, make API calls, and serialize JSON to stdout. For single calls (pull calendar) this is fine. But email triage might hit dozens of threads, meeting-prep might query Gmail + Drive + Docs in sequence, and briefing assembly might invoke multiple providers. Cold-start latency of the `gws` binary multiplied by call count could make skills feel sluggish. Also, child process errors (binary not found mid-session, segfault, timeout) need robust handling.

**Mitigation**: Design `gwsExec()` with batch-friendly patterns from the start — prefer single CLI calls that return lists over per-item calls (e.g., `gws gmail list --query "..." --max-results 20` instead of fetching threads one by one). Add a configurable timeout (default 30s) with clear error messages. For briefing assembly, run independent provider calls in parallel (`Promise.all`). Cache detection/auth-status checks per session (don't re-check binary existence on every call).

**Verification**: Briefing assembly uses parallel provider calls. `gwsExec()` has timeout + retry logic. No skill makes more than 3-5 sequential `gws` calls for a single operation.

---

### Risk 5: Conversation Artifact Format Mismatch

**Problem**: The plan says email threads should be stored as conversation artifacts "same format as Slack captures." But email threads have different structure than Slack threads — they have subject lines, CC/BCC, forwarded chains, reply quoting, HTML formatting, and attachment references. Force-fitting into the Slack conversation format may lose important email-specific metadata or produce awkward artifacts.

**Mitigation**: Review the existing conversation artifact format (`packages/core/src/integrations/conversations/types.ts`) before building the Gmail adapter. Identify what needs to extend — likely adding fields like `subject`, `cc`, `attachmentRefs`. The extraction pipeline (summary, decisions, action items) should work as-is since it operates on text content. But the artifact schema may need a `source: 'email' | 'slack' | 'manual'` field to differentiate and enable source-specific rendering.

**Verification**: Read `conversations/types.ts` before implementing Gmail adapter. Artifact type has a `source` discriminator. Email-specific fields (subject, cc) are preserved.

---

### Risk 6: Scope Creep Across Phases

**Problem**: This is a large plan with 4 phases, 5 services, 4 new skills, 4 enhanced skills, 3 config options, scheduled pulls, and attachment handling. The temptation to add "just one more thing" to each phase is high. Phase 1 (Gmail) alone includes: provider interface, adapter, 2 new skills, briefing wiring, meeting-prep enhancement, CLI command, triage model, attachment prompting, and storage config. That's a lot for "medium."

**Mitigation**: Strictly scope Phase 1 to the minimum that delivers email context: `gwsExec()` + `gmail.ts` adapter + `email-triage` skill + `arete pull gmail`. Defer briefing wiring, meeting-prep enhancement, and `email-search` to Phase 1.5 or Phase 2. Attachment handling can also wait — the prompt UX is nice but not essential for v1. Each phase should have no more than 5-6 concrete implementation steps.

**Verification**: Phase 1 PRD has ≤6 tasks. Briefing/meeting-prep wiring is explicitly Phase 1.5. Attachment handling is not in Phase 1.

---

### Risk 7: Email Volume Overwhelm

**Problem**: A PM's inbox can have hundreds of threads per day. Even with `--days 1`, `arete pull gmail` could return 50-200 threads. The triage agent has to evaluate each one, which means LLM calls per thread (or a batch prompt with all threads). This could be slow, expensive (token usage), and produce inconsistent results at scale.

**Mitigation**: Two-stage triage: (1) lightweight filter using Gmail's own search operators via `gws` (e.g., `is:important`, `from:known-people`, `-category:promotions -category:social`) to pre-filter to ~10-30 candidate threads, then (2) agent evaluation on the filtered set. This keeps LLM costs bounded and triage fast. The `--query` flag on `arete pull gmail` already supports this — make sensible defaults.

**Verification**: Default pull uses Gmail search filters to pre-filter. Agent triage operates on ≤30 threads per pull. Token usage per triage is bounded and logged.

---

### Risk 8: Onboarding Friction — GCP Project + Multi-Step OAuth

**Problem**: Setting up `gws` isn't just "install and run." The user has to: (1) create a GCP project, (2) enable APIs, (3) configure an OAuth consent screen, (4) install the CLI, (5) authenticate, (6) approve permissions per service — and repeat the approval step for each new Workspace product. That's 6+ steps before Arete can make a single call. Most PM users won't know what a "GCP project" is. This is the single biggest adoption blocker for the entire integration.

**Mitigation**: `arete integration configure google-workspace` must be a guided wizard that handles as much as possible:
1. Check prerequisites — is `gws` installed? If not, provide install command.
2. GCP project guidance — step-by-step with links, or explore shipping a shared OAuth client (like Calendar's `GOOGLE_CLIENT_ID`) so users skip GCP setup entirely.
3. Batch scope authorization — request all needed scopes upfront in one auth flow, not per-service.
4. Post-auth smoke test — verify each service works and report results.
5. Progressive disclosure — if user only wants Gmail, only request Gmail scopes.

Target flow: install CLI → run `arete integration configure google-workspace` → approve in browser → done. ≤3 manual steps.

**Verification**: End-to-end test on a clean machine. Total user steps ≤3. GCP project setup is either automated or eliminated via shared credentials.

---

## Summary

Total risks identified: **8**
Categories covered: Integration (1, 3, 5), Scope Creep (6), Code Quality (1, 4), Dependencies (3, 8), Platform Issues (4, 8), State Tracking (2, 7)

**Highest-impact risks**:
- #8 (onboarding friction) — if setup is painful, nobody uses the integration
- #2 (triage quality) — if email triage is noisy, users disable it
- #3 (dual auth) — confusing failure modes erode trust
