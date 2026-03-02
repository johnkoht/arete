# Maintenance & Learning Protocol

How agents maintain and improve documentation as they work. This file is the **single source of truth** for the learning protocol — role files reference it, not duplicate it.

> For coding standards, see `build-standards.md`. For architectural patterns, see `patterns.md`.

---

## Two Modes

### Light Mode

**Applies when**: Task count < 3, bug fix, or tiny/small plan.

After completing work:
1. Update LEARNINGS.md if you found a new gotcha or invariant
2. Flag inaccuracies in expertise profiles if you noticed any (in your completion report)
3. Done

### Detailed Mode

**Applies when**: `prd.json` task count ≥ 3, OR the orchestrator's holistic review identifies documentation gaps.

After completing work:
1. Review and update LEARNINGS.md for **all directories touched** — not just the one you fixed a bug in
2. Review expertise profiles (`.pi/expertise/{domain}/PROFILE.md`) for accuracy — update if you found something wrong, missing, or outdated
3. Review `patterns.md` — add new patterns discovered (must appear in 2+ places), flag anti-patterns encountered
4. If a subsystem needs deeper documentation than the profile provides, create it (e.g., `.pi/expertise/core/search-deep-dive.md`)
5. Apply start/stop/continue recommendations to the relevant system files (standards, role definitions, skill instructions) — don't just document them in memory entries

---

## Role Responsibilities

### Developer

You're closest to the code — your observations are the most valuable.

- **Always**: Create/update LEARNINGS.md when you find gotchas, invariants, or non-obvious behavior
- **Always**: Flag profile inaccuracies in your completion report (even if you don't fix them yourself)
- **Detailed mode**: Check patterns.md for relevance, propose profile updates if domain knowledge changed
- **Empowered**: You don't need permission to create a LEARNINGS.md, add to a profile, or write a deep-dive doc

### Reviewer (Enforcement Point)

You ensure documentation improvements actually happen.

- **Always**: Verify the developer updated LEARNINGS.md after regression fixes. **Block approval** if missing.
- **Always**: Review documentation changes with the same rigor as code changes — accuracy matters
- **Detailed mode**: Verify profile/pattern suggestions are accurate before accepting
- **Flag**: If the developer's work revealed domain knowledge not captured anywhere, note it in your review output

### Orchestrator

You close the feedback loop.

- **During holistic review**: If execution revealed documentation gaps, assign a documentation improvement task. Treat it as a deliverable, not an afterthought.
- **During close-out**: Apply start/stop/continue to system files (standards, role definitions, skill instructions). Don't just write them in the memory entry.
- **Between tasks**: If a subagent's reflection reveals a pattern or gotcha, feed it into the next subagent's context AND note it for profile/patterns update.
- **Done-done**: Documentation improvements are part of the definition of done, not a follow-up.

---

## Key Principle

Agents are **empowered to create documentation proactively**. The reviewer **enforces that it happens**. The orchestrator **closes the loop** by applying learnings to system files.

This is not aspirational — the reviewer blocks approval when documentation is missing after regressions, and the orchestrator assigns documentation tasks as real deliverables during holistic review.
