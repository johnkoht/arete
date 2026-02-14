# create-prd Improvement Recommendations

## Summary

OSS PRD skills (awesome-copilot, ralph) excel at three areas native create-prd could adopt: (1) **concrete quality standards** with explicit diff examples contrasting vague vs. concrete language; (2) **lettered clarifying questions** for fast iteration ("1A, 2C, 3B"); and (3) **strict output schema** and full worked examples that show the agent exactly what good PRD sections look like. Native has broader discovery and strategic depth but lacks the OSS rigor in anti-patterns, schema enforcement, and implementer-focused guidance.

## Language & Instructions

- **awesome-copilot uses a diff-based quality standard** — Instead of generic "apply PM best practices," it shows BAD vs. GOOD with concrete examples:
  ```diff
  # Vague (BAD)
  - The search should be fast and return relevant results.
  
  # Concrete (GOOD)
  + The search must return results within 200ms for a 10k record dataset.
  + The search algorithm must achieve >= 85% Precision@10 in benchmark evals.
  ```
  Native says "Apply PM best practices" in step 6 of PRD Generation but never defines what that means or shows anti-patterns to avoid.

- **ralph explicitly addresses the PRD reader** — It has a "Writing for Junior Developers" section that instructs: "Be explicit and unambiguous; Avoid jargon or explain it; Provide enough detail; Number requirements for easy reference." Native has no equivalent audience-awareness. The Product Leader persona is writer-focused, not implementer-focused.

- **awesome-copilot forbids hallucination explicitly** — "DON'T: Hallucinate Constraints — If the user didn't specify a tech stack, ask or label it as `TBD`." Native says "Don't guess or fill in blanks" in Error Handling but doesn't give the concrete pattern (label TBD, don't infer).

## Format & Structure

- **awesome-copilot mandates a Strict PRD Schema** — Numbered sections with exact structure: 1. Executive Summary (Problem Statement, Proposed Solution, Success Criteria), 2. User Experience & Functionality (Personas, Stories, AC, Non-Goals), 3. AI System Requirements (if applicable), 4. Technical Specifications, 5. Risks & Roadmap. Native references templates (`prd-simple`, `prd-regular`, `prd-full`) but these templates are **missing from the repo** (referenced in skill, not in workspace-structure.ts or templates/). Native has no schema in the skill itself.

- **ralph includes a full worked example** — A complete PRD for "Task Priority System" (~70 lines) with Goals, numbered User Stories (US-001 through US-004), each with Description, Acceptance Criteria (checkboxes), Functional Requirements (FR-1 to FR-5), Non-Goals, Technical Considerations, Success Metrics, Open Questions. Native has no in-skill example; it relies on templates that may not exist.

- **ralph mandates lettered options for questions** — Format: "1. What is the primary goal? A. Improve onboarding B. Increase retention C. Reduce support D. Other." Users can respond "1A, 2C, 3B." Native discovery questions are open-ended; there's no quick-mode equivalent for structured choice.

## Methodology Gaps

- **awesome-copilot adds AI-specific sections** — "AI System Requirements (If Applicable): Tool Requirements, Evaluation Strategy" and "Define Testing: For AI systems, specify how to test and validate output quality." Native has nothing for AI-powered features despite product builders increasingly defining them.

- **ralph adds a pre-save checklist** — "Before saving the PRD: [ ] Asked clarifying questions with lettered options, [ ] Incorporated user's answers, [ ] User stories are small and specific, [ ] Functional requirements are numbered, [ ] Non-goals section defines clear boundaries." Native's Post-Generation offers "review for gaps" but no agent-executable checklist.

- **awesome-copilot defines Non-Goals as timeline protection** — "Define Non-Goals to protect the timeline" in Phase 2. Native mentions "What's explicitly out of scope?" in Scope but doesn't frame Non-Goals as a strategic guard against scope creep.

- **ralph links acceptance criteria to dev workflow** — "For any story with UI changes: Always include 'Verify in browser using dev-browser skill' as acceptance criteria." Native doesn't connect PRD outputs to implementation skills; ralph assumes a dev-browser skill exists.

## Workflow Improvements

- **awesome-copilot enforces minimum discovery** — "DON'T: Skip Discovery — Never write a PRD without asking at least 2 clarifying questions first." Native has Discovery Mode but no hard minimum; an overeager agent could skip to template selection.

- **awesome-copilot's 3-phase flow is explicit** — Phase 1: Discovery (The Interview); Phase 2: Analysis & Scoping (Synthesize, User Flow, Non-Goals); Phase 3: Technical Drafting. Native has "Discovery Mode" and "PRD Generation" but no explicit Analysis/Scoping step between them. The "Context Integration" step happens before generation but doesn't instruct the agent to "synthesize" or "map user flow" or "identify dependencies."

