# Plan B: The Beautiful Workspace

> Philosophy: Product builders deserve a workspace that inspires them.

## Mission

Transform the nascent Meeting Minder web app into a comprehensive, beautiful Product Intelligence Dashboard — the primary daily-use interface for product builders. By the end of this plan, opening Areté in the browser shows you your entire product world: meetings, people, goals, projects, decisions, and intelligence — beautifully organized and immediately useful.

## Scope

- **Primary domain**: `packages/apps/web/` (React/Vite) + `packages/apps/backend/` (Hono)
- **No changes to**: `packages/core/` internals (only add new API routes if needed), `packages/cli/`

---

## Current State

The web app currently has:
- Meetings list page with triage status
- Meeting detail page with staged item review + AI processing
- Hono backend with meetings + jobs APIs

---

## Task 1: Dashboard — Today at a Glance

### What it does
A new Dashboard page that is the HOME of the Areté web app. Shows today's intelligence summary: upcoming meetings, recent processed meetings, commitment counts, and active project status.

### Route: `/` (make this the root, move meetings to `/meetings`)

### Dashboard sections

**Today's Meetings** (card row)
- Fetch from `GET /api/calendar/today` (new backend route — see below)
- Each meeting card: time, title, attendees avatar stack, status badge if it's also in the meetings workspace
- If calendar not configured: placeholder with "Connect your calendar" CTA
- Empty state: "No meetings today — a clear day to think deeply."

**Recent Meetings** (table, last 5)
- From existing `/api/meetings` — filter to last 5, sort by date
- Show: title, date, status badge, source
- Link to meeting detail

**Commitment Pulse** (metric cards row)
- Fetch from `GET /api/intelligence/commitments/summary` (new backend route)
- 3 cards: Open, Due This Week, Overdue
- Each card: count + colored indicator (green/yellow/red)
- Click → future link to commitments page (placeholder for now)

**Active Projects** (list)
- Fetch from `GET /api/projects` (new backend route — scans projects/active/ directory)
- Each project: name, last-modified date (relative), status indicator
- Click → placeholder (future project detail view)

**Recent Memory** (feed, last 5 items)
- Fetch from `GET /api/memory/recent` (new backend route)
- Interleaved decisions + learnings, sorted by date
- Each item: type badge (Decision/Learning), text, date
- Link to full memory view (placeholder)

### New Backend Routes Required
- `GET /api/calendar/today` — shell out to `arete pull calendar --today --json`, return parsed events
- `GET /api/intelligence/commitments/summary` — read `.arete/commitments.json` via @arete/core, compute counts
- `GET /api/projects` — scan `projects/active/*/README.md`, return title + mtime
- `GET /api/memory/recent?limit=5` — read `.arete/memory/items/decisions.md` + learnings.md, parse entries, return last N

### Implementation Notes
- New page component: `packages/apps/web/src/pages/Dashboard.tsx`
- New API files: `packages/apps/web/src/api/dashboard.ts`, `packages/apps/web/src/hooks/dashboard.ts`
- Update `App.tsx` routing: `/` → Dashboard, `/meetings` → existing MeetingsIndex
- Add 4 backend route modules in `packages/apps/backend/src/routes/`

### Acceptance Criteria
- [ ] Dashboard is the root route `/`
- [ ] Shows today's meetings (graceful empty state)
- [ ] Shows commitment pulse metrics (3 cards)
- [ ] Shows last 5 active projects
- [ ] Shows last 5 memory items
- [ ] All sections have loading skeletons
- [ ] All sections have graceful empty states (no crashes)
- [ ] Tests for all new backend routes
- [ ] `npm run typecheck && npm test` (backend); `npm run build` (web) passes

---

## Task 2: People Intelligence Page

### What it does
A new page that shows all people in the workspace with their relationship health, last meeting, and open commitment count. The PM's relationship dashboard.

### Route: `/people`

### Page design

