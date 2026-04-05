---
title: Skills Enhancement
slug: skills-enhancement
status: idea
size: unknown
tags: [improvement]
created: 2026-02-20T03:47:16Z
updated: 2026-02-20T03:47:16Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# Native Skills Enhancement Backlog

**Date**: 2026-02-10  
**Context**: Phase 2 of skills.sh evaluation—analyzed OSS skills to identify improvements for Areté's 5 native skills.

**Update (2026-02-10)**: PM wisdom integration delivered many of the recommended improvements (named frameworks, anti-patterns, scaffolding) for **create-prd**, **discovery**, **construct-roadmap**, **quarter-plan**, and **goals-alignment**. Top 25 high-priority concepts from 16 articles + 17 books are now in those skills; see `dev/wisdom-registry.md` and `dev/entries/2026-02-10_pm-wisdom-integration-complete.md`. This backlog remains the source for OSS-inspired methodology; wisdom registry is the source for literature-inspired concepts. Both can feed future skill updates.

---

## Executive Summary

OSS skills offer **methodology depth**, **explicit guardrails**, and **concrete scaffolding** that native skills lack. While native skills win on integration (project scaffolding, intelligence metadata, workspace continuity), they can be improved by:

1. **Adding named frameworks** — OSS skills document frameworks explicitly (Marty Cagan 10Q, Opportunity Solution Tree, thematic analysis, battlecards, dependency types). Native skills mention them or skip them.
2. **Providing explicit examples** — OSS includes worked examples (RICE scoring, BAD/GOOD diffs, interview templates). Native stays generic.
3. **Defining anti-patterns** — OSS lists "do not" rules (solution-first, loudest voice, confirmation bias). Native has soft guidance.
4. **Using structured prompts** — OSS guides with questions ("If you could only ship one thing...?"). Native explains steps but doesn't provide copy-paste prompts.

**Impact**: These enhancements raise output quality without changing project structure or Areté integration. Implementation can be incremental (1–2 improvements per skill per update).

---

## Themed Recommendations

### Theme 1: Named Frameworks & Methodology

**Gap**: Native skills reference or skip frameworks; OSS documents them with structure and examples.

| Skill | Framework to Add | Source | Priority |
|-------|------------------|--------|----------|
| **discovery** | Marty Cagan 10 Questions (value, usability, feasibility, viability) | majiayu000 | High |
| **discovery** | Opportunity Solution Tree (outcomes → opportunities → solutions) | majiayu000 | High |
| **competitive-analysis** | Messaging Comparison Matrix (8 dimensions: positioning, audience, tone, proof, CTA, etc.) | anthropics | High |
| **competitive-analysis** | Battlecard structure (objecti ons, differentiators, proof points, landmines) | anthropics | High |
| **competitive-analysis** | 6-layer or 7-layer analysis framework (product, pricing, marketing, sales, team, tech, positioning) | 1nf-sh | High |
| **synthesize** | Thematic analysis (code, cluster, theme) | anthropics | Medium |
| **synthesize** | Triangulation (methodological, data, analyst) | anthropics | Medium |
| **synthesize** | Affinity mapping (5-step process) | anthropics | Medium |
| **construct-roadmap** | ICE scoring (Impact × Confidence × Ease) | anthropics | Medium |
| **construct-roadmap** | Dependency types (Technical, Team, External, Knowledge, Sequential) | anthropics | High |
| **create-prd** | AI System Requirements (if AI feature: tools, evaluation, testing) | awesome-copilot | Medium |

**Implementation**: Add a "Frameworks" or "Methodology" section to each skill with 2–3 sentences per framework + optional example.

---

### Theme 2: Explicit Examples & Templates

**Gap**: Native skills describe steps; OSS shows what good looks like.

| Skill | Example/Template to Add | Source | Priority |
|-------|-------------------------|--------|----------|
| **create-prd** | BAD/GOOD diff examples for requirements quality ("fast" → "<200ms p95") | awesome-copilot | High |
| **create-prd** | Inline PRD schema (or create prd-simple/regular/full templates) | awesome-copilot | High |
| **create-prd** | One condensed worked example (30–40 lines minimal PRD) | ralph | Medium |
| **discovery** | Interview question templates ("Walk me through the last time you...", "What's most frustrating...") | majiayu000, parcadei | High |
| **competitive-analysis** | Worked pricing comparison table with "Paid only", "Enterprise tier" labels | 1nf-sh | Medium |
| **competitive-analysis** | Positioning statement template + example | anthropics | Medium |
| **construct-roadmap** | Worked RICE example (3 features with Reach/Impact/Confidence/Effort/Score) | specweave | Medium |
| **synthesize** | Before/after examples for claim quality (weak → strong with evidence) | synthesis-writer | Medium |
| **synthesize** | Persona template (if synthesis creates personas) | anthropics | Low |

**Implementation**: Add examples inline or create templates in `runtime/templates/outputs/`.

---

### Theme 3: Anti-Patterns & Guardrails

**Gap**: Native skills have soft "tips"; OSS defines hard "do not" rules.

