---
title: "Wiki repair — foundation fixes before Phase 12"
slug: wiki-repair-foundation
status: approved-for-build (review-1 concerns addressed; D1=persist, D2=_archive move, D3=drop — John 2026-06-09)
created: "2026-06-09"
revised: "2026-06-09"
owner: John (decisions) + orchestrator (cycle)
evidence: /tmp/wiki-foundation-audit.md, /tmp/wiki-writer-inventory.md, /tmp/wiki-verification.md (verified 2026-06-09)
review: review-1 verdict REVISE BEFORE BUILD — concerns 1-10 addressed in this revision; D1/D2/D3 below await John
---

# Wiki repair — foundation fixes

## Why now

A verified three-report investigation (audit → writer inventory → adversarial verification)
found the wiki's write and read arteries degraded in ways rich data masked:

- Topic integration was DEAD 6/05–6/09 (stale `.arete/.seed.lock`, error warn-swallowed). **Unblocked 6/09** (lock deleted; catch-up `topic refresh --all` run by John) — but the failure mode remains: no stale-lock takeover, no surfacing.
- Phase 1's gate deliverables (meeting summaries, org entities) are **dark code** — hooked only to `arete meeting apply`, which the chef winddown flow skips (it IS still used by the backend web agent and process-meetings standalone mode — see W2).
- **222/249 topic pages frozen at the 4/24 seed**; the alias-rescue loop has never executed once (0 `aliases:` workspace-wide). Two deadlines (verified): 60-day stale-lint avalanche **6/24** (`staleDays=60`, strict `>`); 90-day active-window cliff **~7/23** (frozen pages drop off the extraction bias list → can no longer recover organically; `openItems>0` pages survive the cliff).
- Observability holes are WHY nothing was noticed: approve-path integrations log no events; the logger itself silently swallows append failures (a 6/08 full `memory refresh` left no event); lock errors invisible; retrieval serves stale pages with no staleness signal.
- qmd retrieval was dead (3-layer cause) — **already fixed + merged** (`83338dcb`); 2 non-blocking review follow-ups folded into W5.

Phase 12 (projects-first-class) builds project briefs directly on this foundation → repair first.

## Decisions

**Made (John, 2026-06-09):**
- **Summaries: YES** — wire meeting summaries into the live (approve) path. **Org entities: NO** — delete the dark code (ledger-negative).
- **Avalanche: option 1+2** — batch alias-rescue + triage, one curated review sitting, before 6/24.
- **Out of scope, tracked, NOT silently dropped**: email→wiki (never planned), Notion→topics, inbox→topics (summaries are a leaf today), project-docs/PRDs→wiki (published-doc-sync workstream). Also explicitly excluded from this phase: area-memory staleness (4/4 areas ~1mo stale — resolved by normal `arete memory refresh` cadence once observability lands, not a code repair).

**OPEN — needed from John before build:**
- **D1 (W2)**: `could_include` content — **persist at `extract --stage`** (frontmatter key via the unified writer; consumed + cleared at approve; summaries then carry the FYI section) — or accept that approve-time summaries lose it. **Recommendation: persist** — accepting the loss reproduces the exact "knowledge goes nowhere" bug this plan exists to fix.
- **D2 (W4)**: archive semantics for triaged-out topic pages — **move to `.arete/memory/topics/_archive/`** (zero code changes; auto-invisible to discovery/active/lint; reversible by `mv` back) — or a `status: archived` convention (pages stay in place; requires filtering archived in discovery, active-topics, lexical detection, search). **Recommendation: `_archive/` move.**
- **D3 (W7)**: slack-thread summaries — **drop** (delete heuristic dark code + the skill-prose eval emissions) or complete (becomes its own follow-on). **Recommendation: drop** (1-day shadow, flag never flipped, writer never wired; digests already feed topics; emitting eval events is live LLM-session spend feeding a dead shadow on every digest).

## Work items

### W1 — Seed-lock resilience (the 6/05 class)
- Wire the existing-but-callerless `breakSeedLock`/`readSeedLock` (`seed-lock.ts:97/:109`, exported, zero callers) into `acquireSeedLock`: stale takeover when the lock's pid is dead (the exact 6/08 case).
- Stop warn-swallowing `SeedLockHeldError` on the approve path (`meeting.ts:1826-1830`): surface loudly in command output AND write a log event so skipped integration is visible.
- Fix the FALSE recovery hint at `meeting.ts:1993` ("run `arete memory refresh` later to catch up" — wrong verb post-7b; correct: `arete topic refresh`).
- Tests: dead-pid takeover, live-pid refusal, surfaced error.

