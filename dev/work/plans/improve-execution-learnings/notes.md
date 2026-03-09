# Proposed execute-prd Improvements

Based on systematic review of learnings entries from 2026-02 and 2026-03.

**Sources reviewed:**
- `memory/entries/2026-03-08_ai-config-learnings.md`
- `memory/entries/2026-03-07_reimagine-v2-orchestration-learnings.md`
- `memory/entries/2026-02-10_multi-ide-support-learnings.md`
- `memory/entries/2026-02-09_builder-orchestration-learnings.md`
- `memory/entries/2026-02-19_refactor-subagents-learnings.md`
- `.pi/skills/execute-prd/LEARNINGS.md`

---

## 1. Add Pre-Flight Codebase Audit (Phantom Task Detection)

**Source**: `2026-03-07_reimagine-v2-orchestration-learnings.md`

**Current**: Phase 0 steps 2-3 read the PRD and check alignment, but don't verify that proposed work hasn't already been done.

**Proposed**: Add new step **2.5** after "Read and Internalize the PRD":

```markdown
2.5. **Codebase Audit — Phantom Task Detection** (MANDATORY)
   
   Before proceeding, verify the PRD reflects current reality:
   
   - **Check proposed files**: Do files the PRD says to "create" already exist?
   - **Check proposed functionality**: Does the functionality already work?
   - **Check plan currency**: Is this PRD current, or has the codebase evolved since it was written?
   
   For each task in prd.json, run a quick existence check:
   ```bash
   # Example: Task says "create src/services/calendar.ts"
   ls -la src/services/calendar.ts 2>/dev/null && echo "EXISTS" || echo "OK to create"
   ```
   
   **If phantom tasks detected** (features that already exist):
   1. List which tasks are phantom and what already exists
   2. Ask builder: "These tasks appear already implemented. Should I: (a) skip them, (b) verify AC and mark complete, or (c) proceed anyway?"
   3. Wait for builder decision before continuing
   
   **Rationale**: The reimagine-v2 PRD had 5/6 phantom tasks (83%). This step saved ~80% work.
```

**Rationale**: Prevents wasted work and ensures PRDs are current before execution begins.

---

## 2. Enhance DRY Guidance with Constant Extraction

**Source**: `2026-03-08_ai-config-learnings.md`

**Current** (Step 10, prompt template, Reuse & Design section):
```markdown
**Reuse & Design**:
- Use existing services, helpers, and abstractions per AGENTS.md (e.g. getSearchProvider(), shared CLI helpers). Do not reimplement what already exists.
- Apply DRY (don't repeat yourself) and KISS (simplest solution that meets acceptance criteria). Prefer existing modules over new ones when they fit.
```

**Proposed** — Add bullet:
```markdown
**Reuse & Design**:
- Use existing services, helpers, and abstractions per AGENTS.md (e.g. getSearchProvider(), shared CLI helpers). Do not reimplement what already exists.
- Apply DRY (don't repeat yourself) and KISS (simplest solution that meets acceptance criteria). Prefer existing modules over new ones when they fit.
- **Extract constants for repeated structures**: If you use the same config object, schema, or data structure more than once, extract it to a named constant. Caught in AI-4 review — prevent upfront.
```

**Rationale**: ai-config had duplicate `aiConfig` objects caught in review. Explicit guidance prevents this.

---

## 3. Add Backwards Compatibility Check to Reviewer

**Source**: `2026-03-07_reimagine-v2-orchestration-learnings.md`

**Current**: Step 13 describes reviewer code review but lacks backwards compat guidance.

**Proposed** — Add to reviewer dispatch prompt (Step 13):
```markdown
**Backwards Compatibility Check** (if task modifies data-writing code):
- Does the implementation handle legacy data formats?
- If fixing a bug in data-writing code: "What about existing data created by the old buggy code?"
- Can users with old data still function, or will they be stranded?
```

**Rationale**: Grumpy reviewer caught that priority toggle only handled new format, stranding old data.

---

## 4. Add Build Script Verification to Risk Categories

**Source**: `2026-03-08_ai-config-learnings.md`

**Current**: Step 6 risk table has 10 categories but no build script verification.

**Proposed** — Add row to risk table:
```markdown
| **Build Scripts** | Do referenced scripts exist? | "Verify `npm run build:agents:dev` exists before putting in prompts" |
```

**Rationale**: ai-config referenced non-existent `build:agents:dev` script. Verify before including.

---

## 5. Formalize "Grumpy Reviewer" Mindset

