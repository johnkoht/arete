## Review: arete-hygiene-pass-1

**Type**: Plan
**Audience**: Builder (internal Areté tooling — `packages/core/`, `packages/cli/`, repo root)
**Review Path**: Full
**Complexity**: Medium (6 tasks, ~15–20 files touched, mostly deletes)
**Recommended Track**: standard (full /ship flow)

---

### Concerns

1. **Patterns / Reuse — T5 barrel export ergonomics**
   The plan replaces the named export `ToolService` in `services/index.ts` with `listTools` / `getTool`. Both names are generic enough to collide later (the pre-mortem flagged this as R10). Re-verified via `git grep -nE "^export.*\b(listTools|getTool)\b" -- packages` — currently zero collisions, so the literal names are safe today. But the plan does not add a comment at the export site documenting the namespace.
   - Suggestion: when T5 lands, leave a one-line comment in `services/index.ts` next to the new exports — "workspace tool discovery; see also `services/skills.ts:listSkills`" — to discourage future generic-named additions to this barrel.

2. **Backward compat — T5 and external consumers of `@arete/core`**
   `services.tools` is part of the `AreteServices` public surface. Per the memory note "Commit dist files," users `npm i -g` from GitHub commits — so this IS a breaking change for anyone holding a checkout that imports `services.tools` programmatically (e.g., a forked plugin). The plan only audits in-repo callers (4 sites). The pre-mortem R5 mitigation calls for a pre-flight grep across `packages/runtime/`, `packages/apps/backend/`, `packages/apps/web/` — which I re-ran: `git grep -nE "services\.tools|new ToolService"` returns ONLY the 4 known src sites + tests + dist. Clean. But the AC list for T5 doesn't surface this audit as an explicit verification step.
   - Suggestion: add an AC to T5: "`git grep -nE 'services\\.tools|new ToolService' -- packages` returns matches only in src files modified by T5 and their tests; no hits in `packages/apps/`, `packages/runtime/`, or `packages/cli/src/lib/`." This makes R5 mechanically checkable rather than narrative.

3. **AC mechanics — T6 `npm run build` / dist parity**
   Decision #9 says rebuild dist before merge, and the testing-strategy section lists `npm run build` and `npm run build:agents:dev` as global verification. But T5 (the task that crosses src/dist boundary worst, per pre-mortem R3) has no AC requiring `git status -- "**/dist/**"` to be clean or to show dist files staged. The current ACs verify src-level outcomes only.
   - Suggestion: add an AC to T5: "After `npm run build`, `git status -- 'packages/core/dist/factory.{js,d.ts}'`, `'packages/core/dist/services/{tools,index}.{js,d.ts}'`, and `'packages/cli/dist/commands/{tool,route,skill}.js'` show the modified dist files (not unstaged drift)." Add a parallel one to T4 for `dist/.pi/expertise/core/PROFILE.md`.

4. **AC mechanics — T6 helper-private claim verifiability**
   T6 ACs include the grep `git grep -nE "^export.*buildTopicWikiContext\b" -- packages/core/src` returning at most ONE pre-existing match (the existing `Section` builder). Good. But the grep regex is too permissive — `buildTopicWikiContext\b` would also match `buildTopicWikiContextBundle`, `buildTopicWikiContextV2`, etc., if added later. For the plan's scope this is fine, but the negative-assertion grep `git grep -n "buildTopicWikiContext" -- packages/core/src/services/index.ts` (also listed) is what actually proves no barrel pollution. That is mechanical. Minor wording nit only.
   - Suggestion: tighten the regex to `^export.*\bbuildTopicWikiContext\(` (paren forces function-export form) to avoid future false positives, OR keep current and add an explanatory comment.

