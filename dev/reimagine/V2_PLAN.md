# Areté Web App — v2 Plan

> Written: 2026-03-06 | Based on feedback after v1 testing
> Branch: reimagine | Working dir: /Users/johnkoht/code/worktrees/arete--reimagine

---

## Current State (v1 bugs already fixed)
- ✅ `people/internal` directory mapping fixed (was `people/internals`)
- ✅ Backend dist compiled and committed
- All tests: 1436 pass (root), 112 pass (backend), web build clean

---

## v2 Scope — 6 Tasks

---

### Task V2-1: API Key Management UI

**Problem**: Users have no UI to enter/manage their Anthropic API key. Currently it must be set as an env var or in a hidden config file — not discoverable.

**Solution**: A Settings page with a dedicated API key section.

**Implementation**:

1. **New backend route** — `packages/apps/backend/src/routes/settings.ts`:
   - `GET /api/settings/apikey` — returns `{ configured: boolean, maskedKey: string | null }`. Read from `~/.arete/config` or workspace `.credentials/` (look at how the existing agent.ts reads `getEnvApiKey` — trace that import to understand where keys are stored).
   - `POST /api/settings/apikey` — body `{ key: string }`. Validate it starts with `sk-ant-`. Write to the appropriate config file. Return `{ success: true }`.
   - `DELETE /api/settings/apikey` — remove the key. Return `{ success: true }`.
   - Register in `server.ts`.

2. **New Settings page** — `packages/apps/web/src/pages/SettingsPage.tsx`:
   - Route: `/settings`
   - Add to sidebar nav (gear icon at the bottom, below the main nav items — separate from page nav)
   - **API Key section**:
     - If configured: show masked key (`sk-ant-api03-...••••••••••••••••`) + "Remove" button
     - If not configured: text input for key + "Save" button + link to Anthropic console
     - On save: validate format, POST to backend, show success/error toast
     - On remove: confirm dialog, DELETE, show toast
   - **About section** (simple): Areté version, workspace path
   - No other settings for now (keep it focused)

3. **Where keys are stored**: Check `packages/core/src/services/` or `packages/apps/backend/src/services/agent.ts` for `getEnvApiKey` — follow the import to understand the key storage path. Use the same location so the backend agent (meeting processing) picks it up automatically.

**Acceptance Criteria**:
- [ ] `/settings` page loads with API key status
- [ ] Can enter and save a new API key
- [ ] Saved key persists (backend can read it back)
- [ ] Can remove the key
- [ ] Settings gear icon in sidebar (bottom, visually separated)
- [ ] Backend tests for GET/POST/DELETE routes
- [ ] `npm run typecheck && npm test` pass; `npm run build` (web) passes

---

### Task V2-2: People Page — Category Tabs

**Problem**: No way to filter people by category (All / Internal / Customer / User). With many people, this is essential.

**Solution**: Add filter tabs above the people table.

**Implementation** — changes to `packages/apps/web/src/pages/PeopleIndex.tsx` only (no backend changes needed, data already has `category` field):

1. Add tab state: `'all' | 'internal' | 'customer' | 'user'` (default: `'all'`)
2. Filter `people` array based on active tab before applying search + sort
3. Tab UI: use shadcn `Tabs` component (already installed). Show count badge on each tab: `All (12)`, `Internal (4)`, `Customer (6)`, `User (2)`.
4. Tab counts should update when search changes (show count of filtered results per category, not total)
5. URL-sync the tab: `?category=internal` so links can land on a specific tab
6. Tab order: All → Internal → Customer → User

**Acceptance Criteria**:
- [ ] 4 tabs visible: All, Internal, Customer, User
- [ ] Each tab shows count of people in that category
- [ ] Clicking a tab filters the table instantly
- [ ] Search + sort work within the active tab
- [ ] URL param `?category=` sets active tab on load
- [ ] `npm run build` (web) passes

---

### Task V2-3: People Detail — Full Page (replace drawer)

**Problem**: The current fly-out drawer is too small for the amount of intelligence data in a person's file. A full page gives room for meetings, commitments, stances, and all their intelligence.

**Solution**: New `/people/:slug` page with a rich layout.

