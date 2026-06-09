---
title: "Phase 7b — Validation-then-deletion sweep (Phase 5 absorbed removes)"
slug: phase-7b-validation-then-deletion
created: "2026-05-29"
revised: "2026-05-29 — post review-1"
parent: arete-v2-chef-orchestrator
owner: meta-orchestrator (Claude)
status: revised-post-review-1
---

## Revisions from review-1 (eng-lead, 2026-05-29)

- **C1 [high]** — Audit was wrong about `arete area refresh` existing. Only `intelligence.ts:488` calls `areaMemory.refreshAllAreaMemory()`. After AC3 strips the LLM thread, `area-memory.ts`'s LLM code (lines 532-549, 742-772, ~120 LOC) becomes orphan. **Decision**: delete those orphan paths too in AC3 (more aggressive cleanup, cleaner ledger). Brings 7b total removes from ~770 to ~900 LOC. Topic-memory.ts LLM paths are kept (`arete topic refresh --all` is a real consumer).
- **C2 [med]** — GUIDE.md `--answer` references are 5 lines, not 4 (added line 976 comment).
- **C3 [low]** — AC1 mutex check is at lines 495-509 (entire if-block), not 501-506.
- **C4 [med]** — Path prefix fix: `apps/backend/...` → `packages/apps/backend/...`.
- **C5 [low]** — AC1 test wording — `search.test.ts` exists; extend, don't add minimal one.
- **C6 [med]** — `status.ts:426` hint says "Run `arete memory refresh` to update stale area memory" — misleading post-AC3. Updated or removed in AC3.
- **R-missing-1** — Build sub-orch grep sweep walks `packages/runtime/.claude/commands/` too.
- **R-missing-2** — Grep for `memory refresh --json` consumers reading `synthesis` or `topicResult` fields before removing those reporting blocks.

# Phase 7b — Validation-then-deletion sweep

## Why this exists

Parent plan's 2026-05-28 reframe split Phase 7 into 7a (additive substrate, **shipped at merge `4f7ce486`**) + 7b (this — validation-then-deletion sweep). 7b absorbs Phase 5's deletion list and validates each item against current active use before removal. Pre-scope validation audit completed 2026-05-29 (per "Pre-scope validation" section below) and produced per-candidate verdicts.

**One-line goal**: bring the 7a+7b cumulative ledger back toward neutral by removing confirmed-unused code, with explicit deferral of items that audit revealed are load-bearing or entangled.

## Pre-scope validation (audit, 2026-05-29)

Audit ran on all 7 Phase 5 absorbed-remove candidates. Verdicts:

| # | Item | Verdict | Reasoning |
|---|---|---|---|
| 1 | `meeting-parser.ts` | **KEEP** | Parent plan was wrong: doesn't re-parse extraction output, parses user-curated `## Approved Action Items` checkbox sections from committed meeting files. Called by `entity.ts:651,1354` in `refreshPersonMemory`. Load-bearing for per-person memory. |
| 2 | `brief --for` LLM branch | **DEFER** | Coupled to `skill-commands.ts:22` generator + every `requires_briefing: true` skill template. Removal needs coordinated update across skill generator + templates + docs. Belongs in its own follow-on phase, not bundled here. |
| 3 | `search --answer` LLM branch | **DELETE** | User confirmed never used. No programmatic consumer. ~130 LOC. |
| 4 | `arete daily` CLI command | **DELETE** | User confirmed never used. Diary 2026-05-15 already disambiguated this from `daily-plan` SKILL (which IS used and was correctly restored). ~560 LOC incl. tests. |
| 5 | `arete memory refresh` synthesis pipelines | **MODIFY** | Split: keep mechanical (CLAUDE.md regen, memory index, qmd index, log append, person-memory refresh — none use LLM), drop the LLM-synthesis blocks in `intelligence.ts:480-492` (area-memory LLM threading) and `:508-526` (topic-refresh-with-LLM). Underlying services keep their LLM code paths since `arete topic refresh --all` and `arete area refresh` use them directly. |
| 6 | Three context services collapse | **KEEP (defer)** | All three (`context.ts`, `meeting-context.ts`, `intelligence.ts`) have active distinct consumers including `apps/backend/src/services/agent.ts`. Collapse would force renames across 4+ files. No clear consumer need today. |
| 7 | `arete route` CLI | **KEEP** | Documented as canonical natural-language router in `read-agents-md.ts:35,39` (generated AGENTS.md) + `runtime/tools/README.md:112` + `runtime/GUIDE.md`. Removing creates dangling refs in installed workspaces' AGENTS.md. |

