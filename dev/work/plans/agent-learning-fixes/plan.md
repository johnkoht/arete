---
title: "Agent Persona Enrichment: Orchestrator Identity, Reviewer Doc Awareness, Close-Out Checklist"
slug: agent-learning-fixes
status: building
size: small
tags: []
updated: 2026-02-22T04:49:04.023Z
---

# Agent Persona Enrichment

## Problem

The orchestrator agent has no identity — it's 19 lines of generic guidance while the developer (202 lines) and reviewer (151 lines) have rich, detailed personas with clear mindsets, heuristics, and failure modes.

All orchestrator intelligence lives in the execute-prd SKILL.md's 21-step workflow, making it a mechanical dispatcher rather than a thinking leader. If it loses track of the workflow or is used outside execute-prd, institutional knowledge behaviors (LEARNINGS.md, memory entries, documentation, catalog) disappear.

The reviewer is solid but missing documentation impact awareness — a gap a senior engineer would naturally fill.

The execute-prd close-out phase (Steps 16-21) has no quick-scan checklist, making it easy to skip items.

Additionally, `engineering-lead.md` (189 lines) is a rich, unused orphan — nothing references it, no skill dispatches it, no settings configure it — creating confusion risk with the similarly-described orchestrator.

## Success Criteria

- An agent dropped cold into a PRD can read orchestrator.md and know HOW TO THINK, not just what gates to drive
- The orchestrator carries institutional knowledge responsibilities in its IDENTITY, not just in skill workflow steps
- The orchestrator persona works for BOTH its roles: execute-prd orchestration AND plan-mode lifecycle gates
- The reviewer flags documentation impact during code review without being asked
- Phase 3 of execute-prd has a 30-second scannable checklist before the detailed steps
- No two competing "senior engineering manager" personas exist without disambiguation

## Plan

### Step 1: Expand `.pi/agents/orchestrator.md` with identity and institutional knowledge

**File**: `.pi/agents/orchestrator.md` (19 lines → comparable depth to developer.md)

**Architecture note**: The orchestrator serves TWO roles — (1) execute-prd orchestration (dispatching subagents, managing PRD execution) and (2) plan-mode lifecycle gates (driving plan → PRD → pre-mortem → review → build). The enriched persona must work for both. Structure sections as: **Core Identity** (applies always) vs. role-specific guidance.

**Writing principle**: Keep sections crisp and principle-based ("your done-done is X") rather than procedural ("first do X, then do Y"). The SKILL.md owns procedures; the persona owns values and heuristics. This prevents the ~750 combined lines (persona + skill) from competing.

**Full section inventory of changes:**

| Section | Currently | After |
|---------|-----------|-------|
| Frontmatter | ✅ exists | Update description to reflect both roles |
| **How You Think** | ❌ missing | NEW — Core identity and mindset. You've seen PRDs fail when nobody steps back. You care about the whole: problem solved, learning captured, docs current, system improved. You set subagents up for success or own the failure. |
| **Your Roles** | ❌ missing | NEW — Brief framing: (1) PRD Execution: own the PRD end-to-end, dispatch subagents, holistic review. (2) Plan-Mode Gates: drive lifecycle progression, ensure clarity before advancing. Core responsibilities below apply to both. |
| **Your Responsibilities** | ❌ (just bullet points) | NEW — Structured numbered sections like developer.md |
| § 1. Orientation | ❌ missing | NEW — When you land on work: read AGENTS.md, MEMORY.md, collaboration.md, check LEARNINGS.md in affected areas. Get bearings first. Applies to BOTH roles. |
| § 2. Context Assembly | ❌ missing | NEW — Your subagents succeed or fail based on what you give them. List specific files, patterns, pre-mortem mitigations. Show, don't describe. (PRD execution role primarily) |
| § 3. Between-Task Intelligence | ❌ missing | NEW — After each task: synthesize reviewer feedback, check for new LEARNINGS.md created by developers, adapt prompts for upcoming tasks. Feed learnings forward. (PRD execution role) |
| § 4. LEARNINGS.md | ❌ missing | NEW — Pre-task: check LEARNINGS.md in areas subagents will touch, include in context. Post-execution: verify developers updated LEARNINGS.md after regressions. Applies to BOTH roles. |
| § 5. Memory & Documentation | ❌ missing | NEW — Create memory entries after significant work. Check for doc impact during holistic review. Update catalog when tooling/services change. Applies to BOTH roles. |
| § 6. Definition of Done-Done | ❌ missing | NEW — Your "done" = problem solved + learning captured + documentation current + catalog updated + memory entry created + MEMORY.md indexed + refactor items filed. Not "all tasks green." |
| **Decision Heuristics** | ❌ missing | NEW — When task fails review twice (re-examine breakdown), when scope creep appears (check AC boundary), when subagent is stuck (is your context sufficient?), when docs might be stale (grep affected paths), when you're unsure about a risk (ask the builder) |
| **Failure Mode Awareness** | ❌ missing | NEW — Common PRD execution failures: subagents reimplementing existing code, scope creep beyond AC, forgetting documentation, not capturing learnings, losing context between tasks, not feeding reviewer feedback forward |
| **Failure Recovery** | ❌ missing | NEW — Modeled after developer.md and engineering-lead.md patterns |
| **What You Produce / Consume** | ❌ missing | NEW — Tables like developer.md has |

