---
title: "Phase 12 — cross-model review (ship Phase 1.3)"
reviewer: claude-opus-4-6 (headless, independent context)
date: "2026-06-10"
verdict: approve-with-suggestions
structural_blockers: 0
---

---

## Review: Phase 12 — Projects as first-class citizens

**Type**: Plan
**Audience**: Builder + User mixed (CLI/core = user-facing product code; skill prose = user workspace)
**Review Path**: Full
**Complexity**: Large (8 in-scope ACs, 5+ files, architectural data-model decisions, new CLI command group)
**Recommended Track**: full
**Pre-mortem**: Present, thorough (10 risks, 2 plan amendments accepted)

---

### Strengths

1. **The premise is verified and real.** The plan's central claim — "nothing writes `fm.area` to a project, so every `if (project.area)` guard in `assembleBriefForProject` (:1007/:1030/:1056) is dead code" — is confirmed by reading the code. `readProjectBySlug` (:927) reads area only from `fm.area`; `listActiveProjects` (:897) does the same. The 6/8 degraded projects are a measurable live bug, not a speculative improvement.

2. **Amendment is disciplined.** The scope cut (slices A+B+C only; AC5/AC7/AC8/AC9 deferred) removes all write-back complexity. The gated build writes *nothing* to project READMEs except via the explicitly approval-gated `backfill-area --apply`. This eliminates pre-mortem R1/R2 from the build entirely.

3. **Pattern reuse is strong.** AC2 mirrors the existing `commitments backfill-area` (cli/commands/commitments.ts:328-461) — same preview/--apply/--reset + provenance pattern. AC1's creation-time area proposal mirrors `general-project/SKILL.md:61-75` linked-goal capture. The plan is building with existing materials, not inventing new abstractions.

4. **Pre-mortem R1/R2 were load-bearing.** The original AC3/AC5 design (topics persistence on `/project` open) would have been a serious trust violation — silent writes in a tracked workspace. The pre-mortem caught this before build. The amendments are already folded into the plan text.

5. **Rollback (AC12) is concrete.** Code: `git revert`. Workspace data: `--reset` for backfill provenance, frontmatter key deletion for topics cache. No schema migration to unwind.

---

### AC Validation

| AC | Independently verifiable | Specific | Testable | Single concern | Vague language | Verdict |
|----|--------------------------|----------|----------|----------------|----------------|---------|
| **AC1** | Yes | Yes | Yes (parser unit + integration brief + manual) | Borderline — bundles read-path parser + write-path skill prose. Acceptable: thematically atomic. | None | **Pass** |
| **AC2** | Yes | Yes | Yes (unit + integration + MC3 shadow) | Yes | None | **Pass** |
| **AC3** | Yes | Yes | Yes (zero-write assertion + byte-identical end-to-end) | Yes | None | **Pass** |
| **AC4** | Yes | Mostly | Yes | **No** — bundles three independent enhancements: (a) topic re-rank query strengthening, (b) projectSlug-first commitment filtering + sibling union, (c) sibling link parsing | None | **Pass with note** — implementation should track (a), (b), (c) as sub-tasks; if one proves harder than estimated, the others can ship independently |
| **AC6** | Yes | Yes — exact message text given | Yes | Yes | None | **Pass** |
| **AC10** | Meta-gate | N/A | Yes | Yes | None | **Pass** |
| **AC11** | Yes | Yes — "1 → 4+" section count | Yes | Yes | None | **Pass** |
| **AC12** | Yes | Yes — mechanism per component | Spot-verified | Yes | None | **Pass** |

---

### Concerns

**1. [Completeness] AC3's "last touched" mtime has no StorageAdapter surface**

AC3 defines "what's new since last touched" as `area meetings + topics with last_refreshed newer than README mtime + newly-opened commitments`. `StorageAdapter` exposes `read/write/exists/delete/list/mkdir/copy` — no `stat()` or `mtime()`. Services must NOT call `fs` directly (services/LEARNINGS.md invariant, core/PROFILE.md: "Key principle: Services never import `fs` directly — all file I/O through `StorageAdapter`").