### W2 — Meeting summaries on the live path (Phase 1 rescue, summaries only)
- **ALSO-FIRE, not move** (review concern 2): `writeMeetingSummary` stays in `applyMeetingIntelligence` (`meeting-apply.ts:387` — still consumed by the backend web agent `agent.ts:30` and process-meetings standalone `arete meeting apply`) AND fires in `arete meeting approve`: inserted AFTER `commitApprovedItems`, strictly BEFORE `refreshAllFromSources` (Hook 2, `meeting.ts:1808`), gated identically to Hook 2 (`ai.isConfigured()`, `ARETE_NO_LLM`, skip-topics-equivalent flag).
- Ordering matters: summary lands before integration so the EXISTING summary-first read (`topic-memory.ts:1241-1264`, transcript-hash idempotent) engages on the same approve → realizes the promised token reduction.
- **D1 sub-task (if persist)**: persist `intelligence.could_include` at `extract --stage` as a frontmatter key via the unified writer (`meeting-frontmatter.ts`), consumed by the approve-time summary writer (rendered as the FYI section) and cleared after. Without this, approve-time summaries cannot carry FYI content — it exists only in the extract process's memory (verified: `meeting-extraction.ts:1851-1860` removed body rendering; the unified writer doesn't persist it).
- Fix the `process-meetings` SKILL.md:271 verb misnomer (`apply` → `approve`).
- Honesty note (review concern 2): the summary content-hash is body-based and approve mutates the body, so a later `apply` after `approve` re-spends one LLM call rather than skipping — overwrite-safe, not spend-safe. Acceptable; documented.
- Tests: approve produces `summaries/meetings/<date>-<slug>.md`; integration consumes summary not transcript when present; could_include round-trip (stage → approve → summary FYI section) if D1=persist.

### W3 — Org-entity dark-code removal (Remove; pairs with W2's Add)
Falsifiable deletion checklist (review concern 6):
- `refreshOrgs` call site + `skipOrgEntities` option + `orgsRefreshed` result field (`meeting-apply.ts:52/85/416-432`).
- `org-entity.ts` service (~549 LOC) + model (~224 LOC) + `createOrgEntityManual` (zero callers; doc claims a CLI verb that never existed).
- Barrel exports: `core/src/models/index.ts`, `core/src/services/index.ts`.
- Tests: `test/services/org-entity.test.ts` (371), `test/models/org-entity.test.ts` (116), org assertions in `test/services/meeting-apply.test.ts:867-893`.
- Prose consumers: `.pi/expertise/core/PROFILE.md:241` (names org-entity in the summaries-leg description), `packages/runtime/UPDATES.md:43` (release-notes mention).
- Grep-gate BEFORE delete per `feedback_refactor_consumer_audit`; backend `routes/memory.ts` verified GET-only.

### W4 — Alias-rescue batch + triage (deadline-driven: before 6/24)
- One-shot analysis script in `scripts/` (eval-harness-local convention; uncommitted): for each of the 222 frozen pages, mine near-miss sub-slugs (token overlap), candidate sources, recommend **refresh-with-aliases / merge-into-canonical / archive**, banded by confidence so John can bulk-accept high-confidence bands and hand-review only the ambiguous middle.
- Output: ONE curated proposal doc; John reviews in a single sitting; apply mechanics (review concern 4 — no archive/merge verbs exist, deliberately):
  - **refresh-with-aliases**: `arete topic add-aliases` + `arete topic refresh <slug>`.
  - **merge**: `add-aliases` onto the canonical, then archive the absorbed page.
  - **archive** (D2): scripted `mv` to `.arete/memory/topics/_archive/` (or `status: archived` per D2), executed in the same session, with a **rollback ledger** (page → destination) written alongside.
  - Post-apply: regenerate `index.md` + run `arete topic lint`; **measure the dangling-wikilink delta** (baseline 149) and include it in the wrap report.
- Worked example: `email-templates` gains `aliases: [default-email-template, ...]` → absorbs the weekly-meeting flow; triage decides whether `default-email-template` survives.
- Cost-size before run (seed averaged ~1.5¢/integration; bound the re-integration set).
- Fallback if the sitting slips past 6/24: batch Step 0.7's stale surface (nag-grade, not catastrophic — confirmed capped at one/winddown).

### W5 — Observability (the "why nothing was noticed" fixes)
- Hook 2 writes `ingest`-kind log events per integrated source, carrying `input_kind: summary|transcript` + input char count (makes AC2 measurable; grammar is open kebab-case, `utils/memory-log.ts:53-57`).
- **Fix the silently-lossy logger itself** (review concern 5): investigate the 6/08 missing `refresh scope=all` event (`intelligence.ts:~552` append is try/catch-swallowed); log-append failures must at minimum warn, never vanish; verify the `claude-md-regen` path (events stopped 5/11) in the same pass.
- **Staleness on retrieval surfaces**: brief wiki sections + `topicWikiContext` injection show `last_refreshed` (e.g. "(as of 2026-04-24 — stale)").
- `topic refresh --all` per-page progress output (today: 18 silent minutes is indistinguishable from a hang — observed live 6/09).
- `_synthesis.md` fossil (review concern 10): `status.ts:233` still reads the file whose writer was removed in 7b → permanent false "stale" line; drop the status line / mark feature removed.
- qmd review follow-ups: add-fail-after-remove test; surface "unverifiable" collection-show results instead of silent assume-OK.
- Optional/cheap: `arete status` CLAUDE.md-age line; index.md count off-by-2.

