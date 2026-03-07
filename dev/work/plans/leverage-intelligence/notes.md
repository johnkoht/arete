# Expert Agent Layer for GUIDE Mode Skills

## Problem

Skills like `process-meetings` bundle mechanical workflow with intelligence/judgment. The judgment is generic (keyword scanning for "we decided", "going with") rather than context-aware reasoning about what actually matters.

## Vision

Separate **workflow orchestration** (the skill) from **judgment** (expert agents). Skills do the legwork, then defer intelligence to expert agents that carry deep context — business strategy, goals, existing decisions, person profiles, relationship history.

## Architecture

### Current: Skill = Workflow + Intelligence (bundled)
- Skills do mechanical work AND make judgment calls
- Intelligence is embedded as pattern-matching heuristics in PATTERNS.md
- Context services exist (`arete brief`, `arete context`, `arete memory search`, `arete people show --memory`) but are consumed mechanically, not used for reasoning

### Proposed: Skill = Workflow → Expert Agent = Intelligence (separated)
- Skills orchestrate mechanical work + assemble context bundle
- Expert agents receive context bundle + raw content + judgment mandate
- Expert agents return ranked candidates with reasoning
- Skills present candidates to user for review and write results

### Implementation Strategy
- **Start with Option A**: Expert agent as a focused call within a single skill (process-meetings)
- **Design for Option C**: Shared expert agents as reusable services across multiple skills

## Expert Agent Types

| Expert Agent | Judgment Domain | Used By |
|-------------|----------------|---------|
| **Significance Analyst** | "What from this content actually matters given everything we know?" | process-meetings, sync, capture-conversation |
| **Strategic Advisor** | "How does this connect to strategy? What's missing? What should we challenge?" | create-prd, construct-roadmap, goals-alignment |
| **Relationship Intelligence** | "What just changed in this relationship? What should we track?" | people-intelligence, meeting-prep, process-meetings |

These aren't just personas — they're **context consumption patterns** with different emphasis on which context matters most.

## Context Bundle

The expert agent receives structured context assembled by the skill:

1. **Raw content** — The meeting notes/transcript/input being processed
2. **Strategy & goals** — Business overview, current goals, active projects (`arete brief`, `arete context`)
3. **Existing memory** — Already-captured decisions and learnings, so the agent doesn't duplicate (`arete memory search`)
4. **People context** — Person profiles, stances, open items, relationship health for attendees (`arete people show --memory`)
5. **Judgment mandate** — What kind of intelligence is needed (extract decisions, challenge assumptions, assess relationship changes)

## Skill-to-Expert Handoff Options

1. **Phase within same conversation** — Skill instructions tell agent to "shift into expert mode" with explicit context injection. Lightest, no infra, but less clean separation.
2. **CLI-mediated expert call** — e.g. `arete analyze --expert significance --input meeting.md --context-bundle bundle.json`. Clean separation, reusable, natural path to Option C. Requires new CLI infrastructure.
3. **Skill-level subagent pattern** — GUIDE mode skills declare expert agent dependencies that get spawned (like BUILD mode's execute-prd). Most powerful, most infrastructure.

**Recommended path**: Option 1 as quick prototype to validate → Option 2 as the real implementation.

## Prototype: process-meetings

The first implementation target. Redesign Step 4 (extract_decisions_learnings):

**Before**: Scan for keywords → format candidates → present for review
**After**: 
1. Skill assembles context bundle (strategy, existing decisions/learnings, attendee profiles)
2. Skill hands bundle + meeting content to Significance Analyst expert
3. Expert returns ranked candidates with reasoning (WHY each matters, referencing context)
4. Skill presents candidates to user for approve/edit/skip
5. Skill writes approved items to memory

## Generalization Path

Once validated with process-meetings, apply the same pattern to:
- `create-prd` → Strategic Advisor for challenging assumptions, identifying gaps
- `meeting-prep` → Relationship Intelligence for prep recommendations
- `synthesize` → Significance Analyst for pattern identification
- `week-review` → Significance Analyst for "what was actually significant this week"

## Open Questions

- How much context is too much? Token budget for expert agent calls
- Should expert agents have memory of their own past judgments?
- How does this interact with community/third-party skills?
- Cost/latency implications of expert agent calls in every skill run
