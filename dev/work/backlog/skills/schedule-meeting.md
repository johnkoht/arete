# Schedule Meeting Skill

**Status**: Backlog
**Added**: 2026-02-25
**Priority**: Medium

## Problem

Users say "schedule a meeting with X" but nothing routes. The `arete availability find` command exists but:
1. It's a CLI command, not a skill — routing doesn't find it
2. No guided workflow for the full scheduling experience

## Proposed Solution

Create a `schedule-meeting` skill that wraps the availability workflow:

### Triggers
- "schedule a meeting with [person]"
- "find time with [person]"
- "set up a call with [person]"
- "book a meeting"

### Workflow
1. Resolve person from workspace (`people/`) or accept email directly
2. Run `availability find` (or call FreeBusy API directly)
3. Present available slots in a user-friendly format
4. Guide user to create calendar invite (manual step — Areté doesn't have calendar write access)

### Acceptance Criteria
- [ ] Skill routes for scheduling-related queries
- [ ] Resolves person by name or accepts email
- [ ] Shows available slots with duration/days options
- [ ] Clear guidance on next step (create invite manually)
- [ ] Works with Google Calendar (FreeBusy API)

## Notes

- Calendar write access (creating events via API) would be a separate, larger feature
- This skill provides value even without write access by streamlining the "find a time" step

## Related

- `arete availability find` command (packages/cli/src/commands/availability.ts)
- `meeting-prep` skill (different purpose: prep for existing meetings)
- `prepare-meeting-agenda` skill (creates agenda docs, not scheduling)
