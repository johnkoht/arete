# Plan Review: Leverage Intelligence — Expert Agent Layer (Phase 1)

**Reviewed**: 2026-03-05  
**Reviewer**: Senior Engineer (Reviewer role)  
**Plan file**: `dev/work/plans/leverage-intelligence/plan.md`  
**Pre-mortem**: `dev/work/plans/leverage-intelligence/pre-mortem.md`

---

## Summary Verdict

**Approve with suggestions** — but with one hard prerequisite before execution: the pre-mortem's "Recommended Plan Additions" must be folded into the plan's step ACs. The architecture is sound, the scope is tight, and the pre-mortem is outstanding. What's missing is the feedback loop from pre-mortem → plan: the mitigations were identified but never applied to the plan's acceptance criteria.

---

## Concerns

### 1. Pre-Mortem Mitigations Not Applied to the Plan (Critical)

The pre-mortem's "Recommended Plan Additions" section lists five specific, concrete changes to make before execution. None of them appear in the plan:

- **Addition 1**: Step 1.5 validation gate (test patterns with real data before writing any SKILL.md)
- **Addition 2**: Token budget constraints added to Step 1 AC
- **Addition 3**: `finalize-project` audit requirement added to Step 5 AC  
- **Addition 4**: Explicit week-review scope exclusion (`arete people show` forbidden) in Step 4 AC
- **Addition 5**: LEARNINGS.md seeding after completion

The pre-mortem says "yes, proceed — with these mitigations applied." But the plan hasn't applied them. Right now the plan is approved-to-start on the strength of mitigations that don't exist in the execution document.

**Fix**: Before marking plan as `in_progress`, merge all five recommended additions into the relevant step ACs. The pre-mortem text is thorough — it's mostly copy-paste.

---

### 2. Step Reference Error in Process-Meetings (Medium, Confusing)

Plan Step 2 reads: "Redesign Step 4 (extract_decisions_learnings reference) and Step 7."

Reading the actual `process-meetings/SKILL.md`:
- **Step 4** = "Extract Meeting Intelligence" — direct LLM extraction to the meeting FILE. Does NOT reference `extract_decisions_learnings`. Not being changed.
- **Step 7** = "Extract Decisions and Learnings (to Memory)" — the actual `extract_decisions_learnings` pattern call to workspace memory. This IS the target.

A developer reading this literally will open Step 4 expecting to find the pattern reference and find extraction-to-file logic instead. Pre-mortem R8 flags this but the plan description wasn't corrected.

**Fix**: Change "Redesign Step 4 (extract_decisions_learnings reference) and Step 7" to "Redesign Step 7 (the `extract_decisions_learnings` pattern call to workspace memory). Step 4 (extraction to meeting file) is NOT changed."

---

### 3. Step 1 AC Does Not Require Worked Examples (High — This Is the Linchpin)

Pre-mortem R4 correctly identifies this as the highest-leverage mitigation: "if the Significance Analyst instructions don't produce genuinely context-aware output with specific bundle citations, the entire expert agent layer is indistinguishable from the current keyword-matching approach."

The current Step 1 AC requires:
- Three patterns in PATTERNS.md
- `Purpose, Used by, Inputs, Steps, Outputs` structure
- Token budget guidance

It does **not** require worked examples with before/after output. Without a before/after example in the pattern itself:
- There is no way to verify the pattern actually changes agent behavior
- A developer can write prose that sounds right but produces the same keyword-matching output
- The pattern definition becomes untestable by inspection

**Fix**: Add to Step 1 AC: "Each expert agent pattern (Significance Analyst, Relationship Intelligence) includes a worked example with: abbreviated input bundle, a bad output (keyword-matched, no bundle citation), and a good output (context-reasoned, cites specific goal/decision/stance from bundle). The worked example is what distinguishes a behavioral-change pattern from documentation theater."

---

### 4. No Validation Gate Between Step 1 and Steps 2–4 (Medium)

The plan sequentially writes all three SKILL.md updates after writing the patterns. If the patterns don't produce the intended behavior (Risk 4 — vague expert mode), you'll have invested three skill rewrites before discovering the approach is insufficient.

The pre-mortem recommends a go/no-go test after Step 1: "Run a manual test with a real meeting transcript before proceeding. If the Significance Analyst pattern produces genuinely context-aware output (candidates that cite specific bundle content), proceed to Step 2. If not, revise patterns first."

This is missing from the plan as a formal step.

**Fix**: Add Step 1.5 to the plan: "Validation Gate — Test Significance Analyst pattern with a real meeting transcript (one with 3–5 clear decisions and several conversational mentions of 'we should'). Verify: (a) candidates cite specific content from the context bundle; (b) analyst correctly distinguishes real decisions from discussion descriptions. If test passes, proceed to Step 2. If not, revise patterns first. Document go/no-go result."

