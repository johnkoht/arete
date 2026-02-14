# create-prd Evaluation

## Summary

Areté's native `create-prd` skill is tightly integrated with the workspace (project_template, context files, QMD, goals), Product Leader persona, and intelligence hooks. The top skills.sh candidates (github/awesome-copilot@prd, snarktank/ralph@prd) have strong PRD workflows and higher install counts but are workspace-agnostic and save to non-Areté paths. **Recommendation: Keep native** — the integration gap cannot be closed by sidecar metadata alone; the native skill delivers distinct value for product builders in Areté.

## Native Skill Value

- **Workspace integration**: `creates_project: true`, `project_template: definition` — creates `projects/active/[feature-name]-prd/` with inputs/, working/, outputs/; uses `templates/outputs/prd-simple|regular|full.md`; references `context/`, `goals/strategy.md`
- **Intelligence hooks**: Declares `intelligence: [context_injection, memory_retrieval]`; uses QMD (`qmd query`, `qmd search`) for related past work; `requires_briefing: false` (essential skill with own context gathering)
- **Product Leader persona & strategic depth**: Discovery across Problem, Current State, Solution, Success, Strategic Fit, Scope; Quick mode; Devil's Advocate and Strategic Review modes; MoSCoW prioritization with RICE/Kano alternatives
- **Primitive alignment**: `primitives: [Problem, User, Solution, Risk]` — aligns with briefing assembly and skill router

## Candidates Shortlist

1. **prd** (`github/awesome-copilot`) — Production-grade PRDs with strict schema, discovery → analysis → technical drafting; concrete measurable criteria — **339 weekly installs**
2. **prd** (`snarktank/ralph`) — PRD generator with 3-5 lettered clarifying questions, saves to `tasks/prd-[feature-name].md`, developer-focused (acceptance criteria, dev-browser skill) — **242 weekly installs**

## Comparison Table

| Criterion | Native (create-prd) | awesome-copilot | ralph |
|-----------|---------------------|-----------------|-------|
| Workflow fit | Strong — Product Leader persona, discovery, template selection, post-gen review | Strong — 3-phase workflow, strict schema, concrete quality standards | Moderate — lettered questions, structured output; dev-centric |
| Areté integration | Full — project_template, context/, goals/, QMD, intelligence metadata, templates | None — no workspace structure, generic output path | None — saves to `tasks/`, no context/memory |
| Maintainability | Internal — Areté team owns it; evolves with Product OS | Community — GitHub; high adoption | Community — snarktank; high adoption |
| Gaps/concerns | N/A | No primitives, creates_project, project_template; would need sidecar + custom agent instructions; output location unspecified | Rigid `tasks/` path; dev-browser skill dependency; no strategic/PM framing |

## Recommendation

**Keep native**

Supporting arguments:

1. **Project and template integration is core** — The native skill uses `project_template: definition` to create `projects/active/[feature-name]-prd/` and references Areté templates (`prd-simple`, `prd-regular`, `prd-full`). OSS skills save to `tasks/` or unspecified locations; adapting them would require overwriting workflow steps and output paths, not just adding `.arete-meta.yaml`.

2. **Intelligence layer is first-class** — Native declares `intelligence: [context_injection, memory_retrieval]` and uses QMD. OSS skills have no concept of `context/`, `.arete/memory/`, or `goals/`. A briefing adapter could run before an OSS skill, but the skill itself would not direct the agent to read context files or run QMD queries—the workflow is self-contained.

3. **Product Leader persona and strategic modes** — Native offers Devil's Advocate and Strategic Review (Porter's 5 Forces, 7 Powers, Thinking in Bets). awesome-copilot is schema-focused; ralph is implementation-focused. Neither emphasizes strategic challenge or PM craft in the same way.

4. **Alignment with Areté vision** — The native skill helps product builders "gain clarity," "navigate ambiguity," and "think better" through discovery and structured templates. OSS skills optimize for document quality and structure, not workspace continuity or institutional memory.

5. **Role defaults and router** — `create-prd` is the default for the `definition` role; the router matches PRD intents to it. Replacing with OSS would require `arete skill set-default` and sidecar metadata; the OSS skill would still lack project_template semantics unless Areté implements runtime project creation from skill metadata (future enhancement).

## Suggested Next Step

**Keep native; no action needed.** Optional follow-up: document the evaluation in AGENTS.md or a "Skill Sourcing" section so future builders know why create-prd remains internal. If demand emerges for an OSS alternative, consider a Hybrid: ship native as default, add `arete skill install github/awesome-copilot@prd --as netflix-prd` as an installable option with `requires_briefing: true` and a note that it does not use Areté project structure.
