# PRD: Project Updates

**Version**: 1.0  
**Status**: Draft  
**Date**: 2026-02-24  
**Depends on**: None (additive work)

---

## 1. Problem & Goals

### Problem

Three distinct gaps in the project workflow:

**1. No Generic Project Template**  
Current project templates are work-type specific: `discovery`, `definition` (PRD), `analysis`, `roadmap`. When a user starts work that doesn't fit these categories (domain ownership, ongoing work, migration project), agents improvise — which can work well but lacks consistency.

**2. No "Research Intake" Workflow**  
When users drop bulk files into `inputs/`, there's no skill or pattern for processing them systematically. Agents improvise individual analyses and synthesis, but there's no defined workflow for:
- Processing multiple input documents
- Creating structured analyses for each
- Synthesizing themes across documents
- Indexing for immediate searchability

**3. Indexing Happens Too Late**  
Skills instruct agents to run `arete index` only at **finalize** (project completion). When users drop files early and process them, the content isn't searchable until the project ends.

### Goals

1. **Generic project skill**: Create a `general-project` skill that serves as a fallback for work that doesn't fit specialized categories. Include flexible, customizable template.
2. **Research intake pattern**: Define a reusable `research_intake` pattern in PATTERNS.md for bulk document processing with conciseness guidance.
3. **Earlier indexing**: Add "index checkpoint" guidance to skills that create content, so files become searchable immediately after creation.

### Out of Scope

- **MCP tool for indexing** — Agents can already run `arete index` via bash; the issue is guidance, not capability
- **Automatic indexing on file write** — Adds complexity; explicit indexing in workflows is simpler
- **Project type detection** — The general-project skill asks the user; no auto-detection needed
- **Full QMD/arete index standardization** — Fix only if skills are touched by this work; defer otherwise

---

## 2. Design Decisions

### Routing

The general-project skill is a **fallback**. Existing skills take precedence:

| User says | Routes to |
|-----------|-----------|
| "start discovery", "research [topic]" | `discovery` |
| "analyze competitors" | `competitive-analysis` |
| "build roadmap" | `construct-roadmap` |
| "create PRD" | `create-prd` |
| **"start a project"**, **"new project for X"** | **`general-project`** |

The skill must include negative triggers to prevent routing conflicts.

### Research Intake Pattern

The pattern uses "suggest, don't auto-apply" to avoid unwanted file processing:
> "When bulk files detected in `inputs/`, suggest: 'I see several files in inputs/. Would you like me to process them?'"

Includes structural limits (not word counts) to prevent verbosity:
- Individual analyses: 5-7 bullet points max, 2-3 sentence summary
- Synthesis: Max 10 paragraphs
- Cleanup step: Archive/delete intermediate files after synthesis

### Index Checkpoint Standard

Use consistent phrase: "After saving substantial content, run `arete index` to make it immediately searchable."

If skills using `qmd update` are touched during the audit, standardize them to `arete index`. Otherwise defer.

---

## 3. Tasks

### Task A: Create general-project skill

**Description**: Create a new skill at `packages/runtime/skills/general-project/` with flexible template based on glance-comms reference.

**Deliverables**:
- `packages/runtime/skills/general-project/SKILL.md` with:
  - `creates_project: true`
  - `project_template: general`
  - Triggers: "start a project", "new project", "create project for [topic]"
  - Negative triggers: "Do NOT use for: discovery, competitive analysis, PRD, or roadmap work"
  - Workflow that asks "what type of work?" but accepts "just start" with sensible defaults
- `packages/runtime/skills/general-project/templates/project.md` with:
  - Work type (optional)
  - Phases (Setup → Active → Complete; marked as optional)
  - Active threads table (marked as optional)
  - Tasks section
  - Key questions
  - Stakeholders (marked as optional)
  - Standard folder structure (inputs/, working/, outputs/)
  - Minimal project guidance at top

**Acceptance Criteria**:
- [ ] `arete skill list` shows `general-project`
- [ ] `arete skill route "start a project for domain ownership"` returns `general-project`
- [ ] `arete skill route "start a discovery project"` returns `discovery` (not general-project)
- [ ] Template has "optional" markers on heavyweight sections (Phases, Threads, Stakeholders)
- [ ] Template includes minimal project guidance at top
- [ ] User can create project without answering categorization question

---

### Task B: Add research_intake pattern

**Description**: Add the `research_intake` pattern to `packages/runtime/skills/PATTERNS.md`.

**Deliverables**:
- New pattern section in PATTERNS.md with:
  - When to use: bulk document processing in `inputs/`
  - Suggest language (not auto-apply)
  - Workflow steps (scan → analyze each → synthesize → update README → index → cleanup)
  - Analysis template structure (Summary, Key Points, Questions, Relevance)
  - Conciseness guidance (structural limits, not word counts)
  - Cleanup step for intermediate files