| Skill | Anti-Pattern / Guardrail to Add | Source | Priority |
|-------|--------------------------------|--------|----------|
| **discovery** | Discovery Guardrails: No Solution-First, Evidence-Based Decisions, Minimum 5 Interviews, Falsifiable Assumptions | majiayu000 | High |
| **discovery** | Common Anti-Patterns (Solution-First, Episodic Research, Confirmation Bias, Fake Validation, Weak Evidence, Feature Factory, Single-Source) | majiayu000 | High |
| **create-prd** | "Do not hallucinate" with TBD pattern ("[TBD]", "[Ask stakeholder]") | awesome-copilot | High |
| **create-prd** | Require at least 2 clarifying questions before generation | awesome-copilot | High |
| **competitive-analysis** | Common Mistakes section (focusing on features only, no positioning, no "so what", etc.) | 1nf-sh | Medium |
| **competitive-analysis** | Positioning Map axis guidance (good vs bad axes) | 1nf-sh | Medium |
| **construct-roadmap** | Common Mistakes to Flag (prioritizing by loudest voice, all incremental no big bets, never saying no, ROI-only thinking) | lenny-skills | High |
| **synthesize** | Common Synthesis Mistakes (cherry-picking, confirmation bias, over-generalization, ignoring contradictions, analysis paralysis) | anthropics | Medium |
| **synthesize** | "Behaviors > stated preferences" principle | anthropics | Medium |

**Implementation**: Add a "Common Mistakes" or "Guardrails" section; for hard rules (e.g. min 5 interviews), use explicit "❌ DO NOT" / "✅ REQUIRED" formatting.

---

### Theme 4: Structured Prompts & Scaffolding

**Gap**: Native skills explain steps; OSS provides copy-paste prompts and questions to ask.

| Skill | Prompt/Question Set to Add | Source | Priority |
|-------|---------------------------|--------|----------|
| **create-prd** | Lettered options for 2+ discovery questions (e.g. "1A: Performance, 1B: Cost, 1C: Both") | ralph | Medium |
| **create-prd** | Pre-save checklist (non-goals, measurable success criteria, no invented constraints) | ralph | High |
| **discovery** | Quick Reference table (Scenario → Framework → Output) | majiayu000 | High |
| **discovery** | 5 Whys scaffolding (or structured loop: detect uncertainty → offer research → return with informed questions) | parcadei | Medium |
| **discovery** | Completeness check / Definition of Ready before synthesis | parcadei, majiayu000 | Medium |
| **competitive-analysis** | Areté-native research steps (arete context, arete memory search, qmd query) in workflow | — | Medium |
| **construct-roadmap** | "Questions to Help Users" (e.g. "If you could only ship one thing this quarter...?", "Which items are you most vs least confident about?") | lenny-skills | High |
| **construct-roadmap** | "When to use" per framework (RICE vs MoSCoW vs ICE vs Kano with use cases) | anthropics | High |
| **construct-roadmap** | Communicating Roadmap Changes (triggers, 5-step pattern, avoiding whiplash) | anthropics | Medium |
| **synthesize** | Definition of Done (evidence quality, pattern depth, gaps identified, recommendations actionable) | synthesis-writer | Medium |
| **synthesize** | Troubleshooting section (low insight density → merge or pivot; conflicting data → triangulation; surface-level → push for root cause) | synthesis-writer | Low |

**Implementation**: Add a "Questions" or "Scaffolding" subsection; for checklists, use markdown checkboxes or numbered steps.

---

## Prioritized Backlog (Top 20)

Ordered by impact (output quality improvement) and ease (low lift to add content):

| # | Skill | Change | Theme | Effort | Impact |
|---|-------|--------|-------|--------|--------|
| 1 | **discovery** | Add Discovery Guardrails (No Solution-First, Min 5 Interviews, etc.) | Anti-Patterns | Low | High |
| 2 | **discovery** | Add Marty Cagan 10 Questions | Frameworks | Low | High |
| 3 | **discovery** | Add Common Anti-Patterns table | Anti-Patterns | Low | High |
| 4 | **discovery** | Add interview question templates | Examples | Low | High |
| 5 | **discovery** | Add Quick Reference table (Scenario → Framework) | Scaffolding | Low | High |
| 6 | **competitive-analysis** | Add Messaging Comparison Matrix (8 dimensions) | Frameworks | Medium | High |
| 7 | **competitive-analysis** | Add Battlecard structure | Frameworks | Medium | High |
| 8 | **competitive-analysis** | Add 6-layer analysis framework | Frameworks | Low | High |
| 9 | **construct-roadmap** | Add "Questions to Help Users" | Scaffolding | Low | High |
| 10 | **construct-roadmap** | Add "When to use" per framework | Scaffolding | Low | High |
| 11 | **construct-roadmap** | Add Dependency Mapping (5 types + managing) | Frameworks | Medium | High |
| 12 | **construct-roadmap** | Add Common Mistakes to Flag | Anti-Patterns | Low | High |
| 13 | **create-prd** | Add BAD/GOOD diff examples for quality | Examples | Low | High |
| 14 | **create-prd** | Require at least 2 clarifying questions | Anti-Patterns | Low | High |
| 15 | **create-prd** | Add inline PRD schema (or create templates) | Examples | Medium | High |
| 16 | **create-prd** | Add pre-save checklist | Scaffolding | Low | High |
| 17 | **synthesize** | Add thematic analysis + triangulation methodology | Frameworks | Medium | Medium |
| 18 | **synthesize** | Add Common Synthesis Mistakes table | Anti-Patterns | Low | Medium |
| 19 | **synthesize** | Add traceability discipline + "Needs More Evidence" | Scaffolding | Low | Medium |
| 20 | **construct-roadmap** | Add Communicating Roadmap Changes | Scaffolding | Medium | Medium |