5. **Test count delta — T3 is verifiable, T2 is approximate**
   T2 AC reads "krisp test count drops by exactly 1 case." Mechanical. T3 reads "Test count for `person-signals.test.ts`: **strictly fewer** than before." Also mechanical. Estimated impact says "~50 tests removed." Strictly-fewer is technically a weak bound (drops by 1 also satisfies it). For a deletion of three describe blocks (`extractActionItemsForPerson`, `buildActionItemPrompt`, `parseActionItemResponse`, plus an LLM-path block), the expected delta is recoverable by counting tests in those four describes — and that count IS deterministic.
   - Suggestion: tighten T3 AC #4 to a specific number, e.g., "Test count for `person-signals.test.ts` drops by N (where N = sum of test cases in the four deleted describe blocks; capture pre-count via `npx tsx --test packages/core/test/services/person-signals.test.ts 2>&1 | tail -3` before T3)." Same approximate-vs-exact argument as the krisp AC.

6. **R6 (pre-mortem MEDIUM) — type-only imports linger — partially addressed**
   Pre-mortem R6 worried that `RawActionItemResult` or `VALID_ACTION_ITEM_DIRECTIONS` might be referenced outside the deletion zone. I spot-checked: `git grep -nE "RawActionItemResult|VALID_ACTION_ITEM_DIRECTIONS" -- packages` returns hits ONLY inside `person-signals.ts` itself + dist mirror. Clean — no external consumers. But the plan's T3 AC list doesn't include this exact grep as a mechanical check; it relies on the broader `extractActionItemsForPerson` grep + typecheck.
   - Suggestion: add an AC to T3: "`git grep -nE 'RawActionItemResult|VALID_ACTION_ITEM_DIRECTIONS' -- packages` returns zero matches after deletion."

