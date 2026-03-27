# Review: Refactor Subagents PRD

**Type**: PRD (pre-implementation)
**Audience**: Builder (internal build tooling)
**Reviewed artifacts**:
- `dev/plans/refactor-subagents/plan.md`
- `dev/prds/refactor-subagents/prd.md`
- `dev/plans/refactor-subagents/prd.json`
- `dev/plans/refactor-subagents/pre-mortem.md`
- `dev/prds/refactor-subagents/EXECUTE.md`

---

## Concerns

### 1. **Dual Skill Locations — `.pi/skills/` vs `.agents/skills/`**

Both `.pi/skills/execute-prd/SKILL.md` and `.agents/skills/execute-prd/SKILL.md` exist with identical content. The PRD Task 2 mentions "verify it's the same file via symlink" but doesn't require resolving this definitively.

If these are independent copies (not symlinks), editing one leaves the other stale. Since `.pi/skills/` is what Pi loads and `.agents/skills/` is what the AGENTS.md skill index references, a mismatch means the skill docs say one thing and the runtime does another.

**Suggestion**: Task 2 AC should explicitly require: "Verify `.pi/skills/execute-prd/SKILL.md` and `.agents/skills/execute-prd/SKILL.md` are either the same file (symlink) or both updated. If independent copies, update both. Add a verification step: `diff .pi/skills/execute-prd/SKILL.md .agents/skills/execute-prd/SKILL.md` must show no differences." Apply the same check for all 5 skills being modified in Task 4.

### 2. **AGENTS.md Sources Reference `dev/autonomous/`**

`.agents/sources/builder/conventions.md` line 91 references `dev/autonomous/templates/PRE-MORTEM-TEMPLATE.md`. This is a static template reference (acceptable for V1 per the plan), but it's in the AGENTS.md sources — which means it gets compiled into AGENTS.md. If AGENTS.md is the always-loaded context for agents, it'll continue pointing agents to `dev/autonomous/`.

Task 6 says "If `.agents/sources/` files reference `dev/autonomous/` execution paths, update them" — but the distinction between "execution path" and "template path" is ambiguous. An agent reading AGENTS.md might not know that `dev/autonomous/templates/` is acceptable but `dev/autonomous/prd.json` is not.

**Suggestion**: Task 6 should explicitly check `.agents/sources/` and note any `dev/autonomous/` references, even template ones, with a TODO comment for Phase 2. This prevents agents from following stale breadcrumbs.

### 3. **prd.json Task Count Mismatch**

The `prd.json` has 6 tasks (tasks 1-6), but the PRD markdown (`prd.md`) documents 7 tasks (including Task 7: E2E Validation). The EXECUTE.md handoff notes that Task 7 is builder-driven. This is fine conceptually, but the task numbering is inconsistent:

- `prd.md` numbers them Tasks 1-7
- `prd.json` includes tasks 1-6 with no Task 7
- `metadata.totalTasks: 6`

An orchestrator executing from `prd.json` will see 6 tasks and report "6/6 complete" — but the PRD says there are 7. This creates confusion in the completion report.

**Suggestion**: Either (a) remove Task 7 from `prd.md` and move it to a "Post-Execution Checklist" section, or (b) include Task 7 in `prd.json` with a note that it's builder-driven and should be marked complete manually. Option (a) is cleaner.

### 4. **Bootstrap Chicken-and-Egg**

The EXECUTE.md handoff says this PRD will be executed using the CURRENT system (before the refactor). But the current execute-prd skill references Cursor's Task tool and `dev/autonomous/prd.json`. The prd.json for this PRD lives at `dev/plans/refactor-subagents/prd.json` — which the current skill doesn't know to look for.

This means the orchestrator executing this PRD needs to be told explicitly: "Read prd.json from `dev/plans/refactor-subagents/prd.json`, not from `dev/autonomous/prd.json`." The handoff prompt mentions this, but the current execute-prd skill's Phase 0 hardcodes the path.

**Suggestion**: The handoff prompt in EXECUTE.md should explicitly state: "Override the default prd.json location. The task list is at `dev/plans/refactor-subagents/prd.json` (not the default `dev/autonomous/prd.json`)." This is already partially there but could be more prominent.

### 5. **No Rollback Plan**

The PRD has no rollback strategy. If the refactored system doesn't work (E2E validation fails), what's the recovery path? Since the old files are deprecated but not deleted, rollback would mean reverting the skill changes. But there's no explicit "if Task 7 fails, revert Tasks 2-6" instruction.

