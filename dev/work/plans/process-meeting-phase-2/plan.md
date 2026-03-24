---
title: Process Meeting Phase 2
slug: process-meeting-phase-2
status: idea
size: unknown
tags: []
created: 2026-03-24T03:16:11.123Z
updated: 2026-03-24T03:17:41.500Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 7
---

Now I have a clear picture. Let me draft the plan:

---

## Process Meeting Phase 2 — Draft Plan

### Problem Statement

Phase 1 delivered composable primitives (`meeting context`, `meeting extract --context`, `meeting apply`) but left three deferred items:

1. **No convenience command** — Users must manually chain `context | extract | apply` for each meeting
2. **No CLI for memory writes** — `MemoryService.create()` exists but isn't exposed via CLI, blocking non-meeting sources
3. **No cross-meeting synthesis** — Can't detect patterns across multiple meetings (e.g., daily-winddown)

### Success Criteria

1. `arete meeting process <file>` chains the primitives with sensible defaults
2. `arete memory add --type <type> --title <title>` writes to memory files
3. `arete intelligence synthesize --input <files>` detects themes/patterns across extractions
4. All three integrate cleanly (synthesize can pipe to memory add)

---

### Plan:

**1. `arete meeting process` convenience command**

Create single command that chains: context → extract → apply.

Acceptance Criteria:
- `arete meeting process <file>` runs full pipeline
- `--skip-agenda`, `--skip-people` flags pass through to context
- `--stage` (default) vs `--commit` (legacy) behavior preserved
- `--json` outputs final intelligence JSON
- Error handling: if any step fails, stop and report which step

Files: `packages/cli/src/commands/meeting.ts`

---

**2. `arete memory add` CLI command**

Expose existing `MemoryService.create()` via CLI.

Acceptance Criteria:
- `arete memory add --type <decisions|learnings|observations> --title <title> --content <text>`
- `--content -` reads from stdin (for piping)
- `--source <name>` optional source attribution
- `--json` outputs created entry
- Validates type is one of the three allowed values

Files: 
- CREATE: `packages/cli/src/commands/memory.ts`
- MODIFY: `packages/cli/src/index.ts` (register command)

---

**3. `arete intelligence synthesize` — Core service + CLI**

Cross-meeting pattern detection for themes, recurring topics, and insights.

Acceptance Criteria:
- Core: `packages/core/src/services/intelligence-synthesis.ts`
- Input: array of `MeetingIntelligence` objects (or file paths)
- Output: `SynthesisResult` with themes, patterns, suggested learnings
- CLI: `arete intelligence synthesize --input <files...> --json`
- `--input -` reads JSON array from stdin
- LLM prompt that identifies:
  - Recurring themes across meetings
  - Contradictions or tensions
  - Suggested learnings (for memory add)
- Unit tests with fixture data

Files:
- CREATE: `packages/core/src/services/intelligence-synthesis.ts`
- CREATE: `packages/cli/src/commands/intelligence.ts`
- CREATE: `packages/core/test/services/intelligence-synthesis.test.ts`

---

### Dependencies

```
Task 1 (meeting process) — independent
Task 2 (memory add) — independent  
Task 3 (synthesize) — benefits from Task 2 for output
```

Tasks 1 and 2 can run in parallel. Task 3 can start in parallel but benefits from Task 2 for the full workflow.

---

### Size: Small (3 steps)

- Task 1: ~0.5 day (plumbing existing primitives)
- Task 2: ~0.5 day (CLI for existing service)
- Task 3: ~1 day (new service + prompt engineering)

**Total: ~2 days**

---

### Out of Scope

- Automatic synthesis (runs manually, not triggered by approve)
- Web app UI for synthesis
- `memory add --require-approval` (staged mode for non-meeting sources)
- Action item extraction improvement (learning from approved vs skipped)

---

### Questions Before Finalizing

1. **Synthesize output format** — Should it produce ready-to-commit learnings, or require human review? The notes say `--require-approval` but that's more complex.

2. **Daily winddown integration** — Do we want to build the pattern (script that calls these primitives) or just ship the primitives?

3. **Priority** — Is `meeting process` valuable enough to include, or is the piped workflow sufficient for power users?

---

What's your take on the questions above? Once we align, I can save this as the plan and we can run `/pre-mortem` if you want risk analysis before building.