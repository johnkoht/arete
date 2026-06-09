---
title: "Phase 7a — pre-mortem"
slug: phase-7a-pre-mortem
created: "2026-05-29"
parent: phase-7a-cross-skill-foundations
---

# Pre-mortem

If this phase ships and 2 weeks later we say "that was a mistake," what would have caused it? Enumerate honestly. Each risk gets a concrete mitigation, not a wave-of-hand.

## R1 — Person frontmatter sparseness makes AC5 cosmetic

Today only `email` is populated across all `~/code/arete-reserv/people/internal/*.md`. AC5b (`--channels` flag) returns `{email}` for everyone. AC5c (`audit-channels`) surfaces the gap visibly. AC5a (doc) describes the convention but no enforcement and no backfill.

**Failure mode**: 7a ships, Phase 8 ships, reconciler runs, and slack→person match-rate is ~10%. User sees "23 of 41 people missing slack_user_id" warning every winddown but doesn't backfill because the value isn't proven yet (chicken and egg). Reconciler's skip rule 1 ("intent → fulfilling slack DM") rarely fires. The whole 7a→8 chain ships as theoretically-correct but practically-degraded.

**Mitigation**:
- AC5c audit output should give a one-shot remediation hint, not just a count: "Run `arete people backfill-channels --interactive` to populate missing slack_user_id from Slack MCP." Defer the implementation to Phase 7c if 7a runs out of scope; the suggestion line is cheap and primes the user.
- Phase 8 reconciler should gracefully degrade: when `slack_user_id` missing, fall back to name-string heuristic match (lower confidence; pushed to `## Uncertain` tier instead of auto-collapsed). This is design discipline for Phase 8, but note it in 7a build-report.
- Build sub-orch runs `audit-channels` on arete-reserv during build and reports the actual numbers in build-report. Sets expectations.

## R2 — AC1 prose contract violated by sub-agent in practice

The contract "skill SHOULD NOT write to disk, propose actions, or engage user in gather-only mode" is enforced only by the sub-agent following SKILL.md instructions. A specific failure mode: slack-digest's standalone gather steps include writing the digest to `resources/notes/YYYY-MM-DD-slack-digest.md` (per `SKILL.md` integration block). If gather-only sub-agent follows the standalone steps verbatim, it WILL write that file even when invoked from Phase 8's reconciler — bypassing the contract.

**Mitigation**:
- AC2/AC3 SKILL.md gather-only sections must be EXPLICIT about which steps to skip in gather-only mode. Specifically: the `resources/notes/` write is skipped; integration block is gather-only-mode-aware.
- Orchestrator (Phase 8) detects post-hoc: after sub-agent returns, check `git status` or check `resources/notes/` for unexpected new files. If detected, surface warning in build-report (one-time per session).
- This is design discipline for Phase 8 — note in 7a build-report as "AC1 contract enforcement is the orchestrator's responsibility, not the harness's."

## R3 — `arete areas` namespace conflicts with future area work

7a ships `arete areas list` + `arete areas epics`. Future area work (focus, sync, refresh, etc.) must fit this shape. If a natural verb is "show", it conflicts with `arete people show <slug>` precedent (single-person fetch). Mismatch could force awkward naming later.

**Mitigation**:
- AC4 build sub-orch sketches 2-3 hypothetical future subcommands in a comment on `arete areas` command file. If any conflict with `list` / `epics` shape, surface for resolution before commit.
- Documentation in command file: "namespace convention: `arete areas <noun-or-noun-phrase>`, not `arete areas <verb>`. Verbs go on subcommand options."

## R4 — Sunset trigger (2026-07-15) is too lenient

Plan sets 2026-07-15 as Phase 8 ship deadline before 7a substrate sunsets. That's ~7 weeks. Recent phase wall times have been MUCH shorter (followup-5 was ~3 hours; Phase 3.5 followup-4 was ~1 hour). If Phase 8 build is similarly fast, the only thing preventing it from shipping in 1 week is user availability.

**Failure mode**: Phase 8 ships at week 6 with bugs surfaced during user testing window; bugs take another 2 weeks to fix; 7a substrate sits dormant for 6+ weeks; gather-only sections drift from PATTERNS.md as other phases revise the chef pattern.

**Mitigation**:
- Reduce sunset trigger to 2026-06-30 (5 weeks). Tighter accountability.
- Build sub-orch notes in build-report: "Phase 8 build should start within 7 days of 7a merge to keep momentum."
- Diary entry on 7a wrap-up explicitly schedules Phase 8 plan drafting.

## R5 — Calendar pull doesn't return others' invites

AC6 verification step asks whether `arete pull calendar` returns events organized by others where user is attendee. If NO, spec example `ai_004` (auto-skip "meet with Nick & Anthony" because invite exists) only works for user-organized events. Most meetings the user attends are organized by others — this is the dominant case.

**Mitigation**:
- AC6 verification MUST run on a real workspace (arete-reserv) with mixed-organizer events. Document the finding precisely.
- If `arete pull calendar` is user-organized-only, AC6 ships flag additions to fetch all-attended events (or Phase 8 calls calendar MCP directly for attendee-status lookup).
- If even adding flags is complex, document the limitation in Phase 8 design.

## R6 — Gather-only mode adds drift between standalone and orchestrator paths

Standalone slack-digest invocation: SKILL.md Steps 1-N + engages user. Gather-only invocation: Steps 1-N + returns JSON. If a future SKILL.md revision touches Steps 1-N, both paths inherit the change automatically (good). But if the revision changes the output shape (e.g., adds a new field to staged items), the gather-only JSON shape silently changes, breaking Phase 8 reconciler's parser.

**Mitigation**:
- AC2/AC3 SKILL.md gather-only sections include a "JSON output shape" sub-section with EXAMPLE output. Tests assert SKILL.md contains the example block.
- Phase 8 reconciler's parser is permissive (ignores unknown fields, errors only on missing required fields).
- A future Phase 7c can add a JSON schema file (`packages/runtime/skills/gather-only.schema.json`) that the orchestrator validates against. Out of scope for 7a.

## What's the single most likely thing to go wrong?

**R1 (person frontmatter sparseness → Phase 8 reconciler degraded)**. AC5's audit + flag ship correctly. But without user backfill action (slack_user_id, alt_emails populated for 41 internal people = real manual work), Phase 8's slack→person match rule rarely fires. The "auto-skip 3 of 5 action items" win from the spec depends on identity match working. AC5c's audit makes the gap visible but doesn't drive backfill behavior. Without backfill, Phase 8 ships with degraded user experience and the substitution argument for 7a's substrate-without-immediate-value choice looks weak.

**Mitigation that should be elevated to a hard build deliverable**: AC5c's audit output must include EXACT bash commands to populate the most-frequent counterparties. E.g., "Top 10 missing-channel people by Slack message volume: anthony-avina, lindsay-gray, ... — populate via:
```
arete people edit anthony-avina --slack-user-id <id>
```
" where `arete people edit` is either existing or a new minimal sub-command (5d). 5d adds ~30 LOC. Cost is low; value is making backfill actionable not just visible.