**Suggestion**: Add a "Rollback" section to the PRD: "If E2E validation (Task 7) fails, revert changes to skill files and agent definitions. The deprecated legacy system remains functional. Use `git diff` on the affected .md files to identify and revert changes."

### 6. **`dev/prds/` vs `dev/plans/` — Two Locations for PRD Artifacts**

The PRD markdown lives at `dev/prds/refactor-subagents/prd.md` but the prd.json lives at `dev/plans/refactor-subagents/prd.json`. The plan's new convention says planning artifacts go in `dev/plans/<slug>/`. Having both `dev/prds/` and `dev/plans/` for the same feature is confusing.

The `plan-to-prd` skill currently creates PRDs in `dev/prds/`. The plan says `prd-to-json` should output to `dev/plans/<slug>/`. So after the refactor, PRD markdown goes to `dev/prds/` and JSON goes to `dev/plans/`? Or should both go to `dev/plans/`?

**Suggestion**: Clarify the canonical location. The simplest option: both `prd.md` and `prd.json` live in `dev/plans/<slug>/`. Update Task 4 to also change `plan-to-prd` to output `prd.md` to `dev/plans/<slug>/prd.md` instead of `dev/prds/`. Alternatively, accept the split and document it clearly.

---

## Strengths

- **Thorough pre-mortem**: 8 risks with concrete mitigations and verification criteria. The grep-verification gates (Risks 2, 6) are particularly strong — they turn "did we update everything?" from a hope into a checkable assertion.
- **Well-scoped Phase 1**: Explicitly deferring concurrent runs, rate-limit handling, and legacy removal to Phase 2 keeps this focused. The decision to make V1 skill-instruction-driven (not a TypeScript engine) is pragmatic.
- **Pre-mortem mitigations baked into tasks**: Each task lists which pre-mortem risks it addresses. This is exactly how pre-mortems should work — the mitigations aren't separate documents, they're embedded in the work.
- **Dependency graph is clean**: Tasks 2+3 parallel → Task 4 → Task 5 → Task 6 → Task 7 is a natural flow with clear gates.
- **Bootstrap awareness**: The EXECUTE.md correctly notes that this PRD uses the old system to build the new system. This avoids the "use the thing we're building to build the thing" trap.

---

## Devil's Advocate

**If this fails, it will be because...** the execute-prd skill rewrite (Task 2) is too large. It's a 600-line markdown file being substantially rewritten — changing dispatch mechanism, state paths, prompt templates, AND adding new sections. In my experience, large-file rewrites are where quality drops: something gets missed in the middle, a section references the old path, or the new prompt template doesn't actually work when an orchestrator tries to follow it. The file is too big to review atomically. 

*Counter-mitigation*: The grep verification in Task 6 catches stale paths. But it won't catch *behavioral* issues like "the prompt template is confusing and the orchestrator doesn't follow it correctly." That's what Task 7 (E2E) is for — but if the rewrite introduces subtle prompt issues, Task 7 will surface them as vague failures that are hard to debug.

**The worst outcome would be...** the new system appears to work in Task 7's simple test but fails on a real, complex PRD (10+ tasks with dependencies). The E2E validation uses a 2-3 task toy PRD, which may not exercise chain mode, iteration loops, or the orchestrator's ability to maintain state across many tasks. The first real use of the new system — on an actual feature PRD — becomes the true validation, and if it fails there, you've lost the old system's muscle memory without the new system being battle-tested.

*Counter-consideration*: The old system isn't deleted, so you can always fall back. And the first real PRD will be closely watched. This risk is acceptable if the builder is aware of it.

---

## Verdict

- [ ] Approve — Ready to proceed
- [x] **Approve with suggestions** — Address concerns 1, 3, and 6 before execution; rest are advisory

**Critical (address before execution)**:
1. **Concern 1** (dual skill locations): Add explicit dual-file verification to Tasks 2 and 4
3. **Concern 3** (task count mismatch): Move Task 7 to a post-execution checklist in `prd.md`
6. **Concern 6** (prd vs plans directory): Decide on canonical location and make it consistent

**Advisory (nice to have)**:
2. Concern 2 (AGENTS.md sources): Low risk, addressable in Phase 2
4. Concern 4 (bootstrap): Already partially addressed in EXECUTE.md
5. Concern 5 (rollback): Good practice but low risk given old system isn't deleted