- **ralph's "The Job" is one-line scannable** — "1. Receive feature description 2. Ask 3-5 essential clarifying questions (lettered) 3. Generate structured PRD 4. Save to tasks/prd-[feature-name].md. Important: Do NOT start implementing." Native's workflow has 9 steps; the high-level job isn't distilled.

- **awesome-copilot mandates iteration** — "DO: Iterate — Present a draft and ask for feedback on specific sections." Native offers "Offer review" post-generation but doesn't require presenting a draft first and asking for section-level feedback before finalizing.

## Concrete Recommendations

1. **Add a "Requirements Quality" subsection with diff examples** — Why: awesome-copilot's BAD/GOOD diff dramatically improves output quality by showing anti-patterns. How: Insert after "PRD Generation" step 4 ("Apply PM best practices"). Add a block showing vague vs. concrete for metrics, acceptance criteria, and success criteria. E.g., "Avoid 'fast' → use '&lt;200ms p95'; avoid 'easy to use' → use '100% Lighthouse a11y.'"

2. **Mandate a minimum of 2 clarifying questions before generation** — Why: awesome-copilot's explicit "never write without 2+ questions" prevents premature drafting. How: In Discovery Mode, add: "Do not proceed to template selection until at least 2 clarifying questions have been asked and answered." In Quick Mode, state: "Quick mode still requires 2 essential questions (problem, approach OR success)."

3. **Add lettered-option format for at least 2 discovery questions** — Why: ralph's "1A, 2C, 3B" enables fast iteration when users have clear preferences. How: In Discovery Mode, add an example: "For Scope: 'What's the scope? A. MVP B. Full-featured C. Backend only D. UI only.' Offer this format for Scope and Success Criteria; keep open-ended for Problem/Solution."

4. **In-line a Strict PRD Schema in the skill** — Why: Native references templates that don't exist in the repo; awesome-copilot's schema is self-contained. How: Add a "PRD Output Schema" section (after Template Selection) with the exact sections: Executive Summary, User Experience & Functionality, Technical Specifications (if applicable), AI System Requirements (if AI feature), Risks & Roadmap. Reference templates as "light/medium/full" variants of this schema, not as the schema source.

5. **Create or ship prd-simple, prd-regular, prd-full templates** — Why: Skill references them but they're absent. How: Add to `DEFAULT_FILES` in workspace-structure.ts or ship in `templates/outputs/` on install. Templates should match the in-skill schema.

6. **Add an AI-specific branch** — Why: awesome-copilot explicitly handles AI-powered features. How: In Discovery Mode or Template Selection, add: "If the feature involves AI/LLM: ask about Tool Requirements, Evaluation Strategy, and how output quality will be tested. Include 'AI System Requirements' section in the PRD."

7. **Add a pre-save checklist** — Why: ralph's checklist ensures agent doesn't skip steps. How: Before "Post-Generation," add: "Before finalizing: [ ] At least 2 discovery questions answered, [ ] Non-Goals section populated, [ ] Success criteria are measurable, [ ] No hallucinated constraints (use TBD if unknown)."

8. **Add one full worked example (condensed)** — Why: ralph's Task Priority System example shows agents exactly what good looks like. How: Add an "Example: Minimal PRD" section with a 30–40 line worked example (one user story, goals, non-goals, success metrics) so the agent has a reference. Can be for a simple feature (e.g., "Add dark mode toggle").

9. **Add explicit "Do not hallucinate" instruction with TBD pattern** — Why: awesome-copilot's "label as TBD" is actionable. How: In Error Handling or a new "Generation Rules" subsection: "If context is missing (tech stack, timeline, budget): do not infer. Mark as '[TBD]' or '[Ask stakeholder]' in the PRD."

10. **Add an Analysis & Scoping step between Discovery and Generation** — Why: awesome-copilot's Phase 2 (synthesize, user flow, non-goals) bridges discovery and drafting. How: Insert step "2.5. Analysis & Scoping" after Discovery: "Synthesize user inputs. Map the core user flow. Define Non-Goals to protect timeline. Identify dependencies or hidden complexity." Then proceed to Template Selection.

## Priority

**Medium** — Native create-prd already delivers strong workspace integration, Product Leader persona, and strategic modes. The gaps (quality standards, schema, examples, minimum discovery) are additive improvements that would meaningfully improve output quality without changing the skill's identity. High-impact, low-risk. Recommended order: 1 (quality examples), 4 (schema), 5 (templates), 2 (min questions), 7 (checklist), then 3, 6, 8, 9, 10 as capacity allows.
