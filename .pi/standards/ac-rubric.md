# Acceptance Criteria Validation Rubric

> Canonical reference for validating ACs in plans, PRDs, and reviews.
> Referenced by: review-plan, plan-to-prd, execute-prd (reviewer), hotfix.

---

## The Rubric (Mechanical Checklist)

For each AC, verify:

- [ ] **Independently verifiable**: Can this criterion be checked without checking other criteria?
- [ ] **Specific**: Does it state exactly what must be true, not a vague direction?
- [ ] **Testable**: Could you write a test or verification step for this?
- [ ] **Single concern**: Does it test one thing, not multiple things combined?
- [ ] **No vague language**: Free of anti-pattern phrases (see below)?

## Anti-Pattern Phrases to Flag

| Phrase | Problem | Better Alternative |
|--------|---------|-------------------|
| "should work" | Untestable | "returns success response with status 200" |
| "properly handles" | Vague | "returns error message when input is null" |
| "as expected" | Undefined expectation | "matches the format defined in schema.ts" |
| "is correct" | No verification criteria | "equals the value from config.yaml" |
| "appropriately" | Subjective | "within 100ms" or "following pattern from X" |
| "etc." | Incomplete | List all cases explicitly |
| "and/or" | Ambiguous scope | Split into separate criteria |

## Good vs Bad Examples

| Bad AC | Why It's Bad | Good AC |
|--------|--------------|---------|
| "Authentication works properly" | Vague, untestable | "User with valid token receives 200; invalid token receives 401" |
| "Handles edge cases" | No specific cases | "Returns empty array when no results; returns error when query is malformed" |
| "Performance is acceptable" | Subjective | "Response time < 200ms for 95th percentile" |
| "Form validates input correctly" | Multiple concerns | "Email field rejects invalid format"; "Required fields show error when empty" |
| "Data is saved as expected" | Undefined expectation | "Record appears in database with all fields matching input" |
| "Error handling is implemented" | No specifics | "Network errors display user-friendly message and log to console" |

## Documentation-Only Exception

For tasks that only modify documentation (markdown, comments, README):
- Test coverage is NOT required
- AC should focus on content accuracy, completeness, and correct file locations
