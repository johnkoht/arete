# Phase 10 Plan Review — PM Pass

**Reviewer**: senior PM (independent perspective)
**Reviewed**: 2026-06-03
**Plan**: phase-10-winddown-orchestrator/plan.md
**Verdict**: REVISE BEFORE BUILD (scope trim + workflow gap fixes; underlying vision is right)

## Verdict reasoning

The plan correctly diagnoses John's pain — looking at the last three winddowns (6/01, 6/02, 6/03) it is impossible to miss it. The 6/02 winddown surfaces 4-5 overlapping `28db8695` / `34f4fa25` / `136fe5c1` / `f79e8201` commitments all circling "the CJ one-pager". By 6/03 that cluster has grown to ~7 (`f79e8201`, `28db8695`, `34f4fa25`, `d8b2e3a7`, `2c158664`, `3e7ce8b6`, + a fresh staged `ai_005`). The winddown literally says "Run `/commitment-triage` to consolidate before they compound." That is the lived evidence that the current decomposed flow is producing dupe-rot, and that the chef-orchestrator vision is the right target. So the **direction is right**.

But the plan as drafted is ~3-5 weeks, bundles a destructive one-shot data-model migration with a new external-source detector with a new approval surface with a new background verb, and lands all of this just after Phase 9 shipped. It under-weighs two things John has already told us in memory: (a) "AI fix escalation — cheapest first" and (b) the bloat-is-the-antagonist v2 direction. Phase 10 as written looks like a 4-feature monolith. It should ship as 10a-b (data-model + reactive dedup), prove the dedup substrate alone heals the visible pain, THEN add 10c (external-source) and 10d (unified surface) as separate bets. Several workflow scenarios — Fathom-3-days-late, post-meeting "approve now", missed-day catch-up — get only thin handling and will bite John in the first week of soak.

## What the plan gets right (PM lens)

- **Diagnosis is sharp and grounded.** The "one commitment surfacing in 4 meetings" pattern is exactly what 6/02 and 6/03 winddowns show. Plan's hard-parts section (semantic equivalence, migration risk, false-positive auto-resolve = "trust crater") names the real risks.
- **Data-model (a) is right.** `(text + direction)` with stakeholders as metadata matches how John reasons about commitments: a "talk to Dave" is one thing regardless of which meeting surfaced it. The 6/02 winddown's CT2/CT3 pattern (fold Anthony-mention AND Jess-mention into the same `28db8695`) is exactly this case manifesting today and being handled by hand.
- **`textVariants[]` preserves provenance** — keeps the LLM-extracted wording history without forcing a winner. Good guardrail against losing context.
- **Auto-resolve auditability via `resolvedBy` + `resolvedEvidence`** — necessary, well-thought.
- **Conservative confidence thresholds for external-source resolution** — plan correctly identifies false-positive auto-resolve as a trust crater.
- **Soak length explicitly extended (14-21 days)** for the size of the bet.
- **Migration is reversible** with `commitments.pre-phase-10.json` backup + restore verb. Good.
- **Cost cap with hybrid pre-filter** is a real concern addressed properly. The $0.25/winddown estimate is plausible.

## Workflow gaps / scenarios the plan handles thinly

### G1: Post-meeting "approve while it's fresh"

**Scenario**: John finishes a 1:1 with Lindsay at 11am Tuesday. While the conversation is still in his head, he wants to open the per-meeting UI, scan extracted items, fix wording ("Lindsay said 'lead' not 'own'"), approve the 4 commitments, and move on. He does NOT want to wait until 6pm winddown to see them in a unified queue with 7 other meetings.

**Plan's handling**: Plan says (line 50) "per-meeting review remains; it gains dupe badges + canonical references but the structural surface doesn't change. Unified approval is an ADDITIVE surface." Good in principle. But step 2 of the target flow (line 124-126) says "For each meeting WITHOUT staged sections: arete meeting extract `<slug>`" — implying the chef does extraction in winddown. If John already ran extract at 11am Tuesday, the dedup at 6pm against the day's other meetings happens WHEN? Plan doesn't say whether mid-day approvals get re-deduped against later-day meetings, or whether the dedup is one-shot at winddown.

**Real-world friction**: John approves Lindsay-1:1 at 11am. At 6pm winddown, the chef extracts the 4pm Email Templates Weekly which has a near-dupe ("Send Lindsay the deck on PR templates"). Now we have an already-approved commitment in `commitments.json` AND a staged near-dupe. The plan's reactive-dedup pipeline cross-references against `commitments.json` (good — line 332), so it should catch this. But what's the UX? Does the new staged item just get a "↪ canonical at <already-approved-id>" badge in the 4pm meeting? Does it self-skip? Plan doesn't specify.

