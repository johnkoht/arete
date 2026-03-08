# Engineering Review: UI Gap Audit

> **Reviewer**: Engineering Lead  
> **Date**: 2026-03-07  
> **Sources**: holistic-audit-a.md, holistic-audit-b.md, cli-gaps.md, core-gaps.md, skills-gaps.md

---

## Executive Summary

The web UI has **two meetings-related flows working well** (Krisp sync, meeting processing) but suffers from:
1. **Critical data bugs** - fields silently fail to display
2. **Architecture bypass** - backend ignores `@arete/core` services, re-implementing everything with raw fs
3. **Narrow scope** - only 2 of 33 skills have full UI support; core intelligence layer has zero exposure

The backend and CLI were built independently, resulting in two parallel implementations that don't share code.

---

## 1. CRITICAL BUGS

These are broken today and should block any feature work.

### BUG-1: `recording` field mismatch — recordings never display
**Severity**: High  
**Impact**: Every meeting with a recording shows "No recording available"  
**Root cause**: Backend reads `recording_link` but all meeting files use `recording:`  
**Fix**: Check both field names, prefer non-empty value  
**Effort**: 1 line change in `workspace.ts`  
**Source**: holistic-audit-b.md §1

### BUG-2: `attendee_ids` not resolved — attendees always empty
**Severity**: High  
**Impact**: Meeting list shows empty avatar stacks; metadata panel shows no attendees  
**Root cause**: Backend expects `attendees: [{name, email}]` array but files use `attendee_ids: [slug]`  
**Fix**: Resolve slugs via people files lookup  
**Effort**: ~20 lines in `workspace.ts`  
**Source**: holistic-audit-b.md §2

### BUG-3: Action item toggle is a no-op
**Severity**: Medium  
**Impact**: Approved meeting checkboxes render but do nothing; user sees toast "not yet implemented"  
**Root cause**: `onToggleActionItem` has a `// TODO: Implement` comment  
**Fix**: Implement the toggle handler (update meeting file)  
**Effort**: ~30 lines  
**Source**: holistic-audit-b.md §7

### BUG-4: Week priority toggle writes malformed markdown
**Severity**: Medium  
**Impact**: Each toggle appends a bare `[x]` line instead of updating the checkbox  
**Root cause**: PATCH handler appends `[x]` at end of section body instead of toggling existing checkbox  
**Fix**: Regex-replace the specific priority's checkbox state  
**Effort**: ~15 lines  
**Source**: holistic-audit-b.md §Goals §6

---

## 2. ARCHITECTURE ISSUES

These require design changes, not just fixes.

### ARCH-1: Backend bypasses `@arete/core` entirely
**Severity**: Critical  
**Impact**: No intelligence layer in web UI; CLI and web have different behaviors  
**Evidence**: Backend uses only 8 low-level utility functions from core; all 9 service classes are unused  
**Root cause**: Routes were written with raw `fs` calls instead of service injection  
**Consequence**: 
- No `ContextService`, `IntelligenceService`, `MemoryService`, `EntityService` in web
- Memory search, timeline, briefing — all unavailable
- Momentum, health scoring, person signals — all unavailable
- Semantic search — unavailable (backend uses naive keyword scan)

**Fix**: Refactor routes to use `createServices()` factory and inject service instances  
**Effort**: Large (architectural refactor across all routes)  
**Source**: core-gaps.md

### ARCH-2: CLI and backend are parallel implementations
**Severity**: High  
**Impact**: Same capability exists in both with different behavior/coverage  
**Examples**:
- Memory: CLI uses Orama search; backend parses files with regex
- People: CLI has `index`, `intelligence digest`, `memory refresh`; backend has naive scan
- Commitments: CLI has `list/resolve`; backend has summary-only + partial PATCH

**Fix**: Backend should call into core services (same as CLI) instead of re-implementing  
**Effort**: Addressed by ARCH-1 fix  
**Source**: cli-gaps.md §3

### ARCH-3: Meeting data model inconsistencies
**Severity**: Medium  
**Impact**: Rich meeting content (Key Points, People Recommendations) invisible  
**Evidence**:
- `## Key Points` parsed for status detection but never extracted/displayed
- `## People Recommendations` not parsed at all
- Approved items from staged flow vs old body format can diverge

**Fix**: Extend `FullMeeting` type; extract and render structured sections  
**Effort**: Medium  
**Source**: holistic-audit-b.md §3-4

