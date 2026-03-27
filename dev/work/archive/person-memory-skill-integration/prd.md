# PRD: Person Memory Skill Integration

**Status**: Draft for review  
**Plan**: `dev/plans/person-memory-skill-integration/plan.md`

## 1. Problem

Person memory highlights exist, but planning/prep workflows do not consistently ensure freshness or use them with the right UX. Builders need reliable “what this person repeatedly asks/cares about” context during prep, agenda creation, and planning.

## 2. Goals

1. Add lazy, stale-aware person memory refresh to key workflows.
2. Improve meeting-prep UX with optional calendar meeting selection when intent is ambiguous.
3. Surface concise stakeholder watchouts in daily/weekly planning.
4. Preserve backward compatibility and fail-open behavior.

## 3. Non-Goals

- Full topic graph implementation
- New autonomous behavior levels
- Person profile schema overhaul beyond existing auto section

## 4. User Stories

- As a builder, when I ask “prep me for my meeting with Jay,” I get fresh person-specific highlights without extra manual commands.
- As a builder, when I ask for prep but don’t name attendees clearly, I can choose from today’s calendar meetings.
- As a builder, my daily plan includes concise stakeholder watchouts per meeting.
- As a builder, my week plan includes an aggregate summary of likely stakeholder concerns.

## 5. Scope and Tasks

### Task A — Meeting-prep lazy refresh + stale policy
- Add freshness evaluation for attendee memory highlights.
- If stale/missing, run targeted `refreshPersonMemory` for attendees only.
- Add refresh messaging in output (refreshed / reused / failed-open).

**Acceptance Criteria**
- Fresh highlights are used when available.
- Stale/missing highlights trigger targeted refresh.
- Errors do not block prep.

### Task B — Meeting-prep calendar selection UX
- When meeting identity is ambiguous, offer meeting selection from calendar (`arete pull calendar --today --json`, with optional day window fallback).
- On selection, resolve attendees and continue normal prep.
- If no calendar, fallback to explicit prompt.

**Acceptance Criteria**
- Ambiguous requests trigger selection flow when possible.
- Non-calendar environments continue working.

### Task C — Prepare-meeting-agenda conditional integration
- Refresh/use person memory only when attendees are known.
- Skip refresh for attendee-unknown template-only cases.

**Acceptance Criteria**
- No performance regression for attendee-unknown agenda flows.
- Attendee-known flows include memory-informed callouts.

### Task D — Daily-plan lightweight integration
- For today’s meetings, perform stale-aware targeted refresh as needed.
- Add one concise watchout per meeting when available.

**Acceptance Criteria**
- Daily output remains concise and useful.

### Task E — Week-plan summary integration
- Aggregate recurring stakeholder concerns for week meetings.
- Add compact “Stakeholder watchouts this week” section.

**Acceptance Criteria**
- Strategic tone preserved; no per-person verbosity by default.

### Task F — Tests + docs + verification
- Add/extend tests for stale logic, selection flow, conditional agenda behavior, daily/week output.
- Update SKILL docs and GUIDE.
- Run quality gates.

**Acceptance Criteria**
- `npm run typecheck` passes.
- `npm test` passes.
- Existing prep/agenda behavior remains backward compatible.

## 6. Technical Notes

- Use existing `EntityService.refreshPersonMemory()` and person auto section markers.
- Keep refresh scope narrow (resolved attendees only).
- Apply explicit freshness windows by skill context:
  - meeting-prep: short window (e.g., 3 days)
  - daily-plan: short window (e.g., 3 days)
  - week-plan: longer window (e.g., 7 days)
- Fail-open policy for all refresh paths.

## 7. Risks

- Latency from refresh scans
- Noise in extracted concerns
- Calendar dependency variability
- Output verbosity creep

(See `pre-mortem.md` for detailed mitigations.)

## 8. Success Metrics

- Prep flows include person memory callouts for relevant attendees.
- No increase in hard failures for prep/agenda/daily/week workflows.
- Daily/week outputs remain concise while adding stakeholder signal.
