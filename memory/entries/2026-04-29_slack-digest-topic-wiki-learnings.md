# Slack-Digest → Topic-Wiki Integration — Learnings

**Date**: 2026-04-29
**Branch**: worktree-slack-digest-topic-wiki (14 commits, base = main bb687278)
**Scope**: packages/core (topic-memory + seed-lock), packages/cli (topic refresh + topic list flags), packages/apps/backend (1-line rename), packages/runtime (slack-digest SKILL.md, PATTERNS.md, cursor rule), dev/work/plans (phase-c factual fix)

## What Changed

Wired slack-digest as a **second source class** for the L3 topic wiki. Closes the gap from the 2026-04-23 build where Hook 2 only fired for meetings — so a Slack thread that resolved a Cover Whale templates question never reached `cover-whale-templates.md`.

User-visible: per-thread topic extraction inside the slack-digest skill (biased by the same active-slug list the meeting prompt uses), digest frontmatter gains `topics: [union]`, and Phase 5b runs `arete topic refresh --slugs <list> --source <digest-path>` after the digest file is written. New CLI primitive `arete topic list --active --slugs --json` is the markdown-skill's bridge to the in-core slug renderer.

Service-side: `refreshAllFromMeetings` renamed to `refreshAllFromSources` across 8 production sites (incl. the backend route at `meetings.ts:244` that plan v1 missed). New `discoverTopicSources` scans both `resources/meetings/*.md` and `resources/notes/*-slack-digest.md` via the **existing** `parseMeetingFile` (no second parser). `--source` is a real scoping filter, not a label — first runs against pre-tagged workspaces don't 10× the user's bill. SeedLockHeldError constructor sets `this.name`, un-deading two pre-existing dead `err.name === 'SeedLockHeldError'` catches in `meeting.ts:1485` and `intelligence.ts:520` (positive surprise — net-positive beyond this branch's scope).

## Metrics

- **Commits**: 14 (8 task feats + 1 PRD line-number-drift fix on main + 2 dist rebuilds + 1 docs alignment + 1 dark-code audit + 1 final-review fix bundle + 1 code-review fix bundle)
- **Tasks**: 8 / 8 complete; 65 ACs all met
- **Tests added**: ~85 (327 lines `topic-memory-discovery.test.ts` + 224 lines `topic-list-active-slugs.test.ts` + 148 lines `topic-refresh-slack.test.ts` + 81 lines `slack-digest-bias-block.test.ts` + 144 lines `meetings-topic-refresh.test.ts` (backend) + ~100 inline `topic-memory.test.ts` extensions + ~200 inline `topic.test.ts` extensions)
- **Iterations**: 2 (one final-review rework — rebase + 3 doc nits; one code-review fix pass — backend test, --source filter tightening, stale comment, phase-c stale references)
- **First-attempt success per task**: 8/8 typecheck-clean on first commit; 6/8 PR-clean on first reviewer pass (Tasks 5 + 8 had follow-up fixes from holistic and profile reviews)
- **Dist rebuilds**: 2 (after Task 3 added `topic list --active --slugs` to `@arete/cli`; after Task 5 added `--source` flag and seed-lock name fix)
- **Pre-mortem risks**: 13 (0 CRITICAL / 4 HIGH / 6 MEDIUM / 3 LOW); all 4 HIGH effectively mitigated, no CRITICAL emerged mid-build
- **Grep gates at merge**: `rg refreshAllFromMeetings packages/{cli,core,apps}/src` → 0; `rg parseSlackDigestFile packages/` → 0; `rg discoverTopicSources|refreshAllFromSources packages/{cli,core,apps}/src` → 13+ across 6 production paths
- **LLM cost on a typical 7-day Slack window** (projected): ~7 digests × ~3 topics × ~$0.015 = ~$0.30 first-time; idempotent thereafter via body-hash dedup

## Pre-mortem Effectiveness

Full table for the 4 HIGH risks (the load-bearing ones); MEDIUM/LOW summarized.

| Risk | Tier | Materialized? | Mitigation Effective? | Evidence |
|------|------|---------------|----------------------|----------|
| R1 — Skill prompt regression undetectable (bias-block drift) | HIGH | No | Yes | `TOPIC_BIAS_BLOCK_PROMPT` exported from `meeting-extraction.ts:518`; SKILL.md wraps the byte-equal copy in `<!-- BIAS_BLOCK_START/END -->` markers; `slack-digest-bias-block.test.ts` asserts byte-equality + sanity-mutation + duplicate-marker-count check (3 assertions, 3 failure modes). Dual-tier sprawl defense actually has both tiers tested now. |
| R2 — `parseMeetingFile` rejects slack-digest | HIGH | No (false alarm; verified empirically pre-build) | Yes | Plan v1 budgeted ~30 LOC for `parseSlackDigestFile`; pre-mortem refuted with empirical fixture parse; PRD dropped the parser. `topic-memory-discovery.test.ts` parses real `2026-04-28-slack-digest.md` content; `rg parseSlackDigestFile packages/` returns 0. Highest-leverage simplification of the entire build. |
| R3 — Concurrent meeting-approve + slack-skill collide on non-reentrant `.seed.lock` | HIGH | Latent (not in build) | Yes + bonus | CLI catches `SeedLockHeldError` and emits `{"error":"seed_lock_held"}` JSON (`topic.ts:487-503`); SKILL.md Phase 5b documents the recovery path; `topic-refresh-slack.test.ts:127` asserts non-fatal exit. **Bonus**: side-effect fix `seed-lock.ts:37` (`this.name = 'SeedLockHeldError'`) un-deads two prior dead `err.name === 'SeedLockHeldError'` catches in `meeting.ts:1485` and `intelligence.ts:520` — net-positive beyond branch scope. |
| R4 — `--source` label-only causes cost surprise | HIGH | No (plan was about to ship label-only; pre-mortem caught it) | Yes | Re-litigated pre-PRD: `sourcePath?: string` threaded through `RefreshBatchOptions`; `discoverTopicSources` output filtered BEFORE per-slug filter. Triple-tested: `topic-memory.test.ts:614` (service), `topic-refresh-slack.test.ts:110` (AI-mock end-to-end), `topic.test.ts:344` (CLI bin). 3 prior digests + 1 new digest fixture asserts LLM called exactly 1×, not 4×. |

MEDIUM/LOW: R5 (rename count off — 8 not 6) caught pre-build, all 8 sites including the backend route hit; R6 (`--days-back=N` recovery undocumented) caught in final review, fixed in rework; R7 (sibling-plan frontmatter additions) hash invariant verified by `topic-memory-discovery.test.ts:158` (`dedup_processed_at` fixture); R8 (per-digest union pollutes narrative) acknowledged as unverified-bet, deferred to per-thread source-segment plan if real-world drift emerges; R9 (AI-mock divergence with Phase C item 5) constrained to `AIServiceTestDeps` injection only, ≤150 LOC test; R10 (slug-list rendering drift) byte-equality test against `renderActiveTopicsAsSlugList` direct call; R11–R13 minor doc/timing.

**Pre-mortem score**: 13/13 risks had mitigations documented; 0 materialized post-merge; 1 (R4) was about to ship before pre-mortem flagged it; the bias-block + lock-collision + scoping mitigations were the load-bearing ones.

## What Worked / What Didn't

**+** **Per-task subagent dispatch with the parent acting as reviewer** worked cleanly in this sandbox/constrained env where subagents can't dispatch sub-subagents. Each task PRD prompt → developer subagent → parent (me) reads diffs and runs the reviewer prompt manually before allowing the next dispatch. Stricter context control than the "parent orchestrator dispatches both developer and reviewer" pattern; trade-off is parent context grows linearly with tasks. For an 8-task build the trade was net-positive.

**+** **Empirical recon caught a parser fork before it shipped** (R2). Plan v1 budgeted ~30 LOC for `parseSlackDigestFile`. The pre-mortem reviewer parsed a real `2026-04-28-slack-digest.md` through the existing `parseMeetingFile` and showed the parser already handles the shape. Single test in Task 2 instead of a sibling parser. Same pattern caught the missed backend rename site (`meetings.ts:244`) and the line-number drift in PRD Task 7 (`topic.ts:253/331/787/910` was stale by Task 5). **The lesson is general: empirical recon before architectural decisions catches the cheap-vs-expensive choice that prose review can't.**

**+** **`SeedLockHeldError.name` constructor fix un-dead two pre-existing dead catches** (positive surprise). The branch needed the name set so the CLI's `err.name === 'SeedLockHeldError'` JSON-shape catch worked across module boundaries. While there, the audit showed `meeting.ts:1485` and `intelligence.ts:520` had been doing `err.name === 'SeedLockHeldError'` against the prior un-named class — silently never matching. Both got revived by the fix. Captured this in the dark-code audit as a "side effect, net-positive beyond branch scope" note. **Generalizes**: when fixing one dead-catch, grep all string-name catches of the same class — they may have been dead too.

**+** **Final review caught a backend dark-code gap that per-task reviews missed** (Finding 2 of code-review.md, surfaced by profile-driven scan). The backend approve route's renamed `refreshAllFromSources` call at `meetings.ts:244` is typecheck-only verified — no integration test exercises it. Per-task reviews of Task 1 (rename) and Task 7 (dark-code audit) both reported "all callers verified," but neither asked "is this caller exercised by a test?" The eng-lead profile review (loaded with the backend profile) caught the gap. The Task 7 dark-code audit answers "is the export wired?" — which is necessary but not sufficient. The complementary profile-driven question is "is the wiring exercised end-to-end?" Document the limitation in PR body; defer to Phase C item 5's AI-mock harness which adds backend integration coverage.

**+** **Triple-layer test coverage for `--source`** (service / AI-mock-end-to-end / CLI-bin) — exactly the structure the parent build's "services tested ≠ services wired" learning recommends. Three layers each catch different regression classes: service test catches logic bugs in the filter; AI-mock catches the prompt-builder integration; CLI bin catches argv-parsing and JSON-output regressions. Worth replicating for any future flag that is load-bearing for cost correctness.

**+** **Bias-block byte-equality with sentinel markers** (`<!-- BIAS_BLOCK_START/END -->`) was the right shape for a markdown drift test. Not just byte-equality of the whole files (impossible — they have different surrounding prose), but byte-equality of the marked region. The mutation-sanity test (deliberate corruption fails the assertion) makes the test load-bearing rather than vacuous. Pattern reusable for any future "this prose must match that prose verbatim" check.

**—** **Plan v1's call-site count was off by 2 in opposite directions**: claimed 6, actual was 8 (missed the backend route + the doc comment). Pre-mortem caught the backend; reviewer caught the doc-comment. The miss was rooted in `rg packages/{cli,core}/src` — left out `packages/apps/`. **Lesson written into the PRD**: always grep `packages/{cli,core,apps}/src`. Memory-synthesis bullet 1 names this explicitly for future plans.

**—** **PRD Task 7's expected line numbers were stale by the time Task 5 landed**: `topic.ts:253/331/787/910` shifted to `:469/940/1063` plus a new estimate-preview pass at `:390` added by Task 5. The dark-code audit's verdict is correct (all 7 expected logical sites map 1:1) but the PRD's literal line-number table is doc-drift the moment Task 5's flag wiring lands. **Lesson**: PRD tasks that pin literal line numbers are inviting drift; pin the symbol + the file, not the line. The Task 7 grep gate (number of hits across enumerated paths) is the durable signal — line numbers are eyewash.

**—** **Final-review caught a Topic Wiki Coverage docs section the implementer skipped** (Task 8 AC violation). Pre-mortem R6 named the exact silent-gap failure mode the section was supposed to prevent ("users hit the gap silently and conclude topic wiki doesn't cover Slack"); Task 8's PRD AC strictly required the subsection; Phase 4.1's per-task reviewer of Task 8 didn't grep for "topic wiki coverage" / "backfill" / "days-back" against the SKILL.md. The check is mechanical (one ripgrep). Re-rework cycle was small (3 lines) but the miss is preventable. **Lesson**: any per-task review whose AC includes "section named X added to file Y" should run the grep. Auto-failing the review on a missing grep would have caught it.

**—** **The branch fell 1 commit behind main during the build**: `fd3bd42a fix(test): unbreak time-dependent and stale-field test fixtures` landed on main while the worktree was building. `npm test` on the worktree showed 9 failures; rebase reduced to 2 pre-existing flakes. None of the failures were caused by this branch. **Process gap**: no continuous "is the branch in sync with main?" check during multi-day builds. Final review caught it; merge blocker. **Lesson**: a `git fetch && git log --oneline ..origin/main` step before declaring "all green" is cheap and catches the class.

## Recommendations

**Continue**:
- **Empirical recon before architectural decisions** (parser shape, call-site enumeration). Caught at least 3 concrete plan errors this build.
- **Per-task subagent dispatch with parent reviewer** in the constrained env. Works as the /ship pattern when sub-subagents aren't available.
- **Triple-layer test coverage for cost-correctness flags** (service / AI-mock / CLI bin). Each layer catches a different regression class.
- **Bias-block byte-equality with sentinel markers + mutation sanity test**. Reusable for any markdown-drift check.
- **Pre-mortem with empirical verification** — every HIGH risk got an empirical check (parser, lock semantics, scoping behavior, slug renderer reachability). Prose-only pre-mortems miss the cheap-vs-expensive choice.

**Stop**:
- **Pinning literal line numbers in PRD task tables**. They drift the moment a sibling task adds code. Pin symbol + file; let grep counts be the durable assertion.
- **Per-task reviews that don't grep for AC's literal claims**. If the AC says "subsection X added to file Y," the reviewer should `grep -i 'subsection X' file Y`. The Task 8 miss was a one-line fix the per-task reviewer could have caught mechanically.
- **Plan-mode greps that omit `packages/apps/`**. The backend route was the second-time miss (parent build also missed a backend wiring point). Default to `packages/{cli,core,apps}/src` as the audit scope.

**Start**:
- **Always run profile-driven review for any branch that touches multiple packages**. Per-task reviews are scoped to one task's PRD and miss cross-cutting invariants. The eng-lead/profile review caught Finding 2 (backend test gap) and Finding 1 (`--source` 3-way matching footgun) — neither violated any per-task AC. For multi-package branches, the profile-driven review IS the load-bearing review.
- **Branch-currency check before "all green" claims**. A `git fetch && git rev-list main..HEAD --count && git rev-list HEAD..main --count` step at the end of build is cheap; rebase-or-merge-from-main resolves the inheritance of test failures.
- **Grep all string-name catches of an exception class when fixing one dead catch**. The SeedLockHeldError fix revived two pre-existing dead catches by accident; doing this proactively next time makes "the fix is wider than this branch" explicit in the PR body.
- **Document explicit call-out in PR body for known-dark code paths the branch doesn't cover** (e.g., backend approve route topic-ingest block). Don't pretend the branch tested what it didn't; flag the gap so the next reviewer / future maintainer knows.

## Follow-ups

- **Per-thread source segmentation** (deferred from plan Risk 8). The per-digest union → topic page integration bets on `integrateSource`'s "update only sections substantively changes" prompt directive. The bet is plausible but unverified by tests. If real-world topic narratives sprawl with unrelated thread content, the next iteration introduces a per-thread `relevantSlice: string` field on `SourceDiscoveryEntry` and the integrate prompt; ~30 LOC change. Defer until evidence.
- **Phase C item 2 (background queue for Hook 2) inheriting `--source` semantics**. When the queue ships, `arete topic refresh --slugs ... --source ...` calls land in the queue; the queue must preserve `--source` scoping or the queue introduces the cost-surprise we just designed out. Item 2's plan should cite this branch as the contract.
- **`TOPIC_BIAS_BLOCK_PROMPT` wording: "meeting" → "source"**. The exported constant still says "the meeting" inside the bias text. Byte-equality with the meeting-extraction prompt was kept by leaving the wording as-is on both sides; a follow-up change updates both files in lockstep to "the source." Single-commit, requires the test to be re-pinned to the new bytes.
- **Cursor AGENTS.md slack-source provenance** (separate Phase B follow-up; out of scope here). The cursor `agent-memory.mdc` got a sentence; the broader AGENTS.md slack-as-source-substrate text is for Phase B's plan.
- **Backend approve route integration test** (Finding 2 of code-review.md). The renamed `refreshAllFromSources` call at `meetings.ts:244` is typecheck-only verified. Phase C item 5's AI-mock CLI harness should grow a backend-route variant that exercises the topic-refresh side effect end-to-end. Same gap shape as the meeting Hook 2 had pre-2026-04-23.
- **`--source` 3-way path matching footgun** (Finding 1 of code-review.md). The service accepts `endsWith` matches as well as exact-equal; the CLI normalizes both sides before the call so today only the exact branch fires. A future programmatic caller (the queue from Phase C item 2) inherits the footgun. Tightening to strict-equality + multi-match throw is ~20 LOC; defer until the queue plan if not done in a follow-up.
- **Logger DI for `discoverTopicSources` console.warn** (Finding 3 of code-review.md). Single soft profile drift; pragmatic exception is documented inline. Escalate to a logger param if a second `console.*` shows up in this service.
- **Service method → production caller invariant check in /ship** — this build's dark-code audit ran manually against the diff. Mechanizing it in `.pi/extensions/plan-mode/wrap-checks.ts` (or as a separate skill) closes the gap. Open question: how to disambiguate "exported for public API" vs "exported only for tests" without false positives. The 2026-04-23 build raised this; this build re-confirmed the value; still unautomated.

## Learnings (collaboration + patterns)

- **Plan-mode reviewer can refute plan claims with one fixture parse**. The R2 (parser duplication) refutation came from a single empirical check — feed a real digest through the existing parser and inspect output. Builds doing parser/schema work should have an "empirical fixture check" in pre-mortem before estimating LOC.
- **Cost-correctness invariants need three test layers**. Service-level tests catch logic bugs; AI-mock end-to-end tests catch wire-up mistakes (the LLM mock proves the call shape); CLI-bin tests catch argv/JSON-output regressions. For any flag whose absence would 10× the user's bill, pay the triple-layer cost — it's cheap relative to the surprise bill.
- **Sentinel-marker byte-equality is the right shape for markdown drift detection**. Not file-byte-equality (impossible); not "string contains" (too loose); region-byte-equality with explicit start/end markers + a mutation-sanity test. Reusable for any "this prose must mirror that prose" requirement.
- **Profile-driven review is the load-bearing review for cross-package branches**. Per-task reviews are scoped to one PRD task; cross-cutting invariants (lock asymmetry, dark backend tests, footguns in service exports) only surface when reviewer is loaded with the full profile set. For any branch touching packages/{cli,core,apps}, plan for the profile review as the gate, not an optional polish pass.
- **"Side effects of a fix beyond the branch's scope are net-positive when caught and named"**. SeedLockHeldError.name fix un-deading two prior dead catches is the kind of incidental improvement the parent build's dark-code learning was meant to surface; capturing it in the dark-code audit document made it visible to the eventual PR body, which makes the PR more informative for the next reviewer.
- **Branch-behind-main test failures are inherited, not introduced** — and only the rebase reveals them. Multi-day builds need a branch-currency check before claiming "all green." Cheap to add; one round of rework saved by doing it.
