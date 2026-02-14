# synthesize Evaluation

## Summary

Areté's native synthesize skill is a project-internal workflow that inventories `inputs/`, extracts and cross-analyzes evidence, and writes a structured synthesis to `working/synthesis.md` with optional decision framework—deeply integrated with QMD (memory + inputs), workspace layout, and intelligence metadata. The best skills.sh candidate, Anthropic's user-research-synthesis (41 weekly installs), offers strong methodology (thematic analysis, affinity mapping, triangulation, persona development) but is workspace-agnostic and lacks Areté-specific integration. **Recommendation: Keep native**, optionally borrowing methodology snippets from the Anthropic skill to enrich the native workflow.

## Native Skill Value

- **Workspace integration**: Operates inside existing projects (`projects/active/*/inputs/` → `working/synthesis.md`); assumes project structure from discovery, analysis, or definition work types. No `project_template` (doesn't create projects—works within them). QMD explicitly used to search project inputs and past learnings/decisions.
- **Intelligence hooks**: Declares `primitives: [Problem, User, Solution]`, `intelligence: [memory_retrieval, synthesis]`, `work_type: analysis`, `category: essential`—so router, briefing, and memory retrieval know when and how to support it.
- **PM-specific output**: Structured synthesis format (key findings with evidence, patterns, contradictions, surprises, gaps, recommendations) plus optional decision framework (options, pros/cons, reversibility)—designed for product builders making decisions under uncertainty.
- **Evidence discipline**: Instructs agents to cite sources, distinguish fact from interpretation, note confidence levels, embrace contradictions, and be explicit about gaps—aligned with Areté's philosophy of clarity and institutional memory.

## Candidates Shortlist

1. **user-research-synthesis** (`anthropics/knowledge-work-plugins`) — User research synthesis: thematic analysis, affinity mapping, triangulation, interview/survey analysis, persona development, opportunity sizing. — **41 weekly installs**
2. **knowledge-synthesizer** (`404kidwiz/claude-supercode-skills`) — Knowledge graph/ontology building, insight extraction for RAG/GraphRAG, entity-relationship synthesis. — **20 weekly installs**
3. **synthesis-writer** (`willoscar/research-units-pipeline-skills`) — Systematic review synthesis from extraction tables; traceable narrative from `papers/extraction_table.csv` → `output/SYNTHESIS.md`. — **19 weekly installs**

Excluded: eddiebe147/claude-settings@research-synthesizer (0 installs, thin generic workflow); rysweet/amplihack@meeting-synthesizer (meeting-specific); nicepkg/ai-workflow@weak-signal-synthesizer (different use case).

## Comparison Table

| Criterion | Native (synthesize) | user-research-synthesis (Anthropic) | synthesis-writer (willoscar) | knowledge-synthesizer (404kidwiz) |
|-----------|---------------------|-------------------------------------|-----------------------------|-----------------------------------|
| **Workflow fit** | Project-internal: inputs/ → patterns → working/synthesis.md; decision framework for PMs | Strong PM methodology (qual/quant, personas, opportunity sizing); no project/workspace structure | Academic systematic review; requires extraction_table.csv; different input model | Technical: ontologies, knowledge graphs, RAG; not PM synthesis |
| **Areté integration** | Full: primitives, memory_retrieval, QMD for inputs + memory, workspace paths (inputs/, working/) | None: no frontmatter, no workspace layout, no projects/, no QMD | None: fixed paths (papers/, output/), no Areté metadata | None: technical focus, no PM workspace |
| **Maintainability** | Internal; evolves with Product OS | Anthropic-maintained; strong methodology; 41 installs | Community; systematic-review niche | Community; different domain |
| **Gaps/concerns** | Could adopt more methodology (thematic analysis, triangulation) from OSS | No briefing, memory, or project structure; would need sidecar + custom instructions; output path unspecified | Requires extraction table pipeline; not general "process my inputs" | Wrong domain—knowledge graphs vs. PM insight synthesis |

## Recommendation

**Keep native**

Supporting arguments:

- **Integration is core**: The native skill assumes `projects/active/*/inputs/` and writes to `working/synthesis.md`. OSS skills assume generic or fixed paths (e.g. `output/SYNTHESIS.md`, no project context). Wiring OSS into Areté would require `.arete-meta.yaml` plus explicit agent instructions to use project paths—the install flow doesn't do that. The native skill already does.
- **Memory and QMD matter**: The skill explicitly instructs agents to use QMD to find "what did we learn about [topic]" and "decision [related area]" before and during synthesis. No OSS candidate references workspace search or memory; they're self-contained. Areté's value is connecting synthesis to institutional memory.
- **PM decision framework**: The native skill includes an optional decision framework (options, pros/cons, risks, reversibility) for synthesis that informs decisions. Anthropic's skill covers methodology but not this structured decision prep. The native skill is purpose-built for "pull together research → make a decision."
- **Methodology can be borrowed**: The Anthropic skill has excellent content—thematic analysis, affinity mapping, triangulation, qual/quant integration, persona development from research, opportunity sizing. These can be folded into the native skill as methodology tips without replacing it. The native skill's workflow (inventory → extract → pattern → synthesize → decision prep) remains the right scaffold.
- **Consistency with other evaluations**: The create-prd and competitive-analysis evaluations both concluded "keep native" because workspace integration (project_template, context/, QMD, primitives) could not be closed by sidecar metadata alone. Synthesize follows the same pattern: the workflow and outputs are tightly coupled to Areté's workspace and intelligence layer.

## Suggested Next Step

**Keep native; no action required.**

Optional enhancement: Add a short methodology section to the native synthesize skill, cribbing thematic analysis and triangulation concepts from `anthropics/knowledge-work-plugins@user-research-synthesis`, while preserving the existing workflow and Areté integration. Document this as a potential future refinement in `dev/MEMORY.md` if pursued.
