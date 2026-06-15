# Build Diary — plan-context-injection

Autonomous overnight build. PM + eng lead: Claude (main loop). Regroup: morning of 2026-06-15.

John's directive (2026-06-14 evening):
1. Spawn eng lead for a thorough plan review (with expert profiles).
2. Incorporate ALL their changes; ensure solid ACs + testing strategy.
3. Run `/ship` to build+ship in a worktree; act as PM/eng lead, delegate to suborchestrator, provide feedback.
4. Only approve the build once thoroughly tested.
5. Leverage arete-reserv project READ-ONLY (do not write/overwrite anything there).
6. Want a test comparing the spike agendas (pre-build) with post-build outputs.
7. Keep this diary. Regroup in the morning.

Guardrails in force:
- Never switch branches in the main repo → all code execution in a worktree (ship Worktree Guard).
- arete-reserv is READ-ONLY. No writes, no commits there.
- Commit dist/ build artifacts (user installs from GitHub).
- Only approve once tested (spike-vs-post-build comparison is the acceptance evidence).

---

## Timeline

### 2026-06-14 evening — Kickoff
- Read build infra: `.pi/skills/ship` (Phases 0-6), `.pi/standards/ac-rubric.md`, role personas (`.pi/agents/{orchestrator,reviewer,product-manager,gitboss}.md`), expertise profiles (`.pi/expertise/{core,cli}/PROFILE.md`).
- Plan status: `draft`, `has_review: false`, `has_pre_mortem: false`. Must reach `approved` with hardened ACs before ship.
- **Action:** spawned eng-lead review agent (core+cli profiles attached) for a thorough review + drafted ACs + testing strategy.

### 2026-06-14 evening — Eng-lead review returned
- Verdict: **READY-WITH-CHANGES**. Every load-bearing code claim verified against the tree (agenda pipe broken end-to-end; `assembleBriefForProject` reads only Background+Status; scaffold never routes project section — all confirmed).
- 3 blockers before autonomous build: (a) "compose don't duplicate" framing wrong — traverse+select is NET-NEW service code, not composable; (b) doc-selection heuristic undefined → must pin a deterministic, LLM-free (jaccard+mtime) algorithm or builder smuggles in embeddings + breaks the defended `brief-no-llm` invariant; (c) zero rubric-passing ACs + no test strategy, and WS-1 acceptance leaned on READ-ONLY external arete-reserv (not a CI fixture).
- 9 concrete change requests + drafted ACs (WS-1..WS-5) + test strategy delivered. Key catches: scaffold needs a NEW `project-doc` candidate extractor (else WS-1 fails silently); pin `selectProjectDocs` signature as the WS-1 contract WS-2/3 consume; `assembleBriefForProject` is 2-arg (no options) — needs signature change; WS-5 caches a no-LLM computation (token win not actually being paid) → demote/descope; invalidate by max-mtime not content-hash; multi-project meetings + no-area projects + --json schema freeze unhandled.
- Also answered John's mid-run question: /review-plan + execute-prd + orchestrator auto-inject expert profiles by package-touched (core+cli here); pre-mortem does not (by design). Confirmed I injected both profiles into the eng lead correctly. Will set has_review:true so /ship skips redundant Phase 1.3.
- **Action:** incorporating all 9 CRs into plan.md (pin signature, deterministic heuristic, scaffold extractor deliverable, AC/test sections, descope WS-5, fix cache key, add missed risks) → then pre-mortem → approve.

### 2026-06-14 night — Pre-mortem + ship setup
- Pre-mortem returned: **0 CRITICAL** (build gate passes), 4 HIGH (R1 optional-signature, R2 selection-in-brief-assemblers, R3 candidates-reach-a-section, R5 short-title-jaccard-wrong-doc), 7 MEDIUM, 2 LOW. All mitigations embedded per-task in prd.json. Saved pre-mortem.md + review.md.
- Authored PRD directly (6 tasks: T1 selectProjectDocs service → T2 scaffold extractor+wire → T3 integration test+spike harness → T4 plan-context --week+week-plan → T5 --day+daily-plan → T6 week→daily fidelity docs). WS-5 deferred. prd.md + prd.json.
- Committed artifacts on main: d775f752 (markdown only, not code; not a branch switch — per /ship Phase 2.3).
- Created worktree `.claude/worktrees/plan-context-injection` on `feature/plan-context-injection`; PRD present.
- Worktree had no node_modules (root workspaces:none) → running `npm install` in worktree (bg b79at68to) before launching build.
- **Next:** launch suborchestrator (background) to execute PRD in worktree with HIGH mitigations + READ-ONLY arete-reserv guard; I review at gates; hold merge for John's morning spike-comparison approval.

