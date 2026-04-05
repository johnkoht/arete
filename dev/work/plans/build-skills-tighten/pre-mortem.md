## Pre-Mortem: BUILD Skills Tighten-Up

This plan touches the core development infrastructure — the skills, agent roles, and standards that every future PRD execution depends on. Getting it wrong means degrading the very system that builds everything else.

---

### Risk 1: Ship Resume Breaks on Phase Renumber (CRITICAL)

**Problem**: The current ship skill's build-log protocol is tightly coupled to its phase numbering (Phase 0.1, 0.2, 0.3, etc.). The build-log-protocol.md extraction (Step 2) and the worktree-first reordering (Step 16) will change phase numbers. Any in-progress `/ship` executions with existing build-logs will have stale phase references. The state verification in Phase 0.3 maps specific phases to expected artifacts — renumbering without updating this mapping means resume will report false mismatches.

**Mitigation**: 
1. Before starting Step 2, check `dev/executions/` for any build-logs with State != COMPLETE. If found, finish or archive them first.
2. When writing the new ship/SKILL.md, maintain a phase-number migration note at the top of build-log-protocol.md mapping old → new phase numbers.
3. Build-log-protocol.md's state verification should match on phase **names** (e.g., "Pre-Mortem"), not just numbers.

**Verification**: After Step 2, grep all build-log templates and verification scripts for hardcoded phase numbers. Ensure the verification logic uses phase names as the primary key.

---

### Risk 2: Editing Skills While Using Skills to Edit (CRITICAL)

**Problem**: This plan modifies execute-prd, ship, reviewer.md, orchestrator.md, developer.md, and the standards files. If we use the `/ship` or `/build` workflow to execute this plan, the agent will be following instructions from the very files it's modifying. Mid-execution, the agent could load a half-modified skill.

**Mitigation**:
1. Phase the execution so all references are updated in the same step as their targets. Step 11 (merge eng-lead) must update ALL references to engineering-lead in the same task.
2. Execute this plan with direct execution or manual orchestration rather than through the autonomous execute-prd loop, since execute-prd itself is being modified.
3. At minimum: complete Steps 1-4 (foundation) as a single atomic commit. Don't leave the system in a state where ship has been slimmed but execute-prd still references the old ship.

**Verification**: After each phase (A, B, C, D), run a grep for dangling references: `grep -r "engineering-lead" .pi/` should return 0 after Step 11. `grep -r "token estimate" .pi/skills/execute-prd/` should return 0 after Step 12.

---

### Risk 3: Shared References Become Dead Links (CRITICAL)

**Problem**: Step 1 creates 4 new shared reference files and updates 6+ skills to reference them. If a reference path is wrong, or a file gets moved later, agents silently skip the reference and lose critical guidance. Unlike inlined content (which is always present), references can break.

**Mitigation**:
1. After creating shared references, add them to the audit skill's manifest so they're checked periodically.
2. Use consistent paths from the repo root (`.pi/standards/X.md`), not relative to the referencing skill.
3. Add a verification step to `/wrap` or the audit skill: "Do all referenced .pi/standards/*.md files exist?"

**Verification**: After Step 1, run `grep -rh "\.pi/standards/" .pi/skills/ | sort -u` and verify every referenced path exists.

---

### Risk 4: Multi-Phase Ship Mode Is Under-Specified (HIGH)

**Problem**: Step 15 describes the meta-orchestrator pattern at a high level but key implementation details are thin: How does the meta-orchestrator create phase branches? What happens if a sub-orchestrator fails mid-phase? How are merge conflicts between phases handled?

**Mitigation**:
1. Don't implement multi-phase mode in the same execution as the ship slim-down. Step 2 (slim ship) and Step 15 (multi-phase) should be separate phases.
2. For the initial implementation, start minimal: 2-phase only, no parallel phases, linear dependency only.
3. Write the branch mechanics explicitly before implementation.

**Verification**: Before marking Step 15 complete, execute a real 2-phase build and verify: phase branch creation, phase merge, cross-phase context passing, and recovery from a simulated failure.

