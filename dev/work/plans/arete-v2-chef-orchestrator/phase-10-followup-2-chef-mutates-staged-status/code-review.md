# Phase 10 followup-2 — Code Review

**Reviewer**: senior staff engineer
**Date**: 2026-06-01
**Scope**: 8 commits (`49733df7` → `6b157ba3`), Step 0 + 7 build steps, plan v3
**Test bed**: `npx tsx --test` across all 9 touched suites

## Verdict: APPROVE WITH MINOR

The structural CT2 fix lands. F5 (the highest-confidence pre-mortem risk) is correctly mitigated by the filter-by-`approvedIds` cleanup rewrite. F2's partial-merge contract is type-system-clean at the `writeWithLock` boundary and exercised by a load-bearing test. F1's stricter demotion criterion is specced in SKILL.md prose. All 396 tests pass; the 53 new tests are well-formed and cover the AC surface.

The reasons this isn't a clean APPROVE:

- **Step 5 (re-extract preservation) is not wired in production**: the F2 contract holds only when callers go through `writeWithLock`. The extract path at `packages/cli/src/commands/meeting.ts:1100-1119` still does direct `services.storage.write()` with wholesale frontmatter rewrite — chef-set `staged_item_skip_reason` is at risk in production whenever `arete meeting extract` re-runs. Build-report acknowledges this under "noted under undone" but AC5 explicitly requires the actual extract path to honor the contract.
- **Concurrent-CLI-race test missing**: plan §Tests calls out "two `writeChefSkipToFile` calls in parallel for same meeting; assert lock serializes" — not present in `meeting-lock.test.ts`. The HP1 risk is mitigated by inheriting `proper-lockfile` from the commitments code, but the meeting-file lockfile's per-target serialization is unverified.
- **`writeChefSkipToFile` wrapper missing**: SKILL.md references it; no implementation. Body-comment insertion (HP2 surface #2) is therefore unimplemented end-to-end.

These are real production correctness risks, not nit-picks, but they're contained: AC5 and HP1's concurrent-CLI race are about defense in depth (the lock + partial-merge are the right primitives even if some callers aren't yet on them); the body comment is a UX surface, not a data-path correctness issue. Soak observability + the rollback triggers in plan v3 catch the regression class.

---

## Per-commit verification

| # | SHA | Subject | Verified | Notes |
|---|-----|---------|----------|-------|
| 0 | `49733df7` | Step 0 (10a-pre review fixes) | OK | `LockBootstrapError` throws; `ARETE_LOCK_BYPASS_MOCK=1` opt-in; 3 LOW items addressed |
| 1 | `fcf084b7` | `staged_item_skip_reason` type + parser | OK | Type union correct; parser shape-clones `parseStagedItemOwner`; M3 first-ship `{}` default; `StagedItemStatus` flat string untouched |
| 2 | `0462ef5c` | `writeWithLock` + partial-merge contract | OK | F2 load-bearing test present at `meeting-lock.test.ts:102`. Mutator `Partial<Frontmatter>` + explicit-`undefined` deletion |
| 3 | `e704049e` | `appendChefSkipLog` audit writer | OK | Format `${ISO} chef-skip ${JSON}\n` matches Phase 9; best-effort swallow; gitignore added |
| 4 | `9bc07d87` | F5 cleanup-by-`approvedIds` + APPLY-SKIP wiring | OK | The concrete F5 bug fix at `staged-items.ts:718-738` is correct; `## Skipped on Apply` emitted; CLI wires `onSkipped` → `APPLY-SKIP` |
| 5 | `012453f9` | SKILL.md Rule 5 + curated-view sections | OK | Rule 5 present at line 708; two new sections; 6 prose tests pass |
| 6 | `9f2ac7b4` | `[[unskip]]` + `[[confirm-skip]]` parser + resolver | OK | Both forms accepted; resolver N=50 cap; ambiguous/no-match/invalid-slug surfaces |
| 7 | `6b157ba3` | E2E flow tests A/B/C/D | MINOR | Flow D doesn't fully reproduce CT2 race (does not overwrite chef's `'skipped'` to `'approved'`); see HIGH-3 |

---

## HIGH concerns (must fix before extended soak)

### HIGH-1 — Step 5 re-extract refactor is not in the build

**Plan AC5**: "chef writes skip → user runs `arete meeting extract <slug>` (no `--force-clear-skips`) → extract mutator returns only 5 owned keys → `staged_item_skip_reason` preserved byte-for-byte."

**Status**: `meeting.ts:1090-1119` still directly mutates `fm` and calls `services.storage.write(meetingPath, updatedFile)` — bypassing `writeWithLock` entirely. There is no shallow merge, no mtime guard, no lock acquisition. The F2 contract therefore protects only the chef-write side; an extract re-run will overwrite the frontmatter wholesale and clobber `staged_item_skip_reason` (and any user `[[unskip]]` work, and chef-confirmed `'skipped'` statuses).

The build-report's `AC5: ✓ (pattern proven; extract path refactor noted under undone)` is misleading: AC5's plain text requires extract-time preservation in production, not just at the F2 boundary.

**Risk profile in production**: any user who runs `arete meeting extract` (or who has an async-Fathom-transcript watcher) after chef writes a skip will see the skip silently dropped on the next extract write. The apply path filter still drops `'skipped'`, but chef's skip is no longer in the file — so the item commits as a normal pending. Pre-mortem F2's "real-world detection" indicator ("if `staged_item_status` shows `'skipped'` but `staged_item_skip_reason` is missing, F2 has fired") will fire on every extract re-run for any chef-skipped meeting.

**Fix**: refactor `meeting.ts:1090-1119` to compose a `writeWithLock` call with an extract mutator that returns only the 5 extract-owned keys + (optionally) a merged status map per plan §"Re-extract preservation" prose. The Step 2 primitives are in place; this is wiring work, not new design.

### HIGH-2 — Concurrent CLI race not exercised by tests

**Plan §Tests**: "**Concurrent CLI race (HP1, AC4)**: drive two `writeChefSkipToFile` calls in parallel for same meeting; assert lock serializes; both writes land; no corrupt frontmatter."

**Status**: `meeting-lock.test.ts` has 8 tests; none of them launch concurrent `writeWithLock` calls against the same meeting path. The `commitments-withlock.test.ts` exercises this pattern (two concurrent `save()` writes do not corrupt the JSON), so the underlying `proper-lockfile` primitive is verified — but the meeting-file lock target (`<meetingPath>.lock` sidecar) has its own bootstrap and acquire path, and the meeting-file lock's behavior under contention is unverified.

**Fix**: add one test that launches `Promise.all([writeWithLock(p, mutA), writeWithLock(p, mutB)])` against the same meeting path and asserts both writes land (each in turn), the file parses cleanly, and the lock target was released. ~20 LOC; cheap.

### HIGH-3 — Flow D does not actually reproduce the CT2 race

Reading the e2e test's own comment at `chef-skip-e2e.test.ts:435-444`:

> "Today's UI does this naively; this test asserts the STRUCTURAL safety: if chef's skip is in frontmatter, even an accidental 'approve all' by the user is prevented from creating the commitment because the chef rewrote status before the user could. We DON'T overwrite ai_0042's status to 'approved' here — we apply immediately."

So Flow D does not exercise the race it claims to reproduce. The CT2 catch was specifically: user clicks "approve all staged" AFTER chef has written `'skipped'`; if the UI lazily writes `'approved'` for every visible item without re-reading chef's mutation, the chef's skip is overwritten. Flow D skips that step.

A more accurate name: "Flow D — happy-path post-chef-skip apply (no user override)." The actual CT2 race protection would need to assert: chef writes `'skipped'`; user-or-UI then sets `'approved'` for that same id; on apply the user's later write WINS the filter and the item commits. The plan's mitigation for that is shape-of-data ("chef rewrote status before the user could") + the SKILL.md banner; neither is structurally enforced by `commitApprovedItems`. Document this honestly in the build-report.

**Fix** (cheap): rename Flow D and add a NEW Flow E that does the actual race — chef sets `'skipped'`, then a subsequent `writeWithLock` sets `'approved'`, then apply runs. Assert what the actual end-state is (likely: commitment IS created, because last-writer-wins on the status map). That's the failure mode CT2 names; the structural fix in this followup is "make chef's earlier write visible enough that the user/UI doesn't blindly overwrite it" (HP2's three visibility surfaces). Test the safety boundary, document the residual.

