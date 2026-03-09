---
title: Command Palette (Cmd+K)
slug: command-palette
status: idea
size: medium
tags: [web-app, ux, reimagine]
created: 2026-03-07T17:30:00.000Z
updated: 2026-03-07T17:30:00.000Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# Command Palette (Cmd+K)

## Problem Statement

The web app lacks a fast, keyboard-first way to navigate, search, and take action. Users must click through sidebar nav, find the right page, then find the right button. Power users (PMs who live in Linear/Notion/Slack) expect `⌘K` to do everything.

## Design Vision

A **context-aware command palette** that:
1. Shows **page-specific actions** based on where you are
2. Provides **universal grouped search** across all entity types
3. Enables **quick navigation** to any page or entity

---

## Context-Aware Actions

The palette shows different actions depending on the current page:

| Page | Context Actions |
|------|-----------------|
| **Dashboard** | Plan my week, Process today's meetings, Sync calendar |
| **Meetings Index** | New meeting, Sync with Krisp, Process all unprocessed |
| **Meeting Detail** | Process, Approve all staged items, Sync with Krisp, Export to Linear |
| **People Index** | New person, Refresh all intelligence |
| **Person Detail** | Edit notes, Refresh memory, View all meetings with person |
| **Goals** | Add priority, Edit week, Plan my week (opens chat) |
| **Memory** | Add decision, Add learning, Search memory |
| **Settings** | — (no context actions) |

**Global actions** (available everywhere):
- Navigate to: Dashboard, Meetings, People, Goals, Memory, Settings
- Quick add: New meeting, New priority, New person
- Sync: Pull calendar, Pull Krisp

---

## Universal Grouped Search

As you type, results appear grouped by type:

```
┌─────────────────────────────────────────────────────┐
│ 🔍 em                                               │
├─────────────────────────────────────────────────────┤
│ Projects                                            │
│   📁 Pop email templates                            │
│   📁 Email templates rollout                        │
│                                                     │
│ People                                              │
│   👤 Emily Chen                                     │
│   👤 Emilio Garcia                                  │
│                                                     │
│ Meetings                                            │
│   📅 Emilio <> John 1:1 (Mar 5)                     │
│   📅 Email strategy sync (Feb 28)                   │
│                                                     │
│ Memory                                              │
│   💡 Decision: Email notification approach          │
│   📝 Learning: Email open rates matter less than... │
│                                                     │
│ Goals                                               │
│   ✓ Ship email integration (weekly priority)       │
└─────────────────────────────────────────────────────┘
```

**Search covers:**
- Projects (`projects/`)
- People (`people/`)
- Meetings (`resources/meetings/`)
- Memory (decisions, learnings)
- Goals (`now/week.md`, `now/quarter.md`)
- Context files (`context/`)

**Ranking**: Recent > exact match > fuzzy match. People you met this week rank higher.

---

## Palette States

```
┌─────────────────────────────────────────┐
│ 🔍 Type to search or run a command...   │  ← Always visible
├─────────────────────────────────────────┤
│                                         │
│ [DEFAULT STATE - no input]              │
│                                         │
│ Actions (for this page)                 │  ← Context-aware
│   ▶ Process meeting                     │
│   ▶ Approve all staged items            │
│   ▶ Sync with Krisp                     │
│                                         │
│ Recent                                  │  ← Last 5 visited
│   👤 Sarah Chen                         │
│   📅 Product Review (Mar 6)             │
│   📁 Q2 Roadmap                         │
│                                         │
│ Navigate                                │  ← Global nav
│   → Dashboard                           │
│   → Meetings                            │
│   → People                              │
│   → Goals                               │
│   → Memory                              │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│ [SEARCH STATE - user is typing]         │
│                                         │
│ Grouped results appear...               │
│                                         │
└─────────────────────────────────────────┘
```

---

## Keyboard UX

| Key | Action |
|-----|--------|
| `⌘K` | Open palette (from anywhere) |
| `↑↓` | Navigate results |
| `Enter` | Select / execute |
| `Esc` | Close palette |
| `Tab` | Cycle through result groups |
| `⌘Enter` | Execute action in background (don't navigate) |

---

## Implementation Approach

**Library**: [cmdk](https://cmdk.paco.me/) via shadcn's [Command component](https://ui.shadcn.com/docs/components/command)

**Backend**: 
- `GET /api/search?q=<query>` — unified search endpoint (may already exist from I3-1)
- Returns grouped results: `{ projects: [], people: [], meetings: [], memory: [], goals: [] }`

**Frontend**:
- `CommandPalette.tsx` component with cmdk
- `useCommandPalette()` hook for state management
- `usePageContext()` hook to determine current page → context actions
- `useRecentItems()` hook for recent navigation history (localStorage)

**Context action registry**:
```typescript
const contextActions: Record<PageType, Action[]> = {
  'meeting-detail': [
    { id: 'process', label: 'Process meeting', action: () => ... },
    { id: 'approve-all', label: 'Approve all staged items', action: () => ... },
    { id: 'sync-krisp', label: 'Sync with Krisp', action: () => ... },
  ],
  'meetings-index': [
    { id: 'new-meeting', label: 'New meeting', action: () => ... },
    { id: 'sync-krisp', label: 'Sync with Krisp', action: () => ... },
  ],
  // ...
};
```

---

## Dependencies

- **V2 complete**: Need the pages to exist before we can add context actions for them
- **Meeting detail page**: From meeting-enhancements plan (for meeting-specific actions)
- **Unified search endpoint**: May need to build or enhance `/api/search`

---

## Out of Scope (v1)

- Voice input
- AI-powered "fuzzy action matching" (e.g., "show me Sarah's meetings" → runs a search)
- Custom user-defined actions
- Vim-style keybindings

## Future Considerations

- **Command history**: `⌘K` then `↑` shows last commands
- **Favorites/pinned**: Pin frequently used actions to top
- **AI routing**: Type natural language → routes to right action/skill

---

## Open Questions

1. Should context actions also appear as buttons on the page, or is palette-only okay?
2. How do we handle actions that need input (e.g., "New meeting" needs title/date)?
3. Should search results include file content snippets or just titles?

---

## Size Estimate

**Medium** — cmdk does the heavy lifting, but:
- Context action registry for every page
- Unified search endpoint
- Recent items persistence
- Keyboard handling edge cases

Could break into:
1. Basic palette + navigation (small)
2. Context actions per page (small per page)
3. Unified search (medium — depends on existing search infra)
