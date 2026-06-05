# Stance Extraction Prompt — Proposal B (Few-Shot Examples)

**Authored**: 2026-06-04
**Design philosophy**: Demonstration-based; contrastive POS/NEG example pairs do the teaching; minimal abstract rules.
**Target**: 50-75 stances per person; precision >> recall.

## Design rationale

The current prompt fails because it tries to define "stance" abstractly ("a clear position, opinion, or preference") and then leaves the model to project that definition onto messy meeting transcripts. The result: the model anchors on surface verbs — "supports", "concerned", "wants" — and stamps "stance" on anything that fits a sentence template. 696 stances per person, ~10% precision.

Few-shot examples invert this. Instead of asking the model to *recognize* stances from a definition, we show it ~10 examples of what a real stance *looks like* alongside ~10 confusingly-similar things that are NOT stances. The model's job is no longer "interpret the rules" but "pattern-match against the demonstrations". Contrastive pairs are the key: each POSITIVE example has a sibling NEGATIVE that shares surface form but fails on a deeper test (transferability, contestability, intent-to-act-vs-position). The model learns the boundary by seeing where it's drawn, not by being told where to draw it.

What this catches well: surface-form traps that fooled the current extractor — "supports project X" (skip), "wants Y built" (skip), "is concerned that Z is happening" (skip-observation). What it might miss: stance shapes that look nothing like any of our examples — e.g., a stance expressed as a metaphor or analogy ("we're flying blind on this"), or a stance buried in a 5-turn dialogue where the position is inferred from sequence. Examples are anchors; far-from-anchor stances may be dropped. We accept this — the audit shows we have a precision crisis, not a recall crisis.

## Proposed buildStancePrompt() function body

```typescript
export function buildStancePrompt(content: string, personName: string): string {
  return `You are extracting STANCES held by ${personName} from a meeting transcript.

