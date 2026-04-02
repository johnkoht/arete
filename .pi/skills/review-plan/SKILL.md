---
name: review-plan
description: Structured second-opinion review for plans, PRDs, or completed work. Enforces strict acceptance criteria, loads domain expertise for medium+ plans, and outputs actionable refinements.
category: build
work_type: development
---

# Review Plan Skill

Provide a rigorous quality gate for plans, PRDs, or completed work. Applies tiered checklists, validates acceptance criteria, and outputs actionable refinements (not just advisory notes).

**INTERNAL TOOLING** — For developing Areté itself, not for end users.

## When to Use

- "Review this plan"
- "Can you give me a second opinion on this?"
- "Critique this PRD"
- "Does this implementation look good?"
- When one agent creates work and another should evaluate it
- Before `/approve` on medium+ plans

## Workflow Overview

```
Step 1: Assess Complexity → Quick or Full path
         ↓
Step 2: [Full only] Load Expertise Profiles
         ↓
Step 3: [Full only] Scan LEARNINGS.md
         ↓
Step 4: Identify Review Type (Plan/PRD/Implementation)
         ↓
Step 5: Clarify Audience (Builder/User)
         ↓
Step 6: Apply Checklist (with AC validation for Plans/PRDs)
         ↓
Step 7: Devil's Advocate (mandatory)
         ↓
Step 8: Determine Verdict (with pre-mortem gating)
         ↓
Step 9: Output Review (Direct Refinement OR Structured Suggestions)
         ↓
Step 10: Save and Discuss
```

---

## Step 1: Assess Complexity

Determine whether to use **Quick Review** or **Full Review** based on plan characteristics.

### Decision Flowchart

```
Is this a Plan or PRD being reviewed?
  ├─ No (Implementation) → Full Review
  └─ Yes → Check complexity:
           │
           ├─ Steps ≤ 3 AND files ≤ 2 AND no architectural decisions?
           │     └─ Yes → Quick Review
           │
           └─ Otherwise → Full Review
                (≥4 steps OR ≥3 files OR architectural decisions)
```

### Complexity Tiers (for reference)

| Tier | Steps | Files | Characteristics |
|------|-------|-------|-----------------|
| Tiny | 1-2 | 1 | Single-purpose change |
| Small | 3 | 2 | Focused feature |
| Medium | 4-6 | 3+ | Multi-component work |
| Large | 7+ | 5+ | Architectural changes |

### Quick vs Full Review

| Aspect | Quick Review | Full Review |
|--------|--------------|-------------|
| Expertise profiles | Skip | Load based on packages touched |
| LEARNINGS.md scan | Skip | Check affected directories |
| AC validation | Basic check | Full rubric with anti-pattern detection |
| Pre-mortem gating | Optional mention | Required for Large, recommended for Medium |
| Typical duration | 2-3 minutes | 5-10 minutes |

**Output the path chosen:**
```markdown
**Review Path**: Quick / Full
**Reason**: [e.g., "3 steps, 2 files, no architectural decisions"]
```

---

## Step 2: Load Expertise Profiles (Full Review Only)

For **Full Review**, determine which packages the plan touches and load corresponding expertise profiles.

### Package → Profile Mapping

| Files Touch | Load Profile |
|-------------|--------------|
| `packages/core/` | `.pi/expertise/core/PROFILE.md` |
| `packages/cli/` | `.pi/expertise/cli/PROFILE.md` |
| `packages/apps/backend/` | `.pi/expertise/backend/PROFILE.md` |
| `packages/apps/web/` | `.pi/expertise/web/PROFILE.md` |
| `.pi/skills/`, `dev/`, docs only | No profile needed |

### Profile Section Extraction

Different profiles have different structures. Extract key sections:

| Profile | Sections to Extract |
|---------|---------------------|
| **Core** | `## Invariants`, `## Anti-Patterns & Common Mistakes`, `## Key Abstractions & Patterns` |
| **CLI** | `## Purpose & Boundaries`, `## Command Architecture`, first 100 lines of `## Command Map` |
| **Other** | First 150-200 lines (fallback) |