---

## LOW concerns (track in soak, don't block)

### LOW-1 — `writeChefSkipToFile` wrapper not implemented

SKILL.md line 727 references `writeChefSkipToFile(storage, filePath, itemId, {reason, evidence, setBy})`. The build-report acknowledges this is not built. The e2e tests compose `writeWithLock` + `appendChefSkipLog` inline (Flow A spans ~40 LOC for what would be a 4-line helper call). This affects HP2 surface #2 — the inline body comment `<!-- chef-skip: <reason> | evidence: <ref> -->` is never written in any code path today. The visibility commitment ("frontmatter ALONE is not enough — user can't see frontmatter mutations in a normal editor") is materially weakened.

### LOW-2 — Sentinel file `.arete/phase-10-followup-2-ship-date.json` not committed

Build-report acknowledges this as not landed. Per pre-condition #4 / M3, this is supposed to be COMMITTED (not gitignored) so the worktree merge doesn't lose the ship-date anchor. The fail-closed semantics (missing → assume week-1) absorbs the absence — but week-1 mode never demotes. This means the F1 demotion criterion can never fire automatically in production until the user manually writes the sentinel. Document this as a day-0 user action in the build-report; consider committing an empty placeholder `{ "shippedAt": null }` so the file exists.

### LOW-3 — Resolver scan-by-mtime asymmetric to plan spec