A STANCE is a position ${personName} holds that:
- Would be re-articulated in an unrelated conversation 3 months later
- Could be reasonably disagreed with by a smart colleague (it's contestable)
- Is about how things SHOULD be, not how things ARE

Your job is to be picky. A typical meeting yields 0-2 stances. Most things people say in meetings are NOT stances — they're decisions, observations, action items, or project approvals. When in doubt, SKIP.

Learn by example. Below are pairs of similar-looking statements where one is a real stance (KEEP) and one is not (SKIP). Study the contrast.

---

PAIR 1 — "supports X" surface form
  KEEP: "Lindsay strongly opposes making Claude chat the primary interface for adjusters, arguing the product must be a proper software UI with clickable interactions."
    Why KEEP: A philosophical position on UI design. Contestable (some PMs would argue chat IS the future). Transfers to any product, not just this one.
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
    Why SKIP: Vague exhortation any leader would agree with. Not contestable. Reveals nothing distinctive about Lindsay.

PAIR 6 — opinions on specific items
  KEEP: "Lindsay prefers wired headphones over wireless ones and dislikes dealing with Bluetooth."
    Why KEEP: A persistent personal preference she would re-articulate. Contestable in the trivial sense (others prefer wireless). Distinctive.
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

---

Quick rules (use only when no example matches):
- If the statement is about a specific project, deadline, or sprint — SKIP unless the philosophy behind it is also stated and transfers.
- If the verb is "wants X built/done/scheduled/assigned" — SKIP (action item).
- If the statement is "concerned that X is happening right now" — SKIP (observation).
- If the statement is something any reasonable leader would say ("velocity matters", "we should ship quality") — SKIP (not distinctive).
- If you would label it "neutral" — SKIP. Stances have a direction.
- Cap: aim for AT MOST 3 stances per transcript. If you are tempted to extract more, you are picking up agenda items.

Direction must be one of: supports | opposes | concerned
(Do NOT use "neutral" — if there's no clear direction, it's not a stance.)

Return ONLY valid JSON with this exact shape, no markdown, no code fences:

{
  "stances": [
    {
      "topic": "short noun phrase naming what the stance is about",
      "direction": "supports | opposes | concerned",
      "summary": "one sentence: ${personName} [direction] ___ because ___",
      "evidence_quote": "exact quote from the transcript supporting this stance"
    }
  ]
}

If no stances meet the bar, return {"stances": []}.

Extract stances ONLY for ${personName}. Ignore positions held by other participants.

Transcript:
${content}`;
}
```

## Example pairs included in the prompt

Each pair was selected to teach a specific contrast that maps to a failure category in the audit.

1. **POSITIVE**: "opposes making Claude chat the primary interface" (KEEP #21) — KEEP because it's a transferable UI philosophy.
   **NEGATIVE**: "supports John's project to revamp Notion" (SKIP: project-endorsement, 137 instances) — SKIP because it's endorsing a project.
   **Why pair these**: Both use "supports/opposes" + a named thing. Teaches that the object of the verb matters — philosophy vs. project.

2. **POSITIVE**: "wants ML/AI projects run like research projects" (KEEP #18) — KEEP because it's a methodology stance.
   **NEGATIVE**: "wants a front-end engineer assigned" (SKIP: action-item, 78 instances) — SKIP because it's resourcing intent.
   **Why pair these**: Both start with "Lindsay wants". Teaches the distinction between wanting a way-of-working vs. wanting a thing-to-happen.

3. **POSITIVE**: "skeptical of engineering time estimates" (KEEP #26) — KEEP because it's a persistent belief about a pattern.
   **NEGATIVE**: "concerned that engineers are slipping back" (SKIP: observation, 84 instances) — SKIP because it's about the present moment.
   **Why pair these**: Both express concern about engineers. Teaches the difference between a held belief about a pattern vs. an observation about right now.

4. **POSITIVE**: "agrees adjusters won't adapt unless Snapsheet is cut off" (KEEP #53) — KEEP because the underlying claim is sharp.
   **NEGATIVE**: "agrees workflows cannot be defined until vision established" (SKIP: agenda-topic, 49 instances) — SKIP because it's sequencing logic.
   **Why pair these**: Both use "agrees". Teaches that agreement only counts if the thing agreed-with is itself a real position.

5. **POSITIVE**: "believes change management role is necessary" (KEEP #9) — KEEP because it's an org-structure stance.
   **NEGATIVE**: "emphasizes the importance of velocity" (SKIP: weak-position, 71 instances) — SKIP because it's a platitude.
   **Why pair these**: Both use "believes X is important". Teaches contestability — would anyone reasonable disagree?

6. **POSITIVE**: "prefers wired headphones" (KEEP #62) — KEEP because it's a persistent personal preference that recurs.
   **NEGATIVE**: "supports the DSP info section as it would let CX self-serve" (SKIP: project-endorsement) — SKIP because it's feature approval.
   **Why pair these**: Both are preferences about specific items. Teaches that even small preferences count IF they persist across contexts; feature approvals do not.

7. **POSITIVE**: "opposes building products reliant on ECHECK" (KEEP #60) — KEEP because it's a tech-direction bet.
   **NEGATIVE**: "supports pausing the Claim Clear program" (SKIP: decision, 91 instances) — SKIP because it's accepting an external decision.
   **Why pair these**: Both have "supports/opposes [program]". Teaches that accepting a forced decision is not the same as holding a position.

8. **POSITIVE**: "believes adjuster experience must start structured" (KEEP #42) — KEEP because it's a UX claim about a population.
   **NEGATIVE**: "acknowledges Snapsheet is serving as template UI for now" (SKIP: weak-position) — SKIP because acknowledgment + "for now" = situational.
   **Why pair these**: Both reference Snapsheet/UX. Teaches that "acknowledges" + temporal qualifiers signal non-stance.

9. **POSITIVE**: "BI claims should keep adjuster in the driver's seat" (KEEP #16) — KEEP because it's a "should" claim with reasoning that transfers.
   **NEGATIVE**: "supports Aug-Nov timeline for heads-down development" (SKIP: deadline-milestone, 26 instances) — SKIP because it's a schedule.
   **Why pair these**: Both use "supports X". Teaches that dates/timelines never qualify even when framed as supports.

10. **POSITIVE**: "insists on 'responsibility' rather than 'liability' for POP" (KEEP #70) — KEEP because it's a recurring terminology stance with substance.
    **NEGATIVE**: "believes guidelines need to be established for CDJ demos" (SKIP: agenda-topic) — SKIP because it identifies a gap without taking a position.
    **Why pair these**: Both are about language/definitions. Teaches that "we need to define X" is not the same as "X should be defined as Y".

## Parser changes required

Single change: drop `neutral` from `VALID_DIRECTIONS` and from the `StanceDirection` union.

```typescript
// person-signals.ts line 24
export type StanceDirection = 'supports' | 'opposes' | 'concerned';

// person-signals.ts line 26
const VALID_DIRECTIONS = new Set<string>(['supports', 'opposes', 'concerned']);
```

The audit confirms `neutral` is never a real stance (rule #9 in recommendations). Any stance the LLM tags `neutral` will now be discarded by the parser. The prompt instructs the model to not emit `neutral` in the first place; the parser is a backstop.

No other schema changes. Output shape remains: `{stances: [{topic, direction, summary, evidence_quote}]}`. Parser already trims/validates correctly.

## Behavior trace on 10 test cases

5 from KEEPs, 5 from SKIPs (covering the same 5 failure modes as Proposal A: action-item, decision, observation, project-endorsement, weak-position).

### KEEP cases

1. **Input**: "Lindsay strongly opposes making Claude chat the primary interface for adjusters, arguing the product must be a proper software UI with clickable interactions."
   **Expected**: KEEP — opposes, topic: chat-as-claims-UX.
   **Why**: Direct match to PAIR 1 POSITIVE. Model pattern-matches "opposes [philosophy about UI]" and extracts.

2. **Input**: "Lindsay wants ML and AI model projects run like research projects rather than requiring detailed product requirements upfront."
   **Expected**: KEEP — supports, topic: ML-projects-as-research.
   **Why**: Verbatim PAIR 2 POSITIVE. Model knows "wants [methodology]" pattern is a stance.

3. **Input**: "Lindsay believes the change management role is necessary because product features were being built and deployed with no accountability for adoption."
   **Expected**: KEEP — supports, topic: dedicated change-management role.
   **Why**: Matches PAIR 5 POSITIVE. "Believes X is necessary because Y" with substantive reasoning.

4. **Input**: "Lindsay opposes building products reliant on ECHECK because it is declining rapidly and major banks are refusing to accept it."
   **Expected**: KEEP — opposes, topic: ECHECK-viability.
   **Why**: PAIR 7 POSITIVE verbatim. Model sees "opposes [tech] because [industry trend]".

5. **Input**: "Lindsay prefers wired headphones over wireless ones and dislikes dealing with Bluetooth."
   **Expected**: KEEP — opposes, topic: wireless headphones.
   **Why**: PAIR 6 POSITIVE verbatim. Model trained that even small persistent preferences qualify.

### SKIP cases

6. **Input** (action-item): "Lindsay wants to get a front-end engineer assigned to the Glance claim view redesign as soon as possible."
   **Expected**: SKIP.
   **Why**: PAIR 2 NEGATIVE verbatim. Model pattern-matches "wants [person] assigned" → action item. Reinforced by rule "If verb is 'wants X built/done/scheduled/assigned' — SKIP".

7. **Input** (decision): "Lindsay supports pausing the Claim Clear program due to Marsh's legal concerns."
   **Expected**: SKIP.
   **Why**: PAIR 7 NEGATIVE. Model sees "supports [decision] due to [external constraint]" — same shape as the demonstrated NEGATIVE.

8. **Input** (observation): "Lindsay is concerned that engineers are slipping back into old habits of spinning their wheels instead of working at the pace they demonstrated during the Pop sprint."
   **Expected**: SKIP.
   **Why**: PAIR 3 NEGATIVE verbatim. Model knows "concerned that [present-tense behavior]" → observation. Reinforced by rule.

9. **Input** (project-endorsement): "Lindsay supports John's project to revamp the team's Notion setup."
   **Expected**: SKIP.
   **Why**: PAIR 1 NEGATIVE verbatim. Model trained that "supports [named project]" is endorsement, not stance.

10. **Input** (weak-position): "Lindsay Gray emphasizes the importance of maintaining development velocity."
    **Expected**: SKIP.
    **Why**: PAIR 5 NEGATIVE verbatim. Model trained that "emphasizes importance of [generic value]" → platitude. Reinforced by rule "any reasonable leader would say — SKIP".

## Expected outcome

- **Stance count for Lindsay-style person**: 60-90 across ~80 source meetings. Worst-case slightly higher than the 50-75 target because there's no cross-session dedup in this proposal (that's a separate post-processing step — the audit's recommendation #7). Per-meeting cap of ≤3 will hold the line on within-meeting noise.
- **False-positive rate**: estimated 20-30%. The contrastive pairs eliminate the dominant failure modes (project-endorsement, action-item, observation) but won't catch every edge case — particularly stance-shaped statements about specific named projects where the underlying philosophy is implicit but not stated.
- **False-negative rate**: estimated 25-35%. Stances expressed via metaphor, multi-turn dialogue, or unusual surface form may be missed. The audit's 73 KEEPs are mostly direct-statement form, which the examples cover well; rarer shapes will drop.
- **Compared to current prompt**: precision goes from ~10% to ~70-80%; recall drops from ~100% (of the 73 real stances) to ~65-75%. Net win because the original ~90% noise was actively making the stance file unusable.

## Risks / known weaknesses of this approach

1. **Token cost**: the 10 example pairs add ~1500 tokens to every extraction call. With ~80 meetings × $X/1K tokens per re-extraction, this is non-trivial but not prohibitive. Mitigation: examples are stable, so the prompt prefix is identical across calls and can be aggressively cache-tagged.

2. **Out-of-distribution stances**: any stance expressed in a form not represented in the pairs may be skipped. Particularly at risk: stances that emerge from a sequence of statements rather than a single sentence; stances expressed as questions ("why are we still on Snapsheet?"); stances expressed via vivid metaphor ("it's like an abusive relationship" — KEEP #38, would the model recognize this?).

3. **Person-specificity**: the examples are drawn from Lindsay. If the prompt is reused for someone with a very different communication style (e.g., a non-PM whose stances aren't about org/methodology), the examples might subtly mislead. Mitigation: the contrastive structure teaches the *shape* of the test (transferable, contestable, position-not-action) more than the *content* — should generalize. To test: rerun on a different person and audit.

4. **No cross-session dedup**: this prompt operates on a single transcript at a time, so the audit's failure mode #4 (same stance re-extracted across 15 meetings) is NOT solved here. That requires a separate merge/dedup step downstream. This proposal does not block that — but on its own, without dedup, expect stance count to drift upward over time.

5. **Per-meeting cap is soft**: the prompt says "aim for AT MOST 3" but the model may exceed it. If we want a hard cap, add a post-extraction truncation in the parser (top-3 by some confidence signal — though we don't currently have one). For now, the soft cap is a strong prior.

6. **Examples can become stale**: if Lindsay's stance landscape shifts substantially (new role, new domain), the example pairs may stop reflecting the highest-value contrasts. Plan to re-audit and rotate examples every 6 months or at any major life/role change.
