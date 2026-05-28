---
title: "Phase 3.5 follow-up 5 — pre-mortem"
slug: phase-3-5-followup-5-pre-mortem
created: "2026-05-27"
parent: phase-3-5-followup-5-wiki-discoverability
---

# Pre-mortem

If this phase ships and 2 weeks later we say "that was a mistake," what would have caused it? Enumerate honestly. Each risk gets a concrete mitigation, not a wave-of-hand.

## R1 — Singularize over-coerce: real-world plural clashes

`tokenizeSlug` stems trailing `s` on tokens of length ≥4. Likely false positives:

| Pair A | Pair B | Stemmed | Issue |
|---|---|---|---|
| `class` | `clas` | `cla` (3-char, not stemmed) vs `clas` (4-char → `cla`) | `class` doesn't stem (3-char min), `clas` stems to `cla` — actually safe |
| `analysis` | `analyse` | `analysi`/`analyse` (different tokens still) | Safe — they're not plurals |
| `glasses` | `glass` | `glasse` vs `glas` — wait, ends-with-s rule strips only one s | `glasse` ≠ `glas` — safe-ish but messy |
| `bus` | `bu` | `bus` (3-char, not stemmed) | Safe |
| `bias` | `bia` | `bia` vs `bia` (4-char → `bia`)? No — `bia` is 3 chars after strip | Safe (3-char floor) |
| `crisis` | `crisi` | `crisi` vs `crisi` | Could clash if both exist as topics — unlikely |
| `process` | `proces` | `process` (7-char) → `proces`; `proces` (6-char) → `proce` | Inconsistent stemming if both shapes get to tokenizer — should never happen in real slugs |
| `news` | `new` | `new` (3-char floor — not stemmed); `news` (4-char) → `new` | `news` → `new` could clash with `new` if both topic-like — unlikely but possible |

**Real-world high-risk**: words ending in `-ss` (`process`, `business`, `class`, `address`). Stemming `process` → `proces` is wrong. Stemming `business` → `busines` is wrong. The rule "strip trailing `s` if length ≥4" produces nonsense tokens for `-ss` endings.

**Mitigation**:
- Use rule: "strip trailing `s` if length ≥4 AND second-to-last char is not `s`". This preserves `-ss` endings while still catching `templates → template`, `decisions → decision`, `learnings → learning`, `meetings → meeting`.
- Test cases enumerated in `topic-memory.test.ts`: assert `tokenizeSlug('process')` returns `['process']` not `['proces']`.
- If still uncertain, lower the threshold: stem only on tokens length ≥5 (catches `templates`, `decisions`, `learnings` — misses `news`/`bias`/`crisis` which is fine).

## R2 — Containment match — DROPPED in plan revision

Original R2 enumerated the risk that AC4's containment match would collapse legitimate parent/child topics like `email-templates` ⊂ `pop-email-templates`. Eng-lead review-1 confirmed this risk against production data: `~/code/arete-reserv/.arete/memory/topics/` has `claim-clear` ⊂ `claim-clear-pause`, `claim-narrative` ⊂ `claim-narrative-{action-plan,cost,disruption,feature-flag}`, `audit-history` ⊂ `audit-history-paper-trail`. The `|canonical|≥2` guard does not prevent over-coerce — the production hierarchy is structurally vulnerable.

**Resolution**: AC4 dropped from this phase. Revisit only if soak shows AC3 singularize alone is insufficient for observed slug drift cases.

## R3 — Unified writer breaks an existing path

Three writer paths exist; one (CLI `extract --stage`) deliberately writes a leaner set. What if the chef pattern depends on the leanness — e.g., chef calls `extract --stage` first, then user-approval triggers `meeting apply` which writes the full set later?

If the unified helper writes `topics`/counts at extract time, and `meeting apply` is called later, the second write either:
(a) overwrites with same values (safe, idempotent)
(b) overwrites with different values (extraction was tentative; apply re-extracts) → values drift

**Mitigation**:
- Verify the chef daily-winddown flow: does it call `meeting apply` AFTER `meeting extract --stage`? Looking at `process-meetings/SKILL.md:96`, the chef calls `meeting extract --stage --reconcile` — and `meeting apply` is called only when the user runs `arete meeting approve <slug>`. So the writes happen at different times for different purposes.
- The unified helper must be idempotent: re-running on the same `intelligence` input produces the same output. Test asserts this.
- If `apply` post-`extract` ever produces different `intelligence` (e.g., reconciliation changes counts), the LATER write wins. Document this and add a "last_write_source" comment in the helper.

## R4 — AC2 alias-aware integration filter has surprising behavior on legacy data

After AC2 ships:
- User adds `aliases: [default-email-template, ...]` to `email-templates.md`.
- User runs `arete topic refresh email-templates`.
- The 33+ orphan meetings tagged with `default-email-template` (etc.) now integrate.
- The topic page bloats by 33 sources at once.

Risk: 33 sources × LLM call each for synthesis = significant cost. Plus the rewrite could produce a much longer, lower-quality page (low signal-to-noise).

**Mitigation**:
- `arete topic refresh` already has a per-call cost gate (`ARETE_REFRESH_MAX_USD` if it exists; verify in `topic.ts`). Document expected cost band.
- Recommend user adds aliases for ONE topic first, runs `arete topic refresh <slug>`, reviews output. If looks bloated, prune source list manually before broader alias rollout.
- AC6 chef stale-topic surface should propose alias additions ONE AT A TIME, not batch.