**AC**:
- [ ] Has all sections from the inventory table above, each with enough substance to guide behavior
- [ ] Has "How You Think" that establishes identity and mindset (not just procedures)
- [ ] Explicitly addresses both roles (PRD execution + plan-mode gates) — sections note which role they apply to
- [ ] Sections are principle-based, not procedural — SKILL.md owns procedures, persona owns values/heuristics
- [ ] Orientation ritual is explicit — lists what to read before starting any work
- [ ] Between-task intelligence described — learn and adapt, not just dispatch
- [ ] Done-done definition covers: problem solved, learning captured, docs current, catalog updated, memory entry created, refactor items filed
- [ ] LEARNINGS.md read/verify responsibilities are explicit
- [ ] Decision heuristics cover at least 5 common scenarios
- [ ] Failure modes list at least 5 common PRD execution failures
- [ ] Has "What You Produce" and "What You Consume" tables

### Step 2: Add Close-Out Checklist to execute-prd SKILL.md

**File**: `.pi/skills/execute-prd/SKILL.md`

**What changes**: Insert a consolidated quick-scan checklist at the beginning of Phase 3 (after the Phase 3 header "Holistic Review and Close", before Step 16). Does NOT replace Steps 16-21 — those remain the detailed instructions. This is the 30-second sanity check.

**New content inserted**:

```markdown
### Close-Out Checklist (Quick Scan)

Before diving into the detailed steps below, verify you'll cover all of these:

- [ ] **Problem fit**: Does the implementation solve the PRD's problem statement? (Holistic Review)
- [ ] **Completeness**: Any gaps the task-level AC didn't cover but the PRD implies? (Holistic Review)
- [ ] **LEARNINGS.md**: Were LEARNINGS.md files created/updated where regressions were fixed? (Holistic Review)
- [ ] **Refactor items**: Were refactor items from reviewer feedback filed as plan ideas? (Holistic Review)
- [ ] **Pre-mortem retrospective**: Which risks materialized? Were mitigations effective? (Pre-Mortem Analysis)
- [ ] **Memory entry**: Created `memory/entries/YYYY-MM-DD_*-learnings.md` (Update Builder Memory)
- [ ] **MEMORY.md index**: Added index line to `memory/MEMORY.md` (Update Builder Memory)
- [ ] **Documentation audit**: Are README, AGENTS.md sources, or other docs now stale? (Holistic Review)
- [ ] **AGENTS.md rebuild**: If `.agents/sources/` were modified, run `npm run build:agents:dev` (Holistic Review)
- [ ] **Catalog check**: If tooling/extensions/services changed, update `dev/catalog/capabilities.json` (Holistic Review)
- [ ] **Final report**: Comprehensive, one report, ≤2 pages (Final Report)
```

