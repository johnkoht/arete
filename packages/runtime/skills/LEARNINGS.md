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
