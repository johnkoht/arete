# discovery Improvement Recommendations

## Summary

OSS skills (especially majiayu000/product-discovery) provide **explicit anti-patterns and guardrails**, **named methodologies** (Marty Cagan's 10 Questions, Opportunity Solution Tree, JTBD, Kano, Value Proposition Canvas), and **concrete interview/survey scaffolding** that native discovery lacks. Native discovery has strong workspace integration and workflow orchestration but reads as a generic template; OSS provides the rigor and specificity that helps product builders avoid common discovery pitfalls and make evidence-based decisions.

---

## Language & Instructions

- **OSS uses "Hard Rules" with explicit forbidden/allowed examples.** majiayu000/product-discovery includes a "Hard Rules (Must Follow)" section with four mandatory rules (No Solution-First Thinking, Evidence-Based Decisions, Minimum Interview Threshold, Falsifiable Assumptions). Each rule contrasts ❌ FORBIDDEN vs ✅ REQUIRED with concrete examples. Example from No Solution-First: *"❌ FORBIDDEN: 'We should build a search bar for the product page' … ✅ REQUIRED: 'Problem: Users can't find products (40% exit rate on catalog). Outcome: Reduce exit rate to 20%. Possible solutions: 1. Search bar with filters…'"* Native has none of this; it assumes the agent won't fall into solution-first or confirmation bias.

- **OSS gives explicit interview question templates.** majiayu000: *"'Walk me through the last time you [did task]' … 'What's most frustrating about [current solution]?' … 'How are you solving this problem today?' … 'What would make [task] easier for you?'"* parcadei adds *"Why?" 5 times to get to root cause* and *80/20 rule (listen more than talk)*. Native's "During Interviews" is generic: "Ask open-ended questions, Follow the energy"—no copy-pasteable questions.

- **OSS names what NOT to ask.** majiayu000: *"✗ Don't ask 'Would you use X?' (people lie)"* and *"✗ Don't pitch your solution."* parcadei: *"Don't ask obvious questions. Don't accept surface answers."* Native only says "Avoid leading questions" without naming common bad questions.

---

## Format & Structure

- **Quick Reference table (Scenario → Framework → Output).** majiayu000 includes a table mapping: *Validate product idea → Product Opportunity Assessment → Go/no-go decision*; *Understand user needs → User Research (interviews, surveys) → User insights, pain points*; *Prioritize features → Kano Model → Feature categorization*; *Map opportunities → Opportunity Solution Tree → Prioritized opportunities*. Native has no such routing; the agent must infer which method fits.

- **Discovery Methods taxonomy (Generative vs Evaluative vs Quantitative vs Qualitative).** majiayu000 explicitly maps: *Generative (What problems exist?) → ethnography, contextual inquiry, diary studies, open-ended interviews*; *Evaluative (Does our solution work?) → usability testing, prototype testing, A/B, concept testing*; *Quantitative (How much?) → surveys, analytics, A/B, market sizing*; *Qualitative (Why? How?) → interviews, focus groups, advisory boards*. Native lists "User Research," "Data Analysis," "Competitive Research," "Technical Discovery" but doesn't distinguish generative vs evaluative or when to use which.

- **Completeness Checklist before synthesis.** parcadei includes a Phase 5 checklist: *Problem Definition (clear statement, success metrics, stakeholders), User Experience (journey mapped, core actions, error states), Technical Design (data model, integrations, scale, security), Decisions Made (all tradeoffs chosen, no TBD)*. Native's synthesis step says "Review all inputs" but doesn't require a structured completeness check before writing findings.

---

## Methodology Gaps

- **Marty Cagan's 10 Questions.** majiayu000 lists all 10: Problem Definition, Target Market, Opportunity Size, Success Metrics, Alternative Solutions, Our Advantage, Strategic Fit, Dependencies, Risks, Cost of Delay. Native's framing questions overlap (What do we think the problem is? Who experiences it?) but lack the full 10Q structure and business-case rigor.

- **Opportunity Solution Tree (OST).** majiayu000 provides a visual diagram and step-by-step: *Step 1: Define Outcome → Step 2: Map Opportunities → Step 3: Generate Solutions → Step 4: Test Assumptions → Step 5: Compare Solutions*. Native has nothing analogous; the workflow goes from hypotheses to research to synthesis without mapping opportunities to solutions.

- **Value vs Effort framework.** majiayu000: *High Value/Low Effort → Do First; High Value/High Effort → Plan Strategically; Low Value/Low Effort → Do Later; Low Value/High Effort → Don't Do*. Native has no prioritization framework for discovery outputs.

- **JTBD, Kano, Value Proposition Canvas.** majiayu000 references these in the Quick Reference (Discover user motivations → JTBD; Prioritize features → Kano; Define value prop → Value Proposition Canvas). Native mentions none.

- **Minimum evidence thresholds.** majiayu000: *Minimum 5 interviews per segment* with a table (Segment | Interviews | Key Finding). parcadei: *Minimum 10–15 questions across categories, at least 2 per relevant category, at least 1 research loop for non-trivial projects*. Native says "How many conversations needed?" but gives no numeric guidance.

- **Definition of Ready.** majiayu000 includes a Discovery Checklist before moving to delivery: *Customer problem validated (5+ interviews), Solution tested (10+ users), Success metrics defined, Technical feasibility confirmed, Business case approved, Design mocks tested, Open questions resolved*. Native's "Finalize" step mentions "Identify context updates" and "Log learnings" but no readiness checklist for handoff to build.

---

## Workflow Improvements

- **Research loops when uncertainty detected.** parcadei: When user says *"I've heard X is good"* or *"We use Y but I'm not sure if..."* → offer *"Would you like me to research this before we continue?"* with options (Yes research / No I know / Tell me briefly). After research, return with INFORMED follow-up questions. Native has no explicit "detect uncertainty → offer research → return with informed questions" loop.

- **Conflict resolution pattern.** parcadei: When discovering conflicts (*"Simple AND feature-rich"*, *"Real-time AND cheap infrastructure"*) → surface explicitly: *"I noticed a potential conflict: You want X but also Y. These typically don't work together because [reason]. Which is more important?"* with options (Prioritize X / Prioritize Y / Explore alternatives). Native doesn't address requirement conflicts.

- **Project-type branching.** parcadei: After initial orientation, branch by PROJECT TYPE (Backend/API, Frontend, CLI, Mobile, Full-stack, Script, Library) and focus questions accordingly. Native's discovery types (Problem, Solution, Market, Technical) don't branch the interview plan by deliverable type.

- **Structured category-by-category deep dive.** parcadei uses 8 categories (Problem & Goals, UX & Journey, Data & State, Technical Landscape, Scale & Performance, Integrations, Security, Deployment) with specific questions and "knowledge gap signals" per category. Native's Plan Research lists User Research, Data Analysis, Competitive, Technical but doesn't scaffold category-by-category questioning with gap-detection signals.

- **Anti-patterns section.** majiayu000: *"✗ Solution-First Discovery → Instead: Start with outcome and problem, explore multiple solutions"*; *"✗ Episodic Research → Instead: Continuous weekly discovery"*; *"✗ Confirmation Bias → Instead: Seek disconfirming evidence, talk to churned users"*; *"✗ Fake Validation → Instead: Test with prototypes, measure actual behavior"*. Native's Research Best Practices say "Stay curious, not confirmatory" but doesn't name or invert anti-patterns.

---

## Concrete Recommendations

1. **Add a "Discovery Guardrails" section with Hard Rules** — Why: Agents (and users) often fall into solution-first or confirmation bias; explicit forbidden/allowed examples reduce this. How: Add a section after "When to Use" with 2–3 Hard Rules (No Solution-First, Evidence-Based Decisions, Falsifiable Assumptions). Use majiayu000's format: ❌ FORBIDDEN / ✅ REQUIRED with 1–2 examples per rule. Keep it shorter than majiayu000 (3 rules vs 4) to avoid overwhelming the skill.

2. **Embed Marty Cagan's 10 Questions into "Frame the Discovery"** — Why: Native framing questions are good but lack business-case completeness; the 10Q is a proven checklist. How: In Step 2 (Frame the Discovery), add a subsection "Product Opportunity Assessment (Marty Cagan's 10 Questions)" listing the 10 questions as optional prompts. Reference it: "For product initiatives, consider answering all 10 before deep research."

