# Pre-Mortem: arete-hygiene-pass-1

**Date**: 2026-04-30
**Reviewer**: Pre-mortem subagent (staff-eng persona)
**Plan**: dev/work/plans/arete-hygiene-pass-1/plan.md
**Scope**: 6 tasks (T1 legacy src/test removal; T2 four deprecated functions; T3 person-signals action-item LLM cluster; T4 getContextForSkill; T5 ToolService → free fns; T6 buildTopicWikiContext extract)

## Summary

| # | Risk | Severity | Materializes if |
|---|------|----------|-----------------|
| R1 | T6 helper name collides with existing `buildTopicWikiContextSection` | HIGH | Helper named ambiguously, importer confuses the two, or helper is wired into the barrel and shadows the existing export |
| R2 | T6 caller-observable warning shape drifts (warnings array reference, ordering) | HIGH | Helper returns warning by value instead of mutating shared `warnings`, or pushes a different message string than current `Topic-wiki context failed: ${msg}` |
| R3 | T5 dist artifacts not rebuilt; published install ships stale `services.tools` class | HIGH | Wrap phase forgets `npm run build`; users `npm i -g` the GitHub commit and get a `services.tools is undefined` runtime error |
| R4 | T2 task-ordering: `PRODUCT_RULES_ALLOW_LIST` deletion before T1 deletes legacy `test/` callers | HIGH | T2 commit lands first; build/typecheck on that commit is red because `test/commands/update.test.ts` still imports the const — bisectability AC broken |
| R5 | T5 `services.tools` removal cascades into untracked consumers (backend, runtime tools, MCP) | MEDIUM | A non-grepped consumer (templated tool, runtime helper, backend service) accesses `services.tools` and breaks at runtime, not typecheck |
| R6 | T3 type-only imports linger in `meeting-parser.ts` / `commitments.ts` / `person-memory.ts` | MEDIUM | `LLMCallFn` or other types only re-exported via the deletion path become unresolved; typecheck fails late |
| R7 | T6 extraction silently changes `bundle.topicWikiContext` from "absent key" to "key=undefined" | MEDIUM | Helper assigns `bundle.topicWikiContext = result` unconditionally instead of only-if-defined; one of the 5 enrichment tests asserts `=== undefined` and passes, but downstream JSON serialization or `Object.keys` consumers see new behavior |
| R8 | T1 deletion of `tsconfig.test.json` breaks an editor/IDE workflow not in CI | LOW | A developer's local IDE relies on it for jump-to-definition in legacy paths; surfaces post-merge as a builder ergonomic regression |
| R9 | T4 `.pi/expertise/core/PROFILE.md` edit not propagated to `dist/.pi/expertise/core/PROFILE.md` | LOW | `npm run build:agents:dev` not run; stale agent profile shipped with PR but no functional impact |
| R10 | T5 `.list()` / `.get()` method names overload free-function namespace; tests/imports tangle | LOW | A second module already exports `getTool` (e.g., from `@arete/runtime` tools dir); name collision in CLI imports |

Total: 10 risks identified (0 CRITICAL, 4 HIGH, 3 MEDIUM, 3 LOW)
Categories covered: Code Quality, Integration, Reuse/Duplication, Dependencies, Documentation, Build Scripts, Context Gaps, Test Patterns, Scope Creep, State Tracking
Skipped: Platform Issues (no platform-specific risk for hygiene), Test Patterns as a separate risk (subsumed under R2/R7)

**No CRITICAL ship-gates.** The HIGH risks are addressable inline; recommend proceeding once R1–R4 mitigations are wired into task prompts.

---

## Risks

### R1 — T6 helper name collides with existing `buildTopicWikiContextSection`
**Severity**: HIGH
**Category**: Reuse / Duplication

