# User Feedback & Privacy-First Telemetry

**Status**: Backlog  
**Priority**: Medium  
**Type**: Feature

---

## Summary

Add privacy-first mechanisms to collect user feedback and lightweight product signals from Areté users.

Use a two-lane model:
1. **Explicit feedback** (manual, user-approved)
2. **Opt-in anonymous telemetry** (aggregate product usage, no content by default)

## Why

Areté needs a direct way to learn from real users:
- what works,
- where friction appears,
- what features/integrations users request,
- how often core features are actually used.

This should be done in a way that reinforces trust and user agency.

## Goals

1. Capture actionable qualitative feedback from CLI and agent chat.
2. Collect minimal quantitative usage metrics (opt-in only).
3. Keep privacy controls explicit, transparent, and easy to manage.
4. Enable lightweight user interviews through guided agent flows.

## Key Deliverables

### 1) `arete feedback` command
- `arete feedback` starts a quick feedback flow
- Options:
  - open external form (Google Form)
  - submit via Areté endpoint/proxy
- Include optional metadata (version, active skill, command context)
- Always show preview + require confirmation before submit

### 2) In-chat feedback capture
- User can say “send this as feedback” during chat
- Agent prepares a submission draft
- User confirms before sending

### 3) Post-outcome micro prompts
- Optional 1–5 rating prompt after key milestones (e.g., PRD completion)
- Optional short free-text note
- Throttle prompts so they do not become noisy

### 4) Request categories
- Structured tags for:
  - bug/friction
  - feature request
  - integration request
  - overall satisfaction

### 5) Opt-in telemetry
- Consent levels:
  - `off`
  - `feedback-only`
  - `anonymous-metrics`
  - `research-mode`
- Example events:
  - daily active usage proxy (e.g., 2+ commands/day)
  - feature enabled/used (calendar, fathom, etc.)
- No raw chat/task content in anonymous mode

### 6) User research mode
- Agent runs a guided interview script
- Summarizes results for user review
- User explicitly approves submission

## Privacy Requirements (Non-Negotiable)

- Telemetry defaults to **OFF**.
- Explicit opt-in required for each non-manual collection mode.
- Preview-before-send for all feedback submissions.
- Clear controls to inspect/delete local queued data.
- No upload of user content without explicit approval.

## Suggested Architecture (Initial)

- Local queue: `.arete/feedback/queue.jsonl`
- Feedback service module:
  - schema validation
  - lightweight redaction pass
  - retry + backoff for failed sends
- Transport:
  - Google Form webhook/proxy (initial)
  - future dedicated endpoint
- Config:
  - `.arete/config.yml` privacy/telemetry section

## Success Signals

- Feedback submission rate
- CSAT trend (1–5)
- Opt-in conversion by consent tier
- Feature request volume by category
- Telemetry coverage for key feature usage

## Risks & Mitigations

- **Trust erosion if unclear**  
  Mitigation: transparent prompts, explicit consent, preview + delete controls.

- **Low signal / sparse responses**  
  Mitigation: trigger feedback only at meaningful moments, keep prompts short.

- **Prompt fatigue**  
  Mitigation: throttling and user-level frequency settings.

- **PII leakage risk**  
  Mitigation: default minimal payloads, redaction pass, strict schema.

## Estimated Scope

- Phase 1 (feedback command + chat submission): Small (2–3 tasks)
- Phase 2 (post-outcome ratings + categories): Small (2–3 tasks)
- Phase 3 (telemetry consent + anonymous metrics): Medium (3–5 tasks)
- Phase 4 (research interview mode): Medium (3–5 tasks)

## Open Questions

1. Google Forms directly vs proxy endpoint first?
2. What exact metadata is safe/useful by default?
3. Should workspace/org admins be able to enforce telemetry policy?
4. What retention policy applies to local queue + remote submissions?

## Related

- `dev/backlog/features/workflow-patterns.md`
- `dev/backlog/features/preference-model.md`
- `dev/backlog/features/people-intelligence.md`
