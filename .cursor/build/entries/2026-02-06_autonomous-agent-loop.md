# Autonomous Agent Loop System

**Date**: 2026-02-06  
**Type**: New feature (internal tooling)  
**Impact**: Enables autonomous development of Areté features

## Summary

Built a Cursor-native autonomous execution system for developing Areté features. Inspired by Ralph, but adapted to work entirely within Cursor using the Task tool instead of external CLI tools (Amp/Claude Code).

## What Was Built

### Core Components

1. **PRD JSON Schema** (`.cursor/build/autonomous/schema.ts`)
   - TypeScript types for Task and PRD structures
   - Validation functions
   - Status tracking: pending, in_progress, complete, failed

2. **prd-to-json Skill** (`.cursor/build/autonomous/skills/prd-to-json/`)
   - Converts markdown PRDs to structured JSON
   - Extracts tasks and acceptance criteria
   - Initializes task status and metadata

3. **execute-prd Skill** (`.cursor/build/autonomous/skills/execute-prd/`)
   - Orchestrator that spawns Task subagents
   - Each subagent completes one task in fresh context
   - Runs tests, commits on success, tracks progress
   - Handles retries, failures, and resume capability

4. **Progress Tracking** (`progress.txt`)
   - Append-only log of learnings between iterations
   - Subagents read for context, append discoveries
   - Builds institutional knowledge across tasks

5. **Archive System**
   - Completed PRDs archived to `archive/YYYY-MM-DD-{name}/`
   - Preserves prd.json and progress.txt for historical reference

### Directory Structure

```
.cursor/build/autonomous/
├── schema.ts                    # Types and validation
├── prd.json.example             # Reference format
├── progress.txt.template        # Example progress log
├── skills/
│   ├── prd-to-json/            # Conversion skill
│   └── execute-prd/            # Orchestrator skill
├── archive/                     # Completed runs
├── prd.json                     # Working file (gitignored)
├── progress.txt                 # Working log (gitignored)
└── README.md                    # Documentation
```

## How It Works

### Execution Flow

1. **User creates markdown PRD** using existing `create-prd` skill
2. **Convert to JSON**: Load `prd-to-json` skill to create structured task list
3. **Execute autonomously**: Load `execute-prd` skill
4. **Orchestrator loop**:
   - Reads prd.json, finds next incomplete task
   - Spawns fresh Task subagent with task instructions
   - Subagent implements, tests, commits
   - Orchestrator updates prd.json with result
   - Repeats until all tasks complete
5. **Archive and complete**: Move prd.json + progress.txt to archive

### Key Design Decisions

**Why Cursor-native (not bash loop like Ralph)?**
- No dependency on Amp or Claude Code CLI
- Works entirely within Cursor using Task tool
- Faster (no process spawning overhead)
- Visual feedback in real-time
- Can pause/resume easily

**Why fresh subagents per task?**
- Prevents context pollution
- Each task starts with clean slate
- Ensures quality and focus
- Parent orchestrator stays lightweight (only coordinates)

**Why small atomic tasks?**
- Tasks must complete in one context window
- Reduces risk of failure
- Makes progress trackable
- Easier to debug and retry

## Technical Details

### Task Schema

```typescript
interface Task {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: 'pending' | 'in_progress' | 'complete' | 'failed';
  passes: boolean;
  attemptCount: number;
  notes?: string;
  commitSha?: string;
}
```

### Quality Checks

Each subagent MUST run before committing:
```bash
npm run typecheck
npm test
```

Only commits if both pass.

### Error Handling

- **Retry logic**: Up to 3 attempts per task
- **Failure mode**: After 3 failures, mark as failed and continue
- **Resume capability**: Can interrupt and resume at any time (prd.json is source of truth)
- **Max iterations**: Default 20, prevents infinite loops

### Commit Format

```
[PRD: {prd-name}] Task {task-id}: {task-title}
```

Example: `[PRD: slack-integration] Task task-1: Create Slack client`

## Usage

### Quick Start

