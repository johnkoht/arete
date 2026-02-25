---
title: Project Updates
slug: project-updates
status: complete
size: medium
tags: [skills, patterns, indexing]
created: 2026-02-25T03:18:44.201Z
updated: 2026-02-25T04:02:43.810Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 6
---

## Problem Definition

Three distinct gaps in the project workflow:

### 1. No Generic Project Template
Current project templates are work-type specific: `discovery`, `definition` (PRD), `analysis`, `roadmap`. When a user starts work that doesn't fit these categories (domain ownership, ongoing work, research project, migration project), agents improvise — which can work well (as with glance-comms) but lacks consistency.

### 2. No "Research Intake" Workflow
When users drop bulk files into `inputs/`, there's no skill or pattern for processing them systematically. The agent in your case improvised well (created synthesis, individual analyses), but there's no defined workflow for:
- Processing multiple input documents
- Creating analyses for each
- Synthesizing across documents
- Indexing for searchability

### 3. Indexing Happens Too Late
Skills say "run `arete index` to make content searchable" but only at **finalize** (project completion). When you drop files early and process them, they're not searchable until the project ends. The gap is:
- Skills don't instruct agents to index after bulk content creation
- There's no clear "index checkpoint" pattern
- **Inconsistency**: Some skills use `arete index`, others use `qmd update` — fix if touched, defer otherwise

---

## Routing Context

The general-project skill is a **fallback** for work that doesn't fit specialized categories. Existing skills take precedence:

| If user says... | Routes to | Project template |
|-----------------|-----------|------------------|
| "start discovery", "research [topic]" | `discovery` | discovery |
| "analyze competitors", "competitive research" | `competitive-analysis` | analysis |
| "build roadmap", "quarterly planning" | `construct-roadmap` | roadmap |
| "create PRD", "write PRD" | `create-prd` | definition |
| **"start a project"**, **"new project for X"** | **`general-project`** ← NEW | general |

Use cases for general-project:
- Domain ownership (like glance-comms)
- Migration projects
- Ongoing operational work
- Ad-hoc project structures

**Routing constraint**: Triggers must not intercept specialized skills. "Start a project for domain ownership" → general-project. "Start a discovery project" → discovery.

---

## Persona Council Summary

*All persona reactions are hypothesis-based (no evidence collected). Treat as directional guidance.*

| Persona | Would use? | Key insight |
|---------|------------|-------------|
| **Harvester** | Maybe (research-intake only) | Rejects "what type?" question mid-flow. Needs invisible processing. |
| **Architect** | Yes (enthusiastically) | Wants categorization, structured template, explicit workflows. |
| **Preparer** | Conditionally | Tolerates friction if it improves artifact quality. Cares about concise output. |

**Council decisions:**

| Touchpoint | Decision | Rationale |
|------------|----------|-----------|
| "What type of work?" question | **Optional, skippable** | Architect wants it; Harvester rejects it. Accept "just start" with sensible defaults. |
| Template structure (phases, threads, tasks) | **On by default, customizable** | Ship opinionated defaults with "optional" markers. |
| Research-intake pattern | **Suggest, don't auto-apply** | Avoid unwanted file processing; let user confirm. |
| Index checkpoint | **Required, silent** | Agents run `arete index` automatically; no user action. |
| Output verbosity | **Concise by default** | Preparer wants artifact quality, not volume. Include structural limits. |

---

## Dependencies

**Explicit ordering**:
- Steps 3-4 depend on Step 2 (pattern must exist before skills reference it)
- Step 4 depends on Step 1 (general-project must exist before updating it)

---

## Plan

### Phase 1: Generic Project Template (small)

**1. Create `general` project type and template**
- Add `packages/runtime/skills/general-project/` skill directory
- Create `SKILL.md` with:
  - `creates_project: true`
  - `project_template: general`
  - Triggers: "start a project", "new project", "create project for [topic]"
  - Negative triggers: "Do NOT use for: discovery, competitive analysis, PRD, or roadmap work — those have dedicated skills"
