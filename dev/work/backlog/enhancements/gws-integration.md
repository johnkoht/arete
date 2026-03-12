# Google Workspace CLI Integration

**Status**: On hold  
**Priority**: Low (revisit when user base expands)  
**Added**: 2026-03-11

## Summary

Integrate with [googleworkspace/cli](https://github.com/googleworkspace/cli) (`gws`) to expand Areté's integration surface beyond Calendar.

## What is gws?

- **Unified CLI for all Google Workspace APIs** — Drive, Gmail, Calendar, Docs, Sheets, People, Meet
- **Dynamic command surface** — reads Google's Discovery Service at runtime, auto-discovers new APIs
- **Structured JSON output** — ideal for agent consumption
- **40+ agent skills included** — meeting-prep, email triage, file workflows
- **Rust binary** — fast, pre-built for macOS/Linux/Windows

## Opportunity

Areté currently has Google Calendar integration. gws opens up:

| Integration | PM Value |
|-------------|----------|
| **Gmail** | Customer threads, stakeholder comms, decision history |
| **Drive** | Meeting attachments, PRDs, linked docs for prep |
| **Docs** | PRD content, meeting notes, specs in context |
| **Sheets** | Roadmaps, tracking sheets, OKR data |
| **People** | Enrich `people/` with Google Contacts/Directory |

## Implementation Approach

1. **Detection**: Add `gws` binary detection (like `ical-buddy`)
2. **Adapters**: Create thin adapters calling `gws <service> ... --format json`
3. **Gmail first**: Email context in briefings via `gws gmail +triage`
4. **Drive/Docs**: Meeting-linked docs, PRD content extraction
5. **Tool exposure**: Optional tool for agent ad-hoc queries

## Why On Hold

- Current user (builder) uses Notion and Slack heavily, not Google Docs/Gmail
- Calendar integration already works via existing code
- Prioritize Slack integration over gws expansion

## When to Revisit

- When onboarding users who are heavy Google Workspace users
- When Slack integration is complete
- When expanding beyond solo PM use case

## References

- Repo: https://github.com/googleworkspace/cli
- Skills: `gws-calendar`, `gws-gmail`, `gws-drive`, `gws-docs`, `gws-workflow-meeting-prep`
- Existing Calendar code: `packages/core/src/integrations/calendar/google-calendar.ts`
