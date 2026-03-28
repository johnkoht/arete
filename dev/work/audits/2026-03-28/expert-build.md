# Audit: build

## Findings

### Memory Index (memory/MEMORY.md)

- ❌ **5 unindexed entries**: Files exist in `memory/entries/` but are not listed in MEMORY.md index
  - `2026-02-09_competitive-analysis-evaluation.md` — competitive-analysis skill evaluation vs OSS
  - `2026-02-09_synthesize-evaluation.md` — synthesize skill evaluation vs OSS  
  - `2026-02-10_planning-improvement-prompt.md` — prompt for improving documentation plan completeness
  - `2026-02-10_skills-enhancement-backlog.md` — backlog for native skill enhancements from OSS analysis
  - `2026-03-08_test-memory-plan-learnings.md` — test memory plan (sparse content, may be test artifact)

- ❌ **2 broken references**: MEMORY.md links to files that don't exist
  - `entries/2026-02-21_qmd-improvements-learnings.md` — referenced but file doesn't exist
  - `entries/2026-02-21_qmd-improvements-review-fixes.md` — referenced but file doesn't exist

- ✅ **Template examples**: `entries/YYYY-MM-DD_short-title.md` and `entries/YYYY-MM-DD_slug.md` are convention examples in the doc header, not broken references

### Skill Frontmatter

- ⚠️ **prd-to-json/SKILL.md**: Missing 4 standard frontmatter fields compared to peer skills (execute-prd, ship)
  - Missing: `category`, `work_type`, `primitives`, `requires_briefing`
  - Current frontmatter only has `name` and `description`

## Auto-Fixed

None — no LEARNINGS.md stubs needed for this scope.

## Proposed Changes (require approval)

### Memory index fixes

**Add to MEMORY.md index** (insert after the 2026-02-10 entries section, in date order):

```markdown
- 2026-02-09 [competitive-analysis evaluation](entries/2026-02-09_competitive-analysis-evaluation.md) — Keep native: OSS lacks workspace integration; methodology snippets can be borrowed.
- 2026-02-09 [synthesize evaluation](entries/2026-02-09_synthesize-evaluation.md) — Keep native: workspace integration + QMD; borrow methodology from Anthropic's user-research-synthesis.
- 2026-02-10 [planning-improvement-prompt](entries/2026-02-10_planning-improvement-prompt.md) — Reflection on documentation plan completeness gaps; prompt engineering insights.
- 2026-02-10 [skills-enhancement-backlog](entries/2026-02-10_skills-enhancement-backlog.md) — Phase 2 improvement recommendations from OSS analysis; Top 20 prioritized enhancements.
- 2026-03-08 [test-memory-plan-learnings](entries/2026-03-08_test-memory-plan-learnings.md) — Test memory plan artifact (may be test data).
```

**Remove broken references from MEMORY.md index** (lines to delete):

```markdown
- 2026-02-21: [qmd-improvements-review-fixes](entries/2026-02-21_qmd-improvements-review-fixes.md) — Engineering lead review fixes: meeting content cache (O(meetings) reads), limit 20→100 + overflow fallback, path normalization, displayQmdResult() helper, clarifying comments. 2/2 tasks, 0 iterations, +9 tests.
- 2026-02-21: [qmd-improvements-learnings](entries/2026-02-21_qmd-improvements-learnings.md) — QMD auto-indexing: refreshQmdIndex() helper, write-path CLI wiring (pull fathom, meeting add/process), arete index command, agent rule update, EntityService SearchProvider injection. 6/6 tasks, 0 iterations, +22 tests.
```

### Skill frontmatter fixes

**Update `.pi/skills/prd-to-json/SKILL.md` frontmatter**:

Replace:
```yaml
---
name: prd-to-json
description: Convert markdown PRD to JSON task list for autonomous execution. INTERNAL TOOL for Areté development only.
---
```

With:
```yaml
---
name: prd-to-json
description: Convert markdown PRD to JSON task list for autonomous execution. INTERNAL TOOL for Areté development only.
category: build
work_type: development
primitives: []
requires_briefing: false
---
```

### File moves

None required.

---

**Summary**: 5 unindexed entries, 2 broken references, 1 skill with incomplete frontmatter.
