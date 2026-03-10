---
title: "Consolidate Intelligence Commands into `search`"
slug: consolidate-search-command
status: draft
size: medium
tags: [cli, intelligence, search, ux]
created: "2026-03-10"
updated: "2026-03-10"
notes: "Simplify overlapping search commands (context --for, memory search, memory timeline) into single `arete search` command"
---

# Consolidate Intelligence Commands into `search`

## Goal

Simplify the intelligence CLI by consolidating overlapping search commands into a single `arete search` command.

---

## Problem

Currently there are multiple overlapping intelligence commands:
- `context --for "query"` — QMD/keyword search across workspace
- `memory search "query"` — keyword search on 3 files (decisions, learnings, observations)
- `memory timeline "query"` — temporal view of memory + meetings

These are confusing because:
1. They overlap in functionality
2. Users don't know which to use
3. None of them actually answer questions (retrieval only)

## Proposal

Consolidate into a single `search` command:

```bash
# Primary usage - search everything
arete search "why did we decide X"

# Scoped search
arete search "query" --scope context     # context files only
arete search "query" --scope memory      # decisions/learnings only  
arete search "query" --scope meetings    # meetings only
arete search "query" --scope projects    # project docs only

# Temporal view
arete search "query" --timeline          # show results over time
arete search "query" --timeline --days 30

# AI-powered answer (optional)
arete search "query" --answer            # synthesize answer from results
```

## What Changes

### New
- `arete search` command with scope/timeline/answer flags
- Uses existing QMD/SearchProvider infrastructure
- `--answer` flag calls AIService to synthesize response

### Deprecated (but keep working for now)
- `context --for` → prints deprecation notice, suggests `search`
- `memory search` → prints deprecation notice, suggests `search --scope memory`
- `memory timeline` → prints deprecation notice, suggests `search --timeline`

### Unchanged
- `context --inventory` — different purpose (workspace hygiene)
- `resolve` — different purpose (disambiguation)
- `brief` — different purpose (comprehensive briefing, separate plan)

## Implementation Steps

### Phase 1: Create search command
1. Create `packages/cli/src/commands/search.ts`
2. Implement core search using existing `SearchProvider`
3. Add `--scope` flag with options: all, context, memory, meetings, projects, people
4. Add `--timeline` flag reusing `MemoryService.getTimeline()` logic
5. Add `--json` output format
6. Wire into CLI index

### Phase 2: Add --answer flag
1. Check `services.ai.isConfigured()`
2. If configured + `--answer`: pass results to AIService with synthesis prompt
3. If not configured + `--answer`: warn and show results only
4. Design prompt template for answer synthesis

### Phase 3: Deprecation notices
1. Add deprecation warnings to `context --for`
2. Add deprecation warnings to `memory search`
3. Add deprecation warnings to `memory timeline`
4. Update GUIDE.md and documentation

### Phase 4: Update skills/docs
1. Update `_authoring-guide.md` to recommend `search`
2. Update AGENTS.md CLI reference
3. Update any skills that reference old commands

## Testing

- [ ] `search "query"` returns results from all scopes
- [ ] `--scope memory` limits to decisions/learnings/observations
- [ ] `--scope meetings` limits to resources/meetings/
- [ ] `--timeline` shows temporal view with dates
- [ ] `--answer` synthesizes response when AI configured
- [ ] `--answer` warns gracefully when AI not configured
- [ ] Deprecated commands still work but show warning
- [ ] `--json` output works for all variants

## Open Questions

1. Should `--answer` be the default behavior (with `--no-answer` to disable)?
2. Should we support `--limit` for result count?
3. Should `--scope` accept multiple values? (`--scope memory,meetings`)

## Success Criteria

- Single command for all search use cases
- Clear mental model: `search` finds things, `brief` gives overview
- AI synthesis available but optional
- Old commands still work (deprecation path)
