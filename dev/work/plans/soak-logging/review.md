# Structural Review — Soak Logging Plan

**Reviewer:** Claude Sonnet 4.6 (second-model cross-check)
**Verdict: PROCEED** — no structural blockers. All load-bearing claims verified against real code.

## Load-bearing claims verified

| Claim | Status |
|---|---|
| PATTERNS.md is flat `## Section` patterns; no existing `## Usage Logging` (lands after the last entry) | Verified |
| PATTERNS.md is NOT in `SKILLS_DOC_FILES` (workspace.ts:31-36) — the `:292-293` comment naming it is stale | Verified |
| Sync is skip-if-exists for subdirs (`:277`) AND root `.md` (`:299`) | Verified |
| All three skill files exist; daily-winddown refs PATTERNS.md 9×, project-exit 0×, update-project 1× | Verified |
| `packages/runtime` is content-only (package.json has no build/scripts/main) — no TS/dist | Verified |
| `arete.yaml` read path is in-band (daily-winddown already reads reconcile_mode/winddown_render/flags) | Verified |
| Manual `cp` recipe required post-merge (follows from skip-if-exists) | Verified |

## Architecture soundness
Sound. Hard-gate-first is the correct inert-off implementation (no code path can accidentally log). Objective-capture / subjective-deferred split is the right separation. Append-only with pointers (not bodies) prevents the log becoming its own firehose. `dev/soak/<skill-id>.md` is workspace-local and won't collide.

## Observations (non-blocking)
- **A.** project-exit has no clean "final step" for logging — add as **Step 7 ("Post-report instrumentation")**, not folded into the Step 6 report. (Aligns with pre-mortem R5.)
- **B.** Verification proves capture but the inert-off negative is a manual smoke check by nature — accepted v1 risk; each soak entry should note gate behavior.
- **C.** soak-review harness location deferred to Tier 2; no rework risk for Tier 1 capture.
