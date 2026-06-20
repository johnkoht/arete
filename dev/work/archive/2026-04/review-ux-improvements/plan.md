# Review Page UX Improvements

## Context
The Review page groups items by type (Tasks → Decisions → Learnings → Commitments). User wants: less aggressive green styling on approved items, a fix for "Approve Meeting" approving all meetings, action items visible in review, items grouped by meeting, and area assignment per meeting.

**Important context**: The review page is currently a UI-only triage layer — `POST /api/review/complete` writes a completion file for CLI `--wait` mode but doesn't persist item statuses to meeting files. Actual persistence happens in individual meeting review via `PATCH /api/meetings/:slug/items/:id` and `POST /api/meetings/:slug/approve`. This plan does NOT change that flow — it adds action items and reorganizes the UI within the existing architecture.

## Implementation Order: 1 → 2 → 3 → 4 → 5

---

### 1. Fix green styling on approved items
**File:** `packages/apps/web/src/pages/ReviewPage.tsx`
- Line 117 (TaskItem): Remove `bg-emerald-50/50` and `dark:bg-emerald-950/20`, keep border classes only
- Line 239 (MemoryItem): Same removal — green border stays, background returns to default `bg-card`

### 2. Fix "Approve Meeting" approving all meetings
**File:** `packages/apps/web/src/pages/ReviewPage.tsx`
- Lines 1274-1275: Change `data.decisions` → `items` for both `onApproveAll` and `onSkipAll`
- Lines 1307-1308: Change `data.learnings` → `items` for both `onApproveAll` and `onSkipAll`
- The `items` variable is already available from the `.map()` destructuring on lines 1261 and 1294

### 3. Add action items to review

**Backend** (`packages/apps/backend/src/routes/review.ts`):
- Extend `StagedMemoryItem` type with:
  - `'action_item'` in the type union (line 24)
  - `ownerSlug?: string`, `direction?: 'i_owe_them' | 'they_owe_me'`, `counterpartySlug?: string` — needed to render owner badges like MeetingDetail's ItemCard does
  - `meetingArea?: string` — needed for Change 5
- Add `actionItems: StagedMemoryItem[]` to `PendingReviewResponse` (line 33)
- Add extraction loop for `fullMeeting.stagedSections.actionItems` in GET `/pending` (after line 123), including ownership fields from each `StagedItem`
- Populate `meetingArea` from `fullMeeting.area` on ALL items (decisions, learnings, actionItems)
- Add `actionItems` to response object (line 126)
- Include actionItems in auto-approve-preview pending items count (lines 160-174)

**Frontend types** (`packages/apps/web/src/api/types.ts`):
- Add `'action_item'` to `StagedMemoryItem.type` (line 319)
- Add `ownerSlug?: string`, `direction?: 'i_owe_them' | 'they_owe_me'`, `counterpartySlug?: string`, `meetingArea?: string` to `StagedMemoryItem`
- Add `actionItems: StagedMemoryItem[]` to `PendingReviewResponse` (line 342)

**Frontend page** (`packages/apps/web/src/pages/ReviewPage.tsx`):
- Add action items to `memoryDecisions` initialization, bulk handlers, pending counts, confidence/auto-approve handlers, `collectResults`, and `totalPending`
- Render action items with owner badge pattern from `ReviewItems.tsx` ItemCard (show `@ownerSlug → @counterpartySlug` with direction arrows)

### 4. Reorganize: group by meeting, then by type

**File:** `packages/apps/web/src/pages/ReviewPage.tsx`

Replace separate `decisionsByMeeting` and `learningsByMeeting` maps with one unified map:
```typescript
type MeetingGroupData = {
  title: string; slug: string; area?: string;
  actionItems: StagedMemoryItem[];
  decisions: StagedMemoryItem[];
  learnings: StagedMemoryItem[];
};
const itemsByMeeting = useMemo<Map<string, MeetingGroupData>>(...);
```

Refactor `MeetingGroup` → `MeetingSection` component:
- Meeting title as top-level header with "Approve Meeting" / "Skip Meeting" buttons
- Sub-sections for Action Items, Decisions, Learnings (each rendered only if non-empty)
- Sub-section labels with appropriate icons (ListTodo for action items, Lightbulb for decisions, Brain for learnings)
- Action item cards show owner badges (reuse pattern from `ReviewItems.tsx` ItemCard lines 102-114)

Update JSX: Replace the three separate type-level sections with a single meeting loop. Keep Tasks and Commitments as standalone top-level sections above/below the meeting groups.

Remove per-type bulk handlers (`handleApproveAllDecisions`, etc.) and per-type pending counts. Replace with unified `pendingMemoryCount`.

### 5. Add area assignment per meeting

**Backend** (`packages/apps/backend/src/routes/meetings.ts`):
- Line 165: Widen PUT body type to `{ title?: string; summary?: string; area?: string }` (service `updateMeeting` already handles `area`)

**Frontend API** (`packages/apps/web/src/api/meetings.ts`):
- Add `updateMeeting(slug, updates)` function calling `PUT /api/meetings/:slug`

**Frontend page** (`packages/apps/web/src/pages/ReviewPage.tsx`):
- Add `MeetingAreaSelector` inline component using `useAreas()` hook (from `hooks/areas.ts`) and `Select` from shadcn
- Place in `MeetingSection` header next to meeting title
- Pre-fill from `meeting.area` (extracted from `meetingArea` field on items)
- On change, call `updateMeeting()` via `useMutation`, invalidate `['review']` query, show toast

---

## Files Modified
| File | Changes |
|------|---------|
| `packages/apps/backend/src/routes/review.ts` | Action items extraction + ownership fields, meetingArea field on all items |
| `packages/apps/backend/src/routes/meetings.ts` | Widen PUT body type to include `area` |
| `packages/apps/web/src/api/types.ts` | Extend StagedMemoryItem with action_item type + ownership + meetingArea, add actionItems to PendingReviewResponse |
| `packages/apps/web/src/api/meetings.ts` | Add `updateMeeting()` function |
| `packages/apps/web/src/pages/ReviewPage.tsx` | All 5 changes: styling fix, approve-meeting bug fix, action items rendering with owner badges, meeting-first layout, area selector |

## Pre-Mortem Risks

| # | Risk | Mitigation |
|---|------|------------|
| 1 | Action items in `StagedItem` may not carry ownership fields | **Cleared** — `StagedItem` has `ownerSlug`, `direction`, `counterpartySlug` directly |
| 2 | Area update + meeting approval race condition | Both `PUT /:slug` and `POST /:slug/approve` use `withSlugLock` — serialized writes, no corruption |
| 3 | Global confidence/auto-approve controls reference removed per-type state | Update to use unified `pendingMemoryCount` and `itemsByMeeting` |
| 4 | `collectResults` doesn't distinguish action items from decisions/learnings | Currently all memory items use `memory:${id}` prefix — this is fine since the completion file is just a signal, not a processing trigger |

## Verification
1. Build: `cd packages/apps/web && npm run build` (no type errors)
2. Backend: `cd packages/apps/backend && npm run build`
3. Manual testing:
   - Approved items: green border only, no green background
   - "Approve Meeting" on Meeting A: only that meeting's items change, Meeting B unchanged
   - Action items visible with owner badges and direction arrows
   - Items grouped by meeting with sub-sections for action items / decisions / learnings
   - Area dropdown in each meeting header, persists on change
