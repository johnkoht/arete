---
title: "Phase 1 — Wiki expansion (summaries + entities + integration)"
slug: arete-v2-phase-1-wiki-expansion
parent: arete-v2-chef-orchestrator
status: drafting
size: large
tags: [v2, phase-1, wiki, summaries, entity-pages, absorption-principle]
created: "2026-05-02"
updated: "2026-05-02"
execution: sub-orchestrator (spawned from parent meta)
has_pre_mortem: false
has_review: false
has_prd: false
phase_in_v2: 1
---

# Phase 1 — Wiki expansion

## Purpose

Phase 1 brings `.arete/memory/` to the full Karpathy-shape wiki (raw → wiki of summaries + entities + concepts → schema). Phase 2 (chef-orchestrator behavior rewrite) explicitly depends on a strong wiki to make good judgments. Without summaries, entity pages, and a topic-page integration that reads summaries instead of transcripts, the chef has thin substrate to reason against.

This is governed by the **absorption principle** (parent plan §"Phase 1"):

> A source gets a summary when it represents a primary unit of knowledge ingested. Subsidiary inputs (Notion notes pulled as meeting context, agendas, pre-reads) are absorbed into the parent's summary, not summarized separately.

## Scope

Five sub-deliverables. (a)–(c) are **gates**; (d)–(e) are **stretch** with explicit defer-not-cut criteria per MC1.

### (a) Summary writers, per-primary-ingest [GATE]

Three flows in scope; one deferred.

**(a.1) Meeting summaries — always**

