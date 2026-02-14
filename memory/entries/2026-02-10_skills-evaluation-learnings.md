# Skills Evaluation Learnings (Ongoing)

**Date Started**: 2026-02-10  
**Context**: Evaluating Areté's runtime skills vs skills.sh alternatives; first for keep/replace decisions, then for improvement recommendations.

---

## Phase 1: Keep vs Replace Evaluation

### Learning 1: Integration is the Decisive Factor for Core Workflows

All 5 "keep native" decisions (create-prd, competitive-analysis, discovery, construct-roadmap, synthesize) came down to the same factors:

- **Project scaffolding**: `creates_project: true` and `project_template` create `projects/active/[name]/` with inputs/working/outputs/
- **Intelligence metadata**: `primitives`, `intelligence`, `work_type`, `requires_briefing` enable routing, briefing, and context injection
- **Workspace continuity**: Native skills reference `goals/`, `context/`, `.arete/memory/`, coordinate with other skills (synthesize, finalize-project), and update context files

OSS skills with 187–339 weekly installs couldn't compete on integration, even with strong methodology. The procedure matters less than the wiring.

**Implication**: For core PM workflows, integration > methodology. Areté's value is workspace structure and intelligence, not the skill procedure itself.

---

### Learning 2: Sidecar Metadata Has Limits

`.arete-meta.yaml` can add routing hints (`primitives`, `work_type`, `requires_briefing`) but can't make a skill *use* the workspace structure or run QMD queries.

**Example**: Adding `primitives: [Problem, User]` to an OSS skill helps the router match it, but doesn't make the skill read `context/`, write to `.arete/memory/`, or run `qmd query`.

The skill's procedure needs to be Areté-aware (reference workspace paths, use intelligence services) for full integration.

**Implication**: Third-party skills can be adopted (via install + sidecar + briefing adapter), but they won't match native integration unless their procedures are adapted. Sidecar is for metadata, not behavior.

---

### Learning 3: Methodology Can Be Borrowed Without Replacement

OSS skills offer frameworks and depth that native skills lack:
- **discovery**: Opportunity Solution Tree, Marty Cagan 10 questions (majiayu000/claude-arsenal)
- **competitive-analysis**: Battlecards, 7-layer framework, review mining (1nf-sh, anthropics)
- **synthesize**: Thematic analysis, triangulation, affinity mapping (anthropics)
- **construct-roadmap**: Dependency mapping, capacity ratios (anthropics)

These can be folded into native skills' content (new sections, examples, alternative frameworks) without changing the workflow or losing integration.

**Implication**: Continuous improvement path = mine OSS for methodology, add to native skills as content enhancements. No replacement needed.

---

### Learning 4: Orchestration Pattern Scales Well

Pattern used:
1. **Pre-mortem**: Light pre-mortem (context gaps, scope creep, output format)
2. **Parallel subagents**: 5 agents simultaneously with fast model, identical prompt structure
3. **Show, don't tell**: Each prompt named the native skill path and required running `npx skills find`
4. **Required output format**: Comparison table, recommendation, next step forced structured reports
5. **One synthesis**: Orchestrator synthesized 5 reports into path-forward doc

**Result**: All 5 agents returned structured, high-quality reports with clear recommendations. Zero iteration needed. Total time: ~10 minutes for research + synthesis.

**Implication**: This pattern (pre-mortem, parallel fast agents, required format, synthesis) is reusable for future evaluations, research, or competitive analysis.

---

### Learning 5: Product OS Thesis Validated

"Skills are commoditized; integration is the moat."

The skills.sh ecosystem has 200+ skills including high-quality PRD, competitive analysis, and roadmap skills with hundreds of weekly installs. Yet none can replace Areté's native skills because:
- **Value isn't in the procedure** (OSS skills have strong workflows)
- **Value is in the integration** (workspace, memory, context, intelligence)

This confirms the Product OS direction: skills are methods that can be swapped; Areté is the intelligence underneath. Third-party skills benefit from Areté's intelligence (via briefing adapter), but default skills win on integration.

**Implication**: Strategic focus should remain on intelligence layer and workspace structure, not on competing on skill procedures. OSS methodology informs enhancements, but integration is the differentiator.

---

## Phase 2: Improvement Recommendations

### Learning 6: OSS Skills Excel at Methodology Depth, Explicit Guardrails, and Concrete Scaffolding

After evaluating the same 5 skills for *improvement opportunities* (not replacement), we found:

**What OSS does better than native**:

1. **Named frameworks** — OSS documents frameworks explicitly: Marty Cagan 10 Questions (discovery), Opportunity Solution Tree (discovery), Messaging Comparison Matrix (competitive-analysis), Battlecard structure (competitive-analysis), thematic analysis (synthesize), ICE scoring (roadmap), dependency types (roadmap). Native skills mention or skip them.

2. **Explicit examples** — OSS includes worked examples: BAD/GOOD diffs for requirements quality (create-prd), RICE scoring table (roadmap), interview templates (discovery), positioning statement examples (competitive-analysis). Native stays generic.

3. **Hard anti-patterns** — OSS lists "do not" rules with ❌/✅ formatting: No Solution-First (discovery), Min 5 Interviews (discovery), "Do not hallucinate" with TBD pattern (create-prd), Common Mistakes to Flag (roadmap, competitive-analysis, synthesize). Native has soft "tips."

4. **Structured prompts** — OSS provides copy-paste questions: "If you could only ship one thing this quarter?" (roadmap), "Walk me through the last time you..." (discovery), lettered options for discovery (create-prd). Native explains steps but doesn't scaffold prompts.

**Implication**: Native skills win on integration; OSS wins on methodology and rigor. The enhancement path = fold OSS methodology into native skills without changing workspace structure or intelligence hooks. **Top 20 improvements identified** (prioritized backlog in synthesis doc).

---

### Learning 7: Orchestration Pattern Reused Successfully (Again)

Same pattern from Phase 1:
- Pre-mortem (light): context, output format
- 5 parallel subagents (fast model) with required output format
- Synthesis by orchestrator

**Result**: All 5 agents returned structured improvement reports with specific recommendations. Zero iteration needed. Total time: ~10 minutes.

**Confirmation**: The pattern (pre-mortem, parallel fast agents, required format, synthesis) is repeatable and scales well for evaluation, research, or analysis tasks.

---

## Collaboration Observations

- User confirmed decisions quickly (Tier 2 in scope, Option A synthesis, defer find-skills)
- User asked about install-count filtering; we added it before spawning (good catch)
- User asked about subagent access twice before confirming; "no Task tool visible" should trigger tool introspection
- User wanted "auto/cheaper agents" → used `model: "fast"` for all subagents
- User recognized the value question shift (keep/replace → improve based on OSS) and wants to iterate on the same data

---

## References

- **Synthesis**: `dev/entries/2026-02-10_skills-sh-evaluation-synthesis.md`
- **Enhancement backlog**: `dev/backlog/improvements/skills-enhancement.md`
- **Plan**: `/Users/johnkoht/.cursor/plans/skills.sh_evaluation_and_orchestration_0182aa43.plan.md`
- **Subagent reports**: `dev/entries/2026-02-09_create-prd-evaluation.md`, `2026-02-09_competitive-analysis-evaluation.md`, `2026-02-09_construct-roadmap-evaluation.md`, `2026-02-09_synthesize-evaluation.md`
