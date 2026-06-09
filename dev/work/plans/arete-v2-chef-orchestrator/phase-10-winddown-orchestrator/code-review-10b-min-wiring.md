# Code Review — Phase 10b-min CLI Wiring

**Reviewer**: senior staff eng
**Date**: 2026-06-05
**Scope**: CLI wire-in that makes the 10b-min hybrid dedup pipeline fire on
`arete meeting extract --stage`. Pipeline primitives reviewed separately
(APPROVE WITH MINOR, F5 concurrency gate pending).
**Commits**: `675a1e25` (core helper + 13 tests), `b7c82fa8` (CLI wire-in).

## Verdict: APPROVE

The wiring is clean, correctly ordered, and fail-safe. The F5 concurrency
gate is **met** — `wireExtractDedup` wraps the read+decide window in
`services.commitments.withLock()`, backed by real cross-process
`proper-lockfile` (commitments.ts:14, :718). Per the 10b-min reviewer's
stated condition, this upgrades **10b-min from APPROVE-WITH-MINOR to clean
APPROVE**.

Two LOW concerns below; neither blocks. No HIGH concerns.

## Per-commit assessment

| Commit | Subject | Assessment |
|---|---|---|
| `675a1e25` | core: `extract-dedup-wiring` helper + 13 tests | APPROVE. Pure-ish glue: lock acquisition, same-day loader, slug→path, best-effort reverse-stamp + audit append, dryRun gate. No production writes originate here; all go through existing primitives. Co-authored footer present. |
| `b7c82fa8` | cli: wire `wireExtractDedup` into extract | APPROVE. ~80 LOC into the `--stage` path. Correct insertion point, fail-safe try/catch, explicit skip_reason merge, badge decoration, JSON + human summary surfaces. Co-authored footer present. |

## Verification checklist

| Item | Result |
|---|---|
| Fires AFTER LLM extraction + batchLLMReview, BEFORE staged write | **PASS**. Call sits after `processMeetingExtraction` + reconciliation block, before `formatFilteredStagedSections` / `decorate` / `writeWithLock` (meeting.ts ~1065 vs ~1151/1258). |
| `commitments.withLock()` wraps the read window (F5) | **PASS**. `listOpen()` + `loadSameDayStagedItems` + `runExtractDedup` all inside the `withLock` callback (extract-dedup-wiring.ts:291-315). Real proper-lockfile, cross-process. |
| Concurrency test exists | **PARTIAL**. Test at .test.ts:664 fires two extracts via two `CommitmentsService` instances (cross-instance, real lockfile) → both complete, no throw, commitments.json valid. See LOW-1 — it runs `dryRun:true` and asserts only no-corruption, not duplicate-canonical suppression. |
| Same-day cross-meeting load: date-prefix scan, exclude current slug, drop skipped | **PASS**. `loadSameDayStagedItems` (:152) filters by `DATE_PREFIX_RE`, `slug === excludeSlug` skip, and `statusMap[item.id] === 'skipped'` drop (:200). |
| Reverse-stamp invoked with 60s mtime guard | **PASS**. `applyReverseStamp` per de-duped canonical slug (:327-371); 60s guard lives in the reverse-stamp primitive; test confirms abstain/already-stamped on refreshed mtime (.test.ts:796-827). |
| No double-write of audit log | **PASS**. `appendDedupDecisionLogBatch` fires once inside `wireExtractDedup` (:376); CLI does not call it. |
| Dupe items get `staged_item_status` + `skip_reason` with `dupe_of` marker | **PASS**. `statusPatch[id]='skipped'`, `skipReasonPatch[id].reason` starts `dupe_of_` (test :464). CLI applies status to `processed.stagedItemStatus` (meeting.ts ~1138) and merges skipReason in the mutator (~1246). |
| 13 new tests + adjacent regressions pass | **PASS (new verified)**. Ran wiring suite: 13 pass / 0 fail. Adjacent regression counts taken from build report (not re-run here, within read cap). |
| Does NOT touch followup-2 F5 cleanup at staged-items.ts:718-738 | **PASS**. `git show b7c82fa8 --stat` shows no staged-items.ts change; block at :718-738 (apply-flow per-ID filter) is untouched. |
| Co-Authored footer + naming convention | **PASS**. Both commits use `phase-10b-min-wiring(scope):` and carry the co-authored footer. |

