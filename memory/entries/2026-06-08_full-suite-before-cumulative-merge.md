# Full suite before any cumulative / long-lived-branch merge — per-file tests are blind to semantic conflicts

**Date**: 2026-06-08
**Context**: Areté v2 chef-orchestrator cumulative merge (Phases 0–12)

## What happened
Merging `main` into the long-lived `worktree-arete-v2-chef-orchestrator` branch was clean in
git (different files touched) but produced a BROKEN combination. Main shipped
`detectTopicsLexical` written against the old `tokenizeSlug`; the branch had rewritten
`tokenizeSlug` to singularize (`templates`→`template`). The transcript side
(`normalizeForJaccard`) did not singularize, so slug tokens and transcript tokens stopped
intersecting. The integrating merge (`ac0a692e`) never re-ran the full suite, so 2 failing
tests AND a real production regression (plural-form mentions silently stopped attaching topic
pages + L2 excerpts in the meeting pipeline) went unnoticed until the merge-readiness review.

## Learning
- A clean `git merge` is not a clean integration. Different-files = no textual conflict ≠ no
  semantic conflict.
- **Per-file `tsx --test` discipline (used throughout v2 to avoid the ~50-min `npm test`
  watchdog stall) is STRUCTURALLY blind to cross-file semantic conflicts** — each file's tests
  pass in isolation; the break only shows when both new behaviors run together.
- Run the FULL suite (a) after merging `main` into any long-lived branch, and (b) as the
  gitboss gate before a cumulative merge. Do not trust per-phase "tests pass" claims for the
  integrated whole.
- Fix preferred symmetric tokenization (make both sides singularize) over reverting one side —
  keep one token space, satisfy both features. Add an explicit plural/singular regression test
  to lock the invariant.
- Beware piping test runs through `tail`/`echo` — the pipeline exit code masks the runner's.
  Capture the real exit and TAP/spec counts.

## Evidence
- `phase-10-winddown-orchestrator/merge-test-failures-findings.md` (full diagnosis, Root cause A)
- Fixes: `edbe299e` (symmetric singularize), `8d94e213` (dist rebuild)
- See also `packages/core/src/services/LEARNINGS.md` (tokenizeSlug ↔ detectTopicsLexical invariant)
