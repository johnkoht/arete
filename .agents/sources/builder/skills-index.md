# Build Skills

Build skills live in `.agents/skills/` and are **not shipped to users**. They're for developing Areté itself. Read and follow these skills when doing the corresponding work.

| Skill | Path | Description | When to Use |
|-------|------|-------------|-------------|
| **execute-prd** | `.agents/skills/execute-prd/SKILL.md` | Autonomous PRD execution with Orchestrator (Sr. Eng Manager) and Reviewer (Sr. Engineer). Includes pre-mortem, structured feedback, and holistic review. | User says "Execute this PRD" or "Build everything in prd.json"; multi-task PRDs with dependencies (3+ tasks); want autonomous execution with quality review |
| **plan-to-prd** | `.agents/skills/plan-to-prd/SKILL.md` | Convert an approved plan into a PRD, prd.json, and handoff prompt for autonomous execution via execute-prd. | User chose "Convert to PRD" when offered the PRD path in Plan Mode; after plan-pre-mortem rule offers the choice and user selects the PRD path |
| **prd-to-json** | `.agents/skills/prd-to-json/SKILL.md` | Convert markdown PRD to JSON task list for autonomous execution. Reads build memory for context. | "Convert this PRD to JSON", "Create prd.json from [PRD file]", "Prepare PRD for autonomous execution"; after creating a PRD for an Areté feature you want to build autonomously |
| **prd-post-mortem** | `.agents/skills/prd-post-mortem/SKILL.md` | Systematic post-mortem analysis after PRD execution. Analyzes outcomes, extracts learnings, synthesizes subagent reflections, and creates memory entry. | After completing a PRD via execute-prd skill; user says "Create the post-mortem" or "Extract learnings from this PRD"; at end of PRD execution before closing |
| **review-plan** | `.agents/skills/review-plan/SKILL.md` | Structured second-opinion review for plans, PRDs, or completed work. Applies checklist and devil's advocate perspective. | "Review this plan", "Can you give me a second opinion on this?", "Critique this PRD"; when one agent creates work and another should evaluate it; before executing complex or high-stakes work |
| **run-pre-mortem** | `.agents/skills/run-pre-mortem/SKILL.md` | Run a pre-mortem risk analysis before starting multi-step work. Identifies risks across 8 categories and creates actionable mitigations. | Before executing approved plans (3+ steps or complex); before large refactors (touching many files); before new systems (integrations, providers, etc.) |
| **synthesize-collaboration-profile** | `.agents/skills/synthesize-collaboration-profile/SKILL.md` | Review build entries' Learnings and Corrections, merge into memory/collaboration.md, and update the builder collaboration profile. | Builder asks to "Synthesize collaboration profile" or "Update collaboration from entries"; after PRD post-mortem; after several entries with learnings have accumulated (5+); after major build phase or quarterly review |

## How to Use

Read the skill file with the Read tool, then follow its workflow. These skills are not in the `<available_skills>` list because they're workspace-specific (not user-global).

## Skill Triggers

- Plan review requested → read `.agents/skills/review-plan/SKILL.md`
- PRD execution starting → read `.agents/skills/execute-prd/SKILL.md`
- Pre-mortem needed → read `.agents/skills/run-pre-mortem/SKILL.md`
- PRD completed → read `.agents/skills/prd-post-mortem/SKILL.md`
- Plan → PRD conversion → read `.agents/skills/plan-to-prd/SKILL.md`
- Convert PRD to JSON → read `.agents/skills/prd-to-json/SKILL.md`
- Update collaboration profile → read `.agents/skills/synthesize-collaboration-profile/SKILL.md`
