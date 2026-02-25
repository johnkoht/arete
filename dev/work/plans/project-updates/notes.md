# Plan: Generic Project Template & Research Intake Pattern

**Status**: draft
**Size**: medium (6 steps across 3 phases)
**Created**: 2026-02-23

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

---

## Plan

### Phase 1: Generic Project Template (small)

**1. Create `general` project type and template**
- Add `packages/runtime/skills/general-project/` skill directory
- Create `SKILL.md` with:
  - `creates_project: true`
  - `project_template: general`
  - Triggers: "start a project", "new project", "create project for [topic]"
- Create `templates/project.md` with flexible structure:
  - Work type (user fills in: domain ownership, migration, research, etc.)
  - Phases (generic: Ramp, Stabilize, Deliver, Extend — or custom)
  - Active threads table (like glance-comms)
  - Tasks section
  - Key questions / Open questions
  - Stakeholders
  - Standard folder structure (inputs/, working/, outputs/)
- Skill workflow: Ask user what type of work this is, adapt phase names accordingly

**AC:**
- [ ] `arete skill list` shows `general-project`
- [ ] Router routes "start a project for X" to `general-project`
- [ ] Skill creates project with flexible README structure
- [ ] Template works for domain ownership, research, migration, and ad-hoc work types

### Phase 2: Research Intake Pattern (medium)

**2. Create `research-intake` pattern in PATTERNS.md**
- Define when to use: bulk document processing in `inputs/`
- Define workflow:
  1. Scan inputs/ for new files
  2. For each document: create `working/analysis-[slug].md` with structured analysis
  3. After all individual analyses: create `working/synthesis-[topic].md` synthesizing themes
  4. Update project README with key findings
  5. **Run `arete index`** to make all content searchable

**3. Update discovery skill to use research-intake pattern**
- Add step after "Capture Inputs" that says "If user drops bulk files, use the `research_intake` pattern"
- Reference the PATTERNS.md section

**4. Update general-project skill to use research-intake pattern**
- Include guidance for processing bulk inputs

**AC:**
- [ ] PATTERNS.md has `research_intake` pattern with clear steps
- [ ] Pattern includes explicit `arete index` step
- [ ] Discovery skill references pattern
- [ ] General-project skill references pattern

### Phase 3: Index Checkpoint Guidance (small)

**5. Add "index checkpoint" guidance to skills**
- Update skills that create content (discovery, create-prd, capture-conversation, construct-roadmap, competitive-analysis) to include index checkpoints:
  - After bulk content creation (not just at finalize)
  - After processing inputs
  - After creating working documents

**6. Update onboarding tool to index after creating project files**
- Already has `Run arete index` in activation workflow step 6 — verify this is working and clearly documented

**AC:**
- [ ] Skills instruct agents to index after creating substantial content
- [ ] Pattern is consistent: "After saving [X], run `arete index` so content is immediately searchable"

---

## Size Estimate

**Medium** (6 distinct steps across 3 phases)

- Phase 1: New skill + template (~2 hours)
- Phase 2: Pattern definition + skill updates (~1.5 hours)
- Phase 3: Guidance updates across multiple skills (~1 hour)

---

## Out of Scope

- **MCP tool for indexing** — Agents can already run `arete index` via bash; the issue is guidance, not capability
- **Automatic indexing on file write** — Could be nice but adds complexity; explicit indexing in workflows is simpler
- **Project type detection** — The general-project skill asks the user; no auto-detection needed

---

## Risks

| Risk | Mitigation |
|------|------------|
| General template is too generic, loses value | Include opinionated defaults (phases, threads table) that user can customize |
| research_intake pattern is too prescriptive | Make it a guideline pattern, not a rigid procedure |
| Index guidance scattered across many skills | Add it to PATTERNS.md so skills can reference one place |

---

## Reference: glance-comms Example

The agent-created structure that worked well (use as reference for template design):

**README sections:**
- Overview (context paragraph)
- Phases (checkbox list: Inherit, Stabilize, Expand, Own)
- Active Threads (table: Thread, Status, Key People, Notes)
- Tasks (checkbox list)
- Key Questions (numbered list)
- Stakeholders (bullet list with roles)
- Folder Structure (code block)
- Related Context (links)
- Success Criteria (checkbox list)
- Status Updates (dated entries)

**Working files created:**
- `synthesis-research-intake.md` — Overall synthesis with narrative arc, themes, priorities
- `analysis-*.md` — Individual document analyses (one per input)
- `current-state.md` — Living doc of how things work today
