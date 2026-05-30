---
title: "Phase 7b — pre-mortem"
slug: phase-7b-pre-mortem
created: "2026-05-29"
parent: phase-7b-validation-then-deletion
---

# Pre-mortem

If 7b ships and 2 weeks later we say "that was a mistake," what would have caused it? Enumerate honestly.

## R1 — Missed caller of `area-memory.ts` LLM code paths

AC3b deletes ~120 LOC of LLM code from `area-memory.ts` based on the claim that only `intelligence.ts:488` calls `refreshAllAreaMemory()` with a `callLLM` argument. If a different caller exists (e.g., a backend route, a test fixture, a script) that the audit missed, deleting the code breaks them silently.

**Mitigation**: 3b's "Critical verification before deleting" step is the safety net. Build sub-orch greps for ALL callers of `refreshAllAreaMemory` (not just the `callLLM` arg specifically). If any caller exists outside the named one, halt and escalate.

## R2 — Skill template references `arete daily` or `search --answer`

The grep sweep in Step 8 walks skills + `.claude/commands/` + docs. But auto-generated `.claude/commands/*.md` files may not exist in the worktree if they're generated at install-time. If an installed workspace has them, removing the underlying CLI verbs leaves dangling commands.

**Mitigation**: 
- Build sub-orch checks `packages/core/src/generators/skill-commands.ts` and `packages/runtime/skills/_authoring-guide.md` to see how commands are generated.
- If `arete daily` is referenced in any skill template (`requires_briefing: false` skills calling daily for context), that's a real consumer the audit missed.
- Document grep findings in build-report. If any reference found, surface for meta decision.

## R3 — `arete memory refresh --json` consumer parses removed fields

Per R-missing-2 from review-1. The output shape change (no `synthesis`, no `topicResult` in JSON) is silent. A consumer parsing those fields would see `undefined`.

**Mitigation**: R4 grep step (BEFORE AC3 deletion). If consumer found, surface to meta before proceeding.

## R4 — Test brittleness on removed-code paths

`daily.test.ts` (170 LOC) is deleted entirely. Some test infrastructure or shared fixtures may have implicit dependencies on the file's existence. Test imports of removed types from `daily.ts` would break.

**Mitigation**: build sub-orch greps for `import.*daily` patterns before final commit. Also runs full per-file test sweep — failures surface.

## R5 — Backend regression

`packages/apps/backend/src/services/agent.ts:649` calls `buildMeetingContext` (audit-confirmed). The plan doesn't touch this, but the `intelligence.ts` modifications in AC3 are in the same general namespace. Side-effect risk: if the meta `intelligence.ts` exports something else used by `agent.ts`, removal could break it.

**Mitigation**: 
- Build sub-orch greps `agent.ts` (and other `apps/backend/` consumers) for imports from the modified files. Document findings.
- AC5 test sweep includes backend tests if any exist (`packages/apps/backend/test/`).

## R6 — Cumulative ledger looks too negative, masks substrate-without-removes elsewhere

7a + 7b cumulative: −297 LOC code. This is healthy headline math. But the 7a substitution-argument substrate (gather-only sections, channel helpers) is still untested by an actual Phase 8 consumer. If Phase 8 slips past 2026-06-30 (sunset trigger), the 7a substrate ALSO sunsets, and the "negative cumulative" reverses.

**Mitigation**:
- Diary entry on 7b ship explicitly schedules Phase 8 plan-drafting within 1 week.
- 7a sunset trigger remains 2026-06-30. 7b doesn't extend or replace it.

## What's the single most likely thing to go wrong?

**R1 (missed caller of area-memory LLM paths)** — because the audit was demonstrably wrong about `arete area refresh` existing as a separate verb (review-1 caught this), there's a small but real chance the audit missed another caller too. The "Critical verification" step in 3b mitigates but doesn't eliminate risk. If a caller is missed, deletion produces a runtime TypeError on `callLLM is undefined` (or similar) for whatever path invokes the orphaned function.

**Second-most-likely**: R3 (memory refresh --json field-shape change) breaks a tool that parses it. Mitigation is the R4 grep step; if grep produces zero results, risk is bounded.