---

### 5. `finalize-project` Backward Compatibility Not in Step 5 AC (Medium)

`finalize-project/SKILL.md` line 128 references `extract_decisions_learnings` for format guidance: "append to `.arete/memory/items/decisions.md` and `.arete/memory/items/learnings.md` using the standard format — see [PATTERNS.md] (extract_decisions_learnings)."

This is a looser reference than process-meetings (it's for format, not full pattern invocation), but the concern is real: if the pattern's "Steps" section replaces keyword-scanning instructions with "use significance_analyst when bundle available," finalize-project has no bundle to provide. An agent following the updated pattern will be told to use something it can't access.

The Step 5 AC should require: (1) read `finalize-project/SKILL.md` before updating the pattern; (2) add conditional fallback language to the pattern ("use significance_analyst when a context bundle is available upstream; fall back to keyword scanning when no bundle is present").

**Fix**: Add to Step 5 AC: "Before updating `extract_decisions_learnings`, read `finalize-project/SKILL.md` step 5 to assess impact. Updated pattern MUST include conditional language: 'Use significance_analyst when context bundle is available from the calling skill; fall back to keyword scanning when no bundle is present.' Confirm finalize-project produces coherent output after the change."

---

### 6. week-review's Context Bundle Is Underspecified (Medium)

The current week-review SKILL.md is the simplest of the three: 5 steps, no people resolution, no CLI subprocess calls beyond `arete commitments list`. The plan adds a "Significance Analyst for weekly significance assessment" but the Step 4 AC for week-review doesn't specify what the context bundle actually contains.

Pre-mortem R6 correctly flags that week-review must explicitly exclude `arete people show` calls (week-review was never designed for people resolution). But the plan's AC doesn't say this. Without explicit exclusion, a developer could add people resolution to week-review while implementing the context bundle — introducing scope drift and a feature week-review was never designed to handle.

**Fix**: Add to Step 4 AC: "week-review context bundle is limited to goals context (`arete context --for "<week focus>"`) and memory search (`arete memory search "<week focus>"`) only. Do NOT add `arete people show` calls — week-review does not resolve attendees. Adding people resolution to week-review is out of Phase 1 scope."

---

### 7. Success Criterion 6 Is Not Testable (Low)

SC6: "Skills produce higher-quality output by reasoning about context, not pattern-matching."

This is aspirational, not verifiable. There's no test you can run to confirm this. The other five success criteria are concrete (patterns documented, SKILL.md updated, authoring guide updated). This one isn't.

**Fix**: Replace or supplement with: "When run on a meeting transcript with 3 genuine decisions and 5 descriptive mentions of 'we should/could', the Significance Analyst identifies the 3 decisions with citations to specific bundle content (goal, prior decision, or person stance)." This is testable with the Step 1.5 validation gate.

---

### 8. Plan Frontmatter Not Updated After Pre-Mortem (Minor)

The plan has `has_pre_mortem: false` in frontmatter. The pre-mortem exists and is thorough. This is a bookkeeping issue but signals that the pre-mortem → plan feedback loop wasn't completed.

**Fix**: Update `has_pre_mortem: true` and `updated` timestamp after incorporating mitigations.

---

### 9. `_authoring-guide.md` Update Scope Not Bounded (Low)

Step 5 says "Update `_authoring-guide.md`" but the AC says only that expert agent patterns should be the "recommended approach for intelligence-heavy skills." The pre-mortem (R5) flags that this could expand into a full documentation rewrite.

The authoring guide currently has 6 recipes and is well-structured. An unbounded update risks restructuring existing content.

**Fix**: Add to Step 5 AC: "Add one new Recipe 7: Expert Agent Mode section. Do not restructure or reorganize existing Recipe 1–6 sections. Diff to `_authoring-guide.md` should be additive only."

---

## Strengths

1. **Architecture is sound**. Option A (same conversation, no new infrastructure) is the right starting point. Validates the concept before committing to CLI infrastructure. The skill-as-orchestrator, expert-as-instruction-phase separation is a clean mental model that's achievable within SKILL.md constraints.

2. **Pre-mortem is excellent**. 8 risks with specific mitigations, concrete verification steps, and a summary table. The pre-mortem for this plan is one of the best risk analyses in the build system — detailed, grounded in actual SKILL.md behavior, and concrete about what can go wrong. Pre-mortem R4 (worked examples), R7 (token budget), and R8 (step reference drift) are particularly sharp observations.

3. **Scope is tight and well-defined**. No new TypeScript, no new CLI commands, no new infrastructure. Three targeted skill updates plus PATTERNS.md. The out-of-scope section is explicit. `capture-conversation`, `synthesize`, `create-prd` are correctly excluded for Phase 1.

4. **Additive design preserves backward compatibility**. The plan is clear that intelligence sections are additive — existing skill structure is preserved. The Significance Analyst output layer over existing workflows doesn't break current users.

5. **Correct skill selection**. `process-meetings`, `meeting-prep`, `week-review` are the right Phase 1 targets: high-frequency, high-intelligence-value, and representative of both the Significance Analyst and Relationship Intelligence patterns.

6. **The two-destination split in process-meetings is called out**. Step 4 (to meeting file) vs. Step 7 (to memory) is a real subtlety in the existing SKILL.md. The plan acknowledges Step 7 is the primary target. The implementation detail is correct even if the plan description has a labeling error.

7. **Pattern reuse approach is correct**. Defining `context_bundle_assembly` as a standalone pattern rather than duplicating it in each skill is the right call — DRY and maintainable.

---

## Devil's Advocate

### Is "expert mode" real, or just more verbose keyword matching?

The plan's entire value proposition rests on the claim that telling an agent to "shift into expert mode with explicit context injection" will produce meaningfully different output from the current keyword-scanning approach. This is a real risk. The pre-mortem flags it well (R4), but the plan as written doesn't enforce the behavior change — only the presence of documentation. An agent could read the new Significance Analyst instructions and still:

- Pattern-match on "we decided" because the transcript provides stronger signal than the context bundle
- Produce "WHY: This matters because it's a decision" (formulaic, not context-aware)
- Ignore the bundle entirely when it's sparse or unfamiliar

This isn't a reason to abandon Phase 1, but it means **the worked examples and grounding directives are not optional** — they're the mechanism by which the pattern actually forces different behavior. Without them, Phase 1 is documentation work, not a behavioral improvement. The validation gate (Step 1.5) is the check valve.

### Is three skills too ambitious before the core pattern is validated?

The plan does Steps 1 → 2 → 3 → 4 → 5 sequentially without a validation gate between Steps 1 and 2–4. If the Significance Analyst pattern doesn't work (most likely failure mode), you discover it after writing three SKILL.md updates instead of one. The argument for the current ordering is "Step 2 is the prototype, Steps 3–4 are just application" — but all three skills share the same core pattern dependency. A Step 1.5 gate costs one validation test but potentially saves rewriting three skills.

### Should `meeting-prep` get Relationship Intelligence or just better use of what it already gathers?

Reading the current `meeting-prep/SKILL.md`, it already surfaces: stances, open items, relationship health, and suggested talking points — all driven by `arete people show <slug> --memory`. The prep brief is already quite rich. The "Intelligence Insights" section this plan adds is an expert layer ON TOP of an already-intelligent brief. The question is: what does the Relationship Intelligence expert agent add that Step 4's current output doesn't? The plan says: "what changed since last meeting, topics needing attention, recommended approach" — these are genuinely additive. But the plan's Step 3 AC should be more specific about what "Intelligence Insights" contains that current "Stances/Open Items/Relationship Health" sections don't, to avoid the developer producing a section that duplicates existing output in different words.

---

## Verdict

**Approve with suggestions.** The plan is executable, the architecture is correct, and the pre-mortem is thorough. But the pre-mortem → plan feedback loop is incomplete. Before execution, apply the required fixes below.

---

## Top Changes Before Execution

**P0 — Must fix before starting:**

1. **Apply all five pre-mortem "Recommended Plan Additions"** to the relevant step ACs — token budget limits (Step 1 AC), finalize-project audit + conditional fallback (Step 5 AC), and week-review scope exclusion (Step 4 AC). The pre-mortem text is thorough; it's mostly copy-paste.

2. **Add Step 1.5 (Validation Gate)** — Test Significance Analyst pattern with real meeting data before proceeding to any SKILL.md rewrites. Make it a formal go/no-go checkpoint in the plan.

3. **Require worked before/after examples in Step 1 AC** — Each expert agent pattern must include a worked example (abbreviated bundle → bad output vs. good output). This is the only way to validate the pattern changes behavior, not just documents intent.

**P1 — Should fix before starting:**

4. **Correct the Step 2 description** — Change "Redesign Step 4 (extract_decisions_learnings reference) and Step 7" to "Redesign Step 7 (memory extraction). Step 4 is NOT changed."

5. **Update plan frontmatter** — `has_pre_mortem: true`, update `updated` timestamp.

**P2 — Can fix during execution:**

6. **Bound the `_authoring-guide.md` update** — Add to Step 5 AC: "One new Recipe 7 section only. Do not restructure existing content."

7. **Make Success Criterion 6 testable** — Replace aspirational language with a concrete behavioral test: analyst distinguishes N genuine decisions from M descriptive mentions using bundle-based reasoning.
