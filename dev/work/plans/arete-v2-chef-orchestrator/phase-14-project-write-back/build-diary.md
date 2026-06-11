# Build Diary — phase-14-project-write-back

> Suborchestrator's running log. Written for John catching up over coffee: what happened, what was decided, why. Newest entries at the bottom.

---

## 2026-06-11T01:40Z — Ship started (Phase 0)

Suborchestrator online in worktree `agent-a0e5ef1fddde3721c` (branch `worktree-agent-a0e5ef1fddde3721c`). **The stale-base trap fired for the third launch in a row**: worktree was cut at `74370a1e` (pre-phase-13). Fast-forwarded to `24b0f816` (Merge phase-13) per parent instructions; `packages/core/src/services/meeting-area.ts` confirmed present, so the phase-13 dependencies (meetingsForArea preference, claim verb, set-area provenance) are all under me.

Orientation reading done: AGENTS.md, ship SKILL + build-log protocol, plan + review (combined 13/14 doc), phase-12 pre-mortem (binding R1/R2/R7/R10), phase-13 build diary (precedent + the 64-minute-suite lesson), MEMORY.md + collaboration.md, services + cli LEARNINGS, PATTERNS.md (chef-orchestrator envelope + extract_decisions_learnings), daily-winddown SKILL (the "proposed" surface I'm reusing), project + finalize-project SKILL.md.

**Execution-environment note (same deviation as phases 12/13, documented per protocol)**: no `subagent()` tool in this harness → direct task execution with full execute-prd discipline (phantom-task check, per-task commits, typecheck + targeted tests per gate), headless `claude -p` for independent final-review eyes. Sequential only.

Code recon (read-only) confirmed the plan's load-bearing claims, with one significant exception:

- `assembleProjectWhatsNew` (brief-assemblers.ts:1526) is read-only, uses `meetingsForArea`, compares `m.date > sinceDay` at day granularity — review finding 4 verified exactly as described.
- `retrieveWiki` (brief-assemblers.ts:539) maps `retrieveRelevant` results but **discards the score** — AC2's floor needs the score surfaced (additive field on `WikiMatch`, no consumer change).
- `applyAreaToProjectReadme` writes unconditionally — the topics writer's change-gate is genuinely net-new, as the review re-anchored.
- The 23 W4 landing-pad topic slugs are enumerated in `dev/work/plans/wiki-repair-foundation/rescue-proposal-v2.md:510` — calibration material located.
- Meetings carry `area_set_by:` provenance (meeting-area.ts) — pre-mortem seed 2's backfill-provenance hint is implementable in prose.
- **Plan-premise discrepancy found (AC5)**: `arete topic refresh` does NOT consume `items/decisions.md`. `discoverTopicSources` scans `resources/meetings/` + `resources/notes/*-slack-digest.md` only; the `relevantL2` prompt channel exists but no production caller passes it. What DOES integrate items/ entries: the project/area brief's "Decisions & learnings" section (`parseMemoryItemEntries`, Topics-bullet matched) and `arete memory refresh` (area memory pages list items as Recent Decisions pointers — mechanical, deterministic). Full treatment in the delta pre-mortem; AC5 adapts mechanism-faithfully (items/-mediated, zero new code paths — John's OQ1 decision intact) but the integration surface + prose verb change.

Build log initialized. Scope locked: Slice 0 (AC6 PATTERNS entry, FIRST commit before any skill prose — MC4), Slice 1 (AC2 refresh-topics), Slice 2 (AC1 skill + AC3 june-fixation + AC4 wall), Slice 3 stretch (AC5), wrap (AC7/8/9). New tests go in NEW files — the phase-12 zero-write test files (`project-area.test.ts`, `cli project.test.ts`) stay byte-untouched per the hard constraint.

Next: Phase 1.2 — delta pre-mortem (4 seeded risks + the AC5 finding + anything else from recon).

## 2026-06-11T01:55Z — Phase 1.2 delta pre-mortem: VERDICT no CRITICAL, proceed (one build-changing find)

Pre-mortem saved (`pre-mortem.md`, 7 risks: 4 seeded + 3 new from recon). The headline:

**D5 (NEW — plan-premise correction on AC5)**: `arete topic refresh` does not — and never did — integrate `items/decisions.md` into topic pages. Source discovery is meetings + slack digests only; the `relevantL2` prompt channel is dark (no production caller). The OQ1-approved mechanism survives in spirit (items/-mediated, standard format, idempotency scan, zero new code, R7 stays dissolved) but the substrate test + prose verb adapt: the retro's real integration surfaces are the brief's Decisions & learnings section (Topics-bullet matched, deterministic) and `arete memory refresh` area-memory pointers. Flagged for John/prime — if true topic-page integration is wanted, that's the deferred direct-writer (or wiring relevantL2), both out of scope.

Build-changing decisions from the other risks: D2 → proposals sourced from `area_set_by: backfill` meetings carry a visible verify hint (prose-pinned); D3 → empty-scan message must cite the README-mtime date + the day-granularity caveat; D6 → floor calibrated on the qmd scale, exclusion fixture designed with wide margins on BOTH backend scales; D7 → ownership-comment dedup by stable substring, not position.

Phase 1.3 skipped (`has_review: true`). Next: Phase 2.1 memory synthesis + 2.2 PRD.

## 2026-06-11T02:05Z — Phase 2 complete: memory synthesis + PRD (9 tasks)

Memory review distilled to 7 binding bullets (in prd.md): detached full suite, dual-layer zero-write assertions, CLI verb conventions, phantom-task checks, dark-code audit, memory-item live format for the retro, and the byte-frozen phase-12 test files. PRD: 9 tasks across the plan's 4 slices + wrap; prd.json mirrors. Worktree guard re-verified (`git rev-parse --git-dir` → `.git/worktrees/...`). Slice 0 next — PATTERNS entry as its own first commit, per MC4.

## 2026-06-11T02:55Z — Slice 1 in flight: core module shipped; floor calibrated on live data

Task 2 (commit 9b97f844): `project-topics.ts` core — compute (phase-12 wiki query → retrieveWiki with the new additive `score` field, floor-before-cap), slug-SET change gate, wholesale writer with substring-deduped ownership comment. 12/12 unit tests incl. counting-adapter zero-write, lossless nested-frontmatter round-trip, and BOTH R10 guards (behavioral brief-equality + source tripwire). One design addition beyond plan: `retrievalFailed` — a wiki retrieval ERROR forces `changed: false` so a transient failure can never empty a legitimate cache on `--apply` (found while writing the error-path test; without it, catch-and-empty would have cleared caches).

Task 4 (calibration, run early because the floor feeds the CLI fixtures): scored all 11 live arete-reserv projects read-only (mtime-verified untouched; 974 dirty files all predate the run). Result: **floor = 0.35 confirmed** — relevant cluster 0.41–0.76, weak tail 0.29–0.32, thin-corpus projects cache NOTHING (the review-finding-3 behavior). Honest finding for John: only 2 of the 23 W4 landing pads surface for any current active project (declination-letters 0.376 kept; funds-diversion-risk 0.322 below floor) — most landing pads' feeding projects are archived/renamed, which is published-doc-sync signal, not a floor defect. Full table in build-report.md. First stumble: ran the script with cwd at the worktree and got zero results everywhere — qmd returns workspace-relative paths and storage.read resolved them against the wrong cwd (the exact LEARNINGS trap, now felt firsthand).
