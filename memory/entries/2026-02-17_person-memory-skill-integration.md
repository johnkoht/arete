# Person Memory Skill Integration

## Summary

Executed medium plan to integrate person-memory behavior into prep/planning workflows and add stale-aware refresh controls.

## What changed

- Added stale-aware refresh option to person memory service:
  - `RefreshPersonMemoryOptions.ifStaleDays`
  - `RefreshPersonMemoryResult.skippedFresh`
- Added parsing of `Last refreshed` from auto person-memory section.
- Added stale-check logic so refresh can skip fresh profiles.

- Extended CLI command:
  - `arete people memory refresh --if-stale-days N`
  - JSON and human outputs include `skippedFresh`.

- Updated skill guidance to actually leverage this in workflows:
  - `meeting-prep`: ambiguous meeting → calendar selection prompt path; attendee-scoped stale-aware refresh (3-day default guidance)
  - `prepare-meeting-agenda`: conditional refresh only when attendees are known
  - `daily-plan`: per-meeting stale-aware refresh + concise watchout
  - `week-plan`: summary-level watchouts with longer refresh window guidance (7 days)
  - `PATTERNS.md`: stale-aware usage pattern documented

- Updated docs/sources:
  - `packages/runtime/GUIDE.md`
  - `.agents/sources/guide/intelligence.md`
  - `.agents/sources/shared/cli-commands.md`
  - Rebuilt `AGENTS.md`

## Tests

- Added/updated tests:
  - `packages/core/test/services/person-memory.test.ts`
  - `packages/cli/test/commands/people.test.ts`
- Verified quality gates:
  - `npm run typecheck`
  - `npm test`
  - `npm run build:agents:dev`

## Learnings

- Skill-level behavior changes are high-leverage for Areté because runtime skills are operational instructions for agents.
- Stale-aware refresh is a good compromise between freshness and latency; adding `skippedFresh` improves transparency and debuggability.
- Weekly planning needs aggregated signal, not per-person detail dumps, to preserve planning quality.
