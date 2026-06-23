# Winddown-approval stack — single-pass extraction → chef reconcile → theme-render (2026-06-22)

Shipped in v0.20.0 (alongside weekly-working-memory). The daily winddown's extraction + reconcile + review pipeline, fully flag-gated — at default config (`extraction_mode: legacy`, `reconcile_mode: inline`, `winddown_render: prose`) behavior is byte-for-byte identical to 0.19.0. Built incrementally over ~2 weeks and soaked as the builder's daily driver 6/17–6/22 before merge.

## Learnings

- **Flag-gated default-off is what made "merge to main while still soaking" safe.** Every new behavior sits behind a flag; AC7 (no-regression) was a tested invariant — defaults reproduce prior output byte-for-byte. The stack landed on main without a clean install seeing any change. The realization that unblocked the merge: with default-off, the *flag* is the real on/off boundary, not the version number — so per-feature version bisect is largely moot and bundling features in one release loses little.
- **Byte-identical anchors via ONE shared line emitter** let two render layouts (checklist per-meeting, theme per-project/area) reuse the same anchor-keyed apply machinery unchanged. Decorate the visible text around the anchor; never re-emit the anchor in the second layout. (See `packages/core/src/integrations/LEARNINGS.md`.)
- **Anchor "must never happen" invariants to persisted state, not caller discipline.** The #22 supersession `[ ]` guarantee (a reversed morning decision must never auto-commit) was first caller-dependent → latent footgun; fixed by keying `prefillChecked` on the stored `skipKind === 'superseded'`.
- **Soak surfaced the real bugs the 5000-test suite could not**: the moot-skip miss (#21), topic-detection unreliability (title-blind + `status` stop-token), the orphaned reconcile engine the SKILL never called (#16), and — the sharpest one — a broken Anthropic OAuth credential that killed the extract pipeline while the agent silently fell back to hand-written prose in the wrong format. Lesson reinforced: **fail loud and surface a dead pipeline; never quietly switch output formats.**
- **#22 supersession strikethrough remained unproven on live data at merge** — no reversal-day happened to occur during the soak window. Safe to merge anyway because it's default-off; soak continues via the flag to catch a real reversal.
- Built autonomously as a meta-orchestrated per-gate loop (build agent + parallel eng-lead review + lead verify at each gate); recovered cleanly from a mid-run subagent socket death (edits were on disk; lead finished the tests + commit).

Detail: `dev/work/plans/single-pass-extraction/STATUS.md`, `dev/work/plans/theme-render/`, `dev/work/plans/chef-holistic-reconcile/`.
