# Final Review: slack-digest-topic-wiki

**Date**: 2026-04-29
**Branch**: worktree-slack-digest-topic-wiki (12 commits, base `bb687278`)
**Reviewer role**: Sr. Eng Manager holistic / adversarial

## Verdict

**NEEDS_REWORK** — solvable in <2 hours; one merge-blocker (branch is behind main and inherits 7 pre-existing test failures), one PRD AC violation (Topic Wiki Coverage docs section), plus a handful of low-severity findings. Core implementation is sound; pre-mortem HIGH risks are all mitigated. None of the findings indicate dark code.

## End-to-end trace

Walked the slack-digest → topic page chain:

1. **Skill Phase 2a** runs `arete topic list --active --slugs --json` (Task 3 primitive). Calls `renderActiveTopicsAsSlugList(getActiveTopics(...))` directly — zero local rendering (PRD Task 3 AC met). Wired in `SKILL.md:138`.
2. **Skill Phase 2c** extracts per-thread topic slugs biased by the active list. Bias-block text is byte-equal to `TOPIC_BIAS_BLOCK_PROMPT` in `meeting-extraction.ts:518` (drift test at `slack-digest-bias-block.test.ts` enforces).
3. **Skill Phase 5a** writes `resources/notes/{date}-slack-digest.md` with `topics: [union of per-thread slugs]` in frontmatter.
4. **Skill Phase 5b** invokes `arete topic refresh --slugs "$SLUGS" --source "$DIGEST" --yes --json`.
5. CLI validates `--source` exists and matches meeting/slack-digest filename pattern (`topic.ts:332-358`); rejects garbage early.
6. CLI calls `services.topicMemory.refreshAllFromSources({ slugs, sourcePath, today, callLLM, workspaceRoot, lockLabel })`.
7. Service acquires `.arete/.seed.lock` via `acquireSeedLock`. On `EEXIST`, throws `SeedLockHeldError`.
8. CLI catches `SeedLockHeldError` (`topic.ts:487-503`); emits `{"error":"seed_lock_held",...}` JSON to stdout; exits 1.
9. Skill bash greps stdout for `"error":"seed_lock_held"`; logs hint, continues. Digest already committed; only topic narrative deferred. Re-run path documented at `SKILL.md:570`.
10. On lock acquired: `discoverTopicSources` scans `resources/meetings/*.md` and `resources/notes/<YYYY-MM-DD>-slack-digest.md`, parses both via `parseMeetingFile`. `--source` filter narrows to single entry (exact match OR suffix match either direction — accommodates absolute vs. relative path mismatches).
11. Per-slug filter via `entry.topics.includes(targetSlug)`. Per (slug, source), `integrateSource` runs: idempotency-checks via `hashMeetingSource` body-hash, calls LLM, parses response, applies output. `sources_integrated` array appended.
12. Topic page written via `storage.writeIfChanged`. Lock released in `finally`.

**Where it could break**: the entire chain hinges on the slack-digest skill emitting a comma-separated `$SLUGS` shell variable from a markdown-only contract. There is no automated test that the skill bash-block parses the digest's `topics:` frontmatter into a `$SLUGS` variable. If the user's environment lacks `yq`/`jq` or the slug-extraction grep pattern drifts, the skill silently invokes `arete topic refresh --slugs "" --source <digest>`, which exits with "Specify a slug, --slugs, or --all" and returns with code 1 — not catastrophic, but the digest's `topics:` go un-integrated until a future `arete topic refresh --all`. The SKILL.md does not show how `$SLUGS` is populated; that's left to the model executing the skill. Acceptable because the parent meeting path is similarly markdown-driven, but it's an unverified assumption the parent build does not have either.

## Pre-mortem mitigation effectiveness

