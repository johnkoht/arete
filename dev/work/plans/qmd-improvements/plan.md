---
title: Qmd Improvements
slug: qmd-improvements
status: idea
size: unknown
tags: []
created: 2026-02-21T21:07:59.282Z
updated: 2026-02-21T21:20:13.869Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 5
---

Now I see the issue clearly. Here's what happened:

## Why Your Plan Didn't Auto-Save

The auto-save mechanism works like this:

1. **On `agent_end`**, the extension extracts todo items from the last assistant message
2. It looks for a **`Plan:` header** followed by **numbered steps** (e.g., `1. Step description`)
3. If it finds **2+ steps**, it auto-saves

**The problem**: `extractTodoItems()` requires the pattern `Plan:\n` followed by lines like `1. Step text` or `1) Step text`. My response used:

```
### Phase 1: Keep the Index Fresh (Small — 3 steps)
...
**1. Extract a reusable `refreshQmdIndex()` helper**
**2. Wire `refreshQmdIndex()` into all write-path CLI commands**
**3. Add `arete index` standalone command**

### Phase 2: ...
**4. Spike: Benchmark EntityService...**
**5. (Conditional) Inject SearchProvider...**
```

Two issues prevented extraction:
1. **Bold-wrapped numbers** — `**1. Text**` doesn't match the regex `^\s*(\d+)[.)]\s+\*{0,2}([^*\n]+)` because the `**` comes *before* the number
2. **Nested under H3 headers** — The steps were under `### Phase 1` and `### Phase 2`, not directly under a `Plan:` header. While I did have a `Plan:` line, the numbered items were structured as bold paragraphs with descriptions underneath, not clean `1. Step text` lines.

The `/plan save` command itself should still work manually — that's `handlePlanSave()` which saves `state.planText`. But since `extractTodoItems` found 0 items, `state.planText` was never populated from my response, so there was nothing to save.

## How Auto-Save Actually Works

| Trigger | What happens |
|---------|-------------|
| `agent_end` fires | Extension grabs the last assistant message text |
| `extractTodoItems(text)` | Looks for `Plan:` header + numbered lines like `1. Step` |
| If 2+ items found | Sets `state.todoItems`, `state.planText`, `state.planSize` |
| `autoSavePlan()` called | If plan mode is on, 2+ items exist, and content changed → saves to `dev/work/plans/{slug}/plan.md` |
| Slug inference | If no slug yet, `suggestPlanName()` derives one from the heading or first steps |

## Takeaway

For auto-save to work, I need to format the plan with a literal `Plan:` header and clean numbered steps:

Plan:
1. Extract a reusable `refreshQmdIndex()` helper from `qmd-setup.ts` — lightweight function that runs `qmd update` if qmd is available and a collection is configured. Non-fatal, handles missing qmd gracefully.
2. Wire `refreshQmdIndex()` into all write-path CLI commands — `arete pull fathom`, `arete meeting add/process`, and future write commands. Shows "Search index updated" on success, silent on skip.
3. Add `arete index` standalone command for manual re-indexing when users add files outside CLI. Reports index status (collection name, last run).
4. Spike: Benchmark EntityService with qmd-augmented search — time-boxed 2-3 hours, test if qmd can narrow meeting scans for people intelligence. Written findings doc with go/no-go recommendation.
5. (Conditional on spike) Inject optional SearchProvider into EntityService — use qmd as pre-filter for entity mention scanning, preserve backward compatibility with fallback provider.

That format should trigger the auto-save. Want me to also file a small improvement to make `extractTodoItems` more tolerant of bold-wrapped numbers and phase-structured plans?