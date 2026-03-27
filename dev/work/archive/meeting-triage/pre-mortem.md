# Pre-Mortem: Meeting Triage

**Work**: New `packages/viewer` (local web app) + `process-meetings` skill behavior change + `arete view` CLI command.
**Size**: Large (6-7 tasks, new package, cross-cutting skill change)
**Date**: 2026-03-04

---

### Risk 1: Staged Item Parsing Fragility

**Problem**: The process-meetings skill (AI-driven) writes `## Staged Action Items`, `## Staged Decisions`, `## Staged Learnings` sections in markdown. The Hono server parses these sections to build the triage UI. If the AI writes the sections with even minor variations (spacing, heading level, ID format, missing prefix), the parser silently produces empty or malformed data. The user sees no staged items even though the meeting says `status: processed`.

**Mitigation**:
- Define the exact output format in `process-meetings` SKILL.md with a canonical example that subagents must copy verbatim
- Build the parser defensively: accept minor variations (heading level 2 or 3, trailing whitespace, missing checkbox brackets)
- Add a fallback: if a `## Staged *` section is found but no IDs are parsed, surface a warning in the UI ("Items could not be parsed — open the file and check formatting")
- Write thorough unit tests for the staged item parser covering variations

**Verification**: Parser tests cover at least 5 format variations. UI has a fallback error state for unparseable staged sections.

---

### Risk 2: AI Processing Cannot Be Shelled Out

**Problem**: The "Reprocess" button concept implies regenerating summary, decisions, learnings, and action items from the transcript. But this requires an LLM (the process-meetings skill runs in an agent session). You cannot shell out to a simple CLI command to do this. If the implementation attempts to shell out to `arete process-meetings` expecting content generation, it will fail — that command doesn't exist as a deterministic CLI call. Only people resolution (`arete meeting process --file`) is CLI-accessible.

**Mitigation**:
- Explicitly scope v1: the UI exposes **"Process People"** (shells out to `arete meeting process --file --json` — existing, tested CLI command) and defers **"Reprocess Content"** to v2
- In the UI, the Reprocess button is labeled "Process People" in v1; content reprocessing is visible but disabled with "Coming in v2"
- Document this distinction clearly in the PRD acceptance criteria so no subagent attempts to implement content reprocessing

**Verification**: PRD acceptance criteria explicitly state "Reprocess = people resolution only (CLI-backed)". No AI session spawning in the viewer server.

---

### Risk 3: New Tooling in packages/viewer (React + Vite)

**Problem**: The existing Areté stack is Node.js + TypeScript (NodeNext, no bundler beyond tsc). `packages/viewer/client/` introduces React + Vite — an entirely new build pipeline, different tsconfig requirements (bundler mode vs NodeNext), and different test tooling (Vitest vs node:test). This risks: tsconfig conflicts across the workspace, npm workspace dependency conflicts, build scripts that break existing `npm run typecheck` and `npm test` gates, and an underspecified client test strategy.

**Mitigation**:
- Read `tsconfig.base.json`, root `package.json` (workspaces config), and existing `packages/*/tsconfig.json` before scaffolding the viewer package
- The viewer client gets its own isolated `tsconfig.json` (Vite/bundler mode) that does NOT extend tsconfig.base.json — complete isolation
- The viewer server (Hono) uses NodeNext + extends tsconfig.base.json like other packages
- Client tests use Vitest (co-located with Vite) — NOT included in the root `npm test` command to avoid conflicts; separate `npm run test:viewer` script
- Update `dev/catalog/capabilities.json` after introducing React + Vite

**Verification**: `npm run typecheck` and `npm test` at root still pass after viewer package is added. Client tests run separately via `npm run test:viewer`.

---

### Risk 4: Sync is Long-Running and Blocking

**Problem**: `arete pull krisp` fetches from an external API and can take 10-30+ seconds. If the server implements `POST /api/meetings/sync` as a synchronous endpoint, the HTTP request times out and the UI receives no feedback. The user clicks Sync, nothing happens, and the meetings list doesn't update.

**Mitigation**:
- `POST /api/meetings/sync` returns `202 Accepted` with a job ID immediately, then runs the sync in the background (child_process with stdout/stderr buffering)
- `GET /api/jobs/:id` → client polls every 2s for `{ status: 'running' | 'done' | 'error', output?: string }`
- UI shows a spinner + "Syncing..." state during polling; shows success/error toast on completion
- Timeout: if job takes > 60s, mark as error

**Verification**: Sync button shows loading state; meeting list refreshes automatically after sync completes.

---

### Risk 5: Concurrent Write Race Conditions

**Problem**: The user has a meeting file open in Cursor or Claude at the same time as the viewer UI. A per-item PATCH writes to `staged_item_status` in frontmatter while an external editor is mid-save. The last write wins and silently loses changes. Worse, if two PATCH requests arrive in quick succession (double-click), the second reads the pre-first-write state and overwrites the first update.

**Mitigation**:
- All file writes go through a per-file async mutex in the server (e.g. using a simple in-memory Map of filename → Promise chain)
- Include a `lastModified` timestamp in `GET /api/meetings/:slug` response; `PATCH` and `PUT` accept an optional `If-Match: <lastModified>` header; return 409 if file changed since last read
- UI reads the updated file state after each successful PATCH (server returns the updated meeting object)

**Verification**: Two rapid PATCHes to the same item result in both being applied correctly. 409 response is handled gracefully in the UI.

---

### Risk 6: process-meetings Skill Change Breaks Existing Users

**Problem**: Changing process-meetings to stage items instead of committing them to memory is a behavioral breaking change for every Areté user. Users who currently rely on running the skill from an agent conversation and immediately having decisions in `.arete/memory/items/` will find their workflow broken — items are staged in the meeting file but never committed if they don't use the UI.

**Mitigation**:
- Add a `--commit` flag to the SKILL.md: when invoked with `--commit` (or when no UI is available), the skill commits directly to memory (preserves old behavior)
- Default behavior switches to staging only after `arete view` confirms the viewer is installed
- Better yet for v1: keep default as **commit** (old behavior); add a separate `--stage` flag for the new behavior; the viewer server uses `--stage` when triggering reprocessing
- Document the flag in the skill's "Arguments" section

**Verification**: Running `process-meetings` without flags still commits to memory (backward compat). Running with `--stage` produces staged sections in the meeting file.

---

### Risk 7: ID Stability Across External Edits

**Problem**: Staged item IDs (`si_ai_a1b2`) are written into the markdown body by the AI. If a user or another agent edits the body of the meeting file (e.g., fixes a typo in a staged action item), the ID prefix might get removed or the line reformatted. The status map in frontmatter (`staged_item_status: { si_ai_a1b2: approved }`) then references a stale ID that no longer exists in the body, causing ghost approvals or lost state.

**Mitigation**:
- Parser is resilient: if an ID in `staged_item_status` doesn't match any parsed body item, it's ignored (not an error)
- The UI shows a warning banner if staged_item_status has entries with no matching body items ("Some item statuses are stale — you may need to re-review")
- In SKILL.md, explicitly instruct: "Do not edit staged item IDs after writing them"

**Verification**: Parser gracefully handles missing IDs. UI shows warning when status-body mismatch detected.

---

## Summary

**Total risks identified**: 7
**Categories covered**: Integration, Scope, Platform Issues, State Tracking, Code Quality, Dependencies, Context Gaps

**Highest priority risks**: 2 (AI can't be shelled out — scope correctness), 1 (parser fragility — silent data loss), 6 (skill behavior change — backward compat)

**Ready to proceed with these mitigations applied?**