**Total scope this phase: ~770 LOC net negative** (3 surgical operations on items 3, 4, 5).

## Scope (acceptance criteria)

### AC1 — Delete `search --answer` LLM branch (GATE)

`packages/cli/src/commands/search.ts`:
- Remove the `--answer` flag (~line 943)
- Remove the synthesis branch (~lines 764-885 — the `if (answer)` block)
- Remove the **entire** mutual-exclusion if-block at ~lines 495-509 (covers timeline+answer conflict — not just inner JSON branch at 501-506 per C3)

`packages/runtime/GUIDE.md`: drop the **5** `--answer` example lines per C2: lines 743, 944, 957, **976** (comment), 977.

**Test**: extend the existing `packages/cli/test/commands/search.test.ts` to assert the `--answer` flag is rejected by the parser. Do NOT write a test that exercises the deleted branch (C5).

### AC2 — Delete `arete daily` CLI command (GATE)

Remove files:
- `packages/cli/src/commands/daily.ts` (~389 LOC)
- `packages/cli/test/commands/daily.test.ts` (~170 LOC)

Update:
- `packages/cli/src/index.ts:40,174` — remove the `import` + `register*` call
- `packages/cli/src/commands/status.ts:435` — remove the "recommends `arete daily`" hint line
- `packages/cli/src/commands/status.ts:169` (test) — drop the `'arete daily'` / `'daily'` assertion if it exists

**Test**: extend `status.test.ts` to verify the removed recommendation doesn't print.

### AC3 — MODIFY `arete memory refresh` + remove orphan `area-memory.ts` LLM paths (GATE — expanded per C1)

**3a — `packages/cli/src/commands/intelligence.ts`** (memory refresh aggregator):
- Remove lines ~480-492 (`callLLM` construction + threading into `refreshAllAreaMemory`)
- Remove lines ~503-526 (the entire "2b. Refresh topic pages" block that constructs and gates on `callLLM`)
- Remove lines ~643-654 (synthesis status reporting in non-JSON output)
- Remove lines ~672-680 (topic results reporting that depends on the deleted block)
- Update `refreshAllAreaMemory` call site to drop the `callLLM` argument

**3b — `packages/core/src/services/area-memory.ts`** (orphan LLM cleanup, per C1):
- Remove `callLLM` parameter from `refreshAllAreaMemory` signature (post-3a it has no live caller passing it)
- Remove the `callLLM`-gated cross-area synthesis block at ~lines 532-549
- Remove the `callLLM`-gated supporting code at ~lines 742-772
- Update related tests in `area-memory.test.ts` — drop any test that exercised the LLM path; add a test confirming the post-removal mechanical path still works.
- **Critical verification before deleting**: confirm via grep that NO OTHER caller in the codebase passes a `callLLM` argument to `refreshAllAreaMemory`. If a caller exists (e.g., a backend route), this expansion of AC3 needs re-scoping — surface to meta. Build sub-orch must check.

**3c — `packages/cli/src/commands/status.ts`** (per C6):
- Update or remove the `:426` hint "Run `arete memory refresh` to update stale area memory" — misleading post-3a/3b since `memory refresh` no longer refreshes area memory via LLM. Two options:
  - (i) Remove the hint entirely (cleanest if no replacement command exists)
  - (ii) Reword to "Run `arete area refresh` once that verb ships" — but pointing at non-existent verb is worse than no hint
- Recommend (i). Document in build-report.

**Topic-memory.ts is UNCHANGED** — `arete topic refresh --all` is a real live caller of its LLM code paths. Only area-memory.ts has the orphan-LLM problem.

**Test**: extend `intelligence.test.ts` to assert mechanical paths still pass after 3a. Extend `area-memory.test.ts` to confirm 3b's signature change works + removes don't break mechanical refresh.

### AC4 — Verify and document deferred items in build-report (GATE)

The 4 deferred items (meeting-parser KEEP, brief LLM DEFER, three-context KEEP, route KEEP) get a "Deferred items" section in `build-report.md` with:
- One-line reasoning per item (from the audit)
- Whether this is permanent KEEP or staged DEFER
- For DEFER (brief LLM): named successor phase / follow-up if appropriate