### ARCH-4: Week/Goals files under-parsed
**Severity**: Medium  
**Impact**: Most of week.md content is invisible (Key Tasks, Theme, Phase, Daily Progress)  
**Evidence**: Only numbered priorities and commitments parsed; 8 other sections ignored  
**Fix**: Extend goals parser; add UI sections for Key Tasks, Theme/Phase  
**Effort**: Medium  
**Source**: holistic-audit-b.md §Goals

### ARCH-5: Person files under-parsed
**Severity**: Medium  
**Impact**: Interaction Log (manual history) not displayed; Open Items from auto-memory not used  
**Evidence**: Auto-memory Open Items parsed but not wired to UI; Interaction Log in notes blob  
**Fix**: Parse Interaction Log as timeline; merge Open Items into commitments display  
**Effort**: Medium  
**Source**: holistic-audit-b.md §People

---

## 3. QUICK WINS

High-value, low-effort changes.

| ID | Change | Effort | Impact | Source |
|----|--------|--------|--------|--------|
| QW-1 | Fix `recording` field alias | 1 line | High - recordings visible | BUG-1 |
| QW-2 | Resolve `attendee_ids` to names | 20 lines | High - attendees visible | BUG-2 |
| QW-3 | Extract `weekOf` from `# Week N:` heading | 5 lines | Low - week subtitle shows | holistic-audit-b §Goals §5 |
| QW-4 | Parse `Theme:` and `Phase:` from week.md | 10 lines | Medium - week context visible | holistic-audit-b §Goals §1 |
| QW-5 | Fix week priority toggle | 15 lines | Medium - checkbox works | BUG-4 |
| QW-6 | Add `observations.md` to memory route | 3 lines | Low - complete memory feed | core-gaps.md §3 |
| QW-7 | Parse quarter goal Status + Notion link | 15 lines | Low - goal status visible | holistic-audit-b §Goals §3 |
| QW-8 | Render strategy.md as markdown, not `<pre>` | 5 lines | Medium - strategy readable | holistic-audit-b §Goals §4 |

---

## 4. MAJOR WORK ITEMS

Features requiring significant implementation.

### MAJOR-1: Wire backend to use `@arete/core` services
**Scope**: Refactor all routes to use `createServices()` factory  
**Why**: Enables intelligence layer (briefing, context, semantic search, momentum)  
**Dependencies**: None  
**Estimate**: 2-3 days  
**Unlocks**: MAJOR-2 through MAJOR-6

### MAJOR-2: Add missing API endpoints
| Endpoint | CLI equivalent | Priority |
|----------|---------------|----------|
| `GET /api/commitments` (full list) | `commitments list` | P0 |
| `PATCH /api/commitments/:id/resolve` | `commitments resolve` | P0 |
| `GET /api/daily` | `daily` | P1 |
| `GET /api/memory/search?q=` | `memory search` | P1 |
| `GET /api/memory/timeline?q=` | `memory timeline` | P2 |
| `GET /api/momentum` | `momentum` | P2 |
| `POST /api/people/:slug/memory/refresh` | `people memory refresh` | P2 |
| `GET /api/availability/:slug` | `availability find` | P3 |
| `POST /api/pull/:integration` | `pull` | P2 |
| `GET /api/status` | `status` | P3 |

**Estimate**: 1-2 days (after MAJOR-1)

### MAJOR-3: Projects surface area
**Current**: Dashboard shows read-only project list; no detail, create, or archive  
**Needed**:
- `GET /api/projects/:slug` — project detail
- `POST /api/projects` — create project (trigger skill)
- `POST /api/projects/:slug/finalize` — finalize project
- Project detail page with README, inputs, outputs
- Project creation wizard (PRD, discovery, competitive, general)

**Estimate**: 3-4 days  
**Source**: holistic-audit-a.md §Projects, skills-gaps.md §Projects

### MAJOR-4: Context/Resources surface area
**Current**: Zero UI for `context/`, `resources/conversations/`, `resources/notes/`  
**Needed**:
- Context files page (view/edit workspace context)
- Resources browser (conversations, notes, reviews)
- Import flow (rapid-context-dump skill trigger)

**Estimate**: 2-3 days  
**Source**: holistic-audit-a.md §No UI at all

### MAJOR-5: People CRUD + intelligence
**Current**: People are read-only; classification queue missing  
**Needed**:
- `POST /api/people` — create person
- `DELETE /api/people/:slug` — delete person
- `PATCH /api/people/:slug` — edit frontmatter (name, role, company)
- Classification queue UI for unclassified contacts
- Schedule meeting action on person detail