**Backend** — enhance `GET /api/people/:slug` response in `packages/apps/backend/src/routes/people.ts`:
- Already returns: name, role, company, stances, openCommitmentItems, recentMeetings, repeatedAsks, repeatedConcerns
- Add: `rawContent: string` — the full markdown body of the person file (after frontmatter), for the "Notes" section
- Add: `email: string` (already in type, confirm it's returned)
- Add: `allMeetings: Array<{ slug: string; date: string; title: string; attendeeIds: string[] }>` — all meetings (not just 3), found by scanning `resources/meetings/*.md` for `attendee_ids` containing this person's slug. Sort descending.

**New page** — `packages/apps/web/src/pages/PersonDetailPage.tsx`:

**Layout** (two-column on desktop, stacked on mobile):
```
┌─────────────────────────────────────────────┐
│ ← People    [Name]    [Role @ Company]      │
│             [Category badge] [Health dot]   │
├──────────────────┬──────────────────────────┤
│ LEFT PANEL       │ RIGHT PANEL              │
│                  │                          │
│ Contact          │ Meeting History          │
│ - email          │ (list, clickable)        │
│ - company        │                          │
│                  │ Open Commitments         │
│ Intelligence     │ (list)                   │
│ - Stances        │                          │
│ - Asks           │ Notes                    │
│ - Concerns       │ (rendered markdown body) │
└──────────────────┴──────────────────────────┘
```

**Meeting History section** — each meeting is a clickable row. Clicking opens a **Sheet drawer** (side panel) showing:
- Meeting title + date
- Summary (from meeting file `## Summary` section)
- Key points
- Action items from that meeting involving this person
- "Open full meeting →" link to `/meetings/:slug`

This requires a `GET /api/meetings/:slug` route to load the meeting on demand when the drawer opens (already exists from the original meetings router).

**Remove the drawer from PeopleIndex** — once the detail page exists, rows in `PeopleIndex.tsx` should navigate to `/people/:slug` instead of opening the old `PersonDrawer`. Remove `PersonDrawer` component and `usePerson` hook usage from the index page.

**Acceptance Criteria**:
- [ ] `/people/:slug` renders a full page (not drawer)
- [ ] Shows: name, role, company, email, category, health
- [ ] Intelligence section: stances, repeated asks/concerns
- [ ] Meeting history: all meetings, sorted by date desc
- [ ] Clicking a meeting row opens a Sheet drawer with summary + action items + "Open full" link
- [ ] Open commitments section (empty state if none)
- [ ] Notes section shows rendered person file body
- [ ] People index table rows now navigate to `/people/:slug` (no drawer)
- [ ] Back button returns to `/people`
- [ ] Backend tests for enhanced `:slug` route
- [ ] `npm run build` passes

---

### Task V2-4: Goals — Interactive Priorities

**Problem**: Goals page is fully read-only. Users want to check off weekly priorities directly in the UI.

**Solution**: Make `## Priorities` / checklist items in `now/week.md` interactive — clicking a checkbox writes the change back to the file.

**Backend**:
Add to `packages/apps/backend/src/routes/goals.ts`:
- `PATCH /api/goals/week/priority` — body `{ index: number, done: boolean }`. Reads `now/week.md`, finds the Nth checklist item (`- [ ]` or `- [x]`), toggles it, writes back. Returns `{ success: true, updatedContent: string }`.

The write must be careful: only toggle `[ ]` ↔ `[x]` on the matched line, preserve all other content exactly.

**Frontend** — update `packages/apps/web/src/pages/GoalsView.tsx`:
- Weekly priorities: replace the static display with interactive `<Checkbox>` components (shadcn Checkbox, already installed)
- On checkbox click: optimistic update (toggle immediately) + `PATCH /api/goals/week/priority`
- On error: roll back + toast "Couldn't save — check if file is writable"
- Add hook: `useToggleWeekPriority()` in `packages/apps/web/src/hooks/goals.ts`

**Acceptance Criteria**:
- [ ] Weekly priority checkboxes are clickable
- [ ] Clicking toggles `[ ]` ↔ `[x]` in `now/week.md` on disk
- [ ] Optimistic update: checkbox toggles immediately
- [ ] Error state: rolls back if write fails
- [ ] Done items are visually distinct (strikethrough text, muted color)
- [ ] Backend: `PATCH /api/goals/week/priority` test (toggle on/off, verify file content)
- [ ] `npm run build` passes

---

### Task V2-5: Markdown Editor (WYSIWYG-style)

**Problem**: No way to edit content in the web app. Users need to write meeting notes, person files, goals — ideally with a Notion/Linear-style experience where you write markdown and it renders live.

**Solution**: A reusable `MarkdownEditor` component using **TipTap** (the industry-standard headless editor, used by Notion, Linear, etc. — MIT licensed).

**Install**:
```bash
cd packages/apps/web
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-placeholder
```

**New component** — `packages/apps/web/src/components/MarkdownEditor.tsx`:
```typescript
type MarkdownEditorProps = {
  initialValue: string;        // markdown string
  onChange: (markdown: string) => void;  // called with markdown on change
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
};
```

- Uses TipTap with StarterKit (bold, italic, headings, lists, code, blockquote, hr)
- Input/output format: **markdown** (use `@tiptap/extension-markdown` or convert manually)
- Behavior: user types `## Title` and it converts to an H2 as they type — just like Notion
- Toolbar: minimal floating bubble menu on text selection (Bold, Italic, H1, H2, H3, Code)
- No save button in the component — parent controls save timing

**Wire it into the Notes section of PersonDetailPage**:
- "Notes" section shows person file body in `MarkdownEditor` (readOnly by default)
- "Edit" button enters edit mode
- "Save" button: `PATCH /api/people/:slug/notes` (new backend route) — writes updated markdown back to the person's `.md` file, preserving frontmatter
- "Cancel" discards changes

**Backend** — add to `packages/apps/backend/src/routes/people.ts`:
- `PATCH /api/people/:slug/notes` — body `{ content: string }`. Reads person file, replaces body (after frontmatter) with new content. Writes file. Returns `{ success: true }`.
- Use `gray-matter` to parse/stringify safely (preserves frontmatter).

**Acceptance Criteria**:
- [ ] `MarkdownEditor` component renders markdown as formatted text (H1, H2, bold, lists, etc.)
- [ ] Typing `## text` converts to H2 in real time
- [ ] Basic formatting via bubble menu on selection
- [ ] PersonDetailPage Notes section is editable
- [ ] Saving writes back to the person file (preserves frontmatter)
- [ ] Cancel discards changes
- [ ] `npm run build` passes (TipTap installs cleanly)

**Note**: The MarkdownEditor is a reusable component. Future tasks can wire it into meeting notes editing, goals editing, etc. Scope for this task is just the component + one integration (person notes).

---

### Task V2-6: General Polish & Bug Fixes

Fix the remaining issues found during v1 testing:

**1. Remove old PersonDrawer from PeopleIndex** (handled in V2-3 but noting here for completeness)

**2. Goals — strategy preview is collapsed by default with stripped markdown preview** (already fixed in I2-5 — verify it works)

**3. Settings gear icon is a dead link in current sidebar** — wire it to `/settings` (new in V2-1)

**4. Empty states need better copy** in a few places:
- Dashboard → Recent Activity: "Activity appears as meetings are processed with `arete view` running."
- People → empty search: "No people match '{search}'. Try a different name or clear the filter."
- Memory → empty: "No decisions or learnings captured yet. Process your meetings with `arete view` to start building memory."

**5. Meetings page link from sidebar** — verify it goes to `/meetings` not `/` (check AppSidebar.tsx)

**6. Dashboard → Today's Meetings empty state**: if calendar returns empty or errors, show "Connect your calendar with `arete pull calendar` to see today's meetings here." instead of a loading spinner.

**Acceptance Criteria**:
- [ ] All empty state copy updated
- [ ] Settings link in sidebar routes to `/settings`
- [ ] Meetings sidebar link goes to `/meetings`
- [ ] Dashboard calendar empty state is informative
- [ ] `npm run build` passes

---

## Build Order

Tasks can be executed in this order (each is independent):
1. **V2-2** (People tabs) — smallest, fastest win
2. **V2-3** (Person detail page) — depends on V2-2 being done (removes drawer from index)
3. **V2-4** (Goals interactive) — independent
4. **V2-1** (API key settings) — independent
5. **V2-5** (Markdown editor) — depends on V2-3 (wires into PersonDetailPage)
6. **V2-6** (Polish) — last, after everything else is done

---

---

## Critical Architecture Issue: Backend Bypasses Core Services

> Documented: 2026-03-07 | From comprehensive gap audit

### The Problem

The web backend (`packages/apps/backend/`) **does not use `@arete/core` services**. Instead, it reimplements basic file operations with raw `fs` calls and `gray-matter` parsing.

**Core has 17 service modules:**
```
commitments, context, entity, index, integrations, intelligence, 
meeting-extraction, meeting-parser, memory, momentum, patterns, 
person-health, person-memory, person-signals, skills, tools, workspace
```

**Backend imports only 8 low-level utilities:**
```typescript
// From @arete/core:
FileStorageAdapter           // file I/O wrapper
parseStagedSections          // parse ## Staged Action Items
parseStagedItemStatus        // parse frontmatter status
parseStagedItemEdits         // parse frontmatter edits
writeItemStatusToFile        // write staged item changes
commitApprovedItems          // commit approved items to memory
loadConfig                   // load workspace config
refreshQmdIndex              // refresh search index
detectCrossPersonPatterns    // one intelligence function
```

**None of the service classes are used:**
- `ContextService` — context injection, relevant file retrieval
- `MemoryService` — search, create, timeline
- `EntityService` — resolve, find mentions, relationships
- `IntelligenceService` — briefing, skill routing
- `CommitmentsService` — sync, reconcile
- `MomentumService` — health scoring, trends
- etc.

### Impact

| Feature | Core Service | What Backend Does |
|---------|--------------|-------------------|
| List meetings | Could use core parsing | Raw `fs.readdir()` + `gray-matter` |
| Search memory | `MemoryService.search()` | **Not implemented** |
| Get context | `ContextService.getRelevant()` | **Not implemented** |
| Daily briefing | `IntelligenceService.assembleBriefing()` | **Not implemented** |
| Person lookup | `EntityService.resolve()` | Raw `fs.readFile()` each request |
| Commitments | `CommitmentsService` | Raw JSON read/write |
| Momentum/health | `MomentumService` | Always returns `null` |

### Why This Matters

1. **Duplicated logic** — Backend reimplements what core already does, but worse
2. **Missing features** — Intelligence, search, briefing completely absent from web
3. **Inconsistent behavior** — CLI uses core services; web uses raw fs
4. **Every new feature** requires reimplementing core logic or finally wiring it up

### Recommended Fix

Before adding new features, wire the backend to use core services:

```typescript
// Instead of:
const raw = await fs.readFile(filePath, 'utf8');
const { data } = matter(raw);

// Use:
import { createServices } from '@arete/core';
const services = createServices(storage, workspaceRoot);
const meeting = await services.meetings.get(slug);
```

This is **not a rewrite** — the services exist. The backend just needs to call them instead of reimplementing everything.

### Audit Files

Full gap analysis in `dev/reimagine/audit/`:
- `holistic-audit-a.md` — Pages, routes, workspace gaps
- `holistic-audit-b.md` — Data parsing gaps, CRUD gaps
- `cli-gaps.md` — 21 CLI commands with no UI equivalent
- `core-gaps.md` — All 9 core services unused
- `skills-gaps.md` — 33 skills, 25 with no UI support
- `engineering-review.md` — Engineering priorities
- `product-review.md` — Product priorities

---

## How to Hand Off to a Fresh Agent

The fresh agent needs to read (in order):
1. This file: `dev/reimagine/V2_PLAN.md`
2. `dev/reimagine/VISION.md` — overall product direction
3. `dev/reimagine/memory/entries/2026-03-05_reimagine-v1-learnings.md` — what v1 built and why
4. `.pi/standards/build-standards.md` — coding standards
5. Then the specific files for each task (listed in each task above)

**Key facts for the fresh agent**:
- Working directory: `/Users/johnkoht/code/worktrees/arete--reimagine`
- Branch: `reimagine`
- Web app: React 18 + Vite + TypeScript + shadcn/ui + Tailwind + TanStack Query + React Router v6
- Backend: Hono + Node.js test runner (`node:test`) — NOT Express, NOT Jest
- After ANY backend change: `cd packages/apps/backend && npx tsc` to recompile dist
- After ANY web change: `cd packages/apps/web && npm run build` to verify
- Quality gates: `npm run typecheck && npm test` from repo root
- Sidebar nav: `packages/apps/web/src/components/AppSidebar.tsx`
- Route registration: `packages/apps/web/src/App.tsx` (frontend) and `packages/apps/backend/src/server.ts` (backend)
- Backend dist MUST be committed (`!packages/apps/backend/dist/` is in .gitignore exceptions)

**Critical pattern**: After changing any backend `.ts` file, ALWAYS run `cd packages/apps/backend && npx tsc` and commit the updated dist. The dist is what actually runs — the source alone is not enough.
