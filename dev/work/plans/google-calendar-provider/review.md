# Technical Review: Google Calendar Provider Plan

**Reviewer**: Engineering Lead
**Date**: 2026-02-22
**Verdict**: ITERATE — plan has structural issues that will cause regressions and implementation confusion if not addressed before execution.

---

## 1. Technical Risks — What Will Break

### 🔴 CRITICAL: Duplicate `CalendarEvent` Type — Two Incompatible Definitions

This is the biggest landmine in the codebase and the plan doesn't mention it.

There are **two different `CalendarEvent` types** with **incompatible shapes**:

| Field | `ical-buddy.ts` (provider interface) | `models/integrations.ts` (domain model) |
|-------|--------------------------------------|----------------------------------------|
| id | ❌ missing | ✅ `id: string` |
| title | ✅ `title: string` | ✅ `title: string` |
| time | `startTime: Date`, `endTime: Date` | `start: string`, `end: string` |
| attendees | `Array<{name, email?}>` | `string[]` |
| calendar | `calendar: string` | `calendarId?: string` |
| isAllDay | ✅ `isAllDay: boolean` | ❌ missing |
| notes | `notes?: string` | `description?: string` |

**Step 1 says "extract shared calendar types to `types.ts`"** but doesn't address which definition wins. The `models/integrations.ts` version is re-exported from `models/index.ts` and is the "domain model." The `ical-buddy.ts` version is the actual working interface used by `pull.ts`. These are fundamentally different shapes.

**Risk**: A developer extracting types will either:
1. Pick one and break consumers of the other
2. Try to merge them and create a Frankenstein type
3. Not notice the conflict at all and create a third definition

**Recommendation**: The plan MUST specify which `CalendarEvent` is canonical and how to reconcile. The `ical-buddy.ts` version is the one actually used in code paths. The `models/integrations.ts` version appears unused (exported but no consumers I can find). Decision needed before Step 1 starts.

### 🔴 CRITICAL: `pull.ts` Has Hardcoded icalBuddy Error Messages

Lines 127-140 of `pull.ts` in `pullCalendar()`:
```typescript
if (!available) {
  // hardcoded: "icalBuddy not installed"
  // hardcoded: "Run: brew install ical-buddy"
}
```

After Step 5, `getCalendarProvider()` could return a Google provider. But `pullCalendar()` then calls `isAvailable()` AGAIN on the returned provider and if it returns false, shows icalBuddy-specific error messages regardless of which provider was returned. This is a **guaranteed regression** for Google Calendar users.

**The plan doesn't mention touching `pullCalendar()` at all.** Step 5 only mentions the factory and configure command.

**Recommendation**: Step 5 must update `pullCalendar()` to provide provider-appropriate error messages when `isAvailable()` returns false.

### 🟡 HIGH: Producer-Consumer Mismatch Risk (History Repeating)

The LEARNINGS.md explicitly documents that the 2026-02-11 incident was caused by `configure` writing `provider: 'macos'` while `getCalendarProvider()` only accepted `'ical-buddy'`. This exact pattern is about to repeat:

- Step 5 says `configure` will write `provider: 'google'`
- Step 5 says the factory will handle `provider === 'google'`

But what string exactly? `'google'`? `'google-calendar'`? The registry entry in Step 2 is called `'google-calendar'`. If configure writes `'google-calendar'` but factory checks `'google'`, we're back to the 2026-02-11 bug.

**Recommendation**: Nail down the exact string NOW: `'google'` in config, `'google-calendar'` in registry. Document both explicitly. Add a regression test (Step 6) that uses the exact string written by configure.

### 🟡 HIGH: `isAvailable()` Semantics Change

For icalBuddy, `isAvailable()` means "is the binary installed?" — a stable, rarely-changing condition.

For Google Calendar, `isAvailable()` must mean "do we have valid (or refreshable) tokens?" — a condition that changes over time. Token can expire, be revoked, refresh token can be invalidated.