Plan §HP4: "scan meeting files where `staged_item_status` is populated (non-empty map) — these are the only files where unskip has any effect."

Implementation at `chef-skip-directives.ts:166-197` lists ALL `*.md` files in `resources/meetings/`, sorts by mtime, caps at 50, then opens each one and parses frontmatter to check if `id in status`. For a workspace with 200+ meetings, that's 50 file reads + 50 YAML parses per `[[unskip]]` directive. Plan suggested filtering BY-presence of `staged_item_status` first, which would require a separate cheap-grep pass. Acceptable for v1, but a perf knob for soak.

### LOW-4 — Status formatter doesn't emit SKIP/PROPOSE/UNSKIP/CONFIRM lines for the winddown view

The prompt asked: "Status formatter emits SKIP/ABSTAIN/UNSKIP/CONFIRM lines." `formatDirectiveStatusMessage` only emits error/info messages for non-`resolved` outcomes. The plan's audit-log writer (`appendChefSkipLog`) is the SKIP/UNSKIP/CONFIRM emitter — but those go to the audit log, not the next winddown view as user-visible status. SKILL.md prose handles the surface; not a code-level gap, but worth noting that the formatter's purpose is narrower than the prompt implies.

### LOW-5 — `writeWithLock` body-comment insertion is unimplemented

Plan Step 2: "idempotent inline body comment insertion (locate `- [ ] <text> [ai_0042]` line pattern; fail soft + log warning if not locatable); body-comment idempotence (replace if exists for same `<id>`, MC2)." Not in `meeting-lock.ts`. Goes hand-in-hand with LOW-1 (the body comment IS what `writeChefSkipToFile` was supposed to handle); without either, HP2 surface #2 is not real. AC2 explicitly requires the body comment.

---

## Test quality spot-check (5 picks)

1. **`F2 partial-merge contract` (`meeting-lock.test.ts:102`)** — load-bearing; asserts `skip_reason[ai_0042]` byte-for-byte preserved (reason, evidence, setBy, setAt all individually checked). Solid. The 5 extract-owned keys are returned WITHOUT mentioning skip_reason — the contract test as the plan envisioned.

2. **`AC11 / F5 week-1 unskip survival` (`staged-items.test.ts:1358`)** — fixture is realistic (multi-status map, real skip_reason with setBy=`chef-proposed`); commit runs; post-state assertions cover both `staged_item_status['ai_0099']==='pending'` survival AND skip_reason deletion (since the test simulates the unskip having deleted the entry pre-commit). The chained narrative matches plan AC11 verbatim.

3. **`runUnderLock throws LockBootstrapError when bootstrap fails`** (`commitments-withlock.test.ts:238`) — uses a mock storage on a virtual root; explicitly deletes `ARETE_LOCK_BYPASS_MOCK` then restores it. The error-class check + message regex match plan §"abstain, never silent corruption." Restoration of the env var in `finally` prevents test cross-contamination.