- Create `templates/project.md` with flexible structure (based on glance-comms):
  - Work type (optional — user can fill in or skip)
  - Phases (generic defaults: Setup → Active → Complete; **mark as optional**)
  - Active threads table (Thread | Status | Key People | Notes) — **mark as optional**
  - Tasks section
  - Key questions / Open questions
  - Stakeholders — **mark as optional**
  - Standard folder structure (inputs/, working/, outputs/)
  - **Add minimal project guidance** at top: "For lightweight projects, keep: Overview, Tasks, Status Updates. Remove optional sections."
- Skill workflow: 
  - Ask "what type of work is this?" but accept "just start" or minimal answer
  - Use sensible defaults if user skips the question
  - Don't require categorization to proceed

**AC:**
- [ ] `arete skill list` shows `general-project`
- [ ] Router routes "start a project for X" to `general-project`
- [ ] Router routes "start a discovery project" to `discovery` (not general-project)
- [ ] Skill creates project with flexible README structure
- [ ] User can create project without answering categorization question (sensible defaults)
- [ ] Template has "optional" markers on heavyweight sections (Phases, Threads, Stakeholders)
- [ ] Template includes minimal project guidance

### Phase 2: Research Intake Pattern (medium)

**2. Add `research_intake` pattern to existing PATTERNS.md**

*Depends on: nothing (can start first)*

- PATTERNS.md already exists with 5 patterns (Template Resolution, get_meeting_context, etc.)
- Define when to use: bulk document processing in `inputs/`
- **Suggest, don't auto-apply**: "When bulk files detected in `inputs/`, suggest the pattern: 'I see several files in inputs/. Would you like me to process them using the research_intake pattern?'"
- Define workflow:
  1. Scan inputs/ for new files
  2. For each document: create `working/analysis-[slug].md` using the **analysis template** (below)
  3. After all individual analyses: create `working/synthesis-[topic].md` synthesizing themes
  4. Update project README with key findings
  5. **Run `arete index`** to make all content searchable
  6. **Cleanup step**: "After synthesis is complete, consider archiving or deleting individual analysis files if they've served their purpose"

- **Analysis template** (include in pattern):
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

- **Conciseness guidance** (structural limits, not word counts):
  - Individual analyses: "5-7 bullet points max in Key Points. Summary is 2-3 sentences, not paragraphs."
  - Synthesis: "Focus on actionable themes and contradictions. If you're writing more than 10 paragraphs, you're being too verbose."
  - Overall: "The synthesis is the primary deliverable. Individual analyses are scaffolding — keep them tight or archive them."

**3. Update discovery skill to use research-intake pattern**

*Depends on: Step 2*

- Discovery already has `arete index` at Finalize (step 7) — good
- Add guidance after "Capture Inputs" (step 4): "If user drops bulk files, use the `research_intake` pattern"
- Reference the PATTERNS.md section
- **Add explicit step** (not just inline mention): dedicated numbered step pointing to pattern

**4. Update general-project skill to use research-intake pattern**

*Depends on: Steps 1 and 2*

- Include guidance for processing bulk inputs
- Reference PATTERNS.md
- **Add explicit step**: dedicated numbered step pointing to pattern

**AC:**
- [ ] PATTERNS.md has `research_intake` pattern with clear steps
- [ ] Pattern includes analysis template structure
- [ ] Pattern uses "suggest" language, not auto-apply
- [ ] Pattern includes structural limits (bullet point caps, sentence limits) instead of word counts
- [ ] Pattern includes cleanup/archive step for intermediate files
- [ ] Pattern includes explicit `arete index` step
- [ ] Discovery skill has dedicated step referencing pattern
- [ ] General-project skill has dedicated step referencing pattern

### Phase 3: Index Checkpoint Guidance (small)

**5. Add "index checkpoint" guidance to skills**

*Depends on: nothing (can run in parallel with Phase 1)*

