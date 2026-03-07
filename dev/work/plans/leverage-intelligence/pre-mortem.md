# Pre-Mortem: Leverage Intelligence — Expert Agent Layer (Phase 1)

**Plan**: `dev/work/plans/leverage-intelligence/plan.md`
**Date**: 2026-03-05
**Question**: If this plan failed 6 months from now, what would have caused it?

---

## Risk 1: Context Gaps — Sparse or Unresolvable Context Bundles

**Problem statement**

The entire expert agent approach assumes that `arete context --for`, `arete memory search`, and `arete people show <slug> --memory` return meaningful, signal-rich results. In practice:

- A new or lightly used workspace (sparse `context/`, `memory/`, few processed meetings) returns thin or empty bundles. The Significance Analyst then has no context to reason with — and silently falls back to the same keyword-matching quality as before, defeating the point.
- The query passed to `arete context --for "<meeting topic>"` is only as good as how the skill derives the topic. A meeting titled "Weekly Sync" produces a useless query; the pattern doesn't specify how to derive a meaningful topic string from the meeting content.
- Person slugs must be resolved before `arete people show <slug> --memory` can run. In process-meetings, slug resolution happens in Step 2; the context bundle assembly in Step 4/7 correctly comes after. But if any attendee lands in `unknown_queue` (unresolved), their person context is absent from the bundle with no notice to the analyst.

**Mitigation**

1. Require the `context_bundle_assembly` pattern to include explicit **completeness checks**: after each CLI call, note how many results were returned (0 = sparse). Pass a `context_quality` signal to the analyst instructions: "Note: workspace context is sparse — weight the raw transcript more heavily."
2. Specify that the meeting topic string should be derived from the meeting title + first 100 chars of summary/key points, not just the filename.
3. For unresolved attendees, the pattern should include: "For attendees in `unknown_queue`, skip person context; note their names as unresolved in the bundle header."

**Verification steps**

- [ ] Run process-meetings against a new workspace with no prior meetings, empty memory, and two unresolved attendees. Does the skill gracefully produce output (even if less intelligent)?
- [ ] Check that the context bundle instructions specify a meaningful topic derivation method.
- [ ] Verify `context_bundle_assembly` pattern documents sparse-context fallback behavior.

---

## Risk 2: Integration — `extract_decisions_learnings` Pattern Change Breaks `finalize-project`

**Problem statement**

Step 5 of the plan updates the `extract_decisions_learnings` pattern in PATTERNS.md to reference the Significance Analyst approach instead of keyword scanning. This pattern is declared as **"Used by: process-meetings, finalize-project"**. The `finalize-project` skill has no context bundle assembly — it doesn't run `arete context --for` or assemble person profiles. After the update, the pattern will instruct the agent to "use significance_analyst" but `finalize-project` will have no bundle to pass it. The analyst instructions will be followed literally with empty context, producing low-quality output or agent confusion.

**Mitigation**

1. The updated `extract_decisions_learnings` pattern must be **context-conditional**: "Use `significance_analyst` when a context bundle is available (assembled upstream by the skill); fall back to keyword scanning when no bundle is present."
2. Alternatively, split: keep `extract_decisions_learnings` as keyword-scanning for backward compatibility, and have process-meetings reference a new `extract_decisions_learnings_with_analyst` variant.
3. Audit `finalize-project` SKILL.md before completing Step 5 to understand its current extraction flow and whether it should also get a context bundle.

**Verification steps**

- [ ] Run `finalize-project` after the Step 5 change. Does it produce coherent extraction output?
- [ ] Check the updated pattern for explicit conditional language ("when context bundle available").
- [ ] Search for any other skill or pattern that references `extract_decisions_learnings` directly.

---

## Risk 3: Integration — `context_bundle_assembly` vs `get_meeting_context` Ambiguity

**Problem statement**

`get_meeting_context` (already in PATTERNS.md, used by meeting-prep) assembles meeting context: people files, prior meetings, related projects, open action items. The new `context_bundle_assembly` pattern assembles: raw content, strategy/goals, existing memory, people context. These overlap significantly — both call `arete people show <slug> --memory` and both pull people context.

