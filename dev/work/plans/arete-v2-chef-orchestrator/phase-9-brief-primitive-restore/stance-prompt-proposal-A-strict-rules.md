# Stance Extraction Prompt — Proposal A (Strict Rules)

**Authored**: 2026-06-04
**Design philosophy**: Explicit constraint-based; legalistic DO-NOT-EXTRACT lists; chain-of-thought required.
**Target**: 50-75 stances per person; precision >> recall.

## Design rationale

The current prompt fails because it offers no friction. It says "a stance is a clear position" and tells the model "if uncertain, OMIT" — but the model has no operational definition of "clear position" and no idea what kinds of things to actively reject. The audit shows the failure modes are not random: they cluster into ten well-defined patterns (action-item, decision, observation, framing, deadline-milestone, agenda-topic, project-endorsement, weak-position, duplicate, contradictory-pair). A rules-heavy prompt names each pattern and forces the model to check the candidate against the rejection list before accepting it.

The rules-heavy approach catches the bulk failure modes well: action-items become detectable by their verb signature ("wants X built", "plans to"), observations by their tense ("X is happening"), project-endorsements by their use of proper nouns, weak-positions by their lead verbs ("acknowledged", "clarified"). Encoding these as DO-NOT rules with named pattern signatures is high-leverage because they account for 78 + 91 + 84 + 137 + 71 = 461 of the 623 SKIPs (74%). Adding chain-of-thought + a hard cap of 3 stances per meeting closes the rest by forcing the model to triage rather than to enumerate.

What it might miss: stances expressed in unusual grammatical constructions that don't match the rejection signatures, and edge cases where Lindsay says something distinctive in a weak-verb wrapper ("I would acknowledge that X is a problem" where X is actually a real held view). The rules will also incorrectly reject some legitimate stances that happen to reference a project name as scaffolding for a more general point. We accept that tradeoff because the audit's central finding is that the extractor's recall is too high, not too low — at 696 extractions for 73 real positions, the system has 9.5x too many entries.

## Proposed buildStancePrompt() function body

```typescript
export function buildStancePrompt(content: string, personName: string): string {
  return `You are extracting STANCES — enduring, contestable, transferable positions — held by a specific person, from a meeting transcript.

PERSON: ${personName}

================================================================
WHAT A STANCE IS
================================================================

A stance is a position the person would still articulate in an unrelated conversation 3 months from now. It is a view about HOW THINGS SHOULD BE, not a report of how things ARE, what was decided, or what will be done next.

A stance must pass BOTH tests:

  CONTESTABILITY TEST: A reasonable, informed colleague could hold the opposite view. If "anyone would agree" with the position, it is not a stance.

  TRANSFER TEST: The position generalizes beyond this meeting, this project, this sprint, this colleague. Strip the specific names from the summary — does the position still mean something?

================================================================
HARD RULES (DO NOT EXTRACT)
================================================================

DO NOT EXTRACT if the candidate matches ANY of the following patterns. These are rejection rules, not soft preferences. Apply them mechanically.

RULE 1 — REJECT ACTION-ITEMS AND INTENT-TO-ACT.
  If the predicate is any of: "wants X built", "wants X created", "wants X done", "plans to", "will do", "will schedule", "advocates for hiring", "proposed that we", "is pushing for X to ship", "wants the team to" — REJECT. These are commitments or proposals, not stances. Belongs elsewhere.

RULE 2 — REJECT PRESENT-TENSE OBSERVATIONS.
  If the candidate describes a current state of the world — "engineers are slipping", "the data appeared incomplete", "the situation is chaotic", "the team has not yet decided", "X is happening", "Y is broken" — REJECT. Observations are not positions. Stances are statements about how things SHOULD be, not about how they currently ARE.

RULE 3 — REJECT DECISIONS ALREADY MADE.
  If the candidate reports a choice that was made (by anyone, including the person) at a specific moment — "confirms we'll use the Marsh API", "supports pausing the program due to legal concerns", "supports canceling the call" — REJECT. Inherited facts and one-time procedural decisions are not stances.