Documenting this prevents Phase 8 or later from re-litigating.

### AC5 — Tests (GATE)

Per-file `tsx --test`. Specifically:
- `search.test.ts` (extend or add): `--answer` removed, default `search` works
- `daily.test.ts`: removed entirely with the source file
- `status.test.ts`: assertions about removed daily recommendation
- `intelligence.test.ts`: `memory refresh` mechanical paths still pass; LLM-synthesis branches gone
- Regression check on related: `area-memory.test.ts`, `topic-memory.test.ts`, `meeting-frontmatter.test.ts`, `commitments.test.ts`, `tasks.test.ts`, `chef-orchestrator-skills.test.ts`

### AC6 — Discipline ledger (revised per C1 expansion)

Per parent plan AC8.

| Item | LOC removed |
|---|---|
| `search --answer` branch + flag + 5 GUIDE.md lines | ~135 |
| `daily.ts` + `daily.test.ts` + registrations + status.ts hint | ~565 |
| `memory refresh` LLM blocks (3a) | ~80 |
| `area-memory.ts` orphan LLM paths (3b, per C1) | ~120 |
| `status.ts:426` misleading hint (3c) | ~3 |
| **Net delta (LOC removed)** | **~−903** |

**Combined with 7a** (+606 src / +1079 markdown / +1210 tests):
- Code-only cumulative across 7a + 7b: 606 − 903 = **−297 LOC** (more negative than original estimate of −173)
- Tests cumulative: +1210 − ~30 (removed daily.test.ts) + small area-memory test adjustments = ~+1170
- Markdown cumulative: +1079 − ~5 (GUIDE.md --answer lines) = ~+1074

**Net code delta substantially negative.** Satisfies parent plan AC8 ≤0 target without substitution argument. The orphan-LLM cleanup (3b) accelerates this — removing dead code IS the discipline rule in action (Principle 7 substrate sunset: code without consumer goes).

### AC7 — Rollback path

`git revert <build commit(s)>` restores each deletion. The MODIFY in AC3 is a code change, fully revertable. No SKILL.md changes; no chef-pattern surgery. Pure backend pruning.

If any deletion silently breaks a consumer the audit missed, the revert path is fast.

## Skeptical view (per parent plan principle #9)

**Strongest case against shipping 7b:**

"The audit caught most things, but a deletion sweep across 770 LOC is the precise place where a missed consumer surfaces a week later. The audit ran ~25 min and grep'd for callers — that's not exhaustive. Specifically: the `daily` CLI is registered as a top-level CLI verb; some agent prose or third-party automation could invoke it. The `memory refresh` LLM blocks have been there for months; downstream behavior (specifically `frontmatter_synth_results` or similar reporting that any consumer might depend on) could subtly change."

**Counter:**
1. **User confirmed**: "I've never used search --answer or daily." That's the load-bearing signal for these two. No grep evidence of programmatic consumers.
2. **MODIFY (AC3) is surgical** — removes the LLM-synthesis blocks but keeps the aggregator command working with all mechanical bits intact. `arete memory refresh` still does CLAUDE.md regen, index, log, qmd. User-visible behavior change: no auto-synthesized area/topic memory at refresh time. They still get them via `arete topic refresh --all` and `arete area refresh` (separate verbs, unchanged).
3. **The audit's KEEP verdicts are honest** — meeting-parser, route, context services all stayed because the audit found load-bearing consumers. The audit didn't reflexively delete.
4. **Test sweep covers regression** — AC5 explicitly includes regression check on adjacent services.

**Risks specific to 7b:**

- **R1**: A `requires_briefing: true` skill template references `arete brief --for` (Candidate 2). 7b doesn't touch that — Candidate 2 is DEFER. But the test sweep should verify nothing else changed during build inadvertently broke `arete brief`. Mitigation: `brief.test.ts` or `intelligence.test.ts` in regression check.
- **R2**: Removing `arete daily` may leave docs/skills with broken references. Mitigation: build sub-orch greps `arete daily` across `packages/runtime/skills/`, `packages/runtime/.claude/commands/` (per R-missing-1), and `docs/` before final commit; documents findings in build-report.
- **R3 (RESOLVED in revised AC3 per C1)**: `area-memory.ts`'s `callLLM` parameter and LLM code paths become orphan after 3a. Original plan deferred the call; revised plan now removes them in 3b. Build sub-orch verifies no other caller before deletion (3b's "Critical verification" step).
- **R4 (per R-missing-2)**: Any consumer parsing `arete memory refresh --json` output that reads `synthesis` or `topicResult` fields will see those fields disappear. Mitigation: build sub-orch greps for `memory refresh --json` consumers + the field names before removing the reporting blocks. Likely zero consumers, but verify.
- **R5**: `status.ts:426` hint becomes misleading post-AC3 (C6). Removed entirely in 3c.

