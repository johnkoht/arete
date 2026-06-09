---
title: "Phase 8 followup-2 — brief --for LLM-branch removal"
slug: phase-8-followup-2-brief-llm-removal
created: "2026-05-31"
revised: "2026-05-31 — post review-1"
parent: arete-v2-chef-orchestrator
owner: meta-orchestrator (Claude)
status: revised-post-review-1
---

## Revisions from review-1 (eng-lead, 2026-05-31)

- **C1 [med]** — Keep `--raw` as hidden no-op for one phase instead of removing. ~3 LOC cost; eliminates R4 entirely.
- **C2 [low]** — AC4 may be no-op for review-plan SKILL.md (currently already neutral). Hedge the AC; collapse to docs-only if SKILL.md doesn't need changes.
- **C3 [med]** — Skeptical-view reframed. Real load-bearing concern: `assembleBriefing` returns kitchen-sink payload designed to be LLM-collapsed (formatBriefingMarkdown includes entity relationships, memory hits, gaps, etc.). review-plan was implicitly tuned for the post-collapse digest. AC4 expanded with explicit "ignore non-review-relevant sections" guidance for review-plan SKILL.md.
- **C4 [low]** — R-grep step extended to walk `.claude/commands/*.md` files for `.synthesis` / `.synthesized` jq-style parsing.
- **LOC truth**: actual removal is ~-275 to -325 LOC (reviewer's count); plan's -205 was conservative. Cumulative becomes more negative.

# Phase 8 followup-2 — brief --for LLM-branch removal

## Why this exists

The deferred Phase 5 absorbed-remove from 7b's audit. Parent plan (Phase 5 section, now subsumed) called for: `brief --for` LLM branch becomes a skill; only `brief --raw` stays as Core primitive. The 2026-05-15 parent-plan decision log entry confirms: "`brief --raw` stays as Core primitive; `brief --for` LLM branch becomes a skill."

7b's pre-scope audit verdict was DEFER because the removal touches the skill-command generator at `skill-commands.ts:22` + every `requires_briefing: true` skill template + docs. The audit (2026-05-29) recommended this be "its own follow-up that touches skill generators in one coherent change."

Phase 8 has now shipped (the user-felt-win phase is in soak). With the chef pattern fully mature, it's the right time to do this cleanup.

**One-line goal**: `arete brief` returns raw assembled context only. The LLM-synthesis branch + dependent reporting + generator coupling are removed; raw assembly is preserved as a Core primitive.

## Scope discovery (informs ACs)

Code-read findings:

- **CLI surface**: `packages/cli/src/commands/intelligence.ts:822-936` — the `brief` command. Lines 868-887 are the LLM-synthesis branch (`if (useAI)` calling `synthesizeBriefing`). Lines 914-933 are the synthesis-vs-raw display branch. Lines 902-904 are `synthesized` / `truncated` / `synthesis` JSON fields.
- **Service**: `packages/core/src/services/intelligence.ts` exports `synthesizeBriefing`. Callers: only `intelligence.ts:937` (CLI) + `intelligence-brief.test.ts` (test).
- **Generator**: `packages/core/src/generators/skill-commands.ts:22` emits `arete brief --for "$ARGUMENTS" --skill ${skill.id} --json` for any skill with `requires_briefing: true`.
- **Skills using requires_briefing**: ONE skill — `packages/runtime/skills/review-plan/SKILL.md`. Docs (`packages/runtime/skills/README.md`, `_authoring-guide.md`) explain the convention.

So scope is bounded: 1 CLI command branch, 1 service method, 1 generator line, 1 skill metadata flag, 2 doc files.

## Scope (acceptance criteria)

### AC1 — Remove LLM-synthesis branch from `arete brief` (GATE)

`packages/cli/src/commands/intelligence.ts:822-937`:
- Remove the `useAI` branch and `synthesizeBriefing` call (lines 868-887)
- Remove the synthesis-vs-raw display branch — always show raw briefing markdown (lines 914-933)
- Remove `synthesized` / `truncated` / `synthesis` JSON fields (lines 902-904)
- Keep `--for` flag (mandatory; describes the query)
- **Keep `--raw` as hidden no-op (per C1)**: `.option('--raw', { hidden: true })` — accepts the flag without error, logs a one-line stderr note "(--raw is the only mode now; flag accepted for backward compat)". Cost ~3 LOC; eliminates R4 (script breakage).
- Keep `--skill` and `--primitives` flags (still used by assembleBriefing)
- Keep `--json` flag (output shape just loses three fields)
- Update help text to reflect "assembles raw context for a topic; downstream consumers (chef agents) apply judgment."

### AC2 — Remove `synthesizeBriefing` from IntelligenceService (GATE)

`packages/core/src/services/intelligence.ts`:
- Remove `synthesizeBriefing` method (and any helper functions used only by it)
- Remove related types (`SynthesizeBriefingResult` or similar) if exclusively used by the removed method
- Remove `assembleBriefing` LLM-related comments / docs

`packages/core/src/services/index.ts`:
- Remove `synthesizeBriefing`-related re-exports if any

`packages/core/test/services/intelligence-brief.test.ts`:
- Remove tests of the synthesizeBriefing path; keep tests of assembleBriefing

### AC3 — Update skill-command generator (GATE)

`packages/core/src/generators/skill-commands.ts:22`:
- Generated command still emits `arete brief --for "$ARGUMENTS" --skill ${skill.id} --json` (no behavior change at template-emit time — the CLI now returns raw, that's it)
- Update any comment in the file explaining what `requires_briefing: true` produces (now: raw context assembly, not LLM-synthesized briefing)

If the generator currently has logic that depends on the deleted `synthesized` JSON field, update it. (Verify during build.)

### AC4 — Update `requires_briefing: true` skill + docs (GATE — hedged per C2 + C3)

**Per C2**: review-plan SKILL.md may already be neutral on synthesis-vs-raw. Build sub-orch reads it first and decides — if the prose doesn't reference LLM-synthesized briefing, AC4's review-plan touch collapses to a focused addition (per C3 below) rather than a full rewrite.

**Per C3 (load-bearing)**: `assembleBriefing` returns kitchen-sink payload via `formatBriefingMarkdown` — entity relationships, memory hits, gaps, context files, etc. This shape was designed to be LLM-collapsed downstream. review-plan was implicitly tuned during the synthesis era to act on a 5-bullet digest. Post-removal, it receives the raw kitchen sink and must filter.

`packages/runtime/skills/review-plan/SKILL.md`:
- Add explicit prose telling the skill to **focus on the plan/proposal under review** and **ignore non-review-relevant sections of the briefing payload** (memory hits, entity relationships, gap reports — those exist for other consumers like context-aware extraction; for review-plan they're noise). The skill applies its own judgment on what's actionable for plan review.
- If SKILL.md already says "Read the plan, apply checklist, devil's advocate" without referencing briefing shape, the addition is one paragraph. If it references the synthesized briefing explicitly, broader rewrite.

`packages/runtime/skills/_authoring-guide.md`:
- Update the `requires_briefing` flag documentation: clarify that it triggers a raw-context-assembly command emit, not LLM synthesis.

`packages/runtime/skills/README.md`:
- Same — update any reference to `arete brief --for` returning synthesized briefing.

### AC5 — Tests (GATE)

Per-file `tsx --test`:
- `intelligence-brief.test.ts` — synthesizeBriefing tests removed; assembleBriefing tests retained.
- `chef-orchestrator-skills.test.ts` — no expected changes (review-plan isn't a chef-pattern skill).
- Regression check on all CLI/core test files affected.

### AC6 — Discipline ledger

Per parent plan AC8: net delta ≤ 0.

| Item | LOC removed |
|---|---|
| `arete brief` LLM-synthesis branch (CLI) | ~70 |
| `synthesizeBriefing` service method | ~60 |
| `intelligence-brief.test.ts` synthesis tests | ~80 |
| review-plan / docs updates (net) | ~-10 to +20 (prose change, may net add depending on rewrite) |
| Generator template comment updates | ~5 |
| **Net** | **~-205 LOC code-only** |

Cumulative 7a+7b+8+8.followup-1+8.followup-2: 7a (+606) + 7b (-775) + 8 (0 src) + 8f1 (~+20 src) + 8f2 (~-205) = **~-354 LOC code-only**. Solidly negative; satisfies AC8 without substitution argument.

### AC7 — Rollback path

`git revert <build commit(s)>` cleanly restores the LLM-synthesis branch + service method. No SKILL.md prose drift since `review-plan` rewrites are small.

If post-removal the `review-plan` skill produces low-quality output without LLM-synthesized briefing context, revert + reassess.

## Skeptical view (per parent plan principle #9 — reframed per C3)

**Strongest case against (reframed per review-1 C3):**

"`assembleBriefing` returns kitchen-sink payload via `formatBriefingMarkdown` — entity relationships, memory hits, gaps, context files. This shape was DESIGNED to be LLM-collapsed downstream into a focused digest. review-plan was implicitly tuned during the synthesis era to act on that 5-bullet digest. The Phase 2 chef-rewrite WIN (daily-winddown, week-plan, etc.) worked because those skills fetch FOCUSED source data (meetings today, calendar, commitments) — not the cross-workspace kitchen-sink that `assembleBriefing` produces. Removing the synthesis without re-tuning review-plan means the skill receives a payload it was never designed to filter, and output quality drops on the very first invocation post-merge."

**Counter:**
1. **The parent plan was explicit** in May 2026 that this is the right direction (`brief --for` LLM branch → skill, not Core primitive). The principle: minimal LLM-judgment in CLI primitives; LLM judgment lives in agent context.
2. **Phase 2 chef-rewrite** demonstrated the pattern works for focused-data skills. Generalizing to kitchen-sink skills requires explicit guidance — AC4 now adds that guidance for review-plan ("ignore non-review-relevant sections; focus on the plan under review").
3. **`review-plan` is one skill.** If it needs further tuning post-removal, that's a small bounded follow-up (within the same merge or fast-follow). The alternative (keep CLI LLM-synthesis indefinitely) violates Principle 1.
4. **Raw assembled context is bounded** by `assembleBriefing`'s budget logic. Even kitchen-sink output won't exceed prompt window.
5. **AC4's explicit "ignore non-relevant sections" prose** is the safety net the original plan missed.

**Risks** (R1-R5 enumerated in pre-mortem):
- R1: review-plan quality drops post-removal even with AC4's added guidance
- R2: Audit missed a `synthesizeBriefing` consumer
- R3: Generator emit path changes inadvertently
- R4 (RESOLVED per C1): `--raw` flag kept as hidden no-op
- R5 (NEW per C4): JSON consumer parsing dropped fields. R-grep step covers this.

## Phase plan requirements

- **MC1 (gates vs stretch)**: All ACs are gates. No stretch — bounded scope.
- **MC2 (per-skill rollback)**: `review-plan` is prose-only post-MC5 sunset; `git revert` is rollback.
- **MC3 (shadow validation)**: not applicable — bounded code removal.
- **MC4 (PATTERNS.md ship first)**: N/A — no new pattern.
- **MC5 (legacy interaction)**: N/A.

## Build orchestration

Sub-orchestrator runs in manually-created sub-worktree per Phase 3+ pattern.

Branch: `worktree-phase-8-followup-2-brief-llm-removal`
Worktree path: `.claude/worktrees/phase-8-followup-2-brief-llm-removal`

Steps:
1. **Pre-flight**: verify base + 8f1 commit `a9db035e` reachable.
2. **R-grep BEFORE removal** (per C4 expanded): grep `packages/`, `docs/`, runtime for:
   - Consumers of `synthesizeBriefing`
   - Code reading `synthesized` / `truncated` / `synthesis` JSON fields
   - `.claude/commands/*.md` files for `.synthesis` or `.synthesized` jq-style parsing in any workspace
   - Any skill template referencing the synthesized output shape
   Halt + escalate if any non-test consumer found.
3. **AC1 build** — CLI brief command rewrite + tests. Commit.
4. **AC2 build** — IntelligenceService.synthesizeBriefing removal + tests. Commit.
5. **AC3 build** — skill-commands.ts generator comment update (if needed). Commit.
6. **AC4 build** — review-plan SKILL.md + _authoring-guide.md + README.md updates. Commit.
7. **AC5 full test sweep** — per-file `tsx --test` on affected + adjacent.
8. **Rebuild dist**. Commit.
9. **Write build-report.md**.

Eng-lead review at end. Fix-ups if needed. Merge to parent.

## Open questions / parking lot

- Whether to keep `--raw` flag as deprecated no-op or remove it. Lean: remove (it's now meaningless). Sub-orch decides during build based on whether commander supports easy deprecation.
- If `review-plan` quality drops materially post-removal, document as a future "review-plan re-tune" follow-up. Don't block 8f2 ship on that.
- The `synthesized` / `truncated` fields in `arete brief --json` output are dropped. If any external script reads those, it'll get `undefined`. Plan accepts this — JSON consumer breakage is bounded by who actually uses these fields (likely zero non-Areté consumers).