- **Suggestion**: Either (a) add `stat(path): Promise<{mtime: Date} | null>` to StorageAdapter, or (b) derive "last touched" from a frontmatter field (`updated:`, `started:`), or (c) use git log. Option (b) avoids an interface change but is less reliable (not all projects have `updated:`). The plan should specify which mechanism before build, so the implementation doesn't ad-hoc a direct `fs.stat()` call.

**2. [LEARNINGS.md gap] AC2 writes workspace files but doesn't mention qmd index refresh**

`project backfill-area --apply` writes `area:` + `area_set_by:` to project README frontmatter. Per cli/LEARNINGS.md: "Any command that writes workspace files should call `refreshQmdIndex()`." The existing `commitments backfill-area` doesn't call `refreshQmdIndex` (it writes to `.arete/commitments.json`, not searchable workspace markdown), but project READMEs ARE indexed by qmd. Omitting the refresh means `arete search` won't see the new `area:` frontmatter until the next manual `arete index` or workspace write.

- **Suggestion**: Add `refreshQmdIndex()` call after apply, with `--skip-qmd` option. Follow the `update.ts` canonical pattern.

**3. [Robustness] AC1 prose-line regex fragility**

The priority parser's third tier is `**Area**: [..](../../../areas/<slug>.md)` prose-line regex. The verified example is `**Area**: [Glance 2.0 MVP](../../../areas/glance-2-mvp.md)` — but project READMEs are user-editable. Variations in the wild:
- `**Area:** [...]` (colon inside bold)
- `**Area**: glance-2-mvp` (plain text, no link)
- `Area: [...]` (no bold)
- `**Area**: [Glance 2.0 MVP](../../areas/glance-2-mvp.md)` (different relative depth)

A rigid regex silently fails — the project stays area-less, AC6 fires with "No area resolved," and the user has no idea why. The pre-mortem's R9 covers dual-schema disagreement but not this "regex can't parse what a human would read" failure mode.

- **Suggestion**: Make the regex permissive (tolerate missing bold, plain-text slugs, variable link depth). Add a unit test for each observed variation. If the regex extracts something but it doesn't match any known area slug, log a one-line diagnostic (similar to R9's divergence warning).

**4. [Edge case] AC3 resolver returns archived projects that `readProjectBySlug` can't find**

`resolveProject` (entity.ts:361-430) searches both `active/` and `archive/` directories. But `readProjectBySlug` (:927) only looks in `active/{slug}/README.md`. If a user types `/project "old thing"` and the resolver finds an archived project, the brief returns empty sections with no explanation — not even the AC6 "no area" message, because the project itself wasn't found.

- **Suggestion**: Either (a) scope the resolver to active-only for the `/project` open flow, or (b) when `readProjectBySlug` returns null, check if the slug exists in `archive/` and emit "Project `<slug>` is archived — context is read-only" before returning the empty brief.

**5. [Consistency] New `project` command group should follow --json convention**

The plan's AC2 mirrors `commitments backfill-area`, which has `--json` throughout. The plan doesn't explicitly state that the new `arete project backfill-area` and `arete project open` commands support `--json`. Per cli/LEARNINGS.md: "`--json` output must be complete and parseable — including error cases."

- **Suggestion**: Add `--json` to the AC2 and AC3 verification descriptions. The existing `backfill-area` in commitments.ts is the template — it handles `--json` in every exit path.

---

### LEARNINGS.md Scan

| File | Gotcha | Status |
|------|--------|--------|
| services/LEARNINGS.md | "Services must NOT call `fs` directly" | ⚠️ See Concern #1 — mtime mechanism unspecified |
| services/LEARNINGS.md | "parseFrontmatter is duplicated 9 times" | Noted — AC1 adds a new parsing path (prose-line regex), not another `parseFrontmatter` duplication. Acceptable. |
| services/LEARNINGS.md | "'Services tested' ≠ 'services wired'" | Relevant — AC4's topic re-rank and commitment filtering changes must have production call sites, not just tests. Test plan looks solid. |
| services/LEARNINGS.md | "createServices() is async" | Not violated |
| cli/LEARNINGS.md | "Commands that call refreshQmdIndex() need --skip-qmd AND loadConfig" | ⚠️ See Concern #2 |
| cli/LEARNINGS.md | "Use established UX patterns" | ✅ Plan mirrors existing backfill-area |
| cli/LEARNINGS.md | "--json output must be complete and parseable" | ⚠️ See Concern #5 |
| cli/LEARNINGS.md | "Always check findRoot() and exit if null" | ✅ Plan follows existing pattern |

