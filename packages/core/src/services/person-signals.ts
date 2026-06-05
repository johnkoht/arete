/**
 * Person signal extraction: LLM stance extraction and action items with lifecycle.
 *
 * Stance extraction follows the DI pattern from conversations/extract.ts:
 *   buildStancePrompt() → callLLM() → parseStanceResponse()
 *
 * Action item extraction is regex-based with direction classification,
 * staleness detection, capping, and dedup.
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// LLM Stance Types
// ---------------------------------------------------------------------------

/**
 * Function signature for the LLM call.
 * Accepts a prompt string and returns the LLM's text response.
 */
export type LLMCallFn = (prompt: string) => Promise<string>;

/** Direction of a person's stance on a topic. */
export type StanceDirection = 'supports' | 'opposes' | 'concerned';

const VALID_DIRECTIONS = new Set<string>(['supports', 'opposes', 'concerned']);

/** A stance extracted from meeting content for a specific person. */
export type PersonStance = {
  topic: string;
  direction: StanceDirection;
  summary: string;
  evidenceQuote: string;
  justification: string;
  source: string;
  date: string;
};

/**
 * Raw JSON shape returned by the LLM (snake_case to match prompt).
 */
type RawStanceResult = {
  stances?: Array<{
    topic?: string;
    direction?: string;
    summary?: string;
    evidence_quote?: string;
    _justification?: string;
  }>;
};

// ---------------------------------------------------------------------------
// Stance Prompt
// ---------------------------------------------------------------------------

/**
 * Build the LLM prompt for extracting stances from content for a specific person.
 */
export function buildStancePrompt(content: string, personName: string): string {
  return `You are extracting STANCES held by ${personName} from a meeting transcript.

A STANCE is a position ${personName} holds that:
- Would be re-articulated in an unrelated conversation 3 months later (the TRANSFER test)
- Could be reasonably disagreed with by a smart colleague (the CONTESTABILITY test)
- Is about how things SHOULD be, not how things ARE, not what was decided, not what will be done next

Your job is to be picky. A typical meeting yields 0-2 stances. Most things people say in meetings are NOT stances — they're decisions already made, observations of current state, action items, project approvals, schedule commitments, or generic exhortations. **When in doubt, SKIP.**

Output AT MOST 5 stances from this transcript. Most meetings should yield 0-2. A meeting that yields 5 is exceptional.

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
- Maximum 5 stances from this transcript. If you have more candidates, pick the 5 most distinctive (least likely for any other leader in the same role to hold).
- Most meetings should yield 0-2. Zero is a valid count. A meeting that yields 5 is exceptional.

Transcript:
${content}`;
}

// ---------------------------------------------------------------------------
// Stance Response Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the LLM response into a PersonStance array.
 * Handles various response formats gracefully — never throws.
 */
export function parseStanceResponse(response: string): PersonStance[] {
  const trimmed = response.trim();
  if (!trimmed) return [];

  let jsonStr = trimmed;

  // Strip markdown code fences if present
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // Try to find a JSON object in the string
  const braceStart = jsonStr.indexOf('{');
  const braceEnd = jsonStr.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
  }

  let raw: RawStanceResult;
  try {
    raw = JSON.parse(jsonStr) as RawStanceResult;
  } catch {
    return [];
  }

  if (!Array.isArray(raw.stances)) return [];

  const stances: PersonStance[] = [];

  for (const item of raw.stances) {
    if (!item || typeof item !== 'object') continue;

    const topic = typeof item.topic === 'string' ? item.topic.trim() : '';
    const direction = typeof item.direction === 'string' ? item.direction.trim().toLowerCase() : '';
    const summary = typeof item.summary === 'string' ? item.summary.trim() : '';
    const evidenceQuote = typeof item.evidence_quote === 'string' ? item.evidence_quote.trim() : '';
    const justification = typeof item._justification === 'string' ? item._justification.trim() : '';

    // All required fields must be present and direction must be valid.
    // Justification is required (audit-trail invariant from Proposal C): if missing or empty
    // (whitespace-only), drop the stance — generic/missing justifications signal the model
    // could not honestly defend the extraction.
    if (!topic || !direction || !summary || !evidenceQuote || !justification) continue;
    if (!VALID_DIRECTIONS.has(direction)) continue;

    stances.push({
      topic,
      direction: direction as StanceDirection,
      summary,
      evidenceQuote,
      justification,
      source: '',
      date: '',
    });
  }

  // Hard-cap at 5 stances per call (Phase 9 followup-6: raised from 3).
  // Order matters: per-stance validation runs first, slice happens at parser exit.
  return stances.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Stance Extraction (Public API)
