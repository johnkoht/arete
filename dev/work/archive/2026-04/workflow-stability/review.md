## Review: Workflow Stability & Versioning

**Type**: Plan  
**Audience**: Builder (internal tooling for Areté development)
**Reviewed**: 2026-03-27

### Concerns

1. **Scope — Too Large for Single Ship**
   - 7 steps spanning: UI changes, gate enforcement, status transitions, folder restructuring, migration, new agent, new command
   - This is really 2-3 PRDs worth of work
   - **Suggestion**: Split into phases:
     - **Phase 1** (visibility): Steps 1, 2, 3 — `/plan list` improvements + gates + auto-transitions
     - **Phase 2** (structure): Steps 4, 5 — archive + backlog migration
     - **Phase 3** (release): Steps 6, 7 — gitboss + `/release`
   - Each phase delivers standalone value and can be shipped independently

2. **Path Hardcoding — Archive Breaks Ship Skill**
   - Ship skill has `dev/work/plans/{slug}/` hardcoded in ~20 places
   - If Step 4 archives a plan mid-worktree-build, the worktree still references the old path
   - Pre-mortem didn't catch this
   - **Suggestion**: Archive should only happen AFTER worktree cleanup. Add check: "Is there an active worktree for this plan?" before archiving. Or: ship skill should resolve plan path at start and pass it through, not rely on convention.

3. **Completeness — 14-Day Cleanup Trigger Missing**
   - Step 4 says "Keep last 14 days of complete in main folder before archiving"
   - But doesn't specify: Who/what triggers the archive? Manual? Scheduled? On next `/plan list`?
   - **Suggestion**: Either (a) archive immediately on complete, or (b) define explicit trigger (`/plan cleanup` or automatic on list)

4. **Completeness — Gitboss Context Handoff**
   - Step 6 says gitboss is "invoked at end of /ship Phase 5.6"
   - But doesn't specify what context gitboss receives: plan slug? branch name? diff summary?
   - **Suggestion**: Define the handoff: `@gitboss merge --plan {slug} --branch feature/{slug}`

5. **Completeness — CHANGELOG Format**
   - Step 7 says `/release` updates CHANGELOG but doesn't specify format
   - Keep-a-changelog? Conventional commits? Custom?
   - **Suggestion**: Specify format or say "follow existing CHANGELOG.md format"

6. **Dependencies — Step 6 Before Step 7?**
   - Plan says "Step 6 depends on Step 7 (gitboss needs `/release`)"
   - But gitboss CAN be implemented first with just "call /release when appropriate" — the command can be stubbed
   - Or: implement `/release` first, then gitboss
   - **Suggestion**: Clarify order: `/release` (Step 7) before gitboss (Step 6)

7. **Backward Compatibility — `/plan list` Default Change**
   - Current default shows all plans
   - New default shows only active (building/planned/complete-recent)
   - Could surprise existing users who expect to see their ideas
   - **Suggestion**: Add output footer: `Showing active plans. Use --backlog to see 34 ideas.`

### Strengths

- Pre-mortem is thorough (8 risks with concrete mitigations)
- Clear acceptance criteria for each step
- Explicit out-of-scope section prevents creep
- Dependencies between steps are documented
- Migration has dry-run mode — good safety

### Devil's Advocate

**If this fails, it will be because...** the ship skill integration (Step 3) introduces a subtle bug in status transitions. Ship is 2000+ lines with complex state, and "add status update calls at existing transition points" sounds simple but those transition points are spread across 6 phases. One missed transition = plan stuck in wrong state forever. The pre-mortem says "hooks/callbacks, not inline changes" but the plan says "use existing updatePlanFrontmatter() at transition points" — that IS inline changes.

**The worst outcome would be...** a shipped build that corrupts plan state. Imagine: `/ship` runs, build succeeds, merge happens, but status update fails silently. Plan stays `building` forever. Next person tries to `/ship` the same plan — it's "already building". Now you have orphaned worktrees, duplicate branches, and confused state. This is recoverable but embarrassing and erodes trust in the workflow.

### Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Split into phases, address path hardcoding concern
- [ ] **Revise** — Address concerns before proceeding

**Recommendation**: This is good work. The phasing suggestion isn't blocking — you could ship all 7 steps as one PRD — but Phase 1 alone (steps 1-3) would deliver 80% of the value with 40% of the risk. Your call on appetite.
