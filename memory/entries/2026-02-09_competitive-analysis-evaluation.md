# competitive-analysis Evaluation

## Summary

Areté's native competitive-analysis skill is a full project-based workflow (scope → profiles → matrix → strategic analysis) with explicit Areté integration (primitives: Market/Risk, project_template: analysis, context_injection, context/competitive-landscape.md update). The best OSS alternatives—Anthropic's (50 weekly installs) and 1nf-sh's competitor-teardown (187 installs)—are stronger on methodology and tooling but lack workspace/project integration. **Recommendation: Keep native** and optionally adopt methodology snippets from OSS skills where they add value.

## Native Skill Value

- **Project scaffold**: Uses `creates_project: true` + `project_template: analysis` → `projects/active/[scope]-competitive-analysis/` with inputs/, working/competitor-profiles/, comparison-matrix.md, outputs/competitive-analysis.md. Aligned with Phase 2 templates and skill-interface contract.
- **Intelligence hooks**: Declares `primitives: [Market, Risk]` and `intelligence: [context_injection]`, so context injection pulls `context/competitive-landscape.md` and identifies gaps; `requires_briefing: false` because it's a default skill with built-in context gathering.
- **Context update**: Step 9 explicitly updates `context/competitive-landscape.md`, archives old context, logs learnings, and suggests quarterly refresh—native workflow closes the loop into Areté’s context layer.
- **Concrete templates**: Competitor profile markdown, comparison matrix with legend (✅/⚠️/❌/➖), and final output structure are specific and reproducible; research sources and Porter’s Five Forces / SWOT / positioning map are listed.
- **Skill-router alignment**: `work_type: analysis` and name/description match router keywords (“competitive analysis”, “analyze competitor”, etc.) for reliable routing.

## Candidates Shortlist

1. **competitor-teardown** (`1nf-sh/skills`) – Structured 7-layer competitive analysis with inference.sh CLI (Tavily, Exa, agent-browser) for research and screenshots. Feature/pricing matrices, SWOT, positioning map, review mining. **Weekly installs: 187** (highest).
2. **competitive-analysis** (`anthropics/knowledge-work-plugins`) – Frameworks for competitive research, messaging comparison, content gap analysis, positioning strategy, battlecard creation. Primary/secondary sources, research cadence, positioning pitfalls. **Weekly installs: 50**.

## Comparison Table

| Criterion | Native (competitive-analysis) | competitor-teardown (1nf-sh) | competitive-analysis (anthropics) |
|-----------|-------------------------------|-----------------------------|-----------------------------------|
| **Workflow fit** | Strong PM project flow: scope → profiles → matrix → strategic analysis → output. End-to-end, concrete steps. | Very strong methodology (7-layer framework, pricing, reviews, positioning). Execution depends on inference.sh CLI—extra tooling, no project scaffold. | Strong frameworks (messaging matrix, narrative analysis, content gap, battlecards, positioning pitfalls). No project scaffold; advisory, not workspace-oriented. |
| **Areté integration** | Full: project_template: analysis, primitives Market/Risk, context_injection, context update, creates_project. | None: no frontmatter, no workspace layout, no projects/ structure. Skills.sh generic. | None: no frontmatter, no workspace layout. Skills.sh generic. |
| **Maintainability** | Internal: Areté controls scope, templates, and context update; evolves with product-os roadmap. | Community: 1nf-sh/skills maintained; tied to inference.sh ecosystem; high installs suggest adoption. | Anthropic: official source, solid methodology; community-maintained plugin repo. |
| **Gaps/concerns** | Methodology could be richer (e.g., April Dunford/status quo, battlecards, content gap); research sources good but not exhaustive. | Heavy dependency on inference.sh; no Areté project scaffold or context update; would need sidecar + custom wrapper for integration. | No Areté integration; no project scaffold; strong on messaging/battlecards but less on feature matrices and deliverables structure. |

## Recommendation

**Keep native.**

Supporting arguments:

- **Areté integration is non-trivial**: OSS skills don’t declare `creates_project`, `project_template`, `primitives`, or `intelligence`. Wiring them into Areté would require `.arete-meta.yaml` sidecars and explicit instructions to scaffold projects and update context—current install flow doesn’t do that. The native skill already does it.
- **Project-based structure is core**: Areté’s value is the workspace layout (projects/active/, context/, goals/). OSS skills are prompt frameworks; they don’t create or maintain that structure. Native skill drives `projects/active/[scope]-competitive-analysis/` and `context/competitive-landscape.md` as designed.
- **Methodology can be enhanced without swapping**: Anthropic’s messaging matrix, narrative analysis, and battlecard patterns—and competitor-teardown’s 7-layer framework and review mining—can inform future edits to the native skill. Adopt ideas, not the full skill.
- **Routing and intelligence stay coherent**: Native skill is registered for routing, primitives, and context injection. Replacing with OSS would require sidecar metadata and agent rules to invoke project scaffolding and context updates—additional maintenance and potential inconsistencies.
- **Low replacement payoff**: The native skill is already aligned with Phase 2 templates and the skill-interface contract. OSS skills add methodology depth but would need substantial integration work to match current native behavior.

## Suggested Next Step

**Keep native; enhance methodology (optional).**

1. **No immediate change**: Continue shipping the native skill as the default competitive-analysis skill.
2. **Optional enhancement**: Add selected patterns to the native SKILL.md (e.g., status quo / workarounds from lenny-skills, battlecard structure from Anthropic, review mining / 7-layer from competitor-teardown) without adopting external dependencies.
3. **If OSS adoption is desired later**: Run a POC by installing `1nf-sh/skills@competitor-teardown` or `anthropics/knowledge-work-plugins@competitive-analysis` with `--skill competitive-analysis-oss` (different name) and writing an `.arete-meta.yaml` that sets `creates_project: true`, `project_template: analysis`, and `primitives: [Market, Risk]`. Then test whether agents consistently scaffold projects and update context—before considering replacement.
