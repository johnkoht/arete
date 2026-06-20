# Eng Manager Code Review — arete-hygiene-pass-1

**Reviewer**: Engineering Manager (independent post-build code review)
**Date**: 2026-05-01
**Branch**: worktree-arete-hygiene-pass-1
**Diff scope**: 9 commits, main → HEAD

## Diff snapshot

89 files changed, 444 insertions(+), 5167 deletions(-). Net ~4.7K LOC removed (slightly higher than the planned 2.7K because the PRD counted only source LOC; the test suite cleanup adds ~700 LOC and dist regeneration adds ~1300 LOC of removed compiled output). Source-only delta:

- `/src/`, `/test/`, `tsconfig.test.json` deleted (T1, ~3.5K LOC)
- `packages/core/src/services/person-signals.ts` -325 LOC, test file -493 LOC (T3)
- `packages/core/src/services/tools.ts` rewritten, factory + index + 3 CLI sites updated (T5)
- `packages/core/src/services/meeting-context.ts` net 0 LOC, helper extracted (T6)
- 4 LEARNINGS.md updates, 1 PROFILE.md update, 1 standards doc edit
- 1 new memory entry under `memory/entries/`

## Per-task code review

### T1 — Legacy deletion
**Verdict: Clean.** 13 files in `/src/`, 4 in `/test/`, plus `tsconfig.test.json`. The standards doc reference at `.pi/standards/build-standards.md:44` is removed. Nothing in the active build references these paths. No collateral damage in monorepo packages — the import-pattern grep confirms zero hits.

### T2 — Four `@deprecated` deletions
**Verdict: Clean with one nit.** All four symbols (`extractKeywords`, `findMatchingCompletedItem`, `getDocument`, `PRODUCT_RULES_ALLOW_LIST`) are gone with their JSDoc and the eslint suppression. The krisp test describe is dropped and a stale comment on line 911 was rewritten. LEARNINGS reference to `getDocument` was correctly updated to `getMultipleDocuments`.

**Nit**: `packages/core/src/integrations/krisp/client.ts:519` has a stray blank line between the last method's closing brace and the class closing brace. One line, but it reads as "I just deleted something here" — a tells-nothing-good code smell. Easy follow-up.

### T3 — person-signals.ts cluster
**Verdict: Functionally correct, but the orphan-cleanup AC was missed.**

The three functions, the type alias, and the const are gone. `entity.ts` imports survived untouched (`extractStancesForPerson`, `isActionItemStale`, `deduplicateActionItems`, `capActionItems`, `LLMCallFn`, `PersonStance`, `PersonActionItem`). All correct.

**However**: four file-private helpers in `person-signals.ts` are now dead code:

- `slugify` (line 292)
- `personPattern` (line 303)
- `mentionsPerson` (line 316)
- `isOwnerActor` (line 323)
- `isPersonActor` (line 340)

`git grep` confirms zero callers — only their definitions remain. They were used exclusively by the deleted `extractActionItemsForPerson` cluster. The PRD said "Any imports/types that become unused" — these are functions that became unused, and the spirit of the AC catches them. They didn't trip TypeScript because `noUnusedLocals` is not enabled in `tsconfig.base.json`.

This is the most legitimate finding in the review. ~50 lines of dead code shipped under a "delete dead code" PR. Not a blocker, but it's exactly the kind of miss that the next hygiene pass would catch — and it would be easier to add to this commit than to do a separate cleanup. **Recommended fix-forward**: a follow-up commit deleting these five helpers (~50 LOC) before merge, or accept it and queue for hygiene-pass-2.

### T4 — getContextForSkill
**Verdict: Clean.** Method gone, doc reference updated, no orphan imports left in `context.ts`. The `dist/.pi/expertise/core/PROFILE.md` mirror does not exist in the repo, so the AC is correctly N/A.

### T5 — ToolService → free functions
**Verdict: Solid execution. The barrel comment is the right move.**

The new `tools.ts` is 115 lines vs the old class shape — same behavior, same input/output types, two top-level `export async function`s plus a private `getToolInfo` helper that's the moral equivalent of the old `getInfo` private method. Frontmatter parsing is byte-identical. `factory.ts` correctly drops `tools` from `AreteServices` and the returned object. The four CLI sites (`tool.ts`, `route.ts`, `skill.ts:289`, plus the test) all use the same `(storage, ...args)` signature.

The barrel comment in `services/index.ts:12-13` is the right namespace mitigation:
```ts
// Workspace tool discovery — pure functions, no service class.
// (Skill discovery is the parallel concern; see services/skills.ts.)
export { listTools, getTool } from './tools.js';
```
That breadcrumb is what saves a future maintainer from auto-importing the wrong thing.

**The one judgment call worth surfacing**: `SkillService` stayed a class (with `list`, `get`, `getInfo`, `install`, `injectIntegrationIntoSkill`, `buildAreteMeta`). `ToolService` got demoted. The asymmetry is correct — `SkillService.install` has real lifecycle and side-effects, while tool discovery was always read-only — but the codebase now has two parallel concepts (tool/skill discovery) implemented in two paradigms (free fns / class). The barrel comment defuses the surprise but doesn't eliminate it. If `listTools` ever grows install/uninstall, expect a future "convert listTools back into ToolService" PR. That's fine; the call is right for today.