- Output: `.arete/memory/summaries/meetings/<date>-<slug>.md`
- Frontmatter: `{source_path, source_type: "meeting", date, area, importance, topics[], participants[], extraction_version}`
- Body sections (in render order):
  - `## What happened` — narrative of the meeting
  - `## What was decided` — decisions list (links to decisions.md entries via `[[wikilink]]`)
  - `## What's next` — action items + next-step commitments
  - `## Open questions` — questions raised but not resolved
  - `## FYI` — things mentioned worth knowing but not actionable (replaces today's `## Could include`)
  - `## Things mentioned but not actioned` — context-only (replaces today's `## Core` extra content)
- Quality bar: post-call email John would send to attendees explaining what happened, what was decided, what's next.
- LLM tier: Sonnet (synthesis-quality).
- Writer hook: in `meeting-apply.ts` after frontmatter is finalized but before topic integration. Idempotent per `(source_path, content_hash)`.
- Replaces: meeting frontmatter `summary:` field is preserved for backward-compat reads but new logic reads the summary file. (Don't strip the field — Phase 5 may revisit.)

**(a.2) Inbox doc summaries — always**

- Output: `.arete/memory/summaries/inbox/<doc-id>.md`
- Frontmatter: `{source_path, source_type: "inbox", date, area?, importance?, topics[]}`
- Body sections (subset of meeting shape, source-agnostic):
  - `## Summary` — one-paragraph TL;DR
  - `## Key points` — bulleted highlights
  - `## What's relevant` — connection to existing topics/people/orgs
  - `## Followups` — anything actionable
- Writer hook: in `arete inbox add` flow. LLM tier: Sonnet.

**(a.3) Slack thread summaries — conditional via heuristic + 7-day shadow-run**

This is where MC3 lives. Two-stage rollout:

- **Stage 1 (in this phase, ships disabled):** implement the heuristic as a **logging-only pass** in slack-digest. For each thread the heuristic evaluates, write to `memory/log.md`:
  ```
  ## [<ts>] slack_thread_eval | thread=<id> | would_summarize=<bool> | trigger=<messages|decision|participants|user_flag|none> | messages=<n> | participants=<n>
  ```
- **Stage 2 (post-shadow-run, behind flag `ARETE_SLACK_SUMMARIES=1`):** when enabled, the same heuristic gates an actual summary write to `.arete/memory/summaries/slack/<thread-id>.md`.

Default heuristic (per parent plan): `messages ≥ 10` OR `decision detected` OR `participants ≥ 3` OR user-flagged.

After Phase 1 ships, John spot-checks the shadow log daily for 7 days. False-negative rate (substantial threads heuristic missed) and false-positive rate (chatter heuristic flagged) must be ≤ 20% combined before he flips `ARETE_SLACK_SUMMARIES=1`. Heuristic is tuned in a follow-up small commit if needed.

**Conversations and manual notes**: deferred. John doesn't actively use the conversation export flow; manual notes are summarized only when promoted to inbox. No writer in Phase 1.

### (b) Entity pages for orgs/customers [GATE]

- Output: `.arete/memory/entities/orgs/<slug>.md`
- Frontmatter: `{org_slug, status, aliases[], people[], related_topics[], first_seen, last_refreshed, sources_integrated[]}`
- Auto-section pattern using sentinels (same shape as person memory):
  - `<!-- AUTO_ORG_MEMORY_START -->` ... `<!-- AUTO_ORG_MEMORY_END -->`
  - User can annotate outside the sentinels; system regenerates inside.
- Detection (auto): orgs that appear on ≥2 distinct meetings within a 90-day window via:
  - Meeting attendees with non-internal email domains (configurable internal domain list; default `reserv.com`).
  - Attendee org-tag heuristic (TBD; LLM-assisted lookup in Phase 1 retro if auto-detection underperforms).
- Manual: `arete entity org create <slug>` to seed an org page from prose; useful for accounts that don't have direct meeting attendees (e.g., partners discussed but never on calls).
- Writer hook: extend `EntityService.refreshOrgs()` (new method paralleling `refreshPersonMemory`); runs at meeting-apply.
- Reader: chef navigates from `[[org-slug]]` wikilinks in summaries and topic pages.

**Existing topic slugs that should become orgs**: a one-shot migration scans current `.arete/memory/topics/` for slugs that match the heuristic (cover-whale, leap, foxen, snapsheet are obvious candidates) and proposes a topic→org migration. Land as a separate small commit; not blocking Phase 1 ship.

### (c) Topic-page integration reads summaries, not transcripts [GATE]

- Today: `topic-memory.ts:1059` (`integrateSource`) loads the meeting transcript and feeds it to the synthesis LLM.
- New: load the meeting summary instead. Falls back to transcript if no summary exists yet (covers backfill window).
- Cost reduction is a side effect; primary win is synthesis quality (curated input > raw signal).
- Idempotency invariant unchanged (`sources_integrated.hash` per meeting path).

### (d) Wikilinks across all wiki types [STRETCH]

- Today: wikilinks (`[[slug]]`) work in topic pages.
- Extend rendering to: summaries (links to topics + entities + people), entity pages (links to topics + people + summaries that mention them).
- Resolution: wikilink target must exist in `.arete/memory/` or `workspace/people/`. Lint flags dangling.

**Defer-not-cut criteria**: if Phase 1 build runs >18 days, (d) moves to a follow-on plan named `phase-1-extension-wikilinks-lint`. NOT removed from v2 scope; sequenced after Phase 2 chef ships so the chef's wiki-navigation needs are observed in practice before they're built.

### (e) Wiki health/lint [STRETCH]

- Today: `arete topic lint` (deterministic findings: stub, orphan, stale, near-duplicate via Jaccard).
- New: `arete wiki lint` covering same findings across all wiki types (summaries, topics, entities). Same deterministic output shape.
- Reuses existing patterns; no new LLM calls in Phase 1 (LLM-driven contradiction lint stays deferred per parent plan).

**Defer-not-cut criteria**: same as (d). Moves to `phase-1-extension-wikilinks-lint` if scope blows.

## Acceptance criteria

| AC | Verification |
|---|---|
| **AC1.1**: Every approved meeting produces a summary file at `.arete/memory/summaries/meetings/<date>-<slug>.md` matching the schema. | Integration test on a fixture meeting; manual verification on 3 real meetings |
| **AC1.2**: Summary frontmatter + body round-trip lossless via parser/renderer. | Unit test in `packages/core/test/models/meeting-summary.test.ts` |
| **AC1.3**: `topic-memory.integrateSource` reads the summary file when present, falls back to transcript when absent. | Unit test asserting both paths; integration test on a meeting with and without summary |
| **AC1.4**: Topic-integration LLM input tokens drop ≥30% on a typical 4-meeting day vs Phase 0 baseline. | Cost telemetry comparison; partial-credit toward parent AC3 |
| **AC1.5**: Inbox doc summary file is written within 30s of `arete inbox add` completion. | Integration test |
| **AC1.6**: Slack thread eval log is written for every slack-digest thread for 7 consecutive days post-ship; `ARETE_SLACK_SUMMARIES=1` is OFF during shadow run. | Manual log verification daily; flag check in `arete config show` |
| **AC1.7**: After shadow-run, enabling `ARETE_SLACK_SUMMARIES=1` produces summary files for threads matching the heuristic. | Smoke test on a real heuristic-passing thread |
| **AC1.8**: Entity page exists for each org auto-detected via the meeting-attendee heuristic (default threshold ≥2 meetings in 90d). | Smoke against arete-reserv: assert pages exist for cover-whale, leap, foxen, snapsheet |
| **AC1.9**: Existing meeting topic-pages remain semantically equivalent post-Phase 1 (no topic-page regressions). | Snapshot comparison on 5 high-traffic topics |
| **AC1.10**: AC0.8 ledger — net delta combined ≤0 across the five proxies for Phase 1 (NOT counting Phase 0's +3). | See ledger expectation below |
| **AC1.11**: All tests pass; typecheck clean across core/cli/backend. | `npm run typecheck` + targeted vitest/tsx-test runs |

## Adds vs removes ledger expectation (Phase 1's instance of parent AC8)

Phase 1 must net ≤0 combined. Initial estimate (sub-orch will validate at ship):

| Proxy | Adds | Removes | Δ |
|---|---|---|---|
| CLI verbs | `entity org create` (small), maybe `wiki lint` if (e) lands | `## Could include` body section is not a CLI verb but the formatting code that emits it can be deleted | +1 to +2 |
| Runtime skills | 0 | 0 | 0 |
| Frontmatter fields across canonical file shapes | New summary frontmatter (~5 fields) on a new file shape; new entity-org frontmatter (~7 fields) on a new file shape | `summary:` field on meeting frontmatter remains (backward-compat); body section `## Could include` removed (-1) | +11 to +13 net field-count, ≈ +2 file shapes |
| Memory file types | +2 (summaries/, entities/orgs/) | 0 | +2 |
| Services in `packages/core/src/services/` | +1 to +2 (summary writer, entity-org writer; org may extend `entity.ts`) | 0 | +1 to +2 |

**Estimated combined Δ at draft time**: +6 to +9. **This is over budget.**

This is the eng-lead's point about Phase 1 scope creep made concrete. Two options:

1. **Re-evaluate the proxies.** AC8 counts file shapes and field counts; the real complexity gain isn't always linear. The new summary file is a *substrate addition* that replaces the body-block pattern (which was getting bigger over time as wiki-leaning extraction grew). Argue the substitution at /review.
2. **Find more removes in scope.** Body-section migration in meeting files (`## Approved Decisions/Learnings/ActionItems` are duplicates of body content; could be cut as part of Phase 1's "absorbed by summary" theme). This was originally Phase 2 territory but could pull forward.

**Sub-orchestrator instruction**: produce the actual final ledger at ship time. If actual Δ > 0, surface to meta — meta will either (a) approve the substitution argument with the second reviewer, or (b) require Phase 1 to pull additional removes. Do not unilaterally exceed the ledger.

## Test strategy

| Layer | Tests |
|---|---|
| Unit | Summary model round-trip (frontmatter + sections). Entity-org model round-trip. Heuristic decision unit (slack thread evaluation). Topic-integration prompt-input switch (summary vs transcript). |
| Integration | Meeting apply produces summary file with correct shape + frontmatter. Inbox add produces summary file. Topic integration reads summary when present. Entity-org auto-detection runs against fixture set of meetings. Slack heuristic logging-only writes correct events. |
| Snapshot | High-traffic topic pages before/after Phase 1; assert no semantic regression. |
| Soak | 7-day slack heuristic shadow-run starts post-ship; AC1.6 verified passively. |

**No mocks for memory operations**: real fs + StorageAdapter (per `services/LEARNINGS.md` and project's testing memory).

## Skeptical view (required per Principle 9)

**The strongest case for not doing Phase 1 as scoped**: "Phase 1 was supposed to be 'summaries promotion' (~10 days). Adding entity pages, integration migration, wikilinks, and lint blew it up to 14–18 days with a +6 to +9 ledger Δ — exactly the scope-creep failure mode the discipline rule names. We should ship summaries-only, observe Phase 2 chef behavior, and add (b)/(c)/(d)/(e) iteratively as needs surface."

**Counter**: the chef (Phase 2) needs the wiki shape complete to make good judgments. Half-built wiki forces chef to half-reason. Iterative buildout would mean rewriting Phase 2 chef logic each time a new wiki layer lands. Better to ship the substrate complete.

**Residual risk**: real. The AC1.10 ledger may not pass without finding more removes. Mitigation: surface the ledger truth at /review; meta + reviewer evaluate substitution argument vs. pull-forward. Don't ship if the discipline can't be defended.

**Daily-driver risk**: Phase 1 changes meeting summary content. If summary quality regresses below today's `summary:` field, John's daily sense-making degrades. Mitigation: 5-meeting A/B before declaring Phase 1 ready (run new summary alongside existing for 5 meetings; subjective compare). AC11 (>45 min winddown = revert) applies.

## Rollback

Per-deliverable, since each is independent at the storage layer:

- (a.1) Disable summary writer via config flag; meeting files unchanged in primary content. Topic integration falls back to transcript automatically (per AC1.3).
- (a.2) Disable inbox summary writer; inbox flow unchanged.
- (a.3) Slack heuristic stays in logging-only mode (default). Even on "rollback" the shadow data persists.
- (b) Entity pages live alongside topic pages; deletion is `rm -rf .arete/memory/entities/orgs/`. People pages unchanged.
- (c) Topic integration reverts to transcript via config flag.
- (d/e) Stretch deliverables; if shipped, deletion is straightforward.

## Hygiene reconciliation

Phase 1 does NOT touch any code that hygiene-pass-1 deleted. It extends `EntityService` (preserved by hygiene), adds new files under `.arete/memory/`, and modifies `topic-memory.ts` and `meeting-apply.ts` (both in the post-hygiene tree). No conflict.

## MC1 — Gate-vs-stretch criteria (from second-pass review)

- **(a) Summary writers, (b) Entity pages, (c) Topic-page integration**: gates. Phase 1 does not ship without all three.
- **(d) Wikilinks across all wiki types, (e) Wiki health/lint**: stretch. **Defer-not-cut criteria**: if Phase 1 build runs >18 days, (d) and (e) move to a follow-on plan named `phase-1-extension-wikilinks-lint` if at day 18 either has not landed. They are not removed from v2 scope; they're sequenced after Phase 2 chef ships.

## MC3 — Slack-substantial heuristic shadow-run

Per second-pass review:

- Implement heuristic as logging-only pass (no summary writes).
- Ship Phase 1 with `ARETE_SLACK_SUMMARIES=1` flag OFF by default.
- 7-day shadow-run period: heuristic logs to `memory/log.md` which threads it WOULD summarize, with trigger reason. John spot-checks daily.
- After ≤20% combined false-positive + false-negative rate, John flips `ARETE_SLACK_SUMMARIES=1` and slack writer goes live.
- If heuristic underperforms, tune in a small follow-up commit; don't block Phase 1 ship on perfect heuristic.

## Sub-orchestrator handoff brief

When meta spawns the Phase 1 sub-orchestrator, the brief includes:

1. **Read first**: this `plan.md`, parent `dev/work/plans/arete-v2-chef-orchestrator/plan.md` (especially Principles 1–9, AC table, AC8 ledger requirement, MC1, MC3), parent `pre-mortem.md` (R1 and-also-creep, R14 daily-driver, R19 hygiene re-introduction), parent `diary.md` (most recent decisions log + lessons-learned from Phase 0 ship), `services/LEARNINGS.md`, `cli/src/commands/LEARNINGS.md`, Phase 0's `build-report.md` and `review.md` for the pipeline pattern.
2. **Memory files**: `feedback_l3_memory.md`, `feedback_ai_fix_escalation.md`, `feedback_branch_isolation.md`, `feedback_commit_dist.md`, `feedback_batch_commitments.md`, `project_arete_v2_direction.md`, `project_slack_digest.md`.
3. **Worktree**: spawn with `isolation: "worktree"`. Auto-created off parent branch `worktree-arete-v2-chef-orchestrator`.
4. **Build sequence (suggested)**:
   - **Step 1**: define summary file schema (frontmatter + sections) in `packages/core/src/models/meeting-summary.ts` + parser/renderer + unit tests.
   - **Step 2**: meeting summary writer in new `packages/core/src/services/summary-writer.ts` (or similar) + writer hook in `meeting-apply.ts`.
   - **Step 3**: switch `topic-memory.integrateSource` to read summary (with transcript fallback).
   - **Step 4**: entity-org model + service (`packages/core/src/models/org-entity.ts` + `packages/core/src/services/entity.ts` extension) + writer hook in `meeting-apply.ts` (or separate refresh path).
   - **Step 5**: inbox doc summary writer (reuses Step 1 model with adapted shape).
   - **Step 6**: slack heuristic logging-only pass + `ARETE_SLACK_SUMMARIES=0` default; logging-only event format.
   - **Step 7**: tests (unit + integration + snapshot for topic regression).
   - **Step 8 (stretch)**: wikilinks across summaries + entities. Defer if step-7 lands at day 14+.
   - **Step 9 (stretch)**: `arete wiki lint` extension. Defer per same rule.
5. **Commit cadence**: per-step commits with `phase-1(<area>): <change>` convention. Suggested:
   - `phase-1(core): add MeetingSummary model + parser/renderer`
   - `phase-1(core): add SummaryWriterService + meeting-apply hook`
   - `phase-1(core): topic-integration reads summary with transcript fallback`
   - `phase-1(core): add OrgEntity model`
   - `phase-1(core): add org auto-detection + writer in EntityService`
   - `phase-1(core): inbox-add writes summary file`
   - `phase-1(runtime): slack-digest heuristic logging-only pass`
   - `phase-1(test): unit + integration + snapshot tests`
   - `phase-1: rebuild dist after Phase 1 changes`
6. **dist rebuild**: per `feedback_commit_dist.md`. Run `npm run build` after source changes; commit dist.
7. **Build report**: append `build-report.md` to this phase plan dir summarizing files touched, tests added, ACs verified, AC1.10 ledger filled in with actual counts, known issues, ready-for-review state. **Surface ledger truth even if Δ > 0** — don't massage.
8. **Skeptical-view review**: re-read the Skeptical view section at end of build. If something invalidates the counter-argument, surface to meta.
9. **When to engage meta**:
   - AC1.10 ledger Δ > 0 at ship time (per the explicit instruction above).
   - Discovery that hygiene-pass-1 already removed scope Phase 1 needs.
   - Test failing in a way that suggests an AC is wrong.
   - Stretch (d)/(e) running over budget — request defer authorization from meta.
   - Slack heuristic implementation surfaces a design question MC3 didn't anticipate.
10. **Return value**: sub-worktree path, branch name, build-report.md path, ledger summary, ready-for-review state.

## Cadence

- **Build**: 14–18 days (gates a–c). Stretch (d/e) deferred if running over.
- **Soak (slack shadow-run)**: 7 days post-ship; runs in parallel with Phase 2 build authorization.
- **Review**: ~1 day (eng-lead reviewer + fix-up cycle).
- **Ship to main**: AFTER John has tested/used Phase 0 for some duration. Phase 1 build can proceed immediately; main merge waits for John's go.

## Critical files (heads-up to sub-orchestrator)

| File | Role in Phase 1 |
|---|---|
| `packages/core/src/models/meeting-summary.ts` | NEW — summary file model |
| `packages/core/src/models/inbox-summary.ts` | NEW — inbox doc summary model (or merge with above) |
| `packages/core/src/models/org-entity.ts` | NEW — org page model |
| `packages/core/src/services/summary-writer.ts` | NEW — summary writer service |
| `packages/core/src/services/entity.ts` | Extend with `refreshOrgs` and org auto-detection |
| `packages/core/src/services/meeting-apply.ts` | Wire summary writer + org-entity writer hooks |
| `packages/core/src/services/topic-memory.ts` | Switch `integrateSource` to summary-first; transcript fallback |
| `packages/cli/src/commands/inbox.ts` | Wire inbox-add summary writer |
| `packages/cli/src/commands/entity.ts` (or extend `people.ts`) | NEW — `arete entity org create` |
| `packages/runtime/skills/slack-digest/SKILL.md` | Logging-only heuristic stanza; reference `ARETE_SLACK_SUMMARIES` flag |
| `.arete/memory/summaries/meetings/`, `summaries/inbox/`, `summaries/slack/`, `entities/orgs/` | NEW directories (created on first write) |
| `dev/work/plans/arete-v2-chef-orchestrator/phase-1-wiki-expansion/build-report.md` | NEW — sub-orch authors |
