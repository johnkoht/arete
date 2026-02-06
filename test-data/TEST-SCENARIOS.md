# Areté Test Scenarios

This workspace was seeded with test data. Use these prompts and skills to try out Areté.

## Meeting Intelligence

### Meeting Prep
- "Prep for my meeting with Jane Doe"
- "Meeting prep for Product Review"
- "I have a call with Bob Buyer in 30 minutes — prep me"

**Expected**: Brief with attendee details, recent meetings (1–3), related projects, open action items, suggested talking points.

### Daily Plan
- "What's on my plate today?"
- "Daily plan"

Then supply: "Today I have: Product Review with Jane and Alex; Customer call with Bob Buyer."
**Expected**: Today's focus from week priorities, per-meeting context (who, what you owe, prep suggestion), commitments due, carry-over.

## People & Meetings

### Process Meetings
- "Process my meetings"
- "Update people from meetings"
- "Extract decisions from my meetings"

**Expected**: Person files created/updated; attendee_ids written to meetings; candidate decisions/learnings for review.

### People CLI
```bash
arete people list
arete people show jane-doe
arete people index
```

## Planning

### Quarter / Week
- "Set quarter goals" (quarter-plan)
- "Plan the week" (week-plan)
- "Review the week" (week-review)
- "View goals alignment" (goals-alignment)

**Expected**: Files in resources/plans/ created or updated.

## Projects & Memory

- Start discovery: "I need to understand the onboarding drop-off problem"
- Synthesize: Use synthesize skill with onboarding-discovery project inputs
- Check status: `arete status`
