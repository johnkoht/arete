# Plan Review: Planning Flow Simplification (Phase 1)

## Reviewer Concerns & Resolutions

### 1. Plan Structure — Missing Task Definitions

**Concern**: Plan.md is essentially empty, no formal task breakdown.

**Resolution**: Creating full task definitions below with explicit files, ACs, and dependencies.

---

### 2. Overwrite Semantics — User-Hostile Design

**Concern**: User adds notes to `## Today's Plan`, runs daily-plan again, notes are gone. This is a UX footgun.

**Resolution**: Implement **merge-aware update** strategy:
- Before overwriting, detect user-added content (lines that don't match generated format)
- If user content detected: preserve in a `### Notes` subsection, or warn before overwriting
- Add explicit "Clear and regenerate" option vs "Update meetings only"

**Updated behavior**:
```
If ## Today's Plan exists and has user content:
  → "I see you've added notes. Options:
     1. Keep notes, update meetings only
     2. Replace everything (notes will be lost)
     3. Cancel"
```

This respects user input while allowing refresh.

---

### 3. Task 2 Scope Ambiguity

**Concern**: Is "interactive shaping" a trim+questions or a full rewrite?

**Resolution**: **Trim + questions** approach:
- Keep existing context gathering (quarter goals, calendar, etc.)
- Insert conversation step AFTER context gathered, BEFORE template written
- Ask 2-3 targeted questions based on what context revealed
- Don't rewrite entire workflow

This is a surgical change, not a redesign.

---

### 4. Additional Risks Identified

| Risk | Added to Pre-mortem |
|------|---------------------|
| Calendar not configured | Daily-plan still works; uses "no meetings scheduled" format |
| Multiple daily-plan runs | Merge-aware update addresses this |
| Concurrent writes | Low risk, defer to Phase 2 if seen |

---

## Refined Success Criteria

| Criterion | Measurement | Test |
|-----------|-------------|------|
| ≤5 exchanges | Count user prompts before file written | Conversation log shows ≤5 user inputs |
| ≤20 lines daily output | Line count of generated section | `wc -l` on section content |
| 2-3 questions | Count questions asked | Skill workflow shows question step |
| No auto-watchouts | Check workflow | Watchouts section absent unless requested |
| Existing files work | Test with old week.md | No errors, section appended |
| Notes preserved | Test with user-modified section | Merge prompt appears, notes kept |

---

## Verdict

**Original concerns addressed**. Ready for PRD creation with:
- Full task definitions
- Merge-aware update strategy (resolves overwrite footgun)
- Clarified scope (trim+questions, not rewrite)
- Additional test criteria
