# PRD Execution Notes

## prd.json (copy to dev/autonomous/prd.json before execution)

```json
{
  "name": "planning-system-refinement",
  "branchName": "feature/planning-system-refinement",
  "goal": "Linear pipeline flow (plan → PRD → pre-mortem → review → build → done) with agent injection, auto-save, flexible commands, and simplified menus",
  "userStories": [
    {
      "id": "task-1",
      "title": "Add phase tracking to state",
      "description": "Add currentPhase and activeCommand fields to PlanModeState. Phase controls menus; activeCommand controls prompt injection; completion flags track what's done.",
      "acceptanceCriteria": [
        "Add currentPhase: Phase where Phase = 'plan' | 'prd' | 'pre-mortem' | 'review' | 'build' | 'done'",
        "Add activeCommand: string | null to track which command is running",
        "Phase initializes to 'plan' on /plan or /plan new",
        "Phase persists across sessions via appendEntry()",
        "createDefaultState() sets both fields",
        "TypeScript compiles without errors"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0
    },
    {
      "id": "task-2",
      "title": "Create phase-based menu helper",
      "description": "Replace getMenuOptions() with getPhaseMenu() that returns exactly two options: Refine and Continue.",
      "acceptanceCriteria": [
        "Add Phase type export to utils.ts",
        "Add getPhaseMenu(phase, planSize) returning { refine: string, next: string | null }",
        "Plan phase: 'Refine plan' / 'Continue to PRD' (medium/large) or 'Continue to pre-mortem' (tiny/small)",
        "PRD phase: 'Refine PRD' / 'Continue to pre-mortem'",
        "Pre-mortem phase: 'Refine pre-mortem' / 'Continue to review' or 'Skip review → build'",
        "Review phase: 'Refine review' / 'Continue to build'",
        "Build/done phases: return nulls (no menu)",
        "Keep getMenuOptions() but mark @deprecated",
        "Tests pass"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0
    },
    {
      "id": "task-3",
      "title": "Implement auto-save for artifacts",
      "description": "Extract content from agent response and save to artifact files. No more placeholder files.",
      "acceptanceCriteria": [
        "Add extractPhaseContent(response, phase) helper",
        "Look for headers: 'Plan:', '## Pre-Mortem', '## Review', '### Risk'",
        "If no headers found, return full response as fallback",
        "Never save empty string — log warning and skip",
        "After plan phase: update plan.md content section",
        "After pre-mortem: save actual content to pre-mortem.md",
        "After review: save actual content to review.md",
        "Remove placeholder-saving code from handlePreMortem and handleReview"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0
    },
    {
      "id": "task-4",
      "title": "Route menu selections through commands",
      "description": "Continue to X invokes actual commands. Commands are phase-independent (can be called anytime).",
      "acceptanceCriteria": [
        "'Continue to pre-mortem' calls handlePreMortem() and advances phase",
        "'Continue to review' calls handleReview() and advances phase",
        "'Continue to build' calls handleBuild()",
        "/pre-mortem and /review can be called from ANY phase",
        "These commands set completion flags but DON'T change currentPhase",
        "Remove direct plan-mode-execute bypass path",
        "Phase advances only via menu 'Continue to X' selection"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0
    },
    {
      "id": "task-5",
      "title": "Wire agent prompts into commands",
      "description": "Inject appropriate agent prompt based on activeCommand, not currentPhase.",
      "acceptanceCriteria": [
        "Set state.activeCommand when command starts, clear when done",
        "In before_agent_start, inject prompt based on activeCommand",
        "pre-mortem command → orchestrator.md",
        "review command → reviewer.md",
        "build command → orchestrator.md",
        "null (plan mode) → product-manager.md",
        "Injection order: base context → agent prompt → plan content",
        "getAgentPrompt() is called (not hardcoded strings)"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0
    },
    {
      "id": "task-6",
      "title": "Update pipeline order in lifecycle.ts",
      "description": "Change gate order to: prd → pre-mortem → review (matching linear flow).",
      "acceptanceCriteria": [
        "getMissingGates() returns gates in order: prd, pre-mortem, review",
        "getGateRequirements() returns in same order",
        "/plan next shows gates in this order",
        "Update lifecycle tests to assert new order",
        "Grep and fix any order-dependent test assertions"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0
    },
    {
      "id": "task-7",
      "title": "Update widget pipeline stages",
      "description": "Add PRD stage to widget and show completion checkmarks in footer.",
      "acceptanceCriteria": [
        "Add { emoji: '📄', label: 'PRD', key: 'prd' } to PIPELINE_STAGES after Plan",
        "Widget shows 6 stages: Plan → PRD → Pre-mortem → Review → Build → Done",
        "getCurrentStage() uses currentPhase as primary source",
        "getCompletedStages() marks stages based on phase progression",
        "Footer shows completion: '📋 plan (pre-mortem ✓, review ✓)' when applicable",
        "Widget tests pass for each phase value"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0
    },
    {
      "id": "task-8",
      "title": "Handle Refine option and /build gating",
      "description": "Implement refine loop properly and add build gate logic for missing pre-mortem/review.",
      "acceptanceCriteria": [
        "'Refine X' opens editor for feedback",
        "User input sent via sendUserMessage() with phase context",
        "Track isRefining: boolean to prevent menu loop",
        "After agent response: clear isRefining, auto-save, show menu",
        "/build gating: if !preMortemRun && planSize !== 'tiny', confirm skip",
        "/build gating: if !reviewRun, notify and proceed",
        "Can refine multiple times before continuing"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0
    }
  ],
  "metadata": {
    "createdAt": "2026-02-18T04:30:00Z",
    "totalTasks": 8,
    "completedTasks": 0,
    "failedTasks": 0
  }
}
```

## Pre-Mortem Summary

9 risks identified. Key mitigations:
- Phase controls menus; activeCommand controls prompts; flags track completion
- Commands are phase-independent (/pre-mortem, /review callable anytime)
- /build is the only gate (warns about missing pre-mortem)
- Test before and after each task
- Don't delete old functions until new ones verified

## Handoff Prompt

To execute this PRD, start a new chat and paste:

---

Execute the planning-system-refinement PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/plans/planning-system-refinement/prd.md` and the task list is at `dev/autonomous/prd.json`. Run the full workflow: pre-mortem → task execution loop → post-mortem.

---