This changes the semantics of the interface. Currently, the factory calls `isAvailable()` and returns `null` if false. For icalBuddy, this is fine — the user needs to install a binary. For Google, returning `null` when a token just needs refreshing would be wrong. The `isAvailable()` check should attempt a token refresh before returning false.

**Recommendation**: Step 4 must explicitly define: `isAvailable()` for Google = "credentials exist AND (token is valid OR token can be refreshed)". If refresh fails, THEN return false.

---

## 2. Architecture Concerns

### Missing: `IntegrationService.getIntegrationStatus()` for Google Calendar

`IntegrationService` has hardcoded `getIntegrationStatus()` methods for `fathom` and `krisp`. There's no handler for `google-calendar`. This means `arete integration list` will never show Google Calendar as `active` even after configuration.

**Where in the plan is this addressed?** Step 2 adds the registry entry, Step 5 updates the factory and configure command, but nobody updates `IntegrationService.getIntegrationStatus()`.

**Recommendation**: Step 5 must add a `google-calendar` case to `getIntegrationStatus()` (similar to the `krisp` case — check for stored credentials).

### Missing: `pullCalendar()` Double-Checks `isAvailable()` Redundantly

The factory already calls `isAvailable()` and returns `null` if false. Then `pullCalendar()` calls `isAvailable()` AGAIN on the returned provider (lines 124-140). For icalBuddy this was harmless. For Google Calendar, this means two potential token refresh attempts.

This is an existing design issue, but the Google provider will make it more expensive.

**Recommendation**: Note this in the plan. Either remove the redundant check in `pullCalendar()` or ensure the Google provider caches the isAvailable result.

### Credential Storage: Namespace Collision Prevention

The plan says credentials go under `google_calendar` key in `.credentials/credentials.yaml`. The Krisp integration uses `krisp` key. Good — but the plan should explicitly confirm the atomic read-modify-write pattern from Krisp's `config.ts`. Copy the exact pattern, don't reinvent it.

### Google OAuth ≠ Krisp OAuth — Different Complexity

The plan says "Follow Krisp patterns from LEARNINGS.md." But:

| Aspect | Krisp | Google |
|--------|-------|--------|
| Client registration | Dynamic (POST to endpoint) | Manual (Cloud Console) |
| Auth endpoint | Custom Krisp URL | `accounts.google.com` |
| Token endpoint | Krisp-specific | `oauth2.googleapis.com` |
| PKCE required? | Yes + client_secret_basic | Optional (recommended) |
| Scopes | Krisp-specific | Google Calendar API scopes |
| Refresh tokens | Standard | May require `access_type=offline` + `prompt=consent` |

The Krisp pattern is a useful *structural* reference (port 0, credential storage, token refresh), but the OAuth details are completely different. Step 3 must not cargo-cult from Krisp.

**Recommendation**: Step 3 should specify Google-specific OAuth details:
- Authorization URL: `https://accounts.google.com/o/oauth2/v2/auth`
- Token URL: `https://oauth2.googleapis.com/token`
- Scopes: `https://www.googleapis.com/auth/calendar.readonly`
- MUST include `access_type=offline` and `prompt=consent` for refresh token
- Client auth: POST body (not Basic auth like Krisp)

---

## 3. Testing Gaps — What We're Not Testing

### Tests the Plan Should Require But Doesn't

