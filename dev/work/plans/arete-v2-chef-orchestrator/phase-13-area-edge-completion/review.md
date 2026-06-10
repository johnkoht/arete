> Independent eng-lead review — dispatched headless (`claude -p`, model: opus, fresh context, review-plan skill discipline) by the planning orchestrator on 2026-06-10. Combined document covering BOTH follow-up plans + cross-cutting structure/coverage analysis; saved verbatim (preamble line stripped) into each plan dir. Findings dispositioned in each plan's "Review disposition — 2026-06-10" section.

---

# Independent Eng-Lead Review — Phase 13 & Phase 14

**Reviewer role**: Senior engineer, second opinion (did not author these plans).
**Method**: Full Review path per `.pi/skills/review-plan/SKILL.md` — code-grounded expertise load (core + cli profiles via direct code reads), LEARNINGS scan (`services/LEARNINGS.md`, `cli/commands/LEARNINGS.md`), Plan Review Checklist + AC rubric, mandatory Devil's Advocate, per-plan verdict.

**Code spot-checks performed** (claims verified against reality):
- `meetingsForArea` (`brief-assemblers.ts:238-243`) — **confirmed currently a UNION** (`m.area === areaSlug || m.topics.includes(areaSlug)`), not topics-only. Call sites `:1202`, `:1381`, `:1626` all route through it — **confirmed**.
- `loadMeetingIndex` reads `fm.area` only (`:174`) — **confirmed**; the absent-writer bug is real.
- `applyAreaToProjectReadme` (`project-area.ts:99-112`) — **writes unconditionally**; guarantees *identical content*, NOT *zero write calls*. Important for AC calibration below.
- `renderSection` (`brief-formatters.ts:31-33`) unconditionally prepends `- ` → the `-   - …` double-nest (#8) is **confirmed real**.
- `suggestAreaForMeeting` (`area-parser.ts:392`) internal threshold is **0.5**; the 0.7 floor is enforced by callers (`project.ts:104`, `commitments.ts:403`) — **confirmed**, plans correctly locate the floor at the call site.
- Meeting `area:` → commitment inheritance: `meeting.ts:1736` reads `frontmatter['area']`, consumed at `:2027/:2038/:2054` — **AC2's inheritance claim confirmed**.
- `assembleProjectWhatsNew` (`:1362`) is read-only and uses `meetingsForArea` — **phase-14's dependency claim holds**.
- Sibling archive lookup (`:1306`) checks `archive/<slug>/` only; phase-14 data model itself shows `archive/2026-06_visioning-deck/` — **AC4's `YYYY-MM_` latent miss is confirmed real**.
- `/project` SKILL `:56` already lists siblings/wiki in brief sections but has no always-show/say-when-absent rule — **AC6 is non-redundant**.

---

## Review: phase-13-area-edge-completion

**Type**: Plan
**Audience**: Builder (internal tooling/CLI + runtime skill prose) — clear.
**Review Path**: Full
**Complexity**: **Large** (11 ACs, new core module `meeting-area.ts`, 2 new CLI verbs + 1 process modification, 1 service method, 2 skill-prose edits, ~640 logic LOC, semantic change to a shared filter)
**Recommended Track**: `full` (multi-phase, write surface, MC3 obligations)

### Concerns

1. **[Risk — semantic] AC1 + backfill interaction can *remove* correct topic-union matches; the plan only frames the leak side.** Today every meeting matches an area via the topics-union arm. The proposed per-meeting preference (`m.area ? m.area === areaSlug : m.topics.includes(areaSlug)`) means the moment a meeting gets *any* `area:` written, it stops matching via `topics:` for every other area. That is the intended leak fix — but for a meeting that legitimately belongs to multiple areas (pre-mortem R4, *parked*), a single backfilled primary area makes it **vanish** from the other area's brief where the topic match was previously correct. The plan's counter ("a wrongly-labeled meeting at least stops leaking everywhere else") acknowledges the leak axis but is silent on this recall-loss axis. This is R4 surfacing earlier than "later additive parser change."
   - Suggestion: Add one sentence to Design Decision 1 and the Skeptical-view counter naming the recall-loss case explicitly, and add an AC1 fixture: a meeting with `area: X` + `topics: [Y]` is confirmed **excluded** from Y (this is the documented, accepted trade-off, not a regression). The fixture makes the trade-off a tested decision rather than a surprise in soak.

2. **[Calibration] AC3's "zero write calls on rerun" is NOT the phase-12 backfill pattern it cites — it's stronger, and that costs LOC the anchor doesn't include.** `applyAreaToProjectReadme` (`project-area.ts:111`) writes unconditionally and only guarantees *identical content*. The phase-12 "zero-write" pattern (`services/LEARNINGS.md` 2026-06-10) was for **read-only `/project` open**, not for backfill apply. AC3 requires no-op detection (compare existing `area:`/`area_set_by:` before writing) which `meeting-area.ts` must add and which the `~120 LOC (anchor: project-area.ts = 115)` estimate does not reflect.
   - Suggestion: Either (a) keep the phase-12 backfill semantics (idempotent = identical content, which is what the project verb actually ships) and drop the "zero write calls" wording for the *backfill* path, OR (b) keep the stronger guarantee and bump the AC3 estimate ~+15-20 LOC for the change-detection branch. Don't cite a "phase-12 zero-write pattern" for backfill that the phase-12 backfill code doesn't implement.

3. **[Scope/estimate] AC2's process-integration estimate (~35 LOC) is the thinnest number in the ledger.** `meeting.ts` is a 2000+-line command; threading `proposedArea: {slug, confidence}` into *both* the JSON shape and the human one-line output, wiring `suggestAreaForMeeting`, and respecting `--json`/floor/silent-below-floor inside the existing `process` action is plausibly 50-70 LOC, not 35 — and it touches the highest-traffic command in the file. Phase 12 overran 2.5× precisely because per-AC numbers were "thin against the precedents being mirrored" (the plan quotes this). This AC repeats that pattern.
   - Suggestion: Re-anchor AC2's process block on an actual diff of a comparable `meeting process` output addition, not on the commitments-resolver closure (which lives in a different, simpler command). Flag AC2+AC3 as the two most likely overrun sites in the ledger's honest-flag paragraph.

4. **[Test quality] AC6 is a text-presence assertion, not a behavior test, and is marked (GATE).** "Skill-prose test asserts the always-show rule text" verifies a string exists in `project/SKILL.md` — it cannot verify the agent actually stops dropping sections. This is inherent to prose, but gating on it overstates the guarantee.
   - Suggestion: Keep it, but in the verdict/build-report note AC6 as "prose-pinned, soak-verified" (same honesty the phase-14 AC3 split applies) rather than implying a behavioral gate.

5. **[Verification gap] AC5's hash-invariant claim ("projectSlug is metadata, not part of dedup hash — same contract as area") is asserted, not cited to a test.** `commitments.ts:195` does mention a guard against metadata "leaking into" the hash, and `area` follows this, so the claim is *plausible* — but the plan should pin it.
   - Suggestion: Add an explicit AC5 unit assertion: stamping/clearing `projectSlug` on a commitment leaves its dedup hash/ID unchanged (mirror the existing `area`-not-in-hash test).

### AC Validation Issues

| AC | Issue | Suggested Fix |
|----|-------|---------------|
| AC1 | Accepted recall trade-off (multi-area meeting drops from topic-matched areas) is undocumented and untested | Add fixture asserting `area:`+`topics:` meeting is excluded from the topic-only area; note it as the deliberate R4-bounded trade-off |
| AC3 | "Zero write calls on rerun" cites a phase-12 pattern that the phase-12 backfill does not implement; estimate omits the change-detection cost | Pick identical-content (phase-12 actual) OR fund the stronger guarantee (+~15-20 LOC) |
| AC2 | "Process performs zero area writes" is testable & good; but `proposedArea` threading estimate (~35) is light | Re-anchor on a real `meeting process` output-addition diff |
| AC6 | (GATE) on a string-presence prose test | Label "prose-pinned, soak-verified," not a behavioral gate |
| AC5 | Hash-invariant asserted, not pinned | Add hash-unchanged unit assertion |

### Test Coverage Gaps

- AC1: no fixture for the **accepted exclusion** case (multi-area / area-overrides-topic). Add it (Concern 1).
- AC3: counting-adapter "zero write on rerun" depends on Concern 2's resolution; if you keep identical-content semantics, change the assertion to snapshot-equality instead.
- AC5: hash-invariance not asserted (Concern 5).
- Otherwise test strategy is strong: leak/miss/fallback fixtures, counting-adapter for zero-write-on-process, snapshotTree for preview, real-fs integration (honoring the no-mocks-for-memory LEARNING).

### Strengths

- **Genuinely the third instantiation of a shipped contract** — verified: `suggestAreaForMeeting`, `writeWithLock` (shallow-merge + mtime-guard + atomic write, `meeting-lock.ts:208`), and the preview/`--apply`/`--reset`/0.7-floor/`area_set_by` shape all exist and are reused, not reinvented.
- **`hashMeetingSource` body-only invariant is correctly invoked** (`services/LEARNINGS.md` 2026-04-23/29) — adding `area:` to *frontmatter* provably won't bust the extractor's dedup. This is a verified non-risk, stated as such.
- Line refs are *more accurate than the punch list* (`:174`/`:238` vs the punch list's stale `:1783`/`:242`) — the author re-verified against current code.
- AC8 (#7-9) fixes are correctly targeted: the `renderSection` double-nest and the unconditional `- ` prefix are exactly as described.
- AC4 archive-prefix fix (`YYYY-MM_<slug>`) is a real latent miss caught while planning, confirmed against the phase-14 data model's own path.
- Honest LOC flag ("phase-12-build-sized, not a patch") directly answers pre-mortem R8.

### Devil's Advocate

**If this fails, it will be because…** the meeting backfill mislabels at scale exactly as R3 warned for projects — but with a sharper edge than projects had: `suggestAreaForMeeting` awards **0.8 confidence on a bare area-*name* substring match in the title** (`area-parser.ts:432`). A meeting titled "Glance comms sync" scores 0.8 → `glance-comms` even if the content is mostly claims work. Combined with Concern 1 (per-meeting preference suppresses the topic-union arm), one confident-but-wrong 0.8 write both (a) injects the meeting into the wrong area's brief and (b) removes it from the right one. The 0.7 floor does not catch a 0.8 name-match. The MC3 long-tail spot-check is the only thing standing between this and silent corruption — and it's a John-operated manual step.

**The worst outcome would be…** John applies backfill across hundreds of historical meetings, the 0.8 name-matches scatter meetings into plausible-but-wrong areas, and **phase-14's `/update-project` scan then reads those wrong areas as ground truth** and confidently proposes README edits sourced from mis-areaed meetings. The phase ordering means this phase's mislabels become next phase's confident-wrong writes — the exact compounding the two-phase split was meant to prevent.

### Verdict

- [ ] Approve
- [ ] Approve with suggestions
- [x] **Approve pending pre-mortem**
- [ ] Revise

**Rationale**: A **Large** plan with `has_pre_mortem: false` cannot be "Approve" per the rubric's pre-mortem gate. More substantively, this phase introduces a *new* risk surface the inherited phase-12 pre-mortem does not cover: (1) the 0.8-name-match mislabel on meetings, (2) the AC1-preference recall-loss for multi-area meetings, (3) the cross-phase compounding into phase-14 inputs. Much of the pre-mortem work is already done (inherited R2/R3 + the skeptical view), so this is a **small delta pre-mortem** — three risks, not a full rerun. The plan is otherwise unusually disciplined and the slices ship independently.

### Suggested Changes (Mode B)

- **Change 1 [Risk]**: Document + test the AC1 recall trade-off. *Where*: Design Decision 1 + new AC1 fixture.
- **Change 2 [Calibration]**: Resolve AC3's zero-write-vs-identical-content mismatch and adjust the estimate. *Where*: AC3 row + ledger.
- **Change 3 [Estimate]**: Re-anchor AC2's process-block LOC; name AC2/AC3 as overrun-prone. *Where*: ledger honest-flag paragraph.
- **Change 4 [Verification]**: Add the projectSlug-not-in-hash assertion (AC5) and relabel AC6 as prose-pinned.
- **Change 5 [Pre-mortem]**: Run a 3-risk delta pre-mortem (0.8 name-match mislabel; multi-area recall loss; phase-14 input contamination) before `/approve`.

---

## Review: phase-14-project-write-back

**Type**: Plan
**Audience**: Builder (new runtime skill + CLI verb + PATTERNS.md) — clear.
**Review Path**: Full
**Complexity**: **Large** (write-back flow touching committed READMEs + wiki integration, new skill, new CLI verb with R1/R2 contract, PATTERNS entry, ~190 code + ~310 md)
**Recommended Track**: `full`

### Concerns

1. **[Test honesty — applies to AC1 too, not just AC3] The "honest verification split" is correctly disclosed for AC3 but quietly assumed for AC1.** AC3 explicitly states CI proves substrate + zero writes, prose pins behavior, soak verifies the live edit. Good — that's the right epistemic stance. But **AC1's** "apply EXACTLY the approved items; rejecting everything leaves the README byte-identical" is *equally* LLM-mediated and equally un-CI-testable, yet AC1's verification column lists "Integration (substrate)" that only proves the contradiction *reaches* the agent. The byte-identical-on-reject guarantee for the **skill path** is never CI-covered (only the `refresh-topics` *verb* gets a snapshot test).
   - Suggestion: Apply AC3's honest-split language to AC1 explicitly. State that the only CI-enforced write-safety is (a) the `refresh-topics` verb's snapshot test and (b) the AC4 regression wall; the skill's apply/reject discipline is prose-pinned + soak-verified. Don't let AC1's "(GATE)" imply CI proves reject-leaves-untouched.

2. **[R7 evaluation — Decision 4 is a legitimate discharge, not a dodge — but verify the dogfood claim's strength].** Decision 4 routes the retro through `items/decisions.md` + the existing `topic refresh` engine instead of a bespoke area-page writer. **This genuinely eliminates the R7 surface** (no new code touches a live wiki page; integration inherits the extractor's enum-key/length-cap/`---`-reject safeguards per `services/LEARNINGS.md` 2026-04-23). It is *stronger* than R7's own suggested mitigation (which still wrote to the page via `parseTopicPage`/`renderTopicPage`). **This is a real win, not scope avoidance.** One caveat: the plan states dogfooding "already validated" this; the punch list (#2) is softer — "that pattern worked and *may* inform/simplify AC8." The plan slightly upgrades "may inform" to "validated."
   - Suggestion: Keep Decision 4 (it's the right call). Soften "dogfooding already validated" to match the punch list's evidentiary strength, and keep OQ1's John-sign-off gate (correctly present). AC5 staying **STRETCH** is appropriate.

3. **[Calibration] AC2's topics-writer estimate (~80 LOC) under-counts the re-rank + change-detection that `project-area.ts` doesn't have.** The anchor is "project-area.ts apply/reset = ~60 actual, plus re-rank wiring." But the writer must: call `buildProjectWikiQuery` + `retrieveWiki`, extract top-5 slugs, apply a **confidence floor** (where does a slug "confidence" come from in `retrieveWiki`'s ranked output? this needs a defined threshold), compare slug *sets* for the change-gate, do a wholesale two-key rewrite, and insert-once/preserve the ownership comment. The change-detection (the R2 zero-write core) is net-new vs `project-area.ts`, which writes unconditionally (verified `:111`).
   - Suggestion: Bump AC2 code estimate to ~100-120 and specify the slug-confidence-floor source explicitly (is it `retrieveWiki` score ≥ threshold, or just top-5-by-rank with no floor?). "Cap 5 + confidence floor" is under-specified for an AC marked (GATE).

4. **[Edge case — inherited from phase-12] `assembleProjectWhatsNew` uses `m.date > sinceDay` (day-granularity, `:1382`).** A meeting that happens the **same day** the README was last touched is excluded (`m.date > sinceDay` is false when equal). The June-fixation *fixture* controls for this ("post-README-mtime"), so AC3 passes — but the **live** June-fixation analog (Step 3 of post-merge order) could miss a same-day contradiction, producing a false "nothing new" and zero proposals. This is the "proposes nothing" failure the skeptical view names, with a concrete mechanism.
   - Suggestion: Note this day-granularity boundary in AC3's soak step and in OQ3, so the first live run isn't misread as "the flow is too conservative" when it's actually a same-day mtime artifact. (Fixing it to timestamp-granularity is a phase-12 `assembleProjectWhatsNew` change, out of scope — but the soak must know.)

5. **[R10 containment is asserted; add the grep to the gate, not just the review].** AC4 says "grep-level audit in review: `applyAreaToProjectReadme` + the new topics writer are the only README writers." Good intent, but a manual review grep is weaker than a test. R10's whole point is preventing accidental load-bearing reads of `topics:`.
   - Suggestion: Add a cheap assertion that the `Project` read-model's `topics?`/`topicsRefreshed?` are populated for display only — e.g., a test confirming no brief *section* or behavior branches on `topics` (grep encoded as a test that fails if a new consumer appears). At minimum, make the grep a recorded build-report artifact, not an ephemeral review step.

### AC Validation Issues

| AC | Issue | Suggested Fix |
|----|-------|---------------|
| AC1 | (GATE) implies CI proves apply/reject discipline; only the verb is snapshot-tested | Apply AC3's honest-split language to AC1; scope what CI actually enforces |
| AC2 | "Cap 5 + confidence floor" under-specified; estimate omits re-rank + change-gate | Define the slug confidence source; bump to ~100-120 LOC |
| AC3 | Honest split is *good*; but it's a **substrate gate**, not a behavior gate — make the verdict say so | State in build-report that the acceptance behavior (right edit, touch-nothing-else) is unverified at merge, soak-only |
| AC5 | "dogfooding already validated" overstates punch-list #2's "may inform" | Match evidentiary strength; keep STRETCH + OQ1 gate |

### Test Coverage Gaps

- AC1 skill-path write-safety (reject → byte-identical) is **not** CI-covered — only prose + soak. Disclose (Concern 1).
- AC2 confidence-floor behavior has no specified test because the threshold source is undefined (Concern 3).
- R10 non-consumption has no automated guard (Concern 5).
- AC2's frontmatter round-trip test (nested `notion:`/`jira:` survive) and ownership-comment-once are well-specified — good.

### Strengths

- **R1/R2 are discharged in *tested code*, not prose** — the decision to make topics persistence a CLI verb (`refresh-topics`) with a counting-adapter zero-write-on-no-change test is exactly what R2 demanded ("assert *zero write calls*, not merely identical content"). This is the single best design choice in either plan and directly answers the pre-mortem's strongest objection.
- **R7 is dissolved structurally** (Decision 4) rather than hardened — eliminating the risky surface beats mitigating it.
- **R10 ownership comment doubles as the do-not-depend notice** — verified the pattern aligns with the `topics:` ownership-comment design from phase-12.
- AC6 ships PATTERNS.md **before** the skill (MC4), enforced by commit order — correct sequencing for a reusable pattern.
- The skeptical view is genuinely adversarial ("June-fixation test is theater," "topics is the followup-5 rejection in a trenchcoat") and the counters are substantive, not defensive.
- Code estimate (~190) is *more credible than phase-13's* because the flow reuses phase-12/13 CLI output rather than building a parallel scan — the substitution argument ("the alternative is invisible LOC in prose") is correct.

### Devil's Advocate

**If this fails, it will be because…** the proposal quality lands in the dead zone the skeptical view names: conservative enough that John stops invoking it (the `synthesize` fate, already in memory as a cautionary tale), or chatty enough that approving items is slower than just editing the README. CI cannot catch this — AC3's substrate gate is green while the actual product value (does it propose the *right* edit and touch nothing else?) is entirely soak-gated. The plan is honest about this, but honesty doesn't de-risk it: the phase ships with its core value proposition unverified at merge by construction.

**The worst outcome would be…** John approves a confidently-wrong proposed edit because the source attribution made it look authoritative — the same confident-wrong failure family as R3, now writing to a committed README. Per-item approval + source quoting are the mitigations, but they depend on John reading carefully every time; the flow's value (low friction) is in tension with the safety mechanism (careful per-item review). If the same-day mtime artifact (Concern 4) *also* suppresses the legitimate contradiction, the one edit that *does* surface is disproportionately likely to be the spurious one.

### Verdict

- [ ] Approve
- [ ] Approve with suggestions
- [x] **Approve pending pre-mortem**
- [ ] Revise

**Rationale**: Large + `has_pre_mortem: false` → cannot be "Approve" per the gate. The plan carries phase-12's R1/R2/R7/R10 well (R2's tested-zero-write is exemplary, R7 is dissolved), so the delta pre-mortem is narrow: it should cover the **write-back-specific** risks the phase-12 pre-mortem didn't — proposal-quality dead zone, the merge-time-unverified acceptance behavior, the same-day-mtime suppression, and `items/decisions.md` dilution. The build is sound; the residual risk is concentrated in soak, and that should be named in a pre-mortem before `/approve`, not discovered during the 3-run soak.

### Suggested Changes (Mode B)

- **Change 1 [Test honesty]**: Extend AC3's verification-split disclosure to AC1; scope exactly what CI enforces on the skill path vs the verb. *Where*: AC1 verification column.
- **Change 2 [Spec]**: Define the AC2 slug confidence-floor source and bump the code estimate to ~100-120. *Where*: AC2 row + ledger.
- **Change 3 [Soak]**: Add the same-day-mtime boundary note to AC3's soak step / OQ3 so a missed same-day contradiction isn't misread as over-conservatism. *Where*: AC3 + post-merge order Step 3.
- **Change 4 [R10]**: Promote the "only-two-README-writers" grep + the no-consumer-of-`topics` check into recorded build-report artifacts. *Where*: AC4.
- **Change 5 [Evidence]**: Soften "dogfooding already validated" (Decision 4 / AC5) to match punch-list #2. *Where*: Decision 4.
- **Change 6 [Pre-mortem]**: Run a delta pre-mortem (proposal dead-zone; merge-unverified acceptance; same-day suppression; decisions-stream dilution) before `/approve`.

---

## Cross-cutting

### (a) Phase structure — is the 13/14 split justified? Merge, re-split, or keep? Is moving #3,#6,#7-9 into phase 13 sound?

**Keep the split. The dependency direction is real, verified in code, not aesthetic.**

- Phase 14's scan input is `assembleProjectWhatsNew` → `meetingsForArea` (`:1381`), which is **exactly** the function phase 13's AC1 fixes. Confirmed in code: phase 14 reads what phase 13 corrects. A write-back flow proposing README edits from leaked/missed meetings proposes confidently-wrong edits — so phase-13-before-14 is a true precondition, not packaging.
- Phase 14 also consumes phase 13's claim verb (AC5 → phase-14 OQ3's proposal menu item). Confirmed coupling.
- Risk profiles genuinely differ: phase 13 is read-side + one heavily-precedented write surface (three prior instantiations, verified); phase 14 is the LLM-judgment write-back to committed files + wiki. Isolating the latter keeps the heavier review focused — sound.
- **Merging would be wrong**: combined they exceed phase-12's *actual* build (608 LOC), reproducing the "it's just a follow-up" R8 trap the plans explicitly cite.
- **One re-split worth considering**: phase 13 is itself Large and bundles three independent concerns (meeting-area write surface [AC2/AC3], claim tooling [AC5], read/render polish [AC1/AC4/AC6/AC7/AC8]). The plan's own Slice A/B/C boundary already reflects this. If calibration risk materializes (Concern 3 above), Slice A (read/render, zero behavioral risk) is independently shippable and *should* ship first regardless — the build orchestration already says so. No formal re-split needed; just hold the slice discipline.

**Moving #3, #6, #7-9 into phase 13 is sound.** They are dependency-free, touch the three files phase 13 already opens (`brief-assemblers.ts`, `brief-formatters.ts`, `project/SKILL.md`), and #3 (always-show siblings) is correctly co-located with #4 (area-derived siblings) — "always show" is only honest once the section is reliably non-empty, and both now live in the same phase. The only cost is that it pushes phase 13 to phase-12-build size, which the plan flags honestly. Accept the deviation.

### (b) Punch-list coverage — every actionable item (1-9, 12) mapped to an AC? Anything dropped or distorted?

**Full coverage. Nothing dropped. One minor evidentiary overstatement (Decision 4).**

| Punch item | Mapped to | Status |
|---|---|---|
| #1 `/update-project` (Slice D) | Phase 14 AC1 + AC2 | ✅ |
| #2 close→retro (Slice E) | Phase 14 AC5 (STRETCH) | ✅ (mechanism revised — see note) |
| #3 always-show siblings/wiki | Phase 13 AC6 | ✅ |
| #4 siblings from `area:` membership | Phase 13 AC4 (+ archive-prefix bonus fix) | ✅ |
| #5 commitment claim tooling | Phase 13 AC5 (verb) + Phase 14 OQ3 (skill step) | ✅ both forms |
| #6 `jira:` read-side | Phase 13 AC7 | ✅ |
| #7 raw `### YYYY-MM-DD` status | Phase 13 AC8(7) | ✅ |
| #8 double-nest bullets | Phase 13 AC8(8) | ✅ (bug confirmed in code) |
| #9 HTML-comment excerpts | Phase 13 AC8(9) | ✅ |
| #12 meetings `area:` edge | Phase 13 AC1/AC2/AC3 | ✅ |
| #10 wiki section variance | Parked (watch) | ✅ correctly deferred |
| #11 landing-pad validation | Parked (resolved-positive) | ✅ |

**No distortions of substance.** #4 is faithfully implemented as a union (area-actives ∪ link-graph supplement), matching the punch list's "keep link-graph as a supplement." #5 covers both the CLI verb (#5's "CLI verb") and the skill step (#5's "or skill step in split/update flows"). The only soft spot is Decision 4's "dogfooding already validated" vs punch #2's "that pattern worked and *may* inform/simplify" — an overstatement of evidentiary strength, not a coverage gap (Concern 2 in phase 14).

### Binding-constraint scorecard (R1, R2, R7, R10)

| Constraint | Demand | Baked in? | Verdict |
|---|---|---|---|
| **R1** | persistence only via `/update-project`, never on open | Phase 14 AC1 + AC4 regression wall; topics writer is a verb the skill calls *after* approval | ✅ **Genuine** — enforced in tested code + existing phase-12 zero-write suite stays green |
| **R2** | *zero write calls* on no-op (not identical content) | Phase 14 AC2 "zero write calls even with `--apply`" via counting adapter | ✅ **Genuine and exemplary** — exactly the stronger assertion R2 named. ⚠️ But note: phase-13 AC3 *miscites* this pattern for backfill (see phase-13 Concern 2) |
| **R7** | wiki writes get heavier review | Phase 14 Decision 4 routes via `items/` + existing `topic refresh`, eliminating the bespoke-writer surface | ✅ **Legitimate discharge, not a dodge** — stronger than R7's own suggested mitigation; AC5 stays STRETCH + OQ1 sign-off gate |
| **R10** | topics cache must not become load-bearing | Phase 14 ownership comment = do-not-depend notice; "no consumer reads it for behavior" | ⚠️ **Mostly** — asserted via a manual review grep, not an automated guard (phase-14 Concern 5) |

**Bottom line**: Two disciplined, honestly-scoped plans. The split is correct and the constraint-handling is above the bar — R2 and R7 in particular are handled better than the pre-mortem asked for. Both warrant a **narrow delta pre-mortem** before `/approve` (Large + no pre-mortem, plus genuinely new risk surfaces neither inherited pre-mortem covers): for phase 13, the 0.8-name-match mislabel + AC1 recall-loss + cross-phase contamination; for phase 14, the proposal dead-zone + merge-unverified acceptance behavior. The calibration risk is concentrated in phase-13 AC2/AC3 (the two thinnest estimates, repeating the phase-12 overrun pattern) — hold the Slice A-first discipline and verify the section-count/fixture gates before funding Slices B/C.
