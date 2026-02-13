---
name: onboarding
description: 30/60/90 day plan for thriving at a new job - learn, contribute, lead
lifecycle: time-bound
duration: 90-150 days
triggers:
  - "I'm starting a new job"
  - "onboarding"
  - "30/60/90"
  - "new role"
  - "ramp up"
---

# Onboarding Tool

A structured approach to starting a new job with excellence. This tool helps you move from newcomer to established contributor through three phases: Learn, Contribute, and Lead. It's designed to help you build genuine understanding, establish credibility, form real relationships, and set yourself up for long-term success.

> **Areté in Action**: The goal isn't just to survive onboarding—it's to thrive. This tool helps you pursue excellence from day one.

## When to Use

- "I'm starting a new job"
- "Start onboarding tool"
- "Help me with my 30/60/90 day plan"
- "I want to onboard effectively"
- "New role, help me ramp up"

## When NOT to Use

- You've been in the role for 90+ days already
- You're doing a lateral move within the same team
- You just need a quick checklist (use a simple task list instead)

## Scope Options

### Comprehensive (Default)

Full 90-day structured onboarding with deep context-building.

- Complete 30/60/90 day plan with detailed first 30 days
- Weekly planning and check-ins
- Full context file population
- Stakeholder mapping and relationship building
- 1:1 tracking and synthesis
- Documented wins and learnings

**Best for**: New company, new domain, leadership roles, or when you want maximum support.

### Streamlined

Focused 30-day plan with essential tracking.

- 30-day detailed plan only
- Bi-weekly check-ins
- Core context files only (business overview, products, users)
- Key stakeholder identification
- Light 1:1 tracking

**Best for**: Similar domain, familiar company type, or when you're already confident in your onboarding abilities.

---

## The Three Phases

### Phase 1: Learn (Days 1-30)

**Goal**: Build deep understanding of the business, product, users, and team

**Mindset**: Curiosity over contribution. Your job is to absorb, not to fix.

**Key Activities**:
- [ ] Schedule 1:1s with key stakeholders (manager, peers, cross-functional partners)
- [ ] Read all available documentation (PRDs, strategy docs, wikis)
- [ ] Shadow customer calls or review recordings
- [ ] Understand the product deeply (use it, break it, question it)
- [ ] Map the organization and decision-making processes
- [ ] Identify the "unwritten rules" and cultural norms
- [ ] Build draft context files as you learn

**Questions to Answer**:
- What problem does the company solve? For whom?
- What's the business model? How does money flow?
- Who are the key customers/users? What do they care about?
- What's the product strategy? Where is it headed?
- Who are the key people I need relationships with?
- What are the current priorities and why?
- What's working well? What's not?

**Outputs**:
- Draft context files (business overview, products, users, competitive landscape)
- Stakeholder map with relationship status
- List of open questions to resolve
- Initial observations and insights

**Phase Complete When**:
- You can explain the business to someone new
- You've met with all key stakeholders at least once
- Draft context files exist for core areas
- You have a clear picture of current priorities

---

### Phase 2: Contribute (Days 31-60)

**Goal**: Start adding value while continuing to deepen understanding

**Mindset**: Helpful contributor. Look for ways to add value without overreaching.

**Key Activities**:
- [ ] Join active projects in a supporting role
- [ ] Take on small, well-scoped tasks and deliver them well
- [ ] Deepen relationships with key stakeholders (second 1:1s)
- [ ] Start sharing observations and asking strategic questions
- [ ] Identify one area where you can make a meaningful contribution
- [ ] Refine context files based on deeper understanding
- [ ] Document your first "win" (however small)

**Questions to Answer**:
- Where can I add the most value given my skills?
- What problems exist that I'm uniquely positioned to help with?
- Who are my allies and potential collaborators?
- What does success look like in this role?
- What are the unstated expectations?

**Outputs**:
- At least one documented win/contribution
- Refined context files
- Deeper stakeholder relationships
- Identified opportunity area for Phase 3

**Phase Complete When**:
- You've delivered at least one meaningful contribution
- Key stakeholders see you as helpful and competent
- You have a clear target for what you'll own in Phase 3
- Context files are mostly complete

---

### Phase 3: Lead (Days 61-90)

**Goal**: Own something meaningful and establish your presence

**Mindset**: Confident owner. You've earned the right to lead.

