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

## Created

2026-03-09 — Extracted from Web Fast Follow plan
