# Cross-Model Review: Workspace Hygiene

## Verdict: READY

No structural blockers. Two concerns flagged for implementation.

## Strengths

- Delegation architecture is correct — HygieneService coordinates, owning services do mutations
- Two-phase scan/apply with 1-hour staleness check is well-suited
- `purgeResolved()` design is clean — double-pruning is a non-issue (shouldPrune is idempotent)
- Factory wiring is straightforward — 5-line addition

## Concerns

### Concern 1 (MEDIUM → HIGH): Learnings use bullet-list format, not heading-sections

`learnings.md` uses `- YYYY-MM-DD: text` bullets. `compactDecisions()` uses `parseMemorySections()` which matches `^#{2,3}\s+` headings. Applied to learnings.md, it finds 0 sections — nothing gets compacted.

**Action**: Task 3 needs a dedicated bullet-list parser for `compactLearnings()`. Do NOT share the `compactMemoryFile()` helper as planned. Keep `compactDecisions()` and `compactLearnings()` as independent methods.

### Concern 2 (LOW): Meeting archival has no owning service

Plan says "delegates to owning services" but there's no `MeetingService.archive()`. HygieneService does meeting archival I/O itself via StorageAdapter. Document this explicitly so implementers don't look for a non-existent delegate.

## Suggestions

- Specify the activity log path explicitly (`.arete/activity/activity-log.md`)
- Rename/drop the shared `compactMemoryFile()` helper — the two formats are too different
- Document that meeting archival is direct I/O in HygieneService, not delegated

## Risk Assessment

Agree with 0 CRITICAL. Upgrade Risk 3 (learnings structure) from MEDIUM to HIGH given the format discovery. All other ratings hold.
