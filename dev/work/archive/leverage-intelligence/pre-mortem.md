# Pre-Mortem: Leverage Intelligence — Commitments Service

**Plan size**: Large (8 steps, 2 phases)
**Key files**: `person-signals.ts`, `entity.ts`, `person-memory.ts`, `person-health.ts`, new `commitments.ts`, new `commitments` CLI command, 5 skill SKILL.md files

---

### Risk 1: LLM Prompt Produces Low-Quality Extractions

**Category**: Integration / Code Quality

**Problem**: The entire feature depends on the LLM prompt in Step 1 reliably distinguishing genuine commitments from descriptions, explanations, and general discussion. If the prompt is mediocre, we've replaced regex garbage with LLM garbage — and now we're paying for API calls too. The Dave transcript is a particularly hard case because it's a technical walkthrough where the person is explaining systems, not making promises.

**Mitigation**:
- Before wiring into the pipeline (Step 2), test the prompt against 3-4 real meeting transcripts from `resources/meetings/` — include at least one technical walkthrough, one 1:1, and one group meeting
- Include negative examples in the prompt: "The following are NOT commitments: explanations of how systems work, descriptions of existing processes, questions, acknowledgments"
- Include the workspace owner's name in the prompt so direction classification (`i_owe_them` vs `they_owe_me`) has explicit grounding
- Write a regression test using the Dave transcript excerpt as a fixture

**Verification**: Prompt tested against real transcripts with ≤3 genuine items extracted from the Dave walkthrough. Regression test exists with the Dave excerpt as input.

---

### Risk 2: Signature Change Breaks Callers

**Category**: Integration

**Problem**: `extractActionItemsForPerson()` is currently synchronous and called directly in the `refreshPersonMemory` loop in `entity.ts` (L1120). Changing it to async (adding `callLLM` param) changes the function signature. The call site in `entity.ts` must be updated, and all 19+ test cases in `person-signals.test.ts` that call it synchronously must become async. If any caller is missed, TypeScript will catch it — but the test file is large and easy to get wrong.

**Mitigation**:
- Before changing, `rg 'extractActionItemsForPerson'` across all packages (already done — 2 callers in entity.ts, 19+ in tests, 1 definition)
- The entity.ts call site is already inside an async function and already `await`s `extractStancesForPerson` — follow that exact pattern
- For tests: the mock `callLLM` should be a simple function that returns a canned JSON response — follow the `extractStancesForPerson` test pattern if one exists

**Verification**: `npm run typecheck` passes. All test files updated. `rg 'extractActionItemsForPerson'` shows no remaining sync calls.

---

### Risk 3: Bidirectional Sync Creates Data Loss or Phantom Resolutions

**Category**: Integration / State Tracking

**Problem**: Step 6 introduces bidirectional sync where user edits in person markdown files (checking `- [x]` or deleting lines) are detected and synced back to CommitmentsService. Edge cases:
1. User edits text of a commitment (changes wording) — hash no longer matches → treated as deleted → resolved incorrectly
2. User adds their own `- [ ]` items manually to the section — next refresh they'd be treated as missing from CommitmentsService → no harm, but could confuse if they disappear on re-render
3. Refresh runs while user has file open and unsaved — could read stale state
4. First refresh after migration: no existing checkboxes exist yet → comparing against empty markdown section would resolve everything in CommitmentsService

**Mitigation**:
- Match by hash embedded in the markdown (e.g., `<!-- hash:abc123 -->` after each item) rather than by text comparison. This makes edits to text safe — the hash still identifies the item
- Only detect deletions of items that were previously rendered (compare against what CommitmentsService says it last rendered, not what it currently has). Store a `lastRenderedHashes` set per person in the commitments file
- Document in the auto-section header: "Edit checkboxes only; do not add manual items to this section"
- On first render (no existing section), skip the deletion-detection step entirely — there's nothing to diff against

**Verification**: Test cases cover: (1) text edit doesn't resolve, (2) checkbox resolves, (3) deletion resolves, (4) first-render skips deletion detection, (5) manual items in section don't cause errors.

---

### Risk 4: CommitmentsService Not Wired into Factory

**Category**: Dependencies / Integration

**Problem**: New services need to be added to `AreteServices` in `factory.ts` and wired with dependencies. `CommitmentsService` needs `StorageAdapter` and workspace paths. If it's not added to the factory, CLI commands can't access it through the standard `createServices()` pattern. LEARNINGS.md explicitly warns: "Services must NOT call fs directly" and "createServices() is the canonical wiring point."

**Mitigation**:
- Add `commitments: CommitmentsService` to the `AreteServices` type in `factory.ts`
- Construct it in `createServices()` with the shared `storage` adapter
- Follow the exact pattern of existing services (EntityService takes `storage, search`; CommitmentsService takes `storage`)
- CLI command follows the `createServices(process.cwd())` → `services.workspace.findRoot()` → `services.commitments.listOpen()` pattern from LEARNINGS.md

**Verification**: `factory.ts` exports `commitments` on `AreteServices`. CLI command uses `services.commitments`. No direct `fs` calls in CommitmentsService.

---

### Risk 5: `refreshPersonMemory` Becomes a Coordination Nightmare