---

### Risk 5: Express Track Lets Issues Through (MEDIUM)

**Problem**: Step 10 introduces an Express track that skips pre-mortem and reviewer pre-work. The 95%+ success rate was achieved WITH these checks. Small work isn't inherently safer — phantom tasks and doc claims were caught on "small" changes.

**Mitigation**:
1. Express track MUST keep post-work code review.
2. Express track should still run the recon check (Step 13) — it's cheap and prevents the biggest waste.
3. Define a clear "escape hatch": if the reviewer finds something concerning, escalate to Standard retroactively.

**Verification**: After implementing Express, test it on a known-phantom scenario and verify the recon check catches it.

---

### Risk 6: Orchestrator.md Gets Too Large After Merging Engineering-Lead (MEDIUM)

**Problem**: Step 11 merges engineering-lead.md (213 lines) into orchestrator.md (233 lines). If done naively, orchestrator.md becomes 400+ lines.

**Mitigation**:
1. Only move the testing red-flags section (~30 lines). The rest is already in orchestrator.md in different words.
2. Actively prune overlapping sections during the merge.
3. Target: orchestrator.md under 260 lines after merge.

**Verification**: After Step 11, `wc -l .pi/agents/orchestrator.md` should be under 270 lines.

---

### Risk 7: Structured Signals Are Too Rigid or Too Loose (MEDIUM)

**Problem**: Step 12's 5 signal types may be too rigid (developers force-fit) or too loose (freeform after tags).

**Mitigation**:
1. Allow a brief freeform note AFTER the tag (one line).
2. Include `OTHER: [freeform]` as a catch-all. If OTHER appears >30%, categories need revision.
3. Make NOTHING_NOVEL the explicit expected default for simple tasks.

**Verification**: After the first PRD execution using signals, review the signal distribution.

---

### Risk 8: Worktree Guard Breaks Artifact Flow (MEDIUM)

**Problem**: Step 16 moves worktree creation to pre-flight. Plan artifacts (pre-mortem.md, review.md, prd.md) would be created in the worktree, not on main — invisible from the main repo until merge.

**Mitigation**:
1. Plan artifacts should be committed on current branch BEFORE creating the worktree. The worktree inherits them.
2. Revised flow: pre-flight checks → save plan + pre-mortem + review + PRD → commit → THEN create worktree → /build in worktree.
3. The guard's role: "don't let /build (code execution) happen on main." Planning artifacts on main is fine.

**Verification**: Trace the artifact creation flow: plan artifacts committed before worktree creation. Code artifacts only in worktree.

---

### Risk 9: Cross-Reference Breakage During Ship Slim-Down (MEDIUM)

**Problem**: Ship is referenced by AGENTS.md, APPEND_SYSTEM.md, plan-mode extension, ship/orchestrator.md, ship/templates/*, and memory entries. Slimming from 2363 to ~300 lines will change section headers and structure.

**Mitigation**:
1. Before starting Step 2, grep for all references to ship sections.
2. Maintain a reference map: old section → new section.
3. Update all references in the same commit as the ship slim-down.

**Verification**: After Step 2, grep and verify every reference points to a section that exists in the new ship/SKILL.md.

---

## Summary

| Risk | Severity | Category |
|------|----------|----------|
| 1. Ship resume breaks on phase renumber | CRITICAL | State Tracking |
| 2. Editing skills while using them | CRITICAL | Dependencies |
| 3. Shared references become dead links | CRITICAL | Integration |
| 4. Multi-phase mode under-specified | HIGH | Scope |
| 5. Express track lets issues through | MEDIUM | Code Quality |
| 6. Orchestrator.md bloat after merge | MEDIUM | Scope Creep |
| 7. Structured signals too rigid/loose | MEDIUM | Code Quality |
| 8. Worktree guard breaks artifact flow | MEDIUM | Integration |
| 9. Cross-reference breakage during slim-down | MEDIUM | Dependencies |

**Total risks identified**: 9 (3 CRITICAL, 1 HIGH, 5 MEDIUM)
