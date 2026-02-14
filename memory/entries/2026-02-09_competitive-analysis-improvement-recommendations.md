# competitive-analysis Improvement Recommendations

## Summary

The OSS skills (1nf-sh competitor-teardown, anthropics competitive-analysis) outperform native on methodology depth, executable guidance, and sales enablement. competitor-teardown provides a named 7-layer framework with clear data sources per layer, concrete research commands, explicit feature/pricing matrix rules, and a "Common Mistakes" section that native lacks. anthropics adds messaging comparison (8-dimension matrix), narrative analysis (Villain/Hero/Transformation/Stakes), content gap analysis, a positioning statement template with example, and a full battlecard structure with objection handling and landmines. Native's strengths—project scaffold, Areté integration, context update—remain; these recommendations enhance methodology without sacrificing integration.

## Language & Instructions

- **competitor-teardown uses explicit triggers**: Frontmatter includes `triggers: competitor analysis, competitive analysis, competitor teardown, market research, competitive intelligence, swot analysis, competitor comparison...` — native only has a short "When to Use" list. The OSS approach helps routing and discovery. Native could add a `triggers` array in frontmatter for skill-router alignment.
- **anthropics gives "what to look for" per section**: e.g. "**Clarity**: can a first-time visitor understand what they do in 5 seconds?" Native's Research Framework (Company Overview, Product, Positioning, etc.) lists dimensions but not evaluation criteria—the agent has to infer how to assess each.
- **competitor-teardown includes "Common Mistakes"**: A table with Mistake → Problem → Fix (e.g. "Only looking at features | Misses positioning, pricing, traction | Use the 7-layer framework"). Native has no equivalent. This guides the agent away from shallow analysis.
- **anthropics Value Proposition Comparison is structured**: "**Promise**: what they promise | **Evidence**: how they prove it | **Mechanism**: how it delivers | **Uniqueness**: what only they claim." Native's "Value proposition" under Positioning is a single line; anthropics breaks it into four analyzable dimensions.

## Format & Structure

