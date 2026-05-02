---
title: "Phase 0 — Instrument + baseline"
slug: arete-v2-phase-0-instrument-baseline
parent: arete-v2-chef-orchestrator
status: drafting
size: small
tags: [v2, phase-0, instrumentation, baseline, telemetry]
created: "2026-05-01"
updated: "2026-05-01"
execution: sub-orchestrator (spawned from parent meta)
has_pre_mortem: false
has_review: false
has_prd: false
phase_in_v2: 0
---

# Phase 0 — Instrument + baseline

## Purpose

AC10 (median winddown ≤15 min) is the gating AC for Areté v2. It is unfalsifiable without a measured baseline. Phase 0 establishes that baseline AND seeds two minimum-viable substrates (item-fates log, cost aggregator) that later phases consume.

This is the smallest, lowest-risk phase. It is also the proof-of-pattern: meta-orchestrator → sub-orchestrator → eng-lead review → /ship cycle proves itself or breaks here.

**Phase 0 does not change behavior.** It only observes.

## Scope (three deliverables)

### D1 — Winddown timing (skill prose only)

**What**: when the agent runs `/daily-winddown`, log a start timestamp at skill invocation and an end timestamp at skill completion.

**How**: edit `packages/runtime/skills/daily-winddown/SKILL.md` to add a "Phase 0 instrumentation" stanza near the top:

