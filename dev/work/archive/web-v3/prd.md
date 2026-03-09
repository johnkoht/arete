# PRD: Areté Web App V3 — Frontend UX

## Goal

Improve the Areté web app user experience with a Notion-like markdown editor, restructured People detail page, favorites support, and streamlined meeting review workflow.

## Success Criteria

- BlockEditor provides smooth Notion-like editing with clean markdown output
- People Detail page has logical single-column layout with all key info visible
- Meeting review friction reduced (fewer clicks, smarter defaults)
- No regressions in existing functionality
- All tasks include tests; quality gates pass

---

## Tasks

### V3-1: Finalize BlockEditor Component

**Description**: The BlockEditor prototype exists (`src/components/BlockEditor.tsx`). This task completes the implementation: add tests, implement lazy loading for bundle size, verify markdown round-trip fidelity, and ensure theme consistency.

**Acceptance Criteria**:
- [ ] BlockEditor is lazy-loaded via `React.lazy()` (not in main bundle)
- [ ] Markdown round-trip tests exist: import markdown → edit → export preserves content
- [ ] Keyboard shortcuts work: `Cmd+B` (bold), `Cmd+I` (italic), `/` (slash menu)
- [ ] Theme CSS variables match shadcn dark theme (background, text, borders)
- [ ] Read-only mode hides editing UI (side menu, drag handles)
- [ ] Integration test: mount BlockEditor, type content, verify onChange fires with markdown
- [ ] No lint/typecheck errors

---

### V3-2: People Detail Page Restructure  

**Description**: Replace the awkward two-column layout with a single-column, max-width design. Notes section uses BlockEditor. Add navigation guard for unsaved changes.

**Acceptance Criteria**:
- [ ] Single-column layout with `max-w-3xl` container
- [ ] Contact info displayed horizontally (email, phone, company inline)
- [ ] Open Commitments section: show up to 3 items, "See All" links to `/commitments?person={slug}`
- [ ] Recent Meetings: show up to 5 items, click opens MeetingSheet
- [ ] Intelligence section: health dot, trend icon, summary text
- [ ] Notes section uses BlockEditor with edit/save/cancel flow
- [ ] Navigation guard warns user if leaving with unsaved changes (use `useBlocker`)
- [ ] Consistent section headers (uppercase, muted color)
- [ ] Loading skeleton matches new layout
- [ ] Tests: render page, verify sections present, test edit flow

---

### V3-3: People List — Favorites

**Description**: Add ability to favorite people for quick access. Requires backend support for `favorite` field.

**Acceptance Criteria**:
- [ ] **Backend**: Person frontmatter schema supports `favorite: boolean`
- [ ] **Backend**: PATCH `/api/people/:slug` supports updating favorite status
- [ ] Star icon on each row in PeopleIndex (click toggles favorite)
- [ ] Favorites tab in PeopleIndex with count badge
- [ ] "All" tab shows favorites sorted first
- [ ] URL param support: `?category=favorites`
- [ ] Optimistic update: star click immediately reflects in UI
- [ ] Tests: toggle favorite, verify API call, verify UI update

---

### V3-4: Commitments Page Enhancement

**Description**: Add direction filter (Mine/Theirs/All), table layout, and person filter for People Detail "See All" link.

**Acceptance Criteria**:
- [ ] **Backend**: Verify `/api/intelligence/commitments` supports `person` filter param (add if missing)
- [ ] Direction subnav above status filters: Mine / Theirs / All
- [ ] Mine = `i_owe_them`, Theirs = `they_owe_me`
- [ ] Table layout with columns: Person, Commitment, Direction, Age, Actions
- [ ] Sortable by person name, by age
- [ ] Person filter via URL param: `?person=anita-law`
- [ ] Full URL structure: `?direction=mine&filter=open&person=anita-law`
- [ ] Tests: filter by direction, verify correct items shown

---

### V3-5: Meeting Review UX — Collapsible Sections + Approve All

**Description**: Reduce meeting review friction with collapsible sections, bulk approve, and smarter defaults. Note: "Default selection" means items render as checked in the UI but remain pending until explicitly confirmed — this is frontend-only behavior.

**Acceptance Criteria**:
- [ ] Collapsible sections: Action Items, Decisions, Learnings have ChevronDown toggle
- [ ] Section collapse state persisted in localStorage (`arete-review-collapsed`)
- [ ] "Approve All" button in section header: approves all items in that section
- [ ] Items render as selected (checked) by default — user unchecks bad items
- [ ] Clear visual distinction for skipped items (strikethrough or grayed out)
- [ ] Keyboard accessible: Tab through items, Enter to toggle
- [ ] Tests: collapse section, verify localStorage; bulk approve; toggle item status

---

### V3-6: Meeting Sheet (People Context)

**Description**: Replace the meeting popup in People Detail with a full-height Sheet showing meeting details.

**Acceptance Criteria**:
- [ ] Use shadcn `Sheet` component (side="right", full viewport height)
- [ ] Sheet shows: meeting title, date, summary
- [ ] Parsed items visible: decisions, learnings, actions (collapsed groups)
- [ ] Metadata: attendees, duration
- [ ] Transcript hidden or collapsed by default
- [ ] "Open full meeting" link to `/meetings/:slug`
- [ ] Click outside closes; X button closes
- [ ] Tests: open sheet, verify content rendered, close via X

---

## Out of Scope

- AI extraction quality tuning (see intelligence-tuning plan)
- User notes auto-merge
- Agent pre-selection of items
- Commitment reconciliation
- Commitment scoring/priority
- Mobile responsive (stretch goal for future)
- V3-7 Polish (manual pass after PRD completion)

---

## Dependencies

```
V3-1 (BlockEditor) → V3-2 (People Detail)
                  ↘
V3-3 (Favorites)   \
V3-4 (Commitments)  → [independent, can parallelize]
V3-5 (Meeting UX)  /
V3-6 (Meeting Sheet)
```

---

## Pre-Mortem Risks

See `dev/work/plans/web-v3/pre-mortem.md` for full analysis. Key mitigations:

1. **Bundle size**: V3-1 includes lazy loading requirement
2. **Markdown fidelity**: V3-1 includes round-trip tests
3. **Backend gaps**: V3-3, V3-4 include explicit backend verification ACs
4. **Unsaved changes**: V3-2 includes navigation guard
5. **Test coverage**: Every task includes test requirements

---

## Build Order

1. **V3-1**: BlockEditor finalization (foundation)
2. **V3-2**: People Detail restructure (depends on V3-1)
3. **V3-5**: Meeting Review UX (high-value, independent)
4. **V3-6**: Meeting Sheet (complements V3-2)
5. **V3-3**: Favorites (independent)
6. **V3-4**: Commitments (independent)
