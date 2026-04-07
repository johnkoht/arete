## Review: BUILD Skills Tighten-Up

**Type**: Plan
**Audience**: Builder (BUILD-only)
**Review Path**: Full
**Complexity**: Large (16 steps, 15+ files touched, multiple architectural decisions)

---

### Checklist Results

| Concern | Verdict | Notes |
|---------|---------|-------|
| **Audience** | PASS | Clearly BUILD-only. All files are in `.pi/`, `dev/`, agent definitions. No user-facing changes. |
| **Scope** | CONCERN | 16 steps is ambitious. Steps 15 (multi-phase meta-orchestrator) and 10 (complexity routing) are each medium-sized plans on their own. The plan acknowledges this with phased execution, but the scope is still very large for a single plan. |
| **Risks** | PASS | Pre-mortem covers 9 risks (2 CRITICAL, 2 HIGH, 5 MEDIUM). The identified risks are the right ones. Additional concerns below. |
| **Dependencies** | CONCERN | Step 10 (complexity routing) depends on Step 2 (slim ship) and Step 4 (boundary clarity), but is placed in Phase B alongside Steps 5-8 which are independent. The dependency narrative within Phase B could be clearer. |
| **Patterns** | PASS | Follows existing patterns. Shared references follow the `.pi/standards/` convention. No unnecessary novelty. |
| **Backward compatibility** | CONCERN | The plan says "no behavioral change" for several steps, but Step 10 (Express track) and Step 15 (multi-phase) are significant behavioral additions. Step 12 (structured signals) changes what developers produce. These are new behaviors, not just reorganization. |
| **Completeness** | CONCERN | See prd.json handling for multi-phase mode below. |
| **Test coverage** | PASS (with caveat) | Documentation/skill-file work. The plan includes grep-based verification commands for each step, which is the appropriate equivalent. |
| **Quality gates** | PASS | Each step has grep verification or line-count checks. Phase-level verification commands defined. |

---

### AC Validation Issues

| Step | AC | Issue | Suggested Fix |
|------|-----|-------|---------------|
| 1 | "Each shared reference exists with clear content" | Vague — "clear content" is subjective | "Each shared reference exists and contains the canonical definition extracted from its source skill(s)" |
| 2 | "Agent can still execute the full ship workflow by following skill references" | Not independently verifiable without running a ship execution | "Dry-run: read slimmed ship/SKILL.md and verify every phase references an existing skill or command with a concrete invocation" |
| 3 | "Existing plan-to-prd references in other skills still work" | Vague — what does "still work" mean? | "All files referencing `plan-to-prd` or `prd-to-json` point to valid skill paths; `grep -r 'prd-to-json' .pi/skills/` shows only the standalone converter" |
| 4 | "No behavioral change — just clarity" | Untestable as stated | Remove this AC. The other ACs are sufficient and testable. |
| 8 | "No behavioral change when tools are available" | Same anti-pattern | "When subagent tool is available, audit dispatches experts per the existing domain table (no change to dispatch logic)" |
| 10 | "Express track defined (developer + reviewer, no artifacts, no worktree)" | Multiple concerns bundled | Split: "Express skips worktree creation" / "Express creates no plan artifacts on disk" / "Express dispatches developer then reviewer" |
| 14 | Missing resume handling | What if working-memory.md already exists? | Add: "If working-memory.md already exists (resume), append to it rather than overwriting" |
| 15 | "Verified with a real 2-phase test build before marking complete" | Verification method, not criterion | Reframe: "A 2-phase test build completes: phase-1 branch created, merged to project branch; phase-2 reads phase-1 outputs; final merge succeeds" |

---

### Strengths

1. **Evidence-driven**. Every change cites specific PRD dates, memory entries, and learnings data. Grounded in 51 PRD executions and 23 LEARNINGS files.

2. **Pre-mortem integration is excellent**. Each step explicitly references which risks apply and includes specific mitigations inline.

3. **Ship slim-down rationale is compelling**. The phase-by-phase transformation table makes the 2363-to-300 reduction concrete and verifiable.

4. **Execution strategy acknowledges the self-referential risk**. Explicitly says not to use `/ship` to execute itself.

5. **Recon phase (Step 13) codifies the most documented waste pattern**. Three independent data points, high-ROI addition.

6. **Working memory (Step 14) addresses a real bottleneck**. Orchestrator-as-bottleneck for cross-task knowledge is a genuine limitation.

---

### Devil's Advocate

**"If this fails, it will be because..."** the plan tries to do too much in one pass. 16 steps across 4 phases is large. The ship slim-down alone is a medium-sized plan. Multi-phase meta-orchestration is a medium-sized plan. Complexity routing with three tracks is a small plan. Bundling all three means a failure in any one blocks the others, execution time will be long (multiple sessions), and context will be lost between phases.

**"The worst outcome would be..."** executing Phase A (foundation), partially executing Phase B, and stopping. The system would be hybrid: ship is slimmed, shared references exist, but process improvements are half-implemented. An agent loading the slimmed ship would find references to complexity routing that doesn't exist yet, or signal formats that developer.md doesn't match.

**"The assumption most likely to be wrong is..."** that agents reliably follow shared reference links. The plan hinges on this: ship shrinks from 2363 to 300 lines by replacing inline content with "see .pi/standards/X.md" pointers. An agent invoking `/pre-mortem` gets the full skill loaded automatically. An agent told "see .pi/standards/ac-rubric.md" must choose to read that file. If agents skip these reads even 20% of the time, quality gates degrade silently. Risk 3 should be CRITICAL, not HIGH.

**Additional unidentified risk: prd.json handling for multi-phase.** Step 15 says sub-orchestrators work from briefings, not PRDs. But execute-prd (which IS `/build`) depends on prd.json for task statuses, commit SHAs, progress tracking, and recon checks. If a sub-orchestrator runs `/build` without a prd.json, execute-prd's Phase 0 will fail. Does the meta-orchestrator create a prd.json for each phase briefing, or does execute-prd need a "briefing mode"?

---

### Verdict

**Approve with suggestions** — The plan is thorough, evidence-driven, and well-structured with strong pre-mortem integration. The concerns are real but addressable without fundamental redesign.

---

### Suggested Changes

**Change 1: Consider splitting into two plans** (Scope)
- Plan A (Steps 1-9, 11-13): Refactoring and process improvements — pure tightening
- Plan B (Steps 10, 14-16): New capabilities — routing, working memory, multi-phase, worktree guard
- Reduces blast radius. Plan A ships and stabilizes before Plan B begins.

**Change 2: Elevate Risk 3 (dead links) to CRITICAL** (Risk Assessment)
- The entire ship slim-down depends on agents reading shared references. If they don't, quality degrades silently.
- In Step 1, add AC: "Every skill that references a shared standard includes the file in its 'Read These Files First' list, not just a prose mention."

**Change 3: Specify prd.json handling for multi-phase mode** (Completeness)
- Add to Step 15: "The meta-orchestrator generates a prd.json for each phase from the briefing. This preserves execute-prd's state tracking unchanged."

**Change 4: Fix weak ACs** (AC Quality)
- Apply the specific fixes from the AC Validation Issues table above.

**Change 5: Add inter-phase consistency check** (Quality Gate)
- After each phase: "Load ship/SKILL.md, execute-prd/SKILL.md, and orchestrator.md. Verify every referenced skill/agent/standard exists at the referenced path."
