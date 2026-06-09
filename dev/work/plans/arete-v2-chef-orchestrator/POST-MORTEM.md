---
title: "Areté v2 chef-orchestrator — cumulative post-mortem (Phases 0–12)"
slug: arete-v2-chef-orchestrator-post-mortem
created: "2026-06-08"
author: meta-orchestrator (close-out)
context: BUILD repo close-out — writes to repo memory/ + diary, NOT user .arete/ workspace
protocol: .pi/skills/prd-post-mortem/SKILL.md (adapted from single-PRD to multi-phase program)
related:
  - plan.md (parent plan + ACs)
  - diary.md (durable thread)
  - POST-MERGE-WORKLOG.md (open issues — referenced, not duplicated)
  - POST-MERGE-CHEATSHEET.md (operator reference)
  - phase-10-winddown-orchestrator/merge-test-failures-findings.md (semantic-conflict diagnosis)
---

# Areté v2 chef-orchestrator — cumulative post-mortem (Phases 0–12)

This is the final close-out for the v2 effort before it merges to `main`. It is a program
post-mortem, not a single-PRD one: the protocol's metrics/pre-mortem-table shape applies per
phase, but the program-level story is what matters here. Honest scorecard, evidence-cited,
no victory lap.

The branch built **far past** the original 7-phase plan. The plan stopped at Phase 6
(conditional schema layer). What actually shipped runs through Phase 12, with Phases 7–12
emerging from soak findings rather than the original roadmap. That divergence is itself a
finding (see *What didn't / cost us*).

---

## 1. Outcomes vs original v2 goals / ACs

| Goal / AC | Verdict | Evidence |
|---|---|---|
| **Slimmer system** (Principle 2/3: "no add without a remove", judged at the user view) | **Partially met** | Through Phase 4 the discipline held: Phase 4 removed 12 skill directories, dropping the cumulative ledger from ~+13 to **~+1** — "the first phase where cumulative ledger ≤ +2; the discipline-rule story landed" (`phase-4-skills-audit/build-report.md`). Phases 9–12 then regrew **net +13,274 production source LOC** (155 removed vs ~13.4k added). User-view simplicity (the real test per Principle 3) improved for the daily flows; code-view slimness did not survive the late phases. |
| **AC8 — adds-vs-removes ledger net ≤0** (combined across CLI verbs, skills, frontmatter fields, memory file types, services) | **Met through Phase 8; NOT met for 9–12** | Plan target was literally "≤0 through Phase 3b" (`plan.md` AC8); in practice the program held the ledger ≤0 cumulatively through Phase 8 (Phase 4 hit the negative milestone, `phase-4-skills-audit/build-report.md`). Phases 9–12 are net **+13.3k LOC** — regrowth, not substitution. Defensible (brief restored a *regressed* capability; Commitment-v2 + external-resolution are net-new substrate) but the rule was **not enforced** for 9–12. Recorded as an eyes-open accepted exception (`POST-MERGE-WORKLOG.md` I-9; diary 2026-06-08). |
| **AC10 (gating) — daily winddown median ≤15 min** (from a 30–45 min baseline) | **Partially met — improved, missed target** | Baseline was the 30–45 min the user had been living with (`plan.md` origin; Phase 0 measured it). Chef rewrite (Phase 2) drove the lived median to **~21 min** — a large, user-felt improvement ("faster, much faster") but above the ≤15 min bar. Phase 2's own AC2.9 was framed as "≤50% of baseline" and that *was* roughly met; the parent's harder ≤15 min absolute target was not. AC10 was the declared gating AC ("if AC10 fails, v2 has failed") — so by its strict letter v2 underdelivered, while by lived experience it delivered the thesis. |
| **AC11 — >45 min winddown on any single day = revert, not iterate** (daily-driver hard stop) | **Met (held)** | No phase soak triggered the hard stop; per-skill `ARETE_LEGACY_SKILL_PROSE` flag shipped as the structural rollback mechanism (`phase-2-chef-orchestrator-rewrite/build-report.md` AC2.10 READY). The hard stop was a guardrail that never had to fire — which is the success condition. |
| **Chef-pattern adoption across skills** (do-all-work-then-engage, curate-with-reason-labels, propose-with-mcp-action, surface-deferred-as-sidecar) | **Met** | PATTERNS.md shipped first and was reviewed before any rewrite (MC4); five Phase 2 skills rewritten against it; Phase 4 propagated the pattern to inbox-triage, email-triage, slack-digest, schedule-meeting (`phase-4-skills-audit/build-report.md`). This is the change that produced the user-felt win. |
| **Wiki / summaries memory** (Karpathy-shape: raw → summaries + entities + concepts) | **Met (gates) / partial (stretch)** | Phase 1 shipped the summary writers, org entity pages, and summary-driven topic integration (the (a)–(c) gates). Wikilinks + wiki-lint (the (d)/(e) stretch) and slack-substantial heuristic validation landed per the MC1/MC3 sequencing. Phase 3.5 followup-5 added wiki discoverability. The summaries leg of the wiki now exists where it didn't. |
| **Core / Skills split** (`.arete/skills` managed + `.agents/skills` user, fork/diff/merge, adapter rendering) | **Met** | Phase 3 shipped the directory split, `arete skill fork/diff/merge`, and adapter resolution; `arete update` preserves forks (`POST-MERGE-CHEATSHEET.md §1`). AC5 (fork → edit → update without losing customizations) is structurally satisfied. |
| **MCP-first where one MCP cleanly covers the abstraction** (Principle 5) | **Met (as scoped)** | Integrations stayed where MCPs don't cleanly cover (Krisp/Fathom recording-source abstractions, Calendar multi-provider, Notion). The propose-with-mcp-action pattern routes MCP-backable verbs through a conservative propose-never-auto-execute envelope. No over-rotation into MCP-for-everything. |
| **Schema layer (Phase 6, conditional)** | **Not built — correctly deferred** | Per Principle 7 (substrate sunset), Phase 6 ships only if retros surface a real consumer need markdown reads can't fill. They didn't; the chef pattern + item-fates substrate covered it. Listed as "may be obviated by chef pattern + item-fates" (`POST-MERGE-WORKLOG.md` Workstream 3). Not-building this was a discipline win, not a miss. |

**Net read:** the *thesis* — chef-orchestrator makes the daily flow faster and less of a firehose
— is **met and user-confirmed**. The two hardest numeric ACs (AC8 ledger for late phases, AC10's
absolute ≤15 min) are **missed but in defensible ways**: the ledger regrowth bought real net-new
capability, and the winddown median improved ~40–50% even if it didn't hit 15.

---

## 2. What worked

- **Meta-orchestrator + per-phase sub-orchestrator + eng-lead-review pattern.** The structure
  held across 12 phases and many context resets. The diary was the durable thread; each phase ran
  its own `/ship` cycle with an independent reviewer at `/review`. Plan-stage reviews caught real
  problems before build — e.g. Phase 9's review caught that `TopicMemoryService.findTopics()`
  *doesn't exist* and that Memory Highlights are empty without `callLLM` wiring, both pre-build
  (`phase-9-brief-primitive-restore/review.md` C1, C3). Phase 11's review caught a breaking
  `staged_item_status` shape change disguised as a field add (`phase-11.../review-eng.md` C3).
- **Per-task commits surviving watchdog stalls.** The "no squash, per-task commits" cadence (diary
  execution ground rule 4) meant the bisect/audit trail survived — and it's exactly what let the
  ledger audit ("what was actually deleted in Phase X?") and this post-mortem reconstruct outcomes
  from history. The per-file `tsx --test` discipline kept the watchdog from stalling on the long suite.
- **The discipline ledger as a forcing function — through Phase 8.** AC8's concrete proxies (CLI
  verbs, skills, frontmatter fields, memory file types, services) made "are we actually getting
  slimmer?" measurable per phase. Phase 4's −12-skill result is the clearest evidence it worked:
  the rule produced an actual large remove, not a rhetorical one.