3. **Add a Quick Reference table (Scenario → Framework → Output)** — Why: Agents need to route discovery type to the right method. How: Add a compact table after Discovery Types: Validate idea → Product Opportunity Assessment / Go-no-go; Understand needs → User Research / Insights; Size opportunity → TAM/SAM/SOM / Market estimates; Prioritize features → Kano / Categorization; Map opportunities → Opportunity Solution Tree / Prioritized opportunities. Link to synthesize skill for the actual synthesis step.

4. **Expand "Interview Notes Template" with copy-pasteable questions** — Why: Native template has structure but no question bank. How: Add an "Example Questions" subsection under the Interview Notes Template with 5–7 questions from majiayu000: "Walk me through the last time you [did task]", "What's most frustrating about [current solution]?", "How are you solving this problem today?", "What would make [task] easier?", "Tell me more about that." Add one line: "Follow up with 'Why?' to reach root cause."

5. **Add Discovery Methods taxonomy (Generative vs Evaluative)** — Why: Users and agents conflate "discovery" with "interviews"; distinguishing generative (what problems exist) from evaluative (does our solution work) improves rigor. How: In "Plan Research", add a short subsection: "When to Use What Method" — Generative (new area, unknown space) → ethnography, contextual inquiry, open-ended interviews; Evaluative (testing a solution) → usability, prototype testing, A/B; Quantitative (how much) → surveys, analytics; Qualitative (why/how) → interviews, observation.