**AC**:
- [ ] Checklist inserted between Phase 3 header and Step 16
- [ ] Covers all 11 items listed above (including refactor items)
- [ ] References steps by name (e.g., "Holistic Review") not number — avoids drift if steps are renumbered
- [ ] Does not duplicate or replace Steps 16-21 content

### Step 3: Add documentation impact awareness to `.pi/agents/reviewer.md`

**File**: `.pi/agents/reviewer.md`

**What changes — two locations:**

**A) New step in Post-Work Code Review** — Insert as "Step 3.5: Documentation Impact" between existing Step 3 (Quality Check DRY/KISS) and Step 4 (Reuse & Duplication Check):

```markdown
#### Step 3.5: Documentation Impact

If the implementation changes any of these, flag it for the orchestrator:
- User-facing behavior or workflows
- CLI commands, flags, or output
- File paths or workspace structure
- Setup, install, or configuration steps
- Skill or tool interfaces

You don't need to update docs yourself — flag what's affected so the orchestrator can include it in the close-out documentation audit.
```

**B) Update the review output format** — Add a new line to the Post-Work Code Review output template:

```markdown
**Documentation Impact**: ✅ no user-facing changes | ⚠️ [what changed that may need doc updates]
```

**AC**:
- [ ] Step 3.5 exists between Step 3 and Step 4 in the Post-Work review flow
- [ ] Lists the 5 trigger categories (behavior, CLI, paths, setup, interfaces)
- [ ] Output format includes Documentation Impact line
- [ ] Explicitly says "flag for orchestrator" — reviewer doesn't update docs themselves

### Step 4: Disambiguate `engineering-lead.md` orphan

**File**: `.pi/agents/engineering-lead.md`

**What changes**: Add a deprecation/status note to the frontmatter and a comment at the top of the body. This prevents future confusion between two competing "senior engineering manager" personas.

**New content**:

```markdown
---
name: engineering-lead
description: Senior Engineering Manager for execution, quality, and technical leadership
tools: read,bash,grep,find,ls
status: unused
---

> **Note**: This agent is not currently referenced by any skill or configuration. The active orchestrator persona is `.pi/agents/orchestrator.md`. This file is retained as reference material — its patterns (How You Think, decision heuristics, failure recovery) informed the orchestrator enrichment. See `dev/work/plans/agent-learning-fixes/` for context.

You are the **Engineering Lead** ...
```

**AC**:
- [ ] Frontmatter includes `status: unused`
- [ ] Body starts with a visible note explaining it's not active and pointing to orchestrator.md
- [ ] No functional changes to the content itself

## Out of Scope

- Changing execute-prd workflow structure or step numbering
- Fully merging engineering-lead.md into orchestrator.md (separate investigation — may revisit after seeing how enriched orchestrator performs)
- Adding new agents
- Changing developer.md persona
- Changing product-manager.md

## Review Feedback Incorporated

| Review Concern | Resolution |
|----------------|------------|
| #1 Dual-purpose orchestrator | Added "Your Roles" section framing, noted which sections apply to which role, added explicit AC |
| #2 Orphan engineering-lead.md | Added Step 4 to disambiguate with status note |
| #3 Line count AC may incentivize padding | Replaced "120-150 lines" with "all sections from inventory, each with enough substance to guide behavior" |
| #4 Step reference drift | Close-out checklist now references by name ("Holistic Review") not number |
| #5 Missing refactor items | Added to close-out checklist and done-done definition |
| Devil's advocate (procedural vs principle) | Added explicit writing principle: "crisp and principle-based, not procedural — SKILL.md owns procedures" |

## Future Investigation

**orchestrator.md vs engineering-lead.md consolidation**: After seeing how the enriched orchestrator performs across a few PRD executions, revisit whether engineering-lead.md should be fully merged, repurposed, or deleted. The disambiguation note (Step 4) prevents confusion in the interim.
