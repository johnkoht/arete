# Pre-Mortem: Project Updates

**Plan**: Project Updates  
**Size**: Medium (6 steps)  
**Date**: 2026-02-24

---

## Risk 1: Routing Conflict with Specialized Skills

**Problem**: The general-project skill triggers on "start a project" and "new project for [topic]". If the router's scoring doesn't clearly prefer specialized skills, phrases like "start a discovery project" or "new project for competitive analysis" might route to general-project instead of the intended skill. This would confuse users who expect the specialized workflow.

**Mitigation**: 
- In the general-project SKILL.md, add explicit negative triggers: "Do NOT use for: discovery, competitive analysis, PRD, or roadmap work — those have dedicated skills"
- In the description field, emphasize "generic" and "ad-hoc" to help router differentiate
- Include routing test cases in the AC (already added: "Router routes 'start a discovery project' to discovery")

**Verification**: After implementation, test these phrases via `arete skill route`:
- "start a project" → general-project ✓
- "start a discovery project" → discovery ✓
- "new project for competitive analysis" → competitive-analysis ✓
- "start a project for domain ownership" → general-project ✓

---

## Risk 2: Auto-Trigger Threshold Too Aggressive

**Problem**: The research_intake pattern auto-triggers on "3+ files in `inputs/`". A user might drop 3 PDFs intending to reference them later (not process them immediately). The agent processes them without asking, creating unwanted analysis files and cluttering `working/`.

**Mitigation**:
- Change auto-trigger from "3+ files added" to "user says 'process these files'" or explicitly mentions bulk processing
- Make the "3+ files" trigger a suggestion, not automatic: "I see you've added several files to inputs/. Would you like me to process them using the research_intake pattern?"
- Document this in PATTERNS.md: "When bulk files detected, suggest research_intake but don't auto-apply"

**Verification**: Pattern documentation includes explicit "suggest, don't auto-apply" language.

---

## Risk 3: Pattern Adoption Failure

**Problem**: Adding research_intake to PATTERNS.md doesn't guarantee agents will use it. Skills (discovery, general-project) reference patterns but agents might skip reading PATTERNS.md entirely, especially if the skill's own steps seem sufficient.

**Mitigation**:
- In each skill update (steps 3-4), add an explicit numbered step: "When user provides bulk files in inputs/, follow the research_intake pattern in PATTERNS.md"
- Don't just reference the pattern — include a one-line summary: "Process each → synthesize → index"
- Make pattern reference highly visible (bold, separate section)

**Verification**: Each updated skill has a dedicated step (not just inline mention) that points to research_intake.

---

## Risk 4: Index Checkpoint Scatter

**Problem**: Step 5 updates 5 skills (discovery, create-prd, capture-conversation, construct-roadmap, competitive-analysis) with index checkpoint guidance. Risk of inconsistent wording, different placement in each skill, or missing some skills that also create content.

**Mitigation**:
- Before implementing Step 5, grep for all skills that create files: `grep -l "Create\|create\|Write\|write" packages/runtime/skills/*/SKILL.md`
- Create a standard phrase: "After saving substantial content, run `arete index` to make it immediately searchable."
- Add the guidance to the same location in each skill (e.g., at the end of each content-creation step, or in a dedicated "Indexing" section)

**Verification**: 
- All 5 skills have identical index checkpoint wording
- Search for "arete index" in all skills to confirm consistent placement

---

## Risk 5: Template Doesn't Fit Use Cases

**Problem**: The general-project template (based on glance-comms) includes specific structures: phases, active threads table, stakeholders. Some use cases (e.g., a simple migration project, a spike) might not need all these sections, making the template feel heavyweight.

**Mitigation**:
- In the template, mark sections as optional with clear labels: "## Phases (customize or remove)"
- Add a "Minimal Project" variant comment at the top: "For lightweight projects, keep: Overview, Tasks, Status Updates. Remove: Phases, Threads, Stakeholders."
- Skill workflow should note: "This template includes optional sections — feel free to simplify"

**Verification**: Template includes explicit "optional" markers and minimal-project guidance.

---

## Risk 6: Missing Skill Updates for Other Content-Creating Skills

**Problem**: Step 5 lists 5 skills for index checkpoint guidance, but this might miss skills that also create searchable content: `synthesize`, `finalize-project`, `save-meeting`, `process-meetings`. These could create content without indexing it.

**Mitigation**:
- Before implementing, run: `grep -l "working/\|outputs/\|\.md" packages/runtime/skills/*/SKILL.md` to find all skills that write files
- Review each for whether index guidance is needed
- Add any missing skills to Step 5

**Verification**: Pre-implementation audit identifies complete list of affected skills.

---

## Risk 7: Output Verbosity — Agent Generates More Than Input

**Problem**: When processing bulk documents, agents tend to inflate word count significantly. Real example: 6,400 words input → 12,800 words output (2x). The research_intake pattern could encourage this by creating individual analysis files for each input, plus synthesis, plus README updates. User ends up with more content than they started with, most of it low-signal verbose analysis they won't read.

**Mitigation**:
- In the research_intake pattern, add explicit guidance on output length:
  - Individual analyses: "Be concise — bullet points, not prose. Max ~200 words per document."
  - Synthesis: "Focus on actionable themes and contradictions. Target 500-1000 words."
- Include a "cleanup" step: "After synthesis is complete, consider archiving or deleting individual analysis files if they've served their purpose"
- Add guidance: "The synthesis is the primary deliverable. Individual analyses are scaffolding — keep them tight or delete them."
- In skills referencing the pattern, note: "Prefer synthesis over exhaustive analysis. User's time > completeness."

**Verification**: 
- Pattern includes explicit word count guidance for each output type
- Pattern includes cleanup/archive step for intermediate files
- Skills reference conciseness expectations

---

## Summary

**Total risks identified**: 7  
**Categories covered**: Routing (1), Scope Creep (2, 4, 6), Integration (3), Code Quality (4, 7), Platform (2), Context (5)

| Risk | Likelihood | Impact | Mitigation Status |
|------|------------|--------|-------------------|
| Routing conflict | Medium | High | AC already includes test |
| Auto-trigger aggressive | Medium | Medium | Update pattern to suggest, not auto |
| Pattern adoption failure | Medium | Medium | Add explicit skill steps |
| Index checkpoint scatter | Low | Low | Use standard phrase |
| Template doesn't fit | Low | Medium | Add optional markers |
| Missing skill updates | Medium | Low | Pre-implementation audit |
| Output verbosity | High | Medium | Add word count guidance + cleanup step |

---

## Recommended Plan Updates

Based on this pre-mortem, update the plan:

1. **Step 2 (research_intake pattern)**: Change from "auto-trigger" to "suggest when bulk files detected"
2. **Step 2 (research_intake pattern)**: Add conciseness guidance — word count targets and cleanup step
3. **Step 5 (index checkpoints)**: Add pre-implementation audit to find all affected skills
4. **Step 1 (template)**: Add "optional" markers to heavyweight sections

---

## During Execution

Reference this pre-mortem before each step:
- Step 1: Check Risks 1, 5
- Step 2: Check Risks 2, 7
- Steps 3-4: Check Risk 3
- Step 5: Check Risks 4, 6

## Post-Mortem Tracking

| Risk | Materialized? | Mitigation Applied? | Effective? | Notes |
|------|--------------|---------------------|-----------|-------|
| Routing conflict | | | | |
| Auto-trigger aggressive | | | | |
| Pattern adoption failure | | | | |
| Index checkpoint scatter | | | | |
| Template doesn't fit | | | | |
| Missing skill updates | | | | |
| Output verbosity | | | | |