Use extracted content to validate architectural decisions against documented invariants.

> **Reference**: See `.pi/skills/LEARNINGS.md` learning #3 for profile section mapping rationale.

---

## Step 3: Scan LEARNINGS.md (Full Review Only)

Check for LEARNINGS.md files in directories the plan affects.

### Known LEARNINGS.md Locations

```
.pi/skills/LEARNINGS.md
.pi/skills/execute-prd/LEARNINGS.md
.pi/extensions/plan-mode/LEARNINGS.md
packages/core/src/search/LEARNINGS.md
packages/core/src/services/LEARNINGS.md
packages/core/src/integrations/LEARNINGS.md
packages/core/src/adapters/LEARNINGS.md
packages/cli/src/commands/LEARNINGS.md
```

### What to Check

- **Gotchas**: Does the plan avoid documented pitfalls?
- **Invariants**: Does the plan respect documented constraints?
- **Pre-edit checklists**: Are required checks included in the plan?

If the plan violates a documented gotcha or invariant, flag it as a **Concern**.

---

## Step 4: Identify Review Type

Determine what's being reviewed:

- **Plan** — A proposed approach before execution (steps, tasks, architecture)
- **PRD** — Requirements document before implementation
- **Implementation** — Completed work after execution

If unclear, ask: "Is this a plan (pre-execution), PRD (requirements), or implementation (completed work)?"

---

## Step 5: Clarify Audience

Before reviewing, confirm: **Who is this for?**

- **Builder** — Internal tooling for developing Areté (belongs in `dev/`, `.pi/`)
- **User** — End-user functionality for PMs using Areté (belongs in `packages/runtime/`, `src/`)

If the artifact doesn't make audience clear, **flag it as a concern**. Ambiguous audience leads to misplaced code, confusing docs, and scope creep.

---

## Step 6: Apply the Checklist

Use the appropriate checklist based on review type. **For Plans and PRDs, also apply the AC Validation Rubric.**

### Plan Review Checklist

| Concern | Question |
|---------|----------|
| Audience | Is it clear who this is for (builder vs user)? |
| Scope | Is the scope appropriate? Over-engineered or under-scoped? |
| Risks | Are there unidentified risks? (See pre-mortem categories) |
| Dependencies | Are task dependencies clear and correctly ordered? |
| Patterns | Does it follow existing patterns or introduce unnecessary novelty? |
| Multi-IDE | Does work touch `runtime/`, `.agents/sources/`, or multi-IDE content? |
| Backward compatibility | Will this break existing functionality? |
| Catalog | If work touches tooling/extensions/services, are `dev/catalog/capabilities.json` entries current? |
| Completeness | Are there missing steps or implicit assumptions? |
| **Test coverage** | Does each code-touching task have test expectations? |
| **Quality gates** | Does the plan include verification steps (`npm run typecheck && npm test`)? |

### PRD Review Checklist

| Concern | Question |
|---------|----------|
| Audience | Is it clear who this is for (builder vs user)? |
| Problem clarity | Is the problem well-defined? |
| **Acceptance criteria** | Do ALL criteria pass the AC Validation Rubric? |
| Edge cases | Are edge cases and error states covered? |
| Scope boundaries | Is out-of-scope clearly defined? |
| Dependencies | Are external dependencies identified? |
| Multi-IDE | Will changes affect both Cursor and Claude installations? |
| Catalog | If work touches tooling/extensions/services, are `dev/catalog/capabilities.json` entries current? |
| **Test coverage** | Are test requirements explicit for each task? |

### Implementation Review Checklist

| Concern | Question |
|---------|----------|
| Audience | Is the code in the right location for its audience? |
| Intent match | Does the work match the original plan/PRD intent? |
| Acceptance criteria | Are all criteria met? |
| Code quality | Patterns followed, proper error handling, no shortcuts? |
| Multi-IDE | Did changes to `runtime/` or `.agents/sources/` follow consistency rules? |
| Catalog | If work touches tooling/extensions/services, are `dev/catalog/capabilities.json` entries current? |
| Test coverage | Are happy path and edge cases tested? |
| Backward compatibility | Did existing functionality survive? |
| Documentation | Are changes reflected in docs if needed? |