**Acceptance Criteria**:
- [ ] PATTERNS.md has `research_intake` pattern with clear workflow steps
- [ ] Pattern includes analysis template structure with 4 sections
- [ ] Pattern uses "suggest" language, not auto-apply
- [ ] Pattern includes structural limits (5-7 bullet points, 2-3 sentences, max 10 paragraphs)
- [ ] Pattern includes cleanup/archive step
- [ ] Pattern includes explicit `arete index` step

---

### Task C: Update discovery skill

**Depends on**: Task B

**Description**: Update the discovery skill to reference the research_intake pattern.

**Deliverables**:
- Add dedicated numbered step after "Capture Inputs" (step 4) pointing to research_intake pattern
- Reference PATTERNS.md section

**Acceptance Criteria**:
- [ ] Discovery skill has dedicated step (not inline mention) referencing research_intake pattern
- [ ] Step includes summary: "Process each → synthesize → index"
- [ ] Reference to PATTERNS.md is visible

---

### Task D: Update general-project skill with pattern

**Depends on**: Tasks A and B

**Description**: Update the general-project skill to reference the research_intake pattern.

**Deliverables**:
- Add dedicated numbered step pointing to research_intake pattern
- Reference PATTERNS.md section

**Acceptance Criteria**:
- [ ] General-project skill has dedicated step referencing research_intake pattern
- [ ] Step includes summary: "Process each → synthesize → index"
- [ ] Reference to PATTERNS.md is visible

---

### Task E: Add index checkpoint guidance to skills

**Description**: Audit skills that create content and add index checkpoint guidance.

**Deliverables**:
- Pre-implementation audit: identify skills that write to working/outputs/ (max 8)
- For each affected skill: add "After saving substantial content, run `arete index` to make it immediately searchable."
- Consistent placement (end of content-creation step or dedicated Indexing section)
- If skills using `qmd update` are touched, update to `arete index`

**Acceptance Criteria**:
- [ ] Pre-implementation audit completed (list of affected skills confirmed, max 8)
- [ ] Skills touched by this plan use `arete index` (fix `qmd update` only if touched)
- [ ] All affected skills use identical index checkpoint wording
- [ ] Standard phrase used consistently

---

### Task F: Verify onboarding indexing

**Description**: Verify that onboarding tool indexes after creating project files.

**Deliverables**:
- Review onboarding tool (activation workflow step 6)
- Verify `arete index` is clearly documented
- Fix if missing or unclear

**Acceptance Criteria**:
- [ ] Onboarding tool has `arete index` in activation workflow
- [ ] Step is clearly documented

---

## 4. Pre-Mortem Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Routing conflict with specialized skills | Medium | High | Negative triggers in SKILL.md; routing tests in AC |
| Auto-trigger too aggressive | Medium | Medium | Changed to "suggest, don't auto-apply" |
| Pattern adoption failure | Medium | Medium | Dedicated numbered steps in skills, not inline mentions |
| Index checkpoint scatter | Low | Low | Standard phrase; consistent placement |
| Template doesn't fit use cases | Low | Medium | Optional markers; minimal project guidance |
| Missing skill updates | Medium | Low | Pre-implementation audit; scope cap at 8 skills |
| Output verbosity (2x inflation) | High | Medium | Structural limits (bullet caps); analysis template; cleanup step |
| Analysis structure undefined | Medium | Medium | Analysis template included in pattern |
| QMD/arete index inconsistency | Low | Low | Fix only if skills are touched; otherwise defer |

---

## 5. Reference: glance-comms Example

Use as template design reference:

**README sections**:
- Overview (context paragraph)
- Phases (checkbox list) — *mark optional*
- Active Threads (table) — *mark optional*
- Tasks (checkbox list)
- Key Questions (numbered list)
- Stakeholders (bullet list) — *mark optional*
- Folder Structure (code block)
- Related Context (links)
- Success Criteria (checkbox list)
- Status Updates (dated entries)

**Analysis template** (include in pattern):
```markdown
## Summary
2-3 sentences. What is this document about?

## Key Points
- [Point 1]
- [Point 2]
- [Point 3]
(5-7 bullet points max — if you have more, prioritize)

## Questions/Concerns
- What's unclear or needs follow-up?

## Relevance to Project
How does this connect to the project goal?
```

---

## 6. Task Dependencies

```
Task A (general-project skill) ─────────────────────┐
                                                    │
Task B (research_intake pattern) ──┬── Task C ──────┼── Task D
                                   │                │
Task E (index checkpoints) ────────┴────────────────┘
                                                    
Task F (verify onboarding) ─────────────────────────
```

**Execution order**:
- Tasks A, B, E, F can start in parallel
- Task C depends on B
- Task D depends on A and B
