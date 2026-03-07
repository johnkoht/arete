# How to Use & Test — Areté Reimagine v2

> Branch: `reimagine` | Built: 2026-03-05

---

## Starting the App

```bash
# From the worktree root
cd /Users/johnkoht/code/worktrees/arete--reimagine

# Start the backend + web server (serves the built web app)
arete view

# Or start dev servers separately for hot reload:
cd packages/apps/backend && node dist/index.js   # backend on :3847
cd packages/apps/web && npm run dev               # Vite dev server on :5173
```

The web app will be at `http://localhost:5173` (dev) or served via the backend at `http://localhost:3847`.

---

## What's New in v2 — Feature Tour

### 1. Settings Page (`/settings`)

The gear icon at the bottom of the sidebar now opens a real Settings page.

**Test it**:
1. Click the ⚙️ gear icon in the sidebar → lands on `/settings`
2. Enter your Anthropic API key (starts with `sk-ant-`) in the input → click Save
3. The key is stored at `.credentials/anthropic-api-key` and takes effect immediately
4. The masked key (`sk-ant-api03-...••••••••••••`) appears with a Remove button
5. Click Remove → confirm dialog → key is deleted
6. API key status is preserved across server restarts (reads from file on startup)

**Why it matters**: Previously you had to set `ANTHROPIC_API_KEY` as an env var or restart the server. Now you can configure it from the UI.

---

### 2. People Page — Category Tabs (`/people`)

Four filter tabs above the people table: **All · Internal · Customer · User**

**Test it**:
1. Go to `/people`
2. Click **Internal** → table filters to internal people only; count updates
3. Type a name in the search box → tab counts update dynamically to show matches per category
4. Click **Customer** → shows only customers matching your search
5. Notice the URL: `?category=customer` — share or reload and the tab is preserved
6. The commitment filter (`?filter=overdue`) coexists with `?category=` independently

---

### 3. Person Detail Page (`/people/:slug`)

Clicking a person now navigates to a full detail page instead of a side drawer.

**Test it**:
1. Go to `/people` → click any person row → lands on `/people/their-slug`
2. **Left panel**: Contact info (email, company), Intelligence (stances, repeated asks/concerns)
3. **Right panel**: Meeting History (all meetings, newest first), Open Commitments, Notes
4. **Meeting History**: click any meeting row → a Sheet drawer slides in with the meeting summary and body; "Open full meeting →" link goes to `/meetings/:slug`
5. **Notes section**: click **Edit** → TipTap editor appears; type `## heading` → it becomes an H2; select text → bubble menu (Bold/Italic/H2/H3/Code); click **Save** → content writes back to the person's `.md` file (frontmatter preserved); click **Cancel** → discards changes
6. **Back button**: `← People` returns to `/people` (preserves your category tab if you came from one)

---

### 4. Interactive Weekly Priorities (`/goals`)

The weekly priorities are now interactive checkboxes.

**Test it**:
1. Go to `/goals` → scroll to the **This Week** section
2. Click a priority checkbox → it toggles immediately; the actual `now/week.md` file is updated on disk
3. Done items appear with strikethrough text and muted color
4. Open `now/week.md` in your editor to confirm the `[x]` was written (or removed)
5. On error (e.g. file not writable): the checkbox reverts and a toast appears

**File format**: The toggle adds/removes a `[x]` line in the priority's section body — no structural changes to the file, preserves all other content.

---

### 5. Markdown Editor (TipTap)

The `MarkdownEditor` component is wired into the Person Detail Notes section (see above). It's also reusable for future integrations.

**Key behaviors**:
- Type `## text` → converts to H2 as you type (markdown shortcuts via StarterKit)
- Select text → bubble menu appears (Bold, Italic, H2, H3, Code)
- Read-only mode renders the same formatted output without the editor chrome
- Saves in markdown format back to the source file

---

### 6. Polish & Empty States

Better empty state messages throughout:
- **Dashboard → Today's Meetings**: "Connect your calendar with `arete pull calendar` to see today's meetings here."
- **Dashboard → Recent Activity**: "Activity appears as meetings are processed with `arete view` running."
- **People → empty search**: "No people match 'your query'. Try a different name or clear the filter."
- **Memory → empty**: "No decisions or learnings captured yet. Process your meetings with `arete view` to start building memory."

---

## Running Tests

```bash
# From repo root — core + CLI tests
npm run typecheck && npm test

# Backend tests
cd packages/apps/backend && npm test

# Web build check
cd packages/apps/web && npm run build
```

Expected: 1436 core tests pass, 147 backend tests pass, web build ~958 KB (TipTap adds size).

---

## Known Limitations

- **Bundle size**: The web bundle is ~958 KB (up from 482 KB) due to TipTap. Consider code-splitting if load time becomes a concern.
- **Meeting scan for allMeetings**: Scans all `resources/meetings/*.md` files on each person detail load. Fine for typical workspace sizes; would need indexing for 500+ meetings.
- **API key restart**: The key is applied to `process.env` immediately on save (no restart needed for new requests). If the server was already mid-processing when the key was saved, those in-flight requests used the old env state.
