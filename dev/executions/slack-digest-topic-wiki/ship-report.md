# Ship Report: slack-digest-topic-wiki

**Plan**: dev/work/plans/slack-digest-topic-wiki/plan.md
**PRD**: dev/work/plans/slack-digest-topic-wiki/prd.md
**Branch**: worktree-slack-digest-topic-wiki (14 commits, base = main `bb687278`)
**Worktree**: /Users/john/code/arete/.claude/worktrees/slack-digest-topic-wiki
**Started**: 2026-04-29T03:09:50Z (build log Phase 0 / plan saved 2026-04-28)
**Completed**: 2026-04-29 (build wrapped — Phase 5)

## Summary

Wired slack-digest as a second source class for L3 topic-wiki memory. Closes the gap from the 2026-04-23 build where Hook 2 fired only on `meeting approve` — a Slack thread that resolved a Cover Whale templates question never reached `cover-whale-templates.md`. The skill now extracts per-thread topic slugs (biased by the same active-slug list the meeting prompt uses, byte-equal via sentinel-marker drift test), writes a per-digest topic union into the digest file's frontmatter, and runs `arete topic refresh --slugs <list> --source <digest-path>` after Phase 5a. New CLI primitive `arete topic list --active --slugs --json` is the markdown-skill's bridge to the in-core slug renderer.