6. **Add minimum evidence thresholds** — Why: "We talked to 2 users" is a common anti-pattern. How: In "Plan Research > User Research", add: "Minimum 5 interviews per segment for problem validation; 10+ for solution testing. Confidence increases with more." One sentence, no table—keeps it light.

7. **Add Opportunity Solution Tree as optional framework** — Why: OST is widely used and prevents jumping to the first solution. How: Add a subsection "Optional: Opportunity Solution Tree" under "Plan Research" or "Synthesis": 1) Define outcome; 2) Map opportunities from research; 3) Generate solutions per opportunity; 4) Test riskiest assumption; 5) Compare with evidence. 5 bullets; link to Teresa Torres' work in a See Also if desired.

8. **Add Common Anti-Patterns section** — Why: Inverting bad behavior is more memorable than stating good behavior. How: Add "Common Anti-Patterns" before "Research Best Practices" with 4–5 items: Solution-First → start with outcome and problem; Episodic Research → continuous touchpoints; Confirmation Bias → seek disconfirming evidence; Fake Validation → test with prototypes, not "Would you use X?". Format: ✗ Anti-pattern → Instead: [correct behavior].

9. **Add Definition of Ready before Finalize** — Why: Handoff to build without readiness causes rework. How: In Step 7 (Finalize), add a "Readiness Check" sub-step: "Before archiving, verify: Problem validated (5+ interviews)? Solution tested (if applicable)? Success metrics defined? Open questions resolved or acknowledged?" Checklist format; 4–5 items.

10. **Add Research Loop pattern for uncertainty** — Why: parcadei's "detect uncertainty → offer research → return with informed questions" improves discovery quality. How: In "Plan Research" or "Capture Inputs", add one paragraph: "If the user or evidence suggests uncertainty (e.g., 'I've heard X is good', conflicting requirements), offer to research before proceeding. After research, summarize findings in plain language and return with informed follow-up questions." Optional for native given Areté's context injection; can be a "When appropriate" note.

---

## Priority

**High** — Discovery is a core PM skill; the native skill already has workspace integration. Folding in methodology from OSS (guardrails, 10Q, OST, interview scaffolding, anti-patterns) will materially improve the product builder's ability to achieve arete—"navigate ambiguity," "think better," and "challenge them constructively." The recommendations are content additions to SKILL.md, not workflow or dependency changes; low implementation risk. Prioritize recommendations 1–4 and 8 first (guardrails, 10Q, Quick Reference, interview questions, anti-patterns) as they have the highest impact for the least added length.
