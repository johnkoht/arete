---
title: "Pre-mortem — wiki-repair-foundation"
plan: dev/work/plans/wiki-repair-foundation/plan.md
run: 2026-06-09 (gate run; builds already in flight — W1+W5, W6, W4 analysis)
protocol: .pi/skills/run-pre-mortem/SKILL.md + .pi/standards/pre-mortem-categories.md
stance: weighted toward risks catchable at MERGE TIME or mitigable in-flight; review-1 concerns NOT duplicated
verdict: PROCEED WITH MITIGATIONS (no build needs stopping; 3 in-flight instruction injections needed NOW)
---

# Pre-Mortem: Wiki repair — foundation fixes

All file:line refs verified against main @ b373703e and live workspace `/Users/john/code/arete-reserv` (read-only) on 2026-06-09. In-flight state checked: `fix-wiki-w1-w5` (no diff yet), `fix-wiki-w6` (uncommitted edit to `brief-assemblers.ts`), `wiki-rescue-analysis` (uncommitted `scripts/rescue-analysis.ts`).

---

### Risk 1: W5 and W6 collide in brief-assemblers.ts — the plan's "disjoint file sets" claim is FALSE

**Category**: Integration / Dependencies. **Likelihood: HIGH (verified live). Impact: MEDIUM.**

**Problem**: The plan's sequencing note says "{W1+W5}, {W2+W3}, {W6} are disjoint file sets." Verified false: W5's staleness display ("brief wiki sections … show `last_refreshed`") lands in the wiki-bullet rendering at `brief-assemblers.ts:754-767`, `:1009-1021`, `:1195+` (and likely the `retrieveWiki` result shape at `:450`), while W6 edits the SAME FILE (`MeetingIndexEntry` at `:118-129`, call sites `:944`/`:1149`, plus the decisions/learnings parser). Both worktrees are in flight in PARALLEL right now — `fix-wiki-w6` has an uncommitted edit to this file. Whichever merges second conflicts textually or, worse, semantically (W5 extending the `retrieveWiki` entry type while W6 reshapes the index in the same module).

