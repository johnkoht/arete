---
title: "Areté v2 — post-merge worklog"
slug: arete-v2-post-merge-worklog
created: "2026-06-08"
purpose: Working scratchpad for what to do AFTER the v2 chef-orchestrator branch merges to main. Three workstreams — (1) pre-existing latent bugs to fix, (2) outstanding issues, (3) outstanding projects. Pick up here.
related: POST-MERGE-CHEATSHEET.md, phase-10-winddown-orchestrator/merge-test-failures-findings.md
---

# Areté v2 — Post-Merge Worklog

Companion to `POST-MERGE-CHEATSHEET.md` (operator reference). This is the **action list**.
Order of attack agreed 2026-06-08: merge first → then bugs → then discuss topics 2 & 3.

---

## Workstream 1 — Pre-existing latent bugs (fix after merge)

These FAIL ON `main` TODAY (verified in isolation; source + test byte-identical to main).
They are **not** introduced by the v2 branch, so they did not block the merge — but they are
**real latent product bugs**, not flakiness. Fix these first post-merge.

### BUG-1 — `attendee_ids` → `recentMeetings` resolution broken
- **Severity:** MED (person-context completeness)
- **Failing test:** `packages/core/test/services/meeting-context.test.ts:446` — *"finds person in recent meetings via attendee_ids when not in attendees array"*
- **Symptom:** a person present only via `attendee_ids` (not in the `attendees` array) is not resolved into `recentMeetings`.
- **Suspected area:** `meeting-context.ts` `buildMeetingContext` / recent-meeting resolution path.
- **Repro:** `ARETE_SEARCH_FALLBACK=1 npx tsx --test packages/core/test/services/meeting-context.test.ts`
- **Status:** OPEN — needs investigation (test asserts intended behavior; product code is wrong).

### BUG-2 — Bilateral self-reminder suppression broken (4 tests, one cluster)
- **Severity:** MED (winddown/person-memory noise — surfaces self-reminders that should be suppressed)
- **Failing tests** (`packages/core/test/services/person-memory.test.ts`):
  - `:674` — suppresses owner self-reminder when bilateral entry exists under counterparty
  - `:728` — preserves owner-only items without bilateral counterpart
  - `:783` — suppresses heuristic-based self-reminders when bilateral match exists
  - `:848` — selectively suppresses: bilateral removed, unrelated owner-only preserved in same meeting
- **Symptom:** bilateral-match suppression logic in `person-memory.ts` isn't suppressing/preserving as specified.
- **Repro:** `ARETE_SEARCH_FALLBACK=1 npx tsx --test packages/core/test/services/person-memory.test.ts`
- **Status:** OPEN — one investigation covers all 4 (single suppression code path).

