# PRD: Slack-Digest → Topic-Wiki Integration

**Version**: 1.0
**Status**: Planned
**Date**: 2026-04-29
**Branch**: `feature/slack-digest-topic-wiki`
**Size**: Medium (8 tasks)

---

## 1. Problem & Goals

### Problem

The topic-wiki-memory build (Phase A+B, shipped 2026-04-23) wired Hook 1 (alias/merge) and Hook 2 (`integrateSource`) for **meetings only**. A Slack thread that resolves a pilot question about Cover Whale templates updates commitments and people memory but leaves `cover-whale-templates.md` untouched. Slack — the primary async-decision substrate for this builder — has no equivalent path.

### Goals

1. Add slack-digest as a **second source class** for the topic wiki, mirroring meeting Hooks at the slack-digest skill boundary.
2. Bias topic extraction with the same active-topic slug list the meeting prompt uses, byte-equal across both prompts.
3. Run `integrateSource` after the user's Phase 4 approval inside the skill, against a per-thread topic mapping (per-digest union for `sources_integrated`).
4. Reuse `parseMeetingFile` for both source shapes (no parser fork). Reuse `refreshAllFromSources` (renamed) for both source types.
5. Prevent the "services tested ≠ services shipped" dark-code failure mode that hit the parent build.

### Success Criteria

- A slack digest approving a thread that references `cover-whale-templates` produces a new `sources_integrated` entry on `cover-whale-templates.md` referencing the digest path.
- `rg -n 'refreshAllFromMeetings' packages/{cli,core,apps}/src` returns 0 hits after the rename.
- Concurrent `meeting approve` + slack-digest skill collision on `.arete/.seed.lock` does not crash the slack-digest skill.
- Each new export (`discoverTopicSources`, `refreshAllFromSources`, `arete topic list --active --slugs`, `--source` flag) has a named non-test caller listed in the AC.

### Out of Scope

