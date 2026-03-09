# Pre-Mortem: Areté Web App V3 — Frontend UX

**Plan Size**: Large (7 tasks)
**Risk Assessment Date**: 2026-03-07

---

## Risk Analysis

### Risk 1: BlockNote Bundle Size Impact

**Problem**: BlockNote adds ~600KB+ to the bundle (Mantine styles, core, react wrapper). The current bundle is already 1.8MB. This could significantly impact load times, especially on slower connections.

**Mitigation**: 
- Use dynamic imports for BlockEditor component so it's only loaded when needed
- Consider lazy loading the editor only when user enters edit mode
- Monitor bundle size in CI

**Verification**: Check bundle analyzer output after implementation; ensure BlockEditor isn't in the main chunk.

---

### Risk 2: Markdown Round-Trip Fidelity

**Problem**: BlockNote's markdown conversion may not perfectly preserve all markdown features (tables, code blocks with language hints, etc.). Round-trip could lose formatting or introduce artifacts.

**Mitigation**:
- Test markdown round-trip with various content types (headers, lists, code, bold/italic, links)
- Document any known limitations
- Keep original markdown stored server-side; only use BlockNote for display/edit

**Verification**: Write unit tests for markdown import/export; verify round-trip preserves content.

---

### Risk 3: Component Theming Mismatch

**Problem**: BlockNote uses Mantine styling system, but the app uses shadcn/ui + Tailwind. Custom CSS overrides may be fragile or incomplete, leading to visual inconsistencies (wrong colors, fonts, spacing).

**Mitigation**:
- Create comprehensive CSS variable overrides matching shadcn theme
- Test in both light and dark modes (currently dark only, but plan for future)
- Document theming approach in LEARNINGS.md

**Verification**: Visual inspection of editor in context; check hover states, focus states, menus.

---

### Risk 4: State Management Complexity in Edit Mode

**Problem**: The PersonDetailPage now has BlockEditor with edit mode state. If user navigates away while editing, unsaved changes could be lost without warning. BlockNote's internal state and React state need to stay in sync.

**Mitigation**:
- Add "unsaved changes" warning before navigation (use React Router's `useBlocker`)
- Keep editContent state minimal; let BlockNote manage internal state
- Clear edit state properly on save/cancel

**Verification**: Test navigation during edit; verify warning appears.

---

### Risk 5: Backend API Not Prepared for New Features

**Problem**: V3-3 (Favorites) requires new `favorite` field in person schema and PATCH endpoint. V3-4 (Commitments) needs person filter. Backend changes weren't mentioned in the plan.

**Mitigation**:
- For each frontend task, identify backend requirements first
- V3-3: Add `favorite` to person frontmatter parsing; add PATCH /people/:slug/favorite endpoint
- V3-4: Verify commitments API already supports person filter, or add it
- V3-2: Verify person detail API returns `rawContent` for notes editing

**Verification**: Read backend routes before each task; check existing API response shapes.

---

### Risk 6: Scope Creep in Meeting Review UX (V3-5)

**Problem**: "Default Selection" (items default to approved) is a significant behavior change that affects the entire review workflow. It might need backend changes to support a different initial status.

**Mitigation**:
- Clarify: Is this frontend-only (set approved on render) or backend change (send approved status on first load)?
- Start with frontend-only approach; backend returns pending, frontend treats as approved UI-wise
- Document the decision for future reference

**Verification**: Confirm approach before implementation; test with real meeting data.

---

### Risk 7: Test Coverage for UI Components

**Problem**: Frontend testing patterns aren't well established in this codebase. Vitest is configured but most components lack tests. New BlockEditor, layout changes, and review UX need testing.

**Mitigation**:
- Focus on critical user interactions: save/cancel, approval flows, navigation
- Use @testing-library/react for component tests
- At minimum: test BlockEditor markdown round-trip, test ReviewItems status changes
- Check `packages/apps/web/src/test/` for existing patterns

**Verification**: Each task includes test requirements; CI runs tests.

---

### Risk 8: V3-1 is Foundation — If It Breaks, Everything Breaks

**Problem**: V3-1 (BlockEditor) is a dependency for V3-2 (People Detail notes). If BlockEditor has issues, the whole plan is blocked. Also, the prototype was already built but not fully tested.

**Mitigation**:
- V3-1 task must include comprehensive testing before V3-2 starts
- Consider: run the existing prototype in dev, test UX manually before formalizing
- If BlockEditor issues emerge, can fall back to TipTap temporarily

**Verification**: V3-1 marked complete only after manual UX validation and tests pass.

---

## Summary

| Risk | Category | Severity | Mitigation Owner |
|------|----------|----------|------------------|
| Bundle size | Performance | Medium | Developer (V3-1) |
| Markdown fidelity | Data integrity | Medium | Developer (V3-1) |
| Theme mismatch | UX | Low | Developer (V3-1) |
| Unsaved changes | UX | Medium | Developer (V3-2) |
| Backend API gaps | Integration | High | Developer (V3-3, V3-4) |
| Scope creep (V3-5) | Scope | Medium | Orchestrator |
| Test coverage | Quality | Medium | All tasks |
| V3-1 foundation | Dependencies | High | Developer (V3-1) |

**Total risks identified**: 8
**Categories covered**: Performance, Data Integrity, UX, Integration, Scope, Quality, Dependencies

---

## Recommended Mitigations to Apply

1. **Every task**: Include explicit test requirements and run quality gates
2. **V3-1**: Add markdown round-trip tests; document theming approach; monitor bundle size
3. **V3-2**: Add navigation guard for unsaved changes
4. **V3-3, V3-4**: Check backend APIs first; add endpoints if missing
5. **V3-5**: Clarify default selection approach before implementing
6. **All**: Read `.pi/expertise/web/PROFILE.md` and `LEARNINGS.md` before each task

**Ready to proceed with these mitigations?**
