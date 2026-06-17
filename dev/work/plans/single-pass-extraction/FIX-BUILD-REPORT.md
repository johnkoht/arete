# single_pass extraction fix — BUILD REPORT (2026-06-16)

Branch: `feat/winddown-approval-doc` (worktree `.claude/worktrees/winddown-approval`).
Status: **BUILT + VERIFIED on branch. NOT MERGED, NOT PUSHED.** Merge is gated on a
soak + the W7 full-eval run — John's call, not the orchestrator's.

Built per `FIX-PLAN.md` as amended by `REVIEW.md` (S1–S7). Diary:
`dev/work/plans/single-pass-extraction/diary.md` (timestamped per work item).

## Commits (this branch, on top of c4c0c572)

| Commit | Work item |
|---|---|
| f29543c2 | W1 — fail-loud extraction + transient retry + failure snapshot (S1/S2/S7) |
| 9bee2869 | W2 — deserialize the WHOLE --context bundle + S5 shape-guards |
| 6779d5ca | W3 — owner identity frame from profile.md (RC3) |
| d7239b34 | W4 — auto-load priorItems for dedup (S6) + W5 spike (no code) |
| (this commit) | diary + build-report + dist rebuild |

W7 harness `scripts/eval-extraction-prodpath-2026-06.ts` is UNCOMMITTED
(eval-harness-local convention; matched by the `scripts/eval-*.ts` .gitignore rule).

## What shipped, per work item

- **W1 (RC1) — fail-loud.** Removed the bare `catch{return EMPTY}` in both the
  single_pass and legacy branches of `extractMeetingIntelligence` → errors
  propagate. `parseMeetingExtractionResponse` throws a tagged `ParseError`
  (with truncated preview) on JSON failure in single_pass; legacy returns empty
  (bit-identical). `services.ai.callWithModel`: `stopReason:'length'` →
  `TruncationError` (surfaced, never retried); transient-retry loop (S2) scoped to
  the retryable transport class (overload/429/5xx/network), ≤3 attempts + capped
  backoff, never retries ParseError/truncation/auth/empty-success. S7: single_pass
  extraction `maxTokens=16000`. S1: CLI extract catch writes a failure snapshot
  (`failureReason`/`failureMessage`/`failurePreview` added to
  `RawExtractionSnapshot`; new `writeFailureSnapshot`) BEFORE `process.exit(1)`.
- **W2 (RC2) — whole bundle.** New `deserializeContextBundle` carries the entire
  bundle (area/existingTasks/topicWikiContext + future fields) across the
  `--context` boundary; S5 shape-guards every array the prompt builder indexes
  (malformed optional block degrades to absent; only a missing `meeting` throws).
  S5 argv check: SKILL.md already pipes `--context` via temp file (not argv).
- **W3 (RC3) — identity frame.** `buildMeetingContext` reads `context/profile.md`
  `name` → `slugifyPersonName` → bundle `owner:{slug,name}` (new
  `readWorkspaceOwner`). CLI single_pass sets ownerSlug/ownerName from the bundle,
  git-config fallback when profile absent. Legacy unchanged.
- **W4 (RC4, S6) — priorItems auto-load.** single_pass + no `--prior-items` →
  CLI auto-loads the 7-day recent-meeting batch (current excluded), mirroring the
  backend. `buildKnownItemsSection` already MARK-don't-skip → ADD-only. SKILL.md
  documents the auto-load.
- **W5 (RC4) — open-commitments spike: NO CODE.** Verified slug agreement holds
  three ways (slugifyPersonName ⇄ people dir ⇄ commitments store) for the 6/16
  Philip/Dave/Bavitha/Lindsay item; `listOpen({personSlugs})` already surfaces the
  open `john-koht` mirror. No slug-normalization layer needed.
- **W7 — production-path eval harness (uncommitted).** Real CLI subprocess
  round-trip; asserts no-silent-empty / context-parity / dedup / direction /
  Anthony canary + S3 recall/blocker-recall/junk vs the 6/9 GT. SMOKED `--stub`
  (zero spend): **2/2 PASS** (mechanics). Full/real-API run AWAITS John.

## Acceptance criteria status

