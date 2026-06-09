# Code Review — Phase 11 11a (Gmail Sent auto-resolution, pure core)

**Reviewer**: senior staff eng (paranoid pass — this is the highest trust-risk code in the stack)
**Date**: 2026-06-05
**Scope**: 11a files only — `commitment-resolution-pipeline.ts`, `resolution-directives.ts`, `resolution-decisions-log.ts`, `resolution-ordering.ts` + their tests + the 50-pair golden fixture. 10b-aux modules (`dedup-explain.ts`, `unmerge-directives.ts`, `dedup-winddown-surface.ts`) swept into commits `b85a342f`/`c178b707` by the worktree hook were NOT reviewed.
**Verified**: 97/97 11a tests pass locally; `[AC3a] golden-set: precision=1.000 recall=1.000 (HIGH=6, MATCH=6)` reproduced.

---

## Verdict: APPROVE THE CODE — DISTRUST THE 1.000 NUMBER

The pipeline architecture is correct and the trust-crater guards are real, layered, and tested: HIGH-only writes, MEDIUM/LOW never mutate, fail-safe-to-LOW on parse-miss and LLM-throw, structured suppress, role='self' exclusion, ordering guard. The code does what the plan says. I found **zero** correctness defects that would cause a silent commitment drop in the pure-core layer as written.

**BUT** the headline "precision 1.000 / recall 1.000" is a measurement of the **pipeline plumbing**, not of model precision. The LLM is replaced by a hand-written `oracleConfidence()` function whose HIGH/MEDIUM/LOW rules were authored by the same person who authored the fixture labels. Precision 1.000 here means "the deterministic pre-filter + outcome-synthesis correctly route 6 clean positives to HIGH and keep 44 non-positives out of HIGH **given an oracle that already knows the right answer**." It says nothing about whether GPT/Claude in production will agree. The build report's own caveat (Step 1, "the 14 AMBIGUOUS rows + a spot-check of the 30 negatives are SYNTHETIC placeholders") is the honest framing and must survive into the soak gate. **The 1.000 is trustworthy as a regression guard on the pipeline; it is NOT trustworthy as evidence the ≥0.95 floor is met in production.** Treat AC3a as UNVALIDATED until John relabels and the gate re-runs against a non-circular oracle (or real model samples).

This is a clean ship of the *pure core* with the auto-mutate path correctly gated OFF behind wire-in + John relabel + soak (build report §"EXPLICIT user-gated steps"). It is NOT a green light on auto-resolve precision.

---

## Per-AC / per-requirement verification

