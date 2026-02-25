# Review: Calendar Events Plan

**Type**: Plan (pre-execution)  
**Audience**: User (end-user functionality for PMs using Areté)

---

## Concerns

### 1. **Scope: Skill Complexity vs. MVP**

The skill workflow has 8 steps with conditional branching (description drafts, agenda creation, context search). This is ambitious for v1.

**Suggestion**: Consider splitting into phases:
- **v1**: Book meeting (person → availability → pick slot → create event). Single round-trip. No description/agenda offers.
- **v1.1**: Add description drafting, agenda creation, context search

This reduces risk of Harvester friction (your primary persona) and delivers value faster.

---

### 2. **Dependencies: Task 5 (Tests) is Under-Specified**

Task 5 says "skill tests if applicable" but the skill is the most complex piece. Without clear test guidance:
- No clarity on whether skill routing tests are required
- No mention of end-to-end testing for the conversational flow

**Suggestion**: Either:
- Explicitly scope out skill tests for v1 (just test CLI + core API)
- Or add specific skill test AC: "Routing tests verify triggers match schedule-meeting skill"

---

### 3. **Patterns: Response Format is Novel**

The "A, 1, 2" response format is not used anywhere else in Areté. This introduces:
- Learning curve for users
- Parsing complexity for the skill
- Risk of inconsistency if other skills adopt different patterns

**Suggestion**: Document this as a **design pattern** if successful, or consider using more conventional formats:
- Just slot letters ("A", "B", "C") for v1
- Follow-up question for description/agenda if user wants them

---

### 4. **Catalog: New Capability Not Registered**

This plan creates a new capability (schedule-meeting skill, calendar event creation) but doesn't mention updating `dev/catalog/capabilities.json`.

**Suggestion**: Add to Task 4 AC:
- [ ] `dev/catalog/capabilities.json` updated with new `schedule-meeting` capability entry

---

### 5. **Completeness: CLI Command Registration Missing**

Task 2 creates `packages/cli/src/commands/calendar.ts` but doesn't mention:
- How the command is registered with the main CLI
- Whether it's a subcommand of `arete calendar` or new top-level

**Suggestion**: Clarify in Task 2:
- "Register `calendar create` as subcommand under existing calendar namespace"
- Or "Create new `calendar` command group with `create` subcommand"

Check `packages/cli/src/index.ts` for registration pattern.

---

### 6. **Backward Compatibility: Existing `availability` Command**

The plan adds `arete calendar create` but the existing command is `arete availability find`. These feel disconnected:
- `availability find` → `calendar create` (different namespaces)
- User flow is: find availability → create event, but commands aren't linked

**Suggestion**: Consider:
- Adding `--book` flag to `availability find` that creates the event directly
- Or documenting the workflow clearly: "Use `availability find` first, then `calendar create`"

---

## Strengths

- **Pre-mortem is thorough** — 8 risks identified with specific mitigations. High-severity risks (timezone, context gaps) have concrete solutions.
- **Persona Council done** — Clear decision matrix for what's required vs. optional.
- **Out of scope is explicit** — Recurring events, multi-attendee, editing all deferred. Clean boundaries.
- **Dependencies are clear** — Task ordering diagram shows blocking relationships.
- **UX flow is well-designed** — The slot + optional offers format is user-friendly if it works.

---

## Devil's Advocate

**If this fails, it will be because...** the skill UX is too ambitious for v1. The 8-step workflow with conditional branches (context search, description drafting, agenda creation) has many failure modes. If any step breaks or feels clunky, the Harvester persona — your most important user — will abandon it. The "A, 1, 2" response format is clever but untested. One broken parsing case and trust is lost.

**The worst outcome would be...** shipping a skill that works in demos but fails in real use. User says "book meeting with John about Q3 planning" → context search finds nothing → description draft is generic → agenda is boilerplate → user manually edits everything anyway. The skill becomes overhead, not help. Meanwhile, you've invested in 5 tasks of infrastructure for something users work around.

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

### Recommended Changes Before PRD Conversion

1. **Consider phased delivery** — v1 without description/agenda offers; add in v1.1
2. **Add capability registry update** to Task 4
3. **Clarify CLI command registration** in Task 2
4. **Specify skill test scope** in Task 5 (in or out?)

These are suggestions, not blockers. The plan is solid and the pre-mortem covers technical risks well. The main risk is UX complexity — consider whether the full workflow is needed for v1.