| Risk | Mitigation in build | Effective? | Evidence |
|------|--------------------|-----------:|----------|
| R1 — Skill prompt regression undetectable | `TOPIC_BIAS_BLOCK_PROMPT` exported from `meeting-extraction.ts`; `SKILL.md` wraps the byte-equal copy in `<!-- BIAS_BLOCK_START/END -->` markers; `slack-digest-bias-block.test.ts` reads both, asserts byte-equality, plus a sanity test that mutation fails. | ✓ | Test asserts at `slack-digest-bias-block.test.ts:64-70`. Mutation-detection test at line 73-80. Drift detection real. |
| R2 — `parseMeetingFile` rejects slack-digest | `parseMeetingFile` reused for both source classes; `topic-memory-discovery.test.ts` asserts a real slack-digest fixture parses cleanly with `topics`, `date`, body intact. No `parseSlackDigestFile` introduced. | ✓ | `rg parseSlackDigestFile packages/` returns 0 hits. `topic-memory-discovery.test.ts` 15+ cases cover the parsing surface. |
| R3 — Lock collision crashes skill | `seed-lock.ts:37` sets `this.name = 'SeedLockHeldError'` so `err.name`-based catches in `meeting.ts:1485` and `intelligence.ts:520` work; CLI catch at `topic.ts:487` emits parseable JSON; `SKILL.md:560-572` documents the recovery path. CLI test at `topic.test.ts:382-424` asserts the JSON contract end-to-end. | ✓ | The Task 5 side-effect fix (constructor `this.name`) un-deads two prior catch sites — `meeting.ts:1485` and `intelligence.ts:520` were dead before this branch (they used `err.name === 'SeedLockHeldError'` which never matched). This is a real net positive beyond the skill use case. |
| R4 — `--source` label-only cost surprise | `sourcePath?: string` threaded through `RefreshBatchOptions`; `discoverTopicSources` output filtered BEFORE per-slug filter; `topic-memory.test.ts` asserts "1 LLM call, prior digests do not leak"; `topic-refresh-slack.test.ts:110-125` asserts the same at the service level; `topic.test.ts` (CLI) asserts at the binary level. | ✓ | Triple-tested at three layers. Cost-correct semantics. PRD Task 5 AC met substantively. |

All 4 HIGH risks effectively mitigated.

## Adversarial findings

### Finding 1 (CRITICAL — merge blocker by definition): Branch is 1 commit behind main; inherits 7 pre-existing test failures

**What's wrong**: `git merge-base main HEAD` is `bb687278`. Main has advanced one commit beyond that (`fd3bd42a fix(test): unbreak time-dependent and stale-field test fixtures`). That fix replaced hardcoded `2026-03-15` meeting fixture dates with `Date.now() - 5 days`-relative dates. Without the fix, on today's date (2026-04-28) the `2026-03-15` meetings are >30 days old and the action-item extraction ages them out, breaking 6 tests in `person-memory-integration.test.ts`. A 7th test (`context-brief.integration.test.ts`) breaks because main renamed the field `markdown` → `raw`.

Verified: `npm test` on main → 0 failures. `npm test` on this worktree → 9 failures (6 person-memory + 2 view flakes + 1 brief integration). The 6 person-memory and 1 integration failures vanish after rebasing onto current main; the 2 view-test failures are pre-existing flakes unrelated to either branch.

**Which task should have caught it**: None — the failures were introduced on main while this branch was being built. Task 7 dark-code audit ran `npm test` against the worktree and reported all green; but the worktree itself was already behind main.

**Fix**: Rebase the branch onto current `main` (`git rebase main` from the worktree). The `fd3bd42a` fix is non-conflicting with this branch's changes (different files entirely). After rebase, `npm test` should drop to 2 view-test pre-existing flakes only.

### Finding 2 (PRD AC violation): Missing `## Topic Wiki Coverage` subsection in slack-digest SKILL.md

**What's wrong**: PRD Task 8 AC explicitly requires: "`packages/runtime/skills/slack-digest/SKILL.md` includes a `## Topic Wiki Coverage` subsection naming `--days-back=N` as the manual backfill workaround." `grep -i "topic wiki\|coverage\|backfill"` against the SKILL.md returns 0 hits. The subsection was not written. Pre-mortem Risk 6 named the exact failure mode this docs section was supposed to prevent: "users hit the gap silently and conclude 'topic wiki doesn't cover Slack' when in fact it just doesn't cover their *historical* Slack."

**Which task should have caught it**: Task 8 (documentation alignment) explicitly listed this in its AC; the implementer skipped it. The Phase 4.1 reviewer of Task 8 should have caught it.

