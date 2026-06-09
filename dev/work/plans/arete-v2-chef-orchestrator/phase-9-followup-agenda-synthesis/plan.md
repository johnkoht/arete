---
title: "Phase 9 follow-up — enforce agenda synthesis (F3 fix)"
slug: phase-9-followup-agenda-synthesis
status: draft
created: "2026-06-08"
parent: arete-v2-chef-orchestrator
depends_on: Phase 9 (brief primitive restore) — shipped
---

# Phase 9 follow-up — enforce agenda synthesis (F3 fix)

## Problem (evidenced, not theorized)

Phase 9 restored typed `arete brief` and refit `prepare-meeting-agenda` SKILL.md to call it, to
recover April-quality agendas. The primitive works, but **agenda quality is still regressed** —
the agent invokes the brief, has the synthesis prose, has the data, and pattern-fills a skeleton
anyway. This is pre-mortem risk **F3** ("agent reads the brief but still pattern-fills the
template"), realized.

**Hard evidence (2026-06-08):**
- `now/agendas/2026-06-09-anthony-john-weekly.md` — Priorities filled (with commitment IDs +
  recent context), but Feedback&Growth / Support&Blockers / Next Steps EMPTY.
- Baseline `resources/meetings/2026-04-28-anthony-john-weekly.md` — themed, time-boxed,
  discussion-topics woven in, prior-conversation callbacks.
- `dev/diary/brief-invocations.log` shows the `--meeting` + `--person` calls fired for this exact
  agenda. SKILL.md has the "synthesize / do not pattern-fill" prose. Person file has the unused
  `1:1 Discussion Topics`. So: not a data gap, not a prose gap, not a "not on Phase 9 code" gap.
- **Aggravator CONFIRMED (A/B): batch generation** — the skeleton came from a 4-meeting batch run.
  Re-running the same agenda in a fresh SINGLE-meeting conversation produced a markedly richer
  agenda (framing lead-in, populated Status Sweep / Feedback&Growth / Support&Blockers), same code
  + data. So batch-mode is a real, reproducible degradation trigger — AC2 below is load-bearing.
  Note: the single run is still lighter than the April bar (no time-boxes, fewer discussion-topic
  questions), so a second regression layer remains beyond the batch effect (AC3).

NOT the cause: missing stance data (April was rich with zero stances; today's skeleton coexists
with 10 stances).

## Goal

Make agenda synthesis **non-skippable**: when `arete brief` returns real context, the agent must
produce themed sections (or an explicit, honest "nothing to synthesize here" note) — never a
template with empty qualitative sections. Recover the April quality bar, and make it hold under
batch generation.

## Approach (cheapest-first; prefer prose/gate before code)

1. **Quality assertion in the skill flow (primary).** Add a hard self-check step to
   `prepare-meeting-agenda` SKILL.md: before saving, the agent must verify no themed/qualitative
   section is empty when the brief returned non-empty context for it; if empty, it must either
   synthesize from the available signal (person `1:1 Discussion Topics`, open commitments, recent
   meetings, wiki callbacks) or write a one-line explicit reason it's empty. "Skeleton + empty
   sections" is an explicit failure state, not an acceptable output.
2. **Batch-mode guard.** Detect/avoid the degradation path: when preparing agendas for multiple
   meetings in one run, each agenda still gets the full per-agenda synthesis pass (no shared
   shortcut). Document the anti-pattern in PATTERNS.md (the cheap-section-only batch failure).
3. **Deterministic floor (consider, only if 1–2 insufficient after a soak).** A CLI/formatter
   helper that, given the brief + template, pre-seeds each themed section with its candidate
   source bullets (discussion-topic questions, open-commitment lines, recent-meeting callbacks)
   so the agent starts from populated scaffolding rather than an empty template — turning
   "synthesize from scratch" into "curate + frame," which is far less skippable. This is a code
   add; gate it behind whether 1–2 alone clear the soak bar (substitution discipline).

## Acceptance criteria

- **AC1**: For a meeting whose `arete brief --meeting` returns non-empty context, the produced
  agenda has NO empty qualitative section — each is either synthesized or carries an explicit
  one-line reason. Verified on the Anthony 1:1 (the regression case) + ≥2 others.
- **AC2**: Batch generation (≥3 meetings in one run) produces per-agenda synthesis equal in depth
  to single-agenda generation — no cheap-section-only degradation. Verified by generating a batch
  and diffing section richness vs single runs.
- **AC3**: Re-meet the original Phase 9 soak bar — ≥5 agendas at the April quality bar
  (`resources/meetings/2026-04-28-anthony-john-weekly.md` / `2026-04-29-john-lindsay-11.md`),
  checked against real output, with `brief-invocations.log` confirming the verb fired.
- **AC4 (ledger)**: Prefer prose/gate (zero net code). If the AC2/AC3 soak forces the deterministic
  floor (approach 3), record the LOC add + substitution argument explicitly.

## Skeptical view

- Maybe the agent CAN'T reliably self-check section emptiness from prose alone — in which case
  approach 3 (deterministic scaffolding) is the real fix and approaches 1–2 are lipstick. Don't
  declare victory on a single good agenda; the failure is load/batch-dependent, so the soak must
  include a batch run.
- A "write an explicit reason it's empty" escape hatch can become a lazy default ("no items")
  that's just a fancier skeleton. The soak bar (AC3) is the guard: real richness, not honest
  emptiness, is the target.

## Rollback

Prose/PATTERNS changes revert in a single commit. If approach 3 ships, it's a separate gated
helper revertable independently.

## References
- Memory: `memory/entries/2026-06-08_agenda-synthesis-f3-regression.md`
- `POST-MERGE-WORKLOG.md` I-0; Phase 9 `pre-mortem.md` (F3); `build-report-9b-auto.md`
- SKILL.md: `packages/runtime/skills/prepare-meeting-agenda/SKILL.md` (lines ~72–95 synthesis prose)
