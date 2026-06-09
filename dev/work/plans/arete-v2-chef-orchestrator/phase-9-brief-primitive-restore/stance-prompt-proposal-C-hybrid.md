# Stance Extraction Prompt — Proposal C (Hybrid)

**Authored**: 2026-06-04
**Design philosophy**: B's contrastive examples teach the pattern; A's `_justification` field provides audit trail.
**Target**: 50-75 stances per person; precision >> recall; auditability for soak observation.
**Synthesizes**: Proposal A (strict-rules) and Proposal B (few-shot examples).

## Design rationale

The audit found two complementary needs:
1. **Precision via demonstration** — the LLM learns the stance boundary best by seeing contrastive POS/NEG pairs drawn from real failure data. Rules are abstract; examples are operational.
2. **Auditability** — when a borderline case slips through, we need to know WHY the model accepted it. A required justification field per stance creates an audit trail that lets us grep, spot patterns, and iterate the prompt over time.

The hybrid uses B's example-pair backbone as the teaching mechanism, then adds A's `_justification` requirement as a self-audit gate. The model must (a) pattern-match against the demonstrations AND (b) write a one-sentence defense of each extraction. Pattern-matching catches the common cases; justification catches the model gaming the pattern.

Parser-level enforcement is from A: drop `neutral` (audit confirms it's never a real stance), require non-empty justification, hard-cap at 3 stances per call. Belt-and-suspenders: prompt says max 3, parser enforces it.

What this design likely catches well:
- Surface-form traps via B's contrastive pairs (most failure modes are surface-form failures)
- Model self-correction via A's chain-of-thought
- Long-term iteration via the audit-trail of justifications

What it may miss:
- Out-of-distribution stance shapes not represented in any example pair (B's known weakness)
- Real stances that happen to use weak-position verbs ("Lindsay agreed that X..." where X is her view) — A's Rule 7 territory; the example pairs partly cover but not fully

---

## Proposed `buildStancePrompt()` function body

```typescript
export function buildStancePrompt(content: string, personName: string): string {
  return `You are extracting STANCES held by ${personName} from a meeting transcript.

A STANCE is a position ${personName} holds that:
- Would be re-articulated in an unrelated conversation 3 months later (the TRANSFER test)
- Could be reasonably disagreed with by a smart colleague (the CONTESTABILITY test)
- Is about how things SHOULD be, not how things ARE, not what was decided, not what will be done next

Your job is to be picky. A typical meeting yields 0-2 stances. Most things people say in meetings are NOT stances — they're decisions already made, observations of current state, action items, project approvals, schedule commitments, or generic exhortations. **When in doubt, SKIP.**

Output a MAXIMUM of 3 stances from this transcript. Most meetings should yield 0-2. A meeting that yields 3 is exceptional.

================================================================
LEARN BY EXAMPLE — CONTRASTIVE PAIRS
================================================================

Below are 10 pairs of similar-looking statements where one is a real stance (KEEP) and one is not (SKIP). Study the contrast — the boundary is shown, not described.

PAIR 1 — "supports X" surface form
  KEEP: "Lindsay strongly opposes making Claude chat the primary interface for adjusters, arguing the product must be a proper software UI with clickable interactions."
    Why KEEP: A philosophical position on UI design. Contestable (some PMs would argue chat IS the future). Transfers to any product.
  SKIP: "Lindsay supports John's project to revamp the team's Notion setup."
    Why SKIP: Endorsement of a specific project at a specific moment. Not contestable in any interesting way. Does not transfer.

PAIR 2 — "wants X" surface form
  KEEP: "Lindsay wants ML and AI model projects run like research projects rather than requiring detailed product requirements upfront."
    Why KEEP: A position on methodology — how a class of work should be approached. Contestable. Transfers.
  SKIP: "Lindsay wants a front-end engineer assigned to the Glance claim view redesign as soon as possible."
    Why SKIP: Resourcing intent — a thing she wants to happen, not a position she holds. Belongs in commitments/action-items.

PAIR 3 — "concerned" direction
  KEEP: "Lindsay is skeptical of engineering time estimates, believing they consistently underestimate the actual effort required."
    Why KEEP: A persistent belief about a pattern. She would say this on any project. Contestable.
  SKIP: "Lindsay is concerned that engineers are slipping back into old habits of spinning their wheels instead of working at the pace they demonstrated during the Pop sprint."
    Why SKIP: An observation about current behavior in a current sprint. State-of-the-world, not a position. Will not transfer past this sprint.

PAIR 4 — agreement statements
  KEEP: "Lindsay agrees that adjusters won't adapt to new tools unless legacy systems like Snapsheet are cut off."
    Why KEEP: Agreement with a sharp, contestable change-management thesis. Transfers to other tool migrations.
  SKIP: "Lindsay agrees workflows cannot be fully defined until the broader vision for actions and notifications is established."
    Why SKIP: Sequencing observation — agreeing that one thing must precede another. No real contestable position taken.

PAIR 5 — "believes X is needed/important"
  KEEP: "Lindsay believes the change management role is necessary because product features were being built and deployed with no accountability for adoption."
    Why KEEP: A position on org structure — a role that should exist and why. Contestable (some would say PMs own adoption). Transfers.
  SKIP: "Lindsay emphasizes the importance of maintaining development velocity."
    Why SKIP: Vague exhortation any leader would agree with. Not contestable. Reveals nothing distinctive.

PAIR 6 — opinions on specific items
  KEEP: "Lindsay prefers wired headphones over wireless ones and dislikes dealing with Bluetooth."
    Why KEEP: A persistent personal preference she would re-articulate. Contestable in the trivial sense. Distinctive.
  SKIP: "Lindsay supports the DSP info section as it would allow CX to self-serve information."
    Why SKIP: Approval of a specific feature. Does not transfer past this feature. No deeper philosophy stated.

PAIR 7 — "supports pausing/canceling" surface form
  KEEP: "Lindsay opposes building products reliant on ECHECK because it is declining rapidly and major banks are refusing to accept it."
    Why KEEP: A position on a class of technology and where the industry is going. Transfers to any payment product decision.
  SKIP: "Lindsay supports pausing the Claim Clear program due to Marsh's legal concerns."
    Why SKIP: A decision about a specific program for an external reason. Not Lindsay's position — she's accepting an external constraint.

PAIR 8 — verbs of acknowledgment
  KEEP: "Lindsay believes the adjuster experience must start structured because most adjusters need to be told what to do."
    Why KEEP: A UX philosophy claim about a population. Contestable. Drives many downstream decisions.
  SKIP: "Lindsay Gray acknowledges that Snapsheet is effectively serving as the template editing UI for now."
    Why SKIP: Acknowledging a state of affairs. "For now" gives it away — situational, not a held position.

PAIR 9 — "should" claims
  KEEP: "Lindsay believes BI claims should keep the adjuster in the driver's seat due to complexity, litigation risk, and claimant sensitivity."
    Why KEEP: A "should" claim about how a category of work should be handled, with reasoning that transfers.
  SKIP: "Lindsay supports a timeline of August through November for heads-down development with a December testing target."
    Why SKIP: A schedule commitment. Has the surface form of "supports X" but X is a date range.

PAIR 10 — topic identification
  KEEP: "Lindsay insists on using 'responsibility' rather than 'liability' for POP since it is not an insurance program."
    Why KEEP: Persistent terminology stance rooted in a substantive claim. She corrects this repeatedly.
  SKIP: "Lindsay believes guidelines need to be established for what CDJs are allowed to say when demoing AI Glance features externally."
    Why SKIP: Identifies that guidelines are needed — does not state what they should be. Agenda topic, not a position.

================================================================
QUICK RULES (apply when no example matches)
================================================================

- If the statement is about a specific project, deadline, or sprint — SKIP unless the philosophy behind it is also stated and transfers.
- If the verb is "wants X built/done/scheduled/assigned/created" — SKIP (action item).
- If the statement is "concerned that X is happening right now" — SKIP (observation).
- If the statement is something any reasonable leader would say ("velocity matters", "we should ship quality") — SKIP (not distinctive).
- If you would label it "neutral" — SKIP. Stances have a clear direction.
- If the lead verb is "acknowledged", "clarified", "confirmed", "noted" — SKIP unless the person is articulating their OWN view that just happens to align with prior statements.

================================================================
DIRECTION
================================================================

Direction must be EXACTLY one of: supports | opposes | concerned

Do NOT use "neutral" — if there's no clear direction, it's not a stance.

================================================================
OUTPUT SCHEMA
================================================================

Return ONLY valid JSON, no markdown, no code fences, no prose:

{
  "stances": [
    {
      "topic": "short noun phrase naming what the stance is about (no project names, no dates, no person names)",
      "direction": "supports | opposes | concerned",
      "summary": "one sentence: ${personName} [direction] ___ because ___ (must pass the transfer test — drop the names and it should still make sense)",
      "evidence_quote": "exact quote from the transcript supporting this stance",
      "_justification": "one sentence: which similar-looking SKIP pattern did you consider and rule out (cite the pair number if applicable), and why this candidate passes both the contestability test AND the transfer test"
    }
  ]
}

If no stances meet the bar, return: {"stances": []}

The _justification field is REQUIRED. If you cannot write an honest justification — one that genuinely names the rejected alternative and defends the extraction — DO NOT emit the stance. Empty or generic justifications will be discarded.

================================================================
FINAL REMINDERS
================================================================

- Extract stances ONLY for ${personName}. Ignore positions held by other participants.
- Maximum 3 stances from this transcript. If you have more candidates, pick the 3 most distinctive (least likely for any other leader in the same role to hold).
- Most meetings should yield 0-2. Zero is a valid count. A meeting that yields 3 is exceptional.

Transcript:
${content}`;
}
```

---

## Parser changes required

Three changes to `packages/core/src/services/person-signals.ts`:

**1. Drop `neutral` from `StanceDirection` (line 24) and `VALID_DIRECTIONS` (line 26):**

```typescript
// line 24
export type StanceDirection = 'supports' | 'opposes' | 'concerned';

// line 26
const VALID_DIRECTIONS = new Set<string>(['supports', 'opposes', 'concerned']);
```

Any LLM output with `direction: "neutral"` now silently drops at parse time (line 138 already does this when the direction isn't in `VALID_DIRECTIONS`).

**2. Add `_justification` to raw + parsed shapes:**

```typescript
// Around line 41 — RawStanceResult
type RawStanceResult = {
  stances?: Array<{
    topic?: string;
    direction?: string;
    summary?: string;
    evidence_quote?: string;
    _justification?: string;  // NEW
  }>;
};

// Around line 29 — PersonStance
export type PersonStance = {
  topic: string;
  direction: StanceDirection;
  summary: string;
  evidenceQuote: string;
  justification: string;  // NEW
  source: string;
  date: string;
};
```

In the parser loop (lines 128-148), extract and require:

```typescript
const justification = typeof item._justification === 'string' ? item._justification.trim() : '';
// All required fields must be present
if (!topic || !direction || !summary || !evidenceQuote || !justification) continue;
// ... (existing validation continues)
stances.push({
  topic,
  direction: direction as StanceDirection,
  summary,
  evidenceQuote,
  justification,  // NEW
  source: '',
  date: '',
});
```

**3. Add hard-cap belt-and-suspenders at parser exit (line 150):**

```typescript
return stances.slice(0, 3);
```

Even if the LLM ignores the prompt's max-3 instruction, the parser enforces it. The model's tiebreaker ordering (most distinctive first, per prompt instruction) determines which 3 survive.

---

## Behavior trace on 10 test cases

Same 5 KEEP + 5 SKIP cases as both A and B for direct comparison.

### KEEP cases (should extract)

1. **"Lindsay strongly opposes making Claude chat the primary interface..."**
   - **Extract**: `direction: opposes`, `topic: "primary UX paradigm for line-of-business work"`
   - **Justification model writes**: *"Considered PAIR 1 SKIP (project-endorsement) — ruled out because the position is about a UI paradigm class, not approval of a specific Claude project. Contestable: many PMs believe chat will replace structured UIs. Transfer: position applies to any LOB software."*

2. **"Lindsay wants ML and AI model projects run like research projects..."**
   - **Extract**: `direction: supports`, `topic: "research-mode methodology for ML/AI work"`
   - **Justification**: *"Considered PAIR 2 SKIP (action-item) — ruled out because 'wants X run like Y' is methodology framing, not resourcing intent. Contestable: many orgs require strict PRDs even for ML. Transfer: applies to any ML/AI work."*

3. **"Lindsay believes change management role is necessary..."**
   - **Extract**: `direction: supports`, `topic: "change-management as a distinct org function"`
   - **Justification**: *"Considered PAIR 5 SKIP (uncontestable exhortation) — ruled out because the position is specific (a role should exist) with concrete reasoning (adoption accountability gap). Contestable: some orgs assign adoption to PMs. Transfer: applies to any product org."*

4. **"Lindsay prefers wired headphones over wireless..."**
   - **Extract**: `direction: opposes`, `topic: "headphone format preference"`
   - **Justification**: *"Considered PAIR 6 SKIP (feature-endorsement) — ruled out because it's a persistent personal preference, not approval of a specific product. Contestable: most prefer wireless. Transfer: enduring personal preference."*

5. **"Lindsay opposes building products reliant on ECHECK..."**
   - **Extract**: `direction: opposes`, `topic: "ECHECK as foundational payment tech"`
   - **Justification**: *"Considered PAIR 7 SKIP (accepting external constraint) — ruled out because the position is rooted in Lindsay's own analysis of industry trends, not external coercion. Contestable: many would invest in ECHECK still. Transfer: principle of betting on declining tech."*

### SKIP cases (should reject)

6. **"Lindsay wants front-end engineer assigned..."** (action-item)
   - **Reject**: matches PAIR 2 SKIP pattern verbatim. Resourcing intent → action item, not stance.

7. **"Lindsay supports pausing Claim Clear due to Marsh's legal concerns..."** (decision)
   - **Reject**: matches PAIR 7 SKIP pattern. Accepting external constraint, not articulating Lindsay's own position on the program.

8. **"Lindsay is concerned that engineers are slipping back..."** (observation)
   - **Reject**: matches PAIR 3 SKIP pattern verbatim. Present-tense observation about current sprint behavior; won't transfer.

9. **"Lindsay supports John's Notion revamp project."** (project-endorsement)
   - **Reject**: matches PAIR 1 SKIP pattern verbatim. Approval of specific project; no underlying philosophy stated.

10. **"Lindsay emphasizes the importance of maintaining development velocity."** (weak-position)
    - **Reject**: matches PAIR 5 SKIP pattern verbatim. Generic leadership exhortation; fails contestability test.

---

## Expected outcome

For a person of Lindsay's profile (297 meetings, ~6 months, mix of 1:1s and working sessions):

- **Stance count estimate**: 60-90. Lands in or just above the 50-75 target. Cross-session dedup (separate downstream work) would compress further to ~55-70.
- **Precision estimate**: 80-88%. Better than B alone (70-80%) because the `_justification` requirement filters out cases the model can't honestly defend. Slightly lower than A alone (85-92%) because example-based learning has more grammatical flexibility than strict rules.
- **Recall estimate**: 70-80%. Better than B alone (65-75%) because the brief rules section catches edge cases the example pairs miss. Slightly lower than A alone (75-85%) because some real stances expressed in unusual constructions may still drop.
- **Token cost**: ~1700 token prefix per call (10 example pairs + rules + schema) + ~30 tokens per stance for justification. With 3-stance cap and prompt caching, marginal cost per meeting is ~$0.001 at fast tier.
- **Audit trail**: every extracted stance carries a `_justification` field. Grep-able. Iterable.

---

## Risks / known weaknesses

1. **Token cost up vs current** — prefix grows from ~700 to ~1700 tokens, plus justification adds output tokens. Mitigation: prefix is stable across calls and aggressively cacheable. Net cost increase is modest at fast tier.

2. **`_justification` gaming risk** — the model may learn to write boilerplate justifications that satisfy the field rule without genuine self-audit. Mitigation: justifications are auditable (logged to soak observability), so if patterns of gaming surface, we add more counter-examples or tighten the requirement.

3. **Person-specificity of examples** — all 10 pairs draw from Lindsay's audit. If the prompt is reused for a non-PM (e.g., an engineer, an external partner), the example domain may subtly mislead. Mitigation: the contrastive structure teaches *shape* of the test more than *content*. To validate: rerun on a different person after Lindsay's re-extraction succeeds.

4. **Out-of-distribution stance shapes** — stances expressed via metaphor, multi-turn dialogue inference, or unusual constructions may slip through unmatched. Both A and B share this weakness; the hybrid doesn't fix it. Soak-time observation will surface specific patterns to add as new example pairs.

5. **Per-meeting cap of 3 is blunt** — a 90-minute strategy offsite might genuinely yield 5 real stances; a 25-minute standup yields 0. The hard cap forces both into the same ceiling. Acceptable trade because the audit's central finding is excess recall, not insufficient recall.

6. **No cross-session dedup** — same stance from 6 meetings still becomes 6 entries. The current prompt cannot see other meetings. This is a downstream merge concern, not a prompt concern. The audit's recommendation #7 is needed as a separate post-extraction pass.

7. **The rules section may conflict with examples on edge cases** — e.g., "if verb is 'wants X built'" (rule) vs PAIR 2's KEEP "wants ML/AI projects run like research" — both use "wants". The example wins by being more specific, but a less careful model may apply the rule too aggressively. Mitigation: examples come BEFORE rules in the prompt structure, and the rules section is explicitly labeled "apply when no example matches".

---

## What to validate when re-extracting Lindsay

When you run the new prompt against Lindsay's 297 meetings:

1. **Stance count**: target 60-90. If >100, prompt is still too loose (likely the examples + rules conflict).
2. **Sample 10 random stances**: verify each is a real position per the audit's KEEP criteria. Should be >85%.
3. **Sample 10 random `_justification` fields**: verify they name a real SKIP pattern that was considered, not boilerplate. If >2 are boilerplate, model is gaming the field.
4. **Check for neutral entries**: should be zero (parser drops them). If any sneak in, parser change isn't applied.
5. **Sample 5 single meetings**: verify none yielded more than 3 stances. If any did, parser slice isn't applied.
6. **Sample 3 1:1 transcripts and 3 working-session transcripts**: 1:1s should still yield more keepers (per audit observation). If working sessions match 1:1 yield, prompt may be over-correcting toward strict mode.

Cost: ~$4-5 at fast tier (similar to first refresh).