| AC | Status |
|---|---|
| AC1a (forced-throw → reject, CLI exits non-zero w/ error) | ✅ unit (extraction propagation test) + harness no-silent-empty |
| AC1b (live Anthony canary — non-empty OR surfaced error) | ⏳ **awaiting John's gated eval run** (harness asserts it on --full) |
| AC2 (truncation surfaced + failure reason in snapshot) | ✅ unit (TruncationError; writeFailureSnapshot records failureReason) |
| AC3 (area/existingTasks/topicWikiContext in prompt; parity ≥ legacy) | ✅ unit round-trip + harness contextUsed/bundle; ⏳ full-corpus parity numbers await --full |
| AC4 (Nate direction correct; identity frame populated) | ✅ unit (prompt names owner); ⏳ live Nate case awaits --full |
| AC5 (multi-party item not re-staged fresh; mechanism documented) | ✅ mechanism documented (W5: open-commitments via open john-koht mirror); ⏳ live assertion awaits --full |
| AC6 (harness runs via subprocesses, zero agent-handoff, scorecard) | ✅ harness built + stub-smoked 2/2; ⏳ full scorecard awaits --full |
| AC7 (snapshot distinguishes deliberate-empty / parse / call fail) | ✅ unit (failureReason taxonomy: parse_error/truncation/call_error/unknown) |
| Retry taxonomy AC | ✅ unit (8 ai tests: retry-then-succeed, exhaust, non-retryable, truncation, empty-success not retried) |
| Recall/junk vs legacy (S3) | ⏳ **awaiting John's gated --full run** |
| Malformed-`--context` degrades not throws (S5) | ✅ unit (deserializer degradation tests) |

**Overarching invariant (legacy flags-off byte-identical):** legacy success-path
prompt + parse unchanged; verified by the unchanged 299-test extraction suite +
an explicit legacy-malformed-JSON-returns-empty test. The ONLY legacy behavior
change is the error PATH (propagates instead of silent empty) — intentional per
W1, both callers surface it. Flagged below.

## How John runs the full eval gate

```
# from the repo root (or this worktree):
tsx scripts/eval-extraction-prodpath-2026-06.ts \
  --workspace /Users/john/code/arete-reserv \
  --full          # real Anthropic spend across the 6/9 + 6/16 corpus

# or a single-meeting real-API smoke first:
tsx scripts/eval-extraction-prodpath-2026-06.ts \
  --workspace /Users/john/code/arete-reserv --smoke

# zero-spend mechanics re-check (what was run here):
tsx scripts/eval-extraction-prodpath-2026-06.ts \
  --workspace /Users/john/code/arete-reserv --stub
```
The harness backs up + restores `arete.yaml` (incl. `extraction_mode`) and the
corpus meeting files. Green (`SCORECARD: N/N`) on `--full` is the gate to flip
`extraction_mode: single_pass` back on and re-enter the soak.

## SKILL.md change (no re-cp needed)

`packages/runtime/skills/daily-winddown/SKILL.md` is the single source (no dist
copy). Added a note at step 1h that single_pass auto-loads prior items (no
`--prior-items` needed). If a workspace has a forked copy under `.agents/skills/`,
re-sync it there; the shipped runtime copy is updated in this branch.

## Known gaps / items for John's review

1. **Legacy error-path behavior change.** W1 removes the legacy `catch{return
   EMPTY}` so a thrown LLM error now propagates in legacy too (was silent empty).
   Only the error path; both callers (CLI outer catch, backend re-throw-on-empty)
   surface it. Success-path is bit-identical. Confirm you're OK with legacy
   surfacing extraction errors instead of silently emptying.
2. **Backend owner parity DELIBERATELY SKIPPED.** FIX-PLAN W3 lists fixing
   `agent.ts:242-248` for parity. The backend has NO single_pass path and the
   legacy prompt renders an owner block from ownerSlug — adding owner there would
   change LEGACY backend output (byte-identity violation) for zero single_pass
   gain. Skipped on purpose. When the backend gets a single_pass path, add owner
   there guarded by singlePass.
3. **Latent pre-existing bug found (NOT fixed).** `paths.resources` is already
   absolute, so the inline-reconcile blocks at `meeting.ts:~1552/~1763` use
   `join(root, paths.resources, 'meetings')` which DOUBLE-prefixes →
   `loadRecentMeetingBatch` silently returns []. This likely means the CLI
   `--reconcile` recent-batch has been empty in production (inline cross-meeting
   reconcile a partial no-op on the recent set). I used the correct join in my W4
   code but left the legacy blocks untouched (bit-identity). Worth a dedicated
   follow-up — it's orthogonal to this fix and touching it risks legacy behavior.
4. **Two "Phil"s data-quality dependency.** `listOpen` scoping relies on accurate
   attendee names: Philip Sheperd (`philip-sheperd`) vs Phil Whisenhunt
   (`phil-whisenhunt`). A mislabeled "Phil" silently scopes commitments to the
   wrong person. Not a code bug; a frontmatter fidelity dependency.
5. **AC1b/AC3-numbers/AC4-live/AC5-live/AC6-full + S3 recall/junk all await the
   gated --full run.** The harness asserts them; only real-model output settles
   "actually better," and that's real spend.

## Rollback
`extraction_mode: legacy` config flip restores the working baseline (D1) — all
W1–W4 code is behind that flag; legacy stays default + bit-identical until John
flips after a green --full + soak. W7 harness is uncommitted — nothing to revert.
