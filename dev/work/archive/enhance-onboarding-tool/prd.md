# PRD: Enhance Onboarding Tool with Best Practices

**Version**: 1.0  
**Status**: Ready for execution  
**Date**: 2026-02-13  
**Target File**: `runtime/tools/onboarding/TOOL.md`  
**Audience**: End users (PMs using Areté)

---

## 1. Problem & Goals

### Problem

The current onboarding tool has excellent bones—solid structure (Learn/Contribute/Lead phases), clear project organization, good project lifecycle tracking—but lacks the **tactical depth and specific guidance** that makes the difference between a framework and an actionable playbook.

**Current state limitations:**
- **Tactical specificity**: General activities ("Schedule 1:1s", "Read documentation") without specific questions to ask, timing guidance, or concrete outcomes
- **Anti-patterns**: No explicit warnings about common mistakes (Two Traps: documentation hole, coming in hot) or landmines to avoid
- **Quick win guidance**: Phase 2 says "take on small tasks" but doesn't help identify them with criteria or examples
- **Learning structure**: Questions to answer, but no system for tracking learning (4-category learning backlog, relationship backlog, burning problems)
- **Relationship-building**: Generic "build relationships" without specific cadences, tactics (9 magic words), or frameworks (trust battery, say/do ratio)
- **Fresh eyes leverage**: Doesn't capitalize on newcomer advantage (documentation, breadth over depth, "because vs despite" lens)

### Goals

Transform the onboarding tool from a good framework into an excellent, actionable guide by incorporating best practices, specific tactics, and proven approaches from PM operators. After enhancement, the tool should feel like **having an experienced PM coach in your pocket** rather than a generic framework.

