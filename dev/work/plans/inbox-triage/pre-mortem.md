## Pre-Mortem: Inbox Universal Content Ingest & Triage

### Risk 1: `inputs/` migration has hidden references

**Problem**: The plan updates `rapid-context-dump`, `getting-started`, and `context-dump-quality.ts`, but grep found 6 files referencing `inputs/onboarding-dump`. There may also be indirect references (e.g., test fixtures, archived PRDs, dist/ build artifacts) that cause confusion or broken paths post-migration.

**Mitigation**: Before starting Step 1, run a comprehensive grep across the entire repo (not just `packages/`). Categorize hits into: must-fix (runtime code, active skills), should-fix (tests, quality checks), and ignore (archive, dist). Include the full list in the Step 1 implementation notes.

**Verification**: `grep -r "inputs/onboarding" . --include="*.ts" --include="*.md" | grep -v dist/ | grep -v archive/ | grep -v node_modules/` returns 0 results after Step 1.

---

### Risk 2: Non-markdown file analysis is unreliable in skill context

**Problem**: The plan says "agent runtime supports PDF/image parsing" and marks this as v1 scope. However: (a) skills are SKILL.md instructions followed by an LLM agent conversationally, (b) `rapid-context-dump` explicitly says "Large binary files (images, videos) — not supported", (c) no existing skill uses vision capabilities. Whether the agent can read a PDF or analyze an image depends entirely on the host environment (Claude Code vs Cursor vs web app).

**Mitigation**: Tier the non-markdown support explicitly in the skill:
- **Tier 1 (guaranteed)**: `.md`, `.txt` — direct content reading
- **Tier 2 (best-effort)**: `.pdf` — attempt to read; if agent can't parse, create companion `.md` stub
- **Tier 3 (environment-dependent)**: images — attempt vision; if unavailable, create stub noting "image file, manual review needed"
- The skill should gracefully degrade, not fail.

**Verification**: Triage skill handles a mixed inbox (md + pdf + png + unknown binary) without errors in Claude Code. Produces `needs-review` stubs for anything it can't parse rather than failing.

**Status**: ✅ Mitigated — graceful degradation tiers added to Resolved Questions #4 and Step 3 content type classification.

---

### Risk 3: QMD search scope requires coordinated changes across 3-5 files

**Problem**: Adding `inbox` to search scope requires updating: `QmdScope` type in `models/workspace.ts`, `SCOPE_PATHS` in `qmd-setup.ts`, `ALL_SCOPES` in `qmd-setup.ts`, and optionally `VALID_SCOPES` + help text in `search.ts`. Missing any one causes silent failures or type errors.

**Mitigation**: Step 1 includes the explicit file list with line numbers for all QMD changes.

**Verification**: `npm run typecheck` passes. `arete search "test" --scope inbox` works after `arete index`. `arete context --for "test query" --inventory` shows inbox collection.

**Status**: ✅ Mitigated — explicit file:line list added to Step 1.

---

### Risk 4: Scope creep in Step 3 (triage skill is very ambitious)

**Problem**: Step 3 defines a 6-phase workflow with context bundle assembly, significance analysis, entity resolution, approval gates, and memory updates. This is the most complex skill in the system. Risk of over-engineering v1 or getting stuck in the approval gate UX.

**Mitigation**: MVP-first layering:
- **MVP**: Scan inbox, classify content type, propose routing via entity matching, approval table, move files. No significance analysis, no memory updates.
- **Enhancement A**: Add context bundle assembly + significance analyst.
- **Enhancement B**: Add memory update proposals.

**Verification**: MVP triage works for 3 test items before enhancements are added. Each enhancement is independently testable.

**Status**: ✅ Mitigated — implementation layering note added to Step 3.

---

### Risk 5: Step 4 modifies multiple existing skills (daily-plan, week-plan)

**Problem**: Adding inbox awareness to `daily-plan` and `week-plan` means touching two stable, well-tested skills. These skills have their own complex workflows. Adding "check inbox count" logic could introduce regressions.

**Mitigation**: Defer daily-plan/week-plan inbox awareness to a fast-follow. `arete status` + `arete pull` tips are sufficient awareness for v1 launch. When added, keep changes minimal (one line check at skill start).

**Verification**: `daily-plan` and `week-plan` work identically with an empty inbox. With items in inbox, they mention the count but don't change their core workflow.

**Status**: ✅ Mitigated — marked as fast-follow in Step 4.

---

### Risk 6: Companion .md for binary files — unresolved design question

**Problem**: Unresolved question about sidecar `.meta.yaml` vs companion `.md` affects Step 2 file contract and Step 3 triage behavior.

**Mitigation**: Resolved: use **companion `.md`** approach. When a non-markdown file is triaged, create `{filename}.md` with frontmatter + extracted content summary. Original binary stays alongside. Both move together when routed. Rationale: `.md` files are searchable via QMD and follow workspace conventions.

**Verification**: Decision documented in plan. File contract specifies companion pattern. Step 2 `--file` flag creates companion .md.

**Status**: ✅ Mitigated — resolved in Resolved Questions #5, updated Step 2 implementation.

---

### Risk 7: `research_intake` pattern overlap creates confusion

**Problem**: The new `inbox_triage` pattern does much of what `research_intake` does. If both exist, skill authors won't know which to use.

**Mitigation**: Document the relationship in `PATTERNS.md`:
- `research_intake`: Project-scoped. Processes `inputs/` within a specific project. Output stays in project `working/`.
- `inbox_triage`: Workspace-scoped. Processes top-level `inbox/`. Routes to any workspace destination.
- They're sequential, not competing: triage may route TO a project's `inputs/`, where `research_intake` later processes.

**Verification**: `PATTERNS.md` has "See also" cross-reference between the two patterns.

**Status**: ✅ Mitigated — cross-reference note added to Critical Files table.

---

### Risk 8: No existing test patterns for skill behavior

**Problem**: Skills are SKILL.md instructions followed by LLM agents. No unit test framework for "does this skill classify correctly?" Manual-only testing is fragile for a skill this complex.

**Mitigation**: Focus automated tests on plumbing, manual tests on skill logic:
- Unit tests: `arete inbox add` CLI command (file writing, frontmatter, slug creation)
- Unit tests: inbox count in `arete status` (frontmatter parsing, status counting)
- Integration test: QMD indexing of `inbox/` directory
- Skill behavior: manual verification per AC scripts

**Verification**: `npm test` covers inbox CLI command and status integration. Skill behavior verified manually.

**Status**: ✅ Accepted — automated tests for plumbing, manual for skill logic.

---

## Summary

Total risks identified: **8**
Categories covered: Context Gaps, Platform Issues, Integration, Scope Creep, Documentation, Reuse/Duplication, Test Patterns, Dependencies

All risks mitigated or accepted. Plan updated with mitigations.
