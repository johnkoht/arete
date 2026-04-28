## Pre-Mortem: Wiki-leaning meeting extraction

Categories covered: Context Gaps, Test Patterns, Integration, Scope Creep, Reuse / Duplication, Dependencies, Code Quality, State Tracking.

---

### Risk 1: `MeetingContextDeps` consumer breakage from `topicMemory` injection

**Problem**: Plan adds `topicMemory: TopicMemoryService` to `MeetingContextDeps` (`meeting-context.ts:122`). Every `buildMeetingContext` caller — CLI (`packages/cli/src/commands/meeting.ts`), backend (`packages/apps/backend/src/services/agent.ts`), and any test factory constructing the deps bag — must be updated. If a single caller is missed it either won't compile (TS) or, worse, hits an undefined-method crash at runtime when wiki injection runs.

**Mitigation**: Before editing the type, run `rg -nF "buildMeetingContext(" packages/` and `rg -nF "MeetingContextDeps" packages/` to enumerate all call sites and test factories. Update each in the same PR. Add `topicMemory` to the central core test factory (the same one updated in commit `b0de80e9` for `topicMemory + memoryIndex + memoryLog`) so per-test files inherit it.

**Verification**: `pnpm -w typecheck` is clean; `rg -nF "MeetingContextDeps" packages/` shows every construction site includes `topicMemory`; `rg -n "buildMeetingContext\\(" packages/` count matches call-site update count in the diff.

---

### Risk 2: Parser regex over-matches or double-matches mixed `##`/`###` headers

**Problem**: `parseMemorySections` is being widened to accept `## Title`, `### YYYY-MM-DD: Title`, and `### Title`. Existing memory files in users' vaults are heterogeneous — some entries are `### 2025-11-04: Decided X`, some legacy plain `### Title`, future ones are `## Title` with `**Date**:` bullet. A naive alternation regex can: (a) treat a `###` as a sub-section of a `##` and miss it, (b) match the same heading twice if both branches fire, (c) confuse content lines starting with `##` (rare but possible in transcripts) for headers.

**Mitigation**: Anchor the regex to line-start with `^` and explicit `\n` boundaries; require exactly 2 or 3 leading `#` (use `^(##|###) ` not `^#{2,3}`). Walk the file once, classifying each header line into a single shape with priority order (date-prefixed `###` > plain `###` > `##`). Add fixture tests in `packages/core/test/services/memory.test.ts` covering: pure-`##` file, pure-legacy-`###` file, mixed file, file with a `## ` token inside a fenced code block (negative case), and a file where one heading has trailing whitespace.

**Verification**: New test file has at least 5 fixture cases including the mixed-shape and code-fence negative case; `parseMemorySections` returns the expected count of sections for each fixture; running the parser against `~/areteVault/memory/learnings.md` and `decisions.md` (real user data) returns >= the count returned by the legacy parser today.

---

### Risk 3: Golden snapshot churn cascade across CLI fixtures

**Problem**: Renaming `## Summary` to `## Core` plus adding `## Could include` will invalidate every meeting golden fixture under `packages/cli/test/golden/`. If the regeneration step is non-deterministic (LLM output baked into goldens) the refresh is painful and risks hiding real regressions. Also any meeting frontmatter file under `dev/work/` or examples used in tests may carry `## Summary` headings that downstream code now treats as legacy fallback.

**Mitigation**: First run `rg -n "^## Summary" packages/cli/test/ packages/core/test/` and `rg -n "^## Summary" packages/cli/test/golden/` to enumerate every fixture that needs touching; list them in the PR description. Use deterministic seeded fixtures (no live LLM) for the goldens — if any golden is currently sourced from a real model call, replace it with a recorded fixture before the rename so the diff is purely rename-driven. Implement the `summary → core` fallback in `formatStagedSections` first and verify old fixtures still pass with no rename, then rename in a follow-up commit within the PR for clean blame.

**Verification**: After fixture refresh, `rg -n "^## Summary" packages/cli/test/golden/` returns 0; `git diff --stat packages/cli/test/golden/` shows only header-rename-shaped diffs (no body content changes); CI green twice in a row (rerun catches flake).

---

### Risk 4: Lexical topic detection precision/recall on real transcripts

**Problem**: The threshold (≥2 distinct multi-char slug tokens AND coverage ≥ 0.5) is plausible but unvalidated. False positives waste tokens and pollute the "already known" context — making the LLM suppress *real* deltas because it sees a topic page that's not actually relevant. False negatives silently revert behavior to today's verbose extraction. Slugs with very common tokens (`q2-planning`, `email-templates`, `weekly-sync`) are the typical traps.

**Mitigation**: Build the dry-run flag (`arete meeting extract --dry-run-topics` or equivalent) on day one of Thread B, before wiring detection into the prompt. Run it against at least 5 recent real meetings and log `{slug, score, matched_tokens}` per meeting. Adjust thresholds based on observed data, not guesses. Add a stop-token list for generic single-token slugs (`planning`, `sync`, `review`, `email`) inside `tokenizeSlug` consumers — only count them when paired with another distinctive token.

**Verification**: Dry-run output captured in PR description for ≥5 meetings; no meeting has more than 5 detected topics; spot-check shows zero "obviously wrong" matches on the sample; unit test `topic-detection.test.ts` includes the explicit single-token-coincidence rejection case from the plan.

---

### Risk 5: Token-budget blowout on extraction prompt

**Problem**: New `MAX_TOPIC_WIKI_CONTEXT_CHARS = 6000` stacks on `MAX_EXCLUSION_CHARS = 4000`, the new delta-only directive (~1KB), the schema, the transcript itself, and the `enhancedContext`. A long meeting with 5 detected topics could push close to model context limits or sharply increase per-meeting cost — users may not notice until the bill lands.