- Backfill of pre-existing slack-digests (deferred to Phase C #6).
- Per-thread source segments in `sources_integrated[]` (defer until proven necessary by topic-narrative noise).
- Cursor AGENTS.md wiring of slack-source provenance (separate Phase B follow-up).
- Generalizing `refreshAllFromSources` into a fully source-agnostic engine.

---

## 2. Pre-Mortem Risks (Reference)

| # | Risk | Severity | Tasks |
|---|------|----------|-------|
| R1 | Skill prompt regression undetectable (bias-block drift) | HIGH | 4, 6 |
| R2 | `parseMeetingFile` silently rejects slack-digest (false alarm; verified parses cleanly) | HIGH | 2 |
| R3 | Concurrent `meeting approve` + skill collide on non-reentrant `.seed.lock` | HIGH | 5, 6 |
| R4 | `--source` label-only causes cost surprise | HIGH | 5 |
| R5 | Rename count off (8 sites incl. backend route) | MEDIUM | 1 |
| R6 | `--days-back=N` recovery path undocumented | MEDIUM | 8 |
| R7 | sibling `slack-evidence-dedup` adds frontmatter fields → must not bust hash | MEDIUM | 2 |
| R8 | Per-digest union pollutes single-thread topic narratives | MEDIUM | 4 |
| R9 | Step 4 AI mock harness diverges from Phase C item 5 | MEDIUM | 6 |
| R10 | `arete topic list --active --slugs` rendering drift | MEDIUM | 3 |
| R11 | `topics:` aggregation timing across skill phases | LOW | 5 |
| R12 | `--slugs` vs positional ambiguity | LOW | 5 |
| R13 | phase-c plan factual error about digest path | LOW | 8 |

---

## 3. Tasks

Tasks are ordered by execution dependency. The rename (Task 1) is a no-behavior-change commit before discovery widening (Task 2). Skill-side changes (Tasks 3, 4) precede skill wiring (Task 5). Tests + dark-code audit (Tasks 6, 7) gate merge. Docs + naming (Task 8) close out.

---

### Task 1: Rename `refreshAllFromMeetings` → `refreshAllFromSources` across 9 sites

**Description**: Single no-behavior-change commit renaming the service method and all call sites. The function's identity is "refresh all topics from on-disk sources" — the meeting-only suffix is a lie after Task 2 widens discovery. Land this rename FIRST so Task 2's source-discovery widening is a pure additive change against a correctly-named method. The 9 sites (verified via `rg -n 'refreshAllFromMeetings' packages/`):

- `packages/core/src/services/topic-memory.ts:795` (declaration)
- `packages/core/src/services/topic-memory.ts:806` (declaration body)
- `packages/cli/src/commands/meeting.ts:1437` (doc comment naming the method inline)
- `packages/cli/src/commands/meeting.ts:1421` (call)
- `packages/cli/src/commands/topic.ts:253` (call)
- `packages/cli/src/commands/topic.ts:331` (call)
- `packages/cli/src/commands/topic.ts:787` (call)
- `packages/cli/src/commands/topic.ts:910` (call)
- `packages/cli/src/commands/intelligence.ts:511` (call)
- `packages/apps/backend/src/routes/meetings.ts:244` (call) — **the site plan v1 missed**

**Files**:
- `packages/core/src/services/topic-memory.ts`
- `packages/cli/src/commands/meeting.ts`
- `packages/cli/src/commands/topic.ts`
- `packages/cli/src/commands/intelligence.ts`
- `packages/apps/backend/src/routes/meetings.ts`

**Pre-Mortem Warning (R5, memory bullet 1)**: Call-site count is 9 across `core`, `cli`, AND `apps`. The backend route at `packages/apps/backend/src/routes/meetings.ts:244` was missed in plan v1; without renaming it, the backend's topic refresh silently breaks on the next deploy. Always grep `packages/{cli,core,apps}/src`, never just `packages/{cli,core}/src`. Monorepo consumer only — no `@deprecated` alias is shipped.

**Acceptance Criteria**:
- `refreshAllFromMeetings` no longer exists in any `packages/` source file.
- Pre-merge grep gate: `rg -n 'refreshAllFromMeetings' packages/{cli,core,apps}/src` returns exactly 0 hits.
- The doc comment at `packages/cli/src/commands/meeting.ts:1437` referencing the method by name is updated to `refreshAllFromSources`.
- The backend route call at `packages/apps/backend/src/routes/meetings.ts:244` is updated and `npm run typecheck` passes for `@arete/backend`.
- `npm test` passes for `packages/core/test/services/topic-memory.test.ts` with no test edits required (rename does not change behavior).
- Commit message includes "no behavior change" and lists all 9 sites.

---

### Task 2: Widen `discoverTopicSources` to scan meetings + slack-digests via `parseMeetingFile`

**Description**: Replace the meeting-only directory scan inside `refreshAllFromSources` with a `discoverTopicSources(paths, storage)` function that scans both `resources/meetings/` and `resources/notes/*-slack-digest.md`, parsing both with the **existing** `parseMeetingFile` (no `parseSlackDigestFile` introduced — empirical verification confirms `parseMeetingFile` parses real slack-digest fixtures cleanly). Returns `SourceDiscoveryEntry[]` sorted by date, where `type: 'meeting' | 'slack-digest'` is set by the discovery function based on which directory the file came from.

**File**: `packages/core/src/services/topic-memory.ts`

**Pre-Mortem Warning (R2, R7, memory bullet 3)**: Do NOT introduce `parseSlackDigestFile`. The existing `parseMeetingFile` (`packages/core/src/services/meeting-context.ts:163`) tolerates missing `attendees` (defaults `[]`), reads `topics` directly via `Array.isArray(fm.topics)`, and parses `2026-04-28-slack-digest.md` cleanly. Forking the parser doubles the schema surface and risks divergence with the sibling `slack-evidence-dedup` plan. The body-hash invariant (`hashMeetingSource` strips frontmatter) must continue to hold for slack digests so frontmatter-only edits don't bust idempotency.

**Acceptance Criteria**:
- New function `discoverTopicSources(paths, storage)` exported from `packages/core/src/services/topic-memory.ts` returns `SourceDiscoveryEntry[]` with shape `{ path, date, content, type, topics }`.
- Discovery scans `pathJoin(paths.resources, 'meetings')` AND `pathJoin(paths.resources, 'notes')` filtered by regex `^\d{4}-\d{2}-\d{2}-slack-digest\.md$`.
- Both source types parsed via the existing `parseMeetingFile` — `rg -n 'parseSlackDigestFile' packages/core/src` returns 0 hits.
- `type` field is set by the discovery function based on directory of origin, not by parsing.
- Output is sorted by `date` ascending; ties broken by `path` ascending.
- Unit test `packages/core/test/services/topic-memory-discovery.test.ts`: `discoverTopicSources` returns entries from both directories against a fixture workspace; tolerates missing `notes/` dir without throwing.
- Unit test: `parseMeetingFile` parses a real slack-digest fixture (copy of `2026-04-28-slack-digest.md` content) and returns parsed `topics`, `date`, body without errors.
- Unit test: `hashMeetingSource` (consider rename `hashSourceBody`) returns byte-identical output for a slack-digest fixture before and after a frontmatter-only edit (e.g., adding `dedup_processed_at: 2026-04-28`).
- Belt-and-suspenders: a file in `notes/` whose frontmatter `type` is not `slack-digest` emits `warn(...)` and is skipped (does not crash discovery).
- `refreshAllFromSources` uses `discoverTopicSources` internally; no other call site exists yet (Task 5 wires `--source`).

---

### Task 3: Add `arete topic list --active --slugs --json` CLI primitive

**Description**: Add a CLI flag combination that emits the bare-slug-list rendering used by extraction prompts. The slack-digest skill (markdown-authored) cannot reach core directly; this primitive lets it inject the same active-topic-slug bias the meeting-extraction prompt uses, without duplicating rendering logic in skill markdown.

**Files**:
- `packages/cli/src/commands/topic.ts`
- `packages/cli/test/commands/topic-list-active-slugs.test.ts` (new)

**Pre-Mortem Warning (R10, memory bullet 1)**: Implementation must literally call `renderActiveTopicsAsSlugList(getActiveTopics(...))` (exported from `packages/core/src/index.ts:144`). Do NOT reimplement slug-list rendering inline; drift is silent and breaks the dual-tier sprawl defense.

**Acceptance Criteria**:
- `arete topic list --active --slugs` exits 0 and writes the bare slug list to stdout.
- `arete topic list --active --slugs --json` exits 0 and emits a JSON object with shape `{ slugs: string[] }`.
- Implementation at `packages/cli/src/commands/topic.ts` calls `renderActiveTopicsAsSlugList(getActiveTopics(...))` directly — verified by `rg -n 'renderActiveTopicsAsSlugList' packages/cli/src/commands/topic.ts` returning at least 1 match.
- New test `packages/cli/test/commands/topic-list-active-slugs.test.ts` invokes the CLI, captures stdout, and asserts byte-equality against an in-process call to `renderActiveTopicsAsSlugList(getActiveTopics(fixtures))`.
- `--help` text for `arete topic list` documents the `--active --slugs` flag combo with one-line description.
- The skill `packages/runtime/skills/slack-digest/SKILL.md` Phase 2a context-bundle assembly invokes this primitive (Task 4 wires this).

---

### Task 4: Extend slack-digest skill with per-thread topic extraction + frontmatter union

**Description**: Update `packages/runtime/skills/slack-digest/SKILL.md` Phase 2c to extract topic slugs **per thread** (not per digest), biased by the active-topic slug list emitted from Task 3's new CLI primitive. Phase 5a writes a digest-level union of per-thread topics into the digest file's `topics:` frontmatter. The bias-block wording must be byte-equal to the active-slug section in `packages/core/src/services/meeting-extraction.ts` so a future drift is detectable by grep.

**Files**:
- `packages/runtime/skills/slack-digest/SKILL.md`
- `packages/runtime/skills/PATTERNS.md` (canonical bias-block anchor; updated in Task 8)
- `packages/runtime/test/skills/slack-digest-bias-block.test.ts` (new) OR `packages/core/test/runtime/slack-digest-prompt.test.ts` (new, location chosen by impl)

**Pre-Mortem Warning (R1, R8, memory bullet 2)**: The slack-digest skill is markdown-authored, NOT unit-tested as a prompt. Without the byte-equality test the bias block silently drifts and the dual-tier sprawl defense (extraction prompt bias + Jaccard alias-merge) becomes single-tier. Per-thread extraction with per-digest union is intentional: the per-thread topic mapping is in skill-internal intermediate state; the digest's `topics:` frontmatter is the union (which Hook 2 reads). This is acceptable because `integrateSource`'s LLM prompt updates only sections the new source substantively changes — but the bet is unverified; if topic-narrative noise emerges, the next iteration introduces per-thread source segments (out of scope here).

**Acceptance Criteria**:
- `packages/runtime/skills/slack-digest/SKILL.md` Phase 2c includes a "Prefer these existing topic slugs when applicable" block.
- The bias block text is byte-equal to the active-slug section in `packages/core/src/services/meeting-extraction.ts:651` (or to a shared anchor in `packages/runtime/skills/PATTERNS.md`).
- New test reads both files (skill and meeting-extraction) and asserts byte-equality of the bias-block region; deliberate corruption of either file fails the assertion.
- Phase 2c output schema includes `topics: string[]` (1–3 slugs) per thread in the skill's intermediate state.
- Phase 5a writes the union of per-thread topics to the digest file's frontmatter as `topics: [slug, ...]`.
- Phase 2a context bundle invokes `arete topic list --active --slugs --json` (Task 3) — `rg -n 'topic list --active --slugs' packages/runtime/skills/slack-digest/SKILL.md` returns at least 1 match.
- Re-running the skill against the same Slack window with the same approvals produces the same `topics:` set when the LLM is called with `temperature=0` (or seed pinned).

---

### Task 5: Wire `arete topic refresh --slugs ... --source <path>` and skill invocation

**Description**: Extend `arete topic refresh` to accept `--slugs <comma-list>` (multi-slug variant) and `--source <path>` flags. The `--source` flag MUST scope `discoverTopicSources` output to entries where `entry.path === sourcePath` — it is NOT a label-only logging hint. The slack-digest skill calls this CLI verb after Phase 5a writes the digest file, before `arete index` runs in Phase 5b. The CLI invocation must catch `SeedLockHeldError` (non-reentrant lock at `packages/core/src/services/seed-lock.ts:54`), warn, and exit non-fatally so a concurrent `meeting approve` does not crash the skill.

**Files**:
- `packages/cli/src/commands/topic.ts` (flag wiring)
- `packages/core/src/services/topic-memory.ts` (`refreshAllFromSources` accepts `sourcePath?: string` option that filters discovery)
- `packages/runtime/skills/slack-digest/SKILL.md` (Phase 5b skill wiring + lock-tolerance documentation)

**Pre-Mortem Warning (R3, R4, R11, R12, memory bullets 4 + 5)**:
- `--source <path>` is a SCOPING filter, not a label. Pass `sourcePath?: string` into `refreshAllFromSources`; when set, filter `discoverTopicSources` to entries where `entry.path === sourcePath`. Without this, a workspace with 10 prior digests tagged `cover-whale-templates` runs 10× the user's expected cost.
- The seed lock is non-reentrant `O_CREAT|O_EXCL` (`fs.open(path, 'wx')`), NOT symmetric/queueing. `meeting approve` already catches `SeedLockHeldError` and emits `warn(...)` + continues. The CLI invocation invoked by the slack-digest skill must do the same: catch, warn, exit non-zero with `{error: 'seed_lock_held'}` JSON shape, and the skill markdown must document this as a non-fatal recoverable outcome.
- LLM-spending commands need four things (per LEARNINGS 2026-04-23): dry-run, `--yes`/threshold gate, `ARETE_SEED_MAX_USD` ceiling, `ARETE_NO_LLM` kill switch. Verify all four are honored on this flag combo.
- Resolve `--slugs` vs positional ambiguity: positional `[slug]` continues to mean "exactly one slug, equivalent to `--slugs <slug>`"; passing both is an error; `--all` overrides both.

**Acceptance Criteria**:
- `arete topic refresh --slugs <comma-list>` accepts a comma-separated slug list and refreshes only those slugs.
- `arete topic refresh --slugs <list> --source <path>` invokes `refreshAllFromSources({ slugs, sourcePath })` and `discoverTopicSources` returns only entries where `entry.path === sourcePath` — verified by integration test in Task 6.
- `refreshAllFromSources` accepts `sourcePath?: string` in its options; when set, filters `discoverTopicSources` output by exact path match.
- When the seed lock is held by another process, the CLI exits non-zero with stdout containing `{"error":"seed_lock_held"}` JSON and emits a one-line stderr warning (no stack trace). Verified by test in Task 6.
- `packages/runtime/skills/slack-digest/SKILL.md` Phase 5 explicitly documents: "If topic refresh exits with `seed_lock_held`, log the warning and continue — do NOT abort the skill. Re-run `arete topic refresh --slugs ... --source ...` after the conflicting operation completes."
- The skill's Phase 5 ordering is: write digest file (5a) → `arete topic refresh --slugs ... --source <digest-path>` → `arete index` (5b).
- `--skip-topics` flag is honored: when passed, no LLM calls are made and `sources_integrated` is unchanged on all targeted topic pages. Verified by test in Task 6.
- `ARETE_NO_LLM=1` env var short-circuits before any LLM call. Verified by test in Task 6.
- Resolution helper `resolveTargetSlugs(slug, slugsFlag, all)` returns `string[] | 'all'`; passing both positional and `--slugs` exits with a clear error message.
- `--help` text documents `--slugs`, `--source`, `--skip-topics`, and the positional `[slug]` resolution rules.

---

### Task 6: CLI integration test with AI mock + lock-collision test

**Description**: Add a CLI-level integration test that exercises the slack-digest topic refresh path end-to-end against a fake `services.ai.call` injected via `AIServiceTestDeps` (`packages/core/src/services/ai.ts:64`). This is the test that would have caught the parent build's dark-code failure mode. Includes a lock-collision test that holds `.arete/.seed.lock` externally and asserts the CLI exits with `seed_lock_held` JSON.

**Files**:
- `packages/cli/test/commands/topic-refresh-slack.test.ts` (new)
- `packages/core/test/services/topic-memory.test.ts` (extend with `discoverTopicSources` + mixed-source `refreshAllFromSources` cases)

**Pre-Mortem Warning (R9, memory bullet 1)**: Constrain the AI-mock harness to direct `AIServiceTestDeps` injection. Do NOT build a "scripted response queue keyed by prompt-shape" abstraction — that's Phase C item 5's responsibility. If item 5 lands first, this test imports its harness instead. The test file should be ≤150 LOC including fixtures.

**Acceptance Criteria**:
- `packages/cli/test/commands/topic-refresh-slack.test.ts` exists and runs under `npm test`.
- Test fixture: workspace with one existing topic page (`cover-whale-templates.md`) + one slack-digest in `resources/notes/2026-04-28-slack-digest.md` tagged with that slug.
- Fake `services.ai.call` returns a scripted `IntegrateOutput` JSON object for the `integrateSource` prompt; injection point is `AIServiceTestDeps`, no parallel mock framework.
- Test asserts: after `arete topic refresh --slugs cover-whale-templates --source resources/notes/2026-04-28-slack-digest.md`:
  - The topic file's `sources_integrated` array grew by exactly 1 entry referencing the digest path.
  - `Change log` section gained a new entry.
  - LLM was called exactly once.
- **`--source` scoping test**: fixture has 3 prior digests + 1 new digest tagged `foo`; running `--slugs foo --source <new-digest-path>` integrates ONLY the new digest (LLM called exactly 1 time, not 4); the 3 prior digests do not appear in `sources_integrated`.
- **Lock-collision test**: external test process acquires `.arete/.seed.lock`; running `arete topic refresh --slugs foo --source <digest>` exits non-zero with stdout JSON `{"error":"seed_lock_held"}`; stderr contains a one-line warning; no stack trace.
- **`--skip-topics` test**: passing `--skip-topics` results in 0 LLM calls and unchanged `sources_integrated` on the topic page.
- **`ARETE_NO_LLM=1` test**: env var short-circuits before any LLM call.
- Test file is ≤150 LOC including fixtures (verified by `wc -l`).
- Service-level unit test: `refreshAllFromSources` with mixed sources (1 meeting + 1 slack-digest) updates a topic page's `sources_integrated` with both kinds, in date order.

---

### Task 7: Dark-code audit + pre-merge grep gate (per-export caller enumeration)

**Description**: Enumerate the production (non-test) caller list for every new export and CLI primitive added by Tasks 1–5. The 2026-04-23 topic-wiki-memory build shipped `aliasAndMerge` and `renderActiveTopicsAsSlugList` as tested-but-never-called dark code; this task is the structural fix. Each entry must name an actual call site path:line.

**Pre-Mortem Warning (memory bullet 1)**: A grep gate that names symbols but not call sites can pass on tests-only callers. Each new export must have an enumerated production caller in this AC list — if a cell is empty, the export is dark.

**Acceptance Criteria**:
- `refreshAllFromSources` (renamed in Task 1) production callers enumerated and verified to exist:
  - `packages/cli/src/commands/topic.ts:253`
  - `packages/cli/src/commands/topic.ts:331`
  - `packages/cli/src/commands/topic.ts:787`
  - `packages/cli/src/commands/topic.ts:910`
  - `packages/cli/src/commands/meeting.ts:1421`
  - `packages/cli/src/commands/intelligence.ts:511`
  - `packages/apps/backend/src/routes/meetings.ts:244`
- `discoverTopicSources` (new in Task 2) production caller: `refreshAllFromSources` body in `packages/core/src/services/topic-memory.ts` (verified by `rg -n 'discoverTopicSources' packages/core/src/services/topic-memory.ts` returning at least 1 match outside the declaration line).
- `arete topic list --active --slugs` production caller: `packages/runtime/skills/slack-digest/SKILL.md` Phase 2a (verified by `rg -n 'topic list --active --slugs' packages/runtime/skills/slack-digest/SKILL.md` returning at least 1 match).
- `--source` flag on `arete topic refresh` production caller: `packages/runtime/skills/slack-digest/SKILL.md` Phase 5b (verified by `rg -n 'topic refresh.*--source' packages/runtime/skills/slack-digest/SKILL.md` returning at least 1 match).
- Pre-merge grep gates all return expected counts:
  - `rg -n 'refreshAllFromMeetings' packages/{cli,core,apps}/src` → 0 hits.
  - `rg -n 'parseSlackDigestFile' packages/{cli,core,apps}/src` → 0 hits.
  - `rg -n 'discoverTopicSources|refreshAllFromSources' packages/{cli,core,apps}/src` → ≥ 8 hits across the enumerated caller paths.
- A markdown table of exports ↔ call sites is included in the PR description.

---

### Task 8: Documentation alignment + naming corrections

**Description**: Update PATTERNS.md, slack-digest SKILL.md (references section), agent-memory rules (Cursor + Claude parity), the topic-memory.ts JSDoc, and fix the factual error in `dev/work/plans/topic-wiki-memory-phase-c/plan.md` item 8 (claims `resources/slack-digests/*.md`; actual path is `resources/notes/{date}-slack-digest.md`). Also documents the manual recovery path (`arete slack-digest --days-back=N`) for backfilling pre-existing slack-digests.

**Files**:
- `packages/runtime/skills/PATTERNS.md`
- `packages/runtime/skills/slack-digest/SKILL.md` (References section + new "Topic Wiki Coverage" subsection)
- `packages/runtime/rules/cursor/agent-memory.mdc`
- `packages/runtime/rules/claude/` (parity file or explicit gap note)
- `packages/core/src/services/topic-memory.ts` (JSDoc on `hashMeetingSource` / `hashSourceBody`)
- `dev/work/plans/topic-wiki-memory-phase-c/plan.md` (item 8 fix)
- `dev/catalog/capabilities.json` (decision: include flag-level additions OR explicit out-of-scope note)

**Pre-Mortem Warning (R6, R13)**: Without the "Topic Wiki Coverage" subsection, users hit the backfill gap silently and conclude "topic wiki doesn't cover Slack." The phase-c factual error must be fixed in the same PR — don't defer.

**Acceptance Criteria**:
- `packages/runtime/skills/PATTERNS.md` `topic_page_retrieval` pattern's Inputs section names `slack-digest` as a recognized source type alongside meetings.
- `packages/runtime/skills/slack-digest/SKILL.md` References section lists `arete topic refresh --slugs ... --source ...`.
- `packages/runtime/skills/slack-digest/SKILL.md` includes a `## Topic Wiki Coverage` subsection naming `--days-back=N` as the manual backfill workaround.
- `packages/runtime/rules/cursor/agent-memory.mdc` includes a sentence stating topic sources include slack-digests.
- Claude-side rules: either a parallel update to `packages/runtime/rules/claude/agent-memory.mdc` (or equivalent file) OR an explicit note in this PR's description naming the parity gap (e.g., "Claude rules have no agent-memory.mdc equivalent because X").
- `packages/core/src/services/topic-memory.ts` JSDoc on `hashMeetingSource` (or renamed `hashSourceBody`) documents the body-only invariant and the slack-digest application.
- `dev/work/plans/topic-wiki-memory-phase-c/plan.md` item 8: `rg -n 'slack-digests' dev/work/plans/topic-wiki-memory-phase-c/plan.md` returns 0 hits; the corrected path `resources/notes/{date}-slack-digest.md` appears at least once.
- `dev/catalog/capabilities.json`: either updated to include `arete topic list --active --slugs` and `arete topic refresh --source` OR the PR description explicitly states "catalog is not updated for flag-level additions per current convention."
- Grep audit: `rg -n 'meeting' packages/core/src/services/topic-memory.ts` — every doc-comment hit describing the substrate as meetings-only is rewritten to say "sources" (verified manually in PR review).

---

## 4. Task Dependencies

```
Task 1 (rename) → Task 2 (discovery widening)  [no behavior change first]
Task 2 → Task 3 (CLI primitive depends on no upstream)  [actually parallel-safe]
Task 3 → Task 4 (skill uses CLI primitive)
Task 2 + Task 4 → Task 5 (skill wiring uses both)
Task 5 → Task 6 (integration test exercises full path)
Task 6 → Task 7 (dark-code audit needs final state)
Task 7 → Task 8 (docs reference final names)
```

**Execution order**: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 (linear; Tasks 2 and 3 can be parallel after 1 if separate workers are available, but the linear order is the safe default).

---

## 5. Testing Strategy

- All new tests use `AIServiceTestDeps` for AI mocking; no parallel mock framework.
- Service-level tests cover `discoverTopicSources`, `parseMeetingFile` on slack-digest fixtures, `hashSourceBody` invariance.
- CLI integration test (Task 6) exercises the full skill→CLI→core path end-to-end.
- Lock-collision test (Task 6) holds `.arete/.seed.lock` externally and asserts non-fatal exit.
- Bias-block byte-equality test (Task 4) detects skill-prompt drift.
- Dark-code grep gates (Task 7) enumerate per-export production callers.
- `npm run typecheck` and `npm test` after every task.

---

## 6. Definition of Done

- [ ] All 8 tasks complete with passing tests
- [ ] `rg -n 'refreshAllFromMeetings' packages/{cli,core,apps}/src` returns 0 hits
- [ ] `rg -n 'parseSlackDigestFile' packages/{cli,core,apps}/src` returns 0 hits
- [ ] Bias-block byte-equality test passes
- [ ] Lock-collision test passes (CLI exits non-fatally on `seed_lock_held`)
- [ ] `--source` scoping test passes (LLM called once, not N times)
- [ ] Dark-code audit table in PR description names a production caller for every new export
- [ ] phase-c plan.md item 8 corrected
- [ ] `npm run typecheck` and `npm test` pass across all packages
- [ ] Manual test: run slack-digest skill against a real Slack window, verify a topic page's `sources_integrated` gains the digest entry
