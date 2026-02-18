# Areté Test Scenarios

This workspace was seeded with fixture data for **end-product workflow testing**.

Use the prompts/commands below to validate that Areté surfaces the **right context and intelligence**, not just that commands run.

## Assertion Style

Prefer semantic checks over exact prose:

- ✅ Check entity/thread/action signals
- ✅ Check key files/sources referenced
- ❌ Avoid asserting entire markdown blocks verbatim

---

## Scenario Matrix

| Scenario | Prompt / Command | What to Assert |
|---|---|---|
| Brief for customer call | `arete brief --for "prep for call with Bob Buyer" --json` | Includes Bob Buyer signal, Acme Corp/customer thread signal, and at least one action/context item relevant to onboarding/renewal |
| Onboarding context | `arete context --for "onboarding discovery" --json` | Returns onboarding-related files from projects/context/resources and confidence is set |
| Context inventory freshness | `arete context --inventory --json` | Returns non-zero file inventory and includes freshness metadata with stale/fresh differentiation |
| Memory search | `arete memory search "onboarding" --json` | Returns onboarding-related items (decisions and/or learnings) with expected source/type signals |
| Memory timeline arc | `arete memory timeline "onboarding" --json` | Returns dated timeline items and recurring themes for onboarding thread |
| Resolve ambiguous person | `arete resolve "Alex" --json` | Resolves to expected Alex person candidate (e.g., `alex-eng`) with non-null result |
| Show person context | `arete people show jane-doe --json` | Returns Jane profile with expected category and relationship context |
| Refresh person memory | `arete people memory refresh --json` | Reports scanned/update counts and succeeds without errors |

---

## Conversational Workflow Checks

### Meeting Prep
- "Prep for my meeting with Jane Doe"
- "Meeting prep for Product Review"
- "I have a call with Bob Buyer in 30 minutes — prep me"

**Expected signals**
- Correct attendee identity/context
- Recent relevant meetings surfaced
- Related project thread surfaced
- Action-oriented prep points

### Daily Plan
- "What's on my plate today?"
- "Daily plan"

Then supply: "Today I have: Product Review with Jane and Alex; Customer call with Bob Buyer."

**Expected signals**
- Priorities linked to weekly goals
- Per-meeting context (who, status, prep focus)
- Carry-over commitments/action reminders

### Process Meetings
- "Process my meetings"
- "Update people from meetings"
- "Extract decisions from my meetings"

**Expected signals**
- Person files updated with new context
- Meetings include attendee IDs
- Candidate decisions/learnings generated for review

---

## CLI Quick Checks

```bash
arete people list --json
arete people show jane-doe --json
arete people index --json
arete memory search "onboarding" --json
arete memory timeline "onboarding" --json
arete resolve "Alex" --json
arete context --inventory --json
```

---

## Notes

- This seeded corpus validates **PM/builder product behavior**.
- Developer automation should mirror this scenario via `packages/core/test/fixtures/` to keep parity.
