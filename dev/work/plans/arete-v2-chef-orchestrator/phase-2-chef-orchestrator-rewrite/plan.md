---
title: "Phase 2 — Chef-orchestrator behavior rewrite"
slug: arete-v2-phase-2-chef-orchestrator-rewrite
parent: arete-v2-chef-orchestrator
status: drafting
size: large
tags: [v2, phase-2, chef-orchestrator, skills-rewrite, patterns-md, append-file]
created: "2026-05-04"
updated: "2026-05-04"
execution: sub-orchestrator (spawned from parent meta)
has_pre_mortem: false
has_review: false
has_prd: false
phase_in_v2: 2
---

# Phase 2 — Chef-orchestrator behavior rewrite

## Purpose

Phase 2 is the user-felt heart of v2. Five skills (`daily-winddown`, `weekly-winddown`, `week-plan`, `process-meetings`, `meeting-prep`) get rewritten to apply the chef-orchestrator pattern: agent does all work upfront using primitives + wiki + memory + user-specific context, applies judgment, presents a curated view with reason labels, optionally proposes MCP-backed actions — and engages the user **once** at the end. Today's step-by-step engagement gates go away.

The architectural keystone is **skill prose**, not new substrate. Phase 1 built the wiki the chef reads; Phase 2 teaches the chef how to behave.

This is the highest-stakes phase by a wide margin. AC11 hard stop applies (>45 min winddown on any soak day = revert).

## Scope

### (a) PATTERNS.md — ships first [GATE, MC4]

A new top-level pattern doc at `packages/runtime/skills/PATTERNS.md` (or extend if exists) specifying four reusable patterns. Per #1 user direction: **prescriptive on envelope, guidance on content** — fixed structure, free-form fill-in.

#### Pattern 1 — `do-all-work-then-engage`

**Envelope (prescriptive):**
1. List all primitive calls needed (CLI invocations, MCP queries, file reads).
2. Run them — parallelize where independent, sequence where dependent.
3. Read user-specific guidance: `.arete/skills-local/<skill-slug>.md` if it exists.
4. Apply judgment using gathered output + APPEND content + wiki context.
5. Compose curated view (per Pattern 2 + Pattern 3 + Pattern 4).
6. **Engage user once.** Wait for response before any further action.

**Content (per-skill):** which primitives, which APPEND key to read, what judgment looks like, output shape.

#### Pattern 2 — `curate-with-reason-labels`

**Envelope (prescriptive):**
- Every staged item has a one-line reason label: *why this surfaced*. ≤12 words.
  - Examples: "matches week focus #2", "3 mentions in last 5 days", "open commitment to Anthony >14d".
- Every deferred item has a one-line reason label: *why this didn't surface*.
  - Examples: "low importance + no decision", "matches dismissal pattern (routine standup)", "below confidence 0.6".
- When uncertain whether to stage or defer, surface to a `## Uncertain — your call` mini-tier with quick yes/no proposal. **Don't guess.**

**Content (per-skill):** taxonomy of reason labels relevant to the skill's domain.

#### Pattern 3 — `propose-with-mcp-action`

