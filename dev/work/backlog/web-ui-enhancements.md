# Web UI Enhancements Backlog

Small improvements deferred from Web Fast Follow plan.

---

## SearchableSelect Keyboard Navigation

**Priority:** Low  
**Effort:** Small

Add full keyboard navigation to the SearchableSelect component:
- Arrow Up/Down to navigate options
- Enter to select focused option
- Currently only Escape is implemented

**Files:** `packages/apps/web/src/components/ui/searchable-select.tsx`

---

## Unit Tests for New Components

**Priority:** Medium  
**Effort:** Small

Add unit tests for components created during Web Fast Follow:

1. **SearchableSelect**
   - Selection callback receives correct id
   - Clear button calls onSelect(null)
   - Search filtering works
   - Escape closes popover
   - Empty state renders

2. **renderMarkdownText** (ParsedItemsSection)
   - Bold rendering: `**text**` → `<strong>`
   - Plain text unchanged
   - Snake_case NOT rendered as italic

**Files:** New test files in `packages/apps/web/src/`

---

## Agent Flow: Project Context

**Priority:** Low  
**Effort:** Small

Update meeting processing prompts to mention project context:
- Agent prompt mentions project when meeting has one
- User can override per-item or globally
- "No Project" option available

**Files:** `packages/runtime/skills/` meeting processing templates

---

## Winddown review UI (`/review` for the daily winddown)

**Priority:** Medium (post markdown-approval-surface)
**Effort:** Large

A visual review/approve surface for the daily winddown — like the meeting review
UI — showing each meeting's recommended / skipped / uncertain items with the
agent's reasoning, tier badges (blocker/high/normal), and approve/skip controls.
The eventual nicer skin on the CLI checkbox approval flow.

**Key constraints (decided 2026-06-12):**
- Build the **markdown checkbox approval doc FIRST**
  (`dev/work/plans/winddown-approval-doc/`). It defines the approve-state data
  model (item ID → recommendation → decision → reason). This UI is a *renderer
  over that same model*, not a fresh approval implementation.
- As a pure **review/approve** surface it is UNBLOCKED — the `review.ts` routes
  already read `stagedSections` + `stagedItemStatus` and write approved/skipped
  without re-processing.
- It is blocked ONLY if it ever **re-processes/re-extracts** a meeting: that path
  (`runProcessingSession` → backend `agent.ts`) is still legacy-only until the
  backend extraction migration (chef-holistic-reconcile W4–W6). Keep this UI
  review-only, or do the backend migration first.

**Files (likely):** `packages/apps/web/` (new winddown review view),
`packages/apps/backend/src/routes/review.ts` (extend), reads same frontmatter
the CLI `/winddown apply` writes.

---

## Created

2026-03-09 — Extracted from Web Fast Follow plan
2026-06-12 — Added winddown review UI (idea 2 from extraction-simplification thread)