**Estimate**: 2 days  
**Source**: holistic-audit-b.md §People, skills-gaps.md

### MAJOR-6: Skill triggers in UI
**Current**: Only 2 of 33 skills have UI entry points (krisp sync, process-meetings)  
**Needed**: Add trigger buttons for high-value skills:

| Skill | Location | UI element |
|-------|----------|------------|
| `meeting-prep` | Dashboard calendar events | "Prep" button |
| `save-meeting` | Meetings page | "Add meeting" paste flow |
| `daily-plan` | Dashboard | "Plan my day" button |
| `week-plan` | Goals page | "Plan the week" button |
| `week-review` | Goals page | "Close the week" button |
| `create-prd` | Dashboard projects | "New project" button |
| `fathom` | Meetings page | "Sync Fathom" button |
| `schedule-meeting` | Person detail | "Schedule meeting" button |

**Estimate**: 1 day per skill (varies by complexity)  
**Source**: skills-gaps.md

### MAJOR-7: Onboarding flow
**Current**: No first-run detection; Settings only manages API key  
**Needed**:
- First-run detection (check workspace state)
- Onboarding wizard (getting-started skill trigger)
- Integration setup flow (calendar, Fathom, Notion)

**Estimate**: 2 days  
**Source**: skills-gaps.md §Onboarding

---

## 5. RECOMMENDED PRIORITY ORDER

### Phase 1: Fix Critical Bugs (Day 1)
1. ✅ BUG-1: `recording` field alias
2. ✅ BUG-2: `attendee_ids` resolution
3. ✅ BUG-3: Action item toggle
4. ✅ BUG-4: Week priority toggle

These are broken features that damage user trust.

### Phase 2: Quick Wins (Day 1-2)
5. QW-3 through QW-8 (weekOf, Theme/Phase, observations, strategy markdown)

Low effort, visible improvement.

### Phase 3: Architecture Foundation (Days 3-5)
6. MAJOR-1: Wire backend to `@arete/core` services

This is the keystone. Without it, we're building on sand. Every new feature would either:
- Duplicate core service logic (more debt)
- Be blocked waiting for the right foundation

### Phase 4: API Completeness (Days 6-7)
7. MAJOR-2: Add missing API endpoints (commitments, daily, memory search, pull)

With services wired, these become thin route handlers.

### Phase 5: Feature Expansion (Week 2+)
8. MAJOR-6: Skill triggers (meeting-prep, daily-plan, save-meeting)
9. MAJOR-5: People CRUD + intelligence
10. MAJOR-3: Projects surface area
11. MAJOR-4: Context/Resources pages
12. MAJOR-7: Onboarding flow

---

## Appendix: Files to Touch

### Bug Fixes
- `packages/apps/backend/src/services/workspace.ts` — BUG-1, BUG-2
- `packages/apps/web/src/pages/MeetingDetail.tsx` — BUG-3
- `packages/apps/backend/src/routes/goals.ts` — BUG-4

### Architecture Refactor
- `packages/apps/backend/src/routes/*.ts` — all routes for MAJOR-1
- `packages/apps/backend/src/services/` — add service factory wiring
- `packages/apps/backend/src/index.ts` — initialize services on startup

### New Endpoints
- `packages/apps/backend/src/routes/commitments.ts` — new file for full commitments CRUD
- `packages/apps/backend/src/routes/daily.ts` — new file for daily brief
- `packages/apps/backend/src/routes/memory.ts` — extend with search/timeline

### New UI Pages
- `packages/apps/web/src/pages/ProjectDetail.tsx` — new
- `packages/apps/web/src/pages/ContextBrowser.tsx` — new
- `packages/apps/web/src/pages/ResourcesBrowser.tsx` — new

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| MAJOR-1 breaks existing routes | Medium | High | Incremental migration; feature flags |
| Service initialization adds latency | Low | Medium | Lazy init; cache services |
| CLI and backend diverge further | High | High | Block new features until MAJOR-1 |
| Skills require chat interface | High | Medium | Consider embedded chat widget |

---

## Recommendation

**Do not add new features until MAJOR-1 is complete.**

Every feature added before backend uses core services will:
1. Duplicate logic that already exists in `@arete/core`
2. Create behavior differences between CLI and web
3. Increase technical debt for the eventual refactor

The bug fixes (Phase 1) should ship immediately — they're isolated and high-value. Then invest in the architecture foundation before expanding scope.
