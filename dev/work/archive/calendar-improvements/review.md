# Review: Calendar FreeBusy Integration

**Type**: Plan (pre-execution)  
**Audience**: Builder ✓ (internal Areté tooling, packages/core and packages/cli)  
**Date**: 2026-02-24

---

## Concerns

### 1. Service Pattern Gap: Missing factory wiring for new service

The plan creates `packages/core/src/services/availability.ts` but doesn't mention:
- Adding import to `factory.ts`
- Adding to `AreteServices` type
- Constructing with dependencies
- Exporting from `services/index.ts`

Per `LEARNINGS.md` pre-edit checklist: "If adding a new service: add it to `factory.ts` (wire dependencies), `services/index.ts` (barrel export), and `AreteServices` type"

**Suggestion**: Either:
- (A) Add explicit AC: "AvailabilityService added to factory.ts and AreteServices type", OR
- (B) Reconsider: availability algorithm is pure (no storage/search needed) — could be `packages/core/src/utils/availability.ts` instead of a service

---

### 2. Working Hours Config Location Undefined

Plan says "configurable in workspace config" but doesn't specify:
- Which config file? (arete.yaml? new config?)
- What's the schema? (`availability.working_hours: { start: "09:00", end: "17:00" }`)
- Does this require config schema changes?

**Suggestion**: Add AC to Step 3 or Step 5: "Working hours read from `arete.yaml` under `availability.working_hours` (optional, default 9-5)"

---

### 3. Dependency Order Still Ambiguous

The parallelization note says "Steps 1-2 || Step 4" but the full dependency graph is:
```
Step 1 ─┐
        ├→ Step 3 ─┐
Step 2 ─┘          ├→ Step 5
Step 4 ────────────┘
```

**Suggestion**: Replace parallelization note with explicit dependencies:
- "Step 3 depends on: 1, 2"
- "Step 5 depends on: 3, 4"

---

### 4. Capability Registry Update Missing

`dev/catalog/capabilities.json` has a google-calendar capability with `readBeforeChange` paths. After this work:
- New entrypoint: `arete availability find`
- New implementation paths: `availability.ts`, `availability.test.ts`

**Suggestion**: Add Step 6 or note: "Update capabilities.json with new entrypoint and paths"

---

### 5. Multiple Calendar Selection Not Addressed

The plan assumes `{ id: 'primary' }` for the user's calendar. But what if user has configured multiple calendars in Google Calendar integration? Current `getUpcomingEvents()` already accepts `options.calendars[]`.

**Suggestion**: Either:
- (A) Note in Out of Scope: "User's secondary calendars not checked for conflicts in v1", OR
- (B) Extend Step 1 AC: "Queries all user-configured calendars, not just primary"

---

## Strengths

- ✅ **Validated early**: FreeBusy API tested with real data before planning
- ✅ **Leverages existing code**: Person resolution via EntityService, calendar auth via existing OAuth
- ✅ **Clear out-of-scope**: No scope creep risk — invite creation, multi-party, preferences all deferred
- ✅ **Error handling thought through**: Pre-mortem Risk 6 covers the "don't throw, return accessible: false" pattern
- ✅ **Pre-mortem done**: 7 risks identified with mitigations

---

## Devil's Advocate

**If this fails, it will be because...** the availability algorithm's timezone handling is wrong. The core value proposition is "find time that works for both." If the algorithm returns slots at 3am because of UTC/local confusion, or misses valid slots because of DST edge cases, users will lose trust immediately. The pre-mortem identified this (Risk 3) but the AC for Step 3 doesn't have an explicit timezone test case.

**The worst outcome would be...** shipping a feature that returns confidently wrong suggestions. Unlike a crash (which is obvious), incorrect slot recommendations could lead users to propose meetings at times that don't actually work — damaging relationships and making Areté look broken. The failure mode is subtle: the algorithm runs, returns results, but they're wrong.

---

## Recommendations

1. **Add explicit timezone test case to Step 3 AC**: "Unit test covers: user in PST, target in EST, both with 9am meetings — asserts no overlap"

2. **Clarify service vs utility pattern**: Step 3 should state whether availability is a full service (needs factory wiring) or a pure utility (just an algorithm module)

3. **Add Step 6 for capability registry update** or note it as post-execution task

4. **Specify working hours config schema** before implementation starts

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

The plan is solid and well-researched. The concerns are mostly clarifications rather than blockers. Address the service/utility pattern question and timezone test AC before building, and the rest can be handled during implementation.