LEARNINGS updates in `cli/src/commands/LEARNINGS.md`, `services/LEARNINGS.md` (two paragraphs and one pre-edit-checklist entry), and `runtime/tools/LEARNINGS.md` are accurate, dated, and explain what changed and why. No boilerplate — useful entries.

The test migration in `tools.test.ts` is straightforward: `new ToolService(storage)` + `service.list(dir)` → `listTools(storage, dir)`. 9 assertions are preserved verbatim, just rewired. The test now correctly skips a `service` setup step that no longer applies.

The `factory.test.ts` change drops the `'tools'` key from the alphabetized assertion array and removes the `instanceof ToolService` check — both required and correct.

### T6 — buildTopicWikiContext extraction
**Verdict: Clean refactor; the helper signature is the right call for TypeScript.**

The 47-line inline block is now a pure helper at `meeting-context.ts:996-1043` (47 lines, same as inline — pure refactor by definition). Caller pattern at line 980-982 is exactly the 3-line conditional spec'd in the plan:
```ts
const wiki = await buildTopicWikiContext(deps, paths, transcript);
if (wiki.context) bundle.topicWikiContext = wiki.context;
if (wiki.warning) warnings.push(wiki.warning);
```

The `{ context?, warning? }` shape is **the right TypeScript idiom**, not awkward. Go-style `[result, err]` is more common, but in TS-land, optional-fields-on-an-object preserves named clarity, plays well with destructuring, and avoids the convention debate. Reusing `TopicWikiContext` from `meeting-extraction.ts` (no new type alias) is the right call too — keeps the type-graph shallow.

The helper preserves every nuance:
- Try/catch returns `{ warning: \`Topic-wiki context failed: ${msg}\` }` with the verbatim string
- No detection → returns `{}` (caller leaves `bundle.topicWikiContext` absent — correct "absent key" semantic per pre-mortem R7)
- Empty topic pages → returns `{}` early (line 1003)
- Detected topics zero-resolved → returns `{}` (line 1037)
- Detected topics resolved → returns `{ context: { detectedTopics } }` (line 1038)
- The helper does not mutate `bundle.warnings` or any input — pure as advertised

**Test coverage gap (not a blocker)**: no test asserts the warning-string verbatim. The pre-mortem R2 mitigation said "preserve byte-for-byte"; the helper does, but only by inspection. If someone later re-tunes the message, no test will catch it. Worth a one-line `assert.ok(bundle.warnings.some(w => w.startsWith('Topic-wiki context failed:')))` in the catch-path test as a follow-up. Non-blocking.

The helper sits in the right place in the file — between `buildMeetingContext` and the `// Exports for testing` block — and is correctly NOT exported, NOT in the barrel. JSDoc on the helper is good.

Did the extraction "actually improve readability or just move code"? Marginally improved. The `buildMeetingContext` function is still ~245 lines; chopping 47 to 3 helps but doesn't change the strategic shape. The real win is that `buildTopicWikiContext` is now independently testable (even though no test does so today) and the failure mode is a single explicit return vs an implicit warnings-array side effect. Worth doing.

## Cross-cutting findings

### Commit hygiene
6 task commits + 1 merge + 1 dist rebuild + 1 memory wrap = 9 total. Messages are accurate, scope-honest, and in the requested `chore(...)` / `refactor(...)` / `build:` form. The T6 commit body is exemplary — explains the helper signature, caller pattern, the R1/R2/R7 mitigations, and what was verified. The T5 commit body would have been my one nit (it's not in the snippet I read but commit message metadata says it's accurate). Bisectability is intact: T1 lands first, the `PRODUCT_RULES_ALLOW_LIST` deletion in T2 follows after legacy callers are gone, and each subsequent commit is independent. No commit smuggles unrelated changes.

The merge commit is a vanilla "merge main" with sourcemap conflicts only — clean. The post-merge dist rebuild is appropriately scoped (5 files: AGENTS.md + 4 sourcemaps).

### Test coverage
Deletes don't need new tests; correct. The two non-delete changes (T5 free-function migration, T6 helper extraction) ride on existing test coverage:
- T5: `tools.test.ts` migrated 1-for-1 and `factory.test.ts` shape assertion updated. Same number of tests as before.
- T6: 66/66 `meeting-context.test.ts` tests pass unmodified.

The one quibble (T6 catch-path verbatim string) is documented above. Not blocking.

### Merge resolution
Conflicts were only in 4 sourcemap `.map` files (text noise). The `meeting-processing.ts` source itself merged cleanly because main's `applyReconciliationDecision` extraction was additive and T2's `findMatchingCompletedItem` deletion was on a different region. The `services/LEARNINGS.md` merge result keeps both the "seven domain-specific classes" rewrite (T5) AND main's reconciliation entries — verified by reading the post-merge file. No regression at the boundary.