**Header**: "People Intelligence" + search input

**People table** (sortable columns)
| Column | Source |
|--------|--------|
| Name | `people/**/*.md` — frontmatter `name` |
| Category | Directory: internal / customer / user |
| Relationship Health | Green/Yellow/Red dot — from `<!-- AUTO_PERSON_MEMORY:START -->` section health score |
| Last Meeting | Most recent meeting with `attendee_ids` containing person slug |
| Open Commitments | Count from `.arete/commitments.json` where `personSlug` matches and `status: open` |
| Trend | Up/Flat/Down arrow based on recent meeting frequency |

**Person detail drawer** (slide in from right on row click)
- Name, role, company
- Relationship health score
- Recent meetings (last 3 with dates)
- Open commitments (list with text)
- Stances (from person file AUTO_PERSON_MEMORY section)

### New Backend Routes
- `GET /api/people` — scan `people/**/*.md`, parse frontmatter + auto-memory block, cross-reference meetings and commitments. Return array of `PersonSummary`.
- `GET /api/people/:slug` — full person detail including recent meetings, commitments, stances

### PersonSummary type (backend → frontend)
```typescript
type PersonSummary = {
  slug: string;
  name: string;
  category: 'internal' | 'customer' | 'user';
  healthScore: number | null;  // 0-100 or null if no data
  lastMeetingDate: string | null;
  lastMeetingTitle: string | null;
  openCommitments: number;
  trend: 'up' | 'flat' | 'down' | null;
};
```

### Acceptance Criteria
- [ ] `/people` page shows all people in workspace
- [ ] Table is sortable by name, category, last meeting, open commitments
- [ ] Search filters by name in real-time
- [ ] Relationship health shown with color indicator
- [ ] Clicking a row opens detail drawer
- [ ] Drawer shows stances and open commitments
- [ ] Empty state when no people files exist
- [ ] Backend: tests for `/api/people` route
- [ ] `npm run typecheck && npm test` (backend); `npm run build` (web) passes

---

## Task 3: Goals Alignment View

### What it does
A visual view showing the strategy → quarter goals → weekly priorities → commitments alignment. PMs can see in one screen how their day-to-day work connects to the big picture.

### Route: `/goals`

### Page design

**Strategy section** (top, collapsed by default)
- Read `goals/strategy.md` — show title and first 200 chars with expand button

**Quarter Goals** (cards row)
- Read `goals/quarter.md` — parse `## Outcome N:` sections
- Each outcome: card with title, completion indicator
- Completion: estimated from presence of associated weekly priorities marked done (heuristic)