**Fix**: Add a 3-line subsection to `packages/runtime/skills/slack-digest/SKILL.md` (per the pre-mortem's suggested wording): "Slack digests created on or after the topic-wiki integration ship date contribute to topic pages automatically. To backfill earlier digests, re-run with `--days-back=N` covering the gap." Place it near the Phase 5b topic-refresh block.

### Finding 3 (low — stale comment, but the code is correct): `topic.ts:484-485` comment lies about `SeedLockHeldError.name`

**What's wrong**: `topic.ts:484-485` says: "Note: use `instanceof SeedLockHeldError` (NOT `err.name ===`). The class doesn't set `this.name`, so `err.name` is `'Error'` for instances — `instanceof` is the only reliable check." But Task 5's side-effect fix at `seed-lock.ts:37` now DOES set `this.name = 'SeedLockHeldError'`. Both checks now work. The comment is misleading and will confuse a future maintainer who tries to simplify catches in other modules to `err.name`-based.

**Which task should have caught it**: Task 5 (which added the constructor fix) should have updated the comment in the same commit. The dark-code audit (Task 7) noted both `meeting.ts:1485` and `intelligence.ts:520` rely on `err.name`-based checks but did not flag the stale comment in topic.ts.

**Fix**: Update the comment to read: "Both `instanceof SeedLockHeldError` and `err.name === 'SeedLockHeldError'` work — the constructor sets `this.name` explicitly. `instanceof` is preferred when the class is in scope." 3-line edit in `topic.ts`.

### Finding 4 (low — Claude-Code parity gap, glossed over by Task 8): `claude-code/agent-memory.mdc` lacks the topic-substrate description

**What's wrong**: Task 8 PRD AC: "Claude-side rules: either a parallel update to `packages/runtime/rules/claude/agent-memory.mdc` (or equivalent file) OR an explicit note in this PR's description naming the parity gap." The dark-code-audit doesn't mention the parity gap. The progress.md doesn't mention it. The actual claude-code variant (`packages/runtime/rules/claude-code/agent-memory.mdc`) is much shorter than the cursor variant — it lacks an entire "Topic Memory (L3 — Computed, LLM-synthesized)" section that the cursor variant has. The cursor variant was extended to mention slack-digest at line 87; the claude-code variant has nothing analogous to update OR diverge from. Either the claude-code file should be extended to match cursor (preferred — they should be parallel) or the parity gap should be documented somewhere in the PR record. Task 8 noted in chat that "no topic-substrate description there to update" — technically true for the slug-substrate paragraph specifically, but the broader L3 architecture section is also missing from claude-code, and the inconsistency is now wider.

**Which task should have caught it**: Task 8. The audit-doc and progress.md don't record the gap.

**Fix**: Either (a) port the cursor variant's "L3 has three flavors", "Area Memory", "Topic Memory" sections into the claude-code variant (low-risk; the body is markdown), OR (b) add an explicit note to the PR description: "Claude-Code agent-memory.mdc not updated for topic-memory parity; defer to future Claude-Code rules consolidation." (a) is preferred but optional; (b) is sufficient to meet the AC.

### Finding 5 (low — phase-c plan still mentions `refreshAllFromMeetings` 4×): Stale references to old method name in phase-c

**What's wrong**: `dev/work/plans/topic-wiki-memory-phase-c/plan.md` lines 48, 136, 198, 205 still mention `refreshAllFromMeetings`. Lines 48/136/205 describe historical state or alternative paths that weren't implemented; line 198 is correct (says "was renamed to"). The PRD §5 grep gate `rg -n 'refreshAllFromMeetings' packages/{cli,core,apps}/src` was 0-hit (correct), but the broader "no stale references in any operational tooling/docs" hygiene was not enforced.

**Which task should have caught it**: Task 8 (docs alignment). Its grep audit only covered `packages/core/src/services/topic-memory.ts`'s doc comments per the AC; the phase-c plan was outside that grep.

**Fix**: Update phase-c lines 48, 136, 205 to use `refreshAllFromSources`. ~3 line edits. Line 198's wording is fine.

### Finding 6 (informational — not a blocker): Skill `$SLUGS` parsing is unverified contract

**What's wrong**: `SKILL.md:556` says `SLUGS="<comma-separated topics from digest frontmatter>"` — a placeholder the model executing the skill must fill in. No automated test exercises the skill end-to-end (the bias-block test is the only skill-side test). If the model emits whitespace-padded slugs, an empty string, or a YAML-list shape rather than comma-separated, the CLI's `resolveTargetSlugs` either rejects or processes wrongly. Equivalent gap exists for meeting approve too, so this is not net-new risk.

**Which task should have caught it**: Out of scope per Task 4 ("skill is markdown-authored, NOT unit-tested as a prompt"). Acceptable trade-off; the byte-equal bias test catches the highest-value drift case.

**Fix**: None required. Note for future: when Phase C item 5's AI-mock-CLI harness lands, an end-to-end skill flow test would close this. Today's CLI integration test suite already covers all the CLI-level invariants.

### Finding 7 (informational — boundary test exists at scope): Tasks 2 + 5 boundary covered

**What's wrong**: I checked whether the Task-2 (`discoverTopicSources`) + Task-5 (`--source` filter) boundary is tested together against a multi-digest workspace. Yes — `topic-memory.test.ts` "sourcePath scoping" cases set up 4 digests + 1 meeting and assert `--source` returns only the matched entry. CLI-level: `topic.test.ts` `--source` scoping test sets up 3 prior digests + 1 new and asserts only the new digest's hash lands in `sources_integrated`. Mixed-source case (1 meeting + 1 slack-digest) tested. Cross-task gap: not present.

**Verdict**: No fix.

## Gates

- **typecheck**: PASS (`@arete/cli` + `@arete/core` builds clean)
- **tests**: 3398/3409 pass (9 fail, 2 skip). Of the 9 failures:
  - 6 in `person-memory-integration.test.ts` — pre-existing fixture date drift; fixed by rebase onto main
  - 1 in `context-brief.integration.test.ts` — pre-existing field rename (`markdown` → `raw`); fixed by rebase
  - 2 in `view.test.ts` — pre-existing flake on main as well (verified independently)
- **grep gates**: PASS
  - `rg -n 'refreshAllFromMeetings' packages/{cli,core,apps}/src` → 0 hits
  - `rg -n 'parseSlackDigestFile' packages/` → 0 hits
  - `rg -n 'discoverTopicSources|refreshAllFromSources' packages/{cli,core,apps}/src` → 13+ hits across 6 production paths
- **scoped tests**: PASS (386/386 in slack-digest-related test files including the bias-block byte-equality, lock-collision CLI test, mixed-source refresh, and `--source` scoping at three layers)
- **git status**: clean

## Recommendation

Block merge until two issues are addressed; the rest are nice-to-haves.

**Must-fix before merge** (ordered by criticality):

1. **Rebase the branch onto current main.** The `fd3bd42a` fixture-fix on main is the actual content; the branch should incorporate it so CI is green. This is a 5-minute operation.
2. **Add the `## Topic Wiki Coverage` subsection to `slack-digest/SKILL.md`** with the `--days-back=N` backfill note (3 lines). PRD Task 8 AC strictly required it; pre-mortem Risk 6 named the exact silent-gap failure mode. 

**Should-fix before merge**:

3. **Update the stale comment at `topic.ts:484-485`** to say both checks now work (3-line edit).
4. **Update `phase-c/plan.md` lines 48, 136, 205** to use `refreshAllFromSources` (3-line edit).

**Optional (defer or note in PR description)**:

5. Either port the cursor `agent-memory.mdc` topic-memory sections into the claude-code variant, or add an explicit "Claude-Code parity not addressed in this PR" line to the PR body.
6. Note in PR description that the skill `$SLUGS` extraction is markdown-only-contracted (parity with meeting approve); future Phase C item 5 closes the gap end-to-end.

After (1) and (2), this is ready for Phase 4.3 → 5 → merge. The pre-mortem HIGH risks are all genuinely mitigated; no dark-code regressions; the load-bearing chain (skill → CLI → core → topic page) is end-to-end tested at three layers including lock contention and `--source` scoping.