After Phase 1, meeting-prep runs `get_meeting_context` AND then invokes `relationship_intelligence` via `context_bundle_assembly`. An agent reading the updated meeting-prep SKILL.md could:
- Run both patterns in full, doubling the CLI calls for people data
- Get confused about which pattern covers which data and skip one
- Produce an incomplete bundle

The `_authoring-guide.md` "Recipe 6: Entity Relationships" covers similar ground. Three places will document overlapping context-gathering approaches with no clear hierarchy.

**Mitigation**

1. Define `context_bundle_assembly` as a **superset pattern** that explicitly says: "If you've already run `get_meeting_context`, reuse its outputs for the 'people context' portion — do not re-run `arete people show`."
2. Add a cross-reference table to `_authoring-guide.md`: "Use `get_meeting_context` for meeting-prep workflows; use `context_bundle_assembly` for expert agent workflows; when both apply, `context_bundle_assembly` consumes `get_meeting_context` outputs."
3. In the meeting-prep SKILL.md update (Step 3), explicitly state the reuse: "Relationship Intelligence receives the context already gathered in Step 3 (get_meeting_context). Do not re-fetch people data."

**Verification steps**

- [ ] Trace through the meeting-prep workflow with Phase 1 changes: count how many times `arete people show <slug> --memory` is called. Should be once per person, not twice.
- [ ] Confirm PATTERNS.md has a "See also" or "Relation to" note between the two patterns.
- [ ] Confirm `_authoring-guide.md` update addresses the three-way ambiguity.

---

## Risk 4: Code Quality — "Expert Mode" Is Too Vague to Change Agent Behavior

**Problem statement**

The core mechanism of this plan is instructing the agent to "shift into expert mode." Agents don't have modes — they have instructions. If the Significance Analyst instructions aren't concretely different from what the agent does today, the pattern is documentation theater: it looks like a better approach but produces the same quality output.

Failure signatures:
- The analyst still pattern-matches on keywords, just with more surrounding prose.
- The "ranked candidates with reasoning" output is formulaic ("this matters because it's a decision") rather than genuinely context-aware.
- The WHY column references "strategy" abstractly rather than citing a specific goal or prior decision from the bundle.

The plan's AC says patterns need "Purpose, Used by, Inputs, Steps, Outputs" but doesn't require **concrete before/after examples** in the pattern itself — the only thing that can validate the pattern actually produces different behavior.

**Mitigation**

1. Each expert agent pattern (Significance Analyst, Relationship Intelligence) must include a **worked example** showing: abbreviated input bundle, a bad output (keyword-matched, no bundle citation), and a good output (context-reasoned, specific bundle citation). This is the only way to validate the pattern instructs meaningfully different behavior.
2. The analyst instructions must include explicit grounding directives: "For each candidate, cite the specific goal, prior decision, or person stance from the context bundle that makes it significant. If you cannot cite specific bundle content, downgrade the candidate's ranking."
3. Add to the AC: "Significance Analyst output includes at least one direct citation to bundle content (e.g., 'contradicts decision from YYYY-MM-DD: …' or 'aligns with goal: …')."

**Verification steps**

