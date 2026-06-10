# Build Diary — phase-12-projects-first-class

> Suborchestrator's running log. Written for John catching up over coffee: what happened, what was decided, why. Newest entries at the bottom.

---

## 2026-06-10T06:11Z — Ship started (Phase 0)

Suborchestrator online in worktree `agent-a4515b3b04126e6e0` (branch `worktree-agent-a4515b3b04126e6e0`). Verified worktree isolation (`git rev-parse --git-dir` → `.git/worktrees/...`, not plain `.git`).

**First surprise, resolved**: the worktree branch was cut at `74370a1e` — one commit before your amendment commit (`619b621c`). The plan I had was `status: draft` with no Amendment section. Fast-forward merged `619b621c` into the branch (shared object DB; main repo working tree untouched). Now have the approved plan + amendment + your rescue checklist.

Orientation reading done: AGENTS.md, ship SKILL + build-log-protocol + orchestrator.md, subagent-dispatch standard, learnings-protocol, review-plan SKILL, plan + amendment + pre-mortem, memory/MEMORY.md + collaboration.md.

**Execution-environment note (deviation from dispatch protocol, documented per its own rules)**: this harness has no `subagent()` tool (that's the pi environment; here I have Bash/Read/Edit/Write + `claude` CLI). Per `.pi/standards/subagent-dispatch.md` pre-flight, the sanctioned fallback is "continue as single agent" — but I can do better: I'll dispatch headless `claude -p` runs for the independent reviews (cross-model review, final review) so review eyes stay separate from builder hands, and execute development tasks directly myself with the full execute-prd discipline (per-task commits, typecheck + targeted tests per task, phantom-task detection, dark-code audit). Sequential only, per collaboration.md hard constraint. If headless dispatch proves flaky I fall back to self-review with the reviewer role prompt and say so here.

Build log initialized at `dev/executions/phase-12-projects-first-class/build-log.md`.

Scope locked from amendment: **Slices A+B+C only** (AC1, AC2, AC3, AC4, AC6, AC10, AC11, AC12). No AC5/AC7/AC8/AC9, no scaffolding for them. AC11 is the hard gate: glance-2-mvp brief section count 1 → 4+ or STOP.

## 2026-06-10T06:25Z — Phase 1.3 dispatched + recon + AC11 baseline

**Phases 1.1/1.2 skipped** (plan saved + `status: approved`; `has_pre_mortem: true`).

**Cross-model review dispatched**: headless `claude -p` on **opus** (different model from me) with the review-plan skill protocol, the plan+amendment+pre-mortem, verified code refs, and both expertise profiles. Running in background; gate decision when it returns.

**Recon (phantom-task check, execute-prd Phase 0)** — all in-scope work is real, nothing already exists:
- Premise re-verified against live workspace (read-only): `arete brief --project glance-2-mvp --json` → **2 sections** (`Project context`, `Related wiki pages`). The three area-gated sections (Recent activity / Open work / Decisions & learnings) are dark. README has the prose `**Area**:` line at L22, no `area:` frontmatter. Exactly as the plan claims. **AC11 baseline = 2 sections** (plan said "1" — it undercounted the wiki section that doesn't need an area; gate target stays 4+).
- `packages/cli/src/commands/` has NO `project.ts` — AC2/AC3 CLI group is greenfield. CONFIRMED.
- `readProjectBySlug` (:927) + `listActiveProjects` (:897) both read `area` only from `fm.area`. CONFIRMED (line refs match amendment).
- `arete commitments backfill-area` (commitments.ts:328-461) is the exact preview/--apply/--reset + provenance + 0.7-floor pattern to mirror. CONFIRMED reusable.
- `EntityService.resolveAll(reference, 'project', paths, limit)` (entity.ts:975) already returns scored candidates — AC3 disambiguation needs no new resolver, just surface top-N. CONFIRMED reusable.
- `StorageAdapter.getModified(path)` exists — "what's new since README mtime" needs no fs calls in services. CONFIRMED.
- Frontmatter parse/serialize round-trip pattern exists (`meeting-lock.ts` parseYaml/stringifyYaml) — backfill `--apply` follows it; no new YAML machinery.
- `brief-project.test.ts`, `area-parser.test.ts`, `chef-orchestrator-skills.test.ts` all exist — extend, don't create parallel suites.

**Worktree env**: fresh `npm install` (no symlink — hygiene-pass lesson). Baseline `npm run typecheck` green; `brief-project.test.ts` green (fail 0).

## 2026-06-10T06:30Z — Phase 2.1 memory review (synthesis)

Sources: memory/MEMORY.md (last-14-day entries + keyword matches), collaboration.md, services LEARNINGS.md, cli/commands LEARNINGS.md. Actionable synthesis for this build:

1. **Dark-code is my recurring failure mode** (topic-wiki 2026-04-23, services LEARNINGS): every new export needs a production call-site before wrap; the dark-code audit (Phase 4.3) is a distinct gate from tests.
2. **Per-file `tsx --test` is structurally blind to cross-file conflicts** (2026-06-08 entry): run the FULL suite before wrap, not just touched files.
3. **No direct `fs` in services; tests for memory ops use real fs + StorageAdapter** (services LEARNINGS + plan): `getModified()` covers mtime needs; temp dirs unique per test run (`pid+Date.now()`).
4. **CLI conventions are load-bearing** (cli LEARNINGS): `findRoot()` guard, `--json` complete in ALL exit paths, formatters.ts helpers, register in index.ts; new commands must be routable (`arete route`) and documented in `.agents/sources/*/cli-commands.md` + AGENTS.md rebuild.
5. **Embed pre-mortem mitigations in each task; sequential execution; per-task commits** (collaboration.md; W4 watchdog lesson).

## 2026-06-10T06:48Z — Phases 1.3 → 2.3 complete; entering build

**Gate decision (Phase 1.3): PASS.** Cross-model reviewer (opus, fresh context) returned **Approve with suggestions** — zero structural blockers, 5 suggestions. All five folded into the PRD as task-level ACs: (1) mtime mechanism — actually already exists (`StorageAdapter.getModified`), reviewer missed it, corrected in review.md; (2) qmd refresh + `--skip-qmd` on backfill `--apply`; (3) permissive prose-regex + variation tests; (4) archived-project handling on open; (5) `--json` everywhere. The reviewer's devil's-advocate flagged a sharp one: a *partial* regex mismatch could pass a naive section-count gate while serving wrong-area content — so the AC11 gate now ALSO asserts `metadata.area === "glance-2-mvp"`, not just section count.

**PRD**: 9 tasks. Slice A = tasks 1-4 (read-path parser, AC6 line, skill prose, AC11 gate). Slice B = task 5 (backfill CLI). Slice C = tasks 6-8 (open flow, AC4 brief, /project skill). Task 9 = AC10/AC12 wrap-tier. Execution state initialized at `dev/executions/phase-12-projects-first-class/`.

**Execution mode note**: I (suborchestrator) implement tasks directly with the full execute-prd discipline — recon done, mitigations embedded per task, per-task commits, typecheck+targeted tests each task, full suite at wrap, independent reviewer passes via headless claude at slice boundaries and final review. Rationale in 06:11Z entry (no subagent() tool in this harness; sequential-only constraint honored either way).

## 2026-06-10T07:05Z — Slice A complete; AC11 HARD GATE: **PASS**

Tasks 1-3 shipped (commits 77e10373, a15f9c69, 116f5e18): priority parser + AC6 note + creation-time proposal prose.

**AC11 numbers (read-only runs against /Users/john/code/arete-reserv):**
- `arete brief --project glance-2-mvp` — **before: 2 sections** (Project context, Related wiki pages), no area. **After (worktree build): 5 sections** (Project context, Recent activity (10), Open work (2), Decisions & learnings (139), Related wiki pages (2)), `metadata.area = glance-2-mvp`. Gate required ≥4 + correct area → **PASS**.
- Workspace untouched: `git status --porcelain` byte-identical before/after (488 lines both).

**MC3 shadow (all 11 live projects, before → after):** adjuster-shadowing-discovery 0→0 (no README at standard path — pre-existing), ai-tooling 0→0 (same), claims-review-generator 2→2, claims-workspace-discovery 0→0 (same), glance-2-mvp 2→5 ✦, glance-comms 2→2, inbound-emails-prd 4→5 (had fm.area already; picks up an extra populated section), notion-refactor 0→0 (same), product-analytics-playbook-project 1→1, status-letter-automation 5→5, task-management-v1 1→2 (wiki retrieval variance, no area claimed). **No project regressed; nothing mislabeled** — the parser only resolved an area where a real signal exists (glance-2-mvp's prose line). The wrong-area failure mode the reviewer worried about did not appear.

Proceeding to Slice B (backfill CLI).

## 2026-06-10T07:45Z — Slices B+C complete; wrap-tier underway

**Slice B (task-5, 65b6b768)**: `arete project backfill-area` shipped — preview default, 0.7 floor, `--apply` (yaml round-trip, body + nested `notion:` block preserved — tested), `--reset` scoped to backfill provenance, `--json` everywhere, qmd refresh + `--skip-qmd` per review suggestion #2. Core helpers in new `project-area.ts` (115 LOC).

**Slice C (tasks 6-8, 8f759add / 88a790a8 / 17c1f87f)**: AC4 brief upgrades (wiki query += Key Questions/Background first lines; Open work = projectSlug-claimed ∪ unclaimed-area commitments with sibling-claimed excluded; Sibling projects section, archived labeled). AC3 `arete project open` — tie → top-N (R5, never auto-load), archived → read-only note (review #4), what's-new via `storage.getModified` (meetings/topics/commitments after README mtime). **Zero-writes proven two independent ways**: counting StorageAdapter (0 write/append/delete during assembly) AND full workspace tree snapshot byte-identical across an end-to-end CLI open. `/project` skill prose with the no-LLM-in-data-path + read-only rules locked by 5 prose tests.

**One deviation worth noting**: executed task-7 before task-6 (open consumes the AC4 commitment union) — pure ordering, no scope change. And one small correctness catch beyond plan text: the plan's sibling regex `\]\(\.\.\/([\w-]+)\/` would have ALSO matched `../../../areas/...` links if generalized for depth (the reviewer asked for depth tolerance); resolved by locking to single-depth + bare-dir links — areas links can't be siblings.

**Wrap-tier so far**: dark-code audit CLEAN (all 9 new exports have production call-sites). cli-commands.md + AGENTS.md rebuilt (12.7KB; was already over the 10KB threshold pre-change, +0.6KB). Routability verified in a fresh worktree install: "open project glance with context" → routes to `project` skill. Rollback doc written (rollback.md). Full suite + independent final review (opus) running in background.

## 2026-06-10T08:15Z — WRAP: all gates green, stopping at ship 5.5 as instructed

**Full suite**: 4578 tests, **4576 pass, 0 fail**, 2 pre-existing skips. Typecheck green.

**Final review (independent opus, fresh context): VERDICT READY.** It verified every pre-mortem mitigation in code (R3 floor at project.ts:32/:104, R5 tie logic, R6 prose, R9 divergence, R4 plural tolerance), confirmed zero invariant violations (no fs in services, no --json gaps, findRoot guards present) and a **clean scope boundary** — no AC5/7/8/9 scaffolding anywhere. Its single note (cosmetic DRY: `displayTitle` duplicated `projectDisplayName`) I fixed anyway (a936d42e) since it was a 2-minute dedupe.

**Final AC11 with the shipped dist: glance-2-mvp brief 2 → 6 sections** (the AC4 sibling section joined the original five), `area: glance-2-mvp`, live workspace hash byte-identical before/after every read-only run.

**Wrap checklist** (manual /wrap — extension not in this harness): memory entry + index ✓, services LEARNINGS ✓ (area-resolution invariant + zero-write test pattern), capabilities.json `project-cli` ✓, cli-commands.md + dist/AGENTS.md rebuilt ✓, routability ✓ ("open project glance with context" routes to the new `project` skill in a fresh install), rollback.md ✓, dist current in every commit (discovered the typecheck script EMITS — dist never went stale).

**LOC accounting (AC11 ledger, honest)**: src +842/−7 (≈608 logic + ≈234 JSDoc/blank), tests +1292, skill prose +104. Plan estimated ~+240 for A+B+C — we're ~2.5× over on logic lines. Why, itemized: the plan's per-AC numbers were thin against the precedent being mirrored (`commitments backfill-area` alone is ~130 CLI lines; AC2 estimated 90 for the same shape plus README round-trip helpers), and the cross-model review added real surface the estimate never contained (qmd wiring, archived handling, top-N disambiguation output, divergence warnings, --json completeness in every exit path). Substitution argument intact: nothing parallel was built — AC1 lights up dead code, AC4 re-wires existing filters, AC2/AC3 reuse suggestAreaForMeeting/resolveAll/getModified. Zero speculative code; dark-code audit 0.

**Stopping here per briefing**: ship 5.6 (merge gate) and Phase 6 (cleanup) belong to the prime orchestrator. Branch `worktree-agent-a4515b3b04126e6e0` is ready for the gitboss pass. Post-merge operational order is in the amendment (live AC11 verify → restructure → re-audit → backfill preview → John approves --apply).