- **The chef pattern delivered the user-felt win.** This is the whole point and it landed: the daily
  flow went from step-by-step CLI/approve loops to do-all-work-then-engage with reason labels. User
  experience: "faster, much faster."
- **Substrate-sunset discipline on Phase 6.** The conditional schema layer was *not* built because the
  retros never surfaced the consumer need. Principle 7 worked as designed — the program resisted
  building the keystone substrate it originally feared it needed.
- **The merge-readiness pipeline this session.** reviewer (diagnose) → developer (fix, 4 commits) →
  reviewer (verify, APPROVE) → post-mortem → gitboss. The loop caught and cleanly fixed 3 real
  regressions (`merge-test-failures-findings.md`).

---

## 3. What didn't / cost us

- **+13.3k LOC regrowth in Phases 9–12.** The "no add without a remove" rule was not enforced for the
  late phases. It's defensible per-item (brief restored a regressed capability; Commitment-v2 +
  external-resolution are net-new), but the *aggregate* discipline lapsed quietly — there was no
  per-phase ledger gate for 9–12 the way there was for 0–8. The exception is being recorded
  eyes-open rather than discovered later (`POST-MERGE-WORKLOG.md` I-9).
- **The agenda regression from over-stripping.** Phases 4 + 7b + 8f2 over-removed the LLM-aggregation
  surface that `prepare-meeting-agenda` leaned on. Phase 9 restored a *typed, pure-aggregator*
  `arete brief` to fix it — the canonical example of the consumer-audit lesson already in user memory
  (`feedback_refactor_consumer_audit`). The fix is structurally in, but agenda richness is **not fully
  recovered**: the data-population step (stance refresh) is still cost-gated at ~$27.63 vs a $10 ceiling
  (`POST-MERGE-WORKLOG.md` I-2), so `--person` Memory Highlights ship thin until an incremental
  per-person refresh runs.