## Ordering correctness (the load-bearing claim)

The insertion respects the contract: reconciliation/batchLLMReview get first
crack at intra-meeting + last-7d semantic dedup; the new pipeline runs after
them but before the body is formatted and `writeWithLock` fires. Because the
status patch is applied to `processed.stagedItemStatus` BEFORE the mutator's
`mergedStatus` computation (meeting.ts:1215), the new `'skipped'` entries are
treated as first-class by the chef-skip survival merge — correct.

## F5 concurrency gate — CONFIRMED MET

The 10b-min reviewer gated the clean APPROVE on the read window being lock-
protected so a concurrent extract cannot observe "no canonical exists" while a
sibling is about to write one. `wireExtractDedup` reads commitments + same-day
pool inside `withLock` (extract-dedup-wiring.ts:291), and `withLock` is
cross-process safe via proper-lockfile. The window that matters (read → decide)
is serialized. Gate met.

Caveat (LOW-1): the decisions are made under the lock, but the actual
meeting-file write (`writeWithLock` against the *meeting* file, mtimeGuard=0)
happens AFTER the commitments lock is released. Two same-day extracts of
identical text could each read an empty same-day pool (the other's staged
items aren't written yet) and both emit `new-canonical`, yielding two
canonicals that a later extract dedups. This is a convergence-not-prevention
property and is consistent with the design (extract stages; apply writes
commitments). It is acceptable for reactive dedup, but it means the F5 lock
prevents *commitments.json* corruption, not *cross-meeting staged duplicate*
emission in a true simultaneous race. The pre-mortem's F5 concern (commitments
integrity) is fully addressed; the staged-duplicate edge converges on the next
extract via the same-day loader.

## LOW concerns

**LOW-1 — Concurrency test under-exercises the race.**
`.test.ts:664` runs both extracts with `dryRun: true` and an empty same-day
pool, then asserts only no-throw + valid JSON + `commitments.length === 0`.
It proves the lock doesn't deadlock or corrupt, but it does not assert that
serialized reads suppress a duplicate canonical (the pool is empty for both,
and dryRun skips writes). The stronger test — meeting A's staged items already
on disk, B's extract observing them under the lock — is covered by the
non-concurrent text-hash test (:461), so the dedup logic itself is verified;
only the *interaction of lock + visibility* is lightly tested. Suggest a
follow-up test that seeds A's staged file, then races B, asserting B emits
`definite-dupe`. Not blocking.

**LOW-2 — Cross-meeting dupes are stamped `setBy: 'chef'`.**
`buildDupeSkipReasonEntries` hardcodes `setBy: 'chef'`. On re-extract, the
mergedStatus survival logic (meeting.ts:1218) treats `setBy === 'chef'` as
chef-owned and preserves the `'skipped'` status — which is the *desired*
behavior (a cross-meeting dupe should survive re-extract). But it conflates
machine-decided cross-meeting skips with user/chef-confirmed skips, so the two
are indistinguishable downstream (e.g. an analytics pass on "chef skips" or a
future "show me what I skipped" view would over-count). Consider a distinct
sentinel (`setBy: 'cross-meeting-dedup'`) and teaching the survival merge to
honor it. Cosmetic/forward-looking; not blocking.

## Nits (non-blocking)

- `loadSameDayStagedItems` re-derives `body` via a frontmatter regex (:188)
  even though it then calls `parseStagedItemStatus(content)` /
  `parseStagedItemOwner(content)` on the *raw* content. Two parse conventions
  in one function (body for sections, raw for sibling maps) — intentional per
  the parser signatures, but a one-line comment already explains it. Fine.
- `meetingDate.slice(0,10)` is applied twice (CLI :1108-ish and loader :159);
  harmless idempotent narrowing.

## Why APPROVE and not APPROVE-WITH-MINOR

The two LOW items are test-depth and a forward-looking semantic-tagging nit;
neither is a correctness defect in the shipped path. The ordering is right,
the lock is real and correctly scoped, the audit log is single-writer, the
followup-2 cleanup is untouched, dupe markers carry `dupe_of_`, and the extract
never blocks on a pipeline error. Clean APPROVE; the F5 gate that held 10b-min
at APPROVE-WITH-MINOR is satisfied.
