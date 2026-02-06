# PM Planning System — PRD Project

**Status**: Active  
**Goal**: Implement the PM planning system so users can view/align goals with org strategy, set quarterly goals, and run weekly plans (with `arete update` delivering the feature).

**Output**: [outputs/prd-pm-planning-system.md](outputs/prd-pm-planning-system.md)

**Execution**: Autonomous agent loop via `.cursor/build/autonomous/prd.json` and execute-prd skill.

**To run the agent**: Load the execute-prd skill and say "Execute the PRD" (or "Run the task list"). The canonical task list is in `.cursor/build/autonomous/prd.json`. A backup copy is at repo root: `prd-pm-planning-system.json`.