### 2026-06-14 night — WS-1 build launched
- Deps installed (exit 0); baseline `npm run typecheck` GREEN before any build code (so failures are attributable).
- Launched suborchestrator (bg) scoped to **WS-1 = T1 selectProjectDocs service, T2 scaffold extractor+wire, T3 integration test+spike harness**. Stops after T3 for my review (mid-build gate). T4-T6 released only after I verify WS-1 + run the AC1.9 spike comparison.
- Suborchestrator briefed with: orchestrator/developer/reviewer personas, execute-prd protocol, core+cli profiles, the 4 HIGH mitigations (R1/R2/R3/R5) + R4/R8/R10/R11/R12, READ-ONLY arete-reserv (snapshot for spike), no-merge/no-push, dark-code audit, anti-gate-gaming. Progress in dev/executions/plan-context-injection/progress.md.
- **Awaiting completion notification.** On return: eng-lead review of WS-1 → spike comparison → feedback/rework → release T4-T6.

### 2026-06-15 morning — WS-1 returned GREEN-but-BROKEN; caught at the real gate
- Suborchestrator reported WS-1 done: 3 commits (6fc7efee/46e62fe3/3448742c), +24 tests, 0 new failures, invariants green, dark-code clean. Independently re-verified: typecheck green; 109/109 WS-1+invariant tests pass via tsx; integration test 1/1.
- **BUT the AC1.9 spike comparison against a snapshot of the REAL arete-reserv FAILED: "NONE — no project-doc candidate surfaced."** Diagnosed (not rubber-stamped):
  1. **Service is CORRECT** — direct `selectProjectDocs('glance-2-roadmap', …)` on real data expands `glance-1.5-roadmap.md` (the right payload) + lists all working/ docs. T1 is good.
  2. **Harness invalid** — static snapshot has no live calendar → meeting `resolved:false`, `attendees:[]` → no area → no project → selectProjectDocs never called. AC1.9-via-snapshot can't validate.
  3. **Wiring gap A** — `--project glance-2-roadmap` override yields 0 candidates when meeting unresolved; the documented escape hatch is dead when resolved:false (project section skipped entirely).
  4. **Wiring gap B** — `assembleBriefForProject` NOT wired to selectProjectDocs; `/project` + `brief --project` show a "Project context" section with no selected docs (plan required this).
- **Verdict: WS-1 NOT done.** Holding T4-T6. Sending suborchestrator precise rework: wire assembleBriefForProject (B); make --project override drive selectProjectDocs even when meeting unresolved (A); fix spike harness to drive via --project (calendar-independent) so AC1.9 is checkable + re-run until ≥1 glance-2-roadmap concern surfaces; add AC tests for both wiring paths.

### 2026-06-15 morning — Rework delegated
- SendMessage unavailable in this harness → spawned a fresh rework suborchestrator (bg) with precise diagnosis + existing commits to build on (not a rewrite).
- Scope: Defect A (--project override must drive selectProjectDocs when meeting unresolved), Defect B (wire assembleBriefForProject so /project + brief --project surface selected docs), Defect C (fix spike-compare.sh to drive via --project, calendar-independent; re-run must surface ≥1 glance-2-roadmap concern) + 2 new AC regression tests. Invariants must stay green; arete-reserv READ-ONLY; no merge.
- Awaiting completion. On return: re-run real spike comparison; if it surfaces glance-2-roadmap concerns, release T4-T6; else iterate.

### 2026-06-15 morning — WS-1 DONE + verified (rework landed)
- Rework fixed all 3 defects: A (--project drives selection on unresolved meetings, feedbf4b), B (assembleBriefForProject wired via optional projectDocBudgetChars, 0a11a214 — extracted shared buildProjectDocBullets helper, DRY), C (harness drives calendar-independent --project path, de4579ec). dist rebuilt e8cad744.
- **Independently re-verified (not rubber-stamped):** typecheck green; build green; full suite 4766 tests → 4764 pass / 0 fail / 2 pre-existing skips; invariants (brief-no-llm, brief-project) green; 112/112 targeted.
- **AC1.9 spike comparison PASSES (exit 0)** against snapshot of real arete-reserv: Dave "Jira Roadmap Sync" agenda surfaces glance-1.5-roadmap.md + README + working/ structure-model/epic, carrying concerns: capacity, parity, slice-zero, notion, jira — WITHOUT naming a file. arete-reserv READ-ONLY throughout (rsync snapshot, zero-write asserted).
- **Eng-lead notes for John:** (1) selectProjectDocs flags the real glance doc `[low-confidence]` (score 0.306) — correct doc picked but weak relevance on the 2-token title (pre-mortem R5 partially materialized); service is frozen this ship → TUNING FOLLOW-UP, not a blocker. (2) Defect-B budget hardcoded 12k at 2 CLI sites → asked T4 to introduce a named default.
- **WS-1 accepted.** Released T4 (plan-context --week + week-plan), T5 (--day + daily-plan), T6 (week→daily fidelity docs) to a suborchestrator (bg). R7 resolved: openQuestions[] = extract /open questions/i section from expanded doc bodies (option a). Merge still held for John.