| Item | Verdict | Evidence |
|---|---|---|
| **AC3a — 50 pairs, composition** | ✅ structurally / ⚠️ labels synthetic | `GOLDEN_SET` = 6 anchors + 30 negatives + 14 ambiguous = 50 (`golden set has 50 pairs` test asserts). `morePositives` (7) correctly excluded from the 50. |
| **AC3a — precision ≥0.95** | ⚠️ CIRCULAR | 1.000 measured against `oracleConfidence()`, a stand-in authored alongside the labels. See HIGH-1. |
| **AC3a — ambiguous→MEDIUM (no HIGH)** | ✅ within oracle | Dedicated test asserts no AMBIGUOUS pair → `resolve-high`. All 14 amb pairs carry a draft/partial signal the oracle keys on. Spot-check below. |
| **AC3 — FINAL deck vs deck-draft** | ✅ | `commitment-resolution-pipeline.test.ts` "AC3 false-positive guard" → `flag-medium`; also `amb1` in golden set. Note: the *test* hard-codes the LLM to MEDIUM (`llmMock({'thread-1':'MEDIUM'})`) — it proves the pipeline routes MEDIUM→flag, NOT that a model returns MEDIUM here. |
| **AC3b — temporal uses commitment.date** | ✅ | `inTemporalWindow(commitmentDate, sentAt)` anchors on `commitment.date`; integration test "meeting Mon, evidence Wed, processed Thu" passes `now=Thu`, `date=Mon`, `sentAt=Wed` → resolve-high. `createdAt` never read by the pipeline. Correct. |
| **M5 — role='self' excluded** | ✅ | Exclusion is in `commitmentToResolutionInput` (`if (sh.role === 'self') continue`) AND v1 fallback guards `c.direction !== 'self'`. Explicit no-LLM test: "self stakeholder never reaches LLM" asserts `called === false`. Solid. |
| **AC6b — suppress loop, no LLM call** | ✅ | `isSuppressed` checked FIRST in `findResolutionEvidence`; `runResolutionPipeline` returns `ignore/suppressed` before `runResolutionCrossCheck`. Integration test spies the LLM and asserts `llmCalled === false`. Verified. |
| **F2 — first-week confirm gate** | ✅ | `stageResolve` keeps `status='open'`; `evaluatePromotionGate` requires BOTH `unresolveCount===0` AND (`confirmCount>=1` OR `explicitPromote`). Zero-confirm + zero-unresolve → NOT promoted. Tests cover all four quadrants. |
| **F2 — no [[confirm-all-week-1]]** | ✅ | `BULK_PATTERN` matches `confirm-all*` → `rejectedBulk`, never a directive. Tests for both `confirm-all-week-1` and bare `confirm-all`. |
| **AC2b — [[unconfirm]] 24h** | ✅ | `applyUnconfirm` gates on `resolvedBy==='user' && confirmedAt within 24h`; auto-gmail and >24h → no-op + "use unresolve". Tests at +10h (ok) and +25h (reject). |
| **AC6/AC6c — unresolve 14d / permanent** | ✅ | `applyUnresolve` sets `now+14d` or `2100-...` sentinel; preserves `resolvedEvidence` + `source_external`; clears `resolvedBy/Confidence/At/StagedAt`. Tests verify preservation + sentinel. |
| **M4 — repeat→permanent** | ✅ (logic) | `hasPriorUnresolveForEvidence` (30d, prefix-tolerant) + `applyUnresolve({promoteToPermanent})`. NOTE: wiring of detect→promote is the caller's job (not in pure core); tested as two separate units, not end-to-end. |
| **Fail-safe — parse-miss → LOW** | ✅ | `parseResolutionResponse` defaults any unmatched candidate to LOW with note. Test: "garbage response → LOW". |
| **Fail-safe — LLM throw → LOW** | ✅ | `runResolutionCrossCheck` try/catch maps all candidates to LOW. Integration "LLM throw → ignore". |
| **Fail-safe — empty candidates → no LLM** | ✅ | `runResolutionCrossCheck` returns `[]` before calling. |
| **Ordering G1/AC8 — never both** | ✅ | `decideResolutionOrdering`: staged→defer, else→auto-resolve; mutually exclusive by construction. Tests incl. "NEVER both" + prefix tolerance + M2 multi-source string. |
| **AC5 — phase attribution log** | ✅ | `renderResolutionDecisionLine` emits `phase=p11-11a`; best-effort append; parser round-trips. |
| **No LLM/Gmail/prod calls in tests** | ✅ | Every LLM is an injected mock; Gmail via `EmailThread` fixtures; the one disk write uses `os.tmpdir()`. Confirmed by reading all 7 test files. |
| **Does NOT touch gws/, dedup-pipeline, staged-items** | ✅ | 11a only imports `normalizeEmail`/`EmailThread` types read-only from `integrations/gws/types.js`. No edits to those modules in the 11a file set. |

---

## HIGH concerns

### HIGH-1 — The golden-set precision number is structurally circular (does NOT validate the ≥0.95 floor)
`resolution-golden-precision.test.ts` replaces the model with `oracleConfidence()`. That function's decision rules (FINALITY_WORDS × DRAFT_SIGNALS → MEDIUM; `messagePartial` → MEDIUM; `artifactMatch && shareArtifactTopic` → HIGH else LOW) are a re-encoding of the same intuitions used to assign the fixture's `MATCH`/`NO-MATCH`/`AMBIGUOUS` labels. The test therefore proves *consistency between two artifacts the same author wrote*, not precision of a real `external_resolution` model. The result `HIGH=6, MATCH=6` means **the oracle only ever fired HIGH on the 6 clean anchors** — every negative and every ambiguous pair was kept out of HIGH by either the pre-filter or the oracle's own rules. A production model that is more eager on, e.g., `amb1` ("FINAL deck" vs "deck draft") or `unr1` ("POP MVP deck" vs Q2 expense PDF, which survives the artifact gate via the generic `.pdf`-attachment fallback) would drop precision and is NOT caught by this gate.
**This is acknowledged** in the build report (Step 1 user-gated step + "John's real labeling could change the number"). The risk is that the 1.000 gets cited downstream as if it cleared the floor. **Required before any auto-mutate:** re-run AC3a with either (a) John-relabeled pairs AND a real-model sample, or (b) recorded real-model verdicts replayed deterministically. Until then AC3a = UNVALIDATED, and per the plan's own fallback 11a ships MEDIUM-only.

