---
title: "Areté Web App V3 — Frontend UX"
slug: web-v3
status: draft
size: large
tags: [web, frontend, ux]
created: "2026-03-07"
updated: 2026-03-07T23:38:27.330Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 7
---

# Areté Web App V3 Plan — Frontend UX

## Overview

V3 focuses on **UX refinement** across the web app. Intelligence/AI tuning is tracked separately (see `intelligence-tuning` plan).

---

## V3-1: Markdown Editor Upgrade

**Goal**: Replace basic TipTap with a Notion-like editor that outputs clean markdown

**Research Summary**:
| Library | Markdown I/O | Block UI | Complexity |
|---------|--------------|----------|------------|
| BlockNote | ✅ Yes | ✅ Full | Medium |
| Novel | ✅ Yes | ✅ Full | Medium |
| TipTap (current) | ✅ Yes | ❌ Basic | Low |

**Recommendation**: **BlockNote** — best out-of-box Notion-like experience with clean markdown export.

**Implementation**:
- Install `@blocknote/react`, `@blocknote/core`, `@blocknote/mantine` (or shadcn adapter)
- Create `BlockEditor` component wrapping BlockNote
- Markdown round-trip: `parseMarkdown()` on load, `blocksToMarkdown()` on save
- Replace `MarkdownEditor` usage in PersonDetailPage, Goals

**User Experience**:
- Type `## header` → auto-converts to styled heading
- Type `- item` → auto-converts to bullet list
- Slash command menu (`/heading`, `/bullet`, etc.)
- Inline formatting toolbar on text selection
- Files saved as clean markdown (no block metadata)

**Acceptance Criteria**:
- [ ] BlockNote integrated with shadcn/ui theming
- [ ] Markdown import on component mount
- [ ] Markdown export on save/blur
- [ ] Read-only mode for viewing
- [ ] Works in: PersonDetailPage (notes), GoalsView
- [ ] Keyboard shortcuts: `**bold**`, `_italic_`, etc.

---

## V3-2: People Detail Page Restructure

**Goal**: Fix awkward two-column layout (see screenshot analysis)

**Current Issues**:
- Two columns with unbalanced content
- Left side nearly empty (Contact, Intelligence)
- Notes show raw markdown, not rendered
- No visual hierarchy