**Suggested implementation path**:
- **Phase 1** (discovery + competitive-analysis): Items 1–8 (high-impact, mostly low-effort)
- **Phase 2** (construct-roadmap + create-prd): Items 9–16
- **Phase 3** (synthesize + polish): Items 17–20 + remaining medium/low priority

---

## Per-Skill Summary

### discovery (5 improvements → High priority)

**Top 3**:
1. Discovery Guardrails (No Solution-First, Min 5 Interviews, Evidence-Based, Falsifiable Assumptions)
2. Marty Cagan 10 Questions (value, usability, feasibility, viability)
3. Common Anti-Patterns table (7 patterns with "Instead: ..." guidance)

**Also add**: Interview question templates, Quick Reference table (Scenario → Framework → Output)

**Priority**: High — discovery is foundational; these changes materially improve rigor and reduce common mistakes.

---

### competitive-analysis (5+ improvements → High priority)

**Top 3**:
1. Messaging Comparison Matrix (8 dimensions: positioning, audience, tone, proof, CTA, differentiation, evidence, channel)
2. Battlecard structure (objections, differentiators, proof points, landmines to set/defuse, win/loss themes)
3. 6-layer or 7-layer analysis framework (product, pricing, marketing, sales, team, tech, positioning) with data-source mapping

**Also add**: Review mining structure, positioning map axis guidance, Common Mistakes section

**Priority**: High — competitive-analysis is research-heavy; frameworks and templates provide structure and avoid shallow output.

---

### construct-roadmap (5 improvements → Medium priority)

**Top 3**:
1. "Questions to Help Users" (Lenny-style prompts: "If you could only ship one thing...?", "Which items are you most vs least confident about?")
2. "When to use" per framework (RICE, MoSCoW, ICE, Kano with explicit use cases)
3. Dependency Mapping (5 types: Technical, Team, External, Knowledge, Sequential + managing and reducing)

**Also add**: Common Mistakes to Flag, Communicating Roadmap Changes, worked RICE example

**Priority**: Medium — native skill is already strong on workflow; these add depth without changing structure.

---

### create-prd (5 improvements → Medium priority)

**Top 3**:
1. BAD/GOOD diff examples for requirements quality ("fast" → "<200ms p95", "secure" → "SOC 2 compliant")
2. Require at least 2 clarifying questions before generation (discovery rule)
3. Inline PRD schema or create prd-simple/regular/full templates

**Also add**: Pre-save checklist (non-goals, measurable success, no hallucinated constraints), AI System Requirements branch (for AI features)

**Priority**: Medium — native skill has Product Leader persona and strategic modes; these improve output rigor and reduce hallucination.

---

### synthesize (4 improvements → Medium priority)

**Top 3**:
1. Add Research Synthesis Methodology (thematic analysis, triangulation, affinity mapping with step-by-step)
2. Add Common Synthesis Mistakes table (cherry-picking, confirmation bias, over-generalization, ignoring contradictions, analysis paralysis)
3. Add traceability discipline + "Needs More Evidence" section (cite sources with line/page, flag weak claims)

**Also add**: Before/after examples for claim quality, Definition of Done

**Priority**: Medium — native skill is project-internal and uses QMD; methodology and anti-patterns raise synthesis quality.

---

## Next Steps

1. **Review this backlog** with builder — confirm priority and scope for Phase 1.
2. **Create PRD or incremental plan** for Phase 1 (discovery + competitive-analysis improvements, items 1–8).
3. **Implement incrementally** — 1–2 improvements per skill per update; test with agent to confirm quality lift.
4. **Update learnings** — capture any observations during implementation in `dev/entries/2026-02-10_skills-evaluation-learnings.md`.

---

## References

**Improvement reports**:
- `dev/entries/2026-02-09_create-prd-improvement-recommendations.md`
- `dev/entries/2026-02-09_competitive-analysis-improvement-recommendations.md`
- `dev/entries/2026-02-10_discovery-improvement-recommendations.md`
- `dev/entries/2026-02-10_construct-roadmap-improvement-recommendations.md` (inline in subagent output)
- `dev/entries/2026-02-10_synthesize-improvement-recommendations.md`

**Phase 1 synthesis**: `dev/entries/2026-02-10_skills-sh-evaluation-synthesis.md`

**Learnings**: `dev/entries/2026-02-10_skills-evaluation-learnings.md`
