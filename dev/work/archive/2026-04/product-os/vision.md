# Areté Product OS — Vision & Architecture

> **Status**: Active — guiding document for the Areté architecture evolution.
> **Date**: 2026-02-07
> **Branch**: `feature/product-os-architecture`

---

## Mission

**Help product builders achieve arete** — excellence in the full scope of product work.

## What Areté Is

Areté is a **product builder's operating system**. Like a computer OS manages resources, provides services to applications, and creates a consistent interface between hardware and software — Areté:

- **Manages product knowledge**: context, memory, relationships, decisions, plans.
- **Provides intelligence services**: context injection, synthesis, search, routing.
- **Creates a consistent interface**: between the messy reality of product work and whatever tools, skills, or processes you use.

An OS doesn't tell you what apps to run. It makes every app run better.

## Who It's For

Product builders: product managers, product leaders (individual contributors through CPOs). They need clarity, understanding, vision, and strategy. They navigate stakeholders, negotiate, inspire, and align. They synthesize signal from noise, make decisions under uncertainty, and benefit from structure that preserves institutional memory and sharpens judgment.

This tool is built for its creator first, designed so others can use it.

## The Core Insight

**Skills are being commoditized.** Ecosystems like [skills.sh](https://skills.sh/) offer hundreds of agent skills — procedural instructions for creating PRDs, running competitive analysis, writing user stories. Anyone can write and distribute these.

**The procedure isn't the hard part of product work.** Writing a PRD is the easy part. The hard part is the messy, human, contextual work that comes before, during, and after: understanding the business, knowing what was tried before, remembering what a customer said three weeks ago, connecting a discovery finding to a strategic goal, synthesizing signal from noise across dozens of conversations.

**Areté's value is the intelligence underneath, not the procedures on top.** The shift: from "we tell the agent what steps to follow" to "we make the agent deeply knowledgeable about your product so it can follow any steps brilliantly."

---

## Product Primitives

### The Five Building Blocks

Every product is composed of five irreducible primitives. Everything else is either a property of these, context around them, or a method for working with them.

- **Problem** — A pain point, unmet need, friction, or opportunity. The fundamental "why" behind any product work. Problems exist whether or not you've articulated them. All product work starts here.

- **User** — The human who experiences the problem. Not abstract. A person with behaviors, context, motivations, and constraints. Includes segments, personas, roles. Also: buyers, admins, internal users — anyone who touches the solution.

- **Solution** — An approach to addressing a problem for a user. Ranges from concept to shipped product. Solutions have scope, tradeoffs, and outcomes (a solution needs an outcome to validate success). Features are scoped instances of solutions.

- **Market** — The environment in which the problem and solution exist. Competitive landscape, alternatives, market dynamics, timing. No market, no product.

- **Risk** — Uncertainties that could prevent success. Technical risk, market risk, adoption risk, timing risk. Every product carries risks that must be identified and addressed.

### What Primitives Are NOT

Primitives are not folders. Not workflow stages. Not things the user explicitly manages. They are the **knowledge model** — the conceptual framework the intelligence layer uses to understand, connect, and surface product knowledge.

The user thinks "prep me for this meeting" or "start discovery on onboarding." Areté thinks "which primitives are relevant here and what do we know about them?"

### What About Insights, Decisions, Outcomes, etc.?

These are important but they are not product primitives:

- **Insights** and **Decisions** are work artifacts — records of the process, not building blocks of the product. Critically important for Areté to track (institutional memory), but they belong in the memory layer.
- **Outcomes** are a property of solutions — a solution needs an outcome to validate success. Not standalone.
- **Constraints** like compliance requirements (HIPAA, SOC2) are business context. Timeline constraints are project-level concerns. Neither are primitives.
- **Goals** and **Strategy** are organizational context that determines which problems are worth solving. Important backdrop, not building blocks.
- **Stakeholders** are organizational context — people involved in the process. Important for alignment, not a product primitive.

---

## Layered Architecture

```
PRIMITIVES (knowledge model)
  Problem, User, Solution, Market, Risk
  The system's ontology. How Areté understands product knowledge.

CONTEXT (the environment)
  Business overview, strategy, goals, technology, organization
  The backdrop that shapes which primitives matter.

EVIDENCE (the feed)
  Meetings, interviews, notes, data, feedback
  Raw inputs captured in resources/.

RECORDS (institutional memory)
  Decisions, learnings, observations, summaries
  What you've learned and chosen. In .arete/memory/.

SYSTEMS (the methods)
  Discovery, PRDs, roadmaps, planning, competitive analysis
  Skills and processes. Swappable. Opinionated defaults.
```

---

## Workspace Structure

```
workspace/
├── now/                # Start here. Current focus and working surface.
│   ├── scratchpad.md   # Quick capture, parking lot, working notes.
│   ├── week.md         # This week's priorities and outcomes.
│   └── today.md        # Today's focus (populated by daily-plan skill).
│
├── projects/           # Active and archived project work.
│   ├── active/         # 2-3 active projects max.
│   └── archive/        # Completed/closed projects.
│
├── context/            # Business context. The world your product lives in.
│   ├── business-overview.md
│   ├── users-personas.md
│   ├── competitive-landscape.md
│   ├── products-services.md
│   └── technology-overview.md
│
├── goals/              # Strategy and goals. What you're optimizing for.
│   ├── strategy.md     # Org strategy, OKRs, pillars.
│   ├── quarter.md      # Current quarter goals.
│   └── initiatives.md  # Strategic bets that projects align to.
│
├── resources/          # Raw inputs. Meetings, notes, transcripts.
│   ├── meetings/
│   └── notes/
│
├── people/             # People you work with.
│   ├── index.md
│   ├── internal/
│   ├── customers/
│   └── users/
│
├── templates/          # Project and output templates.
│
└── .arete/             # System-managed. Not user-edited directly.
    ├── memory/         # Decisions, learnings, observations, summaries.
    │   ├── items/      # Atomic: decisions.md, learnings.md, observations.md
    │   └── summaries/  # Synthesized: collaboration.md, sessions.md
    ├── activity/       # Activity log, session tracking.
    └── config/         # Workspace configuration.
```

### Design Rationale

- **`now/`** answers "where do I start my day?" — the most common user question.
- **`goals/`** elevated to top-level because goals are referenced constantly (planning, PRDs, alignment). Previously buried in `context/goals-strategy.md` and `resources/plans/`.
- **`goals/initiatives.md`** gives strategic bets a lightweight home. Projects reference initiatives for strategic context. No separate initiatives folder.
- **`.arete/memory/`** is system-managed. The intelligence layer reads and writes memory; users consume it through the agent, not by browsing folders. Keeps the top level focused on things the user directly works with.
- **`people/`** stays top-level. People are a core part of product work — users, customers, stakeholders, colleagues.

---

## Skills Architecture

### Skills Are Methods, Not the Product

Skills are implementations of systems (discovery, PRD creation, competitive analysis). They define procedures — the "how." Areté ships opinionated defaults but users can swap them, including with third-party skills from ecosystems like skills.sh.

The value isn't the skill. The value is the intelligence underneath that makes any skill dramatically more effective.

### Default Skills

Areté ships default skills for core PM workflows. These are opinionated but replaceable. Each default skill should:
- Map to one or more primitives it builds clarity on
- Consume intelligence services (context injection, memory retrieval)
- Produce outputs that feed back into the workspace

### The Adapter Pattern

Instead of requiring third-party skills to integrate with Areté's internals, Areté **prepares context before** and **captures output after** any skill:

1. **Before**: Assemble a **primitive briefing** — relevant context organized by primitive (Problem, User, Solution, Market, Risk relevant to this task). Present to the user: "Here's what I've gathered. Here's what might be missing."
2. **During**: The skill runs its procedure (Areté default or third-party).
3. **After**: Capture the output — project files, decisions to memory, follow-up actions tracked.

Third-party skills benefit from Areté's intelligence without knowing its internals. A PRD skill from skills.sh still gets full context injection.

### Preparing the User

For complex workflows, Areté helps the user understand what's needed before they begin. Rather than deep integration with third-party skills, Areté reviews what the workflow requires and tells the user: "Before we start, here's what this needs and what we already have vs. what's missing."

---

## Project Templates

### Work-Type Aware Scaffolding

When a user starts a new piece of work, Areté identifies the work type and scaffolds a tailored project:

1. User expresses intent: "I want to run discovery on onboarding"
2. Areté identifies the work type: Discovery
3. Areté asks shaping questions: What's the problem? Who's affected? What methods — interviews, workshops, data analysis, prototyping?
4. Areté creates a project with:
   - A tailored structure (discovery looks different from definition or delivery)
   - A lightweight phase guide (loose, not mandatory)
   - Relevant context pre-loaded from the intelligence layer
   - Suggested skills/methods for each phase

### Example Templates

**Discovery**: Frame problem, plan research, gather evidence, synthesize, produce findings.

**Definition (PRD/Spec)**: Problem statement, solution design, requirements, success criteria, risks.

**Delivery**: What's shipping, rollout plan, comms, success criteria, launch brief.

**Analysis**: Research scope, data gathering, comparison, findings, recommendations.

### Phase Guides

Each project includes a lightweight phase checklist in the README — not a rigid process, just a guide:

```markdown
## Phases
- [ ] Frame: Define the problem, users, and approach
- [ ] Collect: Gather evidence (interviews, data, research)
- [ ] Synthesize: Find patterns, test hypotheses
- [ ] Conclude: Produce findings, recommend next steps
```

The user checks these off as they go, or ignores them entirely.

---

## Intelligence Layer

### What It Does

The intelligence layer connects primitives, context, evidence, and memory to whatever work the user is doing. It answers: "given what this person is trying to do, what do they need to know?"

### Core Services

- **Context Injection**: Given a task, automatically assemble relevant context from workspace files. A PRD needs different context than meeting prep. Primitive-aware: surface what we know about the relevant Problem, User, Market, Risk.

- **Memory Retrieval**: Unified search across `.arete/memory/`. Given the current task, surface relevant decisions, learnings, and past work without the user having to specify queries.

- **Entity Resolution**: Resolve "Jane" to a person, find her meetings, projects, action items. Currently the `get_meeting_context` pattern duplicated across skills — extract to shared service.

- **Synthesis**: Take N inputs, produce structured insights. Currently the synthesize skill. Should be a service any workflow can invoke.

- **Primitive Briefing**: Assemble what we know about each relevant primitive before a skill or workflow runs. The adapter pattern in action.

### Extensibility via MCP and Custom Skills

The architecture is intentionally output-agnostic. Areté provides knowledge; what the user does with it is up to them and whatever tools they have available. If a user adds a Notion MCP, they can say "create an executive summary and post to Notion" — Areté's intelligence layer provides the content, the MCP handles delivery.

For repeatable workflows, users can write lightweight custom skills or add instructions to rules. No Areté code changes needed.

---

## Day-to-Day Work

Primitives underpin everything but the user's day isn't "work on primitives." It's:

- **Start at `now/`** — what's on my plate today?
- **Work within `projects/`** — active discovery, PRDs, analysis
- **Reference `context/` and `goals/`** — when aligning or making decisions
- **Capture to `resources/`** — meetings, notes
- **Memory accumulates in `.arete/memory/`** — system-managed, surfaced when relevant

Planning (quarterly goals, weekly priorities, daily focus), meetings (prep, capture, follow-up), and ad-hoc work all happen naturally. The intelligence layer makes each smarter by surfacing relevant primitive knowledge without the user having to ask.

---

## Phased Execution

### Phase 0: Document the Direction (this document)
- Write vision document (this file)
- Add build memory entry
- Update AGENTS.md with new architecture direction

### Phase 1: Workspace Restructure
- Implement `now/` folder (weekly/daily/scratchpad)
- Implement `goals/` folder (migrate from `resources/plans/` and `context/goals-strategy.md`)
- Move `memory/` to `.arete/memory/`
- Basic project templates (discovery, definition, delivery, analysis)
- Update `arete install`, `arete update`, all skills, rules, and code references
- Migration path for existing workspaces

### Phase 2: Skill Refactoring
- Audit 18 skills: categorize as default/refactor/community
- Slim default skills to thinner orchestrators
- Design and document skill interface contract
- Build primitive briefing assembly (the adapter pattern)

### Phase 3: Intelligence Services
- Context injection service
- Memory retrieval service
- Entity resolution service (extract from meeting-prep pattern)
- Synthesis as a service

### Phase 4: Ecosystem
- Skill template/SDK for third-party authors
- Evaluate skills.sh integration
- Better context seeding (onboarding, imports)
- Context freshness monitoring

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Five primitives: Problem, User, Solution, Market, Risk | Everything else is a property, context, or work artifact. Tight, testable model. |
| Primitives as ontology, not folders | The intelligence layer reasons about primitives; the filesystem is organized around how work happens. |
| `now/` as top-level folder | "Where do I start?" needs a one-word answer. |
| Memory moves to `.arete/memory/` | System-managed, consumed via intelligence layer, not manually browsed. |
| Goals elevated to top-level | Referenced constantly across planning, PRDs, alignment. Too important to bury. |
| Initiatives in goals, not separate structure | Lightweight strategic bets that projects reference. No management overhead. |
| Adapter pattern over deep skill integration | Areté prepares context and captures output. Third-party skills work without knowing Areté's internals. |
| Design project templates now, build Phase 1 | Templates are part of the workspace restructure. Intelligence-powered kickoff comes in Phase 3. |