**Success metrics:**
1. **Provide specific tactics** — User knows exactly what to say/do/ask, not just themes
2. **Prevent common mistakes** — Explicit anti-patterns save user from landmines
3. **Leverage fresh perspective** — Guidance on using newcomer advantage (documentation, beginner's mind)
4. **Build trust systematically** — Trust battery, say/do ratio, quick wins with criteria
5. **Scale impact through documentation** — "Create leverage" built into Phase 1
6. **Navigate organizational dynamics** — Sacred cows, power structures, peacetime vs wartime

### Key Decisions (from Review)

1. **Template strategy**: Inline templates in TOOL.md (not separate files). Templates are examples for the agent to follow during activation, not files to copy. The tool remains self-contained.
2. **File length**: Acceptable if well-organized with clear section headers. TOOL.md is agent instructions, not human-readable docs. Agents benefit from comprehensive guidance. Phase-specific content is grouped so the agent reads relevant sections during each phase.
3. **Backward compatibility**: Not a concern—no current users with existing onboarding projects.

### Out of Scope

- Creating separate template files in a templates directory
- Modifying the project lifecycle or graduation criteria
- Adding automation or calendar integration to the onboarding tool itself
- Changing the fundamental three-phase structure (Learn/Contribute/Lead)

---

## 2. Requirements Summary

### Phase-Specific Enhancements

**Phase 1 (Learn, Days 1-30):**
- Two Traps to Avoid section
- Learning Backlog with 4-category matrix
- Relationship Backlog with timing guidance
- The 9 Magic Words
- Diagnose-Don't-Solve approach
- Create Leverage guidance
- Breadth Over Depth reminder
- Situational Conversation milestone

**Phase 2 (Contribute, Days 31-60):**
- Quick Win Finder with criteria
- Tactical quick win examples
- Trust Battery metaphor
- Say/Do Ratio guidance
- Imposter syndrome acknowledgment
- Phase-specific 1:1 questions

**Phase 3 (Lead, Days 61-90):**
- Navigate Sacred Cows guidance
- Know-Why-Before-How principle
- Peacetime vs Wartime context
- Share Your POV guidance
- Phase-specific 1:1 questions

**Universal Principles (Cross-Cutting):**
- Relationships Are the Job
- Listen More Than Talk (ratio guidance)
- Share Your Plan Widely
- Be a Sponge, Not a Know-It-All
- Seek Feedback Early
- "Because vs Despite" framework

**Anti-Patterns Section:**
- Common mistakes table
- Specific landmines with examples

**Enhanced Templates:**
- Strengthen existing 1:1 Questions template
- Strengthen existing Weekly Check-in template
- Add inline templates for new working files

**Project Structure Updates:**
- Add new working files documentation
- Update activation workflow

---

## 3. Task Breakdown

### Task 1: Enrich Phase 1 (Learn, Days 1-30)

**Description**: Add tactical depth to Phase 1 guidance with specific best practices for the learning phase.

**Changes to TOOL.md:**

Add new subsections to the "Phase 1: Learn (Days 1-30)" section:

1. **Two Traps to Avoid** (new subsection before "Key Activities"):
   - Documentation hole: Don't fall into reading-only mode
   - Coming in hot: Don't propose solutions before understanding

2. **Enhanced Key Activities** — Update existing activities with tactical specificity:
   - Schedule **walking 1:1s** (not sitting ones) with key stakeholders
   - Use **The 9 Magic Words** in every 1:1: "What can I do to make your life easier?"
   - Ask manager/eng lead/design for **2-3 burning problems to diagnose** (not solve)
   - **Document as you learn** (data dictionaries, process maps) for triple benefit: learning, reference, leverage

3. **Breadth Over Depth** (new subsection):
   - Resist rabbit holes during first 30 days
   - Use fresh eyes window — beginner's mind reveals opportunities others miss
   - "Because vs Despite" lens: Businesses thrive despite problems—observe what's working

4. **Milestone: Situational Conversation** (add to "Phase Complete When"):
   - You can play back what you learned to validate understanding
   - You've held a situational conversation with your manager

**Acceptance Criteria:**
- [ ] Two Traps section exists with documentation hole and coming in hot warnings
- [ ] The 9 Magic Words appears in Phase 1 guidance
- [ ] Burning problems diagnostic approach is documented
- [ ] Create leverage guidance (document as you learn) is included
- [ ] Breadth over depth reminder exists
- [ ] Situational conversation milestone added to phase completion criteria

---

### Task 2: Enrich Phase 2 (Contribute, Days 31-60)

**Description**: Add tactical depth to Phase 2 guidance with quick win identification, trust-building frameworks, and specific tactics for the contribution phase.

**Changes to TOOL.md:**

Add new subsections to the "Phase 2: Contribute (Days 31-60)" section:

1. **Quick Win Finder** (new subsection after "Mindset"):
   - Criteria: Fast (2-3 weeks), Visible, Low-risk, Unowned
   - Why quick wins matter: Build trust battery, prove competence, earn credibility for bigger initiatives

2. **Tactical Quick Win Examples** (within Quick Win Finder or as separate list):
   - Demo the product internally (proves understanding by week 4-6)
   - Run retro on recent release (outsider perspective is an asset)
   - Fix small visible problem hiding in plain sight
   - Audit existing workflow for low-hanging fruit (conversion funnel, annoying process)
   - Create/improve recurring artifact (template, status update format)

3. **Trust Battery** (new subsection):
   - Not binary (trusted/untrusted) — it's a battery that charges with every interaction
   - Small commitments delivered grow trust faster than big promises
   - Say/Do Ratio: Make commitments, deliver on them, share progress visibly

4. **Navigating Imposter Syndrome** (new subsection):
   - Acknowledge it's normal — everyone feels it in new roles
   - Your fresh perspective is valuable, not a liability
   - Focus on learning and contribution, not perfection

5. **Phase-Specific 1:1 Questions** (update existing 1:1 guidance):
   - "How am I doing so far? Any feedback?"
   - "Where do you see opportunities I could help with?"
   - "What's blocking you that I might be able to address?"

**Acceptance Criteria:**
- [ ] Quick Win Finder with 4 criteria (Fast, Visible, Low-risk, Unowned) exists
- [ ] At least 5 tactical quick win examples provided
- [ ] Trust Battery metaphor documented
- [ ] Say/Do Ratio guidance included
- [ ] Imposter syndrome acknowledgment section exists
- [ ] Phase 2 specific 1:1 questions added

---

### Task 3: Enrich Phase 3 (Lead, Days 61-90)

**Description**: Add tactical depth to Phase 3 guidance with frameworks for navigating organizational dynamics and establishing leadership presence.

**Changes to TOOL.md:**

Add new subsections to the "Phase 3: Lead (Days 61-90)" section:

1. **Navigate Sacred Cows** (new subsection):
   - Reframe from "what's broken" to "what's working, how do we do more"
   - Know-Why-Before-How: Talk to people who built what you want to change first
   - Understand context before challenging decisions (earn right to challenge)

2. **Peacetime vs Wartime Context** (new subsection):
   - Recognize whether the org is in peacetime (optimization) or wartime (survival) mode
   - Adjust approach: wartime = bias to action, peacetime = consensus and buy-in
   - Ask: "What mode are we in? What does that mean for how I should operate?"

3. **Share Your POV** (new subsection):
   - Back opinions with data and customer evidence, not just intuition
   - Frame as hypothesis to test, not proclamation
   - Invite challenge: "What am I missing? What would change your mind?"

4. **Phase-Specific 1:1 Questions** (update existing 1:1 guidance):
   - "What should I focus on long-term? What does success look like in this role?"
   - "How can we work together most effectively?"
   - "What would make you see me as successful in this role?"

**Acceptance Criteria:**
- [ ] Sacred cows navigation guidance exists with reframing approach
- [ ] Know-Why-Before-How principle documented
- [ ] Peacetime vs Wartime context section exists
- [ ] Share Your POV guidance included with framing technique
- [ ] Phase 3 specific 1:1 questions added

---

### Task 4: Add Universal Principles Section

**Description**: Create a new cross-cutting section with best practices that apply across all three phases.

**Changes to TOOL.md:**

Add new section **"Universal Principles (All Phases)"** after "The Three Phases" introduction but before Phase 1 details (or as a separate top-level section after phase descriptions):

1. **Relationships Are the Job**:
   - Product management is influence work, not authority work
   - Build relationships before you need them
   - Every interaction charges or drains the trust battery

2. **Listen More Than Talk**:
   - Month 1: 80/20 ratio (listen 80%, talk 20%)
   - Month 2: 70/30 ratio
   - Month 3: 50/50 ratio (balanced contributor)

3. **Share Your Plan Widely**:
   - Don't just share with manager — publish to team (Deb Liu approach)
   - Transparency builds trust and surfaces blind spots early
   - Invite feedback before you're wedded to the plan

4. **Be a Sponge, Not a Know-It-All**:
   - Context matters — every company has reasons for their decisions
   - Earn the right to challenge through curiosity and understanding
   - Ask "Why did you do it that way?" before "Have you considered...?"

5. **Seek Feedback Early**:
   - Vulnerability builds trust
   - Ask "How am I doing?" in weeks 2, 4, 6, 8 (not just at 30/60/90)
   - Create feedback loop: ask → adjust → report back on adjustment

6. **"Because vs Despite"**:
   - Businesses thrive **despite** problems, not because everything is perfect
   - Choose your battles — not every dysfunction is worth fixing
   - Focus on what multiplies impact, not what's merely broken

**Acceptance Criteria:**
- [ ] Universal Principles section exists with all 6 principles
- [ ] Listening ratio guidance (80/20 → 70/30 → 50/50) documented
- [ ] Share plan widely guidance included
- [ ] Sponge mindset vs know-it-all framing exists
- [ ] Feedback seeking cadence (weeks 2, 4, 6, 8) documented
- [ ] "Because vs Despite" framework explained

---

### Task 5: Enhance Templates

**Description**: Strengthen existing templates (1:1 questions, weekly check-in) and add new inline templates for working files. This task depends on Phase enrichment (Tasks 1-3) being complete first so templates align with phase content.

**Changes to TOOL.md:**

**Update "1:1 Guidance" section:**

1. **Add The 9 Magic Words** prominently at the top:
   - "In every 1:1, ask: 'What can I do to make your life easier?'"
   - This opens doors and builds relationships faster than any other question

2. **Replace generic "1:1 Questions by Phase"** with phase-specific question sets that reference the tactical guidance from Tasks 1-3

3. **Add Relationship Maintenance Cadence**:
   - Essential contacts: Weekly or bi-weekly
   - Important contacts: Bi-weekly or monthly
   - Valuable contacts: Monthly or quarterly

**Update "Weekly Check-in Template":**

Add these new sections to the template:

```markdown
### Say/Do Ratio Check
- Commitments made this week: [List]
- Commitments delivered: [List]
- In progress (on track): [List]

### Quick Wins (Phase 2)
- Opportunities identified: [Fast, Visible, Low-risk, Unowned?]
- Quick win in progress: [Status]

### Fresh Perspective Captured
- What did beginner's mind reveal this week?
- What's working that others might take for granted?
```

**Add Inline Templates for New Working Files:**

Add these templates within the "Project Structure" or "Activation Workflow" section as examples for agents to use when creating working files:

1. **Learning Backlog Template** (working/learning-backlog.md):
   ```markdown
   ## PM Craft
   - What do I need to learn?
   - Why?
   - Who can teach me?
   - How will I get it?
   
   ## The Product
   [Same structure]
   
   ## The Market
   [Same structure]
   
   ## The Business
   [Same structure]
   ```

2. **Relationship Backlog Template** (working/relationship-backlog.md):
   ```markdown
   | Name | Role | Importance | Relationship Strategy | Cadence | Next Touch |
   |------|------|------------|----------------------|---------|------------|
   | [Person] | [Title] | Essential/Important/Valuable | [How to build rapport] | Weekly/Bi-weekly/Monthly | [Date] |
   ```

3. **Burning Problems Tracker Template** (working/burning-problems.md):
   ```markdown
   | Problem | Flagged By | Investigation Notes | Diagnosis | Recommendation Timing |
   |---------|-----------|--------------------|-----------|--------------------|
   | [Problem description] | [Name] | [What you learned] | [Root cause] | [When to share] |
   ```

4. **Quick Win Tracker Template** (working/quick-wins.md):
   ```markdown
   | Opportunity | Effort (days) | Visibility | Risk | Owner Status | Criteria Met? |
   |------------|--------------|-----------|------|--------------|---------------|
   | [Description] | [2-3 weeks?] | High/Med/Low | Low? | Unowned? | Fast/Visible/Low-risk/Unowned |
   ```

5. **Situational Playback Template** (plan/situational-playback.md):
   ```markdown
   ## What I Learned
   
   ### Business & Strategy
   - [Key points]
   
   ### Product & Users
   - [Key points]
   
   ### Team & Dynamics
   - [Key points]
   
   ## Gaps in Understanding
   - [What I still don't know]
   
   ## Questions for Validation
   - [Questions to confirm understanding]
   ```

**Acceptance Criteria:**
- [ ] The 9 Magic Words added prominently to 1:1 guidance
- [ ] Phase-specific 1:1 question sets replace generic questions
- [ ] Relationship maintenance cadence added
- [ ] Weekly check-in template includes Say/Do Ratio, Quick Wins, and Fresh Perspective sections
- [ ] All 5 new working file templates added as inline examples (Learning Backlog, Relationship Backlog, Burning Problems, Quick Wins, Situational Playback)
- [ ] Templates reference the tactical guidance from phase enrichment tasks

---

### Task 6: Add Anti-Patterns Section

**Description**: Create a new "Landmines to Avoid" section with common mistakes and specific anti-patterns to prevent newcomers from making predictable errors.

**Changes to TOOL.md:**

Add new section **"Landmines to Avoid"** after the three phase descriptions and before "Project Structure":

1. **Common Mistakes Table**:

| Mistake | Why It's Bad | What to Do Instead |
|---------|-------------|-------------------|
| Dumping user feedback list on team in week 1 | You don't understand context yet; feedback without synthesis adds noise | Synthesize patterns after 30 days of listening |
| Assigning action items in early 1:1s | You haven't earned trust yet; comes across as presumptuous | Ask questions, offer help, listen first |
| Making proclamations before understanding context | Erodes credibility; reveals you don't understand "why" | Ask "Why did you do it that way?" before suggesting changes |
| Trying to fix everything you see | Overwhelms you and the team; dilutes focus | Choose 1-2 high-impact quick wins in Phase 2 |
| Projecting previous company playbook | Every company is different; what worked there may not work here | Observe, adapt, then apply lessons learned elsewhere |
| Ignoring informal power structure | Formal org chart ≠ real influence; missing key stakeholders hurts you | Map informal power via "Who do people go to for X?" questions |

2. **Specific Anti-Patterns with Context**:

**Phase 1 Anti-Patterns:**
- **Documentation hole**: Spending weeks reading docs without talking to people (context is in conversations, not wikis)
- **Coming in hot**: Proposing solutions in week 1-2 (you don't understand the problem yet)
- **Rabbit hole diving**: Deep-diving one area at the expense of breadth (fresh eyes window closes fast)

**Phase 2 Anti-Patterns:**
- **Big swings too early**: Trying to lead a major initiative before proving competence on smaller wins
- **Ghost mode**: Contributing quietly without visibility (trust battery charges through visible delivery)
- **Imposter paralysis**: Waiting until you feel "ready" to contribute (you'll never feel fully ready)

**Phase 3 Anti-Patterns:**
- **Sacred cow slaughter**: Attacking established practices without understanding their history
- **Lone wolf leadership**: Leading without building coalition (influence requires allies)
- **Opinion without evidence**: Sharing POV not backed by data or customer insight

**Acceptance Criteria:**
- [ ] Common Mistakes table exists with at least 6 mistakes, why they're bad, and alternatives
- [ ] Phase-specific anti-patterns documented (at least 2-3 per phase)
- [ ] Landmines section appears before Project Structure section
- [ ] Anti-patterns connect to positive guidance in phase sections (e.g., sacred cow slaughter connects to Phase 3 "Navigate Sacred Cows")

---

### Task 7: Update Project Structure Documentation

**Description**: Update the project structure section to include new working files and plan files introduced in the enhancement.

**Changes to TOOL.md:**

Update the "Project Structure" section to reflect new files:

```
projects/active/onboarding/
├── README.md                    # Status, current phase, progress tracker
├── plan/
│   ├── 30-60-90.md              # High-level phase plan
│   ├── 30-day-detailed.md       # Detailed first 30 days
│   ├── situational-playback.md  # NEW: Prep for situational conversation with manager
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
│   ├── stakeholders.md          # People/org map
│   ├── learning-backlog.md      # NEW: 4-category learning tracker
│   ├── relationship-backlog.md  # NEW: Stakeholder relationship map
│   ├── burning-problems.md      # NEW: Problems to diagnose
│   └── quick-wins.md            # NEW: Quick win opportunities tracker
└── outputs/
    ├── context/                 # Finalized context files (to promote)
    ├── wins.md                  # Documented wins and contributions
    └── leverage-docs/           # NEW: Documentation created during onboarding
```

Add description of new files:

**New Working Files:**
- `learning-backlog.md` — 4-category matrix (PM Craft, Product, Market, Business) for tracking what you need to learn
- `relationship-backlog.md` — Stakeholder relationship tracker with cadence, strategy, and next touch planning
- `burning-problems.md` — Tracker for 2-3 burning problems identified by manager/eng lead/design for diagnosis
- `quick-wins.md` — Opportunity tracker with criteria check (Fast, Visible, Low-risk, Unowned)

**New Plan Files:**
- `situational-playback.md` — Prep for situational conversation (playback what you learned to validate understanding)

**New Output Directory:**
- `leverage-docs/` — Documentation you create during onboarding (data dictionaries, process maps, guides) that provides leverage for the team

**Acceptance Criteria:**
- [ ] Project structure diagram updated with all 5 new files (situational-playback.md, learning-backlog.md, relationship-backlog.md, burning-problems.md, quick-wins.md, leverage-docs/)
- [ ] Description of each new file's purpose included
- [ ] File locations correct (plan/ vs working/ vs outputs/)

---

### Task 8: Enhance Activation Workflow

**Description**: Update the activation workflow to create enhanced working files and provide specific tactical guidance during activation.

**Changes to TOOL.md:**

Update the "Activation Workflow" section:

**Add new step 4.5** (between existing steps 4 "Initialize plans" and 5 "Populate starter questions"):

```markdown
4.5. **Create enhanced working files**:

   Create in `working/`:
   
   - `learning-backlog.md` — Use 4-category matrix template (PM Craft, Product, Market, Business)
   - `relationship-backlog.md` — Include week 1-2 hit list:
     - Week 1-2 (Essential): Manager, key peers, HR/People partner
     - Week 2-4 (Important): Skip-level, cross-functional partners (Eng, Design, Data)
     - Week 4-8 (Valuable): Customers (if possible), other PMs, tenured employees
   - `burning-problems.md` — Include prompt: "Ask your manager, eng lead, and design lead: 'Is there a burning problem I can investigate and diagnose (not solve)? 2-3 would be ideal.'"
   - `quick-wins.md` — Empty tracker, to populate in Phase 2
   
   Create in `plan/`:
   
   - `situational-playback.md` — Template for end-of-Phase-1 situational conversation
   
   Create in `outputs/`:
   
   - `leverage-docs/` — Directory for documentation created during onboarding
```

**Update step 6 "Guide first actions"** to include:

```markdown
6. **Guide first actions**: 
   - Schedule **walking 1:1s** (not sitting ones) with manager, key peers, HR in week 1-2
   - Use **"What can I do to make your life easier?"** in every 1:1
   - Ask manager, eng lead, design lead: **"Is there a burning problem I can investigate and diagnose?"** (aim for 2-3)
   - Start **documenting what you learn as you learn it** (data dictionaries, process maps) — save in `outputs/leverage-docs/`
   - Focus on **breadth over depth** — resist rabbit holes, use fresh eyes window
```

**Acceptance Criteria:**
- [ ] Step 4.5 exists in activation workflow
- [ ] All 5 new working/plan files created during activation (learning-backlog, relationship-backlog, burning-problems, quick-wins, situational-playback, leverage-docs/)
- [ ] Relationship backlog includes week 1-2 hit list during creation
- [ ] Burning problems file includes diagnostic prompt
- [ ] Step 6 guidance updated with walking 1:1s, 9 magic words, burning problems ask, document-as-you-learn, and breadth-over-depth reminders

---

### Task 9: Verify Activation Workflow

**Description**: Manual verification that the enhanced tool's activation workflow works correctly and creates all new structure and templates as designed.

**Verification Steps:**

1. **Simulate activation** (or run `arete tool activate onboarding` if command exists):
   - Walk through the activation workflow step-by-step
   - Confirm agent behavior matches updated TOOL.md guidance

2. **Verify project structure created**:
   - Check that `projects/active/onboarding/` has correct directory structure
   - Verify all 5 new files exist (learning-backlog.md, relationship-backlog.md, burning-problems.md, quick-wins.md, situational-playback.md)
   - Verify leverage-docs/ directory exists

3. **Verify template content**:
   - Open each new working file and confirm template content matches inline templates from Task 5
   - Verify relationship-backlog.md includes week 1-2 hit list
   - Verify burning-problems.md includes diagnostic prompt

4. **Verify activation guidance**:
   - Confirm step 6 guidance includes walking 1:1s, 9 magic words, burning problems ask, document-as-you-learn
   - Verify agent output references tactical best practices during activation

5. **Regression check**:
   - Verify existing functionality still works (30-60-90 plans, weekly check-ins, graduation workflow)
   - Confirm no breaking changes to project lifecycle

**Acceptance Criteria:**
- [ ] Activation workflow completes successfully
- [ ] All new files created in correct locations with correct content
- [ ] Templates match specifications from Task 5
- [ ] Activation guidance includes all tactical elements
- [ ] No regression in existing functionality

---

## 4. Dependencies Between Tasks

```
Task 1 (Phase 1) → Task 5 (Templates) — Templates reference Phase 1 tactical guidance
Task 2 (Phase 2) → Task 5 (Templates) — Templates reference Phase 2 tactical guidance  
Task 3 (Phase 3) → Task 5 (Templates) — Templates reference Phase 3 tactical guidance
Task 4 (Universal) → (Independent) — Can run in parallel with phase tasks
Task 5 (Templates) → Task 8 (Activation) — Activation creates files using templates
Task 6 (Anti-patterns) → (Independent) — Can run in parallel
Task 7 (Structure) → Task 8 (Activation) — Activation references structure
Task 8 (Activation) → Task 9 (Verify) — Verification tests activation workflow
```

**Execution order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

Tasks 1-4 and 6 can be done in parallel, but Task 5 must wait for 1-3 to complete. Task 8 must wait for 5 and 7. Task 9 is final verification.

---

## 5. Testing Strategy

- **Task 9 is the comprehensive verification** — manual walkthrough of activation workflow
- **Smoke test after each task**: Read the TOOL.md section you modified and verify:
  - Content is well-organized
  - References to other sections are correct
  - Markdown syntax is valid
  - Section ordering makes sense
- **Integration check after Task 5**: Verify templates reference phase content correctly
- **No automated tests** (this is content enhancement, not code changes)

---

## 6. Success Criteria

After implementation:

1. **Tactical specificity achieved**: A PM reading the tool knows exactly what to say ("What can I do to make your life easier?"), do (walking 1:1s), and ask (burning problems) — not just themes
2. **Anti-patterns prevent landmines**: Common mistakes table and phase-specific anti-patterns exist and connect to positive guidance
3. **Fresh perspective leveraged**: Guidance on using newcomer advantage (documentation, beginner's mind, breadth over depth) is built into Phase 1
4. **Trust built systematically**: Trust battery, say/do ratio, and quick wins with criteria (Fast, Visible, Low-risk, Unowned) are documented
5. **Impact scaled through documentation**: "Create leverage" (document as you learn) is explicit in Phase 1 guidance and activation workflow
6. **Organizational dynamics navigated**: Sacred cows, power structures, and peacetime vs wartime guidance exists in Phase 3
7. **Activation workflow enhanced**: New files (learning-backlog, relationship-backlog, burning-problems, quick-wins, situational-playback) are created with correct templates during activation
8. **Tool feels like a coach**: Reading the enhanced tool provides specific, actionable guidance rather than a generic framework

---

## 7. File to Modify

1. **`runtime/tools/onboarding/TOOL.md`** — All enhancements applied to this single file

No other files modified. All templates are inline, all guidance is self-contained.
