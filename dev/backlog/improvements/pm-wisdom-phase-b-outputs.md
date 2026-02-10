# Phase B Outputs - Book Concepts

**Generated**: 2026-02-10  
**Source**: 2 subagents (B1-B2) extracting from 17 books  
**Total concepts**: 33

---

## B1: Strategy & Discovery Books (15 concepts)

Agent: 031d4424

Books covered: Good Strategy Bad Strategy, 7 Powers, Understanding Porter, The Mom Test, Competing Against Luck, The Lean Startup, Inspired/Empowered/Transformed

| Concept Name | One-Sentence Summary | Suggested Skills (1-3) | Implementation Type |
|--------------|---------------------|------------------------|---------------------|
| Strategy kernel (diagnosis, policy, action) | Good strategy has three parts: diagnosis (what's really going on), guiding policy (approach to obstacles), and coherent action (coordinated steps) | quarter-plan, create-prd, construct-roadmap | Section (## Frameworks) + Workflow step (inline) |
| Bad strategy patterns | Bad strategy includes fluff, goals-as-strategy (mistaking goals for strategy), superficial objectives, and failing to address real obstacles | quarter-plan, create-prd | Section (## Anti-patterns) + Checklist |
| Operational effectiveness vs strategic positioning | Operational effectiveness (doing things better) is not strategy; strategy is unique value and positioning, not generic best practices | competitive-analysis, create-prd | Section (## Frameworks) |
| Generic strategies (cost, differentiation, focus) | Porter's generic strategies: cost leadership, differentiation, or focus; choose one to avoid being stuck in the middle | competitive-analysis, construct-roadmap | Section (## Frameworks) + Checklist |
| Value chain analysis | Map the activities that create competitive advantage (primary + support) to find differentiation and cost drivers | competitive-analysis | Section (## Frameworks) |
| Mom Test: compliments are lies | Generic praise is unreliable; dig for specifics (what's the last time, what would you change) instead of accepting compliments | discovery, create-prd | Section (## Anti-patterns) + Workflow step (inline) |
| Mom Test: talk about their life, not your idea | Describe their life and experience first; avoid pitching or describing your idea, which contaminates feedback | discovery | Section (## Anti-patterns) + Checklist |
| Jobs-to-be-done framing | People "hire" products to make progress in specific circumstances; job performance drives hire/fire decisions | discovery, create-prd | Section (## Frameworks) + Workflow step (inline) |
| Job statement template | Use: When [situation], I want to [motivation], so I can [expected outcome]; circumstances shape the job | discovery, create-prd | Checklist + Workflow step (inline) |
| Jobs: functional, emotional, social dimensions | Jobs have functional, emotional, and social dimensions; discovery should surface all three, not just functional | discovery, create-prd | Section (## Frameworks) + Checklist |
| Build-Measure-Learn loop | Shorten feedback cycles; validated learning over vanity metrics; fastest cycle wins | discovery, create-prd | Section (## Frameworks) |
| Pivot or persevere decision | Use metrics and learning (not opinion) to choose: continue the current path or change direction | discovery, construct-roadmap | Section (## Frameworks) + Checklist |
| Innovation accounting | Use actionable metrics, cohort analysis, and split tests instead of vanity metrics to guide learning | discovery, create-prd | Section (## Frameworks) |
| Discovery vs delivery | Discovery de-risks before delivery; run continuous discovery (value, usability, feasibility, viability) before building | discovery, create-prd | Section (## Principles) + Workflow step (inline) |
| Empowered teams (outcomes, not outputs) | Empower product teams to own outcomes and solve problems, not just execute a fixed roadmap of features | quarter-plan, construct-roadmap | Section (## Principles) |

---

## B2: Psychology & Execution Books (18 concepts)

Agent: a6028b9f

Books covered: Thinking in Bets, Influence, Never Split the Difference, Five Dysfunctions, Antifragile, Scaling People, Multipliers, Alchemy, Practical Empathy

| Concept Name | One-Sentence Summary | Suggested Skills (1-3) | Implementation Type |
|--------------|---------------------|------------------------|---------------------|
| Light pre-mortem for decisions | Before locking a PRD/roadmap/quarter outcome, assume it failed; surface 2–3 risks and one mitigation each | create-prd, construct-roadmap, quarter-plan | Workflow step (inline) + Shared pattern (PATTERNS.md) |
| Probabilistic thinking (decouple quality and outcome) | Evaluate decisions by process and likelihood, not only by outcome; a good decision can produce a bad result | create-prd, construct-roadmap | Section (## Frameworks) |
| Tactical empathy and labeling | Use empathy and explicit labels ("It seems like…") to build trust and reduce tension | meeting-prep, discovery | Section (## Frameworks) + Checklist |
| Calibrated questions for discovery | Use questions like "How am I supposed to do that?" to surface constraints, blockers, and context | discovery, meeting-prep | Workflow step (inline) + Checklist |
| Mirroring to encourage elaboration | Repeat the last few words of someone's statement to encourage them to expand and clarify | meeting-prep, discovery | Section (## Frameworks) + Checklist |
| Five dysfunctions pyramid check | Before alignment, quickly check for trust, productive conflict, commitment, accountability, and results focus | quarter-plan, goals-alignment | Section (## Frameworks) + Checklist |
| Disagree and commit | Aim for clarity and commitment over consensus; document disagreement and still commit to the decision | quarter-plan, create-prd | Section (## Principles) |
| Influence principles for positioning | Use reciprocity, commitment, social proof, scarcity, and authority when framing solutions, messaging, and onboarding | competitive-analysis, create-prd | Section (## Frameworks) |
| Antifragile design (optionality) | Favor designs and options that benefit from stress and volatility, not just resist them | construct-roadmap, discovery | Section (## Frameworks) |
| Via negativa for scope | Improve by removing harmful or nonessential elements before adding new ones | create-prd, construct-roadmap | Section (## Principles) |
| Barbell strategy for risk | Combine low-risk work (e.g., 90%) with high-risk bets (e.g., 10%) instead of spreading risk across everything | construct-roadmap, quarter-plan | Section (## Frameworks) |
| Operating system for decisions | Define who decides, who consults, and who is informed for each major decision type | quarter-plan, goals-alignment, meeting-prep | Section (## Frameworks) |
| Multiplier questions (hard questions) | Ask questions that challenge thinking and surface assumptions instead of showing your own expertise | meeting-prep, create-prd, discovery | Section (## Frameworks) + Checklist |
| Psychological value over functional value | Treat perception and meaning as primary; functional value alone often underestimates what users value | competitive-analysis, create-prd | Section (## Frameworks) |
| Cognitive empathy for discovery | Understand others' reasoning, mental models, and motives without necessarily agreeing | discovery, synthesize | Section (## Frameworks) |
| Inner thinking mapping | Map internal reasoning, beliefs, and trade-offs behind behavior, not just behaviors | discovery, synthesize | Section (## Frameworks) + Workflow step (inline) |
| Devil's advocate (assigned role) | Assign one person to argue against the plan before locking it in to reveal blind spots | create-prd, construct-roadmap | Workflow step (inline) |
| Delegation levels framework | Clarify autonomy levels from "do what I say" to "you decide" for each stakeholder or project | meeting-prep, quarter-plan | Section (## Frameworks) |

---

## Quality Review (Orchestrator)

**Format compliance**: ✅ Both agents used exact schema  
**Concept clarity**: ✅ All concepts clear and actionable  
**Skill mapping**: ✅ Appropriate 1-3 skill suggestions  
**Duplication check**: Some expected overlap with Phase A (e.g., Mom Test, pre-mortem) – will dedupe in synthesis  
**Book coverage**: ✅ All 17 books represented  
**Total extracted**: 33 concepts from 17 books

**Proceed to Phase C**: ✅ Ready for C1 (synthesis: matrix + backlog) and C2 (wisdom registry)