**Recommendation**: Add an explicit AC: "approving a meeting mid-day, then a later same-day meeting surfaces a near-dupe → near-dupe auto-attaches to already-approved canonical with badge; no double-approval requested." Make it AC8.5. This is the everyday case for John given his approve-as-you-go habit.

### G2: Async Fathom review 3 days later

**Scenario**: John has a Thursday meeting recorded via Fathom (not Krisp — Fathom integration not active yet, per 6/01 winddown notes, but it's coming). He doesn't review the recording until Sunday. He runs `arete meeting extract` on it Sunday. Commitments from that Thursday meeting now appear with `createdAt: Sunday` but the meeting `date: Thursday`.

**Plan's handling**: The dedup window is described as "today + last 14 days" (line 131). Reactive dedup cross-references against commitments.json + 14-day staging history. So a Sunday extraction of a Thursday meeting CAN find Thursday's other commitments. But:

**Real-world friction**: The external-source resolution detector (3b, lines 136-140) scans Slack + email for evidence that the commitment was completed. For a Sunday-extracted Thursday-meeting commitment ("Send Lindsay the deck"), the temporal window logic (Hard Part 3, line 100: "must be after commitment creation") would gate on `createdAt: Sunday`. So if John actually sent the deck Friday, the temporal-window check would REJECT the Friday Slack message as evidence (it's before `createdAt`). False-negative: a real completion gets missed.

**Recommendation**: Temporal window should gate on `meeting.date` (when the commitment was MADE), not `createdAt` (when it got extracted). Add AC: "extracting a 3-day-old meeting → external-source resolution correctly matches evidence from the intervening days." This is also a clue that the plan needs an explicit `commitedAt` vs `extractedAt` distinction — worth a model tweak.

### G3: The skipped-day / weekend catch-up

**Scenario**: John skips Saturday and Sunday winddowns (it's the weekend, he has a life). Monday he runs `/daily-winddown`. There are 0 new meetings from Saturday but 3 from Friday afternoon that weren't winded-down, plus today's 6 meetings. He also fired a few Slack messages over the weekend resolving commitments from earlier.

**Plan's handling**: Not addressed. The plan assumes daily cadence. Line 119-159 flow is described as if "today" is well-defined.

**Real-world friction**: On Monday, does the chef:
- Process all 9 meetings (Fri + Mon) in one winddown queue? That's a 9-meeting batch — likely to overflow the chat-first approval surface.
- Treat Friday's meetings differently (assume John already approved them)? But he didn't, he skipped winddown.
- Scan weekend Slack for resolutions? The temporal window for "external evidence from weekend" is ambiguous.

**Recommendation**: Add an explicit "winddown catch-up mode" or at minimum acknowledge it in non-goals. The simplest answer: chef detects "last winddown was N days ago, batching all intervening meetings" and surfaces a banner. Don't silently merge into "today". And the external-source scanner's window should be `[last_winddown, now]` not just `today`.

### G4: Mid-stream commitment revision

**Scenario**: John extracted "Send Lindsay the deck" from Monday's 1:1. Tuesday Lindsay Slacks: "actually send me BOTH decks — the Q3 one too." John re-extracts the Slack thread or hand-edits. The plan needs to update the canonical, not create a new commitment.

**Plan's handling**: Implied via `textVariants[]` (line 198) but no explicit flow for user-edits or evolving commitments. The "user can dispute via `[[unresolve]]` directive" is the only edit mechanism described, and that's for auto-resolutions only.

**Real-world friction**: John edits commitment text → does that touch the hash → does the dedup pipeline re-fire and either re-canonicalize or stay attached? If text changes, the `sha256(text + direction)` hash changes, breaking dedup. Plan needs a `[[edit]]` directive that keeps the same ID + appends old text to `textVariants`, OR a "commitment revision" concept.

**Recommendation**: Add an AC: "user edits commitment text on canonical → ID stable, old text moves to textVariants, dedup pointers from dupes remain valid." Otherwise edits will quietly recreate the rot the plan is trying to fix.

### G5: Chat-first approval at 7 meetings × 4 items each

**Scenario**: Tuesday 6/02 winddown had 6 meetings × ~5 items each = ~30 staged items. After dedup let's say 22 unique. The plan proposes chat-first MCP-action approval. John scrolls through 22 items in chat with [Approve][Defer][Dismiss] buttons each.

**Plan's handling**: Lines 244-261 show the format. It looks clean for 3 items. Mentally extrapolate to 22.

**Real-world friction**: Chat surfaces aren't great for batch review of dozens of items — losing your place, no filter, no sort. The current per-meeting UI groups items in context (which conversation produced them). Pure chat-first risks being SLOWER than today's per-meeting UI for a moderately busy day.

**Recommendation**: Either (a) keep the per-meeting UI as the primary batch surface and let chat-first be for the "Closed today (auto)" + "Uncertain — your call" subset only; OR (b) be explicit that chat-first wins for ≤10 items, UI for >10. The plan currently sells chat-first as the default — push back on that for a primary daily user. Phase 9 winddowns are dense; chat is the wrong native surface for 30-line batches.

### G6: Stakeholder bloat on long-tail commitments

**Scenario**: "Send Lindsay the deck" gets surfaced in the Mon 1:1, Tue PM bi-weekly, Wed Glance sync (Anthony mentions it), Thu Email Templates Weekly. By Thursday, stakeholders = [Lindsay, James, Anthony, Luke]. The original recipient was Lindsay. Is Anthony actually a stakeholder?

**Plan's handling**: R7 (line 415) names this — "cap visible stakeholders to 5". Cap is a band-aid; it doesn't address "Anthony mentioned this in passing, he isn't a real stakeholder."

**Real-world friction**: Distinction between *recipient/owner* and *mentioned-in-the-context-of* gets lost. The deck goes to Lindsay; Anthony commented on it once. Plan's data model has stakeholders as a flat array.

**Recommendation**: Either (a) split `stakeholders` into `primary_counterparty` (single, the actual recipient) + `mentioned_in_context` (the others), OR (b) acknowledge this in non-goals and trust manual edit. (a) is cleaner long-term; (b) is the bloat-is-the-antagonist response. Lean (b) for v1, but add an AC that the canonical's `personSlug` field remains a single counterparty for the legacy people-memory aggregations to work (Lindsay's interaction log shouldn't list every commitment-where-she-was-mentioned).

## Scope concerns

**Trim candidates (move to Phase 11 or later)**:

1. **External-source resolution detection (10c)** — Highest-risk feature, biggest trust-crater downside, and the LEAST proven by today's winddowns. Looking at 6/01, 6/02, 6/03 winddowns: zero of the "Closed today (proposed)" entries were Slack-evidenced auto-resolves; all came from in-meeting mentions or calendar events. The current loop reconciler already handles those well. Strip 10c entirely from this phase. Phase 11. The dedup work alone heals the visible rot.

2. **Background dedup verb `arete dedup` (10e)** — 2-3 days for something Q6 already proposes as manual-only-v1. If reactive dedup works, the background verb is hygiene-only. Defer.

3. **Decisions/learnings dedup via the same pipeline** — flagged in 10b. Worth doing eventually but not visible in the same pain way as commitments. Looking at the winddowns, John flags COMMITMENT dupes constantly and learning dupes never. Defer to Phase 11.

**Features missing / would-reach-for-in-week-one but aren't here**:

1. **A "show me what got merged today" debug verb.** John will need to inspect the dedup decisions ON DAY 1 of soak — not at the end. Plan mentions a "chef reasoning log" + a "dev/diary/dedup-log.md" but no command to query them. Add `arete dedup --explain <commitment-id>` that shows "this canonical absorbed items X, Y, Z because <reasoning>".

2. **A revert-merge command.** If the LLM merges two distinct commitments, John needs a single command to split them back out. Plan mentions `[[unresolve]]` for auto-resolves but no equivalent for `[[unmerge]]`. Required for trust.

3. **Soak-period "dedup confidence" surface.** During the first 14 days, ALL dedup decisions (even high-confidence) should surface visibly. AC5 hints at this but it's underspecified. Make it a soak-mode flag.

**Sizing**: 3-5 weeks is too long for a single phase given Phase 9 just landed. Split into 10a (data model + migration, ~1 week), 10b (reactive dedup at extraction, ~1 week), then a 14-day soak gate BEFORE 10c/d/e. If the 10a+10b combo measurably cures the rot in 6/01-6/03 winddown shape, ship as Phase 10 and call 10c+10d+10e a Phase 11 plan rewritten with soak learnings.

## User-trust risks

1. **Auto-resolve that turns out wrong, discovered 2 weeks later.** Plan has `[[unresolve]]` for the next winddown, but what about 2 weeks later? Auto-resolves should remain visible in the commitments file (status: `resolved` with `resolvedBy: auto-*`) and `arete commitments list --auto-resolved` should be a real query. AC12 names auditability but doesn't specify discoverability after the winddown they originated in.

2. **The one-shot migration on production data.** Plan is good (backup + dry-run + reversible restore). But the worst case isn't "migration fails and we restore". The worst case is "migration succeeds, looks fine, but quietly merged two distinct commitments at row N, and John discovers it 4 days later in a 1:1 when he says 'I owe you the deck' and Lindsay says 'you gave that to me last week'." Recommendation: pre-migration, run dry-run, persist the diff report as a real artifact (not just a one-time view). John should be able to grep the diff report any day post-migration. Today's `arete commitments restore --from commitments.pre-phase-10.json` is binary; preserve the audit trail for partial-rollback inspection.

3. **Honors prior memories partially.** "AI fix escalation — cheapest first" memory says tier bump → prompt tighten → architecture. This phase is full-on architecture. Defensible because Phases 2-9 already did the cheaper fixes (followup-6 mirror-pair, Phase 8 reconciler, Phase 9 brief primitive). But re-state this in the plan to acknowledge — "we've exhausted cheaper paths; this is the substrate change." Otherwise it reads as not honoring the heuristic.

4. **"L3 memory should be automated" memory** says memory views should be computed, not user-maintained. The plan's `textVariants[]` capped at 10 (Q3) is a computed view — good. But the stakeholders bloat (G6) edges toward user-maintained ("manually edit who's a real stakeholder"). Worth tagging.

## Recommended scope split (if "REVISE BEFORE BUILD")

**Phase 10 (lean, ~1.5-2 weeks)**:
- **10a**: data model v2 + migration tooling (3-5 days). Includes the diff-report-as-artifact + restore verb.
- **10b**: reactive dedup at extraction time. Hybrid pipeline. Per-meeting UI dupe badges. Cross-meeting dedup with `meetingDate`-based temporal window, NOT `createdAt`-based. (~5-7 days)
- **Soak gate** (14 days). KPI: does the `28db8695`-style 7-way commitment-rot pattern disappear or get reduced to 1-2x?

**Phase 11 (deferred)**:
- **11a** (was 10d): unified approval surface — IF soak shows John actually wants it; if per-meeting UI proves sufficient, drop entirely.
- **11b** (was 10c): external-source resolution detection — slack first, NOT email, with explicit HIGH-confidence + meetingDate-temporal-window + artifact-name match required.
- **11c** (was 10e): background dedup verb. Hygiene only.

This split also removes the dependency between data-model migration and external-source detector — the latter is a much more invasive bet that should land standalone.

**What MUST stay in Phase 10** that's load-bearing: data model migration (everything downstream depends on it), reactive dedup (the actual visible pain), per-meeting UI dupe badges (the user-facing artifact), the `commitments.pre-phase-10.json` backup + restore.

**What's MISSING from any plan** that's load-bearing for chef-orchestrator: a chef-side "reasoning log surface" John can query mid-day ("why did you merge these?"). The plan has the log but no query. Add it to 10b.

## Question-by-question response to Q1-Q6 in the plan

- **Q1 (semantic-dedup LLM tier — extraction vs standard)**: Standard. Agreed with plan. False merges are the trust crater; pay for accuracy. But also: in soak mode (first 14 days), use Sonnet-equivalent and surface confidence scores in the chef reasoning log. After soak, can re-evaluate if cheap tier is sufficient given threshold tuning.

- **Q2 (external-source auto-resolve: wait for confirm vs batch review)**: If we keep external-source in Phase 10 at all, batch review. Agreed with plan. Per-item confirm destroys flow. BUT — strong recommendation: DEFER external-source to Phase 11. Today's winddowns don't show external-source auto-resolves as a real pain; current calendar/meeting-mention reconciliation already handles "Closed today" candidates well (see 6/01 CT1, 6/02 CT1).

- **Q3 (textVariants cap)**: Cap at 5, not 10. 10 is bloat. If a commitment has been extracted 10 different ways, something else is wrong. 5 is enough to preserve provenance while staying scannable.

- **Q4 (cross-day dedup on day 1, or same-day first)**: Same-day on initial ship, extend after 7 days. Agreed with plan, slightly stronger. The 6/02 winddown shows `28db8695` was created 5/29 and surfaced again 6/02 — cross-day IS needed eventually. But ship same-day for the first week to catch reactive bugs in a smaller surface area. Critical: when cross-day extends, use 7 days first, not 14. Test the window size empirically.

- **Q5 (migration canonical: oldest createdAt vs most-edited text)**: Oldest. Agreed. Preserves earliest provenance + user-edited later text moves to textVariants. Don't overthink this one.

- **Q6 (background dedup verb: scheduled vs manual)**: Manual only. Agreed. Add: if soak shows >5 dupes/week accumulating despite reactive dedup, then reconsider scheduling. Don't pre-build the cron.

---

## Bottom line

The chef-orchestrator vision is right. The plan correctly identifies and architects the dedup substrate. But the plan packages too much. Ship 10a+10b as Phase 10, gate the rest behind soak. The biggest risks are: (1) auto-resolve trust crater that the plan correctly names but still ships, (2) approval-surface UX assumption that chat-first beats per-meeting UI for batch days, (3) temporal-window-on-createdAt logic that breaks async meeting review.

If trimmed and revised on the workflow gaps, this is the right next phase. As written, the cost-benefit for a 3-5 week monolith landed right on top of Phase 9's brief primitive is shakier than it needs to be.