**Problem**: `meeting-extraction.ts:532` already exports `buildTopicWikiContextSection(ctx?: TopicWikiContext): string` — a string-builder used by the prompt assembler. The plan introduces a new helper called `buildTopicWikiContext` in `meeting-context.ts` that builds the **bundle data** (returning `TopicWikiContext | undefined`). Two same-prefixed exports in adjacent modules with very different return types is a footgun: a future maintainer (or the reviewer's IDE auto-import) will pick the wrong one. If T6 also adds the new helper to the `@arete/core` barrel (`packages/core/src/services/index.ts`), the `extraction.ts` consumer might import the wrong symbol and the typechecker only catches it because the return types disagree.

**Mitigation**:
1. Keep the helper **module-private** by default — do not export from the file unless a test needs direct access. Plan AC already lists this preference; enforce it.
2. If it must be exported, name it `buildTopicWikiContextBundle` or `gatherTopicWikiContext` to disambiguate from the existing `Section` builder.
3. Do **not** add to `services/index.ts` barrel. The factory wiring path is `buildMeetingContext` itself; nothing else needs the helper.

**Verification**:
```bash
git grep -nE "^export.*buildTopicWikiContext\b" -- packages/core/src
# Should return AT MOST one line (in meeting-context.ts), and the existing
# `buildTopicWikiContextSection` line in meeting-extraction.ts. No collision.

git grep -n "buildTopicWikiContext" -- packages/core/src/services/index.ts
# Should return zero (helper stays out of the barrel)
```

---

### R2 — T6 caller-observable warning shape drifts
**Severity**: HIGH
**Category**: Integration

**Problem**: The current inline block at `meeting-context.ts:983–1025` mutates a shared `warnings: string[]` array (declared at line 740, also assigned to `bundle.warnings` at line 974 — same reference). The catch path pushes the literal string `` `Topic-wiki context failed: ${msg}` ``. Two ways T6 can break this:
(a) Helper returns `{ context, warning }` and caller pushes only when `warning` is truthy — fine, but if the caller's pushed string differs (e.g., `Topic wiki failed:` without the hyphen), any test that asserts the message verbatim fails.
(b) Helper takes `warnings` by parameter and pushes directly. Safe, but if the caller passes `bundle.warnings` instead of the local `warnings` array, the array-identity invariant is preserved by accident (they're the same reference today). A future caller that passes a fresh `[]` would silently lose warnings.

**Mitigation**:
1. Before refactor: `git grep -n "Topic-wiki context failed" packages/core/test` to find any test asserting the literal warning string. If none, the message can be reformatted; if any, preserve byte-for-byte.
2. Pick the **return-object** shape (option b in the plan): `{ context?: TopicWikiContext; warning?: string }`. Caller does `if (result.context) bundle.topicWikiContext = result.context; if (result.warning) warnings.push(result.warning);`. This makes the call site auditable in 4 lines and removes the shared-mutable-array footgun.
3. Use the existing imported `TopicWikiContext` type from `meeting-extraction.ts` (or the inline anonymous `bundle.topicWikiContext` shape — verify they're structurally identical first).

**Verification**:
```bash
# Confirm structural shape matches before extraction
grep -A 8 "topicWikiContext\?:" packages/core/src/services/meeting-context.ts
grep -A 8 "export type TopicWikiContext" packages/core/src/services/meeting-extraction.ts
# Both should describe { detectedTopics: Array<{ slug, sections, l2Excerpts }> }

# After refactor, run only the catch-path test
npx tsx --test packages/core/test/services/meeting-context.test.ts 2>&1 | grep -E "topicWikiContext|warnings"
```

---

### R3 — T5 dist artifacts not rebuilt; published install ships stale `services.tools`
**Severity**: HIGH
**Category**: Build Scripts

**Problem**: Per memory ("Commit dist files"), users install Areté directly from GitHub commits, not npm. T5 deletes the `ToolService` class and the `services.tools` factory key. If `dist/` is not rebuilt before commit (or rebuild forgets the affected files), the published commit ships:
- New `src/factory.ts` without `tools` key
- Old `dist/factory.js` still wiring `services.tools = new ToolService(storage)`
- New `src/cli/commands/tool.ts` calling `listTools(...)` directly
- Old `dist/cli/commands/tool.js` calling `services.tools.list(...)`
A user who installs from this commit gets a runtime error on `arete tool list`. AC for "byte-identical output" assumes dist matches src.

**Mitigation**:
1. Add an explicit step to T5's done-criteria: `npm run build && git status` and confirm all changed dist files are staged. The /ship wrap phase will catch this, but call it out per-task because T5 is the one that crosses the src/dist boundary the worst.
2. Optionally run `node packages/cli/bin/arete.js tool list` against the **published** entry point (i.e., via the dist build, not `npm run dev`) before commit.

**Verification**:
```bash
npm run build
git status -- "**/dist/**"
# Should show modified dist files matching the src changes:
#   packages/core/dist/factory.{js,d.ts}
#   packages/core/dist/services/{tools,index}.{js,d.ts}
#   packages/cli/dist/commands/{tool,route,skill}.js

# Smoke test against built bin
node packages/cli/bin/arete.js tool list > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt
```

---

### R4 — T2 lands `PRODUCT_RULES_ALLOW_LIST` deletion before T1 removes its legacy callers
**Severity**: HIGH
**Category**: Dependencies

**Problem**: The plan says "Single PR, 6 commits (one per task); each task self-contained and bisectable." But verification confirms `PRODUCT_RULES_ALLOW_LIST` has callers ONLY in legacy `src/commands/{install,update}.ts` and `test/commands/update.test.ts` — all of which T1 deletes. If T2 commits land **before** T1, the T2 commit's typecheck/build is red because the legacy callers still import the deleted const. The "each commit independently passes" AC is broken, bisectability is gone.

The plan's verification block for T2 even says `# Sequence after T1 (PRODUCT_RULES_ALLOW_LIST has legacy test/ callers that T1 removes)` — so the plan author knows, but the "single PR, 6 commits" framing doesn't pin the order.

**Mitigation**:
1. **Pin commit order**: T1 must precede T2. Document explicitly in the execution prompt: `T1 commit → T2 commit → T3 → T4 → T5 → T6`.
2. Alternatively, fold the `PRODUCT_RULES_ALLOW_LIST` deletion into T1 (it's already cleaning up legacy code). This preserves bisectability without ordering constraints.
3. Run `npm run typecheck && npm test` after **each** commit, not just at the end. Per-commit CI is the canonical safeguard.

**Verification**:
```bash
# After T1 commit, before T2 work
git grep -n "PRODUCT_RULES_ALLOW_LIST" -- .
# Expected: ONLY packages/core/src/workspace-structure.ts:64 (the def itself)
# If anything else shows up, T1 missed a caller — pause T2.
```

---

### R5 — T5 `services.tools` removal cascades into untracked consumers
**Severity**: MEDIUM
**Category**: Context Gaps

**Problem**: The plan enumerates 4 production call sites (`tool.ts`, `route.ts`, `skill.ts`, `factory.ts`). But `services.tools.list()` could also be reached from:
- Backend (`packages/apps/backend/`) — a route handler that injects `services` and accesses `.tools`
- Web (`packages/apps/web/`) — unlikely (browser-side), but worth a one-line check
- Runtime tools (`packages/runtime/tools/`) — the `LEARNINGS.md` there mentions tool routing changes
- A test fixture or factory mock that destructures `services.tools` and now gets `undefined`
TypeScript will catch most via the `AreteServices` interface change (line 45), but only if **every** consumer types its services var. Any `services as any` or `const { tools } = services` in a test is a runtime hole.

**Mitigation**:
1. Pre-flight grep before T5:
```bash
git grep -nE "services\.tools|\.tools\s*[:=]|tools:\s*ToolService" -- packages
# Audit every hit — confirm each is in the 4 known sites or a test file in scope
```
2. After T5, run `npm run build` for ALL workspaces (`packages/core`, `packages/cli`, `packages/apps/backend`) — the plan's smoke-test list already covers backend boot. Add: `cd packages/apps/backend && npm run build` if not already in `npm run build`.
3. Smoke-test the `arete route` command with a workspace that has at least one tool installed, since the route command merges tools into the candidate pool (per `commands/LEARNINGS.md:41`).

**Verification**:
```bash
# After T5 commit
git grep -nE "services\.tools|new ToolService" -- packages
# Expected: zero matches in src AND test (excluding LEARNINGS.md docstrings, which T5 should also update)
```

---

### R6 — T3 type-only imports linger in dependent files
**Severity**: MEDIUM
**Category**: Code Quality

**Problem**: The plan deletes `RawActionItemResult` (line 398), `VALID_ACTION_ITEM_DIRECTIONS`, and three functions from `person-signals.ts`. But `commitments.ts:20` and `person-memory.ts:8` import `PersonActionItem` (a type that **stays**), and `meeting-parser.ts:23` imports `ActionItemDirection`. If any of those types are coupled to the deleted code via shared interfaces (e.g., `RawActionItemResult` extending `PersonActionItem`, or `ActionItemDirection` defined in the deleted block), removal cascades. Unlikely but cheap to verify.

Also: `LLMCallFn` is imported by `entity.ts:496`. Verify it's NOT defined inside the action-item cluster being deleted.

**Mitigation**:
1. Before deletion, run:
```bash
grep -nE "^(export )?(type|interface) (PersonActionItem|ActionItemDirection|LLMCallFn|RawActionItemResult)" packages/core/src/services/person-signals.ts
```
Confirm the kept types (`PersonActionItem`, `ActionItemDirection`, `LLMCallFn`) live in code regions outside the deletion ranges.
2. If `RawActionItemResult` is referenced anywhere outside the cluster, escalate.
3. Run `npm run typecheck` after T3 commit; a red typecheck stops the merge.

**Verification**:
```bash
# Post-T3
git grep -n "RawActionItemResult\|VALID_ACTION_ITEM_DIRECTIONS" -- packages
# Should be empty
git grep -n "PersonActionItem\|ActionItemDirection\|LLMCallFn" -- packages | wc -l
# Count should match pre-T3 count minus the 1-2 self-references inside the deleted block
```

---

### R7 — T6 extraction changes `bundle.topicWikiContext` key presence semantics
**Severity**: MEDIUM
**Category**: Code Quality

**Problem**: Today's inline code only sets `bundle.topicWikiContext = { detectedTopics }` when `detectedTopics.length > 0` (line 1018). If the helper unconditionally returns `{ detectedTopics: [] }` and the caller does `bundle.topicWikiContext = result`, the bundle now has a `topicWikiContext` key whose value is an empty-array object — different shape from "key absent." The 5 enrichment tests likely assert `bundle.topicWikiContext === undefined`, which would still pass if the value is `undefined`, but fail if the value is `{ detectedTopics: [] }`. Worse, downstream serializers (JSON, `Object.keys`) see new behavior.

**Mitigation**:
1. Helper returns `TopicWikiContext | undefined` (the plan's stated signature). Caller assigns conditionally: `const ctx = await buildTopicWikiContext(...); if (ctx) bundle.topicWikiContext = ctx;`.
2. Run all 5 tests at `meeting-context.test.ts:1855–1941+` unmodified. Any test failure means semantics drifted.
3. Add a one-liner assertion sweep:
```bash
grep -n "topicWikiContext" packages/core/test/services/meeting-context.test.ts
# Read each assertion. If any uses `assert.deepEqual(..., undefined)` or `assert.equal(..., undefined)`, the helper MUST return undefined (not empty object) in the no-detection branch.
```

**Verification**:
```bash
npx tsx --test packages/core/test/services/meeting-context.test.ts 2>&1 | grep -E "(pass|fail)" | tail -3
# Expect: same pass count as before T6 (66 per plan)
```

---

### R8 — T1 deletion of `tsconfig.test.json` breaks an editor/IDE workflow
**Severity**: LOW
**Category**: Documentation

**Problem**: An IDE config (VSCode workspace, jetbrains config) might reference `tsconfig.test.json` for project-include resolution. CI doesn't, but a builder workflow might. Surfaces post-merge as a noisy regression.

**Mitigation**: Grep for any IDE config pointing at it.
```bash
find . -path ./node_modules -prune -o -type f \( -name "*.code-workspace" -o -name ".editorconfig" -o -name "*.iml" \) -print | xargs grep -l "tsconfig.test" 2>/dev/null
git grep -n "tsconfig.test" -- . | grep -v dist
# Expect: only the AC-listed reference at .pi/standards/build-standards.md:44
```

**Verification**: Same grep returns zero hits after T1.

---

### R9 — T4 `dist/.pi/expertise/core/PROFILE.md` not rebuilt
**Severity**: LOW
**Category**: Build Scripts

**Problem**: Per memory ("Commit dist files"), build artifacts ship with the repo. If `npm run build:agents:dev` (or `prod`) is not run after the PROFILE.md edit, `dist/.pi/expertise/core/PROFILE.md` still references `getContextForSkill`. Pure documentation drift, no runtime impact.

**Mitigation**:
1. After T4 src edit, run `npm run build:agents:prod` (the `build` target invokes this).
2. Confirm the dist file's diff matches the src file's diff:
```bash
diff <(grep -A 2 -B 2 "getContextForSkill" .pi/expertise/core/PROFILE.md) <(grep -A 2 -B 2 "getContextForSkill" dist/.pi/expertise/core/PROFILE.md)
# Should be identical (both empty if T4 worked)
```

**Verification**: `git status` shows both files staged after build.

---

### R10 — `getTool` / `listTools` namespace collision
**Severity**: LOW
**Category**: Reuse / Duplication

**Problem**: `getTool` is a generic name. If `@arete/runtime` (or any plugin/template tool registered via `packages/runtime/tools/`) already exports `getTool`, the CLI imports might tangle. Likely not an issue (runtime tools are file-based, not module-exports), but cheap to verify.

**Mitigation**:
```bash
git grep -nE "^export (async )?function (listTools|getTool)" -- packages
# Expected after T5: only `packages/core/src/services/tools.ts` matches
```

**Verification**: As above; if a second match appears, rename to `listWorkspaceTools` / `getWorkspaceTool`.

---

## Notes for executor

- **Commit order is load-bearing for R4.** Pin T1 → T2 → T3 → T4 → T5 → T6 in the executor prompt.
- **Embed R1, R2, R7 mitigations directly in the T6 task prompt** — they're the easiest to get wrong silently (helper compiles fine, tests pass, semantics drift).
- **Embed R3, R5 mitigations in the T5 task prompt** — these are the only cross-package edits in the pass.
- The wiki-leaning team's contract for T6 is "5 enrichment tests pass unmodified." Treat that as the AC's true bar; everything else is internal.