**New Layout** (single column):
```
┌─────────────────────────────────────────────────┐
│ ← People                                        │
│                                                 │
│ Anita Law  ● Internal                          │
│ Email Templates + SMS · Reserv                  │
├─────────────────────────────────────────────────┤
│ CONTACT                                         │
│ 📧 anita@reserv.com   📞 555-1234   🏢 Reserv  │
├─────────────────────────────────────────────────┤
│ OPEN COMMITMENTS (2)                    See All │
│ ┌─────────────────────────────────────────────┐ │
│ │ I owe them: Send proposal by Friday    14d │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ RECENT MEETINGS                         See All │
│ Mar 3  Intro: Anita / John                      │
│ Feb 28 Weekly Sync                              │
│ Feb 21 Project Kickoff                          │
├─────────────────────────────────────────────────┤
│ INTELLIGENCE                                    │
│ Health: ● Good   Trend: ↗ Improving             │
│ Strong collaborator on comms initiatives...     │
├─────────────────────────────────────────────────┤
│ NOTES                                      Edit │
│ ┌─────────────────────────────────────────────┐ │
│ │ [BlockNote rendered content]                │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Acceptance Criteria**:
- [ ] Single-column layout, max-width container
- [ ] Contact info horizontal (not stacked sections)
- [ ] Open commitments: show 3, "See All" links to CommitmentsPage with person filter
- [ ] Recent meetings: show 5, expandable or "See All"
- [ ] Intelligence: health dot, trend icon, summary text
- [ ] Notes: BlockEditor component (V3-1 dependency)
- [ ] Consistent section headers (uppercase, muted)

---

## V3-3: People List — Favorites

**Goal**: Surface frequently-met people at top

**Implementation**:
- Add `favorite: boolean` to person frontmatter schema
- New "Favorites" tab in PeopleIndex tabs
- Star icon on person row (click to toggle)
- Backend: parse `favorite`, include in PersonSummary
- PATCH endpoint to update favorite status

**Acceptance Criteria**:
- [ ] Favorites tab with count badge
- [ ] Star icon toggle on each row
- [ ] Favorite status persisted to person markdown file
- [ ] URL param: `?category=favorites`
- [ ] "All" tab: favorites sorted first

---

## V3-4: Commitments Page Enhancement

**Goal**: Filter by direction (mine vs theirs), improve table UX

**Current State**: Has status filters (Open/Overdue/This Week/All), card-based list

**Enhancements**:

1. **Direction Subnav** (above status filters):
   ```
   [Mine] [Theirs] [All]
   ```
   - Mine = `i_owe_them`
   - Theirs = `they_owe_me`

2. **Table Layout** (matching PeopleIndex pattern):
   - Column headers: Person, Commitment, Direction, Age, Actions
   - Sortable columns
   - Row hover states

3. **Person Filter** (for People Detail "See All" link):
   - URL param: `?person=anita-law`
   - Shows commitments for specific person

**Acceptance Criteria**:
- [ ] Direction subnav: Mine/Theirs/All
- [ ] Table layout with column headers
- [ ] Sortable by person, age
- [ ] Person filter via URL param
- [ ] URL structure: `?direction=mine&filter=open&person=anita-law`

---

## V3-5: Meeting Review UX — Collapsible Sections + Approve All

**Goal**: Reduce review friction

**Enhancements**:

1. **Collapsible Sections**:
   - Action Items, Decisions, Learnings sections have ChevronDown toggle
   - Match Transcript section pattern
   - State persisted in localStorage

2. **Approve All** (per section):
   - Button in section header: "Approve All (5)"
   - Approves all pending items in that section

3. **Default Selection** (Option B — user's preference):
   - Items default to `approved` status
   - User unchecks/skips bad items
   - Reduces clicks for good extractions

**Acceptance Criteria**:
- [ ] Collapsible section headers with chevron
- [ ] Section collapse state in localStorage
- [ ] "Approve All" button per section
- [ ] Items default to approved (not pending)
- [ ] Clear visual distinction for skipped items

---

## V3-6: Meeting Sheet (People Context)

**Goal**: Replace popup with useful full-screen sheet

**Current**: People → Meeting popup shows transcript (not useful)

**New**: Full-screen Sheet modal with meeting details

**Implementation**:
- Use shadcn `Sheet` component (side="right", full height)
- Render meeting content (summary, parsed items, metadata)
- No transcript (or collapsed by default)
- Big X button to close

**Acceptance Criteria**:
- [ ] Sheet slides from right, full viewport height
- [ ] Meeting summary visible
- [ ] Parsed items (decisions, learnings, actions) visible
- [ ] Metadata panel (attendees, date, duration)
- [ ] Transcript hidden or collapsed
- [ ] X button closes, returns to PersonDetailPage
- [ ] Click outside closes

---

## V3-7: Polish Pass

- [ ] Empty states consistent across pages
- [ ] Loading skeletons match new layouts
- [ ] Error states consistent
- [ ] Sidebar active states correct
- [ ] Mobile responsive basics (stretch goal)

---

## Dependencies

```
V3-1 (BlockEditor) ──► V3-2 (People Detail)
                   │
V3-3 (Favorites)   │
V3-4 (Commitments) ├──► V3-7 (Polish)
V3-5 (Meeting UX)  │
V3-6 (Meeting Sheet)
```

---

## Recommended Build Order

1. **V3-1**: BlockEditor (foundation for notes)
2. **V3-2**: People Detail restructure (uses BlockEditor)
3. **V3-5**: Meeting Review UX (high daily friction)
4. **V3-6**: Meeting Sheet (complements V3-2)
5. **V3-3**: Favorites (quick win)
6. **V3-4**: Commitments enhancement
7. **V3-7**: Polish pass

---

## Out of Scope (See intelligence-tuning plan)

- AI extraction quality tuning
- User notes auto-merge
- Agent pre-selection of items
- Commitment reconciliation
- Commitment scoring/priority
