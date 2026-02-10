# Phase A Outputs - Article Concepts

**Generated**: 2026-02-10  
**Source**: 4 subagents (A1-A4) extracting from 16 articles  
**Total concepts**: 58

---

## A1: Mental Models & Prioritization (15 concepts)

Agent: ff6c19c6

| Concept Name | One-Sentence Summary | Suggested Skills (1-3) | Implementation Type |
|--------------|---------------------|------------------------|---------------------|
| Time value of shipping | Product shipped earlier is worth more; MVP scope grows and customer expectations rise the longer you delay | construct-roadmap, create-prd | Section (## Principles) |
| Ruthless mindset for prioritization | Accept reality: perfect product is an illusion, trade-offs are required, and prioritization favors willingness to ship over polish | construct-roadmap, create-prd, discovery | Workflow step (inline) + Section (## Anti-patterns) |
| Prioritization: between vs within project | Between projects = ROI + constraints (puzzle); within project = fast, ruthless "is this necessary?" decisions | construct-roadmap | Section (## Frameworks) |
| ROI and constraints (dependencies, timelines, team) | Start from value per unit of resource, then apply dependencies, timelines, and team composition | construct-roadmap | Workflow step (inline) + Section (## Frameworks) |
| Confidence/assumption spectrum for speed vs quality | Use problem/solution confidence to choose fast-and-rough vs high-quality; low confidence → ship fast, high confidence → invest in quality | discovery, create-prd, construct-roadmap | Section (## Principles) |
| Version two is a lie | Don't depend on v2; ship v1 as a complete product that still works if it's never improved | create-prd, construct-roadmap | Section (## Anti-patterns) |
| Working backwards (inversion) | Start from the ideal solution and work backwards to define what to build today | discovery, create-prd | Section (## Frameworks) |
| Vision-strategy-scope-backlog pyramid | PM leverage is highest in vision and strategy; scope and backlog are optimization | construct-roadmap, quarter-plan, goals-alignment | Section (## Principles) |
| Time horizon alignment | Align on whether you optimize for months or years; the right choice depends on the horizon | construct-roadmap, quarter-plan | Section (## Principles) + Checklist |
| Expected value (probability-weighted outcomes) | Compare options by probability-weighted value, including "takes longer" and "fails to solve the problem" | construct-roadmap, create-prd | Section (## Frameworks) |
| Bug prioritization system | Use frequency × severity to triage; define "too severe" and "too frequent"; include "backlog and do nothing" as an option | construct-roadmap | Checklist |
| Experiment vs Feature vs Platform | Match speed/quality and goals to type: experiments = learning, features = validated value, platforms = long-lived quality | create-prd, construct-roadmap | Section (## Frameworks) |
| "How can we do this in half the time?" prompt | End planning with a ruthless question: there's always a way to ship faster | construct-roadmap, create-prd | Checklist |
| Key Failure Indicator (KFI) | Pair KPIs with indicators you want to avoid; e.g., grow sign-ups without cratering conversion | construct-roadmap, discovery | Section (## Frameworks) |
| Gap of doom (schedule slip) | When value plateaus and expectations keep rising, you may never catch up; move or pivot | construct-roadmap, create-prd | Section (## Anti-patterns) |

---

## A2: Shipping, Strategy, Vision (14 concepts)

Agent: d9fcbd6f

| Concept Name | One-Sentence Summary | Suggested Skills (1-3) | Implementation Type |
|--------------|---------------------|------------------------|---------------------|
| Shipping is a feature | What ships is what matters—ship → learn → iterate; ideas and plans stay off the box | create-prd, construct-roadmap | Section (## Anti-patterns) + Workflow step (inline) |
| Decide don't option | PMs must decide, not add options; "make it configurable" leads to combinatorics and unclear product | create-prd, construct-roadmap | Section (## Anti-patterns) + Checklist |
| Can't agree to disagree | After a decision, bring people along; avoid "agree to disagree" so no passive-aggressive dynamics | create-prd | Section (## Anti-patterns) |
| Splitting the baby | Middle-ground compromises can satisfy nobody; pick a clear direction instead of splitting | create-prd, construct-roadmap | Section (## Anti-patterns) |
| 10% better can be 100% different | Small "polish" changes can disrupt UX; existing users may not notice or want them; assess if the improvement is worth the risk | construct-roadmap, create-prd | Section (## Anti-patterns) + Workflow step (inline) |
| Vision as picture of a better place | Vision = where you want to be; distinct from purpose (why), mission (what), values (how); helps clarify decisions and motivate | quarter-plan, goals-alignment | Section (## Frameworks) + Workflow step (inline) |
| DHM model | Strategy = delighting customers in hard-to-copy, margin-enhancing ways; three dimensions: Delight, Hard-to-copy, Margin | create-prd, quarter-plan, construct-roadmap | Section (## Frameworks) + Checklist |
| 7 Powers / hard-to-copy advantage | Use Brand, Network effects, Economies of scale, Counter-positioning, Unique tech, Switching costs, Process power, Captured resource to assess defensibility | competitive-analysis, create-prd | Section (## Frameworks) |
| SMT lock-up | Strategy → Metrics → Tactics; proxy metrics validate strategy; tactics/projects bring strategy to life | quarter-plan, construct-roadmap, goals-alignment | Section (## Frameworks) + Workflow step (inline) |
| Proxy metrics | Leading indicators linked to outcomes; must be measurable, moveable, non-average, correlated, segmented (new vs existing), not gameable | quarter-plan, create-prd, construct-roadmap | Section (## Frameworks) + Checklist |
| SMT to OKRs | Add forecast for proxy metric improvement per quarter/year to turn SMT into OKRs; beware false precision | quarter-plan, week-plan | Workflow step (inline) + Section (## Frameworks) |
| Rachleff's Law / PMF is only thing | Lack of market is the main failure mode; before PMF, focus on getting there; do whatever is required | discovery, create-prd | Section (## Frameworks) + Section (## Anti-patterns) |
| You can feel PMF | Not happening: weak value, no word of mouth, slow growth; happening: fast adoption, growth, inbound interest | discovery, create-prd | Section (## Frameworks) + Checklist |
| Market pulls product | A strong market pulls a viable product; product only needs to be good enough, not great; team can be upgraded over time | discovery, competitive-analysis | Section (## Frameworks) |

---

## A3: Alignment, PM Craft (17 concepts)

Agent: ed61bde7

| Concept Name | One-Sentence Summary | Suggested Skills (1-3) | Implementation Type |
|--------------|---------------------|------------------------|---------------------|
| Shallow vs deep alignment | Alignment is dynamic equilibrium, not a checkbox; shallow = low-stakes/easy to get on a slide; deep embraces tension and conflicting truths and needs psychological safety | quarter-plan, goals-alignment, week-plan | Section (## Principles) |
| Alignment proxies trap | Goals, OKRs, and priority lists are proxies, not alignment; the system shifts constantly—rely on understanding, not just commitment to artifacts | quarter-plan, goals-alignment | Workflow step (inline) |
| "What am I getting wrong?" | Invite pushback by asking "What am I getting wrong?" instead of "Does this make sense?" to surface blind spots | create-prd, discovery, construct-roadmap | Workflow step (inline) |
| Metrics-informed vs metrics-driven | Use metrics as one input; blend quantitative and qualitative for the situation instead of following metrics mechanically | create-prd, construct-roadmap, discovery | Section (## Anti-Patterns) |
| Problem prevention over solving | Choose which problems to prevent, which to solve, and which to ignore; avoid preventable problems before they appear | discovery, create-prd, construct-roadmap | Section (## Principles) |
| Strategy before execution | Get the strategy right before flawless execution; don't invest heavily in a flawed strategy | quarter-plan, create-prd, construct-roadmap | Workflow step (inline) |
| Task leverage and overwhelm | Focus on highest-leverage work; being consistently overwhelmed usually means low task leverage | week-plan, daily-plan | Checklist |
| Take blame, pass praise | Give credit to builders and enablers when things go well; absorb blame when they don't | meeting-prep | Shared pattern (PATTERNS.md) |
| Stakeholders as advisors | Treat legal, privacy, security, etc. as advisors, not approvers; incorporate input but PM decides | create-prd | Workflow step (inline) |
| Live in future, work backwards | Ground work in research, feedback, and market; create a clear narrative of where the product should go and the path to get there | create-prd, construct-roadmap, discovery | Section (## Frameworks) |
| Fast pace of quality decisions | Make two-way door calls quickly and one-way door calls carefully; aim for the right decision, not for being right; be the facilitator | construct-roadmap, create-prd | Section (## Principles) |
| Write well | Be succinct, structured, thorough, and persuasive in all PM output | create-prd, synthesize | Rule |
| Data fluency | Define and track the right metrics, align the org around them, design/run solid experiments, and know when optimization isn't worth it | create-prd, discovery, construct-roadmap | Section (## Frameworks) |
| Iterative PRD writing | Write PRDs iteratively and collaboratively so engineering and design are rarely blocked; provide "just enough" requirements | create-prd | Workflow step (inline) |
| Product reviews as truth-seeking | Treat exec reviews as joint truth-seeking; reframe questions instead of only answering them | meeting-prep | Shared pattern (PATTERNS.md) |
| Argue the opposite view | Practice making a convincing case for the opposite of your position to stress-test decisions | create-prd, construct-roadmap | Workflow step (inline) |
| Prioritization without strategy | Explicit prioritization without clear strategy leads to poor mid/long-term decisions; strategy is the parent of prioritization | quarter-plan, construct-roadmap | Section (## Anti-Patterns) |

---

## A4: Psychology & Research (12 concepts)

Agent: 49d54312

| Concept Name | One-Sentence Summary | Suggested Skills (1-3) | Implementation Type |
|--------------|---------------------|------------------------|---------------------|
| Four decision phases (information → meaning → time → memory) | Users filter information, interpret meaning, act under time pressure, then store memories; biases affect each phase differently | discovery, create-prd, construct-roadmap | Section (## Frameworks) |
| Confirmation bias (information phase) | People seek evidence that confirms prior beliefs and favor solution-first discovery over neutral inquiry | discovery, create-prd, synthesize | Section (## Anti-patterns) + Workflow step (inline) |
| Anchoring and framing effects | The first piece of information and how options are presented strongly shape decisions | discovery, create-prd, construct-roadmap | Section (## Frameworks) + Checklist |
| Hick's Law and option overload | More choices increase decision difficulty and reduce quality; especially relevant for prioritization | construct-roadmap, create-prd | Section (## Anti-patterns) + Workflow step (inline) |
| Hawthorne effect and survey bias | People change behavior when observed and skew answers toward what's socially acceptable; weakens surveys and interviews | discovery, synthesize | Section (## Anti-patterns) + Checklist |
| The Mom Test: don't pitch | Describing or pitching your idea contaminates feedback; talk about their life and experience instead | discovery, create-prd | Section (## Anti-patterns) + Workflow step (inline) |
| The Mom Test: past behavior over hypotheticals | Ask about specific past actions ("Tell me about the last time…") instead of future intent ("Would you use…") | discovery | Section (## Examples) + Checklist |
| Loss aversion and sunk cost | People avoid losses and stick with invested projects; distorts roadmap and prioritization choices | construct-roadmap, quarter-plan | Section (## Frameworks) + Workflow step (inline) |
| Availability heuristic and recency | Recent or easy-to-recall information is overweighted; affects synthesis and retrieval | synthesize, discovery | Section (## Anti-patterns) + Checklist |
| Peak-end rule and storytelling | Experiences are judged by peak and end; stories are remembered better than raw facts | synthesize, meeting-prep | Section (## Frameworks) |
| Observer-expectancy and Dunning-Kruger | Researcher expectations skew participants; low knowledge leads to overconfidence; both affect discovery and stakeholder input | discovery, create-prd | Section (## Anti-patterns) |
| Behaviors over stated preferences | What people actually do is more reliable than what they say they would do; prioritize observation over self-report | discovery, synthesize | Section (## Anti-patterns) + Shared pattern (PATTERNS.md) |

---

## Quality Review (Orchestrator)

**Format compliance**: ✅ All 4 agents used exact schema (4 columns, no extra/missing)  
**Concept clarity**: ✅ All concepts have clear names and one-sentence summaries  
**Skill mapping**: ✅ All concepts map to 1-3 skills appropriately  
**Implementation types**: ✅ All use valid types from schema  
**Duplication check**: Some overlap expected (e.g., "working backwards" appears in A1 and A3); will dedupe in synthesis  
**Total extracted**: 58 concepts from 16 articles

**Proceed to Phase B**: ✅ Ready to spawn B1-B2 (book concepts)
