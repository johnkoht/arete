# Build Report — Pre-Merge Cleanup (arete-v2-chef-orchestrator)

Date: 2026-06-05
Branch: `worktree-arete-v2-chef-orchestrator`
Scope: 4 sequential pre-merge cleanups. Each task fully built + committed
before the next. NO LLM calls against production, NO production data writes.

---

## Task 1 — New-user integration degradation guard

**Commit:** `97b8f9ea` — `phase-10-followup-1(core,skill): gate winddown slack/email gather on integration config (new-user degradation fix)`

**Files:**
- `packages/core/src/services/integrations.ts` — added `listConfigured(workspaceRoot): Promise<string[]>`
- `packages/core/test/services/integrations.test.ts` — added `IntegrationService.listConfigured` suite (4 tests)
- `packages/runtime/skills/daily-winddown/SKILL.md` — steps 1k / 1l config pre-checks + `## Notes` degraded-vs-unconfigured distinction
- `packages/core/dist/services/integrations.*` (rebuilt)

**What was done:**
- `listConfigured` reuses the existing `list()` read logic (manifest + configs dir + calendar alias expansion) and returns integration keys whose configured status is non-`inactive`/non-null. No new config surface invented — it filters the existing `IntegrationListEntry[]`.
- SKILL.md 1k (slack-digest) and 1l (email-triage) now open with a config pre-check that mirrors 1a's `if krisp/fathom is configured` style: if Slack / Gmail is NOT configured (absent from `arete.yaml` integrations AND no MCP connection), SKIP the step SILENTLY — no invocation, no `## Notes` entry.
- The `## Notes` prose now encodes the key distinction: a "degraded — <integration> skipped" note fires ONLY for a configured integration that FAILED at gather time; never for a never-configured one. New users ship clean.

**Test status:** `tsx --test packages/core/test/services/integrations.test.ts` → 19/19 pass (4 new). typecheck + build clean.

**Verified:** A brand-new workspace (no config) returns `[]` from `listConfigured`; inactive-status integrations are excluded; calendar `provider: google` expands to `google-calendar`.

---

## Task 2 — 10b-aux HIGH-1: [[unmerge]] dupeId selection bug

**Commit:** `970d6eb9` — `phase-10b-aux-fix(core): [[unmerge]] honors dupeId for 3+ source canonicals (review HIGH-1)`

**Files:**
- `packages/core/src/services/unmerge-directives.ts` — `resolveUnmerge` now honors `dupeId`; new `DupeSourceMapping` type + `ambiguous-dupe` resolution status
- `packages/core/test/services/unmerge-directives.test.ts` — added 3-source correct-split test (mapping present) + clean-rejection test (mapping absent)
- `packages/core/dist/services/unmerge-directives.*` (rebuilt)

**Root cause confirmed (the stored-mapping limitation):**
`applyCommitmentsDedup` (background-dedup.ts) absorbs dupes into a `Set<string>` of source meetings (then `.sort()`s alphabetically) and appends texts to `textVariants[]`, **discarding the originating dupe id**. So the dupe→source association is NOT derivable from the `Commitment` row alone — the only durable record lives in the dedup-decisions log. The old resolver always peeled the LAST source + last non-canonical variant: correct for 2-source canonicals by coincidence, WRONG for 3+.

**Fix (resolution order):**
1. caller-supplied `opts.dupeMapping` (dupeId → {sourceMeeting, text}, from the dedup-decisions log) → correct split for 3+ source canonicals
2. explicit `dupeMeetingSlug` override
3. exactly two sources → the non-canonical one is unambiguous (the old 2-source case stays correct)
4. 3+ sources with no resolvable mapping → new `ambiguous-dupe` status that REFUSES to split rather than peel the wrong dupe

This satisfies branch (c) of the task: limitation documented in the module header, parser/resolver REJECTS an unresolvable dupeId with a clear message, and the 3-source test asserts BOTH the correct split (mapping available) AND the clean rejection (mapping absent).

**Test status:** `tsx --test packages/core/test/services/unmerge-directives.test.ts` → 11/11 pass (2 new). typecheck + build clean. No active callers needed updating (`resolveUnmerge` is re-exported but not yet consumed outside the module + SKILL.md prose); the `ambiguous-dupe` variant is additive.

