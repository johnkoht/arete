# Skills.sh Evaluation: Path Forward

**Date**: 2026-02-10  
**Context**: Evaluated 5 Areté runtime skills (create-prd, competitive-analysis, discovery, construct-roadmap, synthesize) against skills.sh alternatives to determine whether to keep native or adopt OSS.

---

## Executive Summary

**Recommendation: Keep all 5 native skills.**

All evaluated skills share a critical integration pattern that OSS alternatives cannot replicate:
- **Project scaffolding** via `creates_project: true` and `project_template`
- **Intelligence metadata** (`primitives`, `intelligence`, `work_type`, `requires_briefing`)
- **Workspace integration** (uses `projects/active/`, `context/`, `goals/`, `.arete/memory/`)
- **End-to-end workflow** with handoffs to other skills (synthesize, finalize-project)

OSS skills from skills.sh are either:
1. **Framework/methodology references** (no project creation or file paths)
2. **Generic workflows** (save to `tasks/` or unspecified locations)
3. **Different domain** (spec-centric, research papers, ontology building)

**Net result**: Adopting OSS would require substantial adaptation (custom project creation, workspace wiring, sidecar metadata) that negates the benefit. The native skills already deliver the integration; OSS skills can inform methodology improvements.

---

## Per-Skill Summary

### 1. create-prd

**Decision: Keep native**

**Top OSS alternatives**:
- `github/awesome-copilot@prd` (339 weekly installs) — Production-grade PRD workflow, strict schema
- `snarktank/ralph@prd` (242 weekly installs) — 3-5 lettered questions, saves to `tasks/`

