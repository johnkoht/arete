---
title: "QMD Background Indexer (arete index --watch)"
slug: qmd-background-indexer
status: idea
size: medium
created: 2026-02-21
source: qmd-improvements post-merge discussion
---

# QMD Background Indexer

## Problem

The current auto-indexing approach covers CLI write-path commands (`arete pull`, `arete meeting add/process`) and relies on explicit `arete index` calls in skills/tools for agent-driven writes. Two gaps remain:

1. **User-direct edits** — When a user manually edits a markdown file (updates a context doc, adds observations, refines a 30/60/90 plan), the index goes stale until they remember to run `arete index`.
2. **Agent compliance** — Skills instruct agents to run `arete index` at completion, but there's no guarantee. An agent that skips the step leaves content undiscovered.

The right long-term solution is a lightweight background watcher that keeps the index current without requiring explicit triggers.

## Proposed Solution

### `arete index --watch`

A background daemon that:
- Watches key workspace directories for `.md` file changes
- Debounces writes (waits ~2s after last change before triggering)
- Runs `qmd update` in the workspace root
- Logs a brief "Index updated (3 files)" message or stays silent

**Directories to watch** (based on where content gets written):
- `resources/meetings/`
- `resources/conversations/`
- `context/`
- `projects/active/`
- `goals/`
- `people/`
- `.arete/memory/items/`

### Alternative: Post-write hook

Instead of a persistent watcher, a lightweight hook called by `arete` after any file write could trigger a debounced re-index. Less infrastructure but only covers CLI-mediated writes.

## Design Considerations

- **Debouncing**: Bulk writes (onboarding setup, rapid-context-dump) would create many events in quick succession — must debounce to avoid hammering qmd
- **PID/lifecycle management**: The watcher process needs to start/stop cleanly; `arete index --watch` to start, `Ctrl+C` or `arete index --stop` to stop
- **Graceful no-op**: If qmd isn't installed or no collection is configured, the watcher should silently exit (not error)
- **CI/test safety**: Must not interfere with `ARETE_SEARCH_FALLBACK=1` test environments
- **Resource impact**: Should be minimal CPU/battery; `qmd update` is fast but shouldn't run constantly

## Implementation Notes

- Watch implementation: Node.js `fs.watch()` or `chokidar` (already available in the ecosystem)
- Process management: Could piggyback on an existing CLI lifecycle or run as a background child process
- Status: `arete index --status` already exists and could show "Watcher: running / stopped"

## Why Deferred

The current skill-level `arete index` instructions solve the most impactful cases (bulk writes at skill completion). The background watcher is a quality-of-life improvement that adds infrastructure complexity. Worth building once the core skill workflows are stable and the indexing pattern is well-established.

## Success Criteria

- Starting `arete index --watch` keeps the index current for any file write in the workspace
- No manual `arete index` calls needed during normal PM workflows
- Zero impact on `npm test` (ARETE_SEARCH_FALLBACK=1 guards)
- Graceful handling of qmd not installed