---

## Task 3 — 11a CLI wire-in (verb + dispatch, auto-resolve GATED OFF)

**Commit:** `f332db65` — `phase-11a-wiring(cli,skill): resolve-from-gmail verb + directive dispatch (GATED OFF pending validation)`

**Files:**
- `packages/cli/src/commands/commitments.ts` — new `arete commitments resolve-from-gmail` verb
- `packages/cli/test/integration/commitments-resolve-from-gmail.integration.test.ts` — gate-behavior tests
- `packages/runtime/skills/daily-winddown/SKILL.md` — new Step 2.7 ( `[[confirm]]` / `[[unconfirm]]` / `[[unresolve]]` dispatch) + `ambiguous-dupe` note in Step 2.6
- `packages/cli/dist/commands/commitments.*` (rebuilt)

**What was done:**
- The verb is gated behind `PHASE_11_AUTO_RESOLVE_ENABLED` (default FALSE). Gate off → refuses with: "Phase 11 auto-resolve is gated off pending golden-pair validation. Set PHASE_11_AUTO_RESOLVE_ENABLED=true to enable (only after AC3a precision validated against real labels)." + exit 1.
- Gate ON path is wired but PROPOSES only: reads open commitments + the Gmail Sent cache + a slug→email people directory, runs the 11a `runResolutionPipeline` per commitment, and PRINTS resolve-high / flag-medium proposals. It never writes to commitments.json — actual staging/mutation stays the chef winddown wire-in's job under lock. (Requires AI configured; refuses if `ARETE_NO_LLM=1` or no cache.)
- SKILL.md Step 2.7 dispatches the three recovery directives via `parseResolutionDirectives` + `applyConfirm` / `applyUnconfirm` / `applyUnresolve` + `appendResolutionDecisionLog`. Bulk `[[confirm-all*]]` stays rejected (F2). The step documents that it is SAFE with the gate off — no staged/`auto-gmail` commitments exist to act on, so the scan is a silent no-op until the gate opens.

**Test status:** `tsx --test packages/cli/test/integration/commitments-resolve-from-gmail.integration.test.ts` → 3/3 pass. Tests cover the gate-off refusal (text + `--json` `{gated:true}`) and that only exact `'true'` enables the verb. NO LLM, NO Gmail fetch, NO data writes — the gated-ON path is intentionally not exercised in tests (would require production LLM + cache). typecheck + build clean.

**Auto-resolve was NOT enabled. The gate was NOT removed.** Code is merge-ready but dormant.

---

## Task 4 — Co-author footer note

Recent session commits (17 in the last ~20 of branch history) used
`Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
The repo standard is `4.8`. Per instruction, history was NOT rewritten —
the three commits in THIS merge-prep (97b8f9ea, 970d6eb9, f332db65) all use
the corrected `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
footer. The prior `4.7` inconsistency is left as-is (not worth a history rewrite).

---

## Merge readiness

- **`PHASE_11_AUTO_RESOLVE_ENABLED` defaults FALSE** — confirmed. The verb
  reads `process.env.PHASE_11_AUTO_RESOLVE_ENABLED === 'true'`; any other
  value (unset, `'1'`, `'yes'`, `'TRUE'`, `'on'`) leaves the verb gated and
  refusing. Verified in dist (`packages/cli/dist/commands/commitments.js`)
  and by integration test.
- **New-user degradation is silent-skip, NOT a degraded-warning** — confirmed.
  SKILL.md 1k / 1l SKIP unconfigured Slack / Gmail silently with no `## Notes`
  entry; the degraded-warning path is explicitly reserved for a
  configured-but-FAILED integration. `listConfigured` returns `[]` for a new
  workspace.
- All touched test files pass (`integrations.test.ts` 19/19, `unmerge-directives.test.ts` 11/11, `commitments-resolve-from-gmail.integration.test.ts` 3/3).
- `dist/` rebuilt + committed after each task (core after Tasks 1+2, cli after Task 3).
- typecheck clean for both `@arete/core` and `@arete/cli-next`.
- Commits are per-task with the specified conventions and the 4.8 footer.