**Mitigation**: (a) Decree merge order now — W6 merges first (it's mid-edit; W1+W5 has zero diff), W1+W5 rebases its brief-assemblers changes onto post-W6 main before merging. (b) Inject into the W1+W5 build instructions NOW: "W6 is concurrently editing `brief-assemblers.ts` — confine your staleness edits to the wiki-bullet regions (~754-767/1009-1021/1195+) and the `retrieveWiki` helper; do not refactor `buildMeetingIndex`/`MeetingIndexEntry` or anything near :118-129/:944/:1149."

**Lands**: build instruction (W1+W5, inject now) + merge-gate check MG-2.

**Verification**: At merge of the second branch: `git merge-base` is post-first-merge main; targeted brief tests green on the rebased branch; manual eyeball that staleness rendering and topics-union both survive in the merged file.

---

### Risk 2: W1's lock takeover has a TOCTOU race — two concurrent approves can BOTH take over a dead lock

**Category**: Integration / Code Quality. **Likelihood: MEDIUM. Impact: HIGH (recreates the exact corruption the lock exists to prevent).**

**Problem**: `breakSeedLock` (seed-lock.ts:109) is an unconditional `unlink`. Naive wiring (EEXIST → read info → pid dead → `breakSeedLock` → retry `acquireSeedLock`) races: two approves (chef winddown approves meetings back-to-back; backend agent can overlap) both read the dead-pid lock, both unlink, both create — and the second unlink can delete the FIRST taker's freshly-created lock, so both proceed into concurrent `refreshAllFromSources` topic-page writes (last-writer-wins data loss). Secondary mode: pid-reuse makes a genuinely stale lock look live (`kill(pid, 0)` succeeds for an unrelated process) → takeover never fires and the 6/05 failure class silently persists, now with false confidence that it's fixed.

**Mitigation**: Build instruction for W1 (inject now — worktree has no diff yet): (a) takeover = re-read lock info, verify pid dead immediately before unlink, unlink, retry the `O_EXCL` create exactly ONCE; (b) after the post-takeover acquire succeeds, RE-READ the lock file and confirm it contains own pid — if not, treat as held and surface (this bounds the double-takeover race to a harmless back-off); (c) belt-and-braces for pid-reuse: also take over when the lock's `started` age exceeds a generous threshold (e.g. >6h) even if the pid looks alive, OR at minimum surface "lock held by pid N for 6h+" loudly so it can't rot silently again. (d) Test the double-takeover interleaving (two acquirers, fake dead-pid lock) if practical; the re-read-own-pid check is the assertable invariant.

**Lands**: build instruction (W1, inject now) + merge-gate check MG-1.

**Verification**: AC1 tests pass (dead-pid takeover, live-pid refusal) PLUS the re-read-own-pid confirmation exists in the takeover path (code review at merge).

---

### Risk 3: W1 "surface loudly" changes approve's exit semantics → chef retries → double-approve

**Category**: Integration. **Likelihood: MEDIUM. Impact: HIGH (duplicate commitments/tasks on live data).**

**Problem**: The plan says stop warn-swallowing `SeedLockHeldError` and "surface loudly." At the catch (meeting.ts:1824-1830) the approved items are ALREADY committed. If "loudly" becomes a non-zero exit or a re-thrown error, any orchestration that retries failed approves (chef winddown, backend agent) re-runs approve on an already-approved meeting — duplicating commitment/task creation downstream of the hook. The skipped integration is non-fatal by design; the fix must change visibility, not control flow.

**Mitigation**: W1 build instruction: surfacing = prominent stderr output + a log.md event; exit code and thrown-error behavior UNCHANGED (approve still exits 0). Test asserts exit 0 with a held lock.

**Lands**: build instruction (W1, inject now) + merge-gate check MG-1.

**Verification**: Test exists: approve under a live-pid lock → exit 0, loud message, log event written, items committed exactly once.

---

### Risk 4: W2 approve-time LLM failure → partial state (summary written / integration skipped, or vice versa)

**Category**: Integration / Code Quality. **Likelihood: MEDIUM (LLM calls fail routinely). Impact: MEDIUM.**

**Problem**: W2 inserts `writeMeetingSummary` between `commitApprovedItems` and Hook 2 (meeting.ts:1808). Failure modes that must each be safe: (a) summary LLM call throws → if it shares Hook 2's try/catch or precedes it unguarded, it can abort approve mid-flight or skip integration entirely — items committed, knowledge dropped (the exact bug class this plan fixes); (b) summary succeeds, integration throws → summary persists, fine, but only if the summary-first read (topic-memory.ts:1241-1264) is idempotent on the NEXT integration attempt (it is — transcript-hash); (c) summary call HANGS → approve latency balloons inside winddown with no timeout. Interaction with R2: under concurrent approves, the summary write itself is lock-free file IO into `summaries/meetings/` — same-meeting double-approve would double-write the same path (overwrite-safe, acceptable), but only if the writer stays deterministic-path, no tempfile leakage.

**Mitigation**: W2 build instruction (wave 2 — write into the task prompt before it starts): summary write gets its OWN try/catch, independent of Hook 2's; on summary failure, warn + log event + proceed to Hook 2, which falls back to transcript-input (existing behavior — no summary file means summary-first read doesn't engage); apply the same LLM-call timeout discipline the approve path's other calls use. Tests: (i) summary writer throws → approve exits 0 AND integration still ran (transcript path); (ii) integration throws after summary success → summary file persists; (iii) both-succeed happy path emits the AC2 `ingest` event with `input_kind: summary`.

**Lands**: build instruction (W2 task prompt) + merge-gate check MG-3.

**Verification**: The three tests above exist and pass; code review confirms two independent try/catch blocks.

---

### Risk 5: D1 schema compat — meetings staged BEFORE the change, approved AFTER (and the gated-off fossil case)

**Category**: Integration / State Tracking. **Likelihood: HIGH (guaranteed: staged meetings exist in the live workspace at upgrade time). Impact: LOW-MEDIUM (approve crash or silent FYI loss).**

**Problem**: D1=persist introduces a `could_include` frontmatter key written at `extract --stage`, consumed+cleared at approve. Every meeting already staged when the change ships has NO such key — approve must treat absence as "no FYI section," never throw. Verified favorable: `writeMeetingApplyFrontmatter` mutates `fm` in place (meeting-frontmatter.ts:84+), so unknown keys survive other writers — the risk is purely the consumer's handling of `undefined`. Secondary fossil case: a meeting staged WITH the key but approved under `--skip-topics`/`ARETE_NO_LLM` (summary gated off) never consumes the key → fossil frontmatter accumulates and a later `meeting apply` would render FYI from stale data.