**Weekly Priorities** (this week's focus)
- Read `now/week.md` (current week file)
- Show as checklist: `[ ]` = pending, `[x]` = done
- Group by outcome category if possible (parse labels from week file)
- Show week date range in header

**Commitment Alignment** (bottom section)
- List open commitments from `.arete/commitments.json`
- Group by person
- Small table: Text | Person | Direction | Days Open

### New Backend Routes
- `GET /api/goals/strategy` — read `goals/strategy.md`, return parsed content
- `GET /api/goals/quarter` — read `goals/quarter.md`, parse outcome sections
- `GET /api/goals/week` — read `now/week.md`, parse priorities
- These routes return raw parsed content; the frontend renders it

### Design principle
This page should feel like an OKR view — hierarchical, clear alignment. No data entry needed; it's a READ view of the existing workspace files.

### Acceptance Criteria
- [ ] `/goals` page loads without error
- [ ] Strategy section shows with expand/collapse
- [ ] Quarter goals show as cards (graceful empty if no `goals/quarter.md`)
- [ ] Weekly priorities show as interactive checklist (display only, no editing)
- [ ] Commitment alignment shows open commitments grouped by person
- [ ] All sections have graceful empty states
- [ ] Backend tests for all 3 goal routes
- [ ] `npm run typecheck && npm test` (backend); `npm run build` (web) passes

---

## Task 4: Decisions & Learnings Feed

### What it does
A searchable, filterable feed of all captured decisions and learnings from memory. The PM's institutional memory browser.

### Route: `/memory`

### Page design

**Header**: "Memory" + type filter tabs (All | Decisions | Learnings) + date range selector + search

**Memory feed** (infinite scroll or paginated)
- Each item card:
  - Type badge: `Decision` (blue) or `Learning` (purple)
  - Text content (full)
  - Date captured
  - Source tag (if extractable from the memory file format)

**Parse format**: `.arete/memory/items/decisions.md` uses the format:
```
## YYYY-MM-DD
**Decision**: [text]
**Why it matters**: [text]
**Source**: [meeting/project reference]
```
Parse into structured items.

**Empty state**: "No decisions or learnings captured yet. Process your meetings to start building institutional memory."

### New Backend Route
- `GET /api/memory?type=all|decision|learning&q=<search>&limit=N&offset=N` — paginated, filterable memory feed

### Acceptance Criteria
- [ ] `/memory` page loads with all memory items
- [ ] Type filter tabs work (All / Decisions / Learnings)
- [ ] Search filters items in real-time (client-side filter on loaded data)
- [ ] Items sorted by date descending (newest first)
- [ ] Empty state shown when no memory items
- [ ] Decision and Learning items have distinct visual treatment
- [ ] Backend: `/api/memory` route with type filtering
- [ ] Backend tests for memory route
- [ ] `npm run typecheck && npm test` (backend); `npm run build` (web) passes

---

## Task 5: Navigation, Layout & Polish

### What it does
A cohesive sidebar navigation, consistent page layout, and visual polish that makes the entire app feel like a premium product — not a prototype.

### Navigation sidebar
Replace the current top-nav with a persistent left sidebar:

```
┌─────────────────┐
│  ⚡ Areté        │
├─────────────────┤
│ 🏠 Dashboard    │
│ 📅 Meetings     │
│ 👥 People       │
│ 🎯 Goals        │
│ 🧠 Memory       │
├─────────────────┤
│ Settings (icon) │
└─────────────────┘
```

### Visual polish requirements
1. **Consistent header pattern**: Every page has a `PageHeader` component with title + optional description + optional action button
2. **Loading states**: Every data section uses `<Skeleton>` components (already available in the UI kit)
3. **Empty states**: Every list/table has a designed empty state (icon + message + optional CTA)
4. **Responsive**: Sidebar collapses to icons on medium screens; hamburger on mobile
5. **Color scheme consistency**: Use the existing Tailwind design tokens throughout; no ad-hoc colors
6. **Toast notifications**: Use `sonner` (already installed) for all success/error states

### App layout component
- Update `AppLayout.tsx` with sidebar navigation
- Add `PageHeader.tsx` component
- Add `EmptyState.tsx` component
- Ensure sidebar active state reflects current route

### Acceptance Criteria
- [ ] Sidebar navigation present on all pages
- [ ] Active route highlighted in sidebar
- [ ] All 5 pages (Dashboard, Meetings, People, Goals, Memory) accessible via sidebar
- [ ] PageHeader component used consistently
- [ ] EmptyState component used in all list/table views
- [ ] App works on mobile (sidebar collapses)
- [ ] No layout shifts or flickering on page transitions
- [ ] `npm run build` passes without warnings

---

## Quality Standards
- React components: functional + hooks only
- No `any` types; use TypeScript strictly
- API calls go through `src/api/` layer (consistent with existing `meetings.ts`)
- Hooks in `src/hooks/` (consistent with existing `meetings.ts`)
- shadcn/ui components for all UI (already installed)
- Tailwind for all styling (no CSS files unless necessary)
- Vitest for frontend tests (consistent with existing setup)
- Backend: node:test for all route tests (consistent with existing)
- Backend DI pattern: inject deps into route factories
- All sections handle loading, error, and empty states