- **7-layer framework vs native's flat Research Framework**: competitor-teardown uses a named table: Layer 1 Product, 2 Pricing, 3 Positioning, 4 Traction, 5 Reviews, 6 Content, 7 Team—each with "What to Analyze" and "Data Source." Native clusters similar ideas (Company Overview, Product, Positioning, Strengths, Weaknesses, Recent Moves) but doesn't name a meta-framework or map data sources to dimensions. Adopting a named framework (even "6-layer" to match native's grouping) would give agents a checklist.
- **Messaging Matrix (anthropics)**: 8-dimension comparison table: Tagline/Headline, Core value proposition, Primary audience, Key differentiator claim, Tone/Voice, Proof points used, Category framing, Primary CTA. Native's "Positioning" section has "Value proposition" and "Messaging themes" but no structured matrix for cross-competitor comparison on these dimensions.
- **Pricing comparison table (competitor-teardown)**: Dedicated structure with Free tier, Starter, Pro, Enterprise, Billing, Annual discount, Min seats, Hidden costs. Native's comparison matrix has a single "Pricing" row with generic legend. competitor-teardown also lists "What to Look For": minimum seat requirements, annual-only billing, feature gating, overage charges, setup fees, contract lock-in.
- **Positioning map axis guidance (competitor-teardown)**: "Good Axes | Bad Axes" table: Good = Simple↔Complex, SMB↔Enterprise, Self-serve↔Sales-led; Bad = Good↔Bad, Cheap↔Expensive. Native mentions "Plot competitors on 2 key dimensions" but doesn't help pick meaningful axes.
- **Executive summary format (competitor-teardown)**: One-page template with Market (category, size, growth), Key competitors (roles: leader, challenger, niche), Our positioning, Key insight, and a metrics table (Users, Pricing, G2 rating). Native's "Executive Summary" is "Key takeaways in 3-5 bullets" with no prescribed structure.

## Methodology Gaps

- **Battlecard (anthropics)**: Native has no battlecard. anthropics defines: Header (name, date, win rate), Quick Overview, Their Pitch, Strengths (Be Honest), Weaknesses, Our Differentiators (with proof per differentiator), **Objection Handling** (If prospect says X → Respond with Y), **Landmines to Set** (questions to ask prospect), **Landmines to Defuse**, Win/Loss Themes, Battlecard Maintenance. This is sales enablement native doesn't address.
- **Narrative Analysis (anthropics)**: Villain, Hero, Transformation, Stakes. Reveals positioning strategy and emotional appeals. Native's "Positioning" is factual (value prop, messaging); it doesn't ask for story-arc analysis.
- **Content Gap Analysis (anthropics)**: Content Audit Comparison (Topic/Theme vs competitors, Gap?), Content Type Coverage (Y/N per format), Identifying Content Opportunities (5 specific questions), Content Quality Assessment (depth, freshness, engagement, production value, thought leadership). Native has no content-focused framework.
- **Review Mining (competitor-teardown)**: Where to Find (G2, Capterra, App Store, Product Hunt, Reddit with URL patterns); What to Extract (Most praised, Most complained, Switching reasons, Feature requests, Comparison mentions). Native lists "G2, Capterra reviews" in Research Sources but doesn't structure what to extract or where to look.
- **Positioning Statement Framework (anthropics)**: "For [target audience], [product] is the [category] that [key benefit] because [reason to believe]." With worked example. Native doesn't use this template.
- **Category Strategy (anthropics)**: Create a new category, Reframe the existing category, Win the existing category, Niche within the category. Native has Porter's Five Forces and SWOT but no category strategy options.
- **Positioning Pitfalls to Avoid (anthropics)**: 5 specific pitfalls (e.g. "Positioning against a competitor rather than for a customer need"). Native has no pitfalls section.
- **Research Cadence (anthropics)**: Deep analysis quarterly, monitoring monthly, real-time alerts ongoing. Native says "quarterly typical" for refresh but doesn't distinguish monitoring cadence.
- **7-layer data-source mapping (competitor-teardown)**: Each layer maps to concrete sources (e.g. Layer 5 Reviews → G2, Capterra, App Store). Native's Research Sources are a flat list; no layer-to-source mapping.

## Workflow Improvements

- **Explicit research commands (competitor-teardown)**: Bash snippets for Tavily, Exa, agent-browser. Native says "use public sources" but gives no commands. Areté can't adopt inference.sh directly; native could add `arete context`, `arete memory search`, and suggest `qmd query "competitor X reviews"` as Areté-equivalent research steps.
- **Step ordering**: anthropics Research Process: Set scope → Gather data → Organize → Analyze patterns → Compare to your position → Synthesize → Date-stamp. Native's workflow jumps from Define Scope to Identify Competitors to Research Framework without an explicit "organize then analyze" sequence.
- **Deliverable variants (competitor-teardown)**: Executive Summary (1 page) vs Detailed Report (per competitor). Native has one output structure. Native could add optional outputs: executive summary, battlecard, content gap brief.
- **"So what" requirement (competitor-teardown)**: "No 'so what' | Data without insight | End each section with implications for you." Native's Recommendations section exists but doesn't instruct the agent to tie each analysis section to implications.
- **UX/screenshot guidance (competitor-teardown)**: Screenshot homepage, pricing page, signup flow. Native doesn't mention UX review or visual capture.
- **Pricing as separate step (competitor-teardown)**: Pricing has its own section and table before SWOT. Native folds pricing into the comparison matrix; a dedicated step would surface hidden costs and tier nuances.

## Concrete Recommendations

1. **Add a named analysis framework (e.g., "6-Layer Competitive Analysis")** — Why: competitor-teardown's 7-layer framework gives agents a clear checklist and maps dimensions to data sources; native's Research Framework is flat. How: Add a table similar to 1nf-sh's: Layer | What to Analyze | Data Source. Adapt layers to native's existing structure (Company, Product, Pricing, Positioning, Reviews, Traction) and add Data Source per row (e.g. Reviews → G2, Capterra, App Store).

2. **Add Messaging Comparison Matrix** — Why: anthropics' 8-dimension matrix (Tagline, Value prop, Audience, Differentiator, Tone, Proof, Category framing, CTA) enables structured cross-competitor comparison; native's Positioning is narrative-only. How: Insert a new subsection under Step 5 or 6 with the matrix table. Optional: add Value Proposition Comparison (Promise/Evidence/Mechanism/Uniqueness) and Narrative Analysis (Villain/Hero/Transformation/Stakes) as sub-frameworks.

3. **Add Battlecard structure as optional output** — Why: anthropics' battlecard is sales-enablement gold: objection handling, landmines to set/defuse, win/loss themes. Native has no sales-oriented deliverable. How: Add optional Step 8b "Battlecard (for sales enablement)" with the anthropics structure: Header, Quick Overview, Their Pitch, Strengths, Weaknesses, Our Differentiators, Objection Handling table, Landmines to Set, Landmines to Defuse, Win/Loss Themes. Output to `working/battlecards/[competitor].md` or `outputs/`.

4. **Expand Comparison Matrix with pricing-specific table** — Why: competitor-teardown's pricing table (Free tier, tiers, billing, min seats, hidden costs) surfaces nuances native's single row misses. How: Add `working/pricing-comparison.md` with the competitor-teardown structure. Keep the legend (✅/⚠️/❌/➖) for feature rows; use a separate pricing table for tier-by-tier comparison.

5. **Add Review Mining structure** — Why: competitor-teardown specifies platforms (G2, Capterra, App Store, Reddit) and extract categories (Most praised, Most complained, Switching reasons, Feature requests, Comparison mentions). Native lists G2/Capterra but not what to mine. How: Add subsection "Review Mining" under Research Framework: "Where to Find" table (Platform | Best For | URL Pattern) and "What to Extract" (Most praised, Most complained, Switching reasons, Feature requests, Comparison mentions). Reference in competitor profile "Customer Sentiment" section.

6. **Add Positioning Map axis guidance** — Why: competitor-teardown's "Good Axes | Bad Axes" table (Simple↔Complex good, Good↔Bad bad) helps agents choose meaningful dimensions. How: Add a "Choosing Axes" subsection with a Good/Bad table and common axis pairs (anthropics: Price vs Capability, Ease vs Power, SMB vs Enterprise).

7. **Add "Common Mistakes" (or "Pitfalls") section** — Why: competitor-teardown's table and anthropics' Positioning Pitfalls steer agents away from shallow or biased analysis. How: Add a short "Common Mistakes" table: Mistake | Problem | Fix. Include: only features, biased analysis, outdated data, too many competitors, no "so what", feature-only comparison.

8. **Add Executive Summary template** — Why: competitor-teardown's one-page format (Market, Key competitors, Our positioning, Key insight, metrics table) is more specific than "3-5 bullets." How: Replace or augment "Executive Summary" in Step 8 output with structured template: Market (category, size, growth), Key competitors (with roles), Our positioning, Key insight, Metrics table.

9. **Add Positioning Statement Framework** — Why: anthropics' "For [audience], [product] is the [category] that [benefit] because [reason]" with example helps agents reverse-engineer and compare positioning. How: Add to Positioning section: the template, a worked example, and instruction to complete for "Us" and each competitor.

10. **Add triggers to frontmatter** — Why: competitor-teardown uses `triggers` for router/discovery. How: Add `triggers: competitive analysis, competitor analysis, analyze competitor, market research, competitive intelligence, swot analysis, competitor comparison, competitive landscape, feature comparison, market positioning` to skill frontmatter.

11. **Add Areté-native research steps** — Why: competitor-teardown has bash commands; native should specify how to use Areté's intelligence. How: Add "Research with Areté" subsection: `arete context --for "competitive landscape [category]"`, `arete memory search "competitor [name] OR [category] market"`, `qmd query "[competitor] reviews G2 Capterra"` (when QMD available). Keep Research Sources list as fallback.

12. **Add "So what" instruction** — Why: competitor-teardown says "End each section with implications for you." How: Add to Workflow step 7 (Strategic Analysis) or step 8: "For each section (Competitor Profiles, Matrix, Strategic Analysis), end with 1-2 bullets: *So what for us*—implications, opportunities, or risks."

## Priority

**High** — Competitive analysis is a core PM workflow (market research, investor decks, product strategy). The native skill has strong project integration but lags OSS on methodology depth. Adopting even 4-5 of these (framework, messaging matrix, review mining, axis guidance, common mistakes) would meaningfully improve output quality without changing project structure or Areté integration. Battlecard and content gap are medium priority (broader appeal to sales/marketing); executive summary template and triggers are quick wins.
