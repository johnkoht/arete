# PRD: Project-Agent Meeting-Agenda Prep — grounded fan-out

> Derived from `plan.md` (approved 2026-06-22), `pre-mortem.md`, and `review.md` (Approve with suggestions, no structural blockers). The review's five binding ACs are the correctness contract and appear as acceptance criteria below.
> Audience: **User** — ships to `packages/runtime/profiles/` + `packages/runtime/skills/`; runs in the end-user harness.

## Goal

Give meeting-agenda prep the reliability of `/project` by extracting a reusable **project-agent disposition** (load-full-body + ground-claims-live + flag-supersession) into a single shipped profile, consumed two ways: **adopt** (`/project` interactive) and **spawn** (agenda-prep fans out one grounding agent per unique project, then synthesizes agendas from grounded bundles). v1 is markdown-dominant (profile + skill/guide prose); the WS-5 disk cache is deferred (see Task 5).

## Scope decisions locked at the gates

- **Cache deferred** (review Concern 1): mtime-keyed caching of live-Jira facts reintroduces the stale-ticket bug. No latency problem exists. Document the correct design for later; do not build now.
- **Harness-agnostic spawn** (Concern 2): profile is pure disposition prose with zero tool names; the skill owns orchestration verbs and degrades to inline when no subagent tool exists.
- **Conditional F3** (Concern 3): the F3 batch rule + AC1 gate relax ONLY while subagent isolation holds; inline/degraded runs re-arm both.
- **Single-source bundle schema** (Concern 4): defined once in `project-agent.md`; referenced by pointer everywhere else.
- **Additive read-only grounding for `/project`** (Concern 5): live Jira reads are verification, never writes; on-when-working; OFF on a bare `arete project open`.

## Tasks

### Task 1 (WS-A) — Author the project-agent disposition + grounded-bundle schema

