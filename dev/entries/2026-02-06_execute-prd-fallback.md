# Execute-PRD fallback when Task tool unavailable

**Date**: 2026-02-06

## What changed

- **execute-prd skill** (`skills/execute-prd/SKILL.md`): In Step 3 (Spawn Task Subagent), added explicit fallback: if the agent does not have access to a Task tool (or equivalent subagent-spawning capability), it should execute each task itself in sequence—one task per iteration—still running typecheck and tests, committing per task, and updating prd.json and progress.txt. Added a Prerequisites note that preferred execution uses the Task tool and fallback is when the tool is unavailable.
- **Parent Agent Context Management**: Relaxed to distinguish “when using Task tool” (orchestrator stays lightweight) vs “when in fallback mode” (same agent does both; still one task at a time, same quality gates).
- **Autonomous README**: In “Execute Autonomously”, clarified that subagents are used “when the Task tool is available” and added one sentence pointing to the skill’s Step 3 for fallback behavior.

## Why

The PM planning system PRD was executed without spawning subagents: the agent had no Task/subagent tool available and performed all tasks in one run. User asked why subagents were not used and whether the autonomous agent loop was followed. The design (orchestrator + Task subagents) was not followed because the tool was missing. The skill and README assumed the Task tool exists and did not describe what to do when it does not. This change documents the intended fallback so future runs (with or without the Task tool) follow the same workflow and quality gates.

## References

- Execute-PRD skill: `.cursor/build/autonomous/skills/execute-prd/SKILL.md`
- Autonomous README: `.cursor/build/autonomous/README.md`
