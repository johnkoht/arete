# Product Review: Areté Web UI Gap Analysis

> **Date**: 2026-03-07  
> **Reviewer**: Product Manager  
> **Sources**: 5 audit files (holistic-audit-a/b, cli-gaps, core-gaps, skills-gaps)

---

## Executive Summary

The Areté web UI has a **functional meeting triage workflow** but is otherwise a **read-only data viewer** that exposes perhaps 10% of the platform's actual value. The intelligence layer — the core differentiator — is completely absent from the web surface. Users can see their data but cannot *work* with it.

**The gap is not features — it's architecture.** The backend re-implements naive versions of services that already exist in `@arete/core`, bypassing the intelligence that makes Areté valuable. Closing this gap requires wiring the existing services, not building new ones.

---

## 1. USER JOURNEY GAPS

### Completely Broken Journeys

| Journey | What's Missing | User Impact |
|---------|----------------|-------------|
| **Start my day** | No daily brief or plan. Dashboard shows calendar events but no synthesis of "what matters today." No `daily-plan` skill trigger. | User opens app, sees data, but gets no guidance. Must context-switch to CLI for the actual value. |
| **Prepare for a meeting** | No meeting-prep flow. Calendar events are read-only. No "Prep" button. | User can see they have a meeting in 30 minutes but can't generate a brief without leaving the UI. |
| **Capture a meeting** | Krisp sync works. Everything else — Fathom, manual paste, Zoom, Granola — doesn't. "Add Meeting" button is disabled. | Most users don't use Krisp exclusively. Primary capture path is blocked. |
| **Plan my week/quarter** | Goals page reads existing files but cannot create or edit. No "Plan the week" or "Set quarter goals" entry point. | User can view past plans but cannot create new ones in the UI. |
| **Create/manage a project** | Projects are a read-only list on Dashboard. No detail page. No create flow. No PRD, discovery, or roadmap skill triggers. | Projects — the core PM work artifact — have no UI surface. |
| **Schedule a meeting** | No scheduling action anywhere. No availability lookup. | Basic PM workflow blocked. Must leave to CLI or calendar app. |
| **Search memory effectively** | Memory page is a paginated list. No search endpoint, no timeline, no filtering by date. | User cannot query "What did we decide about X?" without scanning manually. |
| **Close out the week** | Checkbox toggles exist but write malformed markdown. No week-review skill trigger. No close-out flow. | Week-end ritual — core PM habit — not supported. |
| **Onboard new workspace** | No first-run experience. No getting-started flow. Settings only manages API key. | New user sees empty screens. No path to value. |

### Partially Broken Journeys

| Journey | What Works | What's Missing |
|---------|------------|----------------|
| **Triage meetings** | Process button works. Staged review items work. Approve flow works. | Attendees panel always empty (parsing bug). Recordings invisible (field mismatch). Key Points not shown. |
| **View people** | List and detail pages exist. Notes editable. | No creation. No classification triage queue. No memory refresh. Open Items not parsed (commitments panel incomplete). Interaction Log ignored. |
| **View commitments** | List with filters exists. Mark-done works. | No creation. Auto-memory Open Items not synced. Direction filtering missing. Momentum view missing. |
| **View goals** | Strategy and quarter files displayed. Week priorities with checkbox. | Most of week.md ignored (Key Tasks, Theme, Phase, Scheduling Notes). Project tables not parsed. Quarter goal status/Notion links not shown. |

---

## 2. VALUE PROPOSITION

### What Areté *should* deliver (per AGENTS.md vision)

> **Excellence (ἀρετή) for product builders**  
> gain clarity → navigate ambiguity → automate mundane → move faster → unlock opportunity → think better → challenge constructively

The value is the **intelligence layer**: context injection, memory retrieval, entity resolution, briefing assembly. Skills are methods; Areté is the intelligence underneath.

### What the web UI actually delivers

- **Data viewing**: See meetings, people, goals, memory (read-only)
- **Meeting triage**: Process meetings and approve extracted items (the one complete workflow)
- **Basic navigation**: Search, filter, sort

### The gap

The web UI is a **file browser with a nice meeting workflow**. It exposes the *data* but not the *intelligence*.

The CLI gets:
- `arete brief --for "my 2pm call with Sarah"` → assembled context
- `arete daily` → synthesized daily plan
- `arete momentum` → commitment + relationship health
- `arete memory search "pricing decisions"` → relevant decisions
- `arete context --for "quarterly planning"` → ranked workspace files

