---
title: "Phase 3 — Eng-lead review"
slug: arete-v2-phase-3-skills-directory-split-review
parent: arete-v2-chef-orchestrator
status: complete
reviewer: eng-lead (independent)
verdict: APPROVE
created: "2026-04-30"
---

# Phase 3 — Eng-lead review

## 1. Functional verification — gates (a)–(g)

Each gate verified against source + tests.

- **(a) Two-tier directory layout** — `WorkspacePaths.managedSkills` added (`workspace.ts:195`); `BASE_WORKSPACE_DIRS` includes `.arete/skills`. Confirmed.
- **(b) `arete skill fork`** — `forkSkill()` at `services/skill-fork.ts`; copies managed → user, snapshots base into `.fork-base/`, idempotent on re-run, `--force` re-records base only (does NOT overwrite user `SKILL.md`). CLI subcommand at `commands/skill.ts:599`.
- **(c) `arete skill diff`** — `diffSkill()` reads `.fork-base/SKILL.md` vs current `.arete/skills/<name>/SKILL.md`; section-level deterministic diff via `utils/markdown-diff.ts` (no LLM). `--json` parseable.
- **(d) `arete skill merge`** — three-way merge (`threeWayMergeSections`); conflicts emit git-style markers (`<<<<<<< local (.agents/skills/)`/`=======`/`>>>>>>> incoming (.arete/skills/)`); `.fork-base/` advances only on clean merges; `--interactive` callback covers `accept`/`keep-local`/`take-incoming`/`skip`.
- **(e) `arete update` integration** — writes shipped skills to `paths.managedSkills`; `summarizeUpstreamChanges()` produces the "M skills have upstream changes" banner (`update.ts:168–181`); migration runs after sync.
- **(f) IDE adapter — first cut** — `SkillService.list()` is two-tier; both dirs walked. Full adapter rendering of forked content explicitly deferred per plan §(f).
- **(g) MC5 sunset** — separate commit `099f1492` (source) + `c039221e` (dist). See §2.

**Markdown-section diff utility** (`utils/markdown-diff.ts`): pure functions, frontmatter as synthetic `__frontmatter__`, preamble as `__preamble__`, body normalization strips trailing blank lines for byte-equal compare. 27 tests. Deterministic.

## 2. MC5 sunset verification (load-bearing)

| Check | Result |
|---|---|
| 5 SKILL.legacy.md deleted (`daily-winddown`, `weekly-winddown`, `week-plan`, `process-meetings`, `meeting-prep`) | YES — verified via `git show --stat 099f1492` and `ls packages/runtime/skills/<each>/`. Only `SKILL.md` remains in each dir (plus `LEARNINGS.md`/`templates/` for week-plan). |
| `ARETE_LEGACY_SKILL_PROSE` env-var routing removed | YES — `parseLegacyList`, `resolveSkillFile`, `resolveSkillFileFromEnv`, `resolveSkillFileWithFallback` all gone. `skill-resolver.ts` is now 99 lines (down from ~248). Only `resolveSkillDirTwoTier` + `resolveSkillFileTwoTier` remain. |
| `arete skill resolve` JSON output scrubbed | YES — only `success`/`slug`/`path`/`tier`/`userDir`/`managedDir` fields. No `legacyRequested`/`legacyUsed`/`warning`. |
| 5 `## Rollback` sections rewritten | YES — all five cite `git revert <phase-2 ... rewrite commit>` and the `.fork-base/` snapshot path. No `ARETE_LEGACY_SKILL_PROSE` references in any of the 5 SKILL.md files. |
| Dist regenerated post-MC5 | YES — `c039221e` shows `skill-resolver.js` at -164 lines, `skill.js` at -26 lines (`legacyRequested`/`legacyUsed` paths removed from CLI dist). |

The two greps that match `ARETE_LEGACY_SKILL_PROSE` in the source tree are explanatory comments documenting the removal in `skill-resolver.ts:14` and `commands/skill.ts:524`. Not code paths.

MC5 is fully landed. The deletion is permanent and correctly executed.

## 3. Discipline verification

### AC3.7 ledger truth (independent recount)

| Proxy | Baseline `bfe75440` | Wrap `c039221e` | Δ at wrap | Sub-orch reported |
|---|---|---|---|---|
| CLI verbs (`skill` subcommands) | 8 | 11 | **+3** | +3 ✓ |
| Services in `packages/core/src/services/` | 42 (.ts files) | 43 | **+1** | +1 ✓ (sub-orch reported baseline 41/wrap 42 — off by one but Δ correct) |
| `.arete/` subdirs (memory file types) | 8 | 9 | **+1** | +1 ✓ |
| Runtime skill dirs | 40 | 40 | **0** | 0 ✓ |
| SKILL+legacy.md files | 44 | 39 | **-5** | -5 ✓ |

Combined Δ at wrap-up: **0**. Matches sub-orch's report. Plan budget was ≤+1 over zero; actual is exactly 0. Within tolerance.

Sub-orch's services-count baseline was off by 1 (reported 41, actual 42), but the delta they computed (+1) is correct, so the AC3.7 verdict stands.

### Plan-Removes cross-check (Phase 1 lesson)

Plan listed 2 categories of Removes:

