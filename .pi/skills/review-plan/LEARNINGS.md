# Review-Plan Skill — Learnings

Gotchas and patterns for the review-plan skill. Read before modifying this skill.

---

## Gotchas

### 1. Profile section mapping varies by domain

**Problem**: Core profile has `## Invariants` and `## Anti-Patterns`, but CLI profile lacks these. Assuming uniform structure causes silent failures.

**Fix**: Use profile-specific section extraction:
- **Core**: `## Invariants`, `## Anti-Patterns & Common Mistakes`, `## Key Abstractions & Patterns`
- **CLI**: `## Purpose & Boundaries`, `## Command Architecture`, first 100 lines of `## Command Map`
- **Fallback**: First 150-200 lines

**Source**: `.pi/skills/LEARNINGS.md` learning #3; build-context-injection plan (2026-03-28)

### 2. Tiered paths need mechanical criteria

**Problem**: "Quick vs Full review" is subjective if criteria aren't explicit. Reviewers guess wrong.

**Fix**: Use decision flowchart with exact thresholds:
- Quick: ≤3 steps AND ≤2 files AND no architectural decisions
- Full: Everything else

**Source**: Pre-mortem Risk 3 (2026-04-02)

### 3. Pre-mortem gating depends on complexity tier

**Problem**: Large plans approved without pre-mortem analysis lead to preventable failures.

**Fix**: Verdict matrix by complexity:
- Tiny/Small: Pre-mortem optional
- Medium: "Approve pending pre-mortem" verdict available
- Large: Cannot "Approve" without pre-mortem

**Source**: Pre-mortem Risk 3; AGENTS.md lifecycle requirements

---

## Invariants

- **Output format is a superset**: New review versions must preserve `## Review:`, `### Concerns`, `### Strengths`, `### Devil's Advocate`, `### Verdict` structure. Downstream tools (ship skill) parse this format.

- **Devil's Advocate is mandatory**: Never skip the adversarial section. It catches what checklists miss.

- **AC validation is mechanical**: Use the rubric checklist, not judgment. Flag anti-pattern phrases explicitly.

---

## References

- Parent skill learnings: `.pi/skills/LEARNINGS.md`
- Profile section mapping: `.pi/skills/LEARNINGS.md` learning #3
- Ship skill integration: `.pi/skills/ship/SKILL.md` Phase 1.3