**Key Activities**:
- [ ] Lead a project or initiative (not just support)
- [ ] Propose ideas and improvements based on your learnings
- [ ] Mentor or help others (share what you've learned)
- [ ] Establish yourself as the "go-to" for your area
- [ ] Build cross-functional relationships beyond your immediate team
- [ ] Finalize all context files
- [ ] Begin thinking beyond onboarding—what's your 6-month vision?

**Questions to Answer**:
- What do I want to be known for?
- What's my unique contribution to this team?
- Where do I see opportunities others might miss?
- What relationships do I need to invest in long-term?

**Outputs**:
- Led initiative with documented outcomes
- Complete, accurate context files
- Established reputation and relationships
- Clear vision for post-onboarding focus

**Phase Complete When**:
- You've successfully led at least one initiative
- People seek you out for your expertise
- Context files are complete and accurate
- You feel confident operating independently

---

## Project Structure

When activated, create this structure in `projects/active/onboarding/`:

```
projects/active/onboarding/
├── README.md                    # Status, current phase, progress tracker
├── plan/
│   ├── 30-60-90.md              # High-level phase plan
│   ├── 30-day-detailed.md       # Detailed first 30 days
│   └── weekly/                  # Week-by-week plans
│       ├── week-01.md
│       ├── week-02.md
│       └── ...
├── inputs/
│   ├── 1-1s/                    # 1:1 meeting notes
│   │   └── [person]-[date].md
│   ├── research/                # Articles, docs, readings
│   └── observations/            # Things you notice
├── working/
│   ├── context-drafts/          # WIP context files
│   │   ├── business-overview.md
│   │   ├── products-services.md
│   │   └── ...
│   ├── questions.md             # Open questions to answer
│   └── stakeholders.md          # People/org map
└── outputs/
    ├── context/                 # Finalized context files (to promote)
    └── wins.md                  # Documented wins and contributions
```

## Activation Workflow

When user activates this tool:

1. **Confirm scope**: "Would you like comprehensive (full 90-day) or streamlined (focused 30-day) onboarding?"

2. **Gather context**:
   - What's the company/role?
   - What's your start date?
   - What do you already know about the business?
   - Any specific goals or concerns?

3. **Create project**: Set up the project structure in `projects/active/onboarding/`

4. **Initialize plans**:
   - Create 30-60-90 high-level plan
   - Create detailed 30-day plan
   - Create Week 1 plan

5. **Populate starter questions**: Add common onboarding questions to `working/questions.md`

6. **Guide first actions**: Help schedule initial 1:1s, identify key readings

## Progress Tracking

Track progress in the project README.md:

```markdown
## Current Status

**Phase**: 1 - Learn
**Week**: 2 of 12
**Started**: 2024-02-15
**Target Graduation**: 2024-05-15
**Scope**: Comprehensive

## Progress Summary

### Phase 1: Learn (Days 1-30)
- [x] Manager 1:1 scheduled
- [x] Read company wiki
- [ ] Product deep dive
- [ ] Customer call shadowing
- [ ] Draft business-overview.md

### Phase 2: Contribute (Days 31-60)
- [ ] Not started

### Phase 3: Lead (Days 61-90)
- [ ] Not started

## Key Metrics
- 1:1s completed: 3/15
- Context files drafted: 1/6
- Wins documented: 0
- Open questions: 12
```

## Weekly Rhythm

### Start of Week
- Review previous week's learnings
- Set 3-5 focus areas for the week
- Schedule any needed 1:1s or meetings
- Update weekly plan

### During Week
- Capture observations and learnings in inputs/
- Update questions.md as you find answers (and new questions)
- Add to context drafts as understanding deepens

### End of Week
- Weekly check-in (see template below)
- Synthesize key learnings
- Adjust next week's plan if needed

## Graduation Criteria

The onboarding tool is complete when:

- [ ] All context files have meaningful, accurate content
- [ ] Stakeholder map is complete with relationship status
- [ ] At least one documented win in outputs/wins.md
- [ ] No critical open questions remaining
- [ ] You can confidently explain the business, product, and priorities
- [ ] Key stakeholders view you as a capable, established team member
- [ ] User confirms ready to graduate

## Graduation Workflow

When graduation criteria are met:

1. **Review and finalize outputs**
   - Ensure all context files are complete and accurate
   - Review wins.md for completeness
   - Check for any loose ends in questions.md

2. **Promote context files**
   - Move finalized context from `outputs/context/` to main `context/` folder
   - Update "Last Updated" dates and attribution

3. **Capture learnings**
   - Log key insights to `memory/items/learnings.md`
   - Log any important decisions to `memory/items/decisions.md`

4. **Archive the project**
   - Use `finalize-project` skill
   - Project moves to `projects/archive/onboarding/`

5. **Transition to steady-state**
   - You're now operating in normal PM mode
   - Context is populated, relationships are built
   - The onboarding tool's job is done

## Weekly Check-in Template

```markdown
## Week [X] Check-in - [Date]

**Phase**: [1-Learn / 2-Contribute / 3-Lead]
**Energy/Momentum**: [High / Medium / Low]

### Accomplished This Week
- [What you did]
- [Who you met with]
- [What you learned]

### Key Insights
- [Surprising discoveries]
- [Important realizations]

### Questions Answered
- [Questions resolved this week]

### New Questions
- [Questions that emerged]

### Blockers or Concerns
- [What's in the way]

### Next Week Focus
1. [Priority 1]
2. [Priority 2]
3. [Priority 3]

### Plan Adjustments
- [Any changes to the overall plan]
```

## 1:1 Guidance

### Who to Meet With

**Week 1-2 (Essential)**:
- Direct manager
- Key peer(s) on your team
- HR/People partner

**Week 2-4 (Important)**:
- Skip-level manager
- Cross-functional partners (Eng, Design, etc.)
- Key stakeholders for your area

**Week 4-8 (Valuable)**:
- Customers (if possible)
- Other PMs in the org
- People who've been there longest

### 1:1 Questions by Phase

**Phase 1 - Learn**:
- What should I know that's not written down?
- What do you wish you knew when you started?
- What are the biggest challenges right now?
- How can I be most helpful to you?

**Phase 2 - Contribute**:
- How am I doing so far? Any feedback?
- Where do you see opportunities I could help with?
- What's blocking you that I might be able to address?

**Phase 3 - Lead**:
- What do you think I should focus on long-term?
- How can we work together most effectively?
- What would make you see me as successful in this role?

## Resources

### Recommended Reading

- "The First 90 Days" by Michael Watkins
- "Onboarding Isn't Enough" by Mark Stein & Lilith Christiansen

### Key Principles

1. **Listen more than you talk** (especially in Phase 1)
2. **Build relationships before you need them**
3. **Small wins create momentum** (don't wait for the big project)
4. **Ask "dumb" questions early** (it gets harder later)
5. **Document as you learn** (your future self will thank you)
6. **Understand before you optimize** (resist the urge to fix things immediately)