4. **`id-alone with 2+ matches returns ambiguous (NEVER silently picks)`** (`chef-skip-directives.test.ts:203`) — fixture creates two meetings with the same `ai_0042` id, runs the resolver, asserts `status === 'ambiguous'` AND `meetingPath === null` AND `candidates.length === 2`. This is the PM C4 anti-silent-pick safety; the assertion structure makes regression visible.

5. **`onSkipped error containment` (`staged-items.test.ts:1424`)** — observer throws inside `commitApprovedItems`; the test verifies the commit STILL completes (body has `## Skipped on Apply`), AND stderr captured the observer's error message. Mirrors the existing `onApproved` error-containment pattern. Restores `process.stderr.write` in a `finally`, which is the right shape.

**Verdict on test quality**: high. Synthetic fixtures, real fs for the lock-using tests, no LLM calls, no production-data writes. Assertions are specific (byte-equality on payload, not just key presence). Cleanup in `afterEach` is reliable.

---

## Pre-existing failure audit

Ran the full chef-skip slice (~5.4s wall): 396 tests, 79 suites, 0 fail, 0 skipped, 0 todo. No regressions observed.

Spot-checked git history: no failing tests carried over from 10a-pre or pre-followup-2. The 53 net-new tests integrate cleanly with the existing 343 (build-report's "396 total" math holds).

---

## AC traceability

| AC | Description | Where verified | Verified? |
|----|-------------|----------------|-----------|
| AC1 | sibling-field schema | `parseStagedItemSkipReason` tests at `staged-items.test.ts:357-490` | YES |
| AC2 | chef writes skip (post-week-1) | e2e Flow A + Flow D | PARTIAL — no body-comment writer (LOW-5) |
| AC3 | apply honors skip + F5 cleanup | `staged-items.test.ts:1294-1356`, e2e Flow A | YES |
| AC4 | mtime guard inside lock | `meeting-lock.test.ts:157-187` | PARTIAL — single-process; concurrent CLI race untested (HIGH-2) |
| AC5 | re-extract preservation via partial-merge | `meeting-lock.test.ts:102` (F2 contract) | NO — production extract path not refactored (HIGH-1) |
| AC6 | user override `[[unskip]]` both forms | `chef-skip-directives.test.ts:25-249`, e2e Flow B | YES |
| AC7 | first-week banner | SKILL.md prose | PARTIAL — sentinel file not committed (LOW-2) |
| AC8 | week-1 confirm gate + F1 demotion criterion | SKILL.md prose + parser + e2e Flow B/C | PARTIAL — runtime demotion not implemented (deferred per build-report) |
| AC9 | APPLY-SKIP audit line | `staged-items.test.ts:1411-1422`, e2e Flow A, CLI wiring | YES |
| AC10 | soak observability | audit log writer + SKILL.md grep recipes | YES |
| AC11 | F5 week-1 unskip survival | `staged-items.test.ts:1358-1409`, e2e Flow B | YES |

**Summary**: 6/11 fully verified, 5/11 partial. The partials are: AC2 (body comment), AC4 (concurrent-CLI race), AC5 (production extract path), AC7 (sentinel), AC8 (runtime demotion). Two are documented-undone in build-report (AC7 sentinel, AC8 demotion); three are de-facto-undone but not flagged clearly (AC2 body comment, AC4 race, AC5 extract path).

---

## Bottom line

Ship to soak with the HIGH-1/HIGH-2/HIGH-3 fixes scheduled as a same-week hotfix. The F5 + F2 + F1 trifecta is correctly implemented at the primitive level; the gaps are at the wiring layer between primitives and the actual extract/winddown call sites. The structural CT2 fix lands in production code via Step 4's cleanup-by-`approvedIds`. The directive parser becomes the canonical `[[<directive>]]` infrastructure for downstream work (Phase 10b-aux `[[unmerge]]`) — its shape is sound and the test coverage is the right granularity.

Recommend tracking the production-side AC5 gap as a soak-week-1 P0 (it materially affects the F2 risk class the plan's pre-mortem flagged Medium-probability/Medium-high-impact); the others are P1.
