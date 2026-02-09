# Quick Start: PRD Orchestration

**For Fresh Agent**: Use this prompt when starting a new PRD execution.

---

## Prompt to Give New Agent

```
I want to execute the [PRD-NAME] PRD using the orchestration system.

Please:
1. Read .cursor/build/skills/execute-prd/SKILL.md (the execution workflow)
2. Read .cursor/build/PRE-MORTEM-AND-ORCHESTRATION-RECOMMENDATIONS.md (context from last PRD)
3. Read .cursor/build/entries/2026-02-09_builder-orchestration-learnings.md (what worked)
4. Follow the execute-prd skill workflow:
   - Phase 0: Understand the PRD
   - Phase 1: Mandatory pre-mortem (present to me for approval)
   - Phase 2: Task execution loop
   - Phase 3: Post-mortem and learnings

The PRD is at: .cursor/build/prds/[feature-name]/prd.md
Task breakdown: .cursor/build/autonomous/prd.json

Let's start with Phase 0 and the pre-mortem.
```

---

## What the Agent Will Do

1. **Load context** (execute-prd skill, recommendations, learnings)
2. **Understand PRD** (read prd.md and prd.json)
3. **Present pre-mortem** (8 risk categories, wait for your approval)
4. **Execute tasks** (spawn subagents, review, verify, track)
5. **Deliver post-mortem** (analyze effectiveness, capture learnings)

---

## Expected Outcome

- Pre-mortem with 6-10 identified risks
- All tasks completed with code review
- Post-mortem analysis comparing pre-mortem predictions vs reality
- Build memory updated with learnings

---

## Files the Agent Needs

All in `.cursor/build/`:
- `skills/execute-prd/SKILL.md` ← Main workflow
- `PRE-MORTEM-AND-ORCHESTRATION-RECOMMENDATIONS.md` ← Context
- `entries/2026-02-09_builder-orchestration-learnings.md` ← Patterns
- `templates/PRE-MORTEM-TEMPLATE.md` ← Risk categories
- `prds/{feature-name}/prd.md` ← The PRD to execute
- `autonomous/prd.json` ← Task breakdown

All files are in place and ready to use.
