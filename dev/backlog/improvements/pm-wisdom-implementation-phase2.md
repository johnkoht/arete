# PM Wisdom Implementation: Phase 2

## Summary

**Date**: 2026-02-09  
**Scope**: Complete all create-prd and quarter-plan improvements from top 25 (high priority)  
**Status**: ✅ Complete  
**Total concepts implemented**: 21 (10 for create-prd, 11 for quarter-plan)

---

## create-prd (10 concepts)

### Sections Created

1. **## Anti-patterns** — Between ### 9. Special Modes and ## Product Leader Persona
2. **## Frameworks** — Between ## Anti-patterns and ## Product Leader Persona

### Changes by Priority

| # | Concept | Location | Source |
|---|---------|----------|--------|
| 7 | Light pre-mortem | ### 8. Post-Generation, new bullet 2 | Thinking in Bets |
| 8 | "Version two is a lie" | ## Anti-patterns | Blackbox mental models |
| 11 | Argue the opposite / devil's advocate | ### 9. Special Modes → Devil's Advocate Mode | Shreyas, Thinking in Bets |
| 16 | "Decide, don't option" | ## Anti-patterns | a16z |
| 18 | "Can't agree to disagree" | ## Anti-patterns | a16z |
| 24 | DHM model | ## Frameworks | Gibson Biddle |
| 27 | Probabilistic thinking | ## Frameworks | Thinking in Bets |
| 28 | Stakeholders as advisors | ### 2. Discovery Mode | Shreyas |
| 40 | Iterative PRD writing | ### 1. Project Setup | Shreyas |
| 55 | Strategy before execution | ## Anti-patterns | Shreyas |

### Implementation Highlights

- **Anti-patterns section**: 4 bullets covering common PRD mistakes (v2 is a lie, decide don't option, can't agree to disagree, strategy before execution)
- **Frameworks section**: 2 strategic frameworks (DHM model, probabilistic thinking)
- **Workflow enhancements**: 3 steps updated (Project Setup, Discovery Mode, Post-Generation)
- **Devil's Advocate Mode**: Extended with explicit "argue the opposite" offer

---

## quarter-plan (11 concepts)

### Sections Created

1. **## Frameworks** — After ## Workflow, before ## References
2. **## Anti-patterns** — After ## Frameworks, before ## References

### Changes by Priority

| # | Concept | Location | Source |
|---|---------|----------|--------|
| 2 | Strategy kernel (diagnosis, policy, action) | ## Frameworks | Good Strategy, Bad Strategy |
| 6 | Light pre-mortem | ### 3. Write Quarter File → #### Quick Pre-Mortem | Thinking in Bets |
| 9 | Disagree and commit | ## Frameworks | Five Dysfunctions of a Team |
| 17 | SMT and OKRs | ## Frameworks | Gibson Biddle |
| 19 | Proxy metrics checklist | ## Frameworks | Gibson Biddle |
| 21 | Bad strategy patterns | ## Anti-patterns | Good Strategy, Bad Strategy |
| 29 | Shallow vs deep alignment | ## Frameworks | John Cutler |
| 42 | Empowered teams (outcomes not outputs) | ## Frameworks | Marty Cagan (Empowered) |
| 49 | Operating system for decisions | ## Frameworks | Scaling People |
| 56 | Vision as picture of better place | ### 2. Guide to 3–5 Outcomes | Canopy (Claire Lew) |
| 57 | Vision-strategy-scope-backlog pyramid | ## Frameworks | Blackbox - Applying Leverage |

### Implementation Highlights

- **Frameworks section**: 8 strategic frameworks covering strategy, alignment, metrics, teams, and decision-making
- **Anti-patterns section**: 2 bullets covering bad strategy patterns (fluff/goals-as-strategy, superficial objectives)
- **Pre-mortem**: New subsection in Step 3 for risk identification before locking outcomes
- **Vision framing**: New note in Step 2 to check outcomes against org vision

---

## Quality Verification

- ✅ `npm run typecheck` passed (no errors)
- ✅ Tone consistent with phase 1 (conversational, agent-to-user, no emojis)
- ✅ Formatting follows existing skill structure
- ✅ All 21 concepts from backlog rows #2-#57 implemented

---

## Subagent Details

- **create-prd subagent**: Agent ID `06226ae4-63aa-4d42-8dd3-f52a5a7ce7f0`
- **quarter-plan subagent**: Agent ID `3ff68583-f91e-462b-8504-914c54acde5a`
- **Model used**: `fast` (cost-effective, appropriate for structured implementation)
- **Orchestrator model**: Sonnet 4.5 (for complex reasoning and review)

---

## Next Steps

**Remaining skills** in top 25:
- discovery (4 concepts: #14, #15, #20, #25)
- construct-roadmap (2 concepts: #12, #22)
- goals-alignment (1 concept: #23)
- competitive-analysis (0 in top 25)

**Status**: Awaiting user approval to continue with discovery, construct-roadmap, and goals-alignment.
