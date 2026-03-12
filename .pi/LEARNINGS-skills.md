# Skill Development Learnings

Component-specific gotchas and invariants for skill development in `.pi/skills/`.

---

## New Patterns

### Complex Skill Structure (2026-03-11)

For skills that orchestrate multiple other skills (meta-orchestrators like `ship`), use this expanded structure:

```
.pi/skills/{skill}/
├── SKILL.md           # Main skill definition (workflow, gates, tool reference)
├── orchestrator.md    # Orchestrator persona and decision-making (extracted from SKILL.md)
└── templates/         # Report templates, prompt templates
    └── {template}.md
```

**When to use this pattern**:
- Skill chains 3+ other skills
- Skill has complex gate logic requiring examples and heuristics
- Skill produces structured reports

**When NOT to use this pattern** (keep simple SKILL.md only):
- Single-purpose skills (run-pre-mortem, review-plan)
- Skills with no gates or simple pass/fail
- Skills that don't produce formatted reports

### Gitignore Exception for Templates

Templates directories are ignored by default (line 86 in `.gitignore`). To commit skill templates, the exception is already added:

```gitignore
!.pi/skills/*/templates/
!.pi/skills/*/templates/**
```

---

## Pre-Edit Checklist

Before editing skill definitions:
- [ ] Check AGENTS.md § Skills for skill registration requirements
- [ ] Check existing skills for frontmatter format consistency
- [ ] If adding templates, verify `.gitignore` exceptions are in place

---

## Gotchas

### Skill Frontmatter

The `requires_briefing: false` field is important for skills that handle their own context gathering (like `execute-prd` or `ship`). Setting it to `true` would inject workspace briefing that may be redundant.

---

## Invariants

1. **SKILL.md is the contract** — Tasks 3-7 of any PRD that references skill phases should use SKILL.md as the authoritative source for entry/exit conditions.

2. **Orchestrator.md supplements, doesn't replace** — Gate logic rules in orchestrator.md are guidelines for the orchestrator persona; SKILL.md defines what gates exist and when they apply.