// ---------------------------------------------------------------------------

/**
 * Extract stances for a specific person from content using an LLM.
 *
 * @param content - Meeting transcript or conversation text
 * @param personName - Name of the person to extract stances for
 * @param callLLM - Function that calls the LLM with a prompt and returns the response
 * @returns Extracted stances — empty array on any error
 */
export async function extractStancesForPerson(
  content: string,
  personName: string,
  callLLM: LLMCallFn,
): Promise<PersonStance[]> {
  if (!content || content.trim() === '' || !personName || personName.trim() === '') {
    return [];
  }

  const prompt = buildStancePrompt(content, personName);
  try {
    const response = await callLLM(prompt);
    return parseStanceResponse(response);
  } catch {
    // LLM call failed — return empty stances rather than propagating the error
    return [];
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionItemDirection = 'i_owe_them' | 'they_owe_me';

export type PersonActionItem = {
  text: string;
  direction: ActionItemDirection;
  source: string;
  date: string;
  hash: string;
  stale: boolean;
  /** Optional goal association — links action item to a quarterly goal */
  goalSlug?: string;
  /** Optional area association — domain scoping. Metadata only, NOT part of dedup hash. */
  area?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STALE_THRESHOLD_DAYS = 30;
const DEFAULT_MAX_PER_DIRECTION = 10;

// ---------------------------------------------------------------------------
// Hash computation
// ---------------------------------------------------------------------------

/**
 * Content-normalized dedup hash: sha256(lowercase(trim(text)) + personSlug + direction).
 */
export function computeActionItemHash(
  text: string,
  personSlug: string,
  direction: ActionItemDirection,
): string {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  return createHash('sha256')
    .update(`${normalized}${personSlug}${direction}`)
    .digest('hex');
}

// ---------------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------------

/**
 * Returns true if the action item's source date is older than 30 days
 * relative to `referenceDate` (defaults to now).
 */
export function isActionItemStale(
  item: PersonActionItem,
  referenceDate?: Date,
): boolean {
  const ref = referenceDate ?? new Date();
  const itemDate = new Date(item.date);
  if (Number.isNaN(itemDate.getTime())) return true;
  const diffMs = ref.getTime() - itemDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > STALE_THRESHOLD_DAYS;
}

// ---------------------------------------------------------------------------
// Capping
// ---------------------------------------------------------------------------

/**
 * Keep most recent N items per direction, sorted by date descending.
 */
export function capActionItems(
  items: PersonActionItem[],
  maxPerDirection: number = DEFAULT_MAX_PER_DIRECTION,
): PersonActionItem[] {
  const iOwe = items
    .filter((i) => i.direction === 'i_owe_them')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, maxPerDirection);

  const theyOwe = items
    .filter((i) => i.direction === 'they_owe_me')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, maxPerDirection);

  return [...iOwe, ...theyOwe];
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Merge new items into existing, skipping any with a matching hash.
 */
export function deduplicateActionItems(
  existing: PersonActionItem[],
  newItems: PersonActionItem[],
): PersonActionItem[] {
  const seen = new Set(existing.map((i) => i.hash));
  const unique = newItems.filter((i) => !seen.has(i.hash));
  return [...existing, ...unique];
}
