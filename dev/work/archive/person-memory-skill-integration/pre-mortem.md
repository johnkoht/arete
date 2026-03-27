# Pre-Mortem: Person Memory Skill Integration

## Failure Scenario

Three weeks after rollout, builders report that meeting prep feels slower and occasionally irrelevant. Person memory callouts are noisy, meeting selection is inconsistent, and daily/weekly outputs became bloated.

## Key Risks and Mitigations

### 1) Stale detection is wrong (false stale / false fresh)
- **Risk**: Refresh runs too often (latency) or not often enough (stale context).
- **Mitigation**:
  - Parse `Last refreshed` from auto section only.
  - Define explicit freshness window (e.g., 3 days for prep, 7 days for week planning).
  - If timestamp missing/unparseable, treat as stale.
- **Verification**: unit tests for fresh/stale boundary and malformed timestamps.

### 2) Refresh latency hurts UX
- **Risk**: `meeting-prep` pauses noticeably when scanning many meetings.
- **Mitigation**:
  - Targeted refresh by attendee slug only.
  - Limit meeting scan window (e.g., last 90 days) for prep refresh path.
  - Ask user before expensive refresh (many attendees or broad date range).
  - Fail-open with existing memory if refresh times out/errors.
- **Verification**: integration test for fallback behavior and user messaging.

### 3) Memory callouts are noisy or low confidence
- **Risk**: False positives reduce trust.
- **Mitigation**:
  - Keep conservative extraction patterns.
  - Maintain minimum mention threshold (default 2).
  - Include evidence (count + last date + sources).
- **Verification**: regression tests with mixed signal/noise transcripts.

### 4) Calendar meeting selection is brittle
- **Risk**: Ambiguous prep requests still confuse flow or fail without calendar integration.
- **Mitigation**:
  - Use calendar selection only when meeting identity is ambiguous.
  - Always provide fallback prompt for manual title/attendees.
  - Keep behavior identical when calendar not configured.
- **Verification**: tests for both configured and non-configured calendar paths.

### 5) Daily/week plans become verbose
- **Risk**: Added person memory overwhelms planning outputs.
- **Mitigation**:
  - Daily: max 1 concise watchout per meeting.
  - Weekly: aggregate into short “Stakeholder watchouts this week” section.
  - Avoid per-person dumps unless user asks.
- **Verification**: output-format tests enforcing concise sections.

### 6) Skill/doc drift
- **Risk**: implemented behavior diverges from skill instructions.
- **Mitigation**:
  - Update SKILL.md files and GUIDE in same change set.
  - Add tests that reflect documented behavior.
- **Verification**: checklist item in final verification.

### 7) Backward compatibility regressions
- **Risk**: Existing prep/agenda behavior breaks for users who don’t use person memory.
- **Mitigation**:
  - Additive logic only.
  - Memory unavailable path must degrade gracefully.
- **Verification**: existing tests + targeted no-memory scenario tests.

## Go/No-Go Criteria

Proceed only if:
1. Fresh/stale logic is deterministic and tested.
2. Meeting-prep remains usable when refresh fails.
3. Calendar-selection fallback is robust.
4. Daily/week output remains concise.
