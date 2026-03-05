---
title: Leverage Intelligence — Expert Agent Layer (Phase 1)
slug: leverage-intelligence
status: complete
size: medium
tags: [intelligence, expert-agents, skills]
created: 2026-03-05T03:15:00.000Z
updated: 2026-03-05T03:30:00.000Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 6
---

# Leverage Intelligence — Expert Agent Layer (Phase 1)

## Problem Statement

Skills like `process-meetings` bundle mechanical workflow with intelligence/judgment. The judgment is generic — keyword scanning for "we decided", "going with" — rather than context-aware reasoning about what actually matters given the builder's strategy, goals, relationships, and existing decisions.

The intelligence services exist (`arete brief`, `arete context`, `arete memory search`, `arete people show --memory`) but skills consume them mechanically rather than using them for reasoning. A walkthrough meeting might generate 10+ false "commitments" because the skill can't distinguish explanations from actual promises.

## Vision

Separate **workflow orchestration** (the skill) from **judgment** (expert agent instructions). Skills do the mechanical work, then shift into "expert mode" with explicit context injection for intelligent reasoning.

## Scope: Phase 1 (Option A — Same Conversation)

This phase implements expert agents as **instruction phases within skills** — no new CLI commands, no new TypeScript infrastructure. The agent already has LLM access; we're changing HOW skills tell it to use that access.

Phase 2 (future) would extract these into CLI-mediated expert calls (`arete analyze --expert significance`).

## Success Criteria

1. Expert agent patterns are documented and reusable
2. `process-meetings` uses Significance Analyst for extraction (Step 4) with context bundle
3. `meeting-prep` uses Relationship Intelligence for prep recommendations
4. `week-review` uses Significance Analyst for weekly significance assessment
5. Context bundle assembly is a documented, reusable pattern
6. Skills produce higher-quality output by reasoning about context, not pattern-matching

## Architecture Decision

**Option A (this phase)**: Expert agent as a phase within the same conversation. The skill instructions tell the agent to:
1. Complete mechanical workflow steps
2. Assemble context bundle (strategy, memory, people)
3. Shift into expert mode with specific judgment mandate
4. Return structured output (ranked candidates with reasoning)

This requires NO new infrastructure — only SKILL.md and PATTERNS.md changes.

---

## Plan

### Step 1: Define Expert Agent Patterns in PATTERNS.md

Create three new patterns in `packages/runtime/skills/PATTERNS.md`:

1. **`context_bundle_assembly`** — How to assemble the context bundle that expert agents consume:
   - Raw content (meeting transcript, document, etc.)
   - Strategy & goals (`arete context --for "<topic>"`)
   - Existing memory (`arete memory search "<topic>"`)
   - People context (`arete people show <slug> --memory` for each relevant person)
   - Token budget guidance (prioritize most relevant context)

2. **`significance_analyst`** — Expert agent pattern for "what actually matters":
   - Receives: context bundle + raw content + judgment mandate
   - Distinguishes: genuine decisions/commitments/insights from descriptions/explanations
   - Returns: ranked candidates with reasoning (WHY each matters, referencing context)
   - Used by: process-meetings, week-review, capture-conversation

3. **`relationship_intelligence`** — Expert agent pattern for "what changed in this relationship":
   - Receives: context bundle + meeting content + person profiles
   - Assesses: relationship health changes, new stances, open items evolution
   - Returns: relationship insights with evidence
   - Used by: meeting-prep, people-intelligence

**AC:**
- Three patterns documented in PATTERNS.md following existing pattern format
- Each has: Purpose, Used by, Inputs, Steps, Outputs
- `context_bundle_assembly` includes concrete CLI commands for each context type
- `context_bundle_assembly` includes explicit word limits per bundle section: strategy/goals (max 3 files, 300 words each), memory (max 5 results, 200 words each), person context (stances + open items + relationship health only — no full profile body)
- `context_bundle_assembly` includes priority trim order for oversized bundles and sparse-context fallback behavior
- `context_bundle_assembly` specifies topic derivation: meeting title + first 100 chars of summary/key points, not just filename
- `context_bundle_assembly` specifies reuse: "If you've already run `get_meeting_context`, reuse its people context — do not re-run `arete people show`"
- Each expert agent pattern (Significance Analyst, Relationship Intelligence) includes a **worked example** with: abbreviated input bundle, a bad output (keyword-matched, no bundle citation), and a good output (context-reasoned, cites specific goal/decision/stance from bundle)
- Significance Analyst includes grounding directive: "For each candidate, cite the specific goal, prior decision, or person stance from the context bundle that makes it significant. If you cannot cite specific bundle content, downgrade the candidate's ranking."

