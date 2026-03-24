# Review: Meeting Processing Improvements

**Type**: Plan (pre-execution)  
**Audience**: Builder (internal Areté development)

---

## Concerns

### 1. **Scope / Type Mismatch** (HIGH)
The plan says "import `extractMeetingIntelligence()` and call it" — but there's a structural mismatch between what the extraction service returns and what the backend/frontend expect:

| Field | `ActionItem` (extraction) | `StagedItem` (backend/frontend) |
|-------|---------------------------|--------------------------------|
| owner | ✅ `owner`, `ownerSlug` | ❌ Not present |
| direction | ✅ `i_owe_them` / `they_owe_me` | ❌ Not present |
| counterparty | ✅ `counterpartySlug` | ❌ Not present |
| confidence | ✅ Present | ✅ Present |
| text | `description` | `text` |

**The plan assumes wiring is simple, but it requires type evolution or a mapping layer.**

- **Suggestion**: Add a task to extend `StagedItem` type with `owner?`, `ownerSlug?`, `direction?`, `counterpartySlug?` — or clarify that these fields will be stored differently.

### 2. **Frontend Not Addressed** (MEDIUM)
The plan mentions "Verify frontend (ReviewItems.tsx) handles new fields gracefully" as a sub-task, but:
- Current ReviewItems.tsx doesn't display owner, direction, or counterparty
- If we're adding these fields, users should see them (otherwise why add them?)

**Displaying owner/direction in the UI would be valuable.** Without it, the work is invisible to users.

- **Suggestion**: Either (a) add explicit AC for "owner/counterparty displayed in ReviewItems.tsx" or (b) clarify this is deferred and state why.

### 3. **Completeness / Missing Mapping** (MEDIUM)
The `extractMeetingIntelligence()` function returns `MeetingIntelligence` with `actionItems: ActionItem[]`, but the backend currently works with `StagedSections { actionItems: StagedItem[] }`. 

Someone needs to write the mapping logic:
```typescript
// ActionItem → StagedItem conversion
const stagedItem: StagedItem = {
  id: generateId(),
  text: actionItem.description,
  type: 'ai',
  source: 'ai',
  confidence: actionItem.confidence,
  // NEW fields needed:
  ownerSlug: actionItem.ownerSlug,
  direction: actionItem.direction,
};
```

- **Suggestion**: Add explicit task "Create ActionItem → StagedItem mapping function" or note this is trivial and will be done inline.

### 4. **Patterns** (LOW)
The plan follows existing patterns (using core services from backend). No unnecessary novelty introduced. ✅

### 5. **Multi-IDE** (N/A)
This doesn't touch `runtime/`, `.agents/sources/`, or multi-IDE content. ✅

### 6. **Backward Compatibility** (LOW RISK)
New fields will be optional in StagedItem. Existing meetings should continue to work. ✅

---

## Strengths

- **Clear problem statement**: Well-articulated gap (CLI vs Web UI quality disparity)
- **Excellent due diligence**: The engineering audit and commit review (38be75e) showed thorough investigation
- **Right-sized scope**: Correctly identified that most work is done — only wiring remains
- **Good risk identification**: Existing risks section covers the main technical concerns
- **Clear success metrics**: Parity and attribution metrics are measurable

---

## Devil's Advocate

**If this fails, it will be because...**
The type mismatch between `ActionItem` and `StagedItem` is more complex than anticipated. Either:
1. Extending `StagedItem` requires touching many files (backend types, frontend types, API layer)
2. Or someone decides to "just add the mapping" but loses the owner/direction data in the process, defeating the purpose

**The worst outcome would be...**
We wire the extraction service but don't extend the types properly, resulting in:
- Extraction produces owner/direction data
- Backend discards it during mapping
- Frontend shows same quality as before
- The work ships but provides no user-visible improvement

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

### Recommended Changes

1. **Clarify type evolution**: Add a note that `StagedItem` will be extended with owner/direction fields, or explain the alternative approach
2. **Address frontend display**: Either add AC for UI display of owner/direction, or explicitly defer it with reasoning
3. **Consider splitting**: If type evolution is non-trivial, consider a 2-step approach:
   - Step 1a: Wire extraction (with confidence, validation filters)
   - Step 1b: Add owner/direction support (type + UI)

The plan is fundamentally sound and well-researched. The concerns are about completeness of the implementation path, not the approach itself.