### HIGH-2 — Artifact gate's generic-PDF fallback widens the LLM's exposure to false positives
`checkArtifactMatch` returns true if a named artifact appears OR — as a catch-all — *any* document attachment exists (`hasDocAttachment` on `.pdf/.docx/...`). So "Send Lindsay the **deck**" + an email with **any** PDF attachment to Lindsay survives the deterministic pre-filter regardless of whether the PDF is a deck. The keyword-Jaccard floor (0.08) is then the only remaining deterministic cull before the model. This is *by design* (the model is supposed to adjudicate artifact identity), but it means the pre-filter does NOT protect against same-recipient/wrong-artifact false positives — the entire weight falls on the LLM. Given HIGH-1 (LLM precision unvalidated), the false-positive surface is larger than the "artifact heuristic" framing implies. `unr1`/`unr2` in the fixture exercise exactly this path and rely on the oracle's `shareArtifactTopic` to cull — a real model has no such guaranteed rule. Recommend: tighten the artifact gate (require the named noun OR an attachment whose filename shares a topical token, not merely any doc) OR explicitly document that the pre-filter is recipient+temporal only for artifacted commitments and the model is the sole artifact-identity guard.

---

## LOW concerns

- **L1 — "direction == outbound" pre-filter (flow step f) is not implemented as a per-message gate.** The plan's end-to-end flow lists "direction match: c.direction == 'outbound'". The code instead handles direction only in the adapter (self-direction → empty recipientSlugs → no-recipient). A `they_owe_me` commitment with a non-self stakeholder would still be eligible for matching. In practice an inbound commitment rarely has the *user* as Sender of a fulfilling email, and recipient-match usually culls it, but the explicit outbound gate the plan describes is absent. Low impact, worth a one-line guard or a plan-note reconciliation.
- **L2 — `commitmentToResolutionInput` treats ALL non-self stakeholders as candidate recipients**, including `role:'mentioned'` and `role:'sender'` (comment acknowledges this deliberately). For an outbound commitment, a `mentioned` party who happens to be a To: line on an unrelated email could match. Bounded by artifact+Jaccard+LLM, but it broadens the recipient surface beyond "the person we owe."
- **L3 — `extractArtifactNouns` substring-free, token-exact** — good (no "deck" inside "decked"), but `draft` is in `ARTIFACT_NOUNS`, so "Send the draft" makes `draft` a *named artifact* that the message must corroborate; a finished doc email that doesn't say "draft" could be culled. Minor recall risk, not a precision/trust risk.
- **L4 — M4 repeat→permanent is not wired end-to-end in pure core.** `hasPriorUnresolveForEvidence` and `applyUnresolve({promoteToPermanent})` exist and are unit-tested independently, but nothing in the reviewed code connects "log shows prior unresolve" → "pass promoteToPermanent". That join is explicitly the wire-in's job per the module comments; flagging so it isn't assumed done.
- **L5 — Suppress check compares `now < unresolveSuppressedUntil` only on the commitment, not on the (commitment, evidence) pair.** Plan AC6b/M4 phrase it as suppressing the same "(commitment, evidence) pair." The implementation suppresses the *commitment* wholesale for 14d regardless of which evidence reappears. Safer (never re-resolves during window) but means a *different* genuine Gmail evidence for the same commitment is also suppressed for 14d. Acceptable trade (fail-closed), but it diverges from the pair-scoped wording.
- **L6 — `buildThreadUrl` hardcodes `/u/0/`** (first Google account). Cosmetic; evidence link may point to the wrong account context for multi-account users. Not a correctness issue for resolution.

---

## Ambiguous-label spot-check (the dangerous-direction audit)

I checked that no AMBIGUOUS pair is mislabeled in a way that would let it resolve HIGH if the model were correct:
- `amb1` FINAL deck vs deck-draft, `amb2` signed vs unsigned contract, `amb3` final vs WIP PRD, `amb4` complete vs part-1, `amb8` finalized vs draft analysis, `amb9` approved vs for-review memo, `amb11` final vs editing slides, `amb12` signed vs draft letter — all are genuine finality-vs-draft mismatches; MEDIUM is the right label. ✅
- `amb5` "revised proposal" vs "proposal… not sure if this is the revision you meant", `amb6`/`amb14` "doc" vs inline-recap/almost-done, `amb7` spec doc vs outline, `amb10` complete vs rough agenda, `amb13` full vs partial spreadsheet — all carry an explicit partial/uncertainty signal in the body. MEDIUM defensible. ✅

No ambiguous pair looks like it *should* be a clean MATCH (which would be the dangerous mislabel — an under-counted positive inflating apparent precision headroom). The labels lean conservative (toward MEDIUM), which is the correct bias for this feature. The residual risk is entirely HIGH-1 (the oracle, not the labels).

---

## Bottom line
- Pure-core code: **correct, well-guarded, ship it.** Trust-crater defenses are real and tested.
- AC3a 1.000: **a pipeline regression metric, not a precision validation.** Do not let it satisfy the ≥0.95 floor. Block auto-mutate on John's relabel + a real-model (or replayed-real-model) re-run, exactly as the build report's user-gated steps require.
- Tighten HIGH-2 (generic-PDF artifact fallback) or document that the model is the sole artifact-identity guard, because that is where a real model's eagerness would first leak a false positive.
