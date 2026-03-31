# Plan Review Summary

## Review Process

Three parallel domain-expert reviews followed by Principal Engineer review:

1. **Core Services Review** — TaskService compatibility, DI patterns, task-scoring integration
2. **Backend/API Review** — Route patterns, concurrency, wire format
3. **Web/Frontend Review** — Component patterns, hooks, accessibility
4. **Principal Engineer Review** — Test coverage, error handling, integration contracts

## Critical Issues Fixed

| Issue | Resolution |
|-------|------------|
| `TaskService.updateTask()` missing | Added as Step 1 (pre-work) |
| No write lock for concurrent updates | Added Step 2 (withFileLock utility) |
| Error response contract undefined | Added Wire Format Specification section |
| No error boundary | Added Step 8 |
| Race condition protection missing | Added to Step 6 (debouncing, duplicate protection) |
| Partial failure not addressed | Added independent loading in Step 12 |
| Weak acceptance criteria | All ACs rewritten with measurable criteria |

## Test Coverage Summary

| Step | Tests | Focus Areas |
|------|-------|-------------|
| 1 | 7 | TaskService.updateTask() edge cases |
| 2 | 4 | File locking, timeout, error release |
| 3 | 16 | CRUD operations, filtering, concurrency |
| 4 | 7 | Suggestions, scoring, edge cases |
| 5 | 9 | API client, network errors, type mapping |
| 6 | 9 | Hooks, optimistic updates, race conditions |
| 7 | 5 | Avatar component, accessibility |
| 8 | 4 | Error boundary |
| 9 | 11 | Tabs, empty states, keyboard nav, mobile |
| 10 | 11 | Task list, completion, keyboard |
| 11 | 11 | Schedule popup, accessibility, focus |
| 12 | 10 | Today view, partial failure, actions |

**Total: 114 tests**

## Wire Format Contract

Fully specified in plan. Key endpoints:
- `GET /api/tasks` — filter, pagination
- `GET /api/tasks/suggested` — scored suggestions
- `PATCH /api/tasks/:id` — update with optimistic locking
- `DELETE /api/tasks/:id` — remove task

Error responses standardized: `{ error: string, field?, id?, stale? }`

## Test-First Protocol

Each step requires:
1. Test commit first (`test(task-ui): ...`)
2. Implementation commit second (`feat(task-ui): ...`)

Reviewer checklist:
- [ ] Separate commits
- [ ] Tests fail before implementation
- [ ] Tests pass after implementation
- [ ] Test count matches requirements

## Phase Split

**Phase 1** (12 steps): Core CRUD + tabs + suggestions + quick schedule
**Phase 2** (4 steps): Upcoming view, drag-and-drop, Waiting On filter, Discard action

## Recommendations

1. **Execute Phase 1 first** — shippable MVP with 95% of user value
2. **Consider splitting Step 3** (backend routes) into 3a (GET) and 3b (mutations) if velocity is slow
3. **Monitor test execution time** — 114 tests should run in <30s
4. **Add E2E test** after Phase 1 ships — full user flow coverage

## Review Artifacts

- `pre-mortem.md` — 8 risks identified with mitigations
- `review.md` — this file (consolidated review findings)
- `plan.md` — final plan with 12 steps, 114 tests

## Verdict

**Ready for PRD conversion** after builder approval. Wire format is specified, tests are comprehensive, error handling is addressed.