### 2026-06-15 morning — T4-T6 built; WS-2 --week budget gap found at real-data gate
- T4-T6 committed (6be2d797/625d2493/9909d98a). typecheck green; full suite 4784→4782 pass/0 fail; 18/18 new tests; R6 no-body-parsing holds (matches were comments only).
- **--project mode VERIFIED on real data:** glance-2-roadmap → 11 selectedDocs, 5 openQuestions (real ones: Financials timeline, Dual-write coverage). Excellent.
- **--week mode GAP (real data):** 6 projects, all 6 have selectedDocs but ALL listed (filename-only), 0 expanded, 0 openQuestions. Cause: PLAN_CONTEXT_PROJECT_DOC_BUDGET=8000 divided by 6 projects = ~1333ch/project < any real doc → demote-on-overflow demotes everything. Pre-mortem R9 materialized. selectProjectDocs zero-result safety is relevance-floor-based, not budget-based, so it doesn't rescue here. Frozen service is fine — fix belongs in aggregator budget allocation.
- Decision needed from John: week-plan attention allocation (deep-on-few vs shallow-across-all). Asking before the fix.

### 2026-06-15 morning — Budget fix landed; build functionally complete
- John: skip weighting/opt-out feature (test & circle back), up the token counts.
- Found the real flaw via real-data probe: WS-1 does whole-doc-or-nothing expansion, so under a tight per-project budget only SMALL docs fit (idea-backlog 5.8k expanded; README 6k + 26k roadmap demoted to listed) → 0 open questions. Not a constant problem alone — an expansion/relevance interaction.
- Fix: replaced shared-total-divided budget with PER-PROJECT budget by mode (week 10k / day 6k), cap 12. Commits e38507a3 + dist 182c048d. typecheck green; full suite 4784→4782 pass / 0 fail.
- **Real-data --week now surfaces open questions:** glance-2-roadmap 5 OQ (Financials timeline…), glance-2-runyon 6, email-signatures 6. Motivating case works.
- Known follow-ups (NOT blockers, test-and-circle-back): (1) project weighting (driving vs reference — recency alone misclassifies recently-edited reference projects like adjuster-shadowing 6.9d); (2) large-doc (>budget) partial expansion / always-extract-OQ so a 26k roadmap doc's own OQ surfaces; (3) selectProjectDocs low-confidence on short meeting titles (R5); (4) WS-5 disk cache (deferred); (5) package-lock.json 0.15.1→0.16.0 drift (pre-existing) — glance at merge.
- **Merge HELD for John.** arete-reserv READ-ONLY throughout (rsync snapshot to /tmp; zero-write asserted). Nothing merged/pushed.

### 2026-06-15 — Wrap + gitboss gate + reconcile with main
- Wrap done (feature branch dde4b62e): 5-section build memory entry + 4 LEARNINGS gotchas + MEMORY.md index. typecheck green, tree clean.
- Reset the trivial package-lock 0.15.1→0.16.0 drift for a clean feature merge (version-sync left as a main-level backlog item).
- **Gitboss REFUSED the first merge (correctly):** branch was 7 commits behind main — v0.17.0 (bb7820e4) shipped to main CONCURRENTLY during the overnight run (Active Topics + skill-router work), plus my diary/backlog commits. 2 conflicts, both committed dist sourcemaps (intelligence.*.map). Diff review otherwise clean (58 files, +4442/-101, coherent). Version recommendation revised to 0.17.0→0.18.0.
- **Reconciled:** merged main into feature (93832149). Only conflicts were the 2 dist .map files (gitboss called it exactly); source/MEMORY/LEARNINGS auto-merged. Resolved by `npm run build:packages` (regenerate dist, never hand-edit sourcemaps) + stage. Version now 0.17.0 (from main).
- **Re-verified:** typecheck green; full suite 4791→4789 pass/0 fail (ran per the "full suite after merging main into a long-lived branch" learning — no cross-file semantic break); AC1.9 spike-compare PASSES post-merge (capacity/parity/slice-zero/notion/jira). Tree clean.
- Re-invoking gitboss for the merge gate. Release (0.18.0) held for John's explicit confirmation (outward-facing).

### 2026-06-15 — SHIPPED v0.18.0 ✅
- Gitboss re-gate PASSED: merged `feature/plan-context-injection` → main `--no-ff` (00316fc3), conflict-free, unrelated files untouched.
- Release: bumped 3 package.json 0.17.0→0.18.0, CHANGELOG [0.18.0], rebuilt dist (no version-embedded changes), commit 910d0c91, tag v0.18.0.
- **Pushed to origin/main (e66932fe..910d0c91) + tag v0.18.0.** Live.
- Cleanup: worktree removed, feature branch deleted (merged), /tmp snapshot removed.
- Pre-existing unrelated dirty files (web-ui-enhancements.md, winddown-approval-doc/) left untouched throughout.
- Follow-ups parked in dev/work/backlog/plan-context-injection-followups.md (weighting, large-doc partial expansion, low-confidence tuning, WS-5 cache).
