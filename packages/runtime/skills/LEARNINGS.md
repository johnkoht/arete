# Skills LEARNINGS.md

Component-local gotchas and invariants for runtime skills.

---

## 2026-02-25: Use relative paths for cross-skill references

**What broke**: Skills referencing PATTERNS.md used absolute build-time paths (`packages/runtime/skills/PATTERNS.md`). These paths don't exist in installed user workspaces where skills live at `.agents/skills/`.

**Why it matters**: Skills are copied to user workspaces during `arete install`. All inter-file references must use relative paths.

**Correct pattern**:
```markdown
See [PATTERNS.md](../PATTERNS.md) § pattern_name for the full workflow.
```

**Wrong pattern**:
```markdown
See `packages/runtime/skills/PATTERNS.md § pattern_name` for the full workflow.
```

**How to avoid**: When adding cross-references between skills or to PATTERNS.md, always use relative markdown links (`../PATTERNS.md`, `./templates/project.md`). Never use absolute paths starting with `packages/`.

---

## 2026-03-05: Expert agent pattern instructions must include worked examples

**What matters**: Expert agent patterns (significance_analyst, relationship_intelligence) change agent behavior through skill instructions. Without concrete before/after examples showing genuinely different output, the pattern is "documentation theater" — agents produce the same keyword-matching behavior wrapped in more prose.

**The linchpin**: Each expert pattern MUST include a worked example with:
- An abbreviated input bundle
- A ❌ "without context reasoning" output (keyword-matched, no bundle citations)
- A ✅ "with context reasoning" output (cites specific goals/decisions/stances from bundle)

**Grounding directive**: The significance_analyst pattern includes: "For each candidate, cite the specific goal, prior decision, or person stance from the context bundle. If you cannot cite specific bundle content, downgrade the candidate's ranking." This is the enforcement mechanism.

---

## 2026-03-05: Conditional patterns need explicit branching structure

**What broke**: `extract_decisions_learnings` was updated with a conditional ("when bundle available, use analyst; otherwise keyword scan"). The prose conditional was correct but the Steps section only showed the fallback path. Agents that jump to Steps headers skip prose conditionals.

**Fix**: Use separate Steps headers for each branch:
```markdown
**Steps (context bundle available)**:
Follow the significance_analyst pattern. Do not follow keyword-scanning steps below.

**Steps (keyword-scanning fallback — no context bundle)**:
1. Scan for keywords...
```

---

## 2026-03-05: Pattern consumer lists must be accurate

**What broke**: When splitting the sync skill into fathom/krisp, a developer incorrectly added fathom and krisp as consumers of `extract_decisions_learnings`. Pull-only skills don't do extraction — only process-meetings does. An agent reading the wrong consumer list would try to run extraction during a fathom pull.

**How to avoid**: When updating "Used by" lists in PATTERNS.md, verify each listed skill actually invokes the pattern in its workflow. `grep -r "pattern_name" packages/runtime/skills/` to confirm.
