# Pre-Mortem: Task Integration Gaps

## Risk Analysis

### 1. File watcher reliability (Medium)
**Risk**: `fs.watch` on macOS can emit duplicate/spurious events
**Mitigation**: 500ms debounce (same as meeting watcher). Watch the `now/` directory instead of individual files to handle file creation.
**Impact if materialized**: Extra SSE events (harmless — frontend just re-fetches)

### 2. Query key mismatch (Low)
**Risk**: Frontend invalidates wrong query keys, so cache doesn't refresh
**Mitigation**: Verify actual query keys used by task hooks before implementing
**Impact if materialized**: Tasks don't refresh until manual navigation. Easy to fix.

### 3. Skill instruction ambiguity (Medium)
**Risk**: LLM agents may not follow @due tagging instructions precisely
**Mitigation**: Be explicit in SKILL.md about format, placement, and lifecycle. Include examples.
**Impact if materialized**: Tasks don't appear in Today view. Builder notices quickly.

### 4. Watcher not started if now/ dir missing (Low)
**Risk**: Fresh workspace without `now/` directory would fail to start watcher
**Mitigation**: Handle missing directory gracefully (return noop, like meeting watcher pattern)
**Impact if materialized**: No SSE events until directory created. Self-healing on restart.

## Overall Assessment

Low-risk plan. Skill changes are documentation-only. Backend watcher follows an established pattern. Frontend change is minimal.