**Mitigation**: W2 build instruction: (a) MANDATORY test — approve a staged meeting with no `could_include` key → no FYI section, no error (this is the live-fleet upgrade path, not an edge case); (b) clear the key at approve even when the summary write is gated off or fails (consume-or-clear, never leave-behind), OR explicitly document the fossil and make `meeting apply`'s summary path tolerate a stale key.

**Lands**: build instruction (W2 task prompt) + merge-gate check MG-3.

**Verification**: Absent-key test exists; grep the approve path for unconditional key-clear (or the documented alternative).

---

### Risk 6: W4 alias collisions — `addAliases` has NO cross-page uniqueness check

**Category**: Code Quality / Reuse-Duplication. **Likelihood: HIGH at 211-page scale (token-overlap mining is symmetric — near-miss slugs WILL match multiple canonicals). Impact: HIGH (double-integration spend + divergent duplicate content on live pages).**

**Problem**: Verified at topic-memory.ts:1705-1756: `addAliases` dedups only within one page — nothing prevents two canonicals from claiming the same alias, and nothing prevents an alias that equals another LIVE page's canonical slug. The batch apply mines aliases mechanically across 211 pages; a collision means a source tagged with that sub-slug integrates into BOTH canonicals (duplicate knowledge, double LLM spend, divergent drift), and the canonical-slug-as-alias case creates routing ambiguity until/unless the absorbed page is archived. The worked example (`default-email-template` absorbed by `email-templates`) is exactly this shape — ordering of archive-vs-alias matters.

