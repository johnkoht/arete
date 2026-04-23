---
title: "Topic Wiki Memory — Phase C (Deferred Follow-Ups)"
slug: topic-wiki-memory-phase-c
status: draft
size: medium
tags: [memory, l3, topics, follow-up]
created: "2026-04-23T00:00:00.000Z"
updated: "2026-04-23T00:00:00.000Z"
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
depends_on: topic-wiki-memory
steps: 7
---

# Topic Wiki Memory — Phase C (Deferred Follow-Ups)

Follow-up plan for work deferred out of the topic-wiki-memory build
(branch: `worktree-topic-wiki-memory`, merged as Phase A + Phase B).

The Phase A+B delivery gave us the full Karpathy loop wired end-to-end:
biased extraction → alias/merge at `meeting apply` → incremental
`integrateSource` at `meeting approve` → boot-context injection into
CLAUDE.md on `arete memory refresh`. This plan captures the known
second-order items we explicitly deferred, and the test-infrastructure
gaps surfaced by the final eng-lead review.

None of these items block merge. They are ordered from "user-visible
sharp edge" to "longer-lead engineering invest."

## Context

See `dev/work/plans/topic-wiki-memory/plan.md` for the parent plan and
`memory/entries/2026-04-23_topic-wiki-memory-learnings.md` for the
as-built synthesis and the explicit "follow-ups" list.

## Steps

### 1. Narrative drift mitigation (every-Nth full rebuild)

**Problem.** `integrateSource` synthesizes one meeting at a time against
the prior page snapshot. Over dozens of sources the narrative can drift:
sentence order ossifies, a factual correction made in source 5 never
fully overrides the phrasing introduced in source 2.

**Approach.** Add an opt-in "full rebuild" mode to
`TopicMemoryService.refreshAllFromMeetings` — every Nth refresh (or on
demand via `arete memory refresh --full-rebuild`), re-synthesize the
whole page from `sources_integrated` as a batch rather than
incrementally. Start N=conservative (e.g. 20) and tune.

**Acceptance.** `--full-rebuild` flag exists. Narrative coherence
measurably improves on a topic with 10+ sources vs. pure incremental.
Cost of the full rebuild is visible in the refresh summary.

### 2. Background queue for Hook 2 (meeting approve → topic ingest)

**Problem.** `meeting approve` now blocks on `integrateSource` for each
touched topic. For 2–3 topics this is 6–9s synchronously; the latency
hint (added as a fast-follow) mitigates surprise but doesn't remove the
wait. `--skip-topics` exists as an escape hatch but loses the
write-through guarantee.

**Approach.** Move Hook 2 to a background queue (file-backed, single
worker) that drains on next `arete status` / `arete brief` / explicit
`arete memory refresh`. Preserve the current sync default for small
meetings; fall back to queue when predicted duration > threshold (e.g.
>2 topics AND AI configured).

**Acceptance.** Approve returns promptly for meetings with 3+ topics.
Queue visible via `arete memory status`. Worker idempotent against
content-hash dedup.

### 3. Cursor AGENTS.md memory injection

**Problem.** Active-Topics boot-context injection currently happens
**only in ClaudeAdapter** (Phase B). `CursorAdapter.supportsMemoryInjection()`
returns `false` and explicitly ignores the passed `memorySummary`. Cursor
users get topic-aware extraction (from Phase A — the prompt-side bias)
but no boot-context wikilink list in `AGENTS.md`.