**Envelope (prescriptive):**
- When a committed action or surfaced item maps to a known verb (see Action verb taxonomy below), the agent proposes the action with full parameters.
- Format (inline numbered, per #3 user direction):
  ```
  Proposed actions:
  [1] slack.send_dm to @anthony: "Following up on auto-attachments — saw your PR comment, want to align Wed?"
  [2] calendar.create_event "Lauren / John 1:1" attendees=[lauren] when=Wed-10am-CT duration=30m
  [3] arete.inbox_add source=manual "Q3 churn assumption pushback for Lauren"
  ```
- User responds with which numbers to execute, edit (e.g., `2 with start=Thu-10am`), or skip.
- **Never auto-execute.** Even for "simple" actions. User approval required for every action, every time.

**Content (per-skill):** which verbs the skill might propose, contextual phrasing.

**Action verb taxonomy** (Phase 2 default; user extends via APPEND):

Two execution modes — `executable` (agent can run via MCP/CLI on approval) and `draft-only` (agent formats the action, user executes externally). Pattern 3 supports both. `draft-only` is just `executable` minus the execute step; the propose envelope is identical.

| Source | Verb | Mode | Parameters |
|---|---|---|---|
| Slack MCP | `slack.send_dm` | executable | target_user, message |
| Slack MCP | `slack.send_channel` | executable | channel, message |
| GWS Calendar MCP / `arete calendar create` | `calendar.create_event` | executable | title, attendees, start, duration, agenda? |
| GWS Calendar MCP | `calendar.suggest_time` | executable | attendees, duration, window |
| Notion MCP | `notion.update_page` | executable | page_id_or_title, content |
| Notion MCP | `notion.create_page` | executable | parent, title, content |
| Jira (no MCP today; user web/CLI) | `jira.create_ticket` | draft-only | project, type, summary, description, assignee?, labels?, parent_epic? |
| Jira | `jira.update_ticket` | draft-only | ticket_id, fields |
| Jira | `jira.transition_ticket` | draft-only | ticket_id, to_state |
| Areté CLI | `arete.inbox_add` | executable | source, content |
| Areté CLI | `arete.commitments_create` | executable | text, target_person, due? |
| Areté CLI | `arete.commitments_resolve` | executable | id, resolution |

**Mode handling in proposal format**:
- `executable`: `[N] slack.send_dm to @anthony: "..."` → user responds with `1` to execute, `1 with target=@jamie` to edit, `skip 1` to drop.
- `draft-only`: `[N] (draft) jira.create_ticket project=INGEST type=Task summary="..." description="..."` → user responds same way; agent confirms acknowledgment but no execution. User opens Jira and creates manually with the drafted content.

The chef reads the user's APPEND file to learn (a) which MCPs are wired, (b) which draft-only verbs the user wants drafts for, (c) any user-specific context (project keys, default labels, naming conventions). The chef proposes only verbs the user listed.

#### Pattern 4 — `surface-deferred-as-sidecar`

**Envelope (prescriptive):**
- Deferred items roll up to a count + sidecar reference in the primary view:
  ```
  12 items deferred — see ./deferred-2026-05-15.md
  ```
- Sidecar at workspace root (e.g., `./deferred-<date>.md` for daily; `./deferred-week-<weeknum>.md` for weekly) contains the full deferred list with reason labels.
- When the user pulls an item back from the sidecar (manually re-surfaces), agent appends a `deferral_disagreement` event to `item-fates.jsonl` (Phase 0's event log).

**Content (per-skill):** sidecar naming convention, what gets included.

### (b) APPEND-file convention [GATE]

User-specific guidance per skill, free-form, agent-injected at start of skill execution.

- Location: `.arete/skills-local/<skill-slug>.md`
- Seeded on `arete install` and `arete update` with a template stub if absent. Idempotent — won't overwrite existing user content.
- Each rewritten SKILL.md includes a "Read first" stanza near the top:
  > **Read first** (if exists): `.arete/skills-local/<skill-slug>.md`. This is John's per-skill guidance — what to prioritize, what MCPs he uses and how, what cross-references to pull. Treat its content as opinion-defining context for this skill.

**Seed template** (same for all 5 skills, customized by skill name):

```markdown
# <Skill Name> — your context

The chef-orchestrator agent reads this file at the start of every <skill-name>
run. Edit freely; treat it like a personal briefing.

## My MCPs and how I use them
<!-- Examples:
- Slack MCP: send DMs to teammates; post to #channels for announcements
- GWS Calendar: schedule meetings, find availability
- Notion MCP: update Glance 2.0 stakes doc, customer research pages
-->

## Active initiatives / what's important right now
<!-- Examples:
- Glance 2.0 launch (Q3)
- Cover Whale email-template rollout
-->

## People to watch / patterns
<!-- Examples:
- Anthony: Glance comms eng; auto-attachments lead
- Items >14d old without movement → drop unless customer-touching
-->

## Cross-references the chef should always pull
<!-- Examples:
- Jira INGEST-* for sprint status
- Notion "Glance 2.0 Stakes" doc
-->
```

**Phase 3 transition note**: when the skills directory split ships, these files migrate naturally to `.agents/skills/<skill>/APPEND.md` (or similar) as part of the user-skill dir. No data loss.

### (c) Skill rewrites [GATES — five skills]

All five rewrites follow the same envelope:
1. Apply patterns 1–4 from PATTERNS.md.
2. Read APPEND file.
3. Use existing primitives (`meeting context`, `topic find`, `commitments list`, `search`, etc.) and Phase 1 wiki (summaries, entity pages).
4. Conservative action-offering: propose, never auto-execute.

Per-skill notes:

**(c.1) `daily-winddown` — validation skill, ships first**

Once PATTERNS.md is in, daily-winddown is the first rewrite. Soak for 7 days alone before touching the other 4. If patterns prove wrong, fix in PATTERNS.md before Phase 2 continues.

**(c.2) `weekly-winddown`**

Larger time horizon. Pulls week's worth of meetings, summaries, commitments resolved/added. Same patterns; longer sidecar deferred list expected.

**(c.3) `week-plan` — two-engage variant**

Forward-looking. Per #6 user direction: this skill has **two engagement points**:
1. Priorities conversation: agent surfaces last week's carryovers + suggested priorities; user confirms/edits.
2. Plan draft: agent uses confirmed priorities + wiki + commitments to draft a realistic week plan; user approves/edits.

PATTERNS.md should note this as a **legitimate variant** of `do-all-work-then-engage` — two engages around a user decision. Not all skills are batch.

**(c.4) `process-meetings`**

Today: batch process today's meetings. Chef pattern fit: agent runs all extractions, surfaces extracted items via four-tier surface (now informed by Phase 1's summary + entity wiki), proposes commitment-related MCP actions.

**(c.5) `meeting-prep`**

Pre-meeting briefing. Chef pattern fit: agent gathers context (attendees → entity pages, recent meetings touching same topics → summaries, open commitments with attendees → commitments list). Produces talking points + reminders. Proposes pre-meeting actions ("you committed to send Lauren the doc — want me to draft the message now?").

### (d) Substrate touches (no new substrate)

Read-only or light writes; nothing architectural.

- **Importance gating**: chef reads `meeting.frontmatter.importance` directly when deciding whether to surface meeting-derived items in winddown. No schema layer needed.
- **Four-tier surface**: skill prose composes the output. No new file shapes.
- **`frontmatter.approved_items` removal**: long-standing third-copy duplicate. Web review UI must read body sections instead. Touches `packages/apps/backend` + `packages/apps/web` review code paths. Single small refactor; ledger remove.
- **`## Could include` stale references in legacy skill prose**: already deleted in Phase 1 fix-up (legacy skill prose still references but no-ops). Phase 2 rewrites the prose anyway, so the references resolve at the source.

### (e) Per-skill legacy preservation [GATE — MC2]

**Each rewritten skill ships with two ship-gate artifacts**:

1. **`<skill-dir>/SKILL.legacy.md`** — verbatim copy of pre-rewrite SKILL.md, committed in the same PR as the rewrite. File exists on disk; agent harness reads it when legacy flag is set for that skill.

2. **`ARETE_LEGACY_SKILL_PROSE` env var** — comma-separated skill names. Agent harness checks this at skill-resolve time and routes to `SKILL.legacy.md` for each named skill. Per-skill, not global.

Build does not merge the rewrite of any skill until both artifacts are present.

**Skill-resolution code lives in**: skill loader / route logic — needs new code path. Sub-orch identifies the right module during build (likely `packages/cli/src/commands/skill.ts` or `packages/runtime/skills/<runtime-loader>`).

### (f) Legacy × Phase 3 directory split — MC5 resolution

Per parent plan + second-pass review, two options. **This plan picks option (a) — sunset legacy before Phase 3 ships.**

Concrete:
- After Phase 2 soak completes successfully (each of the 5 skills has run for ≥14 days without revert), all `SKILL.legacy.md` files are deleted in a Phase 2 wrap-up commit.
- The `ARETE_LEGACY_SKILL_PROSE` env var is removed from skill-resolver code in the same wrap-up commit.
- Phase 3 then operates on a clean two-artifact world (`.arete/skills/<name>/SKILL.md` + `.agents/skills/<name>/SKILL.md`).
- Risk: post-soak regressions discovered after legacy is removed have no escape hatch. Mitigation: 14-day soak with AC11 hard stop is conservative; we'll know.

## Acceptance criteria

| AC | Verification |
|---|---|
| **AC2.1**: `PATTERNS.md` ships with all four patterns specified (prescriptive envelope + guidance content) BEFORE any of the five SKILL rewrites lands. | git log ordering check |
| **AC2.2**: APPEND seed template lands at `.arete/skills-local/<skill-slug>.md` for all 5 skills on `arete install`/`update`. Existing user content is never overwritten. | install/update integration test |
| **AC2.3**: Each rewritten SKILL.md begins with the "Read first" stanza pointing at the corresponding APPEND file. | grep check across the 5 SKILL.md files |
| **AC2.4 (replaces parent AC4)**: Every staged item has a reason label; every deferred item has a reason label; when uncertain, the agent surfaces an `## Uncertain — your call` tier. **No length cap** — chef judgment determines what surfaces. | Manual review on 10 consecutive winddown invocations |
| **AC2.5**: Each rewritten skill ships with `<skill>/SKILL.legacy.md` (verbatim pre-rewrite copy) AND `ARETE_LEGACY_SKILL_PROSE` env var routes to it correctly. | Per-skill smoke: set env var, run skill, observe legacy behavior |
| **AC2.6**: Action proposals always include the verb name + parameters AND mode tag (`executable` or `draft-only`); agent never auto-executes any mode; user response format documented in PATTERNS.md. Draft-only proposals (e.g., Jira ticket content) format the action as the user would create it externally. | Read-through; manual test on a real winddown with proposed `slack.send_dm` AND proposed `jira.create_ticket` |
| **AC2.7**: Deferred items roll to a sidecar (`./deferred-<date>.md`); user pulling an item back appends a `deferral_disagreement` event to `item-fates.jsonl` (Phase 0 substrate). | Integration test simulating pull-back |
| **AC2.8**: `frontmatter.approved_items` removed from meeting frontmatter writers; web review UI reads body sections. | Test that backend approve flow still produces item-fate events without frontmatter.approved_items |
| **AC2.9**: AC10 (gating, parent plan) — winddown median time across the 14-day Phase 2 soak ≤ 50% of Phase 0 baseline. **If AC10 fails, Phase 2 reverts.** | 14-day rolling median; baseline established Phase 0 |
| **AC2.10**: AC11 hard stop — if any single winddown during soak exceeds 45 min, the relevant skill reverts via `ARETE_LEGACY_SKILL_PROSE` flag and Phase 2 plan is iterated. | Daily check |
| **AC2.11**: AC8 ledger — net combined Δ ≤0 across the five proxies for Phase 2. | See ledger expectation |
| **AC2.12**: All tests pass; typecheck clean across core/cli/backend/runtime. | Targeted `tsx --test` / `vitest run` per file. **NOT** `npm test` at root (watchdog killer). |

## Adds vs removes ledger expectation

Phase 2 should net ≤0 combined. Initial estimate:

| Proxy | Adds | Removes | Δ |
|---|---|---|---|
| CLI verbs | 0 | 0 | 0 |
| Runtime skills | 0 (rewrites, not adds) | 0 | 0 |
| Frontmatter file shapes | 0 (no new shapes) | -1 (`frontmatter.approved_items` field on meeting frontmatter) | **-1** |
| Memory file types | +1 (`.arete/skills-local/`) — depending on whether this dir counts | 0 | 0 to +1 |
| Services | +0 (skill-resolver code change is in existing modules) | 0 | 0 |

**Plus** real removes from skill-prose simplification:
- Step-by-step engagement gates in 5 skills (concept-level remove; not directly counted but the user-felt simplification target)
- `## Could include` stale references in legacy prose (Phase 1 cleanup; legacy prose preserved verbatim)

**Estimated combined Δ**: -1 to 0. **Within budget**. The legacy preservation (e) adds 5 files temporarily but they get deleted in the Phase 2 wrap-up before Phase 3 — net zero by Phase 3 ship.

This is unlike Phase 1 (which was over budget); Phase 2 is genuinely a *behavior* phase, not a substrate phase. The substrate budget shifts to skill-prose engineering.

## Test strategy

Skill-prose changes are notoriously hard to test. Heavier reliance on live observation; lighter on unit tests.

| Layer | Tests |
|---|---|
| Unit | PATTERNS.md parser if any (probably none — it's prose). APPEND-file resolver: file exists / file absent / file empty / file malformed → graceful behavior. Skill-resolver `ARETE_LEGACY_SKILL_PROSE` parsing + routing. Action verb parameter validators. |
| Integration | Per-skill smoke: invoke each rewritten skill with a fixture workspace; assert output shape (sections present, reason labels present, sidecar file written if applicable). Five smokes total. |
| Snapshot | Sample winddown output before/after Phase 2 — capture as text snapshot for review-time comparison. Not pass/fail; informs eng-lead reviewer's quality assessment. |
| A/B | At end of build (before soak): run new daily-winddown alongside legacy on 5 real meetings; user subjective compare. AC2.4 quality floor must clear; if it doesn't, fix patterns BEFORE soak. |
| Soak | 14-day live run with daily user check-ins (informally). AC11 hard stop monitoring. Per-skill flag means user can roll back any one skill while keeping others. |

**No mocks for memory operations** — real fs + StorageAdapter (services/LEARNINGS.md). **No `npm test` at repo root** (watchdog killer per Phase 1 lesson).

## Skeptical view (required per Principle 9)

**The strongest case for not doing Phase 2 as scoped**: "Five skills at once with the highest blast radius is the precise scope-bigger-than-it-looks failure mode. Two of them (process-meetings and meeting-prep) are most-used and any subtle behavior regression will land on John during real meetings, not safe soak hours. Worse, skill prose is hard to test — we're betting on AC11 hard stop catching regressions, but that's reactive not preventive. A subtle 30-min winddown with poor judgment that doesn't trip the 45-min cap is invisible degradation."

**Counter**: 
1. Per-skill flag (`ARETE_LEGACY_SKILL_PROSE`) plus 7-day soak on daily-winddown alone before touching the other 4 means we validate patterns once before propagating.
2. The A/B run on 5 real meetings BEFORE soak gives subjective signal that AC11 wouldn't catch.
3. Eng-lead review reads the skill prose and patterns before merge — pattern divergence and unclear prose are catchable at /review.
4. Phase 2 is the user's articulated dream; not doing it means v2 fails its primary thesis. The risk is real but the alternative is worse.

**Residual risk**: subtle invisible degradation during soak. Mitigation: weekly user check-in during Phase 2 soak — John writes one paragraph: "what's clearer / still confusing / new pain?" If "new pain" is non-empty, treat as soft revert signal.

## Rollback

Per-skill via `ARETE_LEGACY_SKILL_PROSE` env var. Set the var (e.g., `ARETE_LEGACY_SKILL_PROSE=daily-winddown,meeting-prep`) and the harness routes to `SKILL.legacy.md` for those skills only. No code changes; no revert; no merge undo.

If the patterns themselves are wrong (vs. one specific skill misapplying them): pause new skill rewrites, fix PATTERNS.md, re-derive affected skills.

## Hygiene reconciliation

Phase 2 does NOT touch any code that hygiene-pass-1 deleted. It modifies existing skill SKILL.md files (preserved by hygiene), adds new `.arete/skills-local/` directory, and adds skill-resolver code (likely small extension to existing skill loader). No conflict.

## MC2 — Per-skill legacy preservation as ship gates

Already covered in (e) above. Reiterating: build does not merge the rewrite of any skill until **both** `<skill>/SKILL.legacy.md` AND functioning `ARETE_LEGACY_SKILL_PROSE` flag are in place. Phase 2 PR review checks for both artifacts; if missing, the skill rewrite does not merge.

## MC4 — PATTERNS.md ships first

Already covered in (a) above. Reiterating: PATTERNS.md is its own commit, gets its own /review pass before any skill rewrite ships. If patterns prove inadequate during the daily-winddown rewrite (the validation skill), patterns get revised first; downstream skills inherit revisions.

## MC5 — Legacy × Phase 3 directory split

Already covered in (f) above. Resolution: option (a), sunset legacy before Phase 3.

## Sub-orchestrator handoff brief

When meta spawns the Phase 2 sub-orchestrator, the brief includes:

1. **Read first**: this `plan.md`, parent `dev/work/plans/arete-v2-chef-orchestrator/plan.md` (Principles 1–9, AC table including revised AC4, AC11, MC2/MC4/MC5), parent `pre-mortem.md` (R1 and-also-creep, R3 trust-gap, R4 Phase 2 blast-radius now Phase 5 → Phase 2 mapping in revised numbering, R14 daily-driver, R15 builder/user role conflict), parent `diary.md` (most recent decisions log + lessons forward from Phase 0 + Phase 1), Phase 0 + Phase 1 build-reports for pipeline context.
2. **Memory files**: `feedback_l3_memory.md`, `feedback_ai_fix_escalation.md`, `feedback_branch_isolation.md`, `feedback_commit_dist.md`, `project_arete_v2_direction.md`, `project_slack_digest.md`.
3. **Worktree**: spawn with `isolation: "worktree"` off parent branch.
4. **Build sequence (mandatory ordering)**:
   - **Step 1**: Write/extend `packages/runtime/skills/PATTERNS.md` with all four patterns (prescriptive envelope + guidance content). Also include the action verb taxonomy table from this plan.
   - **Step 2**: Implement APPEND-file convention. Add `.arete/skills-local/` directory creation + seed templates to `arete install` / `arete update`. Idempotent.
   - **Step 3**: Implement skill-resolver routing for `ARETE_LEGACY_SKILL_PROSE` env var.
   - **Step 4**: Rewrite `daily-winddown/SKILL.md` per chef pattern. Apply patterns 1–4. Reference APPEND file. Commit `<skill>/SKILL.legacy.md` in same commit.
   - **Step 5**: A/B run: invoke new daily-winddown on 5 fixture meetings; subjective quality check on output. **Pause and report to meta** if quality degrades vs legacy.
   - **Step 6** (only after Step 5 passes): Rewrite remaining 4 skills (`weekly-winddown`, `week-plan`, `process-meetings`, `meeting-prep`). Note: `week-plan` uses the two-engage variant from (c.3).
   - **Step 7**: Remove `frontmatter.approved_items` from meeting writers; update web review UI to read body sections.
   - **Step 8**: Tests (unit + integration + snapshot per the test strategy).
   - **Step 9**: Rebuild dist; commit.
5. **Commit cadence**: per-step commits with `phase-2(<area>): <change>` convention. **Per-skill commits for the rewrites** so any single skill can be reverted via `git revert <hash>` if its flag-flip isn't enough. Suggested:
   - `phase-2(runtime): add chef-orchestrator patterns to PATTERNS.md`
   - `phase-2(cli): seed .arete/skills-local/ templates on install + update`
   - `phase-2(runtime): add skill-resolver routing for ARETE_LEGACY_SKILL_PROSE`
   - `phase-2(runtime): rewrite daily-winddown for chef pattern + preserve SKILL.legacy.md`
   - (after Step 5 PASS):
   - `phase-2(runtime): rewrite weekly-winddown for chef pattern`
   - `phase-2(runtime): rewrite week-plan for chef pattern (two-engage variant)`
   - `phase-2(runtime): rewrite process-meetings for chef pattern`
   - `phase-2(runtime): rewrite meeting-prep for chef pattern`
   - `phase-2(core,backend): remove frontmatter.approved_items duplicate; web reads body sections`
   - `phase-2(test): unit + integration + snapshot tests for chef pattern`
   - `phase-2: rebuild dist after Phase 2 changes`
6. **Build report**: append `dev/work/plans/arete-v2-chef-orchestrator/phase-2-chef-orchestrator-rewrite/build-report.md` with files touched, tests added, AC2.1–AC2.12 verification status, AC2.11 ledger filled in with **actual** counts (cross-check each plan-listed Remove against actual deletion per Phase 1 lesson), Step-5 A/B output (subjective notes), known issues, ready-for-review state.
7. **When to engage meta** (open-question pattern):
   - Step 5 A/B run shows quality degradation — pause; engage meta.
   - PATTERNS.md proves inadequate during daily-winddown rewrite — engage meta to revise patterns before propagating.
   - AC2.11 ledger Δ > 0 at ship time.
   - Hygiene-pass-1 already removed scope Phase 2 needs.
   - Test failing in a way suggesting an AC is wrong.
   - Skill-resolver routing requires a code change deeper than expected.
   - Otherwise: complete autonomously and return.
8. **Watchdog-safe testing**: per-file `tsx --test` / `vitest run` invocations only. **NEVER** `npm test` at repo root. Phase 1 sub-orch died this way; don't repeat.
9. **Return value**: sub-worktree path, branch name, build-report path, AC2.11 ledger summary, Step-5 A/B subjective notes, ready-for-review state.

## Cadence

- **Build**: 10–14 days per parent plan estimate. Step ordering (PATTERNS.md → daily-winddown validation → 4 skills batch + frontmatter.approved_items removal + tests + dist) suggests realistic agent wall time of ~2–3 hours active.
- **Soak**: 14 days post-ship. AC11 hard stop. Weekly user check-in.
- **Review**: ~1 day (eng-lead reviewer + fix-up cycle).
- **Ship to main**: AFTER John has tested/used Phase 0 AND Phase 1 for some duration. Phase 2 is the highest-stakes phase; main merge needs both prior phases comfortable.

## Critical files (heads-up to sub-orchestrator)

| File | Role in Phase 2 |
|---|---|
| `packages/runtime/skills/PATTERNS.md` | Extend with chef-orchestrator patterns (or NEW if absent) |
| `packages/runtime/skills/daily-winddown/SKILL.md` | Rewrite + preserve `SKILL.legacy.md` |
| `packages/runtime/skills/weekly-winddown/SKILL.md` | Same |
| `packages/runtime/skills/week-plan/SKILL.md` | Rewrite (two-engage variant) + preserve legacy |
| `packages/runtime/skills/process-meetings/SKILL.md` | Same as daily-winddown |
| `packages/runtime/skills/meeting-prep/SKILL.md` | Same |
| `packages/cli/src/commands/install.ts` and/or `update.ts` | Seed `.arete/skills-local/<slug>.md` templates |
| `packages/cli/src/commands/skill.ts` (or skill-loader module) | Add `ARETE_LEGACY_SKILL_PROSE` routing |
| `packages/core/src/integrations/staged-items.ts` | Remove `frontmatter.approved_items` write |
| `packages/apps/backend/src/routes/intelligence.ts` (or wherever review UI fetches) | Read body sections instead of frontmatter.approved_items |
| `packages/apps/web/src/...` (review UI consumer) | Update consumer code |
| `dev/work/plans/arete-v2-chef-orchestrator/phase-2-chef-orchestrator-rewrite/build-report.md` | NEW — sub-orch authors |