| Test | Why |
|------|-----|
| **Token refresh flow** | Most complex part of OAuth; if refresh fails silently, users see "not configured" with no explanation |
| **Token refresh race condition** | Two concurrent calls both see expired token — both try refresh — one fails with "invalid grant" |
| **Expired refresh token** | Google refresh tokens can expire (inactive for 6 months, user revokes, project in testing mode). What error does the user see? |
| **Google API error response mapping** | 403 (calendar not shared), 404 (calendar deleted), 429 (rate limit) — each needs distinct error handling |
| **Calendar list with 0 calendars** | User has Google account but no accessible calendars |
| **Calendar list with 100+ calendars** | Enterprise users can have many calendars; test pagination |
| **All-day event mapping** | Google represents all-day events differently (`date` vs `dateTime`) |
| **Multi-day events** | Google event spanning 3 days — how does it appear in "today"? |
| **Recurring events** | Google returns individual instances — does our query handle this? |
| **Timezone handling** | Google API returns UTC; icalBuddy returns local time. The `CalendarEvent` type uses `Date` objects. Ensure consistent timezone behavior. |
| **Empty attendees vs no attendees field** | Google may return `attendees: []` or omit the field entirely |
| **Configure → Pull round-trip** | The EXACT config written by configure is accepted by the factory (regression test pattern from LEARNINGS.md) |
| **macOS regression** | After all changes, `provider: 'macos'` still works end-to-end |

### Existing Test Weakness

The current calendar tests (`calendar.test.ts`) are **trivially weak** — they only test `getCalendarProvider()` returning `null` or a named provider. There are ZERO tests for actual event parsing, event fetching, or the full pull flow. Step 6 needs to add meaningful tests, not just factory wiring.

---

## 4. Dependency/Ordering Issues

### Current Order (Plan)
1. Extract types → 2. Registry → 3. OAuth → 4. API client → 5. Wire factory + configure → 6. Tests → 7. Error handling + docs

### Problems with This Order

**Problem 1**: Tests are Step 6 — too late. By the time we test, Steps 3-5 are already built without test-driven constraints. We'll discover interface mismatches late.

**Problem 2**: Error handling is Step 7 — too late. OAuth error handling (token refresh, revocation, network failures) isn't a garnish; it's core to the OAuth flow in Step 3. You can't meaningfully implement OAuth without error handling.

**Problem 3**: Steps 3 and 4 should be separate files but tightly coupled (the API client needs auth tokens). The interface between them needs to be defined before either is built.

### Recommended Order

1. **Extract types** (same) — but MUST resolve the duplicate `CalendarEvent` issue first
2. **Registry entry** (same) — low risk, quick
3. **Define Google auth + provider interfaces** — specify the contracts before implementing
4. **Implement OAuth + credential storage** (with tests) — test token exchange, refresh, error cases
5. **Implement Google Calendar API client** (with tests) — test against mocked responses
6. **Wire factory + configure + pullCalendar updates** (with tests) — test round-trip
7. **Error handling hardening + docs** — rate limiting, user-facing errors

Key change: **tests are written alongside each step**, not deferred to Step 6.

---

## 5. Hard Questions — Address Now or Pay Later

### Q1: What happens when Google tokens expire while the user is offline?
The refresh token needs to be exchanged for a new access token. If the user hasn't used Areté in 6+ months and the refresh token is invalidated, what's the recovery path? Silent failure? Error message? Auto-trigger re-auth?

### Q2: Google Cloud project in "Testing" mode — refresh tokens expire in 7 days.
If the user creates a Cloud project and doesn't publish it (which requires verification), refresh tokens expire after 7 days. Users WILL hit this. The plan says "User creates their own Google Cloud project" but doesn't address this footgun. The docs (Step 7) MUST warn about this. Consider: should `isAvailable()` detect this condition and provide actionable guidance?

### Q3: What scopes exactly?
- `calendar.readonly` — reads events but not calendar metadata?
- `calendar.events.readonly` — more granular?
- `calendar.calendarlist.readonly` — needed for calendar list in configure?

The plan says nothing about specific scopes. Wrong scopes = broken functionality after OAuth completes successfully.

### Q4: How does `configure` know which calendars to show?
Step 5 says "calendar list from API, user selects calendars." This requires a working API client (Step 4) AND valid tokens (Step 3). So `configure` must: authenticate → fetch calendar list → present selection → write config. This is a complex multi-step flow. Is it all in the configure command? Or does configure call into the provider?

### Q5: What's the `provider` string in config?
The plan says `provider: 'google'` in one place and `google-calendar` in the registry. Which one goes into `arete.yaml`? Every consumer must agree. Nail this down.

