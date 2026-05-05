---
title: "Phase 2 — Eng-lead /review"
parent: arete-v2-chef-orchestrator
phase: 2
status: APPROVE WITH MINOR CONCERNS
reviewer: eng-lead
created: "2026-04-30"
---

# Phase 2 — Eng-lead /review

## 1. Functional verification

| Gate | Status | Notes |
|---|---|---|
| AC2.1 PATTERNS.md ships first | PASS | Commit `7af57d39` precedes `ae471a40` (daily-winddown rewrite). Verified via `git log`. |
| AC2.2 APPEND seed (idempotent) | PASS | `seedSkillsLocal()` in `packages/core/src/services/skills-local.ts` honors existing files; wired into `WorkspaceService.create()` AND `update()`. Seed template prompts MCP listing per plan. 11 unit tests pass. |
| AC2.3 "Read first" stanzas | PASS | All 5 SKILL.md files include the stanza referencing `.arete/skills-local/<slug>.md`. Asserted by `chef-orchestrator-skills.test.ts`. |
| AC2.4 Reason labels + Uncertain tier | PASS (structural) | Pattern 2 in PATTERNS.md prescribes `— <reason>`; daily-winddown adds skill-specific extensions (open-commitment-age, today's-meeting-source, inbox-capture). Live behavior validates in soak. |
| AC2.5 SKILL.legacy.md × 5 + resolver | PASS | `diff` against pre-rewrite tree confirms verbatim copies for all five. `arete skill resolve <slug>` works (verified). 22 resolver tests pass. Fallback warning when legacy missing is correct. |
| AC2.6 Action proposals (verb + params + mode) | PASS (structural) | PATTERNS.md Pattern 3 documents both modes. Skill prose includes draft-only Jira examples in template outputs. |
| AC2.7 Sidecar + deferral_disagreement | PARTIAL | Sidecar naming convention specified in skill prose. `deferral_disagreement` event spec lives in PATTERNS.md prose only — no code wiring (acknowledged in build-report). Acceptable as Phase 2 instrumentation; deferred to first real pull-back during soak. |
| AC2.8 frontmatter.approved_items removed | PASS | Writer (`staged-items.ts:572`) deletes the field defensively. Readers (`meeting-reconciliation.ts`, backend `workspace.ts`, CLI `meeting.ts`) read `## Approved` body sections with backward-compat fallback to legacy frontmatter. Web UI consumes the same shape via `getMeeting()` — no UI code change needed. 13 `parseApprovedSection` tests pass. |
| AC2.12 Tests + typecheck | PASS | Sampled 4 test files via `tsx --test` and `vitest run` — all green. No `npm test` at root. |

## 2. Skill prose quality (most important)

I read all five rewrites with an adversarial eye, applying Call-2 questions (engage-once, parallel gather, APPEND-before-judgment, reason labels, Uncertain tier, action mode tags).

**Daily-winddown** (the validation skill) — Step 1 explicitly says "Run in parallel (no engagement gates between)" and explains *why* parallel matters. APPEND read is in Step 0 AND Step 2; both correctly point at `.arete/skills-local/daily-winddown.md`. Reason-label rules at lines 228–234 are unambiguous. Importance handling (lines 324–343) explicitly says "When in doubt, surface to Uncertain rather than auto-defer" — this is the post-A/B refinement and it lands correctly. Single engage at Step 4. Clear.

**Week-plan two-engage variant** — clean. Engages 1 and 2 are explicitly numbered (Step 3 and Step 5), with two distinct curated views and an explicit "Wait for user response" between. The "third engage temptation" guard ("if the agent is tempted to ask a third question, the answer is 'make a default choice and surface it'") is in PATTERNS.md and load-bearing. PATTERNS.md §"Two-engage variant" explicitly covers the same.

**Process-meetings** — clean engage-once. Lines 211–222 correctly distinguish caller-context (parent skill owns engagement) vs standalone (this skill owns Step 4 engagement). One concern: the prose still uses "Phase 1h caller" and "Phase 2 (subagent-style invocation)" terminology (lines 51, 211, 294–295) referring to the new `daily-winddown`'s Step 1h. The terminology is technically correct (Step 1h exists in the new daily-winddown at line 125), but "Phase" is a stale word from the legacy 4-phase architecture and could mislead a reader. Suggest renaming to "Step 1h caller" in a follow-on commit. Minor; not a merge blocker.

**Meeting-prep** — single-engage, clear. The brief template is concrete (lines 142–211). Importance signals near line 132 (1:1 with leadership / customer review) handle the heavy/light split well.

**Weekly-winddown** — single-engage, clean. Same shape as daily but week-scope. Explicit Pattern 1 single-engage call-out at line 25. Sidecar grouping by reason category is right for the larger volume.

### Specific ambiguities flagged

- **daily-winddown SKILL.md line 125 (Step 1h)**: `arete meeting extract <file> --context /tmp/<slug>-context.json --stage --reconcile --skip-qmd --json` — the comment says "Max 4 in parallel; batch larger sets" but does not say *how* to batch. The agent might serialize. Suggest: "process up to 4 concurrently; for batches >4, run them in waves of 4". Minor.
- **week-plan SKILL.md line 244**: "4 stale items pruned — see ./deferred-week-2026-WNN.md (if user wants to spot-check before commit)" — the parenthetical is ambiguous. Does that mean the sidecar is *conditional* on user request? Pattern 4 says sidecars are auto-written if ≥4 items. Suggest tightening to match Pattern 4's threshold language.
- **process-meetings SKILL.md line 100 ("`## Could include`")**: this references a Phase 1 wiki-aware extraction artifact. Keep, but note: the Phase 2 plan claimed `## Could include` was already neutralized in legacy. Verify in soak that meetings still produce that section so this prose isn't dangling.

### Engage-once assertion

All five skills satisfy "engage user EXACTLY ONCE" — except week-plan which is the documented two-engage variant. No skill prose has implicit multi-step approval gates that would silently bypass AC11. The single biggest soak risk is whether the agent **actually** runs Step 1's primitives in parallel; if it serializes them, winddown time will degrade and the 45-min cap could trip. Daily-winddown's "Run in parallel (no engagement gates between)" with the post-A/B reinforcement is the correct mitigation — but it's prose, not enforced.

## 3. Discipline verification

**Ledger truth** — independently verified:

- `git ls-tree HEAD packages/core/src/services/` → 42 files; pre-Phase-2 → 40. **Δ +2 services** (matches build-report).
- `find packages/runtime/skills -name "SKILL.legacy.md"` → 5 files. **Matches**.
- `git diff --diff-filter=A` shows `.arete/skills-local/` registered in `workspace-structure.ts:26`. **+1 memory dir**, matches.
- `arete skill resolve` is a new top-level subcommand (`packages/cli/src/commands/skill.ts:529`). **+1 CLI verb**, matches.
- `frontmatter.approved_items` removed from writer (`staged-items.ts:572`); legacy fallback reader retained. **-1 frontmatter shape**, matches.

**Total at ship: +8. Total at wrap-up after legacy sunset: +2.** Build-report's accounting is honest.

**Plan-Removes cross-check** — the parent plan listed step-by-step engagement gates as a Remove. Verified: legacy daily-winddown SKILL.md (1061 lines) has explicit "Phase 1 / Phase 2 / CHECKPOINT / Phase 2.5" architecture diagram + step-gates; new SKILL.md (313 lines) has "gather → judge → engage once" with explicit "Do not engage between gather and judge". Same pattern across all 5 skills. **Removes delivered.** No missed deletions à la Phase 1's `## Could include` recovery.

**Hygiene reconciliation** — Phase 2 modifies existing SKILL.md files (preserved by hygiene-pass-1), adds 2 new core services, adds 1 CLI subcommand, removes one frontmatter field with backward-compat readers. **No conflict with hygiene-pass-1 deletions.**

**dist rebuilt** — `packages/cli/dist/commands/skill.js` includes `resolve` action; `packages/core/dist/services/skill-resolver.js` and `skills-local.js` exist. **Confirmed.**

## 4. Meta's four framing calls

1. **AC2.11 ledger substitution argument — ACCEPT.** The +2 wrap-up state (CLI verb, memory dir, services) is the structural prerequisite for per-skill rollback (AC11 hard stop) and APPEND user-customization (the chef pattern itself). Without `arete skill resolve`, the env-var routing has no runtime hook. Without `skills-local.ts`, no APPEND. Inlining either would be local-minimum optimization — they earn their place. The -1 (frontmatter.approved_items) is a real durable shrink.

2. **Step-5 A/B PASS at 8/10 — ACCEPT.** Structural A/B is weak evidence (sub-orch said so), but daily-winddown prose substantively addresses all four AC2.4 quality dimensions. The two refinements (parallelism guidance + "uncertain on cold-start") are exactly the right mitigations for the failure modes a structural read can surface. The 14-day soak is the real test.

3. **week-plan two-engage variant — ACCEPT.** Cleanly demarcated, justified in PATTERNS.md, "third engage temptation" guard explicit. Fits the legitimate-variant criteria.

4. **Action verb taxonomy completeness — ACCEPT.** PATTERNS.md table has Slack/Calendar/Notion/Jira/Areté with mode tags. The `(draft)` prefix convention for draft-only is unambiguous in PATTERNS.md and replicated in each skill's example outputs. Jira-as-draft-only is well explained.

## 5. Other concerns

- **Stale "Phase" terminology in process-meetings** (lines 51, 211, 294–295) — references "Phase 1h" / "Phase 2 (subagent-style invocation)" pointing at new daily-winddown's Step 1h. Confusing because the new prose has Steps not Phases. **Follow-on fix.**
- **AC2.7 deferral_disagreement event has no code wire** — only prose-spec. Acceptable for Phase 2 ship; the substrate (`item-fates.jsonl`) exists from Phase 0. First pull-back during soak will exercise it.
- **Soak risk: parallelism-by-prose** — if the agent serializes Step 1 reads anyway, the speed win evaporates. No automated check. Mitigation: weekly user check-in is the right tool; if median winddown is anywhere near AC10's 50% target, the agent is parallelizing.

## 6. Verdict

**APPROVE WITH MINOR CONCERNS**

What made the work tight:
- Honest +8 ledger surfaced with two substitution paths offered; recommendation aligned with parent plan's intent.
- All five legacies are verbatim diffs against parent tree (no drift).
- Engage-once unambiguous in 4/5 skills; two-engage cleanly justified in week-plan.
- Per-skill commits enable surgical revert per MC2 ship gate.
- `npm test` ban honored; per-file `tsx --test` / `vitest run`.
- Plan-Removes cross-check passes (no Phase 1 repeat).

Follow-on (do not block merge — file as small commits during soak):

1. Process-meetings: rename "Phase 1h caller" / "Phase 2 invocation" to "Step 1h caller" — stale legacy terminology.
2. Daily-winddown Step 1h: tighten "Max 4 in parallel; batch larger sets" to "process up to 4 concurrently; for >4, run in waves of 4".
3. Week-plan line 244: tighten the conditional sidecar phrasing to match Pattern 4's threshold rule (≥4 items → sidecar always).
4. Wire `deferral_disagreement` event emission when first pull-back happens during soak (Pattern 4 currently prose-only).

Per-skill flag (`ARETE_LEGACY_SKILL_PROSE`) plus the 14-day soak with AC11 hard stop give real safety nets for the residual prose-ambiguity risk. The blast radius is contained per-skill; if one regresses, the others stay live.

**Ship to soak.**