**Mitigation**: Add char-count instrumentation that logs (at info level, not debug) total prompt char count, transcript char count, and topicWikiContext char count for the first N meetings. Place the topic-wiki context truncation BEFORE prompt assembly (not after) so we always cut from the wiki side first, never from transcript or directive. Cap detected topics at 3 (not 5) for the initial rollout; raise after observing real usage. Add a unit test that constructs an artificially huge `topicWikiContext` and verifies output prompt is ≤ a sanity ceiling.

**Verification**: First 3 real meetings post-merge logged with prompt-size telemetry visible in CLI output; truncation unit test exists in `meeting-extraction.test.ts`; `MAX_TOPIC_WIKI_CONTEXT_CHARS` is referenced exactly once (defined as a const, no magic number duplication).

---

### Risk 6: LLM over-suppression — real new learnings dropped as "already known"

**Problem**: The delta-only directive is strong ("Do NOT emit: Restatements... Confirmations... Status updates... The same fact described differently"). The LLM may interpret a genuinely-new nuance as a "rephrasing" of something on the wiki and silently drop it. Unlike token bloat this failure mode is invisible — recaps just get thinner with no signal that something was suppressed.

**Mitigation**: In the prompt, add an explicit "When in doubt, INCLUDE" tiebreaker after the suppression rules. Keep the eval-harness (per memory: `feedback_eval_harness_local`) as a one-off `scripts/` script that runs the new prompt against 5–10 historical meetings and diffs extracted-item count + content vs. pre-change baseline; eyeball the diffs once before merging. If suppression is too aggressive, soften the directive language rather than reverting the whole feature.

**Verification**: Eval-script run captured in PR description showing extracted-item counts before/after for the sample meetings; no sampled meeting drops to zero learnings/decisions; "When in doubt, INCLUDE" string is present in the assembled prompt (assertable in `meeting-extraction.test.ts`).

---

### Risk 7: Backend `activeTopicSlugs` change silently shifts web-path output

**Problem**: `agent.ts:220` is currently NOT passing `activeTopicSlugs`, meaning the web path runs without slug-bias defense. Adding it is correct but is a behavior change. Any backend integration test or fixture that asserts current (slug-bias-disabled) extraction shape will break, and the user may not realize the web recap output is changing in ways orthogonal to the wiki-leaning work.

**Mitigation**: Before the edit, run `rg -nF "activeTopicSlugs" packages/apps/backend/` to enumerate everything that touches it, and `rg -nF "agent.ts" packages/apps/backend/test/` for related tests. Call out the backend behavior change explicitly in the PR description as a "latent bug fix, observable side effect" — don't bury it. If any backend e2e fixture asserts the old extraction shape, refresh it as part of the same PR with a note in the commit message.

**Verification**: Backend test suite green; PR description has a "Behavior changes on web path" subsection listing the `activeTopicSlugs` fix; `rg -nF "activeTopicSlugs" packages/apps/backend/src/` shows the new wiring.

---

### Risk 8: Single-PR scope creates hard-to-bisect regressions

**Problem**: Threads A (schema + parser), B (detection + injection), C (output reshape) ship together touching 12+ files. If a regression surfaces post-merge — say, recaps look thinner than expected — `git bisect` lands on a single mega-commit and the user has to read the whole diff to figure out which thread caused it. Decision #4 explicitly accepts this trade-off; the risk is that we don't structure the PR to mitigate it.

**Mitigation**: Within the single PR, structure commits along thread boundaries: one commit per thread (A, B, C) plus a final wiring commit, each independently green at the test level. This preserves bisectability inside the PR even though it merges as a unit. Use the existing git-safety practice (new commits, not amends). Tag the PR description with the explicit fallback plan: if Thread C output causes problems, the `summary` fallback path means we can revert just the formatter commit while keeping A+B.

**Verification**: PR shows ≥3 commits with thread-aligned messages (`feat(core): thread A — ...`, etc.); `git log --oneline <pr-base>..HEAD` reads as a clear narrative; each commit's tests pass when checked out individually (`git checkout <sha> && pnpm -w test`).

---

### Risk 9: `summary` ↔ `core` coexistence on already-processed meetings

**Problem**: Plan keeps `summary` accepted for backward compat — good. But existing meeting files in the user's vault have `## Summary` written into the body. On next process/re-render, do they get rewritten as `## Core`? If yes, every old meeting file produces a noisy diff. If no, the vault has mixed `## Summary`/`## Core` files forever. Either way the user (who is also the only daily user — see memory) needs to know which behavior to expect.

**Mitigation**: Decide explicitly: do not auto-rewrite. Old meeting bodies stay as `## Summary`; new ones are `## Core`. `STAGED_HEADERS` accepts both during apply (`meeting-apply.ts:119–124`). Add a one-line note to the PR description: "Existing meetings retain `## Summary`; new meetings use `## Core`. No backfill." If the user later wants uniformity, a `scripts/normalize-summary-to-core.ts` script is trivial and uncommitted (per `feedback_eval_harness_local`).

**Verification**: Apply a new meeting on top of a vault with old `## Summary` files; old files unchanged on disk (`git status` clean for them); `STAGED_HEADERS` test in `meeting-apply.ts` covers both `summary` and `core` keys.

---

## Summary

Total risks identified: 9
Categories covered: Context Gaps, Test Patterns, Integration, Scope Creep, Reuse / Duplication, Dependencies, Code Quality, State Tracking.

**Ready to proceed with these mitigations?**