Service-side: `refreshAllFromMeetings` renamed to `refreshAllFromSources` across 8 production sites including `packages/apps/backend/src/routes/meetings.ts:244` (the site plan v1 missed). New `discoverTopicSources` scans both `resources/meetings/*.md` and `resources/notes/*-slack-digest.md` via the **existing** `parseMeetingFile` (no second parser — empirical recon refuted plan v1's `parseSlackDigestFile` cost). `--source` is a real scoping filter, not a label-only logging hint, triple-tested at service / AI-mock-end-to-end / CLI-bin layers. Bonus side-effect: the `SeedLockHeldError.name` constructor fix un-deads two pre-existing dead `err.name === 'SeedLockHeldError'` catches in `meeting.ts:1485` and `intelligence.ts:520` — net-positive beyond branch scope.

Build was 14 commits / 8 tasks / ~85 new tests / 2 rework cycles (final-review rebase + 3 doc nits; code-review backend test + filter tightening + 2 stale-comment fixes). All 4 HIGH pre-mortem risks effectively mitigated; 0 CRITICAL emerged mid-build.

## Phases

| Phase | Status | Outcome |
|---|---|---|
| 0 Build log | DONE | Created from template, mode = single-phase flat step list |
| 1.1 Plan saved | DONE | Plan saved to `dev/work/plans/slack-digest-topic-wiki/plan.md`, status approved |
| 1.2 Pre-mortem | DONE | 13 risks (0 CRITICAL / 4 HIGH / 6 MEDIUM / 3 LOW); gate signal PROCEED. Flagged 3 plan inaccuracies (call-site count, lock semantics, parser duplication) |
| 1.3 Cross-model review | DONE | Approve with suggestions, no structural blockers; 2 plan corrections applied (drop `parseSlackDigestFile`, bump rename to 9 sites incl. backend route) |
| 2.1 Memory review | DONE | 5 bullets / 21 entries scanned, 5 LEARNINGS.md scanned; 0 contradictions |
| 2.2 PRD generation | DONE | 8 tasks / 65 ACs, all schema-valid; 5 memory bullets reflected in task ACs |
| 2.3 Commit on main | DONE | sha `bb687278` (6 artifacts: plan, pre-mortem, review, memory-synthesis, prd.md, prd.json) |
| 3.1 Worktree create | DONE | `.claude/worktrees/slack-digest-topic-wiki` on `worktree-slack-digest-topic-wiki` |
| 3.2 Switch to worktree | DONE | Worktree Guard verified (`.git` is file, branch correct, PRD files accessible) |
| 4.1 Build (8 tasks) | DONE | 12 commits across tasks; all 8 tasks pass per-task review on first or second pass |
| 4.2 Final review | DONE (rework applied) | NEEDS_REWORK — 1 merge-blocker (branch behind main → 7 inherited test failures) + 1 PRD AC violation (Topic Wiki Coverage subsection) + 3 minor doc nits. All fixed in commit `ffe6bcd2` |
| 4.3 Dark-code audit | DONE | 0 dark exports across 5 new + 1 renamed; all grep gates pass; SeedLockHeldError.name un-deads 2 prior catches (recorded as side-effect) |
| 4.4 Eng-lead profile review | DONE (fixes applied) | APPROVE_WITH_FIXES — Findings 1 (`--source` 3-way matching footgun, low; CLI normalizes so not exploitable today), 2 (backend approve route topic-ingest is structurally dark, low), 3 (`console.warn` profile drift, low). Code-review fixes applied in commit `7e3ba792` (backend integration test added; PR body will note Findings 1/3 as deferred follow-ups) |
| 5.1–5.5 Wrap | DONE | This report + memory entry + LEARNINGS updates + wrap-checks |
| 5.6 Merge gate | PENDING | Builder decision (M/R/L) |

## Pre-mortem effectiveness

| Risk | Tier | Materialized? | Mitigation Effective? | Evidence / Note |
|------|------|---------------|----------------------|-----------------|
| R1 — Skill prompt regression undetectable (bias-block drift) | HIGH | No | Yes | `TOPIC_BIAS_BLOCK_PROMPT` exported from `meeting-extraction.ts:518`; SKILL.md wraps byte-equal copy in `<!-- BIAS_BLOCK_START/END -->` markers; `slack-digest-bias-block.test.ts` asserts byte-equality + sanity-mutation + duplicate-marker count. Dual-tier sprawl defense actually has both tiers tested now. |
| R2 — `parseMeetingFile` rejects slack-digest | HIGH | No (false alarm; verified pre-build) | Yes | Pre-mortem ran a real fixture through the parser, refuted plan v1's `parseSlackDigestFile`. PRD dropped the parser. `topic-memory-discovery.test.ts` asserts a real `2026-04-28-slack-digest.md` parses cleanly. `rg parseSlackDigestFile packages/` returns 0. **Highest-leverage simplification of the entire build.** |
| R3 — Concurrent meeting-approve + slack-skill collide on non-reentrant `.seed.lock` | HIGH | Latent | Yes + bonus | CLI catches `SeedLockHeldError`, emits `{"error":"seed_lock_held"}` JSON contract; `topic-refresh-slack.test.ts:127` asserts non-fatal exit; SKILL.md Phase 5b documents recovery path. **Bonus**: `seed-lock.ts:37` constructor fix (`this.name = 'SeedLockHeldError'`) un-deads two pre-existing dead `err.name`-based catches in `meeting.ts:1485` + `intelligence.ts:520`. Net-positive beyond branch scope. |
| R4 — `--source` label-only causes cost surprise | HIGH | No (about-to-ship before pre-mortem caught it) | Yes | Re-litigated pre-PRD: `sourcePath?: string` threaded through `RefreshBatchOptions`; discovery filtered BEFORE per-slug filter. Triple-tested: `topic-memory.test.ts:614` (service), `topic-refresh-slack.test.ts:110` (AI-mock end-to-end), `topic.test.ts:344` (CLI bin). Fixture: 3 prior digests + 1 new digest tagged `foo`; assertion: LLM called exactly 1× not 4×. |
| R5 — Rename count off (8 sites incl. backend route) | MEDIUM | No (caught pre-build) | Yes | All 8 sites renamed; `rg refreshAllFromMeetings packages/{cli,core,apps}/src` → 0 hits. Backend route at `meetings.ts:244` (the missed-by-plan-v1 site) is hit. |
| R6 — `--days-back=N` recovery undocumented | MEDIUM | Initially yes (skipped by Task 8 implementer) | Yes after rework | Final review caught the missing `## Topic Wiki Coverage` subsection. Added in commit `ffe6bcd2`. |
| R7 — sibling slack-evidence-dedup frontmatter additions bust hash | MEDIUM | No | Yes | `topic-memory-discovery.test.ts:158` asserts `dedup_processed_at` frontmatter edit on a slack-digest fixture leaves `hashMeetingSource` byte-identical. Body-only invariant holds. |
| R8 — Per-digest union pollutes single-thread topic narratives | MEDIUM | Unverified | Bet, not test | The per-thread extraction → per-digest union → topic page integration bets on `integrateSource`'s "update only sections substantively changes" prompt directive (`topic-memory.ts:703`). Tests don't exercise this — the AI mock returns canned JSON. Plan honest about it; deferred to per-thread source-segment plan if real-world drift emerges. |
| R9 — AI-mock harness diverges from Phase C item 5 | MEDIUM | No | Yes | Constrained to `AIServiceTestDeps` injection only; test file ≤150 LOC verified. If item 5 lands first, this test imports its harness. |
| R10 — `arete topic list --active --slugs` rendering drift | MEDIUM | No | Yes | Implementation literally calls `renderActiveTopicsAsSlugList(getActiveTopics(...))`; `topic-list-active-slugs.test.ts` asserts byte-equality with direct in-process call. |
| R11 — `topics:` aggregation timing across skill phases | LOW | No | Yes | Phase 5a writes digest before Phase 5b runs topic refresh; SKILL.md Phase 5 has explicit ordering note. |
| R12 — `--slugs` vs positional ambiguity | LOW | No | Yes | `resolveTargetSlugs(positional, slugsFlag, all)` helper is single source of truth; both-set returns error; `--all` overrides; exported for unit testing. |
| R13 — phase-c plan factual error about digest path | LOW | No (caught pre-build, fixed in Task 8) | Yes | `rg slack-digests dev/work/plans/topic-wiki-memory-phase-c/plan.md` → 0 hits; corrected path in 4 lines (3 stale `refreshAllFromMeetings` references in phase-c also fixed during code-review rework). |

**Score**: 13/13 risks had documented mitigations; 0 materialized post-merge; 1 (R4) was about to ship label-only before pre-mortem flagged it; 1 (R6) was skipped by per-task review and caught in final review (3-line fix). The bias-block + lock-collision + scoping mitigations were the load-bearing ones.

## Notable findings (load-bearing)

1. **`SeedLockHeldError.name` constructor fix is a net-positive side effect** — the branch needed `err.name === 'SeedLockHeldError'` to work in `topic.ts`'s JSON-shape catch, so `seed-lock.ts:37` got `this.name = 'SeedLockHeldError'`. The audit revealed `meeting.ts:1485` and `intelligence.ts:520` had been doing the same string-name catch against the prior un-named class — silently never matching since their introduction. Both got revived by the fix. Worth calling out in the eventual PR body for future readers.

2. **Empirical recon caught a parser fork before it shipped** — pre-mortem reviewer parsed a real `2026-04-28-slack-digest.md` through the existing `parseMeetingFile` and showed the parser already handles the slack-digest shape. Plan v1's ~30-LOC `parseSlackDigestFile` got dropped; single test in Task 2 instead of a sibling parser. Generalizes: empirical recon before architectural decisions catches the cheap-vs-expensive choice that prose review can't.

3. **Profile-driven final review caught a backend dark-code gap that per-task reviews missed** — the renamed `refreshAllFromSources` call at `packages/apps/backend/src/routes/meetings.ts:244` is typecheck-only verified; no integration test exercises it. Per-task reviews of Task 1 (rename) and Task 7 (dark-code audit) both reported "all callers verified," but neither asked "is this caller exercised by a test?" The eng-lead/backend-profile review caught it (Finding 2 of code-review.md). Code-review fix added a `meetings-topic-refresh.test.ts` (144 lines) that exercises the route's topic-ingest block end-to-end against a hand-rolled Hono app + fake `services.topicMemory.refreshAllFromSources`. **The Task 7 audit answers "is the export wired?" — necessary but not sufficient. The complementary profile-driven question is "is the wiring exercised end-to-end?"** Document this as a process improvement.

4. **macOS `/var → /private/var` symlink trap on `--source` flag** — `--source <path>` strict-equals against `discoverTopicSources` output; storage listing roots at `findRoot()` → realpath form (`/private/var/...`); a user passing `--source /var/folders/...` lands `sourcePath === '/var/folders/...'` and the strict-equal misses, filter degrades to "no entries match," LLM called 0×, no hint to the user. Fixed by `realpathSync(path.resolve(cwd, opts.source))` at the CLI boundary. Captured in CLI LEARNINGS as a generic gotcha for any future `--source <path>` flag that strict-equals against storage paths.

5. **Per-task PRD line-number drift is doc-drift waiting to happen** — Task 7's expected line numbers (`topic.ts:253/331/787/910`) were stale by the time Task 5's `--source` and `--skip-topics` flag wiring landed (actual `:469/940/1063` plus a new estimate-preview pass at `:390`). The dark-code audit's verdict is correct (all 7 expected logical sites map 1:1 to actual sites), but the literal line-number table is stale doc the moment a sibling task adds code. Generalizes: pin symbols + files in PRDs, not literal line numbers; let grep counts be the durable assertion.

## What's next

1. **Builder reviews this report + the diff** (`git diff main...worktree-slack-digest-topic-wiki`).
2. **Builder decides merge gate**: M (merge now), R (review more), L (later).
3. **PR body should explicitly call out**:
   - The `SeedLockHeldError.name` un-deading of two prior dark catches (positive surprise).
   - Code-review Finding 1 deferred (`--source` 3-way matching footgun in service; CLI normalizes so not exploitable today; tighten when the Phase C item 2 background queue lands).
   - Code-review Finding 3 deferred (`console.warn` in `discoverTopicSources` is a documented profile exception; escalate to logger DI if a second `console.*` shows up).
   - The skill `$SLUGS` extraction is contract-by-prose (parity with meeting-approve flow); future Phase C item 5's AI-mock harness closes the end-to-end skill-flow gap.
4. **After merge**: cleanup via `/ship cleanup slack-digest-topic-wiki`.

## Surprising positive

The branch needed `err.name === 'SeedLockHeldError'` to work for `topic.ts`'s JSON-shape catch, so `packages/core/src/services/seed-lock.ts:37` got a one-liner: `this.name = 'SeedLockHeldError'`. The dark-code audit then revealed that `meeting.ts:1485` and `intelligence.ts:520` had been doing `err.name === 'SeedLockHeldError'` against the prior un-named class for months — silently never matching since the catch sites' introduction. Both pre-existing catches got revived by the fix.

This is the kind of incidental improvement the parent build's 2026-04-23 dark-code learning was meant to surface: when fixing one dead catch, grep all string-name catches of the same class — they may have been dead too. Captured in the dark-code audit as "side effect, net-positive beyond branch scope" and worth highlighting in the eventual PR body for future readers.

## Wrap-checks

- `npm run typecheck`: PASS (clean across `@arete/core` + `@arete/cli`)
- `git status`: PASS (clean working tree)
- `git log main..HEAD --oneline | wc -l`: 14 (matches build log)
- `rg refreshAllFromMeetings packages/{cli,core,apps}/src`: 0 hits PASS
- `rg parseSlackDigestFile packages/`: 0 hits PASS
- `rg discoverTopicSources|refreshAllFromSources packages/{cli,core,apps}/src`: 13+ hits PASS (audit doc enumerates 8 production callers)
- `rg 'TODO|FIXME|XXX'` over branch-changed `*.ts`: 1 pre-existing match (an unrelated comment-line pattern), 0 new TODOs PASS

## Artifacts

| Artifact | Path |
|----------|------|
| Plan | `dev/work/plans/slack-digest-topic-wiki/plan.md` |
| Pre-mortem | `dev/work/plans/slack-digest-topic-wiki/pre-mortem.md` |
| Cross-model review | `dev/work/plans/slack-digest-topic-wiki/review.md` |
| Memory synthesis | `dev/work/plans/slack-digest-topic-wiki/memory-synthesis.md` |
| PRD | `dev/work/plans/slack-digest-topic-wiki/prd.md` |
| Final review | `dev/work/plans/slack-digest-topic-wiki/final-review.md` |
| Code review (eng-lead profile) | `dev/work/plans/slack-digest-topic-wiki/code-review.md` |
| Dark-code audit | `dev/executions/slack-digest-topic-wiki/dark-code-audit.md` |
| Build log | `dev/executions/slack-digest-topic-wiki/build-log.md` |
| Memory entry | `memory/entries/2026-04-29_slack-digest-topic-wiki-learnings.md` |
| Ship report (this) | `dev/executions/slack-digest-topic-wiki/ship-report.md` |