```markdown
**Phase 0 instrumentation** — at skill start, append to `.arete/memory/log.md`:
`## [<ISO ts>] winddown | event=start`
At skill completion, append:
`## [<ISO ts>] winddown | event=end | duration_min=<n>`
Use `arete events log winddown --event start` / `--event end` (ships in this phase) to write these without manual file edits.
```

**Why a CLI helper instead of agent-writes-the-file**: keeps grammar consistent with existing log.md format; doesn't put file-formatting burden on the agent; a single CLI source-of-truth for log-event grammar.

### D2 — Item-fate event log

**What**: append-only JSONL at `.arete/memory/item-fates.jsonl`. Every staged item that gets approved / dismissed / skipped writes one event.

**Event shape**:

```jsonc
{
  "type": "item_fate",
  "ts": "2026-05-15T14:23:11Z",
  "item_text": "Send Lauren Q3 pushback on churn assumption",
  "item_kind": "action_item" | "decision" | "learning",
  "source_path": "resources/meetings/2026-05-15-glance-comms.md",
  "fate": "approved" | "dismissed" | "skipped" | "deferred",
  "reason": "low_priority" | "duplicate" | "user_skip" | "matched_completed" | null,
  "confidence": 0.8 | null,
  "importance_at_extraction": "light" | "normal" | "important" | "skip" | null
}
```

**Writers**: three sites in the existing extract → apply → approve pipeline.

| Writer site | Code path | Fate emitted |
|---|---|---|
| `meeting-apply.ts` skip path | when `staged_item_status === 'skipped'` | `fate: skipped` |
| `meeting-reconciliation.ts` dedup path | when an item is merged-as-duplicate or matched-as-completed | `fate: dismissed`, `reason: duplicate \| matched_completed` |
| `staged-items.ts` commit path (`commitApprovedItems`) | when an item moves from staged to approved | `fate: approved` |

For Phase 0, we instrument what exists today; we do NOT invent new fate paths (`deferred` will start emitting in Phase 2 when the chef-orchestrator's deferred tier exists).

**File location**: `.arete/memory/item-fates.jsonl` (alongside `log.md` and `index.md`). Append-only via `fs.appendFile`. No locking required; events are independent and order-preserved by timestamp.

**Module placement**: extend `packages/core/src/services/memory-log.ts` (which already owns the POSIX-O_APPEND atomicity per hygiene plan §"Out of scope") with an `appendItemFate(event)` function. Hygiene-pass-1 explicitly preserved `MemoryLogService`; this extension keeps the same atomicity guarantees.

### D3 — Cost telemetry aggregator (CLI)

**What**: new CLI command `arete cost report` that aggregates LLM costs already recorded in `memory/log.md`.

**Usage**:

```bash
arete cost report                        # default: last 7 days
arete cost report --since 14d            # rolling window
arete cost report --by skill             # group by skill (default: by day)
arete cost report --json                 # JSON output for piping
```

**Implementation**: parse `memory/log.md` for events with `llm_cost_usd=<n>` field (existing pattern from seed/refresh/claude-md-regen events). Sum, group, output as table or JSON.

**Why this is in Phase 0**: AC3 (Phase 2 cost reduction) needs a baseline; without an aggregator, the user can't see week-over-week trend.

**Module placement**: new file `packages/cli/src/commands/cost.ts`. Uses existing `parseLogLine` helper from `packages/core/src/utils/memory-log.ts` (added in topic-wiki Step 5).

### D4 — `arete events log` CLI helper (supporting D1)

**What**: small CLI that writes to `memory/log.md` with the standard grammar. Used by the daily-winddown skill prose to log start/end events.

**Usage**:

```bash
arete events log winddown --event start
arete events log winddown --event end
```

**Implementation**: thin wrapper around `MemoryLogService.append()`. Validates event-name + key=value pairs against the log grammar.

**Module placement**: new subcommand on `packages/cli/src/commands/events.ts` (file may not exist yet — create if absent). Future Phase 2/5 can extend this with more event types.

## Acceptance criteria

| AC | Verification |
|---|---|
| **AC0.1**: `arete events log winddown --event start` and `--event end` produce well-formed entries in `memory/log.md` matching the existing grammar. | Smoke test against a real workspace |
| **AC0.2**: daily-winddown skill prose includes the Phase 0 instrumentation stanza; agent invokes the CLI helper without manual file edits. | Manual run of daily-winddown end-to-end with logs verified |
| **AC0.3**: For every staged item that becomes approved, a matching `item_fate` event with `fate: approved` exists in `item-fates.jsonl`. Same for skipped (via `meeting-apply` skip path) and dismissed (via reconciliation dedup path). | Integration test on a fixture meeting; manual verification on a real meeting |
| **AC0.4**: `arete cost report --since 7d` returns a parseable summary (table by default, JSON with `--json`). Output matches sum-of-`llm_cost_usd` from log.md for the window. | Unit test against fixture log; smoke test |
| **AC0.5**: Item-fate writer is **append-only and atomic** — concurrent writes never produce a malformed line. | Concurrent-write stress test (10 parallel writers × 100 events each) |
| **AC0.6**: For 14 consecutive days post-ship, every winddown invocation in arete-reserv has matching start + end events in `memory/log.md`. | Passive observation; daily diary check |
| **AC0.7**: Phase 0 baseline produced at end of 14-day soak: median + p90 winddown duration; daily/weekly cost; item-fate distribution by `fate`. Recorded in this phase plan's `wrap-report.md`. | Author-verified |
| **AC0.8** (parent AC8 instance): adds-vs-removes count for Phase 0 — five concrete proxies. | See ledger below |

## Adds vs removes ledger (Phase 0 instance of parent AC8)

| Proxy | Before Phase 0 | After Phase 0 | Δ |
|---|---|---|---|
| CLI verbs | (sub-orch counts) | +2 (`cost`, `events log`) | +2 |
| Runtime skills | (sub-orch counts) | 0 (no new skills; daily-winddown gets a stanza) | 0 |
| Frontmatter fields across canonical file shapes | (sub-orch counts) | 0 (no new files) | 0 |
| Memory file types in `.arete/memory/` | (sub-orch counts) | +1 (`item-fates.jsonl`) | +1 |
| Services in `packages/core/src/services/` | (sub-orch counts) | 0 (extends existing `memory-log.ts`) | 0 |
| **Net combined** | | | **+3** |

Phase 0 is the only phase that nets positive on the parent's AC8 ledger — measurement adds before architecture removes. **This is acceptable per Principle 8 (baseline before architecture)** and is called out explicitly so it's not double-counted later. Subsequent phases must net ≤0 cumulatively *not including Phase 0*.

## Test strategy

| Layer | Tests |
|---|---|
| Unit | `cost.ts` aggregator (parses log.md fixture; correct sums; correct grouping). `memory-log.ts` `appendItemFate` (event shape validation; append-only; atomicity). `events.ts` log subcommand (grammar validation; rejects malformed input). |
| Integration | End-to-end: process a fixture meeting through extract → apply → approve; assert correct sequence of `item_fate` events in jsonl. End-to-end: run daily-winddown skill in a workspace fixture; assert start/end events in log.md. |
| Stress | Concurrent-write stress on `appendItemFate` (AC0.5). |
| Smoke | `arete cost report` against arete-reserv real log.md (read-only). `arete events log winddown` against a temp workspace. |
| Soak (passive) | 14-day daily verification that AC0.6 holds. |

**No mocks for memory operations**: integration tests must use real fs + StorageAdapter. Per `services/LEARNINGS.md` and the project's testing memory.

## Skeptical view (required per Principle 9)

**The strongest case for not doing Phase 0**: "We're spending 14 days collecting data we already informally know — winddown takes a long time. The user has been complaining about it for weeks. Skip the baseline; just ship Phase 1 and Phase 2; if it feels better at the end, we declare success."

**Counter**: AC10 is the gating AC. Without a measured baseline, "feels better" is the user's enthusiasm — exactly the bias R15 (builder/user role conflict) identifies. The 14 days is not gated by build time (Phase 0 build is 1–2 days); it's passive data collection. Subsequent phases can begin in parallel once Phase 0 build ships, but AC10 verification requires the baseline to be in hand at Phase 2 ship time.

**Residual risk**: 14 days of baseline collection happens during current-state operation. If today's pipeline is degraded for any reason during that window (e.g., a slow week, an LLM provider hiccup), the baseline is biased. Mitigation: report median + p90, not just mean; outliers are visible.

## Rollback

Trivial. Phase 0 is purely additive observation.

- D1: revert the daily-winddown SKILL.md stanza.
- D2: delete `item-fates.jsonl`; revert the three writer call-sites.
- D3: delete `cost.ts`; remove the CLI registration.
- D4: delete `events.ts` (or the `log` subcommand if the file existed prior).

No data migration; no user-visible behavior change to undo.

## Hygiene reconciliation

Phase 0 does NOT touch any code that hygiene-pass-1 deleted. It extends `MemoryLogService` (which hygiene explicitly preserved) and adds new files. No conflict.

## Sub-orchestrator handoff brief

When meta spawns the Phase 0 sub-orchestrator, the brief includes:

1. **Read first**: this `plan.md`, the parent `dev/work/plans/arete-v2-chef-orchestrator/plan.md` (especially principles + ACs), the parent `pre-mortem.md` (especially R10–R19), parent `diary.md` (most recent decisions log), and `services/LEARNINGS.md`.
2. **Memory files to consult**: `feedback_l3_memory.md`, `feedback_ai_fix_escalation.md`, `feedback_branch_isolation.md`, `feedback_commit_dist.md`, `project_arete_v2_direction.md`.
3. **Worktree**: spawn with `isolation: "worktree"` from this parent worktree (auto-creates a sub-worktree off `worktree-arete-v2-chef-orchestrator`).
4. **Branch naming**: whatever the auto-spawn produces; meta will merge by path/branch returned.
5. **Commit cadence**: per-deliverable commits (D1, D2, D3, D4 each their own commit; tests can be additional commits within the same deliverable). No squash. Commit messages use the convention: `phase-0(<area>): <change>` where `<area>` is `cli`, `core`, `runtime`, `test`, `docs`.
6. **Build all four deliverables** (D1–D4). Don't skip D4 — it's the helper D1 needs.
7. **Tests**: run `npm test` and `npm run typecheck` before declaring complete. Any new test file lives next to its target (`packages/core/test/...`, `packages/cli/test/...`). Hygiene-style: don't add abstraction for one-off eval scripts (per `feedback_eval_harness_local.md`).
8. **dist/ build**: rebuild dist artifacts and commit them per `feedback_commit_dist.md`. CLI changes affect `packages/cli/dist/`; core changes affect `packages/core/dist/`.
9. **Build report**: append a `build-report.md` to this phase plan dir summarizing: files touched, tests added, AC0.1–AC0.5 verification status, AC8 ledger (filled in with actual counts), known issues / deferred items, ready for /review.
10. **Skeptical-view review**: re-read Skeptical view section. If during build something invalidates the counter-argument, surface it to meta-orchestrator (see "When to engage meta" below).
11. **When to engage meta**:
    - Encountering a parent-plan decision that doesn't apply (e.g., file structure that contradicts).
    - Discovering hygiene-removed scope that Phase 0 actually needs.
    - Test or AC failing in a way that suggests the AC itself is wrong.
    - Otherwise: complete autonomously.
12. **Return value**: sub-worktree path, branch name, build-report.md path. Meta will spawn eng-lead reviewer next.

## Cadence

- **Build**: 1–2 days (small phase).
- **Soak (data collection)**: 14 days, runs in parallel with Phase 1 build; AC10 baseline is the gate, not the calendar.
- **Review**: ~1 day (eng-lead reviewer + meta address).
- **Ship to main**: same-day after APPROVE.

## Critical files (heads-up to sub-orchestrator)

| File | Role in Phase 0 |
|---|---|
| `packages/core/src/services/memory-log.ts` | Extend with `appendItemFate(event)`; preserve atomic-append guarantees |
| `packages/core/src/utils/memory-log.ts` | Reuse `parseLogLine` for cost aggregator |
| `packages/core/src/services/meeting-apply.ts` | Add item-fate writes at skip path |
| `packages/core/src/services/meeting-reconciliation.ts` | Add item-fate writes at dedup/match paths |
| `packages/core/src/integrations/staged-items.ts` | Add item-fate writes at `commitApprovedItems` |
| `packages/cli/src/commands/cost.ts` | NEW |
| `packages/cli/src/commands/events.ts` | NEW (or extend if exists) |
| `packages/runtime/skills/daily-winddown/SKILL.md` | Add Phase 0 instrumentation stanza |
| `packages/cli/test/commands/cost.test.ts` | NEW |
| `packages/core/test/services/memory-log.test.ts` | Extend with item-fate tests |
| `dev/work/plans/arete-v2-chef-orchestrator/phase-0-instrument-baseline/build-report.md` | NEW — sub-orch authors |
