---
title: "Phase 8 followup-2 — pre-mortem"
slug: phase-8-followup-2-pre-mortem
created: "2026-05-31"
parent: phase-8-followup-2-brief-llm-removal
---

# Pre-mortem

If 8f2 ships and 2 weeks later we say "that was a mistake," what would have caused it?

## R1 — review-plan quality regresses post-removal

**Failure mode**: `review-plan` skill loses its LLM-synthesized briefing context. The skill now gets raw assembled markdown (possibly thousands of words of context) and must filter for relevance itself. If the skill's prose isn't tuned for that, output quality drops — user reviews a plan and gets noisier feedback or missed concerns.

**Mitigation**:
- AC4 explicitly updates `review-plan` SKILL.md to reflect the new context shape
- The chef pattern (Phase 2+) demonstrated five skills doing their own context filtering successfully
- If quality drops materially, a small follow-up commit re-tunes review-plan prose

**Residual**: subjective. User notices over time; surface as a "review-plan re-tune" task if needed.

## R2 — Audit missed a `synthesizeBriefing` consumer

**Failure mode**: a non-test consumer of `synthesizeBriefing` exists that the audit missed (only grepped `synthesizeBriefing`). Removal breaks that consumer silently.

**Mitigation**: build sub-orch's R-grep step BEFORE removal — re-runs the grep and halts if any non-test consumer surfaces. Mirrors 7b's R4 pattern that caught zero consumers there.

## R3 — Generator emit path inadvertently changes

**Failure mode**: AC3 says skill-commands.ts:22 emit-line "no behavior change" — but the comment update or surrounding code change might subtly break what the generator emits.

**Mitigation**:
- Snapshot before/after of a generated command for review-plan, included in build-report
- Existing generator test (if any) catches the regression

## R4 — `--raw` flag removal breaks user scripts

**Failure mode**: user has `arete brief --for X --raw` in a script/alias. After removal, commander rejects unknown `--raw` flag → script fails.

**Mitigation**:
- Plan acknowledges this. Sub-orch can choose to keep `--raw` as deprecated no-op vs remove. Lean: remove, but document in commit message that scripts using `--raw` need to drop the flag.
- Low population: `arete brief` is a chef-internal verb; user-facing scripts unlikely to invoke it directly. Bounded blast radius.

## R5 — JSON consumer breakage on dropped fields

**Failure mode**: a tool parses `arete brief --json` looking for `synthesized` / `truncated` / `synthesis` fields. Post-removal, those are `undefined`.

**Mitigation**:
- R-grep step BEFORE removal greps for these field names across the codebase
- External consumers (if any) are not under repo control; document in build-report. Likely zero non-Areté consumers since `arete brief` is internal.

## What's the single most likely thing to go wrong?

**R1 (review-plan quality drop)**. The other risks have explicit mitigations (R-grep, audit re-run, snapshot, flag-handling). R1 is the one that's subjective — user reviews a plan in week 1 post-merge, the output feels noisier or less focused than before, and we can't tell if it's the removal or a one-off bad-input case. Mitigation is "re-tune review-plan if needed" but the detection latency is real.
