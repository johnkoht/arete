# Competitive Analysis Skill Enhancement

**Status**: Backlog / Needs design  
**Priority**: Medium  
**Effort**: TBD (Small if methodology only; Medium if execution model)  
**Owner**: TBD

---

## Overview

Enhance the native competitive-analysis skill to improve execution (optional parallelization/orchestration) and methodology depth. The skill today is a single-agent sequential workflow; research is done "for each competitor" in one flow with no explicit review/synthesis of multiple research outputs.

---

## Current Gaps

### Execution model

- **Single-agent only**: One agent follows the skill steps; no parallel subagents (e.g. one per competitor).
- **No orchestrator/planner**: The primary agent is the sole worker, not an orchestrator that delegates and reviews.
- **No explicit synthesis step**: No "review subagent outputs for consistency, resolve conflicts, synthesize into one view"—synthesis is implicit in filling the matrix and writing the final report.
- **No quality/review gate**: No explicit "review profiles for completeness" or "validate matrix vs profiles" before final output.

### Methodology

Methodology gaps (frameworks, examples, anti-patterns) are already captured in [skills-enhancement.md](skills-enhancement.md). For competitive-analysis that doc recommends:

- Messaging Comparison Matrix (8 dimensions)
- Battlecard structure (objections, differentiators, proof points, landmines)
- 6-layer or 7-layer analysis framework (product, pricing, marketing, sales, team, tech, positioning)
- Worked pricing comparison table, positioning statement template
- Common mistakes section, positioning map axis guidance

Reference that file rather than duplicating here.

---

## Proposed Scope (for later)

When picking this up:

- **Option A — Methodology only**: Adopt frameworks, examples, and anti-patterns from skills-enhancement into the competitive-analysis SKILL.md. No execution-model changes. Effort: Small.
- **Option B — Execution model**: Define an orchestrator + parallel research (e.g. per-competitor tasks) + explicit synthesis step. May require a new pattern or Cursor/Task usage. Effort: Medium.
- **Option C — Both**: Methodology first (Option A), then execution model (Option B) if speed and scale justify it.

---

## References

- [runtime/skills/competitive-analysis/SKILL.md](../../../runtime/skills/competitive-analysis/SKILL.md) — current skill
- [dev/entries/2026-02-09_competitive-analysis-evaluation.md](../../entries/2026-02-09_competitive-analysis-evaluation.md) — evaluation vs OSS (keep native, enhance methodology)
- [dev/backlog/improvements/skills-enhancement.md](skills-enhancement.md) — themed recommendations for all native skills including competitive-analysis