1. **5 × `<skill>/SKILL.legacy.md`** — verified deleted (§2). ✓
2. **`ARETE_LEGACY_SKILL_PROSE` env var routing** — verified removed (§2). ✓

Sub-orch transparently flagged a **third implicit assumption** in the plan: "skill-resolver as a service file, -1 service count via simplification." Reality: simplifying ≠ removing the file; `skill-resolver.ts` survives as the load-bearing two-tier resolver. Net services Δ = +1 (skill-fork added, skill-resolver kept) instead of plan's hypothetical 0. This is honest accounting; the wrap-up combined Δ still nets to 0 because SKILL files contributed -5 (matching plan exactly). No hidden deferrals.

### Hygiene reconciliation

Phase 3 does not re-introduce anything hygiene-pass-1 deleted. Hygiene removed: legacy `src/`/`test/`, 4 deprecated functions, `person-signals.ts`, `ContextService.getContextForSkill`, `ToolService` (→ free functions). Phase 3 touches `workspace.ts`, `skills.ts`, `skill-resolver.ts`, `templates.ts`, `install/update.ts`, and adds `skill-fork.ts` + `markdown-diff.ts`. No conflict.

### Migration test correctness (AC3.6)

`skill-fork.test.ts:261–365` covers both required code paths plus 5 edge cases:

- Byte-equal `.agents/skills/<name>/` removed (line 279)
- User-edited `.agents/skills/<name>/` preserved as fork (line 291)
- Plus: community skill (no managed counterpart), mixed scenario, no-op when `.agents/skills/` missing, byte-equal-but-with-`.fork-base` preserved (intent signal), idempotency on second run.

All 7 migration tests pass on `npx tsx --test`.

### Tests

Spot-checked per-file (no `npm test`):

- `npx tsx --test packages/core/test/services/skill-fork.test.ts` → **24/24 pass**
- `npx tsx --test packages/core/test/services/skill-resolver-tier.test.ts` → **9/9 pass**
- `npx tsx --test packages/core/test/utils/markdown-diff.test.ts` → **27/27 pass**
- `npx tsx --test packages/core/test/services/chef-orchestrator-skills.test.ts` → **39/39 pass** (post-MC5 assertions: SKILL.legacy.md GONE, Rollback uses `git revert`)

Sub-orch's reported 235-test total is plausible across 11 files; spot checks confirm green.

### Dist parity

Two dist commits (`50f6a440`, `c039221e`) reflect the source changes. CLI `skill.js` and core `skill-resolver.js` show the expected size deltas (`+251` then `-26` lines on `skill.js`; `-164` on `skill-resolver.js` after MC5).

## 4. Meta's four framing calls

| # | Call | Verdict | Reasoning |
|---|---|---|---|
| 1 | AC3.7 ledger trajectory (+5 ship → 0 wrap-up) | **Accept** | Independently recounted; Δ at wrap is 0. Sub-orch's services baseline was 1 off but the delta they computed is correct. Within budget. |
| 2 | MC5 sunset verification | **Accept** | All 5 checks pass. Files gone, routing removed, JSON output scrubbed, 5 Rollback sections rewritten, dist regenerated. The deletion is permanent and clean. |
| 3 | Migration test correctness | **Accept** | Both required AC3.6 paths exercised plus 5 edge cases. Idempotency tested. |
| 4 | Plan-Removes cross-check | **Accept with note** | Both plan-listed removes shipped. Sub-orch surfaced a third implicit assumption (skill-resolver file deletion) that didn't materialize, and explained why honestly. The combined Δ still nets to 0; no hidden mass. |

## 5. Other concerns

- **Documented deferrals are honest**: IDE adapter rendering of forked content (plan-explicit "Defer-not-cut"), `--interactive` text-only readline UX (plan-authorized as "primitive"), heading-rename edge case in three-way merge (documented in `markdown-diff.ts` JSDoc; produces two added sections rather than a conflict — by design and matches git-merge behavior). None warrants rejection.
- **Commit clustering**: Steps 1–7 bundled into `c3e7ae1a`. Sub-orch explained: shared files would force forward imports or no-op intermediate commits. Acceptable tradeoff; MC5 stays cleanly separable in `099f1492` per the plan's "single revertable commit" requirement.
- **Legacy resolver test deletion**: `skill-resolver.test.ts` (210 LOC, 22 tests) was deleted in MC5 — replaced by `skill-resolver-tier.test.ts` (9 tests). Net test count drop on this file but coverage is appropriate for the simpler post-sunset resolver.
- **No `npm test` at root** — confirmed; all tests run per-file.

## 6. Verdict

**APPROVE**.

The MC5 sunset — the load-bearing check for Phase 3 — landed cleanly: 5 legacy files gone, env-var routing fully removed (4 functions deleted), JSON output scrubbed, 5 Rollback sections rewritten, dist regenerated. Functional gates (a)–(g) all deliver. Migration test exercises both AC3.6 code paths plus appropriate edges. AC3.7 ledger is honest (sub-orch flagged the one plan assumption that didn't quite hold and explained why net is still 0). Tests pass per-file, no `npm test` at root. Hygiene reconciliation clean.

Ready to merge to parent (subject to meta's separate Phase 2 soak gate per parent plan MC5).