### Q6: Cross-platform?
icalBuddy is macOS-only. Google Calendar is cross-platform. Does the configure command handle the case where the user is on macOS and should choose between providers? Currently, configure hardcodes `provider: 'macos'`. Step 5 mentions "provider selection prompt (macOS vs Google)" — good, but what about non-macOS where there's only one option? Skip the prompt and auto-select Google?

---

## 6. Specific Recommendations

### R1: Resolve `CalendarEvent` Duplication BEFORE Starting
Add a "Step 0" or make Step 1 explicitly handle this. The `models/integrations.ts` `CalendarEvent` appears to be a dead type — verify no consumers, then remove it or reconcile it with the provider interface version.

### R2: Specify Exact Provider Strings in a Table
```
Registry name:     google-calendar
Config provider:   google
Factory match:     provider === 'google'
Credential key:    google_calendar
```
Put this table in the plan. Every step references it.

### R3: Move Tests Inline with Each Step
Do not defer tests to Step 6. Each step must include its own tests. Step 6 becomes "integration tests and round-trip regression tests" only.

### R4: Update `pullCalendar()` in Step 5
`pullCalendar()` has hardcoded icalBuddy error messages and a redundant `isAvailable()` check. Step 5 must update this function to be provider-agnostic.

### R5: Update `IntegrationService.getIntegrationStatus()` in Step 5
Without this, `arete integration list` won't show Google Calendar as active.

### R6: Create a Shared Credential Helper
Krisp has `loadKrispCredentials` / `saveKrispCredentials`. Instead of duplicating this pattern for Google, consider a shared `loadCredentials(storage, root, key)` / `saveCredentials(storage, root, key, data)` helper. Reduces code and enforces atomic write pattern.

### R7: Document the "Testing Mode" 7-Day Token Gotcha
This will be the #1 support issue. Users will configure Google Calendar, it'll work for 7 days, then silently fail. The setup docs must explain: publish your Cloud project OR expect to re-authenticate weekly.

### R8: Add `access_type=offline` and `prompt=consent` to OAuth URL
Without `access_type=offline`, Google doesn't return a refresh token. Without `prompt=consent`, Google may skip consent and not issue a new refresh token on re-auth. These are Google-specific OAuth requirements not present in the Krisp flow.

### R9: Handle `provider: 'google'` in `pullCalendar()` Error Path
Currently if provider returns `null`, the error says "Calendar not configured — run configure." If Google tokens are expired, that's misleading. The error should say "Google Calendar tokens expired — run: arete integration configure google-calendar" (or better: auto-refresh).

### R10: Test macOS Regression Explicitly
Add a test that verifies `provider: 'macos'` config still returns an icalBuddy provider after all changes. This is the most likely regression.

---

## Summary

| Category | Status | Key Issues |
|----------|--------|------------|
| **Type safety** | 🔴 BLOCKED | Duplicate `CalendarEvent` types must be resolved first |
| **Producer-consumer** | 🟡 AT RISK | Provider string not specified; history says this will bite us |
| **Error handling** | 🟡 AT RISK | Deferred to Step 7; should be inline |
| **Testing** | 🟡 AT RISK | Deferred to Step 6; existing tests are trivially weak |
| **`pullCalendar()` regression** | 🔴 BLOCKED | Hardcoded icalBuddy errors not addressed in plan |
| **`IntegrationService` gap** | 🟡 MISSING | `getIntegrationStatus()` for google-calendar not in plan |
| **Krisp pattern applicability** | 🟡 CAUTION | Structural patterns yes; OAuth details completely different |
| **Google-specific gotchas** | 🟡 MISSING | Scopes, testing mode, refresh tokens not specified |

**Bottom line**: The plan's structure is sound — extract types, add registry, implement OAuth, implement provider, wire up, test. But the details have gaps that will cause regressions and implementation confusion. Fix the 🔴 items (duplicate types, pullCalendar hardcoding) and specify the 🟡 items (exact strings, scopes, Google OAuth specifics) before executing.