Create `packages/runtime/profiles/project-agent.md` matching the format of the sibling profiles (`pm-orchestrator.md`, `pm-advisor.md`, `plan-reviewer.md`): frontmatter `name` + `description`, then prose body ("How You Think", "Your Voice", "Decision Heuristics" or equivalent). The body defines the disposition: load the full project body via `arete project open <slug>` / `arete plan-context --project <slug>`; verify ticket/owner/decision claims against the live source (the harness's Atlassian/Jira capability) before asserting; flag superseded decisions (flag-not-resolve). Include a **live-grounding mode** distinction: always-on for agenda-prep spawns; on-when-working for `/project`, OFF on a bare open. Define the **grounded-bundle schema EXACTLY ONCE** here (this file is the single source): `slug`, `area`, `decisions[]` (each with `superseded?` flag + conflict note), `tickets[]` (`{key, title, status, owner, verifiedAt}`, verified live), `openQuestions[]`, `whatsNew`, `commitments[]` (open, with verified IDs), `provenance` per item (`published`/`reference`/`draft`/`jira-live`).

**Acceptance Criteria**:
- File exists at `packages/runtime/profiles/project-agent.md` (NOT repo root, NOT `.pi/`) with valid frontmatter `name: project-agent` + `description`. <!-- pre-mortem Risk 6 -->
- Body matches the sibling-profile prose structure and reads as disposition, not procedure.
- The grounded-bundle schema is defined once here with all fields above, including `decisions[].superseded?` (flag-only; no resolution logic). <!-- Concern 4, Risk 8 -->
- Live-grounding mode is documented: always-on (spawn), on-when-working (`/project`), off on bare open. <!-- Concern 5 -->
- `grep -nE 'subagent\(|agentScope|\.pi/|Task\(' packages/runtime/profiles/project-agent.md` returns nothing — zero harness/tool coupling. <!-- Concern 2 -->
- Markdown is soft-wrapped (one line per paragraph), per builder preference.

### Task 2 (WS-B + WS-C) — Wire spawn-mode orchestration into prepare-meeting-agenda

Edit `packages/runtime/skills/prepare-meeting-agenda/SKILL.md` to add the grounded fan-out pipeline as a new batch/multi-project path that augments (never replaces) the existing `arete agenda scaffold` gate: (1) resolve which projects each meeting touches deterministically (reuse area→project + `--project` pin); (2) **dedup to the unique project set across the whole batch**; (3) fan out one grounding agent per unique project (adopt the `project-agent.md` disposition, live-grounding ON, passing the meeting title/attendees as the relevance query) — "use your subagent/Task capability… if none is available, adopt the disposition inline and ground sequentially"; (4) synthesize each agenda from the existing scaffold signal + the relevant grounded bundle(s). Make the F3 relaxation conditional.

**Acceptance Criteria**:
- New pipeline is additive: the `arete agenda scaffold` step-4 gate and the existing curate/frame flow remain intact; grounded bundles are a NEW synthesis input. <!-- plan: synthesis augments scaffold -->
- Spawn instruction is harness-agnostic with an explicit inline-degradation fallback; no tool names. `grep -nE 'subagent\(|agentScope|\.pi/|Task\('` over the file returns nothing. <!-- Concern 2 -->
- Dedup is keyed by **unique project across the batch** with the "grounded exactly once" assertion in prose; a project touching 2 meetings is grounded once. <!-- Concern, Risk 5 -->
- F3 relaxation is **conditional**: prose states per-agenda degradation is structurally prevented only when each agenda is grounded+synthesized in an isolated subagent; inline/degraded runs keep the F3 rule AND the AC1 self-check (`:120-132`) fully in force. The AC1 gate text remains verbatim-equivalent. <!-- Concern 3 -->
- The skill references the grounded-bundle schema by pointer to `project-agent.md`; it does not re-describe the field list. <!-- Concern 4 -->
- Carve-outs documented: single-meeting-single-project → adopt inline (no spawn); single-meeting-multi-project → fan out grounding, prime synthesizes one agenda; batch → full pipeline; do not build parallel per-meeting synthesis until a batch grows large. <!-- plan carve-outs -->

### Task 3 (WS-D adopt) — Unify /project onto the shared disposition

Edit `packages/runtime/skills/project/SKILL.md` so adopt mode references `project-agent.md` as its disposition. Add additive, read-only live-grounding: when the user is actively WORKING a project (not a bare open), the agent verifies ticket/decision claims live and flags supersession before asserting. The bare `arete project open` data path stays deterministic, read-only, fast, and ungrounded.

**Acceptance Criteria**:
- `/project` references `project-agent.md` for its disposition (shared source with spawn mode). <!-- Concern 4 -->
- Live-grounding is **additive read-only verification** (never writes — preserves the existing write-invariant at `project/SKILL.md:29,80-82`), gated **on-when-working**, and explicitly **OFF on a bare `arete project open`** so open stays fast. <!-- Concern 5 -->
- The "No LLM in the data path" / read-only boundaries remain true for retrieval; grounding is a reasoning layer ON TOP, not in the CLI data path.
- Skill references the bundle schema by pointer (for the working-session structured view), not a re-description.

### Task 4 (WS-D guide) — Reconcile the authoring guide

Edit `packages/runtime/skills/_authoring-guide.md` so the inline-only note (~:359, "Expert agent patterns run in the same conversation — does not spawn a new agent or call a subagent") is RECONCILED, not contradicted: distinguish "inline expert patterns (the default)" from a newly sanctioned "subagent-fan-out" pattern for batch + multi-project work, with graceful inline degradation.

**Acceptance Criteria**:
- `_authoring-guide.md` documents subagent-fan-out as a distinct, sanctioned pattern AND reconciles the :359 inline-only note (not a dangling contradiction). <!-- Concern 6, Risk 7 -->
- The new section covers: when-to-spawn vs. when-to-adopt-inline, the dedup-by-unique-project rule, the lean-prime principle (full bodies stay inside grounding agents; only compact bundles return), and the harness-agnostic + inline-degradation requirement.

### Task 5 (WS-E) — Defer the cache with a correct-design note; confirm supersession scope

Update `dev/work/backlog/plan-context-injection-followups.md` item #5 (and the plan's WS-E) to record the cache as **deferred for this effort** with the reason (mtime keying cannot detect server-side Jira changes; caching live-Jira facts reintroduces the bug; no measured latency problem) and the **correct design for when it is built**: cache only file-derived/deterministic fields under mtime keying, ALWAYS re-verify `tickets[]` live each run, no TTL ceiling; the critical test is a changed-ticket scenario that is NOT served from cache. Confirm supersession stays flag-only in the bundle contract (Task 1).

**Acceptance Criteria**:
- Backlog item #5 records the deferral, the staleness rationale, the correct future design, and the required changed-ticket test. <!-- Concern 1, Risk 2 -->
- No cache code is added in this effort. `grep -rl "cache/plan-context" packages/` shows no new implementation.
- Supersession remains flag-not-resolve; no resolution/ranking logic anywhere. <!-- Risk 8 -->

### Task 6 (close-out) — Discoverability, docs, dry-run validation

Make the new disposition + skill behavior discoverable and verify the prose holds together. Update user-facing docs (GUIDE.md and/or `packages/runtime/UPDATES.md`) describing the project-agent disposition and the grounded agenda-prep flow. If tooling/skills metadata catalogs apply (`dev/catalog/capabilities.json`), update them. Run a dry-run sanity pass: trace the new skill prose end-to-end against a real meeting+project to confirm the pipeline reads coherently and the carve-outs route correctly.

**Acceptance Criteria**:
- GUIDE.md (and/or `packages/runtime/UPDATES.md`) describes the new disposition + grounded agenda-prep flow for users.
- `arete route "prepare agendas for my meetings"` / `"open project X and ground it"` still route correctly (no routing regression from the edits).
- Catalog/discoverability entries updated if applicable, or explicitly noted N/A.
- Dry-run: the pipeline + carve-outs are traced against one real meeting/project and read coherently (documented in progress notes).

## Out of scope

- The WS-5 disk cache (deferred — Task 5).
- Supersession resolution / "which decision won" (flag-only this round).
- Parallel per-meeting synthesis subagents (build only when a batch grows large).
- Project weighting driving-vs-reference (backlog item #3, separate).
- A web/UI agenda-review surface (later skin).

## Quality gates (every task)

`npm run typecheck && npm test` stay green (no regressions). Markdown-dominant tasks carry no unit tests (documentation-only exception) and are verified by their AC checklist + grep verifications + the Task 6 dry-run. If any source/dist file changes, run `npm run build` and commit dist.
