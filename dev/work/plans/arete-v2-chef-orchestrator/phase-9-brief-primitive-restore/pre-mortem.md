# Phase 9 Pre-Mortem

**Authored**: 2026-06-03
**Plan**: phase-9-brief-primitive-restore/plan.md (v2)
**Stance**: pessimistic — imagining this has shipped and failed two weeks from now

## Verdict: PROCEED WITH MITIGATIONS

Plan v2 is in good shape after the eng-lead review pass. The architectural spine — pure-aggregator typed modes, agent does synthesis in chat context, source paths everywhere — is the right answer to the regression. C1-C4 mitigations are well-targeted.

What worries me is **not** the brief verb itself. The verb is a few hundred LOC of file-system aggregation with deterministic structure; it'll build clean. What worries me is the **AC8a tail**: the workspace-wide LLM refresh that has to run before AC10 can pass, the cost surprise hiding in the per-person × per-meeting multiplier, and the silent quality regression where stances populate with thin/hallucinated content that LOOKS like the wiring worked. F1, F2, F3 below all live in that tail. The verb ships; the data feed under the verb is the failure surface.

Secondary worry: the SKILL.md refit assumes the agent will actually invoke the new verb. We've seen agents skip prose steps (Phase 8 prereq-check misfire). Without an observable signal that the verb was called, AC10 can pass on the build-day session and silently regress in soak. F4.

Mitigations below are mostly small additions (build-step checkpoints, sampled-quality gates, observability shims). Do them; ship.

---

## Top failure modes (HIGH — must mitigate before build)

### F1: AC8a populates Memory Highlights with hallucinated stances; quality regresses BELOW the empty-stances baseline

**Scenario**: Build-day, AC8a fires `arete people memory refresh --if-stale-days 0` workspace-wide. Cost preview shows $4.20, user confirms, refresh runs. Stances populate for ~80 people. The next morning, a soak run of `/prepare-meeting-agenda` for the John/Anthony 1:1 produces an agenda confidently citing "Anthony has repeatedly pushed back on POP migration timeline" — except Anthony has done no such thing; the extraction tier (Haiku-class) latched on to a sentence where John summarized someone else's concern about timeline in Anthony's presence. The agent weaves it into the agenda. Anthony reads it in the 1:1 and asks "where did this come from?" Trust crater. Worse, John can't easily walk back the file: 124 person files now contain LLM-extracted text indistinguishable in shape from previously-correct stances. The "rollback by reverting SKILL.md" path in the plan does not address the data-write component.

**Leading indicators**: During AC8a build step, sample 5-10 person files manually after the one-shot refresh. Specifically look for stances that don't appear in the source meeting body — stances attributed to person X that came from person Y's quoted speech. If sample turns up even 1 in 10 hallucinated, abort and revise.

**Probability**: Medium-high. `extractStancesForPerson` (person-signals.ts:165) was authored with `callLLM` as an abstract function; whether it was *tested against the extraction tier specifically* is unclear. Stance extraction is harder than action-item extraction (which has structural cues like "I will...") — stances are inferred from tone and indirect speech. Extraction-tier models trade quality for cost.