RULE 4 — REJECT DEADLINE / MILESTONE / SCHEDULE COMMITMENTS.
  If the candidate is built around a date, a quarter, a release window, or a sprint target — REJECT. Calendar targets are not stances.

RULE 5 — REJECT AGENDA TOPICS.
  If the candidate says "X needs to be defined", "guidelines need to be established", "we need to figure out Y" — REJECT. Identifying that something needs addressing is not taking a position on it.

RULE 6 — REJECT PROJECT- OR FEATURE-ENDORSEMENTS.
  If the topic is a specific named project, feature, person's work, or sprint — and the candidate is approval of that thing rather than approval of an underlying principle — REJECT. "Supports John's Notion revamp" is endorsement; "supports investing in internal documentation infrastructure" might be a stance if the person actually said that.

RULE 7 — REJECT WEAK-POSITION VERBS.
  If the candidate's lead verb is "acknowledged", "clarified", "agreed (when responding to another's framing)", "confirmed", "noted", "recognized", "emphasized [generic exhortation]" — REJECT. These signal the person was responding to someone else's framing, not asserting their own.

RULE 8 — REJECT ONE-OFF FRAMINGS.
  If the position only makes sense given a specific situation, person, project status, or moment in time, and would be incomprehensible without that context — REJECT.

RULE 9 — REJECT IF DIRECTION IS "NEUTRAL".
  Do not emit "neutral" stances. If the person didn't take a position, there is no stance to extract. Valid directions are ONLY: supports, opposes, concerned.

RULE 10 — REJECT IF UNCONTESTABLE.
  If the candidate is "we should maintain velocity", "quality matters", "we should ship value to users", "we should communicate clearly" — REJECT. If every reasonable leader would say this, it does not distinguish the person and is not a stance.

================================================================
HARD CAP
================================================================

Output AT MOST 3 stances from this transcript. If you have more than 3 candidates that pass all rules, pick the 3 strongest by these tiebreakers, in order:

  1. The candidate the person articulated with the most force (initiated by them, repeated, defended against pushback).
  2. The candidate that is most distinctive — least likely for any other leader in the same role to hold.
  3. The candidate that generalizes furthest beyond this meeting's specifics.

If you cannot identify 3 strong stances, output fewer. ZERO is a valid count. Most meetings should yield 0-2 stances. A meeting that yields 3 is exceptional.

================================================================
REQUIRED CHAIN-OF-THOUGHT
================================================================

For each stance you emit, populate the "_justification" field with a single sentence that:
  (a) names which of Rules 1-10 you considered and rejected for this candidate, AND
  (b) states why this candidate passes BOTH the contestability test AND the transfer test.

If you cannot write that sentence honestly, do not emit the stance.

================================================================
OUTPUT SCHEMA
================================================================

Return ONLY valid JSON, no markdown fences, no prose, no explanation.

{
  "stances": [
    {
      "topic": "short noun phrase, no project names, no person names, no dates",
      "direction": "supports | opposes | concerned",
      "summary": "one sentence stating the position in transfer-test form (would still make sense 3 months later, in a different context)",
      "evidence_quote": "exact verbatim quote from the transcript showing the person articulating this position",
      "_justification": "single sentence: which DO-NOT rules you ruled out, and why contestability + transfer tests pass"
    }
  ]
}

If no stances survive the rules, return: {"stances": []}

================================================================
WORKED EXAMPLES OF REJECTIONS (so you internalize the rules)
================================================================

CANDIDATE: "Lindsay wants a formal playbook created for the email template process."
DECISION: REJECT (Rule 1 — "wants X created" is intent-to-act).

CANDIDATE: "Lindsay is concerned that engineers are slipping back into old habits."
DECISION: REJECT (Rule 2 — present-tense observation about current behavior).

CANDIDATE: "Lindsay supports pausing the Claim Clear program due to Marsh's legal concerns."
DECISION: REJECT (Rule 3 — reports an already-made decision driven by external constraints).