- **The semantic-merge-conflict miss.** Merging `main` into the long-lived v2 branch was *clean in git*
  (different files) but produced a **broken combination**: main's `detectTopicsLexical` (written against
  the old `tokenizeSlug`) vs the branch's new singularizing `tokenizeSlug`. The integrating merge
  (`ac0a692e`) never re-ran the full suite, so 2 failing tests **plus a real plural/alias topic-detection
  regression with production blast radius** (plural-form mentions silently stopped attaching topic pages
  + L2 excerpts) went unnoticed until this merge review. Per-file `tsx --test` discipline — which kept the
  watchdog happy throughout v2 — **structurally cannot catch a cross-file semantic conflict**, because
  each file's tests pass in isolation. (`merge-test-failures-findings.md` Root cause A.)
- **Phase 9 skipped its post-build code review.** Only a pre-build plan review ran — a deviation from the
  per-phase eng-lead-review ground rule (diary 2026-05-01 ground rule 2). Phase 9 was effectively
  reviewed for the first time during *this* merge, which is also where its stale stance fixtures and a
  cwd-relative test-path bug surfaced (`merge-test-failures-findings.md` Root cause B, C).
- **The plan over-ran its own roadmap.** The plan scoped 7 phases ending at a conditional Phase 6.
  Reality ran to Phase 12 with a thicket of followups (7a/7b, 8 + five 8-followups, 9 + followups,
  10 + 10a/10b/10e + followups, 11 + 11a). Much of this was legitimate soak-driven discovery, but it
  means the original cadence estimate (~3.5–4 months, 7 phases) bore little resemblance to what shipped,
  and the discipline machinery (per-phase ledger, skeptical-view) thinned out as the phase count grew.

---

## 4. Process learnings (generalized)

1. **Run the FULL suite (a) after merging `main` into any long-lived branch, and (b) as the gitboss gate
   before a cumulative merge.** Per-file test discipline is the right default for watchdog avoidance during
   build, but it is structurally blind to cross-file semantic conflicts. A clean `git merge` is not a clean
   *integration*. Don't trust per-phase "tests pass" claims for the integrated whole.
2. **Late-phase ledger erosion is the predictable failure mode of a long program, not a one-off.** The
   discipline that's vivid in early phases (when "slimmer" is the active goal) decays as the program shifts
   to building net-new capability. If a ledger gate matters, it has to gate *every* phase, including the ones
   that are honestly net-additive — the value is the eyes-open accounting, not a forced zero.
3. **Every phase gets its post-build review, no exceptions — especially the ones that "just restore" something.**
   Phase 9 was a "restore a regressed capability" phase, which felt low-risk and skipped its post-build review;
   that's exactly where the stale fixtures and path bug hid.
4. **Over-stripping has a latent blast radius that only a consumer audit catches.** Removing a user-facing
   aggregator surface (the LLM-brief) looked clean three phases running (4, 7b, 8f2) and only bit when a
   *downstream consumer* (prepare-meeting-agenda) degraded. Audit consumers before stripping a primitive —
   already in memory as `feedback_refactor_consumer_audit`; this program is the second confirmation.
5. **The reviewer → developer → reviewer loop works and should be the default cumulative-merge gate.** This
   session's pipeline (diagnose → fix 4 commits → verify APPROVE) cleanly resolved 3 regressions that the
   per-phase process had missed. The independent-diagnosis-then-independent-verify shape is what caught them.

---

## 5. Open at close

Not re-listed here — see **`POST-MERGE-WORKLOG.md`** (action list: 3 latent bugs, 9 outstanding
issues, 5 outstanding projects) and **`POST-MERGE-CHEATSHEET.md`** (operator reference: migration
order, dormant flags, known live-workspace issues). Highlights worth flagging at close:

- **3 latent product bugs that fail on `main` today** (attendee_ids→recentMeetings; bilateral
  self-reminder suppression ×4; view.test flaky) — not introduced by v2, fix post-merge.
- **`areas:` plural vs `area` singular** — slack-digest area data 100% silently dropped (top
  substantive bug, `POST-MERGE-WORKLOG.md` I-1).
- **Phase 11 auto-resolve ships dormant** — `PHASE_11_AUTO_RESOLVE_ENABLED=false`; golden-set
  precision=1.000 is a circular hand-written oracle, not a real run; chef wire-in not built. Leave off.
- **Phase 12 is plan-only** — projects-first-class is the cleanest next build.

---

## 6. Merge verdict

Cumulative branch is **cleared for merge** pending the gitboss gate. The 3 true branch regressions
were fixed this session (commits `edbe299e` symmetric singularize, `a3ba4da0` stance fixtures,
`70858af6` brief-no-llm path, `8d94e213` dist rebuild). Suite state after fixes: green except the
7 documented pre-existing/environment failures, which merge with tracking tickets rather than block.