### BUG-3 — `view.test.ts` environment-flaky (NOT a product bug — lower priority)
- **Severity:** LOW (test-harness hygiene)
- **Failing tests:** `packages/cli/test/commands/view.test.ts:378` (spawns server, polls health, opens browser), `:446` (kills child on SIGINT). Run times out (exit 124).
- **Cause:** spawns a real server + browser; flaky in the full-suite lane (matches the diary's accepted set: `people.test.ts:166`, backend `agent.test.ts`).
- **Fix options:** gate behind an env flag or move to a separate integration lane so the core suite stays deterministic.
- **Status:** OPEN — hygiene, not correctness.

> Full diagnosis + the 3 regressions we DID fix pre-merge are in
> `phase-10-winddown-orchestrator/merge-test-failures-findings.md`.

---

## Workstream 2 — Outstanding issues (discussion topic #2)

Prioritized; full evidence in `POST-MERGE-CHEATSHEET.md §4` and the diary parking-lot.

| # | Issue | Severity | Action |
|---|---|---|---|
| I-0 | **Meeting-agenda quality still regressed — F3, NOT data.** Investigated 2026-06-08 with `now/agendas/2026-06-09-anthony-john-weekly.md` (skeleton: 3 of 4 sections empty) vs `resources/meetings/2026-04-28-anthony-john-weekly.md` (rich, themed, time-boxed, discussion-topics woven in). **All Phase 9 machinery fired**: arete-reserv is symlinked to the v2 worktree; `dev/diary/brief-invocations.log` shows `2026-06-09T03:38 --meeting "Anthony / John Weekly"` + `03:49 --person "anthony-avina"`; installed SKILL.md has the "synthesize / do not pattern-fill" prose; the person file still has the full `1:1 Discussion Topics`. The agent invoked brief, got context, and pattern-filled the template anyway (pre-mortem risk **F3**). Likely aggravator: **batch generation** (4 meetings briefed back-to-back at 03:38 → cheap Priorities filled, qualitative sections skeletoned). **Phase 9 soak bar (≥5 agendas at April quality) is NOT met.** Disproves the earlier "missing stance data" theory (April had NO stances + rich agenda; today has 10 stances + skeleton). | **HIGH — user-felt, top priority** | Phase 9 follow-up: make synthesis non-skippable (agent must not emit empty themed sections when brief returned real context); prevent batch-mode from degrading per-agenda composition; add an agenda quality assertion. |
| I-1 | **`areas:` plural vs `area` singular** — slack-digest writes `areas:[...]`, `area-memory.ts:919` reads `fm.area` singular → slack-digest area data **100% dropped** | **MED — top substantive *data* bug** | Dual-read transition; decide migration for existing plural data |
| I-2 | **Phase 9 stance refresh** — incremental refresh done for `lindsay-gray`; full workspace sweep cost-blocked (~$27.63 vs $10 ceiling). NOTE: this affects `--person` Memory Highlights *completeness*, NOT agenda richness (see I-0 — that's a synthesis/F3 problem, not a data problem). | LOW-MED (data completeness) | Incremental per-person ladder as desired; recalibrate `COST_PER_STANCE_CALL` after first real run. Do NOT conflate with I-0. |
| I-3 | **`getActiveTopics` truncation** (top-25 bias list; `email-templates` #117) → orphan topics under-tagged | LOW-MED | Per-area bias quota OR recency-window inclusion OR adaptive top-K |
| I-4 | **`deferral_disagreement` events not firing** (0 logged) | LOW (instrumentation) | Verify fires from next winddown (path fixed); else debug Step 0.5 scan |
| I-5 | **No `arete topic add-aliases` verb** — orphan alias backfill is hand-edit only | LOW (cheap) | Add CLI verb to apply chef's AC6 proposals |
| I-6 | **`[[unmerge]]` 3+-source dupe** — resolver refuses (`ambiguous-dupe`) rather than peel wrong dupe | LOW (guarded) | Persist dupe→source mapping in dedup-decisions log so 3+ split is derivable |
| I-7 | Phase 8f8 residuals: `areaSetBy` widening, cache cleanup, 5d→8d recurring-guard tune | INFO/LOW | Revisit after first weekly soak |
| I-8 | Diary status table has no rows for Phases 9–12; Phase 9 had no post-build code review | DOC/PROCESS | Append closing diary rows; accept build-report + invariant test as Phase 9 sign-off (now reviewed via this merge) |
| I-9 | **Discipline ledger: Phases 9–12 net +13.3k source LOC** (regrowth, not substitution) | DECISION | Eyes-open accepted exception — confirm and note in diary |

---

## Workstream 3 — Outstanding projects (discussion topic #3)

| Project | Status | Scope (one line) | Depends on |
|---|---|---|---|
| **Phase 12 — projects-first-class** | Plan-only (draft 2026-06-05) | Derive project `area` so `arete brief --project` lights up; system-owned auto-refreshed `topics:` cache; `/project` + `/update-project` flows | Phase 8f8 area inference (shipped). **Cleanest next build.** |
| **Group C — 7 PM-skill chef-rewrites** | Not started | `create-prd`, `discovery`, `synthesize` (priority), + competitive-analysis, construct-roadmap, finalize-project, wrap | Phase 4 soak data; overlaps Phase 12 area-at-creation writers |
| **Phase 5 — `meeting extract` decomposition** | Not started (mostly absorbed) | Fix compound-sentence mirror-direction parser bug at source; remaining surface smaller than originally scoped | Fresh plan |
| **Phase 6 — schema layer** | Not started (conditional) | events.jsonl + state.json; ships only if retro surfaces real consumer need | May be obviated by chef pattern + item-fates |
| **Phase 11 c / chef wire-in** | Core built; wire-in NOT built; 11c conditional NO-GO | Unified approval surface (`arete approvals --today` + MCP); chef winddown wire-in for Gmail auto-resolve | Golden-pair relabel; **Phase 10 14-day soak CLEAN-PROCEED (AC0 — not yet confirmed in diary)** |

### Gating note before enabling Phase 11 auto-resolve
`PHASE_11_AUTO_RESOLVE_ENABLED` stays false until: (a) golden-pair relabel + precision ≥0.95 on real labels, (b) Phase 10 14-day soak retro closes CLEAN PROCEED, (c) chef wire-in built. None are done.

---

## Next session pickup
1. Confirm merge landed + suite green (except BUG-1/2/3 tracked here).
2. Run the `POST-MERGE-CHEATSHEET.md` migration order on arete-reserv.
3. Start Workstream 1 (BUG-1, then BUG-2). Then discuss/prioritize Workstreams 2 & 3.