```
1. Load create-prd and write a PRD for [feature]
2. Load prd-to-json and convert the PRD
3. Load execute-prd and run it
4. Review commits and merge
```

### Example

```
User: "Load execute-prd and execute the PRD"

Agent: 🚀 Starting: slack-integration (3 tasks)
Agent: 📋 Task 1: Create Slack client
Agent: [Spawns Task subagent]
Subagent: [Implements, tests, commits]
Agent: ✅ Task 1 complete

Agent: 📋 Task 2: Add CLI command
Agent: [Spawns Task subagent]
Subagent: [Implements, tests, commits]
Agent: ✅ Task 2 complete

Agent: 📋 Task 3: Write tests
Agent: [Spawns Task subagent]
Subagent: [Implements, tests, commits]
Agent: ✅ Task 3 complete

Agent: ## Execution Complete! 🎉
Agent: Results: ✅ 3 completed, ❌ 0 failed
```

## Separation from Product

**CRITICAL**: This is INTERNAL tooling for Areté development, NOT a user-facing feature.

**Build system** (internal):
- `.cursor/build/autonomous/` - Never shipped to users
- Skills in this directory - Not exposed via `arete` CLI
- Used by maintainers to build Areté itself

**Areté product** (user-facing):
- `.cursor/skills/` - PM skills (discovery, PRD, etc.)
- `arete` CLI commands
- Shipped via `npm install -g @arete/cli`

The `package.json` "files" field does NOT include `.cursor/build/`, ensuring complete separation.

## Benefits

1. **Autonomous feature development**: Build Areté features while you sleep (in theory)
2. **Fresh context per task**: No context pollution, better code quality
3. **Git as memory**: Full history preserved, easy to review
4. **Institutional knowledge**: progress.txt accumulates learnings
5. **No external dependencies**: Works in Cursor only, no CLI tools needed
6. **Resumable**: Can pause and continue at any time

## Limitations

1. **Semi-autonomous**: You watch it work (not fully background)
2. **Task size constraint**: Tasks must fit in one context window
3. **Parent context limit**: After many tasks, parent might need refresh (just say "continue")
4. **No parallel execution**: Tasks run sequentially (could be added later)

## Comparison with Ralph

| Feature | Ralph | Areté Loop |
|---------|-------|------------|
| Context Reset | Process spawn | Task subagent |
| Dependencies | Amp/Claude CLI | Cursor only |
| Speed | Slower | Faster |
| Visual Feedback | CLI output | Live in Cursor |
| Resume | Re-run script | Say "continue" |

## Testing

Tested manually with example PRD:
- 3 simple tasks (add function, write tests, update docs)
- All tasks completed successfully
- Commits created with proper format
- progress.txt populated correctly

Full integration test pending (manual-testing TODO).

## Future Enhancements

Potential improvements:
- Web UI for monitoring
- Slack notifications
- Metrics tracking
- CI integration
- Parallel task execution
- Branch-per-task mode

## Files Changed

**New files**:
- `.cursor/build/autonomous/schema.ts`
- `.cursor/build/autonomous/prd.json.example`
- `.cursor/build/autonomous/progress.txt.template`
- `.cursor/build/autonomous/skills/prd-to-json/SKILL.md`
- `.cursor/build/autonomous/skills/execute-prd/SKILL.md`
- `.cursor/build/autonomous/README.md`
- `.cursor/build/entries/2026-02-06_autonomous-agent-loop.md` (this file)

**Modified files**:
- `.gitignore` - Added prd.json and progress.txt to ignore list
- `.cursor/build/MEMORY.md` - Added entry reference
- `README.md` - Added autonomous development section

## References

- **Ralph**: https://github.com/snarktank/ralph
- **Pi-Mono**: https://github.com/badlogic/pi-mono
- **Agent Skills**: https://agentskills.io

## Maintainer Notes

To use this system:
1. Read `.cursor/build/autonomous/README.md`
2. Review example files
3. Create a PRD for your feature
4. Convert and execute
5. Review commits before merging

Skills are loaded via: "Load {skill-name} skill from .cursor/build/autonomous/skills/"