The web UI gets none of this. The user sees the raw ingredients but never gets the meal.

---

## 3. MVP SCOPE

If we had to ship a **complete, usable** web UI, what's the minimum?

### Must-Have (MVP)

These represent the absolute minimum for a user to do real PM work in the web UI:

| Capability | Why | Effort Estimate |
|------------|-----|-----------------|
| **Fix parsing bugs** | Attendees empty, recordings invisible, action toggle no-op. Silent data loss is unacceptable. | Small (1-2 days) |
| **Daily brief on Dashboard** | Start-of-day is the #1 PM workflow. Without this, users won't open the app in the morning. | Medium (wire IntelligenceService) |
| **Meeting capture (paste/URL)** | Most users don't use Krisp. Blocking all other capture paths blocks adoption. | Small (skill already exists) |
| **Meeting prep trigger** | "I have a meeting in 30 minutes" is the #1 use case. Calendar events need a "Prep" action. | Small (skill already exists) |
| **Memory search** | "What did we decide about X?" is a daily query. Paginated list doesn't cut it. | Small (wire MemoryService.search) |
| **Week planning trigger** | Monday morning planning is core PM ritual. Goals page needs "Plan the week" entry point. | Small (skill already exists) |
| **Commitments from auto-memory** | Commitments panel misses most items because it only reads `commitments.json`, not auto-memory Open Items. | Medium (parse auto-memory block) |
| **Create person** | People can't be added via UI. Basic network building blocked. | Small |

### Should-Have (Complete Experience)

| Capability | Why |
|------------|-----|
| Project creation + detail pages | Projects are core PM artifacts. List-only is unusable. |
| Fathom sync + multi-integration UI | Krisp-only limits adoption. |
| Context inventory dashboard | Users need to know what's stale. |
| Momentum view | Relationship health is core intelligence. |
| Week close-out flow | End-of-week ritual completes the loop. |
| Schedule meeting action | Basic PM workflow on person pages. |

### Nice-to-Have (Deferred)

| Capability | Why Defer |
|------------|-----------|
| Onboarding wizard | Important but one-time. CLI setup works. |
| Skill/tool browser | Power-user feature. |
| Notion sync UI | Integration management can stay CLI for now. |
| Strategy/quarter editing | Read-only is acceptable for infrequent docs. |

---

## 4. FEATURE PRIORITIES

Ranked by **user value × frequency × current gap severity**:

### Tier 1: Fix What's Broken (Critical)

1. **Fix attendee_ids → display names resolution** — Every meeting shows empty attendees. High visibility bug.
2. **Fix recording field mismatch** — Recording links silently invisible.
3. **Fix action item toggle no-op** — UI exists but does nothing. Confusing.
4. **Parse Open Items from auto-memory** — Commitments panel misses most real items.

### Tier 2: Enable Core Workflows (High Priority)

5. **Daily brief on Dashboard** — Start-of-day orientation. Wire `IntelligenceService.assembleBriefing()`.
6. **Meeting prep action on calendar events** — Trigger `meeting-prep` skill from Dashboard.
7. **Add meeting (paste/URL)** — Enable `save-meeting` skill from Meetings page.
8. **Memory search** — Wire `MemoryService.search()` to `/api/memory/search`.
9. **Week planning entry point** — "Plan the week" button on Goals page.

### Tier 3: Complete the Experience (Medium Priority)

10. **Parse week.md Key Tasks** — Actual to-do list is invisible.
11. **Project detail pages + creation** — Projects need more than a list.
12. **Fathom sync button** — Multi-source meeting capture.
13. **Create person flow** — People can't be added.
14. **Momentum dashboard** — Commitment + relationship health.
15. **Week close-out flow** — End-of-week ritual.

### Tier 4: Power Features (Lower Priority)

16. **Schedule meeting action** — On person detail pages.
17. **Context inventory** — Staleness dashboard.
18. **People classification queue** — Triage unknown contacts.
19. **Integration management UI** — Currently CLI-only.
20. **Onboarding wizard** — First-run experience.

---

## 5. UX PRINCIPLES

### 1. **Intelligence First, Data Second**

The UI should lead with *synthesized intelligence*, not raw data. 

**Bad**: Dashboard shows "5 meetings today" as a list.  
**Good**: Dashboard shows "Your 2pm with Sarah needs prep — she mentioned pricing concerns twice last month."

Wire the intelligence services. Don't re-implement naive data views.