## R5 — AC5 active-topic bias widening could over-bias extraction

If `getActiveTopics` currently excludes `status: new` topics (to avoid biasing toward draft pages), widening to include them could cause extraction to prefer stale-but-real canonical slugs over a meeting's genuinely-new topic ideas. The pendulum swings the other way: now we under-create new topic pages because everything coerces to existing slugs.

**Mitigation**:
- Verify the actual filter in `getActiveTopics()` before changing it. If the filter is `status: active AND last_refreshed within 60d`, widening to `status in [active, new] AND last_refreshed within 90d` is a small adjustment, not a removal.
- The Jaccard `COERCE_THRESHOLD = 0.67` still gates coercion. Wider bias list only helps when the candidate is genuinely close to a canonical.
- Test: extraction on a meeting transcript with a genuinely-new concept produces a NEW topic slug, not a coerced canonical.

## R6 — Phase 1 main-merge dependency

The architecture audit revealed Phase 1 wiki expansion (`summaries/meetings/`, `entities/orgs/`) is shipped to the v2 worktree but NOT merged to user's installed CLI binary. The user is running pre-Phase-1.

If this phase ships to user's binary alongside Phase 1+2+3+3.5 (per the user testing window), the user's first run with the new binary could be unusual: 266 meetings + 128 people get summaries/entities generated in one pass, AND topic alias logic activates simultaneously.

**Mitigation**:
- Document in this phase's build-report: "user's first `arete update` after this phase + Phase 1/2/3/3.5 lands may generate a large summary backlog and trigger topic refreshes."
- AC6 stale-topic surface should not fire on first-run (user hasn't established their adjacent-slug patterns yet). Gate on "topic page has ≥1 sources_integrated entry."

## R7 — AC6 chef cognitive load

Surfacing "topic X is stale; add aliases?" forces user action on a meta-concern (wiki health) during a winddown (operational time). Could compound the AC10 ≤15-min target risk.

**Mitigation**:
- Cap at ONE stale-topic surfacing per run (the one with highest adjacent-source count).
- Surface as `## Uncertain` (skippable, no action required).
- Defer adoption: ship AC6 prose but gate behind user's APPEND-file opt-in. If user wants it off, they delete the surfacing prose from their per-skill APPEND.

## R8 — Build sub-orch wrong-base risk (recurring)

Diary records the Phase 3 sub-orch base error: Agent's `isolation: "worktree"` landed on `main` instead of parent. Phase 3.5 used manual worktree creation. This phase will too.

**Mitigation**:
- Pre-flight check in handoff brief: agent verifies `git branch --show-current` == `worktree-phase-3-5-followup-5-wiki-discoverability` AND parent-plan files visible AND Phase 3.5 followup-4 commits (`6c8a9992`, `b454c507`, `a1447910`) reachable. Halt if wrong.
- Manual sub-worktree creation in this meta thread, NOT in the sub-orch's tools.

## R9 — Test brittleness on prose changes

AC6 prose addition to daily-winddown SKILL.md will be checked by `chef-orchestrator-skills.test.ts`. If the test asserts specific phrasing (e.g., "slug drift suspected"), small wording tweaks during build break tests.

**Mitigation**:
- Test asserts the PRESENCE of a "stale topic" surfacing block (regex for "stale.*topic" + "alias" within `## Uncertain` section), not exact phrasing.

## R10 — AC1 path-3 unification newly invokes `aliasAndMerge`

Added post review-1. Today `meeting.ts:1068-1090` does NOT call `aliasAndMerge` at all (no topics in fm = no alias work). Once AC1 lands, path 3 starts invoking the alias machinery — which means AC3 changes (singularize) affect path 3's first-run behavior IMMEDIATELY on the next chef `process-meetings` invocation post-merge.

The first chef run after this ships could touch 11+ pending meeting files with new coerce decisions in one wave. If singularize triggers an unexpected coerce (e.g., a tokenize/stem edge case we didn't enumerate), it propagates across the batch silently.

**Mitigation**:
- Build sub-orch runs a SHADOW PASS first: pick N=3 recently-extracted CLI-path meetings (use `2026-05-27-jasmine-john-11-glance-20-walkthrough.md`, `2026-05-27-ashley-john-11-glance-20-walkthrough.md`, `2026-05-27-claim-portal-comms.md`). For each, call the new unified writer with the meeting's extracted `intelligence` and compare proposed frontmatter vs. current. Document any surprises in build-report.
- Land AC3 only AFTER AC1 shadow pass shows no surprises. If shadow surfaces an unexpected coerce, halt and engage meta.
- AC6 stale-topic surface should not fire on first chef run after merge (gate on "topic has ≥1 sources_integrated AND the user has explicitly run `arete topic refresh` in past 7 days").

## What's the single thing most likely to go wrong?

**R10 (AC1 first-run unintended mass coerce)** because the change is structurally invisible — paths 1 and 2 always called `aliasAndMerge`, so the behavior is "normal" from their perspective. Path 3 newly joins them, but the chef daily-winddown will invoke it across MANY meeting files in one wave (typical chef run processes 4 meetings per wave per `SKILL.md:182`). A single bad coerce gets multiplied across the batch. The shadow-pass mitigation is essential, not optional.

Second-most-likely: **R1 (singularize over-coerce on `-ss` endings)** — see required test enumeration in plan AC3.

Third: **R3 idempotency** — if the unified writer is called from BOTH `extract --stage` AND `meeting apply` and they produce subtly different `intelligence` inputs (e.g., post-reconcile counts), values drift.
