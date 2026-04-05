## Review: Google Workspace CLI Integration

**Type**: Plan
**Audience**: Builder (Areté development) + User (end-user integration)
**Review Path**: Full
**Complexity**: Large (4 phases, 5+ services, multiple packages touched)

### Concerns Identified & Resolution

All 7 concerns were addressed and incorporated into the plan:

| # | Concern | Resolution |
|---|---|---|
| 1 | Provider interfaces missing factory pattern / DI | Added factory function signatures + `Provider \| null` pattern matching `getCalendarProvider()` |
| 2 | `createServices()` wiring not addressed | Added `AreteServices.gws` type definition + integration points for Intelligence/Entity/Context services |
| 3 | `ConversationProvenance.source` hardcoded to `'manual'` | Added Phase 1a step to extend to `'manual' \| 'email' \| 'slack'` |
| 4 | No test strategy for Phases 1-3 | Added per-phase test expectations + dedicated Testing Strategy section (§16) with fixture-based approach |
| 5 | `auth.type: 'external'` doesn't exist in type system | Changed to `'none'` with instructions — Areté detects auth status but doesn't manage it |
| 6 | Phase 1 scope too large | Split into Phase 1a (Gmail core + pull) and Phase 1b (intelligence wiring) |
| 7 | Attachment storage location unclear | Defined: `resources/conversations/{slug}/` directory per conversation |

### Strengths

- GWS CLI as backend is the right call — avoids per-service OAuth + API clients
- Phased approach with evidence-based gates
- Email triage model with three-action framework (save/task/notify)
- Clean config design (email_storage, email_review, email_attachments)
- Conversation artifact reuse from Slack capture pattern
- Thorough pre-mortem (8 risks)

### Devil's Advocate

**If this fails, it will be because...** `gws` is a leaky abstraction. The entire integration layer rests on an external binary's JSON output format. Unlike versioned APIs, CLI output is best-effort — fixture tests catch breakage after the fact, not before users hit it.

**The worst outcome would be...** autonomous email triage silently dropping important customer threads. The invisible failure mode (user doesn't know what they're not seeing) could have real business consequences.

### Verdict

- [x] **Approve with suggestions** — all suggestions incorporated into plan

### Post-Review Status

Plan updated with all review feedback. Ready for PRD conversion.