### 2. **Actions at Point of Need**

Every piece of information should have relevant actions *right there*.

- Calendar event → "Prep" button
- Meeting in list → "Process" button (✓ exists)
- Person card → "Schedule meeting" button
- Week priorities → "Plan" button, "Close week" button
- Project in list → "Open" button → detail page

**Principle**: If the user can see it, they should be able to act on it.

### 3. **Skills as Surface, Not Destination**

Skills are not pages. Skills are *actions triggered from context*.

**Bad**: A `/skills` page where users pick a skill and then provide context.  
**Good**: A "Prep" button on a calendar event that triggers `meeting-prep` with the meeting pre-filled.

The UI should present *what the user wants to do*, and skills should execute in context.

### 4. **Read-Write Parity**

If the UI displays data, users should be able to modify it (where appropriate).

Current anti-patterns:
- Goals: read-only for strategy, quarter, week (except checkboxes)
- Memory: read-only (can't add/edit/delete)
- People: read-only for frontmatter (name, role, company)
- Projects: read-only list, no detail

Either add write capability or clearly indicate why it's read-only (e.g., "Edit in Notion" link).

### 5. **One Complete Workflow is Better Than Ten Incomplete**

Meeting triage is **the one complete workflow**. It's the model for others.

Pattern:
1. List view with status filtering (All / Triage / Approved)
2. Detail view with action (Process button)
3. Review step (staged items queue)
4. Commit step (Approve)
5. Feedback (toast, status update)

Apply this pattern to: People classification, Week planning, Project finalization.

### 6. **Surface the Seams Intentionally**

Some things will stay CLI-only. That's fine — but the UI should *tell users*.

**Bad**: No mention of CLI anywhere. User thinks UI is the product.  
**Good**: Dashboard shows "Run `arete daily` for your morning brief" until the UI has that feature.

Acknowledge the CLI as a first-class citizen, not a hidden escape hatch.

### 7. **Fix Data Quality Before Adding Features**

The parsing bugs (attendees, recordings, open items) mean users *see wrong data*. This destroys trust faster than missing features.

**Principle**: A feature that shows incorrect data is worse than no feature at all.

Priority order:
1. Fix data bugs
2. Add missing data views
3. Add write actions
4. Add intelligence synthesis

---

## Architecture Recommendation

The audit revealed a fundamental issue: **the backend bypasses `@arete/core` services entirely**.

### Current State
- Backend uses raw `fs` calls and ad-hoc parsers
- 9 service classes unused (`ContextService`, `MemoryService`, `IntelligenceService`, etc.)
- Intelligence layer completely absent
- Duplicate, inconsistent implementations

### Recommended State
- Backend imports and uses `createServices()` factory
- Routes delegate to service methods
- One source of truth for parsing, intelligence, search
- CLI and web get identical intelligence

### Migration Path
1. Add `/api/services` initialization using `createServices()`
2. Replace `workspace.ts` ad-hoc calls with `FileStorageAdapter` (already partially done)
3. Replace `memory.ts` raw parsing with `MemoryService` calls
4. Replace `people.ts` raw parsing with `EntityService` calls
5. Add `/api/intelligence/brief` wired to `IntelligenceService.assembleBriefing()`
6. Add `/api/memory/search` wired to `MemoryService.search()`
7. Remove duplicate parsing code

This is not a rewrite — it's wiring what already exists.

---

## Summary

| Area | Status | Action |
|------|--------|--------|
| **Meeting triage** | ✅ Complete | Fix parsing bugs (attendees, recordings) |
| **Data viewing** | ⚠️ Partial | Fix more parsing gaps (week.md, open items) |
| **Daily workflows** | ❌ Missing | Wire intelligence services, add skill triggers |
| **Creation/editing** | ❌ Missing | Add entry points for meetings, people, projects |
| **Intelligence** | ❌ Missing | Wire `@arete/core` services to backend |

**The web UI is 10% done.** But the good news: 80% of the work is *wiring*, not *building*. The services exist. The skills exist. They just need to be connected to the web surface.

---

## Next Steps

1. **Immediate**: Create PRD for "Fix Data Quality" (parsing bugs)
2. **Short-term**: Create PRD for "Wire Intelligence Layer" (services → backend)
3. **Medium-term**: Create PRD for "Core Workflows" (daily brief, meeting prep, week planning)
4. **Planning**: Decide on project detail page scope

Would you like me to proceed with any of these PRDs?