---

## AC Validation Rubric

**Apply this rubric to every acceptance criterion in Plans and PRDs.**

### The Rubric (Mechanical Checklist)

For each AC, verify:

- [ ] **Independently verifiable**: Can this criterion be checked without checking other criteria?
- [ ] **Specific**: Does it state exactly what must be true, not a vague direction?
- [ ] **Testable**: Could you write a test or verification step for this?
- [ ] **Single concern**: Does it test one thing, not multiple things combined?
- [ ] **No vague language**: Free of anti-pattern phrases (see below)?

### Anti-Pattern Phrases to Flag

| Phrase | Problem | Better Alternative |
|--------|---------|-------------------|
| "should work" | Untestable | "returns success response with status 200" |
| "properly handles" | Vague | "returns error message when input is null" |
| "as expected" | Undefined expectation | "matches the format defined in schema.ts" |
| "is correct" | No verification criteria | "equals the value from config.yaml" |
| "appropriately" | Subjective | "within 100ms" or "following pattern from X" |
| "etc." | Incomplete | List all cases explicitly |
| "and/or" | Ambiguous scope | Split into separate criteria |

### Good vs Bad Examples

| ❌ Bad AC | Why It's Bad | ✅ Good AC |
|----------|--------------|-----------|
| "Authentication works properly" | Vague, untestable | "User with valid token receives 200; invalid token receives 401" |
| "Handles edge cases" | No specific cases | "Returns empty array when no results; returns error when query is malformed" |
| "Performance is acceptable" | Subjective | "Response time < 200ms for 95th percentile" |
| "Form validates input correctly" | Multiple concerns | "Email field rejects invalid format"; "Required fields show error when empty" |
| "Data is saved as expected" | Undefined expectation | "Record appears in database with all fields matching input" |
| "Error handling is implemented" | No specifics | "Network errors display user-friendly message and log to console" |

### Documentation-Only Exception

For tasks that only modify documentation (markdown, comments, README):
- Test coverage is NOT required
- AC should focus on content accuracy, completeness, and correct file locations

---

## Test Coverage Requirements

**For Plans and PRDs that modify code, verify test expectations are explicit.**

### What to Check

| Task Type | Required Test Expectation |
|-----------|--------------------------|
| New function/module | "Tests for happy path + edge cases + error handling" |
| Bug fix | "Regression test that reproduces the bug" |
| Refactor | "Existing tests pass; new tests for new behavior if any" |
| New file | "Corresponding test file created" |
| Documentation only | No test required (note: "Documentation only — no tests") |

### Flag If Missing

If a code-modifying task has no test expectation, flag it:

```markdown
**Test Coverage Gap**: Task 3 modifies `services/memory.ts` but has no test expectation.
- Suggestion: Add AC "Unit tests for new search function cover empty results, single match, multiple matches"
```

### Reference

See `.pi/standards/build-standards.md` § Testing Requirements for full test infrastructure details.

---

## Step 7: Devil's Advocate (Mandatory)

After the checklist, actively argue against the work. **Do not skip this section.**

- **"If this fails, it will be because..."** — Articulate the most likely failure mode. What assumption is wrong? What dependency will break? What was underestimated?

- **"The worst outcome would be..."** — Surface the highest-stakes risk. What's the worst thing that could happen if this goes wrong?

This adversarial thinking surfaces concerns that checklists miss.

---

## Step 8: Determine Verdict

Choose the appropriate verdict based on findings and plan complexity.

### Verdict Options

| Verdict | When to Use |
|---------|-------------|
| **Approve** | No concerns, all checks pass |
| **Approve with suggestions** | Minor improvements, not blocking |
| **Approve pending pre-mortem** | Medium+ plan without pre-mortem |
| **Revise** | Significant concerns that must be addressed |

### Pre-Mortem Gating

| Complexity | Pre-Mortem Requirement |
|------------|----------------------|
| Tiny/Small | Optional (mention if skipped) |
| Medium | Recommend: "Approve pending pre-mortem" if not done |
| Large | **Required**: Cannot give "Approve" without pre-mortem |