**Approach.** Implement the symmetrical path in `CursorAdapter`:
generate an `Active Topics` section (plain list or area-grouped, per
Cursor's preferred conventions) and inject via `.cursor/rules/` or
equivalent. Verify that Cursor's rule-loading semantics play nicely
with a data-derived section that regenerates on every `arete memory
refresh`.

**Acceptance.** Cursor workspaces show the same boot-context topic list
as Claude. `supportsMemoryInjection()` returns `true`. Round-trip test:
create Cursor workspace → refresh memory → AGENTS.md contains topic
section.

### 4. LLM contradiction lint

**Problem.** `arete topic lint` currently catches mechanical issues:
stale, stub, orphan, dangling wikilinks, parse errors. It does not
catch **semantic** contradictions between sources_integrated and the
narrative, or between two co-existing statements in the same page.

**Approach.** Add `arete topic lint --semantic` that dispatches an LLM
pass per topic page asking: "Does any claim in the narrative sections
conflict with any other claim, or with the sources_integrated entries?"
Emit findings as advisory diffs, not auto-fixes. Budget-gated.

**Acceptance.** Lint reports at least one false-positive-free
contradiction on a crafted test fixture. Cost per topic reported.

### 5. AI-mock CLI test infrastructure

**Problem.** Final eng-lead review flagged that we have zero
**happy-path** CLI integration tests for the Karpathy loop — every test
skips the LLM path via `ARETE_NO_LLM=1` or bypasses the full
`meeting apply/approve` wiring. This is fine for correctness (service
tests cover the logic) but misses regressions in the CLI → service
wiring (exactly the "services tested ≠ services wired" failure mode
we hit twice during this build).

**Approach.** Stand up an AI mock layer usable from CLI tests: a
swappable `services.ai.call()` implementation that returns scripted
responses keyed by prompt shape. Hook into the CLI bootstrap so tests
can inject fixtures. First test to land: full `meeting apply` →
`meeting approve` on a 2-topic fixture, asserting Hook 1 aliasing and
Hook 2 integration both fire.

**Acceptance.** At least three happy-path CLI tests exercise the LLM
path via the mock. Mock scripting feels easier than current
`ARETE_NO_LLM=1` skips.

### 6. Historical meeting backfill (`topics:` frontmatter)

**Problem.** Discovered during arete-reserv dry-run: 5 of 187 historical
meetings have `topics:` frontmatter. The biased-extraction prompt from
Phase A populates `topics:` going forward, but pre-existing meetings
are invisible to `arete topic seed` and `refreshAllFromMeetings`. The
wiki substrate is therefore only as rich as the user's recent activity
unless we backfill.

**Approach.** Add `arete meeting extract-topics --historical` (or
similar) that runs the topics-only portion of the extraction prompt
against every meeting missing `topics:` frontmatter, writing the result
back into the file. Preserve all other frontmatter and body. Idempotent
via content hash. Budget-gated with dry-run like `topic seed`.

**Acceptance.** Running the command on arete-reserv populates `topics:`
on a double-digit count of historical meetings. A subsequent
`arete topic seed` integrates them without reprocessing. Cost per
meeting reported in dry-run.

### 7. Pre-existing person-memory-integration failures

**Problem.** 6 tests in
`packages/cli/test/person-memory-integration.test.ts` fail on main (pre-dating
this work — confirmed via git-stash baseline during topic-wiki-memory
build). They were explicitly triaged as out-of-scope at that time.

**Approach.** Triage each failure. Classify as (a) genuinely broken
(fix), (b) test-environment drift (repair fixture), or (c) obsolete
assertion (delete). Do not expand scope: this is a cleanup.

**Acceptance.** `npm test -- packages/cli/test/person-memory-integration`
is green OR the test file is deleted with a LEARNINGS.md entry
explaining why.

## Notes

- Items 1, 2, 4, and 6 are net-new features with LLM cost.
  Item 6 (historical backfill) is probably the highest-leverage of the
  four — it unlocks the value of the whole system for pre-existing
  workspaces.
- Item 3 unblocks Cursor parity — good candidate for a small
  standalone PR once the interface is stable.
- Item 5 is engineering infrastructure; it accelerates every
  downstream CLI change, not just topic work. Consider prioritizing
  early even though it doesn't ship user-visible value.
- Item 7 is tech debt cleanup.