### Step 1.5: Validation Gate — Test Patterns with Real Data

Before updating any SKILL.md files, validate that the Significance Analyst pattern produces genuinely context-aware output.

**Test**: Take a real meeting transcript (one with 3-5 clear decisions and several conversational "we should" mentions). Assemble a mock context bundle. Apply the Significance Analyst pattern instructions. Verify:
- Candidates cite specific content from the context bundle
- Analyst correctly distinguishes real decisions from discussion descriptions
- Output is qualitatively different from keyword-matching

**AC:**
- Go/no-go decision documented
- If patterns don't produce context-aware output, revise patterns before proceeding
- Document what worked and what needed adjustment

### Step 2: Update `process-meetings` with Significance Analyst

Redesign Step 7 (the `extract_decisions_learnings` pattern call to workspace memory) to use the Significance Analyst expert agent pattern instead of keyword scanning. **Step 4 (extraction to meeting file) is NOT changed** — it remains direct LLM extraction.

**Current flow** (Step 7):
1. Scan for keywords ("we decided", "going with")
2. Format candidates
3. Present for review
4. Write to memory

**New flow** (Step 7):
1. After mechanical extraction (Steps 1-6), assemble context bundle:
   - Run `arete context --for "<meeting topic>"` to get strategy/goals
   - Run `arete memory search "<meeting topic>"` to get existing decisions (avoid duplicates)
   - For each attendee: `arete people show <slug> --memory` for relationship context
2. Shift into Significance Analyst mode with the context bundle
3. Analyst reasons about what genuinely matters:
   - Distinguishes real decisions from discussion
   - Distinguishes real commitments from descriptions/explanations
   - Identifies insights that connect to existing strategy/goals
   - Flags contradictions with existing decisions
4. Returns ranked candidates with reasoning
5. Present candidates to user with WHY each matters
6. Write approved items to memory

**AC:**
- process-meetings SKILL.md Step 7 updated with context bundle assembly and Significance Analyst
- Step 4 (extraction to meeting file) is unchanged
- Keyword scanning replaced with context-aware reasoning instructions in Step 7
- Extraction instructions explicitly say to distinguish commitments from descriptions
- Candidates include reasoning (why this matters given context)
- References `context_bundle_assembly` and `significance_analyst` patterns
- Two-destination split is explicit: "Step 4 extracts to meeting file. Step 7 uses Significance Analyst to identify what's significant enough for workspace memory."

### Step 3: Update `meeting-prep` with Relationship Intelligence

Enhance the meeting-prep skill to use Relationship Intelligence expert agent pattern for generating prep recommendations.

**Current flow**: Mechanical context gathering → format brief

**Enhanced flow**:
1. Complete mechanical context gathering (get_meeting_context pattern)
2. Assemble relationship context bundle for each attendee
3. Shift into Relationship Intelligence mode:
   - Assess what changed since last meeting (new stances, resolved items, health shift)
   - Identify topics that need attention (unresolved concerns, shifting sentiment)
   - Generate prep recommendations based on relationship trajectory
4. Add "Intelligence Insights" section to prep brief

**AC:**
- meeting-prep SKILL.md updated with Relationship Intelligence phase after context gathering
- Adds "Intelligence Insights" section covering: relationship changes, topics needing attention, recommended approach
- References `context_bundle_assembly` and `relationship_intelligence` patterns
- Existing prep brief structure preserved; intelligence is additive
- Relationship Intelligence receives context already gathered by `get_meeting_context` — does NOT re-run `arete people show` per person

### Step 4: Update `week-review` with Significance Analyst