**Why keep native**:
- Uses `project_template: definition` to create `projects/active/[feature-name]-prd/` with inputs/working/outputs/
- Product Leader persona with strategic modes (Devil's Advocate, Strategic Review)
- References `goals/strategy.md`, uses QMD (`qmd query`), declares `intelligence: [context_injection, memory_retrieval]`
- OSS skills are schema-focused or save to `tasks/`; no workspace integration

**Suggested action**: Keep as default. Optional: if demand exists, add `arete skill install github/awesome-copilot@prd` as an alternative with `requires_briefing: true` and a note that it doesn't use Areté project structure.

---

### 2. competitive-analysis

**Decision: Keep native**

**Top OSS alternatives**:
- `1nf-sh/skills@competitor-teardown` (187 weekly installs) — 7-layer competitive analysis with inference.sh CLI
- `anthropics/knowledge-work-plugins@competitive-analysis` (50 weekly installs) — Frameworks for messaging, battlecards, positioning

**Why keep native**:
- Uses `project_template: analysis` and `creates_project: true` → `projects/active/[scope]-competitive-analysis/`
- Updates `context/competitive-landscape.md` at the end (closes the loop into context layer)
- Declares `primitives: [Market, Risk]` and `intelligence: [context_injection]`
- OSS skills have strong methodology but no project scaffold or context update

**Suggested action**: Keep native. Optional enhancement: fold methodology from OSS (battlecards, 7-layer framework, review mining) into the native skill without external dependencies.

---

### 3. discovery

**Decision: Keep native**

**Top OSS alternatives**:
- `majiayu000/claude-arsenal@product-discovery` (6 weekly installs) — Continuous discovery frameworks, Marty Cagan 10 questions, Opportunity Solution Tree
- `parcadei/continuous-claude-v3@discovery-interview` (no install count) — Interview → spec workflow

**Why keep native**:
- Uses `project_template: discovery` and `creates_project: true` → `projects/active/[topic]-discovery/`
- Full lifecycle: frame → plan → capture → synthesize → outputs → finalize
- Declares `intelligence: [context_injection, memory_retrieval]`, `primitives: [Problem, User]`
- Coordinates with `synthesize` and `finalize-project` skills; writes to `.arete/memory/items/learnings.md`
- OSS skills are either content-only or spec-centric (no discovery project lifecycle)

**Suggested action**: Keep native. Optional: mine `product-discovery` for frameworks (OST, Cagan 10Q, interview best practices) and add them to the native skill's methodology section.

---

### 4. construct-roadmap

**Decision: Keep native**

**Top OSS alternatives**:
- `refoundai/lenny-skills@prioritizing-roadmap` (40 weekly installs) — Prioritization questions from 75 product leaders
- `anthropics/knowledge-work-plugins@roadmap-management` (38 weekly installs) — Frameworks (Now/Next/Later, RICE, MoSCoW)
- `anton-abyzov/specweave@roadmap-planner` (21 weekly installs) — Strategic planning with SpecWeave

**Why keep native**:
- Uses `project_template: roadmap` and `creates_project: true` → `projects/active/[period]-roadmap/`
- Full workflow: gather inputs → candidate initiatives → RICE → capacity planning → draft → review → output
- Pulls from `goals/strategy.md` and writes to `.arete/memory/items/decisions.md`
- OSS skills are framework references (no project or file creation)

**Suggested action**: Keep native. Optional: fold content from `roadmap-management` (dependency mapping, capacity ratios, communication patterns) into the native skill's frameworks section.

---

### 5. synthesize

**Decision: Keep native**

**Top OSS alternatives**:
- `anthropics/knowledge-work-plugins@user-research-synthesis` (41 weekly installs) — Thematic analysis, affinity mapping, triangulation
- `404kidwiz/claude-supercode-skills@knowledge-synthesizer` (20 weekly installs) — Ontology/GraphRAG focus
- `willoscar/research-units-pipeline-skills@synthesis-writer` (19 weekly installs) — Systematic review synthesis

**Why keep native**:
- Project-internal workflow: `inputs/` → `working/synthesis.md`
- Uses QMD to search project inputs and past learnings/decisions
- Declares `primitives: [Problem, User, Solution]`, `intelligence: [memory_retrieval, synthesis]`
- Includes decision framework (options, pros/cons, reversibility) for PM decision-prep
- OSS skills use generic/fixed paths or are different domains (research papers, GraphRAG)

**Suggested action**: Keep native. Optional: add methodology section (thematic analysis, triangulation) from `user-research-synthesis` while keeping Areté integration.

---

## Common Patterns Across All Skills

### Why Native Skills Win

1. **Project scaffolding is non-trivial**: `creates_project: true` and `project_template` create workspace-standard directories. OSS skills don't describe or use this structure; adapting them would require custom project creation logic.

2. **Intelligence metadata is first-class**: Native skills declare `primitives`, `intelligence`, and `work_type` for routing, briefing, and context injection. OSS skills have no frontmatter; adding `.arete-meta.yaml` sidecars gives routing hints but doesn't make the skill *use* context, memory, or QMD.

3. **Workspace continuity is core value**: Native skills reference `goals/`, `context/`, `.arete/memory/`; coordinate with `synthesize` and `finalize-project`; and update context files (e.g. `competitive-landscape.md`). OSS skills are isolated procedures.

4. **Methodology can be borrowed without replacement**: All OSS candidates offer frameworks or depth that can be folded into native skills' "Alternative Frameworks" or methodology sections without losing integration.

5. **Alignment with Product OS vision**: Native skills implement the skill-interface contract (Phase 2+3: project templates, intelligence hooks, primitives). Replacing them would regress Product OS.

### What OSS Skills Offer

- **Methodology depth**: Marty Cagan 10Q, Opportunity Solution Tree (discovery), battlecards and 7-layer framework (competitive-analysis), thematic analysis and triangulation (synthesize), prioritization questions from Lenny's (roadmap).
- **Community validation**: High install counts (187–339 for top skills) indicate proven workflows.
- **Diverse approaches**: Some are schema-focused (awesome-copilot/prd), others are persona-driven (ralph/prd), framework-heavy (anthropics/roadmap-management), or tool-integrated (1nf-sh/competitor-teardown with inference.sh).

None of these benefits require *replacing* the native skills; they can inform incremental improvements.

---

## Path Forward

### Immediate Actions

1. **No replacements**: Keep all 5 native skills as defaults.
2. **Document evaluation**: Add a line to `dev/MEMORY.md` linking to this synthesis.
3. **Scratchpad item**: Add deferred decision about find-skills to scratchpad (whether to add to default skill set, document in README, or leave for later).

### Optional Enhancements (Later)

For each skill, fold in selected methodology from top OSS candidates:

| Skill | Enhancement Source | What to Add |
|-------|-------------------|-------------|
| **create-prd** | awesome-copilot/prd | Strict schema validation option; phase-gate checklist |
| **competitive-analysis** | 1nf-sh/competitor-teardown, anthropics | Battlecards, status quo/workarounds, 7-layer framework, review mining |
| **discovery** | majiayu000/claude-arsenal | Opportunity Solution Tree, Marty Cagan 10 questions, interview best practices |
| **construct-roadmap** | anthropics/roadmap-management | Dependency mapping, capacity ratios, communication patterns |
| **synthesize** | anthropics/user-research-synthesis | Thematic analysis, triangulation, affinity mapping |

These are content additions (new sections or examples in SKILL.md), not workflow changes or external dependencies.

### Hybrid Option (If Demand Exists)

If there's user demand for OSS alternatives:

1. Install OSS skill with a distinct name (e.g. `arete skill install github/awesome-copilot@prd --as netflix-prd`)
2. Add `.arete-meta.yaml` with `requires_briefing: true`, `category: community`, and best-guess `primitives`/`work_type`
3. Document in `runtime/skills/README.md` that the alternative exists but doesn't use Areté project structure
4. User can set it as default for the role: `arete skill set-default netflix-prd --for create-prd`

This keeps the native skill as the shipped default while allowing power users to swap.

---

## Impact on Product Strategy

### Validates Product OS Thesis

**Skills are commoditized; integration is the moat.**

The skills.sh ecosystem has 200+ skills, including high-quality PRD, competitive-analysis, and roadmap skills with hundreds of weekly installs. Yet none can replace Areté's native skills because:
- **Value isn't in the procedure** (OSS skills have strong workflows)
- **Value is in the integration** (workspace, memory, context, intelligence)

This confirms the Product OS vision: "Skills are methods; Areté is the intelligence underneath." Third-party skills can be adopted (via the skill install flow and briefing adapter), but the default skills win on integration.

### Find-Skills: Discover, Don't Replace

The find-skills exploration confirms that `npx skills find` is useful for **discovery** (finding new capabilities, methodology references) but not for **core workflow replacement**. Recommendation for find-skills:

- **Install as optional skill**: `arete skill install vercel-labs/skills --skill find-skills`
- **Document in README**: Add to `runtime/skills/README.md` under "Adding new capabilities" — users can run `npx skills find <query>` to discover OSS skills, then install via `arete skill install owner/repo`
- **Not a default skill**: Don't ship it in the core 19 skills; keep it as a discoverable add-on

(Deferred to scratchpad for final decision after this evaluation.)

---

## Learnings

### Orchestration Patterns Applied

This evaluation reused patterns from execute-prd:

1. **Pre-mortem**: Light pre-mortem (context gaps, scope creep, output format, install-count filtering) before spawning subagents
2. **Parallel subagents**: Spawned 5 agents simultaneously (fast model) with identical prompt structure
3. **Show, don't tell**: Each prompt named the native skill path and required running `npx skills find` so subagents didn't guess
4. **Required output format**: Comparison table, recommendation, next step forced structured reports
5. **One synthesis**: Orchestrator (me) synthesized from 5 reports into this document

**Result**: All 5 agents returned structured, high-quality reports with clear recommendations. No iteration needed. Total time: ~10 minutes for research + synthesis.

### Collaboration Observations

- User confirmed Tier 2 in scope (construct-roadmap, synthesize), synthesis by orchestrator (Option A), and deferred find-skills product decision to scratchpad.
- User asked about install-count filtering; we added it to the plan and subagent prompts before spawning.
- User asked about subagent access twice before confirming; clear that "no Task tool visible" should trigger a re-check with tool introspection.
- User wanted "auto/cheaper agents" (fast model); we used `model: "fast"` for all subagents.

---

## References

**Subagent reports**:
- `dev/entries/2026-02-09_create-prd-evaluation.md`
- `dev/entries/2026-02-09_competitive-analysis-evaluation.md`
- `dev/entries/2026-02-09_discovery-evaluation.md` (agent output only; not written to file)
- `dev/entries/2026-02-09_construct-roadmap-evaluation.md`
- `dev/entries/2026-02-09_synthesize-evaluation.md`

**Enhancement backlog**: `dev/backlog/improvements/skills-enhancement.md`

**Plan**: `/Users/johnkoht/.cursor/plans/skills.sh_evaluation_and_orchestration_0182aa43.plan.md`

**Orchestration reference**: `dev/PRE-MORTEM-AND-ORCHESTRATION-RECOMMENDATIONS.md`, `dev/skills/execute-prd/SKILL.md`
