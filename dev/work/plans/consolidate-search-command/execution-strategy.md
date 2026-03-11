# Execution Strategy — Consolidate Search Command

> This document captures learnings from previous large autonomous builds and the execution strategy for this PRD.
> The orchestrator MUST read this before starting execution.

---

## Key Learnings from Previous Large Autonomous Builds

### From Intelligence Tuning PRD (6 tasks, 100% success)
1. **Reviewer pre-work sanity checks caught 5 architectural issues** before any code was written
2. **Existing patterns accelerated development** — reusing Jaccard similarity, CommitmentsService.reconcile()
3. **Dual extraction flows were a gotcha** — core vs backend architecture split caused confusion
4. **LEARNINGS.md saved time** — test gotchas were documented and referenced

### From AI Config PRD (5 tasks, 75 tests, 0/8 risks)
1. **Detailed task prompts with explicit patterns** = clean first-attempt execution
2. **testDeps injection pattern** scaled well for mocking external services
3. **Extract constants for repeated structures** — duplicate aiConfig objects were caught in review
4. **Pre-mortem mitigations embedded in prompts** prevented bugs

### From Reimagine v2 Orchestration (83% phantom task rate!)
1. **Pre-flight codebase audit is essential** — 5/6 tasks were already implemented
2. **"Grumpy senior engineer" reviewer pattern** — highly effective skepticism
3. **Backwards compatibility check** — "What about legacy data?" caught critical bug
4. **Phantom task detection** should happen before any work starts

---

## Expertise Profiles to Load

| Task Phase | Expertise Profile | LEARNINGS.md |
|------------|-------------------|--------------|
| Phase 1 (QMD setup) | `.pi/expertise/core/PROFILE.md` | `packages/core/src/search/LEARNINGS.md` |
| Phase 2-4 (search command) | `.pi/expertise/cli/PROFILE.md` | `packages/cli/src/commands/LEARNINGS.md` |
| Phase 5-7 (skills/docs) | None needed | `packages/runtime/` structure knowledge |

---

## Pre-Execution Checks (MANDATORY)

### 1. Phantom Task Detection
Before starting ANY task, verify:
- [ ] No `packages/cli/src/commands/search.ts` already exists
- [ ] Multi-collection QMD is NOT already partially implemented in `qmd-setup.ts`
- [ ] Check `arete.yaml` schema doesn't already have `qmd_collections` field
- [ ] Verify PRD reflects current codebase state

### 2. File Reading Lists for Each Phase

**Phase 1 (QMD Multi-Collection)**:
- `.pi/expertise/core/PROFILE.md`
- `packages/core/src/search/LEARNINGS.md`
- `packages/core/src/search/qmd-setup.ts`
- `packages/core/src/config.ts`
- `packages/core/src/models/workspace.ts`

**Phase 2-4 (Search Command)**:
- `.pi/expertise/cli/PROFILE.md`
- `packages/cli/src/commands/LEARNINGS.md`
- `packages/cli/src/commands/intelligence.ts` (existing context/memory commands)
- `packages/cli/src/formatters.ts`
- `packages/core/src/services/entity.ts` (for person resolution)
- `packages/core/src/services/memory.ts` (for timeline)

**Phase 5 (Skill Migration)**:
- `packages/runtime/skills/PATTERNS.md`
- `packages/runtime/skills/_authoring-guide.md`
- Individual skills being updated

---

## Critical Mitigations to Embed in Prompts

### Risk: QMD Multi-Collection Untested
**Mitigation**: Include `packages/core/src/search/LEARNINGS.md` in Task 1.1 prompt. Key gotchas:
- `testDeps` injection pattern for mocking QMD
- `ARETE_SEARCH_FALLBACK=1` for test environment
- `refreshQmdIndex()` vs `ensureQmdCollection()` — use the right one

### Risk: Config Migration Breaks Existing Users
**Mitigation**: Explicit backward compat test in Task 1.2:
- Old format: `qmd_collection: "arete-abc123"` → treat as `all` collection
- New format: `qmd_collections: { all, memory, meetings, ... }`
- Test BOTH formats in same test file