**Source**: `2026-03-07_reimagine-v2-orchestration-learnings.md`

**Current**: Reviewer role says "sr. engineer" but doesn't capture the adversarial mindset.

**Proposed** — Add paragraph to Reviewer role section (after the numbered list):
```markdown
**Mindset**: The "grumpy senior engineer who doesn't trust anything" persona is highly effective. Ask adversarial questions: "What if this already exists?", "What about legacy data?", "Did you verify or assume?" This pattern caught 5 phantom tasks and a critical backwards compat issue in the reimagine-v2 PRD.
```

**Rationale**: Codifies the pattern that saved 80% work on reimagine-v2.

---

## 6. Add Shared Utility Extraction Mitigation

**Source**: `.pi/skills/execute-prd/LEARNINGS.md`

**Current**: Step 7 has documentation mitigation but no shared utility guidance.

**Proposed** — Add after Documentation Impact Mitigation:
```markdown
**Shared Utility Mitigation:**

If pre-mortem identifies that two tasks will need the same helper/formatter/utility:
1. **Option A**: Add a Task 0 to create the shared utility first (before both tasks).
2. **Option B**: In Task 2's prompt, explicitly state: "Import [utility] from Task 1's file; do not reimplement."

**Anti-pattern**: Flagging duplication in code review then filing a refactor item. Better to prevent during implementation.
```

**Rationale**: Prevents duplication upfront rather than catching in review.

---

## 7. Update LEARNINGS.md with New Patterns

**Source**: Multiple entries

**Proposed** — Add to `.pi/skills/execute-prd/LEARNINGS.md`:

### New Proven Patterns:

```markdown
### 4. Phantom task detection before execution

Before starting a PRD, verify proposed files don't already exist and functionality isn't already implemented. The reimagine-v2 PRD had 5/6 phantom tasks — this check saved ~80% of wasted work.

**Evidence**: reimagine-v2-orchestration PRD (2026-03-07) — Engineering review found 5/6 tasks were phantom.

### 5. Backwards compatibility for data-writing code

When fixing bugs in data-writing code, always ask: "What about existing data created by the old buggy code?" Users with old data formats shouldn't be stranded.

**Evidence**: reimagine-v2-orchestration PRD (2026-03-07) — Priority toggle fix needed to handle both old (`[x]`) and new (`- [x]`) formats.

### 6. Extract constants for repeated structures

If you use the same config object, schema, or data structure more than once, extract to a named constant. Catch DRY violations before code review, not during.

**Evidence**: ai-config PRD (2026-03-08) — AI-4 had duplicate aiConfig objects caught in review.
```

### Updated Metrics Table:

```markdown
| PRD | Tasks | Success Rate | Iterations | Tests Added | Pre-Mortem Effectiveness |
|-----|-------|--------------|------------|-------------|--------------------------|
| calendar-events (2026-02-25) | 5/5 | 100% | 0 | +57 | 9/9 mitigated |
| calendar-freebusy (2026-02-25) | 6/6 | 100% | 1 | +59 | 7/7 mitigated |
| project-updates (2026-02-25) | 6/6 | 100% | 0 | +9 | 7/7 mitigated |
| ai-config (2026-03-08) | 5/5 | 100% | 3 | +75 | 8/8 mitigated |
| reimagine-v2 (2026-03-07) | 1/6* | 100% | 1 | n/a | 9/9 mitigated |

*5/6 tasks were phantom (already implemented); only 1 task required actual work
```

---

## Summary

| # | Improvement | Location | Impact | Effort |
|---|-------------|----------|--------|--------|
| 1 | Phantom task detection | SKILL.md Phase 0, new step 2.5 | **High** (saved 80% work) | Medium |
| 2 | DRY constant extraction | SKILL.md Step 10, prompt template | Medium | Small |
| 3 | Backwards compat check | SKILL.md Step 13, reviewer prompt | Medium | Small |
| 4 | Build script verification | SKILL.md Step 6, risk table | Low | Small |
| 5 | Grumpy reviewer mindset | SKILL.md Roles section | **High** (systemic) | Small |
| 6 | Shared utility mitigation | SKILL.md Step 7, mitigations | Medium | Small |
| 7 | LEARNINGS.md updates | LEARNINGS.md | Low | Small |

---

## Files to Modify

1. `.pi/skills/execute-prd/SKILL.md` — Improvements 1-6
2. `.pi/skills/execute-prd/LEARNINGS.md` — Improvement 7