Enhance week-review to use Significance Analyst for assessing weekly significance.

**Current flow**: List accomplishments → review priorities → plan next week

**Enhanced flow**:
1. Complete mechanical gathering (meetings, commits, completed work)
2. Assemble context bundle (goals, active projects, recent decisions)
3. Shift into Significance Analyst mode:
   - "Given everything that happened this week and the current goals/strategy, what was actually significant?"
   - Separate signal from noise (busy work vs. progress)
   - Identify patterns (recurring themes, blocked areas, momentum shifts)
   - Connect dots to strategy (how does this week advance or hinder goals?)
4. Add "Weekly Intelligence" section

**AC:**
- week-review SKILL.md updated with Significance Analyst phase
- Adds "Weekly Intelligence" section: significant events, patterns, strategic connections
- References `context_bundle_assembly` and `significance_analyst` patterns
- Existing review structure preserved; intelligence is additive
- week-review context bundle is limited to goals context (`arete context --for "<week focus>"`) and memory search (`arete memory search "<week focus>"`) only
- Do NOT add `arete people show` calls — week-review does not resolve attendees; adding people resolution is out of Phase 1 scope

### Step 5: Update `extract_decisions_learnings` pattern

Update the existing pattern in PATTERNS.md to reference the Significance Analyst approach instead of keyword scanning.

**Current**: "Look for: 'we decided', 'going with', 'the plan is', 'consensus was'"
**Updated**: "Use the significance_analyst pattern to identify genuine decisions and learnings through context-aware reasoning rather than keyword matching. The analyst receives the context bundle and distinguishes real decisions from discussion, genuine insights from passing comments."

Also update the `_authoring-guide.md` to reference expert agent patterns as the recommended approach for intelligence-heavy skills.

**AC:**
- `extract_decisions_learnings` pattern updated to reference significance_analyst
- Keyword scanning preserved as fallback: "Use significance_analyst when context bundle is available from the calling skill; fall back to keyword scanning when no bundle is present"
- Before updating, read `finalize-project/SKILL.md` to assess impact — finalize-project references this pattern but has no context bundle
- Updated pattern MUST include conditional language for bundle-less callers
- `_authoring-guide.md` updated with one new section on expert agent patterns (bounded update — do not restructure existing sections)
- Cross-references between patterns are bidirectional
- Confirm `finalize-project` would produce coherent output after the change

---

## Out of Scope

- CLI-mediated expert calls (`arete analyze --expert`) — Phase 2
- Strategic Advisor expert agent — Phase 2 (for create-prd, construct-roadmap)
- Expert agent memory of past judgments — Future
- Token budget enforcement/tracking — Future
- Community skill interaction with expert agents — Future

## Phase 1 Boundary Gate

If expert agent output quality is deemed insufficient after testing real data (Step 1.5), document the gap in LEARNINGS.md and defer CLI extraction to Phase 2. Do not extend Phase 1 scope to compensate.

Do not apply expert agent patterns to `capture-conversation`, `synthesize`, or `create-prd` in this phase, even if the opportunity is obvious.

## Post-Completion

Seed `packages/runtime/skills/LEARNINGS.md` with:
1. When expert agent pattern instructions actually change agent behavior vs. documentation theater
2. The finalize-project/extract_decisions_learnings dependency
3. Observed token budget thresholds from real runs

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Sparse workspace produces empty context bundle | High | Completeness checks per CLI call; sparse-context signal; fallback behavior |
| finalize-project breakage from pattern update | High | Conditional fallback in pattern; audit finalize-project before Step 5 |
| Expert agent instructions too vague | High | Worked before/after examples; grounding directives requiring bundle citations |
| Pattern ambiguity (context_bundle_assembly vs get_meeting_context overlap) | Medium | Define superset relationship; cross-reference table |
| Scope creep into Phase 2 | Medium | Explicit boundary gate; Step 1.5 validation |
| week-review inadvertently gains people resolution | Medium | Explicit scope exclusion in AC |
| Unbounded token budget | High | Hard word limits per section; priority trim order |
| Step reference drift (Step 4 vs Step 7) | Medium | Corrected in plan; explicit two-destination delineation |