If a Large plan has no pre-mortem, the verdict MUST be "Approve pending pre-mortem" or "Revise", never "Approve".

---

## Step 9: Output the Review

Choose output mode based on context and user preference.

### Mode A: Direct Refinement

If the reviewer has permission to edit the plan directly:

1. Ask: "I found N concerns. Should I refine the plan directly, or provide suggestions for you to apply?"
2. If approved, edit `plan.md` using the Edit tool
3. Mark edited sections with `<!-- refined by review -->`
4. Re-run relevant checklist items to verify fixes

### Mode B: Structured Suggestions

Provide concrete, actionable feedback the orchestrator can apply:

```markdown
### Suggested Changes

**Change 1**: [Category]
- **What's wrong**: [Specific finding with location]
- **What to do**: [Concrete instruction]
- **Where to fix**: [File path, section, or line reference]

**Change 2**: [Category]
- **What's wrong**: [Specific finding]
- **What to do**: [Concrete instruction]
- **Where to fix**: [Location]
```

### Review Output Template

```markdown
## Review: [Artifact Name]

**Type**: Plan / PRD / Implementation
**Audience**: Builder / User / Unclear
**Review Path**: Quick / Full
**Complexity**: Tiny / Small / Medium / Large

### Concerns

1. **[Category]**: [Specific concern]
   - Suggestion: [How to address]

2. **[Category]**: [Specific concern]
   - Suggestion: [How to address]

### AC Validation Issues (if any)

| Task | AC | Issue | Suggested Fix |
|------|-----|-------|---------------|
| Task 2 | AC 1 | Vague ("works properly") | "Returns 200 on success, 400 on invalid input" |

### Test Coverage Gaps (if any)

- Task 3: Modifies `memory.ts` but no test expectation

### Strengths

- [What's good about this work]

### Devil's Advocate

**If this fails, it will be because...** [Most likely failure mode]

**The worst outcome would be...** [Highest-stakes risk]

### Verdict

- [ ] **Approve** — Ready to proceed
- [ ] **Approve with suggestions** — Minor improvements recommended
- [ ] **Approve pending pre-mortem** — Run `/pre-mortem` before `/approve`
- [ ] **Revise** — Address concerns before proceeding

### Suggested Changes (Mode B)

[If providing structured suggestions instead of direct refinement]
```

---

## Step 10: Save and Discuss

### Save the Review

If there's an active plan (you're in plan mode), use the `save_plan_artifact` tool:

```
save_plan_artifact(filename: "review.md", content: <full review markdown>)
```

This saves to `dev/work/plans/{slug}/review.md` for future reference.

### Discuss and Close

- Present the review to the author
- Discuss any concerns that need clarification
- If verdict is "Revise," specify what must change before approval
- If verdict is "Approve pending pre-mortem," remind to run `/pre-mortem`

---

## Self-Referential Note

When reviewing changes to **this skill itself** (`.pi/skills/review-plan/SKILL.md`):
- Use the current skill version to perform the review
- The enhanced skill takes effect after deployment
- This is not a circular dependency — you're reviewing the proposed changes, not using them

---

## Tips for Reviewers

- **Be specific**: "Task 3 depends on Task 2 but they're listed in parallel" beats "dependencies unclear"
- **Be constructive**: Every concern should have a suggestion
- **Be honest**: The value is in catching problems, not validating work
- **Argue against it**: The devil's advocate section should feel uncomfortable — that's the point
- **Flag unclear audience**: If you can't tell who the work is for, that's a problem worth raising
- **Validate ACs mechanically**: Use the rubric checklist, not gut feeling

---

## References

- **Risk categories**: `dev/autonomous/templates/PRE-MORTEM-TEMPLATE.md`
- **Code quality checklist**: `.pi/standards/build-standards.md`
- **Profile section mapping**: `.pi/skills/LEARNINGS.md` learning #3
- **Reviewer feedback format**: `.pi/agents/reviewer.md`
- **Related skills**: `.pi/skills/run-pre-mortem/SKILL.md`
