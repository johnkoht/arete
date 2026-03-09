# Review: Meeting Triage Plan

**Type**: Plan (pre-execution)
**Audience**: User (GUIDE MODE — PMs using Areté workspaces)
**Reviewer**: Engineering Lead perspective
**Date**: 2026-03-04

---

## Concerns

1. **[Scope] "Reprocess" is underspecified and high-risk**
   - The plan scopes "Reprocess" to people resolution only (CLI-backed) — this is correct and the pre-mortem flags it. But the UI still needs to communicate clearly to the user *why* content reprocessing isn't there. If a user clicks "Reprocess" expecting their AI summary to refresh and gets a people-resolution spinner, they'll be confused.
   - Suggestion: Label the v1 action explicitly as **"Re-resolve People"** in the UI, not "Reprocess." Reserve "Reprocess" for when content reprocessing lands. Makes the limitation obvious without feeling like a bug.

2. **[Scope] process-meetings skill change needs its own task**
   - The plan touches the skill behavior as a side-note in Task 1/2. But this is a cross-cutting change affecting all Areté users. It needs its own explicit task with clear acceptance criteria: what the SKILL.md says before and after, what `--stage` does, what the default behavior is, and backward compat test.
   - Suggestion: Make "Update process-meetings SKILL.md" its own numbered task with ACs.

3. **[Dependencies] Task ordering — server before client before CLI**
   - The API contract (endpoint shape, request/response types) must be locked before client implementation begins. If a subagent starts the client while another is still designing server endpoints, you'll get mismatches that require rework.
   - Suggestion: Tasks should be strictly ordered: (1) Data model + core changes → (2) Server + API → (3) Client → (4) CLI command. No parallel execution of server and client tasks.

4. **[Test Coverage] Client test strategy is undefined**
   - The plan introduces React + Vite with no existing test pattern in the repo for UI components. Vitest + Testing Library is the right choice but it needs to be set up intentionally. Without this, the client will ship untested.
   - Suggestion: The server scaffold task should include setting up the client test harness (Vitest config, one smoke test) as an acceptance criterion. Don't defer this to "later."

5. **[Integration] Bulk approve endpoint touches memory files — no rollback**
   - `POST /api/meetings/:slug/approve` commits approved decisions/learnings to `.arete/memory/items/decisions.md` and `learnings.md`, removes staged sections, and sets `status: approved` — all in one shot. If the memory write succeeds but the frontmatter update fails (crash, disk error), the meeting is stuck in a half-approved state.
   - Suggestion: Design the approve operation as staged writes: write to memory first (idempotent append), then update the meeting file status last. If status update fails, the user can re-run approve (memory appends are idempotent — duplicates are acceptable over data loss). Document this in the server implementation notes.

6. **[Platform] `arete view` port management**
   - The plan mentions "handle port conflicts" but doesn't specify the strategy. If the server is already running and the user runs `arete view` again, what happens?
   - Suggestion: Try port 3847 (fixed default), if busy try 3848, 3849 (up to 3 attempts), then error with a clear message. Also print the URL on startup so users can navigate directly without waiting for the browser to open.

---

## Strengths

- **Right scope for v1.** The plan resists scope creep well — projects, people, full editor all deferred. Meeting triage is a single, complete workflow.
- **ID-based item tracking** is the right call. Index-based would be fragile given that these files are edited externally (Cursor, Claude, terminal).
- **Status stored in frontmatter, text in body** — clean separation. The body stays human-readable; the machine-readable state lives in frontmatter.
- **Shells out to existing CLI** for sync and people processing — no business logic duplication. The viewer is a thin orchestration layer, not a reimplementation.
- **Pre-mortem identified the AI/CLI distinction** before implementation. This would have been a painful mid-task discovery.
- **Foundation-first architecture** (packages/viewer, arete view) sets up the larger workspace UI cleanly. Each future view (projects, people) is just another route.

---

## Devil's Advocate

**If this fails, it will be because...** the staged item format and the parser drift apart during implementation. The SKILL.md defines what the AI writes; the server defines what it parses. These are developed by different subagents in different tasks with no compile-time contract between them. The AI might write `## Staged Action Items` and the parser might look for `## Staged Actions`. The test suite passes (each piece works in isolation) but the end-to-end flow produces an empty triage panel. The user sees "No items to review" on every processed meeting.

**The worst outcome would be...** the process-meetings skill change ships without the `--commit` backward compat flag, and existing Areté users find that their decisions and learnings are no longer written to memory after running the skill. They run process-meetings, nothing appears in `.arete/memory/items/`, and their institutional memory workflow is silently broken. No error — just missing data. This is harder to detect than a crash and could cause data loss (users don't realize items are staged, not committed).

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended before PRD
- [ ] **Revise** — Address concerns before proceeding

**Before converting to PRD, address:**
1. Rename "Reprocess" → "Re-resolve People" in the plan (prevents UX confusion)
2. Add explicit task for process-meetings skill update with backward compat ACs
3. Lock task ordering: model → server → client → CLI (strict sequential)
4. Add client test harness setup to server scaffold task ACs
5. Document idempotent approve strategy (memory write first, status update last)