No LEARNINGS.md gotchas are violated in a way that would make the plan unexecutable. Concerns #1 and #2 are implementation-time issues that need resolution but have clear solutions.

---

### Devil's Advocate

**If this fails, it will be because** the prose-line regex for `**Area**:` is too rigid to handle the real formatting variations across project READMEs, and AC2's area inference (reusing `suggestAreaForMeeting` on project content) produces confident-but-wrong matches that a busy John batch-approves in the preview table. The combination — projects that look area-resolved but point to the wrong area — is the worst failure mode because the brief looks *full and confident* (sections 2-5 populated) but with the wrong meetings, wrong commitments, and wrong wiki pages. AC6 only fires when area is truly absent, not when it's wrong.

**The worst outcome would be** that glance-2-mvp's brief regresses instead of improving. If the prose-line regex misparses the area slug (e.g., captures `glance-2-mvp.md` instead of `glance-2-mvp`), the brief pulls nothing (area doesn't match), and because AC6 requires area to be completely unresolved to fire, the brief silently drops to the degraded README-echo mode with no warning — exactly the current bug, but now the user *expects* it to work because they shipped the fix. The AC11 section-count gate (`1 → 4+`) catches this if applied to `glance-2-mvp`, but only if the regex fails completely — a partial mismatch (wrong area, not absent area) passes the section-count gate while delivering wrong content.

---

### Test Coverage Gaps

- AC1's prose-line regex needs explicit tests for formatting variations (see Concern #3). The verification says "Unit: parser priority order incl. each schema + prose + none" — this should include malformed prose lines, not just the happy path.
- AC3's "what's new" mtime comparison needs a test that verifies the mechanism works when a project README has no frontmatter `updated:` field — the plan should specify what "last touched" means in that case.
- AC4's sibling-link regex `\]\(\.\.\/([\w-]+)\/` should have a test for links that don't use trailing slash, or links with different relative depths (e.g., `../../sibling/`).

---

### Verdict

- [x] **Approve with suggestions** — Minor improvements recommended

The plan is well-grounded, the pre-mortem was thorough and load-bearing, the amendment's scope cut is disciplined, and the build orchestration (cheapest-first slices) is correct. No structural blockers. The five suggestions above are implementation-time issues with clear solutions — none require replanning.

The AC11 hard gate (`glance-2-mvp` brief section count `1 → 4+`) is the right forcing function. If Slice A doesn't pass this gate, the rest of the phase should stop — and the plan explicitly says so.

---

## Gate summary

- **structural_blockers**: none
- **suggestions_count**: 5
  1. AC3 mtime mechanism unspecified — StorageAdapter doesn't expose `stat()`
  2. AC2 `--apply` should call `refreshQmdIndex()` + add `--skip-qmd`
  3. AC1 prose-line regex needs robustness against formatting variations
  4. AC3 resolver should handle archived-project resolution gracefully
  5. New `project` command group needs explicit `--json` in AC verification

---

## Orchestrator gate notes (suborchestrator, post-review)

- **Gate decision: PASS** — no structural blockers; 5 suggestions, all incorporated into the PRD as task-level ACs.
- **Correction to Concern #1**: `StorageAdapter.getModified(path): Promise<Date | null>` already exists (packages/core/src/storage/adapter.ts) — the mtime mechanism IS specified; services stay fs-free. No interface change needed.
- Suggestion #2 (qmd refresh + --skip-qmd on backfill --apply) → folded into AC2 task.
- Suggestion #3 (permissive prose-line regex + variation tests) → folded into AC1 task; partial-mismatch risk noted: AC11 check also verifies metadata.area === "glance-2-mvp", not just section count.
- Suggestion #4 (archived-project handling on open) → folded into AC3 task (archived note line).
- Suggestion #5 (--json on all project subcommands) → folded into AC2/AC3 tasks.