### Risk: Search Command Missing JSON Schema
**Mitigation**: Define schemas in Task 0.1, then reference in Task 2.1 prompt:
```typescript
// Default: { success, query, results: [{path, title, snippet, score}], total }
// Timeline: { success, query, items: [{date, title, source, type}], themes, dateRange }
// Answer: { success, query, results: [...], answer: string }
```

### Risk: CLI UX Patterns Missed
**Mitigation**: Reference established patterns in Task 2.1 prompt:
- Read `packages/cli/src/commands/onboard.ts` for prompt patterns
- Use `@inquirer/prompts` (not `inquirer`)
- Add `--json` support with documented schema
- All exit paths check `opts.json` before printing

### Risk: Skills Updated Incorrectly (Find/Replace)
**Mitigation**: Intelligent migration approach for Phase 5:
- Each subagent reads FULL skill, understands PURPOSE
- Identifies WHY it calls deprecated commands
- Updates to appropriate `search` command variant
- NOT blind find/replace

### Risk: Deprecation Warnings in Skills
**Mitigation**: Phase 5 MUST complete before Phase 6:
- Run verification grep after Phase 5
- `grep -r "context --for\|memory search\|memory timeline" packages/runtime` → 0 results
- Only THEN add deprecation warnings

---

## Patterns to Apply

| Pattern | How to Use |
|---------|------------|
| **Reviewer Pre-Work Sanity Check** | Every task gets reviewed before developer starts |
| **testDeps Injection** | For QMD mocking in search provider tests (see `packages/core/src/search/providers/qmd.ts`) |
| **Grumpy Reviewer** | Skeptical code review asking "What about legacy config?" |
| **Backwards Compat Check** | `qmd_collection` → `qmd_collections` migration |
| **Documentation Synthesis** | After each task, verify LEARNINGS.md updates |
| **DRY Constants** | Extract `SCOPE_COLLECTION_MAP` as shared constant |

---

## Task-Specific Guidance

### Task 1.1: QMD Multi-Collection Setup
- Read `ensureQmdCollection()` carefully — understand current behavior
- Create 6 separate `qmd index` calls with different paths
- Store collection names in `qmd_collections` (plural) in arete.yaml
- DO NOT break existing single-collection behavior

### Task 1.2: Config Migration
- Support BOTH `qmd_collection` (old) AND `qmd_collections` (new)
- If old format, treat as `{ all: "arete-abc123" }`
- Write migration test that verifies both formats work

### Task 2.1: Search Command Core
- Pass `-c <collection>` to QMD query when `--scope` != 'all'
- Follow CLI pattern from `packages/cli/src/commands/intelligence.ts`
- Use `services.workspace.findRoot()` guard
- Use `formatters.ts` helpers for output

### Task 4.1: AI Synthesis
- Check `services.ai.isConfigured()` FIRST
- If not configured, warn gracefully and return results only
- Use `deriveIntent()` for query pattern matching
- Pass `--intent` to QMD when derived

### Task 5.x: Skill Migration
- Read FULL skill before updating
- Understand the skill's PURPOSE
- Match `search` command variant to skill's needs:
  - Meeting context → `search --scope meetings`
  - Memory decisions → `search --scope memory`
  - General context → `search` (all)

---

## Quality Gates (Every Task)

1. `npm run typecheck` — MUST pass
2. `npm test` — MUST pass
3. Reviewer code review — MUST approve
4. LEARNINGS.md updated if regressions found
5. Commit with descriptive message

---

## Estimated Timeline

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| 0 | 1 | 15 min |
| 1 | 2 | 45 min |
| 2 | 2 | 60 min |
| 3 | 1 | 30 min |
| 4 | 1 | 45 min |
| 5 | 6 | 90 min |
| 6 | 1 | 20 min |
| 7 | 2 | 30 min |
| **Total** | **16** | **~5.5 hours** |

---

## Success Criteria

- [ ] All 16 tasks complete
- [ ] All tests passing
- [ ] 0 pre-mortem risks materialized
- [ ] Skills migrated BEFORE deprecation warnings added
- [ ] Build memory entry created
- [ ] MEMORY.md index updated
