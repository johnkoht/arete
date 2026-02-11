# Doc Completeness & File Deletion Safety

**Date:** 2026-02-10

## What Changed

Implemented the three-part plan from the doc-planning reflection and the multi-ide-support file-deletion incident:

1. **AGENTS.md** — Added item 8 ("Consider documentation impact") and **Documentation Planning Checklist** under "For Autonomous Development". Checklist covers: scope (README, SETUP, AGENTS, ONBOARDING, scratchpad, backlog), search strategy (feature keywords + concept audit for path/structure changes), verification (re-read backlog for doc requirements; list affected files before drafting plan). Anti-pattern: assuming "documentation" = README + SETUP + AGENTS only.

2. **execute-prd/SKILL.md** — Added **Documentation** as 9th pre-mortem risk category; added **Documentation Impact Mitigation** (run checklist, add doc task to prd.json if affected, provide doc subagent with context). Added **11.0 File Deletion Review**: after each subagent completes, run `git diff HEAD --name-status | grep '^D'`; if deletions and not specified in plan, ask subagent to justify (what/why/replacement); validate or reject. Special attention for build-only files (`.cursor/rules/*.mdc`, `dev/*`, etc.).

3. **prd-task.md** — Added **File Deletion Policy** under step 1: before deleting any file that existed before starting, check if plan explicitly says to delete it; if not, provide explicit justification in response (Deleted: path, Reason:, Replacement:). Special cases (build-only rules, docs, core infra) — RARELY delete without explicit plan. Anti-pattern: deleting as "cleanup" without justification.

## Why

- **Doc planning:** Agent had produced a doc plan that missed ONBOARDING.md and backlog feature docs (narrow scope, search gaps, path drift, backlog blind). Checklist and pre-mortem doc risk make doc updates non-optional and systematic.
- **File deletion:** During multi-ide-support refactor, subagent deleted dev.mdc, testing.mdc, plan-pre-mortem.mdc with no explicit rationale (likely inferred "don't ship" → "delete from repo"). Requiring justification and orchestrator review prevents silent removal of critical files.

## Learnings

- Build-only rules (dev.mdc, testing.mdc) must stay in `.cursor/rules/` in repo; PRODUCT_RULES_ALLOW_LIST only controls what gets copied to user workspaces, not what exists in repo.
- Pre-mortem + checklist + subagent policy together close both "forgot to plan docs" and "deleted files without reason" failure modes.