- **Pre-implementation audit**: Run `grep -l "working/\|outputs/\|\.md" packages/runtime/skills/*/SKILL.md` to find all skills that write files
- **Scope cap**: Audit identifies up to 8 skills. If more are found, prioritize by frequency of use or defer to follow-up work.
- Review each for whether index guidance is needed (expected: synthesize, finalize-project, save-meeting, process-meetings, plus the 5 already listed)
- **QMD consistency (conditional)**: If the audit touches skills using `qmd update` (finalize-project, periodic-review, synthesize), update them to `arete index` for consistency. If not touched, defer to follow-up work.
- Update confirmed skills with index checkpoints:
  - After bulk content creation (not just at finalize)
  - After processing inputs
  - After creating working documents
- **Use standard phrase**: "After saving substantial content, run `arete index` to make it immediately searchable."
- **Consistent placement**: Add to same location in each skill (end of content-creation step or dedicated Indexing section)

**6. Update onboarding tool to index after creating project files**
- Already has `Run arete index` in activation workflow step 6 — verify this is working and clearly documented

**AC:**
- [ ] Pre-implementation audit completed (list of affected skills confirmed, max 8)
- [ ] Skills touched by this plan use `arete index` (fix `qmd update` only if touched)
- [ ] All affected skills use identical index checkpoint wording
- [ ] Skills instruct agents to index after creating substantial content
- [ ] Pattern is consistent: "After saving [X], run `arete index` so content is immediately searchable"

---

## Size Estimate

**Medium** (6 steps across 3 phases)

- Phase 1: New skill + template (~2 hours)
- Phase 2: Pattern definition + skill updates (~1.5 hours)
- Phase 3: Guidance updates across multiple skills (~1 hour)

---

## Out of Scope

- **MCP tool for indexing** — Agents can already run `arete index` via bash; the issue is guidance, not capability
- **Automatic indexing on file write** — Could be nice but adds complexity; explicit indexing in workflows is simpler
- **Project type detection** — The general-project skill asks the user; no auto-detection needed

---

## Risks (from Pre-Mortem + Review)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Routing conflict with specialized skills | Medium | High | Negative triggers in SKILL.md; routing tests in AC |
| Auto-trigger too aggressive | Medium | Medium | Changed to "suggest, don't auto-apply" |
| Pattern adoption failure | Medium | Medium | Dedicated numbered steps in skills, not inline mentions |
| Index checkpoint scatter | Low | Low | Standard phrase; consistent placement |
| Template doesn't fit use cases | Low | Medium | Optional markers; minimal project guidance |
| Missing skill updates | Medium | Low | Pre-implementation audit before Step 5; scope cap at 8 |
| Output verbosity (2x inflation) | High | Medium | Structural limits (bullet caps); analysis template; cleanup step |
| Analysis structure undefined | Medium | Medium | Analysis template included in pattern |
| QMD/arete index inconsistency | Low | Low | Fix only if skills are touched; otherwise defer |

---

## Reference: glance-comms Example

The agent-created structure that worked well (use as template design reference):

**README sections:**
- Overview (context paragraph)
- Phases (checkbox list: Inherit, Stabilize, Expand, Own) — *mark optional*
- Active Threads (table: Thread, Status, Key People | Notes) — *mark optional*
- Tasks (checkbox list)
- Key Questions (numbered list)
- Stakeholders (bullet list with roles) — *mark optional*
- Folder Structure (code block)
- Related Context (links)
- Success Criteria (checkbox list)
- Status Updates (dated entries)

**Working files created:**
- `synthesis-research-intake.md` — Overall synthesis with narrative arc, themes, priorities
- `analysis-*.md` — Individual document analyses (one per input) — *consider archiving after synthesis*
- `current-state.md` — Living doc of how things work today

---

## Recommendation

This is medium-sized but low-risk. The work is additive (new skill, new pattern) not disruptive. Pre-mortem completed with 7 risks; review added 2 more with mitigations now in plan.

Ready for `/approve` when you are.