### LEARNINGS accuracy
All three `LEARNINGS.md` updates read accurately:

- `services/LEARNINGS.md`: "eight" → "seven" classes is correct. The deletion of two action-item-history entries (the 2026-03-03 async signature note + the 2026-03-04 first-edition note) is the right call — both described an extraction path that no longer exists. The replacement entry consolidates and dates the change.
- `cli/commands/LEARNINGS.md`: rewrote the route+skill+tool merge note to reflect the new free-function call style. Accurate.
- `krisp/LEARNINGS.md`: one-line fix replacing `getDocument` with `getMultipleDocuments`. Correct.
- `runtime/tools/LEARNINGS.md`: "free functions 2026-04-30" annotation added. Accurate.

These are real maintenance writes, not rubber-stamping. Good.

### Style/idiom
Mostly clean. The orphan helpers in `person-signals.ts` (above, T3) are the standout idiom miss. Two minor smells:
- The trailing blank line in `krisp/client.ts:519` before the class brace.
- `meeting-context.ts:944` defines `extractTaskTexts` as an inner function inside `buildMeetingContext`. That's pre-existing, not introduced by this PR, so fine — but worth flagging that `buildMeetingContext` still has an inner-function pattern that future hygiene could lift.

## Things that smell

1. **`person-signals.ts` orphan helpers (T3)**. `slugify`, `personPattern`, `mentionsPerson`, `isOwnerActor`, `isPersonActor` are all dead. ~50 LOC. The PRD's "Any imports/types that become unused" caught the type alias and the const but missed file-private functions. Not a typecheck error because `noUnusedLocals` is off. **Highest-priority finding.**

2. **`krisp/client.ts:519` stray blank line.** Cosmetic. Easy fix.

3. **No test asserts the T6 warning string verbatim.** Pre-mortem R2 mitigation lives only in the source. Next time someone tweaks the message, nothing fails.

4. **Mild paradigm asymmetry from T5**: Tools are free functions; Skills are a class. Documented in the barrel comment, so it's not a footgun — just an aesthetic.

## Things done well

1. **Pre-mortem mitigations show up in the actual code**, not just the plan doc. The barrel comment in `services/index.ts`, the `{ context?, warning? }` return shape, the verbatim warning string, the no-mutation purity of the T6 helper, the conditional caller assignment that preserves "absent key" — all real, all in the diff.

2. **Commit messages are descriptive enough that a future bisect knows why a commit exists, not just what it changed.** The T6 message in particular is the gold standard.

3. **LEARNINGS updates are substantive, not boilerplate.** Multiple paragraphs collapsed to single accurate ones. Old action-item entries deleted rather than left as historical noise.

4. **The merge was managed correctly**: aborted rebase, switched to merge, isolated dist rebuild as a separate commit. Clean bisect history.

5. **Plan-to-execution fidelity**. T6's caller pattern matches the plan spec line-for-line. T5's `services/index.ts` namespace comment is exactly what the pre-mortem asked for. This is a high-discipline PR.

## Verdict

- [x] **Merge with follow-ups** (non-blocking improvements for a separate PR or amendment)

Follow-ups (in priority order):

1. **Delete the five orphan helpers in `packages/core/src/services/person-signals.ts`** (`slugify` line 292, `personPattern` line 303, `mentionsPerson` line 316, `isOwnerActor` line 323, `isPersonActor` line 340). This is the one finding I'd push back on at a merge meeting if the author were available for a quick amendment. Not a hard block — they're dead, not broken — but it's the spirit of the PR. ~50 LOC.

2. **Remove the stray blank line at `packages/core/src/integrations/krisp/client.ts:519`.** Cosmetic.

3. **Optional: enable `noUnusedLocals: true` in `tsconfig.base.json`.** Would have caught (1) automatically and prevents recurrence. Probably belongs in hygiene-pass-2 since enabling it surfaces existing offenders too.

4. **Optional: add a one-line catch-path warning-string assertion to `meeting-context.test.ts`.** Low priority; the verbatim string is currently inspection-only.

If the author is available for a 5-minute amendment, fix #1 and #2 in this PR. If not, merge as-is and queue them for the next hygiene pass — they don't undermine the safety of this one.

## End-of-review synthesis

This is a careful, well-executed hygiene PR. The pre-mortem-to-execution discipline is genuinely above average — every HIGH risk has a visible mitigation in the diff, not just in the plan doc. T5 and T6 are both done thoughtfully (the barrel namespace comment, the pure return-object helper signature, the conditional caller assignment), and the LEARNINGS updates are accurate maintenance writes. The one real miss is T3's orphan-helper cleanup: ~50 lines of file-private functions in `person-signals.ts` are now unreferenced and should have been swept up under "any imports/types that become unused." TypeScript's `noUnusedLocals` is off, so the compiler didn't catch it. Everything else is the kind of nit that gets queued for the next pass. Merge with the orphan-helper amendment if the author is around; otherwise merge and queue.