- [ ] Test the Significance Analyst pattern with a meeting transcript that has 3 real decisions and 7 conversational mentions of "we should." Does the analyst correctly distinguish them using bundle-based reasoning?
- [ ] Review analyst output: does each kept candidate cite specific context (a goal, a prior decision, a person's stated stance)?
- [ ] Confirm each new pattern in PATTERNS.md includes a worked example with before/after.

---

## Risk 5: Scope Creep — Phase 1 Bleeds Into Phase 2 Under Quality Pressure

**Problem statement**

When "shift into expert mode" produces mediocre results (Risk 4), the natural response is "we need to actually separate this into a CLI call." Phase 2 (CLI-mediated expert calls) gets pulled into Phase 1 under quality pressure, blowing the "no new TypeScript infrastructure" scope boundary.

Secondary scope creep: the notes list `capture-conversation` and `synthesize` as candidates for the Significance Analyst. These are marked Out of Scope, but pattern-matching agents (and collaborators) may apply the pattern there while implementing the three target skills.

Third vector: the `_authoring-guide.md` update could expand into a full documentation rewrite, touching the Skills README and integration guide.

**Mitigation**

1. Add an explicit **Phase 1 boundary gate** to the plan: "If expert agent output quality is deemed insufficient after testing real data, document the gap in LEARNINGS.md and defer CLI extraction to Phase 2. Do not extend Phase 1 scope to compensate."
2. The out-of-scope list is already present — reinforce it: "Do not apply expert agent patterns to `capture-conversation`, `synthesize`, or `create-prd` in this phase, even if the opportunity is obvious."
3. Limit the `_authoring-guide.md` update (Step 5) to: add one new section on expert agent patterns; do not restructure existing sections.
4. Add a validation step between Steps 1 and 2: test the patterns with real data before committing to three skill rewrites.

**Verification steps**

- [ ] After Step 1, test patterns with real meeting data before proceeding to Steps 2-4. Make an explicit go/no-go decision.
- [ ] Confirm Step 5 produces a bounded diff to `_authoring-guide.md` (one new section, minimal edits to existing content).
- [ ] After completion, grep for any changes to `capture-conversation/`, `synthesize/`, or `create-prd/` — these should be untouched.

---

## Risk 6: User Impact — Increased Verbosity and Latency in High-Frequency Skills

**Problem statement**

`process-meetings`, `meeting-prep`, and `week-review` are high-frequency, routine workflows. Adding context bundle assembly (3+ CLI calls per skill run) increases both latency and output volume:

- **Latency**: For a meeting with 4 attendees, process-meetings adds at minimum 6 subprocess calls (context + memory + 4 × people show). Users notice when routine workflows slow down.
- **Output verbosity**: "Ranked candidates with WHY each matters" is more text than today's candidate list. The "Intelligence Insights" section in meeting-prep adds a new block to an already-detailed brief.
- **week-review scope risk**: week-review currently has no attendee resolution. Adding a full context bundle including `arete people show` calls would require adding people resolution to week-review — a feature it was never designed for.

**Mitigation**

1. The `context_bundle_assembly` pattern must specify **when to reuse vs. re-fetch**: "If the skill has already run `arete people show <slug> --memory` (e.g., meeting-prep's Step 3), reuse those results. Do not call again."
2. Add truncation rules for person context: "If a person's `--memory` output exceeds 500 words, use only the stances, open items, and relationship health sections."
3. week-review's context bundle (Step 4 AC) must explicitly exclude people resolution: "Bundle covers goals context and memory search only — no `arete people show` calls. week-review does not resolve attendees."
4. Offer collapsible intelligence sections ("Show Intelligence Insights" / "Hide") when the user is in a time-pressured context.

**Verification steps**

- [ ] Time a full process-meetings run on a 5-attendee meeting before and after the changes. Flag if elapsed time increases by more than 30 seconds.
- [ ] Confirm week-review's updated SKILL.md contains no `arete people show` calls.
- [ ] Verify meeting-prep's updated SKILL.md calls `arete people show` at most once per person.

---

## Risk 7: Token Budget — Context Bundle Size Is Unbounded

**Problem statement**

The plan says "token budget guidance included" in the `context_bundle_assembly` AC, but provides no specific thresholds. Without hard limits, agents include everything and the bundle grows unmanageably large:

- `arete context --for "topic"` may return 5–10 files; the agent reads each one in full.
- `arete memory search "topic"` returns all matching items from three memory files.
- `arete people show <slug> --memory` for 5 attendees × ~1,000 tokens each ≈ 5,000 tokens.
- Raw meeting transcript: 5,000–15,000 tokens for a 60-minute meeting.

Total context passed to Significance Analyst: potentially 25,000–40,000 tokens. This may hit model context limits for long meetings, degrade reasoning quality (too much noise dilutes signal), and meaningfully increase per-run cost.

**Mitigation**

1. `context_bundle_assembly` must specify **hard truncation rules per section**:
   - Strategy/goals: max 3 files, 300 words each
   - Memory search: max 5 results, 200 words each
   - Person context: stances + open items + relationship health only (no full profile body)
   - Raw content: full (cannot truncate without losing signal)
2. Define **priority trim order** for oversized bundles: (1) drop full person profile body, (2) drop older/lower-score memory items, (3) drop lower-relevance context files.
3. The pattern should instruct: "Annotate the bundle header with section sizes: 'Context bundle: ~N words strategy, ~M words memory, ~P words person context.' This helps the analyst weight signals appropriately."

**Verification steps**

- [ ] Estimate maximum bundle size for a typical process-meetings run (5-attendee meeting, active workspace). Document the estimate in the pattern.
- [ ] Confirm `context_bundle_assembly` includes explicit word limits per section.
- [ ] Test with a long meeting transcript (~12,000 tokens). Does the Significance Analyst produce coherent, non-degraded output?

---

## Risk 8: Backward Compatibility — Step Reference Drift and Dual-Extraction Confusion

**Problem statement**

The plan references "Redesign Step 4 (extract_decisions_learnings reference) and Step 7" in process-meetings. Looking at the current SKILL.md: Step 4 is "Extract Meeting Intelligence" (direct LLM extraction to meeting file) and Step 7 is "Extract Decisions and Learnings (to Memory)" (the `extract_decisions_learnings` pattern call to workspace memory). These are two distinct destinations.

The plan description "Step 4 (extract_decisions_learnings reference)" implies Step 4 currently references the pattern — it does not. If a developer reads this literally and edits Step 4 instead of Step 7, the existing direct extraction logic gets overwritten while the pattern call in Step 7 remains unchanged.

After Phase 1, agents carry two overlapping extraction instructions: Step 4 extracts to the meeting file; Step 7 uses the Significance Analyst to extract to memory. Without clear delineation, agents may conflate the two, skip one, or do both redundantly.

**Mitigation**

1. Correct the plan's Step 2 description: "Step 7 is the target for Significance Analyst integration (the `extract_decisions_learnings` pattern call to workspace memory). Step 4 extracts to the meeting file and is not being changed."
2. After Phase 1, the updated process-meetings SKILL.md must explicitly delineate the two-destination split: "Step 4 extracts intelligence to the meeting file (for reference/history). Step 7 uses the Significance Analyst to identify what is significant enough for workspace memory. These are complementary, not redundant."
3. Update the `extract_decisions_learnings` pattern's "Used by" section: "In process-meetings, this pattern now delegates to significance_analyst when a context bundle is available (assembled in steps 4–6)."

**Verification steps**

- [ ] After Step 2 implementation, confirm Step 4 (meeting file extraction) is unchanged and Step 7 (memory extraction) uses the Significance Analyst.
- [ ] Confirm the updated SKILL.md makes the two-destination split clear to a first-time reader unfamiliar with the current code.
- [ ] Run process-meetings end-to-end: verify both the meeting file AND memory receive appropriate content (meeting file gets all extracted intelligence; memory gets only the significant items identified by the analyst).

---

## Summary Table

| Risk | Impact | Mitigation |
|------|--------|------------|
| **R1: Context Gaps** — Sparse workspace produces empty bundle; analyst has nothing to reason with | High | Completeness checks per CLI call; sparse-context signal passed to analyst; fallback behavior specified; topic derivation method defined |
| **R2: finalize-project Breakage** — `extract_decisions_learnings` pattern change breaks skills without context bundles | High | Conditional fallback in pattern ("use analyst when bundle available, else keyword scan"); audit finalize-project before Step 5 |
| **R3: Pattern Ambiguity** — `context_bundle_assembly` and `get_meeting_context` overlap; agents double-fetch people data | Medium | Define context_bundle_assembly as superset that reuses get_meeting_context outputs; cross-reference table in authoring guide |
| **R4: Vague Expert Mode** — Instructions produce keyword-matching with more words, not genuine context reasoning | High | Worked before/after examples required in each pattern; grounding directives requiring bundle citations in analyst output |
| **R5: Scope Creep** — Quality pressure pulls Phase 2 CLI infrastructure into Phase 1 | Medium | Explicit Phase 1 boundary gate with go/no-go test after Step 1; bounded authoring guide update (one section only) |
| **R6: Verbosity/Latency** — High-frequency skills slow down; week-review inadvertently gains people resolution | Medium | Reuse resolved data across patterns; hard truncation rules; week-review bundle explicitly excludes people show |
| **R7: Unbounded Token Budget** — Bundle reaches 30k+ tokens; quality degrades, costs rise, context limits hit | High | Hard word limits per section (strategy: 3 files/300w, memory: 5 results/200w, person: health+stances only); trim order defined |
| **R8: Step Reference Drift** — Developer edits wrong step; dual-extraction destinations conflated | Medium | Correct plan Step 2 description; explicit two-destination delineation in updated SKILL.md; updated "Used by" in pattern |

---

## Recommended Plan Additions

### Addition 1: Validation Gate After Step 1 (before writing any SKILL.md changes)

After defining the three patterns in PATTERNS.md, run a manual test with a real meeting transcript before proceeding. If the Significance Analyst pattern produces genuinely context-aware output (candidates that cite specific bundle content), proceed to Step 2. If not, revise patterns first. Add as **Step 1.5** in the plan.

### Addition 2: Concrete Token Budget Constraints in `context_bundle_assembly` AC

Add to Step 1 AC: "Pattern includes explicit word limits per bundle section: strategy/goals (max 3 files, 300 words each), memory (max 5 results, 200 words each), person context (stances + open items + relationship health only — no full profile body). Pattern includes priority trim order for oversized bundles."

### Addition 3: `finalize-project` Audit in Step 5 AC

Add to Step 5 AC: "Before updating `extract_decisions_learnings`, read `finalize-project/SKILL.md` to assess impact. Updated pattern must include conditional language: 'Use significance_analyst when a context bundle is available upstream; fall back to keyword scanning when no bundle is present.'"

### Addition 4: Explicit week-review Scope Exclusion

Add to Step 4 AC: "week-review context bundle is limited to goals context + memory search only. Do NOT add `arete people show` calls — week-review does not resolve attendees and adding people resolution is out of Phase 1 scope."

### Addition 5: LEARNINGS.md Entry After Completion

After Phase 1 completes, seed `packages/runtime/skills/LEARNINGS.md` with: (1) when expert agent pattern instructions actually change agent behavior vs. when they're documentation theater, (2) the finalize-project/extract_decisions_learnings dependency, (3) observed token budget thresholds from real runs.

---

## Ready to Proceed?

**Yes, with pre-mortem mitigations applied.**

Phase 1 is a bounded, achievable scope — SKILL.md and PATTERNS.md changes only, no TypeScript infrastructure. The plan's architecture is sound: the intelligence services already exist, the skills already have the right workflow structure, and the expert agent pattern is a natural extension of how agents read and follow SKILL.md instructions.

**Before execution, prioritize these mitigations:**

1. **Must-address (high-impact)**: R1 (sparse context fallback), R2 (finalize-project backward compat — check before Step 5), R4 (worked examples required in patterns — this is the linchpin), R7 (hard token budget limits).
2. **Should-address (medium-impact)**: R3 (pattern hierarchy cross-reference), R5 (add Step 1.5 validation gate), R6 (week-review scope exclusion explicit in AC), R8 (correct step reference in plan description).

The highest-leverage mitigation is **R4**: if the Significance Analyst instructions don't produce genuinely context-aware output with specific bundle citations, the entire expert agent layer is indistinguishable from the current keyword-matching approach. The worked examples and grounding directives in the pattern definitions are what make the difference — prioritize those in Step 1.