## Phase plan requirements (per parent plan)

- **MC1 (gates vs stretch)**: All ACs are gates. No stretch this phase — small, surgical scope.
- **MC2 (per-skill rollback)**: N/A — no SKILL.md changes.
- **MC3 (shadow validation)**: N/A — no new heuristic. Pre-scope audit (already complete) is the validation.
- **MC4 (PATTERNS.md ships first)**: N/A — no new chef pattern.
- **MC5 (legacy interaction)**: N/A.

## Build orchestration

Sub-orchestrator runs in a manually-created sub-worktree off parent (per Phase 3 lesson). Pre-flight check in handoff brief.

Branch: `worktree-phase-7b-validation-then-deletion`
Worktree path: `.claude/worktrees/phase-7b-validation-then-deletion`

Per-task commits with `phase-7b(<area>): <change>` prefix. Per-file `tsx --test` (NO `npm test` at root). Dist rebuild before final commit.

Steps:
1. **Pre-flight**: verify base + 7a commits + 7a-followup `ecc8269e` reachable. Halt if base wrong.
2. **R4 grep BEFORE deletion** — search `packages/`, `docs/`, `runtime/` for consumers of `memory refresh --json` parsing `synthesis` or `topicResult` fields. Document findings before AC3.
3. **AC1 build** — delete `search --answer` branch + flag + 5 GUIDE.md lines. Tests. Commit `phase-7b(cli): delete search --answer LLM branch (AC1)`.
4. **AC2 build** — delete `daily.ts` + tests + registrations + status.ts hint. Update `status.test.ts`. Commit `phase-7b(cli): remove arete daily command (AC2)`.
5. **AC3 build, sequenced as 3a → 3b → 3c**:
   - 3a: surgical edits to `intelligence.ts` `memory refresh`. Verify no other caller passes `callLLM`. Commit `phase-7b(cli): drop memory refresh LLM-synthesis blocks (AC3a)`.
   - 3b: remove orphan LLM paths in `area-memory.ts`. Update tests. Commit `phase-7b(core): remove orphan area-memory LLM paths (AC3b)`.
   - 3c: remove misleading hint in `status.ts:426`. Commit `phase-7b(cli): remove misleading memory-refresh hint (AC3c)`.
6. **AC4** — write build-report's "Deferred items" section with audit reasoning (4 items: meeting-parser KEEP, brief --for DEFER, three-context KEEP, route KEEP).
7. **AC5 full test sweep** — per-file `tsx --test` on all affected + adjacent files (search, status, intelligence, area-memory, topic-memory, meeting-frontmatter, commitments, tasks, chef-orchestrator-skills).
8. **Grep sweep** for any remaining references to `arete daily` or `search --answer` across `packages/runtime/skills/`, **`packages/runtime/.claude/commands/`** (per R-missing-1), and `docs/`. Document findings in build-report.
9. **Rebuild dist**. Commit `phase-7b(dist): rebuild after AC1-AC3`.
10. **Write build-report.md** (including AC4 deferred items section + R4 grep findings + grep sweep findings).

Eng-lead review at end. Fix-ups if needed. Merge to parent.

## Open questions / parking lot

- After 7b ships, the 4 deferred items (meeting-parser KEEP permanent; three context services KEEP defer; route KEEP unless John reverses; brief --for LLM DEFER to follow-on) are documented closed unless John surfaces a reason to revisit.
- The `brief --for` LLM-branch removal is the one item worth a follow-on phase (Phase 7c?) — touches skill-command generator + every `requires_briefing: true` skill template + docs. Worth scoping after Phase 8 ships (so chef pattern is fully mature) and before any Phase 6 schema work.
- Cumulative ledger turns negative on code after 7b. This satisfies the parent plan AC8 ≤0 target without invoking substitution argument.