**Category**: Scope Creep / Integration

**Problem**: Currently `refreshPersonMemory` in `entity.ts` does: scan meetings → extract signals → extract stances (LLM) → extract action items (regex) → lifecycle → render → upsert. After this plan, it also needs to: extract action items (LLM) → sync to CommitmentsService → read back from CommitmentsService → detect user edits in markdown → resolve edits → re-render with commitments from service. The function is already ~300 lines and this adds significant coordination logic. EntityService shouldn't own CommitmentsService — that's a new dependency.

**Mitigation**:
- Keep extraction in `refreshPersonMemory` (it's already the scan loop) but move all CommitmentsService coordination to a separate function: `syncCommitmentsForPerson(personSlug, freshItems, currentMarkdown, commitmentsService)`
- EntityService receives CommitmentsService as an optional dependency (injected via factory) — not a hard coupling
- The render step receives commitments from the service, not from the extraction directly
- Don't bloat `refreshPersonMemory` with inline commitment logic — delegate to CommitmentsService methods

**Verification**: `refreshPersonMemory` doesn't grow by more than ~20 lines (delegation calls only). CommitmentsService coordination is in its own function. EntityService constructor accepts optional `CommitmentsService`.

---

### Risk 6: `reconcile()` Fuzzy Matching is Under-specified

**Category**: Scope Creep

**Problem**: Step 5 includes `reconcile(completedItems)` with "fuzzy-match" and "confidence scores" but no integration feeds it yet. This could become a time sink engineering a fuzzy matching algorithm that's never tested against real data. The reconciliation service was designed for future Notion/Linear integration — building it now without a consumer risks over-engineering.

**Mitigation**:
- Implement `reconcile()` with a simple strategy: exact text match (high confidence) + normalized substring match (medium confidence). No NLP, no embeddings, no fancy algorithms
- Keep it to ~30 lines of logic. If it needs to be smarter later, we'll have real data to test against
- Alternatively: stub `reconcile()` as `throw new Error('Not yet implemented')` and ship it when an integration needs it. Mark it clearly in the interface
- **Recommendation**: Stub it. Ship the method signature so the interface is stable, but don't implement fuzzy matching without a consumer

**Verification**: `reconcile()` either (a) uses simple exact/substring matching with tests, or (b) is stubbed with a clear TODO. No complex fuzzy matching code without a real consumer.

---

### Risk 7: CLI Command Registration and Formatter Gaps

**Category**: Code Quality / Platform Issues

**Problem**: LEARNINGS.md for CLI commands has specific patterns: `registerXxxCommand` naming, `createServices()` → `findRoot()` guard, `--json` output for all paths including errors, `@inquirer/prompts` for interactivity, `pageSize: 12`. Missing any of these produces inconsistent UX. The `commitments resolve <id>` command also needs to handle the case where the ID doesn't exist gracefully.

**Mitigation**:
- Before writing, read `packages/cli/src/commands/people.ts` (closest analog — per-person queries) and `packages/cli/src/commands/intelligence.ts` as patterns
- Follow the canonical pattern: `registerCommitmentsCommand(program)` → `.action(async () => { createServices → findRoot → service call → format })`
- Include `--json` flag on all subcommands
- `resolve` should print what was resolved (text, person) and error clearly if ID not found
- Use `formatters.ts` helpers: `header()`, `listItem()`, `success()`, `error()`

**Verification**: Command follows people.ts pattern. `--json` works on all subcommands. `resolve` with bad ID produces clear error (both text and JSON).

---

### Risk 8: Skill Updates Reference Commands That Don't Exist Yet

**Category**: Dependencies / State Tracking

**Problem**: Step 8 updates 5 SKILL.md files to reference `arete commitments list` and `arete commitments resolve`. If Step 7 (CLI) isn't complete or the command names change during implementation, the skills will reference non-existent commands. Skills are used by agents in GUIDE mode — broken references mean agents try to run commands that fail.

**Mitigation**:
- Step 8 must be done LAST, after Step 7 is complete and tested
- Before updating skills, manually verify: `arete commitments list` and `arete commitments resolve <test-id>` work from the CLI
- In each skill, use the exact command strings from the CLI help output (copy-paste)
- Keep the existing action-item approach as a fallback note in PATTERNS.md: "If `arete commitments` is not available, fall back to reading person memory sections directly"

**Verification**: All `arete commitments` commands referenced in skills exist and are tested. PATTERNS.md has fallback note.

---

## Summary

**Total risks identified**: 8
**Categories covered**: Integration (4), Code Quality (2), Scope Creep (2), Dependencies (2), State Tracking (2), Platform Issues (1)

**Highest-impact risks**:
1. **Risk 1 (LLM prompt quality)** — If this fails, the whole feature delivers no value. Must be validated against real transcripts before wiring up.
2. **Risk 3 (bidirectional sync)** — Most complex engineering challenge. Hash-based matching and first-render guard are critical.
3. **Risk 5 (refresh coordination)** — EntityService complexity. Must delegate, not inline.

**Recommendation**: Consider stubbing `reconcile()` (Risk 6) to reduce scope. The method signature locks the interface; implementation can wait for a real consumer.

**Ready to proceed with these mitigations?**
