# PM Wisdom Implementation: Phase 3 (Final Top 25)

## Summary

**Date**: 2026-02-09  
**Scope**: Complete final 7 high-priority concepts from top 25 + refactor light_pre_mortem pattern  
**Status**: ✅ Complete  
**Total concepts in phase 3**: 7 + 1 pattern refactor

---

## Pattern Refactor: light_pre_mortem

**Why**: Previously duplicated across 3 skills (create-prd, quarter-plan, construct-roadmap) with identical instructions. Extracted to shared pattern for DRY (Don't Repeat Yourself).

### Changes Made

**File: [`runtime/skills/PATTERNS.md`](runtime/skills/PATTERNS.md)**
- Added new `## light_pre_mortem` section after `extract_decisions_learnings`
- Defined: Purpose, Used by, Steps (4 steps), Outputs, Note about full pre-mortem template

**Files Updated to Reference Pattern**:
- [`runtime/skills/create-prd/SKILL.md`](runtime/skills/create-prd/SKILL.md) — Line 152: "Use the `light_pre_mortem` pattern"
- [`runtime/skills/quarter-plan/SKILL.md`](runtime/skills/quarter-plan/SKILL.md) — Lines 44-46: "Use the `light_pre_mortem` pattern"
- [`runtime/skills/construct-roadmap/SKILL.md`](runtime/skills/construct-roadmap/SKILL.md) — Quick Pre-Mortem subsection: "Use the `light_pre_mortem` pattern"

**Benefit**: Single source of truth; evolve once, all skills benefit.

---

## discovery (4 concepts)

### Changes Made

**Section Created**: `## Frameworks` — After Anti-patterns, before Research Best Practices

| # | Concept | Location | Source |
|---|---------|----------|--------|
| 14 | Behaviors-over-stated-preferences | ## Anti-patterns (new bullet) | The Mom Test, JTBD |
| 15 | Jobs-to-be-done framing | ## Frameworks | Competing Against Luck |
| 20 | Build-Measure-Learn loop | ## Frameworks | The Lean Startup |
| 25 | Rachleff's Law / PMF signals | ## Frameworks | pmarchive (Marc Andreessen) |

### Implementation Highlights

**Anti-patterns** (1 new bullet):
- "**Behaviors over stated preferences**: Focus on what users actually do, not what they say they'll do; past behavior predicts future action better than hypothetical intentions"

**Frameworks** (3 new entries):
- **Jobs-to-be-done**: Job statement template (*When [situation], I want to [motivation], so I can [outcome]*); functional, emotional, social dimensions
- **Build-Measure-Learn loop**: Minimize end-to-end loop time; small experiments, validated learning, pivot/persevere
- **Rachleff's Law**: Market > team; PMF signals: organic growth, word-of-mouth, unsolicited press; "If you have to ask, you don't"

---

## construct-roadmap (2 concepts)

### Changes Made

**Section Created**: `## Anti-patterns` — After Roadmap Best Practices

| # | Concept | Location | Source |
|---|---------|----------|--------|
| 12 | Argue-the-opposite for roadmap stress-test | ### 7. Review & Refine (item 6) | Shreyas, Thinking in Bets |
| 22 | Ruthless mindset for prioritization | ## Anti-patterns | Multiple |

### Implementation Highlights

**Workflow addition** (### 7. Review & Refine, item 6):
- "**Argue the opposite**: Have someone play devil's advocate and argue against the roadmap priorities. What would we do if we couldn't build any of these? What's the contrarian view?"

**Anti-patterns** (1 bullet):
- "**Ruthless prioritization**: Every yes is a no to something else. Say no to good ideas to say yes to great ones. 'Everything is important' means nothing is."

---

## goals-alignment (1 concept)

### Changes Made

| # | Concept | Location | Source |
|---|---------|----------|--------|
| 23 | Five dysfunctions pyramid check | ### 1. Read Inputs → #### Team Health Check (Optional) | The Five Dysfunctions of a Team |

### Implementation Highlights

**Workflow addition** (Step 1, before reading files):
- New subsection: "**Team Health Check (Optional)**"
- Lists Five Dysfunctions pyramid: Trust → Conflict → Commitment → Accountability → Results
- Agent prompt: "Want to run through the Five Dysfunctions check before we look at the alignment?"
- Note: Weak levels make alignment fragile

---

## Quality Verification

- ✅ `npm run typecheck` passed (no errors)
- ✅ Tone consistent with phases 1-2 (conversational, agent-to-user, no emojis)
- ✅ Formatting follows existing skill structure
- ✅ All 7 concepts from top 25 rows #12-#25 implemented
- ✅ Pattern refactor complete (PATTERNS.md + 3 skill references)

---

## Subagent Details

- **discovery subagent**: Agent ID `85759fa5-4c2d-44e0-8183-9c653eb52d7a`
- **construct-roadmap subagent**: Agent ID `5268e9ba-a17f-4ef4-8e4a-79790f55faaf`
- **goals-alignment subagent**: Agent ID `2bea0408-58a9-4b55-a3fb-7f1a2492b7dc`
- **Model used**: `fast` (cost-effective, appropriate for structured implementation)
- **Orchestrator model**: Sonnet 4.5 (for complex reasoning and review)

---

## Top 25 Complete!

**All 25 high-priority concepts** from the PM wisdom backlog are now implemented across 5 skills:

| Skill | Concepts Implemented | Total |
|-------|---------------------|-------|
| create-prd | Phase 1: #1, #5 / Phase 2: #7, #8, #11, #16, #18, #24, #27, #28, #40, #55 | 12 |
| quarter-plan | Phase 2: #2, #6, #9, #17, #19, #21, #29, #42, #49, #56, #57 | 11 |
| discovery | Phase 1: #3, #13 / Phase 3: #14, #15, #20, #25 | 6 |
| construct-roadmap | Phase 1: #4, #10 / Phase 3: #12, #22 | 4 |
| goals-alignment | Phase 3: #23 | 1 |
| **Shared pattern** | light_pre_mortem refactor | 1 |
| **TOTAL** | | **35** |

(Note: Phases 1-2 implemented 18 concepts; phase 3 added 7 + 1 pattern = 8 changes for 25 total high-priority concepts, plus 10 medium-priority concepts from phase 2 = 35 total)

---

## What's Next?

**Medium-priority concepts** (rows 26-78) are available for future implementation:
- **meeting-prep** (4 concepts: tactical empathy, product reviews, take-blame-pass-praise, multiplier questions)
- **competitive-analysis** (5 concepts: 7 Powers, operational vs strategic, generic strategies, value chain, psychological value)
- **synthesize** (1 concept: availability heuristic, recency, peak-end rule)
- **create-prd** (4 more medium-priority)
- **quarter-plan** (5 more medium-priority)
- **construct-roadmap** (6 more medium-priority)
- **discovery** (6 more medium-priority)

**Potential next steps**:
1. Continue with medium-priority concepts in batches
2. Test and iterate on implemented concepts with real usage
3. Create agent prompting guide (link wisdom registry concepts to Cursor prompts)
4. Document patterns and learnings from implementation
5. User testing: have PMs use enhanced skills and collect feedback