### W6 — Brief correctness trio (repairs that Phase 12 then builds on)
- **Decisions/learnings parser — respecced** (review concern 3): parse the live format `## Title` + `- **Date**:`; attribute area via `**Topics**:` slugs (123/694 decisions, 106/823 learnings carry them) mapped through topic-page `area:` frontmatter (already surfaced in `ActiveTopicEntry.area`); keep `Area:`/`[area:]` as fallbacks (only 5/694 live entries have them — the old spec would have under-delivered ~95%).
- **`meetingsForArea` topics-union** (review concern 7 — not a one-liner): add `topics` to `MeetingIndexEntry` (`brief-assemblers.ts:118-129`) + parse in `buildMeetingIndex`, then union `fm.area === slug || fm.topics?.includes(slug)` at both call sites (`:944`, `:1149`) + tests.
- `fm.name` falls back to `title:`/`project:`/slug (verified: 0 of 7 live project READMEs use `name:`).

### W7 — Slack-thread summaries: DROP (pending D3)
- Delete: the logging-only heuristic dark code, AND the skill-prose consumers (review concern 8): `slack-digest/SKILL.md:63` + `:248` instruct emitting `slack-thread-eval` events per thread — live LLM-session spend feeding a dead shadow on every digest. Grep-gate before delete (same discipline as W3).
- Ledger ≈ −333 (code/tests) + prose.

## Sequencing

1. W1 + W5 (lock + observability) — smallest, protects everything else.
2. W2 + W3 together (summaries Add pairs with org Remove — discipline rule). W2 needs D1 first.
3. W6 (brief trio) — unblocks the Phase 12 revision in parallel.
4. W4 (alias-rescue) — analysis can start immediately; John's review sitting is the gate; apply before 6/24. Needs D2.
5. W7 on D3 (independent).

Parallelizable: {W1+W5}, {W2+W3}, {W6} are disjoint file sets; W4 is script+data.

## Acceptance criteria

- AC1: kill -9 a `topic refresh` mid-run → next integration takes over the stale lock (dead pid) and logs it; live-pid lock still refuses.
- AC2: approving a meeting produces `summaries/meetings/<file>` AND an `ingest` log event with `input_kind: summary` whose input char count < the same meeting's transcript-body length.
- AC2b (if D1=persist): could_include captured at stage appears in the approve-time summary's FYI section and is cleared from frontmatter after.
- AC3: zero org-entity code remains (the W3 checklist greps clean); ledger for W2+W3 combined ≤ 0 (sized: W3 ≈ −1,300, W2 ≈ +300–350).
- AC4: the rescue proposal covers all 222 frozen pages with a banded verdict each; after apply, ≥90% of "refresh"-verdict pages show post-6/09 `last_refreshed`; `email-templates` shows absorbed weekly sources; a rollback ledger exists; post-apply `topic lint` dangling-link delta reported.
- AC5: brief wiki sections display `last_refreshed`; a stale page is visibly stale in `brief --person/--project` output.
- AC6: `brief --project` S4 (decisions) shows **≥10 items for glance-communications** (floor, not merely non-empty); S2 includes June meetings via topics-union.
- AC7: targeted tests during build (600s watchdog rule); ONE integrated full-suite run on main at merge gate — green.

## Skeptical view

- W2 adds an LLM call at approve time; the recoup claim (summary-first integration tokens) is now AC2-measurable rather than asserted. Approve latency measured before/after. Overwrite-safe but NOT spend-safe on apply-after-approve (documented above).
- W4's "one sitting" could balloon — mitigated by confidence banding, but if the ambiguous middle exceeds ~50 pages, split into two sittings rather than rubber-stamp.
- Deleting org code forecloses a future "accounts" view — git history preserves it; re-adding later costs less than carrying dark code audits keep flagging.
- The devil's-advocate failure mode (review): W2 shipping without the D1 decision → FYI content still goes nowhere → second-generation writer-divergence bug. Guard: D1 is a build-blocking gate, not a during-build TODO.

## Rollback

Per-work-item commit sets. W2 hook = single call-site addition (revert = one commit). W4 applies per-page (`add-aliases` reversible by removing the alias; archives reversible via the rollback ledger + `mv` back). W3/W7 revert = git revert.