7. **Multi-IDE / Catalog**
   No catalog entries (`dev/catalog/capabilities.json`) appear to be touched, and no runtime/agents-source content changes (T4's PROFILE.md edit is in `.pi/expertise/`, not `runtime/`). Confirmed via the file list. No concern; flagging only because the checklist asked.

---

### AC Validation Issues

| Task | AC | Issue | Suggested Fix |
|------|----|-------|---------------|
| T1 | 2 (`npm test` passes) | Mechanical but redundant with global verification — fine | None |
| T2 | 4 ("krisp test count drops by exactly 1") | Good — exact number, mechanically checkable | None |
| T3 | 4 ("strictly fewer than before") | Weak bound — `N-1` satisfies it; should be exact count | Replace with "drops by N (compute N from describe blocks before deletion)"; see Concern 5 |
| T4 | 4 ("retains all other public methods…") | Mechanical (enumerated names) | None |
| T5 | 4 ("`tools|factory` test count same as before") | Mechanical — good | None |
| T5 | 5 ("byte-identical output … manual smoke test") | "Byte-identical" is a precise AC but the verification depends on capturing `tool-list-before.txt` BEFORE starting T5. Plan notes this in Verification block but it's a procedural footgun if forgotten | Move the capture step into T5's "Files affected" or pre-task setup as an explicit checkbox |
| T5 | (missing) dist-staging | No mechanical check that dist artifacts were rebuilt | Add the `git status -- "**/dist/**"` AC per Concern 3 |
| T6 | 5 ("All 5 `topicWikiContext` enrichment tests pass without modification") | Excellent — this is the contract per pre-mortem R7 | None |
| T6 | 8 (negative grep on barrel) | Good — mechanical | None |
| T6 | 3 (caller never assigns `bundle.topicWikiContext = undefined`) | Testable but only via reading the diff; no automated check | Acceptable — the 5 unmodified tests are the safety net. The pre-mortem's R7 verification (grep test file for `=== undefined` assertions) would harden this; consider adding |

Overall: **all ACs pass the rubric** with two minor tightening opportunities (T3 exact-count and T5 dist-staging). No anti-pattern phrases ("works properly", "appropriately", "etc.") detected. No vague language. Every AC has an associated grep, file-existence check, test command, or test-count assertion.

---

### Test Coverage Gaps

- **T6**: No new tests required (pure refactor). The contract is "5 enrichment tests + 1 catch-path test pass unmodified." This is the correct test posture for a refactor.
- **T5**: No new tests (mechanical migration). Existing `tools.test.ts` test cases preserved verbatim per the spec. Correct.
- **T1–T4**: All deletion tasks. No new coverage required because the deleted code had no production callers (verified for T2, T3, T4 via spot-check greps).

**No gaps identified.**

---

### Strengths

1. **Verification-first ACs**: Nearly every AC includes a grep command, test name pattern, or file-existence check — a strong contrast to typical "looks correct" criteria. The plan author treats ACs as machine-checkable contracts, exactly per `.pi/standards/ac-rubric.md`.

2. **Pre-mortem mitigations folded into Decisions**: Decisions #6, #7, #8, #9 explicitly resolve pre-mortem R4 (commit ordering), R1+R8 (T6 helper privacy), R2 (warning-shape preservation), and R3 (dist rebuild). The plan-pre-mortem feedback loop closed cleanly without re-opening the plan structure.

3. **Bisectability is preserved by design**: Single PR, 6 commits, pinned order, each commit independently green per typecheck+test. T1→T2 ordering is load-bearing (per R4) and explicitly pinned in Decisions #6.

4. **Out-of-scope discipline**: The "Out of scope" section explicitly enumerates 8 distinct deferrals with reasoning (compat layer, CLI deprecation, MemoryLogService POSIX guarantee, model-router pending decision, etc.). This is the rare hygiene plan that resists scope creep instead of pretending it doesn't exist.

5. **Verifiable claims**: Spot-checks confirm zero callers for `getContextForSkill` (only `.pi/expertise/core/PROFILE.md:58` + the def + dist mirror); zero external callers for `extractKeywords`, `findMatchingCompletedItem`, `RawActionItemResult`, `VALID_ACTION_ITEM_DIRECTIONS`; `services.tools` confined to the 4 declared sites; `Topic-wiki context failed` warning string is the only reference in src and not asserted in any test (so the literal string preservation is internal-only). The "verified zero-caller" framing holds up.

---

### Devil's Advocate

**If this fails, it will be because…** T5 is rebased onto a main branch where someone has *just* added a fifth `services.tools` call site — most likely in `packages/apps/backend/agent.ts` or a new CLI command added in a parallel branch — and the typecheck-only audit misses it because the new caller uses `services as any` or destructures with a type-narrowing cast. The plan's R5 mitigation depends entirely on TypeScript's coverage of `AreteServices`. A single `(services as any).tools.list(...)` call slips through, the build is green, the dist ships, and `arete tool list` runtime-errors for one user the day after merge. This is exactly the failure mode the pre-mortem named — but the plan's defense is "rebase fresh from main before merge" (R5 in plan) which is a procedural instruction, not a mechanical check. Adding the explicit `git grep` AC (Concern 2) would close this hole.

**The worst outcome would be…** T6's helper extraction silently changes the `bundle.topicWikiContext` key-presence semantics. The 5 enrichment tests pass because they assert `=== undefined` (which an absent key OR a `key: undefined` value both satisfy). Downstream consumers — the meeting-extraction prompt assembler, JSON serialization in `--json` mode, any `Object.keys(bundle).includes('topicWikiContext')` check — see new behavior. The bug surfaces as "the topic-wiki extraction prompt now always includes an empty wiki section" or as a JSON output drift in CI golden files. It's recoverable, but it's the kind of refactor regression that takes weeks to root-cause because the failure looks like an extraction-quality issue, not a refactor artifact. Mitigation already in plan (Decisions #7 + T6 AC #3 "never assigns `bundle.topicWikiContext = undefined`") — but the AC is verified by reading the diff, not by an automated check. The pre-mortem's R7 mitigation suggested grepping the test file for `=== undefined` assertions to confirm semantics; that one extra step would lock this down.

---

### Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Approve pending pre-mortem** — N/A (pre-mortem complete)
- [ ] **Revise** — Address concerns before proceeding

**Rationale**: The plan is unusually well-prepared. All HIGH risks from the pre-mortem have inline mitigations folded into Decisions #6–#9. ACs are mostly mechanical (grep / typecheck / test name pattern / exact test count). Spot-checks confirm zero-caller claims. Task ordering is pinned. The 7 concerns above are tightening opportunities, not blockers — most are "add one more grep AC" or "tighten an exact number." None of them invalidate the approach or surface a hidden caller. Approve with suggestions; the executor should treat Concerns 2, 3, and 6 as the highest-leverage AC additions before kickoff.

---

### Suggested Changes (Mode B)

**Change 1**: AC mechanics (T5 cross-package audit)
- **What's wrong**: Pre-mortem R5 mitigation is narrative ("rebase fresh from main"), not mechanical
- **What to do**: Add a T5 acceptance criterion: ``[ ] `git grep -nE 'services\\.tools|new ToolService' -- packages` returns matches only in T5-modified files; no hits in `packages/apps/` or `packages/runtime/`.``
- **Where to fix**: `plan.md` § T5 "Acceptance criteria"

**Change 2**: AC mechanics (T5 dist-staging)
- **What's wrong**: Pre-mortem R3 mitigation says "run `npm run build` before merge" but T5 has no AC verifying dist files are staged
- **What to do**: Add a T5 acceptance criterion: ``[ ] After `npm run build`, the following dist files appear in `git status` as modified: `packages/core/dist/factory.{js,d.ts}`, `packages/core/dist/services/{tools,index}.{js,d.ts}`, `packages/cli/dist/commands/{tool,route,skill}.js`.``
- **Where to fix**: `plan.md` § T5 "Acceptance criteria"

**Change 3**: AC mechanics (T3 exact test-count)
- **What's wrong**: "strictly fewer than before" is a weak bound
- **What to do**: Replace AC #4 in T3 with: ``[ ] Test count for `person-signals.test.ts` drops by exactly N (capture pre-count via `npx tsx --test packages/core/test/services/person-signals.test.ts 2>&1 | tail -3` before deletion; N equals the sum of test cases in the four deleted describe blocks).``
- **Where to fix**: `plan.md` § T3 "Acceptance criteria"

**Change 4**: AC mechanics (T3 type-cleanup grep)
- **What's wrong**: R6 mitigation is implicit
- **What to do**: Add a T3 acceptance criterion: ``[ ] `git grep -nE 'RawActionItemResult|VALID_ACTION_ITEM_DIRECTIONS' -- packages` returns zero matches.``
- **Where to fix**: `plan.md` § T3 "Acceptance criteria"

**Change 5**: AC mechanics (T6 R7 hardening)
- **What's wrong**: The "never assigns `bundle.topicWikiContext = undefined`" AC is verifiable only by code review
- **What to do**: Add a T6 acceptance criterion: ``[ ] `grep -n 'topicWikiContext' packages/core/test/services/meeting-context.test.ts` shows no test asserting `=== undefined` on the key (confirming "absent key" semantics are tested via `'topicWikiContext' in bundle === false` or equivalent).``
- **Where to fix**: `plan.md` § T6 "Acceptance criteria"

**Change 6**: T5 verification setup
- **What's wrong**: "Capture `tool-list-before.txt` on `main` before starting T5" is buried in Verification prose
- **What to do**: Promote the capture step into the T5 task body as a numbered prerequisite step before "Files affected"
- **Where to fix**: `plan.md` § T5, before "Files affected"

**Change 7**: T4 dist-mirror staging
- **What's wrong**: T4 edits `.pi/expertise/core/PROFILE.md` and Decisions #9 says rebuild via `npm run build:agents:dev`, but T4 ACs don't verify the dist mirror was updated
- **What to do**: Add a T4 acceptance criterion: ``[ ] `git diff -- '.pi/expertise/core/PROFILE.md' 'dist/.pi/expertise/core/PROFILE.md'` shows symmetric edits (or both files staged).``
- **Where to fix**: `plan.md` § T4 "Acceptance criteria"