**Impact if it ships unmitigated**: HIGH. 124 person files quietly contaminated; rolling back requires either restoring backups (plan doesn't take any) or accepting that "stances are bad until manually scrubbed."

**Mitigation**:
1. **Add build step 12b: stance-quality sample gate.** After AC8a one-shot refresh, build agent samples 10 person files with newly-populated stances and presents them inline in the build report. User confirms quality before AC10 starts. This is a 5-minute user gate, not a 5-hour one.
2. **Add backup step in 14a.** Before `arete people memory refresh --if-stale-days 0` writes, snapshot the `<!-- AUTO_PERSON_MEMORY:START --> ... :END -->` blocks across all 124 person files to a single file (e.g., `dev/work/plans/phase-9-.../pre-refresh-memory-blocks.json`). This is the per-data-write rollback artifact the plan currently lacks.
3. **Promote AC8a tier choice to an explicit decision**: plan says "'extraction' tier per meeting.ts:838 pattern" — fine for meeting extraction (action items, structured), but stances are different. Add a sentence: "If sample-gate fails, retry stance extraction at 'standard' tier and re-evaluate cost." Currently the plan implicitly accepts whatever the extraction tier produces.

**Plan reference**: AC8a (line 374), build step 14a (line 404), rollback plan (line 454).

---

### F2: AC8a cost preview underestimates 5-10x because the formula models per-topic-page not per-person × per-meeting

**Scenario**: Build-day, AC8a runs `arete people memory refresh --if-stale-days 0 --yes` after preview. Preview borrows the `estimateRefreshCostUsd(integrations) = integrations × $0.015` formula from topic-memory.ts:1380. But that formula was calibrated for topic-page integration (one LLM call per topic per source). Stance extraction (`entity.ts:1354-1372`) is **per-person × per-meeting-they-appear-in**: Lindsay alone has 15 meetings in 90d = 15 LLM calls for her file. Across 124 people, conservative back-of-envelope (avg 5 meetings/person) → 620 LLM calls; pessimistic (10 meetings/person for actives) → ~1200 calls. At extraction-tier price (~$0.005-$0.02/call depending on transcript size), real cost is $3-$24, not the $0.50-$2 the topic.ts formula would estimate.

The user confirms a number, the actual bill is 3-10x that, and we've broken the "cost preview must be accurate" contract from Phase 7/8.

**Leading indicators**: Build-step 12a must include a dry-run trace that prints the actual count of (person, meeting) pairs that would be LLM-extracted. If that number > 500, the preview formula is wrong by construction.

**Probability**: High. The plan explicitly cites topic.ts:415 as the cost-preview pattern (line 401), which is the wrong unit of work. Reviewer didn't catch this in the C3 mitigation because they were focused on the wiring, not the cost shape.

**Impact if it ships unmitigated**: Medium (financial; small absolute dollars but breaks user trust in cost previews). HIGH (process; we have a "cost preview is the contract" principle).

**Mitigation**:
1. **Write a stance-specific cost estimator** in build step 12a. Pseudocode: `count = sum over people of count(meetings where person appears in last 90d) ; estimatedCost = count × COST_PER_STANCE_CALL`. Calibrate `COST_PER_STANCE_CALL` empirically by running 3 extractions and dividing total spend by 3.
2. **Add an explicit ceiling** to AC8a: "If estimated cost > $10, require interactive confirmation, not just `--yes`." Borrow the `seedMaxUsd` pattern from topic.ts:963.
3. **Reword AC8a's "pattern from topic.ts:415"** to "adapt cost-preview *gating* pattern from topic.ts:415; cost *formula* must be stance-specific (per-person × per-meeting), not per-integration."

**Plan reference**: AC8a (line 374-375), build step 12a (line 401).

---

### F3: Agent reads the brief output and IGNORES most of it, producing a thin agenda anyway

**Scenario**: Day-2 soak. User runs `/prepare-meeting-agenda` for the John/Lindsay 1:1. SKILL.md step 4 (refit) tells the agent to call `arete brief --meeting "John / Lindsay 1:1"`. Brief produces 9KB of structured markdown: 5 attendee mini-briefs, recent meetings, open commitments, related wiki pages. Agent reads it. Agent then produces a thin template-fill agenda anyway — 4 sections, one bullet each, no commitment IDs, no wiki callbacks. Why? Because the agent's "compose themed agenda" instruction is buried under 9KB of context and Claude's attention budget is finite; the template literally has section headers that pattern-match more strongly than the brief's prose. The agent fills the template and considers the job done. We have rich input feeding a thin output — the OPPOSITE of the regression diagnosis but the same observable outcome.

This is the failure mode that makes AC10 papered-over: the build-day session passes because the user is watching, the agent is in a careful mood, and the build report has both agendas inline. Soak runs lack that supervision.

**Leading indicators**:
- Diff April 29 agenda vs. brief output structure. April 29 agenda has "## Glance 2.0 Roadmap — Start the Conversation (20min)" — a *themed* section that doesn't appear in any input section heading. The agent synthesized that header from cross-source signal. The brief output structure does NOT have themed headers; it has "## Open commitments touching this group" etc. The agent has to RE-SYNTHESIZE themes from brief sections. If the LLM doesn't do that step, the agenda inherits brief headers verbatim — and the brief's headers are not the right shape for an agenda.
- During build-step 14, before AC10, **eyeball whether the prepare-meeting-agenda template's section names harmonize with brief output section names**. If they conflict, the agent will default to template names and ignore brief structure.

**Probability**: Medium. The plan's quality-bar text in SKILL.md ("synthesize, do NOT pattern-fill the template") is the right ask, but it's prose, not enforcement. We've watched agents skip prose instructions before (Phase 8 prereq-check).

**Impact if it ships unmitigated**: HIGH. This is the regression we set out to fix; if it persists, Phase 9 is net-zero work.

**Mitigation**:
1. **Add AC10b: themed-section verification.** AC10 already requires "≥ 3 themed sections (not just template)" but doesn't define "themed." Sharpen: "≥ 2 section headers in the produced agenda that are NOT verbatim template headers AND NOT verbatim brief section headers — i.e., synthesized themes."
2. **Run AC10 twice in build.** Once with the user watching (build-day) and once headless (kicked off as a soak-style invocation 6+ hours later, same meeting input, agent has no supervision context). Compare both. If quality degrades between supervised and unsupervised, F3 has materialized — fix SKILL.md prompt structure before merge.
3. **Add explicit "do not inherit brief headers" guidance to SKILL.md.** Currently step 4 says "use this brief to compose themed agenda sections." Strengthen: "The brief's section names ('Open commitments', 'Related wiki') are NOT agenda section names. Agenda sections are themed by *topic* (e.g., 'Glance 2.0 Roadmap', 'Discovery Process Update') and must be synthesized from the brief content, not copied from its structure."

**Plan reference**: AC10 (line 379), SKILL.md refit prose (lines 312-335 of plan), build step 14.

---

### F4: No observability that the agent actually called the new verb (SKILL.md prose is hopeful, like Phase 8 prereq-check)

**Scenario**: Day-7 soak. User notices agendas have been thin since Phase 9 shipped. Checks the prepare-meeting-agenda transcripts. Agent has been reading person files directly with the Read tool, ignoring `arete brief --meeting` entirely — same shortcut behavior as before Phase 9. The SKILL.md change told it to call the verb, but nothing enforced the call, and the agent's "I already know how to gather context" instinct dominated.

We don't notice for a week because there's no log of "brief verb invocations per day." AC10 passed because the build-day session followed the SKILL.md prose; soak doesn't.

**Leading indicators**:
- No invocations of `arete brief --meeting` in shell history after first 2 soak days.
- Agendas have brief-CLI Sources section paths that match what the agent read directly, but agent transcripts show no `Bash` calls to `arete brief`.

**Probability**: Medium. Phase 8 followup-2 already burned this lesson once (agents skip prose). The plan doesn't explicitly address agent-call observability.

**Impact if it ships unmitigated**: HIGH. Slow-burn discovery; we attribute the persistent regression to the wrong cause (assume verb is broken, when actually verb is never called).

**Mitigation**:
1. **Add build step 14b: shell-history grep check during soak.** Daily during the soak window: `grep "arete brief --meeting" ~/.zsh_history | tail -20` (or equivalent). If zero invocations on a day with a prepared agenda, alert.
2. **Have brief CLI emit a sentinel log line** that the soak diary check can grep for: write to `dev/diary/brief-invocations.log` on every typed-mode invocation (one line: `2026-06-04T09:32:11 --meeting "John / Lindsay 1:1"`). This is ~5 LOC in the CLI entrypoint and gives us a soak telemetry surface.
3. **Sharpen SKILL.md step 4** to make `arete brief --meeting` not just the recommended path but the gate: "Step 4a: Always invoke `arete brief --meeting`. If it returns 'unresolved' (AC4d path), then and only then fall back to per-attendee briefs. Do not skip to manual file reads — the brief verb is the single source of truth for context aggregation."

**Plan reference**: SKILL.md refit (lines 308-336 of plan), build step 14, AC9.

---

## Medium-risk modes (consider mitigating, low-cost)

### M1: `--meeting` slug-vs-calendar precedence picks the wrong occurrence for recurring meetings

**Scenario**: User runs `arete brief --meeting "John / Lindsay 1:1"` on a Friday morning, asking for the *upcoming* Monday occurrence. Plan precedence (line 187): "If input matches an existing meeting file slug → use that directly (deterministic)". But the user passed a *title*, not a slug. The title matches several past meeting files. If the resolver normalizes title→slug first, it'll match a past meeting; if it consults calendar first, it'll get the upcoming one. The plan is ambiguous in the boundary: "input matches an existing meeting file slug" vs. "input matches a saved agenda file" doesn't say what happens when the input is a free-text *title* that *normalizes to a past slug*.

The arete-reserv workspace has **10 john-lindsay meeting files** (verified). The precedence ladder picking the wrong one produces a confidently-wrong brief.

**Probability**: Medium. If the implementer uses startsWith/includes matching against meeting filenames, will silently match the most-recent past one. Cost-of-fix is low (define title-string vs slug-string types explicitly).

**Mitigation**: Add to AC4: "When input is a free-text title (not a slug-shaped string — no leading YYYY-MM-DD), skip the slug-match path and go directly to calendar+agenda match. Only inputs matching `^\d{4}-\d{2}-\d{2}-` regex are tried as slugs."

**Plan reference**: AC4 input handling, plan line 187.

---

### M2: Per-section 2K cap for attendee mini-brief truncates Lindsay's standing prompts

**Scenario**: Lindsay's person file is 8.3KB (verified). Her recent meetings count is 15 in 90d. Her commitments queue is active. The 2K cap on per-attendee mini-brief is going to bite — specifically, "Memory highlights" content (the asks/concerns/stances we just paid AC8a to populate) is at the bottom of the assembly order in most mini-brief shapes. If section order is metadata→recent→commitments→highlights and truncation hits at 2K, the highlights get dropped FIRST, even though they're the load-bearing signal.

The plan's truncation marker tells the agent "3 items dropped," but doesn't tell it the highlights section was the casualty.

**Probability**: Medium. 2K is tight for Lindsay; she's probably the worst case. For tactical-only attendees (Anthony, Greg) 2K is fine. The cap doesn't fail uniformly — it fails for the most important person.

**Mitigation**:
1. **Reorder mini-brief section composition: highlights FIRST**, then recent meetings, then commitments, then metadata. Truncation drops the tail (metadata/recent), not the load-bearing signal.
2. **Add a build-step assertion**: print Lindsay's full mini-brief size during build; if > 2K, raise the cap to 3K and re-verify total stays under 12K.

**Plan reference**: Design Principle 6 (line 118), AC11.

---

### M3: AC8a one-shot refresh contaminates Phase 8 soak signals

**Scenario**: Day-1 of Phase 9 ships into day-7 of Phase 8 soak. AC8a populates stances for 124 people. Daily winddown / loop reconciler now sees different inputs (richer person memory blocks). AC11 (Phase 8) measures winddown wall-time; if richer person blocks make the gather step slower by 30-90s, that could push a heavy day over the 45-min hard stop — attributed (wrongly) to Phase 8 regression. We revert Phase 8 thinking it failed, when actually Phase 9 changed the inputs.

Plan v2 says "no conflict — different observability surfaces" but doesn't argue it; just asserts.

**Probability**: Low-medium. Phase 8 reconciler reads person files; richer person files = slower reads, but probably not 30-90s slower in aggregate. Still, worth a measurement.

**Mitigation**: Add to build step 14a a measurement: before AC8a refresh, time a winddown run; after AC8a refresh, time another. If delta > 30s, surface in build report so we don't misattribute soak signals.

**Plan reference**: Plan v2's "no conflict" assertion (none explicit; implied by additive rollback plan).

---

### M4: `--project` mistyped → silent empty project section

**Scenario**: User types `arete brief --meeting "..." --project glance-2` (typo; actual slug is `glance-2-mvp`). Plan AC4a says project section uses the named project "unconditionally." If the slug doesn't resolve, what happens? Silent empty section? Error?

**Probability**: Medium. Slug typos are common; CLI doesn't autocomplete `--project` values.

**Mitigation**: Add to AC4a: "If `--project <slug>` does not resolve to an active project, error with `project '<slug>' not found; did you mean: <closest-match>?` Do not silently skip the project section."

**Plan reference**: AC4a (line 354-355).

---

### M5: `retrieveRelevant()` stale qmd index returns semantically-right-but-content-stale wiki matches

**Scenario**: Day-5 soak. User updated the "POP migration" topic page yesterday with new info. qmd index hasn't reindexed (config: nightly). Brief calls `retrieveRelevant()` → match returns, but `bodyForContext` is read **from disk** (verified at topic-memory.ts:1606), not from the qmd snippet. So actually content is fresh — the SCORE may be stale but the BODY is fresh. Phew.

Re-read confirms this is **NOT a real risk**: `retrieveRelevant` re-reads file content from storage after qmd returns paths only. The stale-index risk is only that a freshly-added topic page may not get RANKED, not that returned content is stale.

**Probability**: Low. **Ruled out** for content-staleness; small residual risk that a brand-new topic page (added since last qmd reindex) won't surface as a match at all — but that's the "qmd cold-start" problem, not a brief verb problem.

**Mitigation**: None needed. Plan's wiki integration is correct here.

---

## Low-risk modes / accepted residuals

- **MC2 error UX for positional arg confusion** (probed #9): The mutual-exclusion error message is for an interactive CLI used primarily by John (the builder = the user, per memory file). John knows `--for` vs positional. Acceptable v1.
- **Cap of 7 wiki pages crowding** (probed #8): Plan v2 builds in empirical verification in build report. Self-correcting via Q6 caveat. Not a pre-mortem-level risk.
- **AC1a "None detected yet" bleed** (probed #11): Parsing concern but solvable in formatter; plan calls it out and tests fixture-wise. Reviewer-grade concern, not pre-mortem-grade.
- **AC8a + AC10 chicken-and-egg silent failure** (probed #3): Subsumed by F1's sample gate. If the build-day sample gate verifies stances populated AND look real for 10 sampled people, we've de-risked the 80%-of-workspace silent failure.
- **`--for` divergence creates dual aggregator paths** (probed via MC5): Accepted v1 per plan's Non-goals.
- **`assembleBriefForMeeting` internal vs standalone --person divergence** (probed #13): Plan's per-mode internal limits (recent 5 vs 10) is an intentional composition choice; differential output is a feature for v1, not a bug. Document in build report.
- **Build agent cross-directory write** (probed #14): Build agent runs in worktree but `arete people memory refresh` writes to the configured workspace (`arete-reserv` via `findRoot()`). Standard pattern; not a smell.
- **Retrieve relevant stale-index** (probed #4): Ruled out — `retrieveRelevant` re-reads from disk. See M5.

---

## Recommended plan v3 additions

Concrete diffs to apply before build:

1. **AC8a → add stance-quality sample gate (post-refresh):**
   - After build step 14a, sample 10 person files with newly-populated stances and present them inline in the build report. User confirms quality before AC10 evaluates. (F1)

2. **AC8a → add data-write rollback artifact (pre-refresh):**
   - Snapshot AUTO_PERSON_MEMORY blocks across all 124 person files to `dev/work/plans/phase-9-.../pre-refresh-memory-blocks.json` before the one-shot refresh writes. Restore script in plan. (F1)

3. **AC8a → stance-specific cost estimator (replace topic.ts:415 formula):**
   - Build a dedicated estimator: `count = sum over people of count(meetings person appears in last 90d) ; cost = count × COST_PER_STANCE_CALL`. Add ceiling at $10 requiring interactive confirm. (F2)

4. **AC10 → sharpen "themed section" definition + add unsupervised second-run:**
   - "≥ 2 section headers NOT verbatim from template or brief section headers — synthesized themes."
   - Run AC10 twice: supervised (build-day) and unsupervised (≥6 hours later, no context priming). Compare. (F3)

5. **SKILL.md step 4 → strengthen prose against header inheritance + make verb invocation a gate:**
   - "The brief's section names are NOT agenda section names. Agenda sections are themed by topic and synthesized."
   - "Always invoke `arete brief --meeting`. Only fall back to manual gathering when the verb returns AC4d (unresolved)." (F3, F4)

6. **CLI → emit invocation sentinel log line:**
   - Append one line per typed-mode invocation to `dev/diary/brief-invocations.log`. Used during soak to confirm agent calls the verb. (F4)

7. **AC4 → tighten slug-vs-title precedence:**
   - "Inputs matching `^\d{4}-\d{2}-\d{2}-` regex are tried as slugs first. Other inputs go directly to calendar+agenda match." (M1)

8. **Mini-brief composition → highlights-first ordering:**
   - Per-attendee section order: highlights → recent → commitments → metadata. Truncation drops metadata/recent first, never highlights. (M2)

9. **AC8a measurement against Phase 8 soak:**
   - Time a winddown before and after the AC8a refresh; record delta in build report so soak signals can be attributed correctly. (M3)

10. **AC4a → unknown-project-slug error:**
    - "If `--project <slug>` does not resolve to an active project, error with `project '<slug>' not found; did you mean: <closest-match>?`" (M4)

---

## Soak observability — what to watch

**Daily during the 14-day Phase 9 soak:**

1. **Brief invocation count** — `wc -l dev/diary/brief-invocations.log` (and tail to spot-check the modes used). Trigger: zero invocations on a day with a prepared agenda = F4 materialized.

2. **Agenda quality sample** — Pick one fresh agenda per 2 days and grep for: themed section count, commitment-hash citations, wiki-page references. Trigger: ≤1 themed section AND ≤0 commitment hashes for 2 consecutive agendas = quality regression (F3 or F1).

3. **Person-file diff drift** — `git diff people/internal/*.md` on day-3, day-7, day-14. Look for stance-block changes that aren't from a deliberate refresh. Trigger: unexpected stance churn = hallucinated stances getting re-extracted on staleness (F1 secondary).

4. **`--meeting` resolution log** — Brief CLI should log when it falls through to AC4d (unresolved) path. Trigger: > 30% of `--meeting` invocations land on AC4d = either calendar fetch is broken or precedence ladder is wrong (M1).

5. **Phase 8 winddown wall-time** — Already tracked by Phase 8 AC11 hard stop. Compare pre-Phase-9 baseline (last 3 days of Phase 8 soak before merge) vs post-Phase-9 (first 3 days). If delta > 60s, attribute to AC8a impact (M3).

**Rollback triggers (during soak, in priority order):**

- F1 materializes: more than 2 hallucinated-stance reports from John during soak → revert AC8a wiring (callLLM unhooked), restore person files from snapshot, keep brief verb.
- F3 materializes: 5+ consecutive thin agendas → revert SKILL.md change (single-commit), keep brief verb available for ad-hoc use, queue follow-up phase to rethink agent-prompt structure.
- AC11 (Phase 8) exceeds: see M3 — measure carefully before attributing to Phase 9.
- All other signals: log + queue for post-soak retro; don't preemptively revert.

**Soak-success criteria (to declare Phase 9 done at +14d):**

- ≥ 5 agendas produced via the new flow with quality at-or-above the April 29 bar (judged manually).
- Zero hallucinated-stance complaints from John.
- ≥ 80% of `--meeting` invocations resolve to a valid meeting (not AC4d).
- No Phase 8 AC11 false trips attributable to Phase 9.
