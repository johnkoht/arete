# Meeting Agenda Skill PRD

**Status**: Implemented (2026-02-11)  
**Branch**: `feature/meeting-agenda-skill`  
**Task list**: `dev/autonomous/prd.json` (9 tasks, completed)

## Summary

Add a **Prepare Meeting Agenda** skill that produces a structured agenda document (not just prep context). Includes:

- **Context selector**: Meeting type (leadership, customer, dev team, 1:1, other) shapes sections.
- **Template system**: Default templates in `runtime/templates/meeting-agendas/`; custom overrides in `.arete/templates/meeting-agendas/`.
- **CLI**: `arete template list meeting-agendas`, `arete template view meeting-agenda --type <name>`.
- **Calendar-aware flow**: Optional "which meeting?" from calendar; get_meeting_context for suggested items.
- **Save location**: `now/agendas/` (and optional project folder or clipboard).

## How to Execute

1. Ensure `dev/autonomous/prd.json` contains the meeting-agenda-skill task list (it should have 9 userStories).
2. Open **EXECUTE.md** in this directory and copy the "Prompt for New Agent" into a new Cursor conversation.
3. The orchestrator will run the pre-mortem, then execute tasks A1 → A2 → A3 → B1 → B2 → C1 → C2 → D1.

## References

- **Full PRD**: [prd.md](prd.md)
- **Backlog**: [dev/backlog/features/meeting-agenda-skill.md](../../backlog/features/meeting-agenda-skill.md)
- **Execute-PRD skill**: [.agents/skills/execute-prd/SKILL.md](../../../.agents/skills/execute-prd/SKILL.md)
- **Plan (enhancements)**: Cursor plan "Enhance Meeting Agenda Backlog" (template management, workflow detail, inference rules)
