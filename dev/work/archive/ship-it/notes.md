# Ship It — Mega Build Skill

## Problem

Current workflow requires human presence for mechanical approval steps:

```
1. Start chat
2. Shape plan (HIGH VALUE - human time)
3. Save plan ← mechanical from here
4. /pre-mortem
5. /review
6. /prd
7. /build
8. Tell orchestrator to spawn eng lead for thorough review
9. /wrap
```

**Goal**: After shaping a plan (step 2), say `/ship` and walk away. Steps 3-9 run autonomously.

---

## Proposed Workflow

```
[main branch — human present]
1. Shape plan (high-value human time)
2. User says "/ship"

[automated — human can walk away]
3. Save plan
4. Run pre-mortem
   └── GATE: No CRITICAL risks → proceed; else pause
5. Run cross-model review
   └── GATE: No blockers → proceed; else pause
6. Review memories & learnings
   └── Search recent entries + plan-relevant topics
   └── Extract insights to inform PRD
7. Convert to PRD + prd.json (informed by memory review)
8. git add -A && git commit -m "plan: <slug> - PRD and artifacts"
9. /worktree create <slug>
   └── Creates ../arete.worktrees/<slug> with branch feature/<slug>
   └── onCreate hook runs: npm install
   └── Installs @zenobius/pi-worktrees in worktree
10. Open terminal in worktree (iTerm on macOS, platform-appropriate elsewhere)
11. Start pi in worktree, execute PRD via execute-prd skill
12. Spawn eng lead for final review
13. Wrap (memory entry, LEARNINGS, index)
14. git commit -m "feat: <slug> - implementation"
15. Report summary → leave as PR for human to review/merge

[separate cleanup command]
/ship cleanup <slug>
  └── git worktree remove (via pi-worktrees)
  └── Delete branch if merged
```

---

## Memory Review Step (Step 6)

Before creating the PRD, the orchestrator should:

1. **Recent work**: Search `memory/entries/` for entries from the last 2 weeks
2. **Relevant topics**: Search for entries related to plan keywords (e.g., "calendar", "integration", "CLI")
3. **LEARNINGS.md files**: Check any LEARNINGS.md in directories the plan might touch
4. **Collaboration profile**: Review `memory/collaboration.md` for builder preferences

**Output**: Brief synthesis (3-5 bullet points) of insights that should inform the PRD:
- Past mistakes to avoid
- Patterns that worked well
- Builder preferences relevant to this work
- Related decisions already made

This synthesis gets included in the PRD handoff to execute-prd.

---

## Extensions to Leverage

### 1. `@zenobius/pi-worktrees` (451/mo downloads)

Handles git worktree management:
- `/worktree create <name>` → creates worktree + `feature/<name>` branch
- `/worktree remove <name>` → safe removal with confirmation
- `onCreate` hook → runs command after creation (e.g., `npm install`)
- Configurable parent directory (default: `../<project>.worktrees/`)

**Install**: In worktree via `pi install npm:@zenobius/pi-worktrees`

### 2. `holdpty` (Optional, for V2)

Detached PTY management — run builds in background, attach later:
```bash
holdpty launch --bg --name ship-<slug> -- pi
holdpty attach ship-<slug>  # interactive
holdpty view ship-<slug>    # read-only
holdpty logs ship-<slug>    # dump output
```

**V1 approach**: Use osascript (macOS) or equivalent for cross-platform
**V2 approach**: Add holdpty for headless builds with attach capability

---

## Decision Gates

| Gate | Auto-proceed if... | Pause and report if... |
|------|-------------------|------------------------|
| Pre-mortem | No CRITICAL risks | Any CRITICAL risk found |
| Review | No blockers raised | Structural concerns raised |
| Build | All tasks pass quality gates | Any task fails |
| Final review | No major issues | Significant rework needed |

---

## Cross-Platform Terminal Support

| Platform | Command |
|----------|---------|
| macOS | `osascript -e 'tell application "iTerm" to create window with default profile command "cd <path> && pi"'` |
| Linux | `gnome-terminal --working-directory=<path> -- pi` or `xterm -e "cd <path> && pi"` |
| Windows | `wt -d <path> pi` (Windows Terminal) |

Detect platform and use appropriate command. Fall back to message if terminal launch fails.

---

## Architecture

**Hybrid approach**:
- Skill (`.pi/skills/ship/SKILL.md`) defines the workflow with decision gates
- Uses existing skills as building blocks (execute-prd, review-plan, run-pre-mortem, plan-to-prd)
- Meta-orchestrator (ship orchestrator agent) makes gate decisions
- Memory review uses existing `arete memory search` CLI

---

## Files to Create

```
.pi/skills/ship/
├── SKILL.md           # Main skill definition
├── orchestrator.md    # Ship orchestrator agent behavior
└── templates/
    └── ship-report.md # Summary report template
```

---

## Success Criteria

1. User can say `/ship` after approving a plan
2. System runs pre-mortem, review, memory scan, PRD conversion autonomously
3. Memory insights are synthesized and inform the PRD
4. Work happens in isolated worktree (clean main branch)
5. New terminal window opens showing the build (cross-platform)
6. Final result is a PR ready for human review
7. `/ship cleanup <slug>` removes worktree after merge

---

## Out of Scope (V1)

- Auto-merge (always leave as PR)
- Adaptive depth based on risk profile
- Parallel task execution
- Learning loops / threshold adjustment
- holdpty integration (iTerm/terminal window approach first)
