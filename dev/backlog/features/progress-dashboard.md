# Progress Dashboard (arete prd status)

**Status**: Needs design  
**Priority**: Medium  
**Effort**: Small (2-3 tasks)  
**Owner**: TBD

---

## Overview

Add `arete prd status` CLI command to show PRD execution progress at a glance. Useful for long-running PRDs (10+ tasks) to track progress without manually reading prd.json.

---

## Problem

During PRD execution:
- ❌ No quick way to see "where are we?"
- ❌ Must read prd.json manually to see progress
- ❌ No visibility into estimated time remaining
- ❌ Can't see if something is stuck

**For orchestrator**:
- Useful between tasks: "Am I on track?"
- Useful for user: "What's the status?" → quick command instead of scrolling through chat

**For user**:
- Peek at progress in terminal while agent works
- Share status with others ("we're 7/12 complete, all tests passing")

---

## Solution

Add `arete prd status` command with two output modes:

### Terminal Output (Default)

```bash
$ arete prd status

📋 PRD: intelligence-and-calendar
Branch: feature/intelligence-and-calendar

Progress: ████████████░░░░░░░░ 8/12 tasks (67%)

✅ Complete: 8 tasks
   A1 (search-interface) → 85d467c
   A2 (fallback-provider) → 400a3e3
   A3 (qmd-provider) → 77a1489
   B1 (memory-retrieval) → ff6d8cb
   B2 (context-injection) → d53ad4d
   B3 (briefing-upgrade) → 522554e
   C1 (calendar-interface) → 005fbb1
   C2 (ical-buddy-provider) → b8f4d3c

🔄 In Progress: C3 (pull-calendar-command)
   Started: 15 minutes ago
   
⏳ Pending: 3 tasks
   C4 (calendar-config)
   D1 (daily-plan-integration)
   D2 (docs-and-registry)

Tests: 293/293 passing ✅
Last commit: 12 minutes ago (b8f4d3c)
Velocity: ~18 min/task avg
ETA: ~45 minutes (3 tasks remaining)
```

### JSON Output (--json)

```bash
$ arete prd status --json

{
  "prdName": "intelligence-and-calendar",
  "branch": "feature/intelligence-and-calendar",
  "progress": {
    "total": 12,
    "completed": 8,
    "pending": 3,
    "failed": 0,
    "inProgress": "c3-pull-calendar-command",
    "percentComplete": 67
  },
  "tests": {
    "passing": 293,
    "total": 293,
    "passRate": 100
  },
  "velocity": {
    "avgMinutesPerTask": 18,
    "totalElapsedMinutes": 144,
    "estimatedRemainingMinutes": 45
  },
  "lastCommit": {
    "sha": "b8f4d3c",
    "minutesAgo": 12
  },
  "tasks": [
    {
      "id": "a1-search-interface",
      "status": "complete",
      "commitSha": "85d467c",
      "attemptCount": 1
    },
    // ... more tasks
  ]
}
```

---

## Tasks (Draft)

1. **Status Command Implementation**
   - Read prd.json (current state)
   - Read progress.txt (timing data)
   - Compute velocity (avg time per task)
   - Estimate ETA (remaining tasks × avg time)
   - Format terminal output (progress bar, colors)
   - Format JSON output (machine-readable)

2. **Git Integration**
   - Detect current branch
   - Get last commit time (for staleness detection)
   - Count commits for this PRD (optional: show commit graph)

3. **Testing & Documentation**
   - Tests with mock prd.json files
   - Help text for `arete prd status --help`
   - Update CLI documentation

---

## Features

### Core
- Task progress (X/Y complete, percent)
- Tests status (passing/total)
- Current task (in progress)
- Velocity tracking (avg time per task)
- ETA calculation

### Nice-to-Have
- Progress bar visualization
- Staleness detection ("Last activity: 2 hours ago - might be stuck?")
- Commit graph (show commit SHAs per task)
- Error highlighting (failed tasks in red)
- Time breakdown (how long did each phase take?)

---

## Design Decisions

### Where to Track Timing?

**Option 1**: progress.txt (current)
- ✅ Already has timestamps
- ❌ Free-form text, harder to parse

**Option 2**: prd.json metadata
- ✅ Structured data
- ✅ Easy to parse
- ❌ Need to add timestamp fields

**Recommendation**: Enhance prd.json with timing:
```json
{
  "id": "a1-search-interface",
  "status": "complete",
  "startedAt": "2026-02-09T16:00:00Z",
  "completedAt": "2026-02-09T16:15:00Z",
  "durationMinutes": 15
}
```

### ETA Calculation

- **Simple**: `(total - completed) × avgTimePerTask`
- **Weighted**: Account for task complexity (some tasks are bigger)
- **Recommendation**: Start simple, enhance later

### Live Updates?

- **Option 1**: Static snapshot (run command, see current state)
- **Option 2**: Live updating (watch mode)
- **Recommendation**: Static for v1, add `--watch` later

---

## Dependencies

- ✅ prd.json schema stable
- ⚠️ May need: progress.txt parsing or prd.json timing fields

---

## Benefits

- **Visibility**: Quick "where are we?" without reading prd.json
- **Planning**: "Do I have time for this PRD before lunch?"
- **Sharing**: Copy-paste status to Slack/email
- **Debugging**: "Task X is taking way longer than average"

---

## Open Questions

1. **Timing data**: Store in prd.json or keep in progress.txt?
2. **Watch mode**: Should we add live updates?
3. **Alerts**: Should we detect "stuck" tasks and alert?

---

## Related

- **prd.json**: `.cursor/build/autonomous/prd.json` (data source)
- **progress.txt**: `.cursor/build/autonomous/progress.txt` (timing data)
- **execute-prd**: Could integrate status updates during execution