CANDIDATE: "Lindsay supports an end-of-June delivery target for status letters."
DECISION: REJECT (Rule 4 — calendar commitment).

CANDIDATE: "Lindsay believes guidelines need to be established for CDJ demos."
DECISION: REJECT (Rule 5 — identifies need for definition, takes no position).

CANDIDATE: "Lindsay supports John's Notion revamp project."
DECISION: REJECT (Rule 6 — endorsement of specific named project).

CANDIDATE: "Lindsay acknowledged that Snapsheet is the template editing UI for now."
DECISION: REJECT (Rule 7 — lead verb "acknowledged" + temporal "for now").

CANDIDATE: "Lindsay emphasizes the importance of maintaining development velocity."
DECISION: REJECT (Rule 10 — every leader would say this; no contestability).

CANDIDATE: "Lindsay opposes building a native Glance template composer in 2026, deferring to 2027."
DECISION: ACCEPT. Pass: Rule 1 N/A (no intent-to-act, it's a "do not build" position), Rule 4 N/A (the year is incidental context, not the position itself), Rule 6 N/A (the underlying position is about scope discipline, not project approval). Contestability: a reasonable colleague could argue for building it. Transfer: generalizes to "scope discipline — don't build adjacent tooling when core is unsettled."

================================================================
TRANSCRIPT
================================================================

${content}`;
}
```

## Parser changes required

Three changes to `parseStanceResponse` and the surrounding types in `packages/core/src/services/person-signals.ts`:

1. **Drop `neutral` from `StanceDirection`.** Change line 24 to `export type StanceDirection = 'supports' | 'opposes' | 'concerned';` and line 26 to `const VALID_DIRECTIONS = new Set<string>(['supports', 'opposes', 'concerned']);`. Any LLM output with `direction: "neutral"` is now silently dropped at parse time (line 138), which is the right behavior since Rule 9 forbids it.

2. **Add `_justification` to the raw and parsed shapes.** Extend `RawStanceResult.stances[]` with `_justification?: string` (lines 41-48), extend `PersonStance` with `justification: string` (lines 29-36), and extract it in the parser loop. Reject any stance where `_justification` is missing or empty — the chain-of-thought is load-bearing for the rules. Add to lines 128-148:

   ```typescript
   const justification = typeof item._justification === 'string' ? item._justification.trim() : '';
   if (!justification) continue;
   // ...
   stances.push({ topic, direction, summary, evidenceQuote, justification, source: '', date: '' });
   ```

3. **Add a soft cap at parse time.** After parsing, take only the first 3 stances per call: `return stances.slice(0, 3);` at line 150. Belt-and-suspenders: the prompt says max 3, but the parser enforces it too. If the LLM ignores the cap, we still get the top 3 it ranked.

No call-site changes outside this file are required — `extractStancesForPerson` already returns whatever the parser produces.

## Behavior trace on 10 test cases

### 5 from the KEEP list (should extract)

**Case 1 — KEEP #41: native Glance template composer**
- **Input**: "Lindsay opposes building a native Glance template composer in 2026, stating it should be deferred to 2027."
- **Expected**: EXTRACT. `topic: "native template composer scope"`, `direction: opposes`, `summary: "Building a native template composer is out of scope for the near term; existing tools should serve until core product foundations are settled."`
- **Why**: Rule 1 doesn't fire — it's a "do not build" position, not intent-to-act. Rule 4 doesn't fire — the year is incidental, the position is about scope. Rule 6 doesn't fire — the underlying view is about scope discipline. Contestability: a reasonable colleague could argue to build it now. Transfer: position about deferring adjacent tooling is generalizable.

**Case 2 — KEEP #1: product writing customer-facing comms**
- **Input**: "Lindsay believes product should not be responsible for writing templates, emails, or customer-facing communications."
- **Expected**: EXTRACT. `topic: "product team's scope of ownership"`, `direction: opposes`, `summary: "Product should not own authorship of customer-facing communications; that work belongs to operations."`
- **Why**: No DO-NOT rule fires. Contestability: many product orgs do own this. Transfer: the org-boundary position is portable across companies.

**Case 3 — KEEP #62: wireless headphones**
- **Input**: "Lindsay prefers wired headphones over wireless ones and dislikes dealing with Bluetooth."
- **Expected**: EXTRACT. `topic: "headphone format preference"`, `direction: opposes`, `summary: "Prefers wired audio over wireless because Bluetooth pairing is unreliable."`
- **Why**: No DO-NOT rule fires. Contestability: most people prefer wireless. Transfer: durable personal preference.

**Case 4 — KEEP #21: chat-based interface as primary UX**
- **Input**: "Lindsay strongly opposes making Claude chat the primary interface for adjusters, arguing the product must be a proper software UI with clickable interactions."
- **Expected**: EXTRACT. `topic: "primary interface paradigm for line-of-business software"`, `direction: opposes`, `summary: "A chat interface is the wrong primary surface for line-of-business work; structured UI with clickable interactions is required."`
- **Why**: No DO-NOT rule fires — though Claude is named in the transcript, the position is about chat-vs-structured-UI as a UX paradigm. Contestability: many believe chat is the future. Transfer: applies anywhere LOB software is being designed.

**Case 5 — KEEP #36: replicating tasks in Glance**
- **Input**: "Lindsay does not want to replicate the traditional task system in Glance, believing better technology like multi-agent can replace it."
- **Expected**: EXTRACT. `topic: "task-based workflow model"`, `direction: opposes`, `summary: "The traditional task queue is the wrong abstraction for modern claims work; agent-driven approaches should replace it."`
- **Why**: Rule 1 doesn't fire — "does not want to replicate" is a "do not build" stance, not intent-to-act. The Glance reference is dropped from the topic during the transfer test. Contestability: many would default to porting the task model forward. Transfer: applies to any modernization-of-legacy-workflow project.

### 5 from the SKIP categories (should reject)

**Case 6 — SKIP action-item: email-template-playbook**
- **Input**: "Lindsay wants a formal playbook created for the email template process to establish a steady state and use it to push leadership on hiring OPS and config engineer roles."
- **Expected**: SKIP (Rule 1).
- **Why**: Lead predicate "wants X created" is the canonical intent-to-act signature in Rule 1. Even though the underlying motivation (org-boundary concern) might be a stance elsewhere, this specific sentence is a planned action.

**Case 7 — SKIP decision: Marsh API source-of-truth**
- **Input**: "Lindsay Gray confirms that Amazon directed them to use the Marsh API as the source of truth for identifying VAST providers."
- **Expected**: SKIP (Rule 3 + Rule 7).
- **Why**: Rule 3 — reports a decision made externally by Amazon. Rule 7 — lead verb "confirms" is a weak-position verb. Two independent rules fire; reject decisively.

**Case 8 — SKIP observation: engineer-autonomy**
- **Input**: "Lindsay is concerned that engineers are slipping back into old habits of spinning their wheels instead of working at the pace they demonstrated during the Pop sprint."
- **Expected**: SKIP (Rule 2 + Rule 8).
- **Why**: Rule 2 — "engineers are slipping" is a present-tense observation about current behavior. Rule 8 — only makes sense given the Pop-sprint-comparison framing.

**Case 9 — SKIP project-endorsement: DSP info section**
- **Input**: "Lindsay supports the DSP info section as it would allow CX to self-serve information."
- **Expected**: SKIP (Rule 6).
- **Why**: Approval of a specific feature ("DSP info section"). The underlying principle (CX should self-serve information) might be a stance if Lindsay says it as such in another transcript — but this sentence is endorsement of a particular UI element.

**Case 10 — SKIP weak-position: maintaining engineering velocity**
- **Input**: "Lindsay Gray emphasizes the importance of maintaining development velocity."
- **Expected**: SKIP (Rule 10 + Rule 7).
- **Why**: Rule 10 — uncontestable; every leader says this. Rule 7 — lead verb "emphasizes [generic exhortation]" is the canonical weak-position signature. Two rules fire.

## Expected outcome

For a person of Lindsay's profile (297 meetings, ~6 months, high-density 1:1s and working sessions):

- **Estimated stance count**: 80-110. Slightly above the 50-75 target because we have not yet added cross-session deduplication — the prompt produces high precision per-meeting, but the same underlying stance will still surface in multiple meetings. With dedup added downstream (separate work), final count drops to 55-75.

- **Estimated false-positive rate (stance saved that isn't a real position)**: 8-15%. The remaining failure modes will be (a) the model occasionally accepting endorsement-of-principle that's really endorsement-of-project in disguise, and (b) edge cases where a generic exhortation slips past Rule 10 because the model judges it as distinctive when it isn't.

- **Estimated false-negative rate (real position dropped)**: 15-25%. The hard cap of 3 per meeting is the biggest source of misses. Some meetings have 4-5 genuinely strong stances; the cap forces the model to drop 1-2. We also expect to drop legitimate stances when they happen to use weak-position verbs ("Lindsay agreed that X" where X is actually her own conviction). The audit estimates 73 real positions exist over 6 months; this prompt likely captures 55-62 of them on first pass, and the missing ones tend to be re-articulated in later meetings so they get captured eventually.

## Risks / known weaknesses of this approach

1. **The cap of 3 is blunt.** A 90-minute strategy offsite might genuinely produce 5 stances; a 25-minute standup produces 0. The hard cap forces both into the same ceiling. A meeting-length-aware cap would be better but adds complexity the prompt can't reliably evaluate.

2. **Rule 1 (intent-to-act) over-rejects build-vs-buy stances.** Many of Lindsay's real positions are framed as "we should build X" or "we shouldn't buy Y". The rule tries to distinguish "wants X built" (action) from "X should be built" (stance), but the verbal difference is thin. We will incorrectly reject some real build-vs-buy positions when they're phrased with action verbs. KEEP #11 ("opposes spending engineering resources on building a form interface") is at risk.

3. **Rule 6 (project-endorsement) over-rejects when the project name is scaffolding.** KEEP #19 ("reframing Batch, Copilot, Multi-Asian, and Looker as tools not products") names four specific projects but the position is a general framework. The model may apply Rule 6 too aggressively and reject it. The worked example in the prompt addresses this, but it's the most fragile rule.

4. **Rule 7 over-rejects "agreed" when Lindsay is articulating her own view that happens to align with someone else's prior statement.** When a 1:1 transcript shows John saying X and Lindsay saying "I agree, and here's why..." — the rule may reject the second clause even though it's Lindsay's own view.

5. **The `_justification` requirement may produce gaming.** The model will learn to write justifications that satisfy the rule rather than honestly applying the test. Mitigation: the justification field is logged and auditable — if a sample shows gaming, we tighten by giving more counter-examples.

6. **No cross-session dedup.** Same stance from 6 meetings still becomes 6 entries. The current prompt doesn't see other meetings. The audit's recommendation #7 (cross-session dedup) needs a separate post-extraction pass — out of scope for this prompt, but the largest remaining source of stance-count inflation.

7. **The chain-of-thought adds tokens, which adds cost.** Each stance now requires the model to write a justification sentence. At ~25 tokens per justification, this is a 30-40% output token increase per stance — but with the cap of 3 stances, total output stays bounded and the precision gain is worth the marginal cost.

8. **The rules-heavy approach is brittle against grammatical surprises.** A position expressed in an unusual construction — passive voice, double-negatives, conditional ("if we were to do X, we should...") — may not match any rule's pattern signature and will be evaluated under the general contestability + transfer tests alone, where the model has more latitude and may over-extract or under-extract unpredictably. A second iteration with example-heavy training (Proposal B's territory) would catch these.
