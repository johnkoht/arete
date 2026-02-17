# Plan Lifecycle Enhancements

**Status**: Backlog
**Source**: PRD plan-lifecycle-system (v1 complete 2026-02-16)

## Future Ideas

### Cross-Model Review via Subagent
When Pi supports a Task tool, enable true cross-model review: spawn a subagent with a different model to review the plan, then synthesize feedback. Currently limited to `pi.setModel()` which changes the current session's model.

### Plan Templates
Pre-built plan structures for common work types:
- **Discovery plan**: Research → interviews → synthesis → recommendations
- **Refactor plan**: Audit → design → migrate → verify → cleanup
- **Integration plan**: Research API → design interface → implement → test → document

### Plan Analytics
Track how long plans take, gate skip rate, iteration count, etc. Could feed into size estimation and risk assessment.

### Auto-Detect Complexity Keywords
Beyond the static `COMPLEXITY_KEYWORDS` list, use LLM analysis of the plan text to assess complexity. Could improve size classification accuracy.

### Timed Pre-Mortem Nudge
For medium plans, if the user hasn't run a pre-mortem after N minutes of planning, surface a gentle reminder.

### Backlog Auto-Marking on Plan Completion
When a plan completes, check if it references a backlog item (`backlog_ref` field) and offer to mark it as complete/done.

### Plan Diff on Resume
When opening a saved plan after code changes, show what's changed in the codebase since the plan was created — relevant files modified, new tests, etc.