**Mitigation**: Inject into the in-flight W4 analysis script NOW (it's uncommitted — cheapest moment): (a) the proposal must enforce GLOBAL one-alias-one-canonical — collisions become explicit triage rows for John, never silent assignments; (b) the apply script pre-validates each alias against (i) all existing `aliases:` workspace-wide and (ii) all canonical slugs not being archived in the SAME batch, refusing on conflict; (c) for merge verdicts, archive the absorbed page BEFORE (or atomically with) adding its slug as an alias to the canonical.

**Lands**: build instruction (W4 script spec, inject now) + apply-day gate AG-1.

**Verification**: Run the apply script's validator in dry-run over the final proposal: zero collisions reported, or each one carries an explicit John verdict.

---

### Risk 7: W4 apply day mutates live pages LOCK-FREE while a refresh may be running

**Category**: Platform Issues / Integration. **Likelihood: MEDIUM (a topic refresh may be running in arete-reserv at this moment; winddowns run nightly). Impact: HIGH (torn read-modify-write — lost integrations on live pages).**

**Problem**: Verified (and flagged by the verification report): `addAliases` does a read-modify-write of the topic page with NO lock acquisition, while `refreshAllFromSources` writes the same pages under the seed lock. Apply day = hundreds of `add-aliases` + `mv` operations on live data; a concurrent winddown-triggered refresh interleaving with the batch = last-writer-wins on whole pages.

**Mitigation**: Apply-day runbook (W4 build instruction): before ANY mutation, check `readSeedLock` + pid liveness (helpers exist; W1 wires takeover) and REFUSE to start if held; preferably the apply script acquires the seed lock for the alias/archive batch and releases between refresh waves; schedule the sitting away from winddown windows (John decision: pick a time).

**Lands**: build instruction (W4 apply runbook) + apply-day gate AG-2 + John decision (scheduling).

**Verification**: Apply script's first action visibly checks/acquires the lock; runbook names the scheduled window.

---

### Risk 8: W4 "one sitting" is wall-clock-impossible if apply waits on integrations — and the cost basis just moved

**Category**: Scope Creep / State Tracking. **Likelihood: HIGH. Impact: MEDIUM (half-applied batch on live data; rushed completion under the 6/24 deadline).**

**Problem**: Fresh data the plan predates: the 6/09 catch-up integrated into 20 pages (not "a few") and `topic refresh --all` ran ~18 silent minutes for that. The frozen cohort is now **211, not 222** (live histogram: 211×2026-04-24, 20×2026-06-09). Rescue-with-aliases re-integration at observed rates (~1-2 min/integration) over a few hundred mined sources = a MULTI-HOUR apply, not a sitting. The deadline (6/24) then pressures a rushed or abandoned-midway apply: some pages aliased-but-not-refreshed, archives half-moved, index/lint never regenerated — a state the plan's per-page rollback doesn't describe how to detect.

**Mitigation**: (a) Decouple review from apply: John's sitting approves the proposal; the apply script runs as a resumable BACKGROUND batch (W5's per-page progress output is a prerequisite — see R10 sequencing). (b) The analysis script must output an exact integration count + $ + wall-clock estimate derived from its own mined-source data (it already mines candidates; this is free). (c) The apply script writes an intent/done ledger per page (intent BEFORE mutating, done after) so a half-apply is diagnosable and resumable, not forensic. (d) Recompute the frozen set at apply time (it's 211 today and will drift again) — never hardcode 222; reword AC4 to "all pages frozen at analysis time." (e) Explicit John decision: slipping past 6/24 is ACCEPTABLE (verified fallback: stale nags capped at one/winddown — nag-grade) — pre-authorizing the slip removes the incentive to rush a botched apply.

**Lands**: plan text (AC4 rewording + the 211 correction) + build instruction (W4 script + runbook) + John decision (e).

**Verification**: Proposal doc shows count/$/time estimate; apply script has `--resume` and an intent ledger; plan AC4 updated.

---

### Risk 9: Rollback ledger as specced cannot actually roll back — and refresh side effects are irreversible without a snapshot

**Category**: State Tracking. **Likelihood: MEDIUM. Impact: HIGH (no undo for a bad batch on live memory).**

**Problem**: The plan's ledger records "page → destination" for ARCHIVES only. Alias rollback "by removing the alias" assumes you know which aliases the batch added — true only while the workspace has zero pre-existing aliases (true today, false after the first partial run or any rerun). And refresh-verdict pages get their BODIES rewritten by LLM integration — removing an alias does not un-integrate; there is no inverse operation at all for the highest-volume verdict class.

**Mitigation**: (a) Ledger records the FULL mutation set: aliases added per page (exact list), archive src→dst, refresh attempted/succeeded. (b) The real rollback: pre-apply snapshot of the entire `.arete/memory/topics/` directory (`tar` or `cp -R` — 249 small md files, trivially cheap) taken by the apply script as its first act; restore = wholesale or per-page copy-back. This makes every verdict class reversible, including refreshes.

**Lands**: build instruction (W4 apply script) + apply-day gate AG-3.

**Verification**: Apply script refuses to run without a fresh snapshot path; ledger schema includes `aliases_added`.

---

### Risk 10: Deployment skew — merging to main does NOT change live behavior; apply day needs the NEW binary installed

**Category**: Dependencies / Platform Issues. **Likelihood: HIGH (it's how the install model works). Impact: MEDIUM.**

**Problem**: The live workspace runs the INSTALLED arete (dist committed; installed from GitHub) and installed skill copies. W4's apply day depends on W1's lock takeover + W5's `topic refresh` progress output being in the binary John actually runs in `arete-reserv` — merging W1+W5 to main is necessary but not sufficient. Similarly W7's skill-prose deletions (slack-digest SKILL.md:63/:248) don't stop live eval-event spend until the installed skill copy updates. A subtle version-skew window also exists for W2: meetings staged by the OLD binary and approved by the NEW one is the R5 absent-key case (covered); the reverse (staged new, approved old) leaves an unconsumed key — bounded by upgrading extract+approve in one install.

**Mitigation**: Sequencing rule in the plan: cut a release + reinstall into `arete-reserv` AFTER wave-1 (W1+W5) merges and BEFORE W4 apply day; W2/W3 ship extract+approve changes in the same release (never split across installs); W7's merge isn't "done" until the installed skill copy is refreshed.

**Lands**: plan text (sequencing) + merge-gate check MG-6 + apply-day gate AG-4.

**Verification**: `arete --version` (or equivalent) in arete-reserv shows the post-wave-1 release before apply day starts; installed slack-digest SKILL.md no longer contains `slack-thread-eval` emission steps.

---

### Risk 11: W2 and W3 both edit meeting-apply.ts — and W2 must branch from POST-W1 main (meeting.ts overlap is guaranteed-conflict territory)

**Category**: Dependencies. **Likelihood: HIGH if built as parallel worktrees. Impact: LOW-MEDIUM (conflict churn, or W3's deletion clobbering W2's also-fire context).**

**Problem**: W2 keeps/touches `writeMeetingSummary` wiring around meeting-apply.ts:387; W3 deletes :52/:85/:416-432 in the SAME file. The plan says "W2+W3 together" but doesn't say in one branch. Separately, W1 edits meeting.ts:1824-1830 and :1993 — the exact region where W2 inserts (before :1808); if W2's worktree is cut from pre-W1 main, a messy conflict in the most delicate hook code is guaranteed.

**Mitigation**: Wave-2 instruction: build W2+W3 in ONE worktree (or strictly sequential commits in one branch), cut from main AFTER W1+W5 has merged. Verify with `git merge-base` at branch creation.

**Lands**: build instruction (wave-2 task setup) + merge-gate check MG-3.

**Verification**: `git merge-base <w2-branch> main` is a commit containing W1's meeting.ts changes.

---

### Risk 12: W3/W7 deletions break a consumer the greps miss (the feedback_refactor_consumer_audit class)

**Category**: Reuse / Documentation. **Likelihood: LOW (plan already has falsifiable checklists). Impact: MEDIUM.**

**Problem**: Phase 9's lesson — the residual risk beyond the plan's grep lists is TYPED consumers (backend `agent.ts` reads `applyMeetingIntelligence`'s result; removing `orgsRefreshed` from the result type breaks compilation or, worse, an untyped access pattern) and INSTALLED-copy prose divergence (greps run in the repo; the live workspace's installed skills are a second copy).

**Mitigation**: Merge gate: build ALL packages including backend (not just core/cli) on the W3 branch; run the grep checklist against both repo AND installed skill copies for W7's prose consumers.

**Lands**: merge-gate checks MG-4/MG-5.

**Verification**: Full-workspace build green; grep checklist output attached to the merge note.

---

## Stop-a-build assessment

**No build needs stopping.** But three in-flight injections are needed NOW (today, before the worktrees advance further):

1. **W1+W5 worktree** (zero diff yet — cheapest moment): R2 lock-takeover spec (re-read-own-pid invariant), R3 exit-code-unchanged rule, R1 brief-assemblers region discipline.
2. **W6 worktree** (mid-edit): no change to its work; just the merge-order decree (W6 merges first).
3. **W4 script** (uncommitted): R6 global alias-uniqueness in the proposal/validator, R8 count/$/time estimate output + recompute-211-don't-hardcode-222, R9 snapshot+full ledger in the apply mechanics.

## Verdict

**PROCEED WITH MITIGATIONS.**

## Merge-gate checks (orchestrator runbook)

- **MG-1 (W1+W5)**: AC1 tests green (dead-pid takeover, live-pid refusal); takeover code re-reads the lock post-acquire and confirms own pid; approve under held lock exits 0 with loud message + log event; logger append-failure now warns (W5).
- **MG-2 (second of W6 / W1+W5)**: merge sequentially; second branch rebased onto post-merge main, rebuilt, targeted brief tests rerun; manual check that wiki-staleness rendering AND meetings topics-union coexist in `brief-assemblers.ts`.
- **MG-3 (W2)**: branch merge-base contains W1's meeting.ts changes; summary write has its own try/catch (integration still fires on summary failure — test exists); absent-`could_include` test exists; key consume-or-clear verified; AC2 `ingest` event asserted.
- **MG-4 (W3)**: full-workspace build including backend green; org-entity grep checklist (refreshOrgs / skipOrgEntities / orgsRefreshed / createOrgEntityManual / org-entity) returns zero hits in src+test+prose; W2+W3 combined ledger ≤ 0 (AC3).
- **MG-5 (W7)**: `slack-thread-eval` + `summaryPathForSlack` grep clean in repo; note that live spend stops only at reinstall (MG-6).
- **MG-6 (release gate, before W4 apply day)**: cut release + reinstall into `arete-reserv`; confirm installed binary has lock takeover + refresh progress; installed slack-digest skill prose updated.
- **MG-7 (integrated)**: ONE full-suite run on main at the final gate (AC7) — orchestrator-run, outside 600s-watchdog sessions.
- **Apply-day gates (W4, not a merge)**: **AG-1** alias validator dry-run shows zero unresolved collisions; **AG-2** seed-lock checked/held before mutating, sitting scheduled away from winddowns; **AG-3** fresh `topics/` snapshot taken + intent/done ledger live; **AG-4** MG-6 satisfied first; recomputed frozen set used (211 as of 6/09, will drift).
