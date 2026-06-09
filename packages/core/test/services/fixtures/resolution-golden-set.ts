/**
 * Phase 11 11a — 50-pair golden set for AC3a precision validation.
 *
 * Each pair is a (commitment, Sent-message) tuple with a ground-truth label:
 *   MATCH      — Gmail Sent message genuinely fulfills the commitment (→ HIGH)
 *   NO-MATCH   — does NOT fulfill (wrong recipient / pre-commitment / wrong
 *                artifact / unrelated) (→ pre-filter cull OR LOW)
 *   AMBIGUOUS  — plausible but uncertain (draft-vs-final, partial) (→ MEDIUM)
 *
 * Composition (per M1):
 *   - 6 anchor positives drawn from golden-set-from-triage-2026-06-03.md
 *     (the RESOLVE-6: CoverWhale/Leap DOI feedback, status-letter draft,
 *     new-engineer overview session) — synthesized into Sent-message shape.
 *   - ~30 mechanical synthetic negatives (recipient/temporal/artifact mismatch
 *     cross-product).
 *   - ~14 judgment-call pairs (draft-vs-final ambiguity, near-misses).
 *
 * SYNTHETIC — no production data. Emails are fabricated reserv.com addresses
 * mirroring the people directory shape. This file is the deterministic ground
 * truth the precision test (AC3a) asserts against with a calibrated mock LLM.
 */

import type { EmailThread } from '../../../src/integrations/gws/types.js';
import type { OpenCommitmentForResolution } from '../../../src/services/commitment-resolution-pipeline.js';

export type GoldenLabel = 'MATCH' | 'NO-MATCH' | 'AMBIGUOUS';

export type GoldenPair = {
  name: string;
  commitment: OpenCommitmentForResolution;
  message: EmailThread;
  label: GoldenLabel;
};

/** People directory used by the golden set (slug → email). */
export const GOLDEN_PEOPLE: Record<string, string> = {
  'lindsay-gray': 'lindsay.gray@reserv.com',
  'dave-wiedenheft': 'dave.wiedenheft@reserv.com',
  'anthony-avina': 'anthony.avina@reserv.com',
  'philip-blackett': 'philip.blackett@reserv.com',
  'austin-cohen': 'austin.cohen@reserv.com',
  'jamie-renner': 'jamie.renner@reserv.com',
  'isaiah-cruz': 'isaiah.cruz@reserv.com',
  'cj-marples': 'cj.marples@reserv.com',
  'john-koht': 'john.koht@reserv.com',
};

let threadSeq = 0;
function msg(over: Partial<EmailThread>): EmailThread {
  threadSeq += 1;
  return {
    id: `gthread-${threadSeq}`,
    subject: '',
    snippet: '',
    from: 'john.koht@reserv.com',
    date: '2026-06-03',
    labels: ['SENT'],
    unread: false,
    to: [],
    cc: [],
    bcc: [],
    body: '',
    attachments: [],
    sentAt: '2026-06-03T15:00:00.000Z',
    ...over,
  };
}

function commit(over: Partial<OpenCommitmentForResolution>): OpenCommitmentForResolution {
  return {
    id: `gc-${over.id ?? Math.random().toString(36).slice(2, 8)}`,
    text: '',
    date: '2026-06-01',
    recipientSlugs: [],
    ...over,
  };
}

const PDF = (filename: string) => ({ filename, mimeType: 'application/pdf', sizeBytes: 2048 });

// ---------------------------------------------------------------------------
// 6 anchor positives (RESOLVE-6 from triage)
// ---------------------------------------------------------------------------

const anchors: GoldenPair[] = [
  {
    name: 'anchor: CoverWhale/Leap DOI feedback → Anthony',
    commitment: commit({ id: '943b8893', text: 'Send Anthony the CoverWhale/Leap DOI feedback doc', recipientSlugs: ['anthony-avina'] }),
    message: msg({
      to: ['anthony.avina@reserv.com'],
      subject: 'CoverWhale / Leap DOI feedback',
      body: 'Anthony — here is the DOI feedback doc with the CoverWhale and Leap notes.',
      attachments: [PDF('doi-feedback.pdf')],
    }),
    label: 'MATCH',
  },
  {
    name: 'anchor: status-letter draft doc → Lindsay',
    commitment: commit({ id: '3e7ce8b6', text: 'Update the status-letter doc draft and share with Lindsay', recipientSlugs: ['lindsay-gray'] }),
    message: msg({
      to: ['lindsay.gray@reserv.com'],
      subject: 'Status-letter doc draft',
      body: 'Lindsay — updated the status-letter doc, draft attached for your review.',
      attachments: [{ filename: 'status-letter-draft.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 4096 }],
    }),
    label: 'MATCH',
  },
  {
    name: 'anchor: overview session writeup → new engineers (Dave)',
    commitment: commit({ id: 'a0f20b6f', text: 'Send Dave the overview session summary doc', recipientSlugs: ['dave-wiedenheft'] }),
    message: msg({
      to: ['dave.wiedenheft@reserv.com'],
      subject: 'Overview session summary',
      body: 'Dave — summary doc from the new-engineer overview session, attached.',
      attachments: [PDF('overview-summary.pdf')],
    }),
    label: 'MATCH',
  },
  {
    name: 'anchor: CoverWhale follow-up #2 → Anthony (cc)',
    commitment: commit({ id: '7d956c6e', text: 'Email Anthony the Leap DOI summary report', recipientSlugs: ['anthony-avina'] }),
    message: msg({
      cc: ['anthony.avina@reserv.com'],
      to: ['dave.wiedenheft@reserv.com'],
      subject: 'Leap DOI summary',
      body: 'Summary report for the Leap DOI work — Anthony cc-ed.',
      attachments: [PDF('leap-doi-summary.pdf')],
    }),
    label: 'MATCH',
  },
  {
    name: 'anchor: POP MVP plan deck → Lindsay',
    commitment: commit({ id: '0b3609e9', text: 'Deliver the POP MVP plan deck to Lindsay', recipientSlugs: ['lindsay-gray'] }),
    message: msg({
      to: ['lindsay.gray@reserv.com'],
      subject: 'POP MVP plan',
      body: 'Lindsay — POP MVP plan deck attached.',
      attachments: [{ filename: 'pop-mvp-plan.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', sizeBytes: 8192 }],
    }),
    label: 'MATCH',
  },
  {
    name: 'anchor: one-pager → Philip',
    commitment: commit({ id: 'a25e6a2f', text: 'Send Philip the one-pager doc with tasks and Jira links', recipientSlugs: ['philip-blackett'] }),
    message: msg({
      to: ['philip.blackett@reserv.com'],
      subject: 'One-pager: tasks + Jira',
      body: 'Philip — one-pager doc with the task breakdown and Jira links attached.',
      attachments: [PDF('one-pager.pdf')],
    }),
    label: 'MATCH',
  },
];

// ---------------------------------------------------------------------------
// Additional clean positives (rounding out MATCH coverage)
// ---------------------------------------------------------------------------

const morePositives: GoldenPair[] = [
  {
    name: 'positive: AI prompts → Austin',
    commitment: commit({ id: 'b99d56e9', text: 'Send Austin the AI prompts doc', recipientSlugs: ['austin-cohen'] }),
    message: msg({ to: ['austin.cohen@reserv.com'], subject: 'AI prompts', body: 'Austin — AI prompts doc attached.', attachments: [PDF('ai-prompts.pdf')] }),
    label: 'MATCH',
  },
  {
    name: 'positive: roadmap deck → Philip',
    commitment: commit({ id: '515a92e4', text: 'Draft the roadmap deck and send to Philip', recipientSlugs: ['philip-blackett'] }),
    message: msg({ to: ['philip.blackett@reserv.com'], subject: 'Roadmap draft', body: 'Philip — roadmap deck attached.', attachments: [{ filename: 'roadmap.pptx', mimeType: 'application/vnd.ms-powerpoint', sizeBytes: 9000 }] }),
    label: 'MATCH',
  },
  {
    name: 'positive: prototype link → Isaiah',
    commitment: commit({ id: '265342b2', text: 'Send Isaiah the prototype spec doc', recipientSlugs: ['isaiah-cruz'] }),
    message: msg({ to: ['isaiah.cruz@reserv.com'], subject: 'Prototype spec', body: 'Isaiah — prototype spec doc attached.', attachments: [PDF('prototype-spec.pdf')] }),
    label: 'MATCH',
  },
  {
    name: 'positive: TDD draft email → Anthony (no attachment, body delivers)',
    commitment: commit({ id: 'e141a29b', text: 'Start the TDD draft and email it to Anthony', recipientSlugs: ['anthony-avina'] }),
    message: msg({ to: ['anthony.avina@reserv.com'], subject: 'TDD draft', body: 'Anthony — TDD draft inline below. [full TDD content...]', attachments: [PDF('tdd-draft.pdf')] }),
    label: 'MATCH',
  },
  {
    name: 'positive: async review — meeting Mon, sent Wed (AC3b)',
    commitment: commit({ id: 'async01', text: 'Send Lindsay the revised analysis doc', date: '2026-06-01', recipientSlugs: ['lindsay-gray'] }),
    message: msg({ to: ['lindsay.gray@reserv.com'], subject: 'Revised analysis', body: 'Lindsay — revised analysis doc attached.', attachments: [PDF('analysis.pdf')], sentAt: '2026-06-03T09:00:00.000Z' }),
    label: 'MATCH',
  },
  {
    name: 'positive: exec summary → Austin',
    commitment: commit({ id: 'execsum1', text: 'Send Austin the Coral Trucking exec summary memo', recipientSlugs: ['austin-cohen'] }),
    message: msg({ to: ['austin.cohen@reserv.com'], subject: 'Coral Trucking exec summary', body: 'Austin — Coral Trucking exec summary memo attached.', attachments: [PDF('coral-exec-summary.pdf')] }),
    label: 'MATCH',
  },
  {
    name: 'positive: CJ status-letter one-pager',
    commitment: commit({ id: 'f79e8201', text: 'Send CJ the eng one-pager doc', recipientSlugs: ['cj-marples'] }),
    message: msg({ to: ['cj.marples@reserv.com'], subject: 'Eng one-pager', body: 'CJ — eng one-pager doc attached.', attachments: [PDF('eng-one-pager.pdf')] }),
    label: 'MATCH',
  },
];

// ---------------------------------------------------------------------------
// Mechanical synthetic negatives (NO-MATCH) — pre-filter should cull most
// ---------------------------------------------------------------------------

const negatives: GoldenPair[] = [
  // Wrong recipient (sent to someone other than the committed recipient).
  {
    name: 'neg: deck to Lindsay, but Sent to Austin',
    commitment: commit({ id: 'wr1', text: 'Send Lindsay the deck', recipientSlugs: ['lindsay-gray'] }),
    message: msg({ to: ['austin.cohen@reserv.com'], subject: 'deck', body: 'here is the deck', attachments: [PDF('deck.pdf')] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: doc to Philip, Sent to Dave',
    commitment: commit({ id: 'wr2', text: 'Send Philip the PRD doc', recipientSlugs: ['philip-blackett'] }),
    message: msg({ to: ['dave.wiedenheft@reserv.com'], subject: 'PRD', body: 'PRD doc attached', attachments: [PDF('prd.pdf')] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: report to Anthony, Sent to Jamie',
    commitment: commit({ id: 'wr3', text: 'Send Anthony the report', recipientSlugs: ['anthony-avina'] }),
    message: msg({ to: ['jamie.renner@reserv.com'], subject: 'report', body: 'report attached', attachments: [PDF('report.pdf')] }),
    label: 'NO-MATCH',
  },
  // Pre-commitment (sent BEFORE the commitment date) — temporal cull (AC3b).
  {
    name: 'neg: pre-commitment send (sent before commitment date)',
    commitment: commit({ id: 'pre1', text: 'Send Lindsay the deck', date: '2026-06-05', recipientSlugs: ['lindsay-gray'] }),
    message: msg({ to: ['lindsay.gray@reserv.com'], subject: 'deck', body: 'deck attached', attachments: [PDF('deck.pdf')], sentAt: '2026-06-02T10:00:00.000Z' }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: far-future send (beyond temporal window)',
    commitment: commit({ id: 'pre2', text: 'Send Philip the roadmap doc', date: '2026-01-01', recipientSlugs: ['philip-blackett'] }),
    message: msg({ to: ['philip.blackett@reserv.com'], subject: 'roadmap', body: 'roadmap doc', attachments: [PDF('roadmap.pdf')], sentAt: '2026-06-03T10:00:00.000Z' }),
    label: 'NO-MATCH',
  },
  // Wrong/missing artifact (named artifact, no corroboration) — artifact cull.
  {
    name: 'neg: deck commitment, Sent about lunch (no artifact)',
    commitment: commit({ id: 'art1', text: 'Send Lindsay the deck', recipientSlugs: ['lindsay-gray'] }),
    message: msg({ to: ['lindsay.gray@reserv.com'], subject: 'lunch?', body: 'want to grab lunch tomorrow?', attachments: [] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: PRD commitment, Sent scheduling email (no artifact)',
    commitment: commit({ id: 'art2', text: 'Send Dave the PRD', recipientSlugs: ['dave-wiedenheft'] }),
    message: msg({ to: ['dave.wiedenheft@reserv.com'], subject: 'meeting time', body: 'can we move our 1:1 to 3pm?', attachments: [] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: spec commitment, Sent FYI link (no artifact corroboration)',
    commitment: commit({ id: 'art3', text: 'Send Austin the spec', recipientSlugs: ['austin-cohen'] }),
    message: msg({ to: ['austin.cohen@reserv.com'], subject: 'fyi', body: 'thought you would find this article interesting', attachments: [] }),
    label: 'NO-MATCH',
  },
  // Unrelated content with right recipient + an attachment but wrong subject.
  {
    name: 'neg: deck commitment, Sent expense report (wrong artifact identity)',
    commitment: commit({ id: 'unr1', text: 'Send Lindsay the POP MVP deck', recipientSlugs: ['lindsay-gray'] }),
    message: msg({ to: ['lindsay.gray@reserv.com'], subject: 'Q2 expense report', body: 'Lindsay — my Q2 expenses attached for approval.', attachments: [PDF('q2-expenses.pdf')] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: invoice commitment, Sent vacation note',
    commitment: commit({ id: 'unr2', text: 'Send Philip the invoice', recipientSlugs: ['philip-blackett'] }),
    message: msg({ to: ['philip.blackett@reserv.com'], subject: 'OOO next week', body: 'I will be out Monday-Wednesday.', attachments: [] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: contract commitment, no recipient email match (unknown slug)',
    commitment: commit({ id: 'unr3', text: 'Send the contract to the vendor', recipientSlugs: ['unknown-vendor'] }),
    message: msg({ to: ['someone@external.com'], subject: 'contract', body: 'contract attached', attachments: [PDF('contract.pdf')] }),
    label: 'NO-MATCH',
  },
  // Right recipient + doc, but commitment about a CALL (no artifact named → relies on LLM).
  {
    name: 'neg: "call Lindsay" commitment, Sent an unrelated doc',
    commitment: commit({ id: 'call1', text: 'Call Lindsay about Amazon morale', recipientSlugs: ['lindsay-gray'] }),
    message: msg({ to: ['lindsay.gray@reserv.com'], subject: 'budget numbers', body: 'Lindsay — the Q3 budget numbers you asked for.', attachments: [PDF('budget.pdf')] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: "schedule meeting" commitment, Sent a deck (different action)',
    commitment: commit({ id: 'sch1', text: 'Schedule the planning meeting with Dave', recipientSlugs: ['dave-wiedenheft'] }),
    message: msg({ to: ['dave.wiedenheft@reserv.com'], subject: 'unrelated deck', body: 'Dave — slides from last week.', attachments: [{ filename: 'slides.pptx', mimeType: 'application/vnd.ms-powerpoint', sizeBytes: 5000 }] }),
    label: 'NO-MATCH',
  },
  // Self-send (would be filtered earlier by M5, but include for completeness).
  {
    name: 'neg: self-reminder commitment, Sent to self',
    commitment: commit({ id: 'self1', text: 'Note to self: prep the deck', recipientSlugs: [] }),
    message: msg({ to: ['john.koht@reserv.com'], subject: 'deck reminder', body: 'remember to prep the deck', attachments: [PDF('deck.pdf')] }),
    label: 'NO-MATCH',
  },
  // More mechanical recipient mismatches across the cross-product.
  {
    name: 'neg: memo to Jamie, Sent to Isaiah',
    commitment: commit({ id: 'wr4', text: 'Send Jamie the memo', recipientSlugs: ['jamie-renner'] }),
    message: msg({ to: ['isaiah.cruz@reserv.com'], subject: 'memo', body: 'memo attached', attachments: [PDF('memo.pdf')] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: notes to Isaiah, Sent to CJ',
    commitment: commit({ id: 'wr5', text: 'Send Isaiah the notes doc', recipientSlugs: ['isaiah-cruz'] }),
    message: msg({ to: ['cj.marples@reserv.com'], subject: 'notes', body: 'notes doc attached', attachments: [PDF('notes.pdf')] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: proposal to CJ, Sent to Austin',
    commitment: commit({ id: 'wr6', text: 'Send CJ the proposal', recipientSlugs: ['cj-marples'] }),
    message: msg({ to: ['austin.cohen@reserv.com'], subject: 'proposal', body: 'proposal attached', attachments: [PDF('proposal.pdf')] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: summary to Dave, Sent to Philip',
    commitment: commit({ id: 'wr7', text: 'Send Dave the summary', recipientSlugs: ['dave-wiedenheft'] }),
    message: msg({ to: ['philip.blackett@reserv.com'], subject: 'summary', body: 'summary attached', attachments: [PDF('summary.pdf')] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: analysis to Austin, Sent to Lindsay',
    commitment: commit({ id: 'wr8', text: 'Send Austin the analysis', recipientSlugs: ['austin-cohen'] }),
    message: msg({ to: ['lindsay.gray@reserv.com'], subject: 'analysis', body: 'analysis attached', attachments: [PDF('analysis.pdf')] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: letter to Philip, Sent to Jamie',
    commitment: commit({ id: 'wr9', text: 'Send Philip the letter', recipientSlugs: ['philip-blackett'] }),
    message: msg({ to: ['jamie.renner@reserv.com'], subject: 'letter', body: 'letter attached', attachments: [PDF('letter.pdf')] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: agenda to Lindsay, Sent pre-commitment',
    commitment: commit({ id: 'pre3', text: 'Send Lindsay the agenda', date: '2026-06-10', recipientSlugs: ['lindsay-gray'] }),
    message: msg({ to: ['lindsay.gray@reserv.com'], subject: 'agenda', body: 'agenda attached', attachments: [PDF('agenda.pdf')], sentAt: '2026-06-01T10:00:00.000Z' }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: presentation to Dave, no artifact in unrelated note',
    commitment: commit({ id: 'art4', text: 'Send Dave the presentation', recipientSlugs: ['dave-wiedenheft'] }),
    message: msg({ to: ['dave.wiedenheft@reserv.com'], subject: 'quick question', body: 'do you have the door code?', attachments: [] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: spreadsheet to Austin, unrelated thank-you',
    commitment: commit({ id: 'art5', text: 'Send Austin the spreadsheet', recipientSlugs: ['austin-cohen'] }),
    message: msg({ to: ['austin.cohen@reserv.com'], subject: 'thanks!', body: 'thanks for covering my shift', attachments: [] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: brief to Jamie, Sent to Dave',
    commitment: commit({ id: 'wr10', text: 'Send Jamie the brief', recipientSlugs: ['jamie-renner'] }),
    message: msg({ to: ['dave.wiedenheft@reserv.com'], subject: 'brief', body: 'brief attached', attachments: [PDF('brief.pdf')] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: slides to Isaiah, Sent to Philip',
    commitment: commit({ id: 'wr11', text: 'Send Isaiah the slides', recipientSlugs: ['isaiah-cruz'] }),
    message: msg({ to: ['philip.blackett@reserv.com'], subject: 'slides', body: 'slides attached', attachments: [{ filename: 'slides.pptx', mimeType: 'application/vnd.ms-powerpoint', sizeBytes: 5000 }] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: doc to CJ, Sent to Lindsay',
    commitment: commit({ id: 'wr12', text: 'Send CJ the doc', recipientSlugs: ['cj-marples'] }),
    message: msg({ to: ['lindsay.gray@reserv.com'], subject: 'doc', body: 'doc attached', attachments: [PDF('doc.pdf')] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: report to Austin, Sent unrelated calendar invite text',
    commitment: commit({ id: 'art6', text: 'Send Austin the report', recipientSlugs: ['austin-cohen'] }),
    message: msg({ to: ['austin.cohen@reserv.com'], subject: 'lunch spot', body: 'tried that new taco place, recommend it', attachments: [] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: memo to Philip, Sent to Anthony',
    commitment: commit({ id: 'wr13', text: 'Send Philip the memo', recipientSlugs: ['philip-blackett'] }),
    message: msg({ to: ['anthony.avina@reserv.com'], subject: 'memo', body: 'memo attached', attachments: [PDF('memo.pdf')] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: contract to Dave, Sent to CJ',
    commitment: commit({ id: 'wr14', text: 'Send Dave the contract', recipientSlugs: ['dave-wiedenheft'] }),
    message: msg({ to: ['cj.marples@reserv.com'], subject: 'contract', body: 'contract attached', attachments: [PDF('contract.pdf')] }),
    label: 'NO-MATCH',
  },
  {
    name: 'neg: plan to Lindsay, Sent pre-commitment',
    commitment: commit({ id: 'pre4', text: 'Send Lindsay the plan', date: '2026-06-15', recipientSlugs: ['lindsay-gray'] }),
    message: msg({ to: ['lindsay.gray@reserv.com'], subject: 'plan', body: 'plan attached', attachments: [PDF('plan.pdf')], sentAt: '2026-06-10T10:00:00.000Z' }),
    label: 'NO-MATCH',
  },
];

// ---------------------------------------------------------------------------
// Judgment-call AMBIGUOUS pairs (draft-vs-final, partials) → MEDIUM
// ---------------------------------------------------------------------------

const ambiguous: GoldenPair[] = [
  {
    name: 'ambiguous: "FINAL deck" commitment vs "deck-draft" attachment',
    commitment: commit({ id: 'amb1', text: 'Send Lindsay the FINAL deck', recipientSlugs: ['lindsay-gray'] }),
    message: msg({ to: ['lindsay.gray@reserv.com'], subject: 'deck draft', body: 'Lindsay — here is the deck-draft, not final yet but wanted your eyes.', attachments: [PDF('deck-draft.pdf')] }),
    label: 'AMBIGUOUS',
  },
  {
    name: 'ambiguous: "signed contract" vs "contract for signature"',
    commitment: commit({ id: 'amb2', text: 'Send Philip the signed contract', recipientSlugs: ['philip-blackett'] }),
    message: msg({ to: ['philip.blackett@reserv.com'], subject: 'contract for signature', body: 'Philip — contract attached, please sign and return.', attachments: [PDF('contract-unsigned.pdf')] }),
    label: 'AMBIGUOUS',
  },
  {
    name: 'ambiguous: "final PRD" vs "PRD v0.3 WIP"',
    commitment: commit({ id: 'amb3', text: 'Send Dave the final PRD', recipientSlugs: ['dave-wiedenheft'] }),
    message: msg({ to: ['dave.wiedenheft@reserv.com'], subject: 'PRD v0.3 (WIP)', body: 'Dave — PRD work-in-progress, still iterating.', attachments: [PDF('prd-v0.3.pdf')] }),
    label: 'AMBIGUOUS',
  },
  {
    name: 'ambiguous: "complete report" vs "partial report, more to come"',
    commitment: commit({ id: 'amb4', text: 'Send Austin the complete report', recipientSlugs: ['austin-cohen'] }),
    message: msg({ to: ['austin.cohen@reserv.com'], subject: 'report (part 1)', body: 'Austin — first half of the report; rest by Friday.', attachments: [PDF('report-part1.pdf')] }),
    label: 'AMBIGUOUS',
  },
  {
    name: 'ambiguous: "revised proposal" vs "proposal — let me know edits"',
    commitment: commit({ id: 'amb5', text: 'Send CJ the revised proposal', recipientSlugs: ['cj-marples'] }),
    message: msg({ to: ['cj.marples@reserv.com'], subject: 'proposal', body: 'CJ — proposal attached; not sure if this is the revision you meant.', attachments: [PDF('proposal.pdf')] }),
    label: 'AMBIGUOUS',
  },
  {
    name: 'ambiguous: "summary doc" vs short email recap (no attachment)',
    commitment: commit({ id: 'amb6', text: 'Send Jamie the summary doc', recipientSlugs: ['jamie-renner'] }),
    message: msg({ to: ['jamie.renner@reserv.com'], subject: 'quick summary', body: 'Jamie — quick summary inline: we agreed on X and Y. Full doc later.', attachments: [] }),
    label: 'AMBIGUOUS',
  },
  {
    name: 'ambiguous: "spec doc" vs "spec outline" attachment',
    commitment: commit({ id: 'amb7', text: 'Send Isaiah the spec doc', recipientSlugs: ['isaiah-cruz'] }),
    message: msg({ to: ['isaiah.cruz@reserv.com'], subject: 'spec outline', body: 'Isaiah — outline of the spec; full doc TBD.', attachments: [PDF('spec-outline.pdf')] }),
    label: 'AMBIGUOUS',
  },
  {
    name: 'ambiguous: "finalized analysis" vs "analysis draft for feedback"',
    commitment: commit({ id: 'amb8', text: 'Send Lindsay the finalized analysis', recipientSlugs: ['lindsay-gray'] }),
    message: msg({ to: ['lindsay.gray@reserv.com'], subject: 'analysis draft', body: 'Lindsay — draft analysis, want your feedback before finalizing.', attachments: [PDF('analysis-draft.pdf')] }),
    label: 'AMBIGUOUS',
  },
  {
    name: 'ambiguous: "approved memo" vs "memo for review"',
    commitment: commit({ id: 'amb9', text: 'Send Philip the approved memo', recipientSlugs: ['philip-blackett'] }),
    message: msg({ to: ['philip.blackett@reserv.com'], subject: 'memo for review', body: 'Philip — memo for your approval.', attachments: [PDF('memo.pdf')] }),
    label: 'AMBIGUOUS',
  },
  {
    name: 'ambiguous: "complete agenda" vs "rough agenda"',
    commitment: commit({ id: 'amb10', text: 'Send Dave the complete agenda', recipientSlugs: ['dave-wiedenheft'] }),
    message: msg({ to: ['dave.wiedenheft@reserv.com'], subject: 'rough agenda', body: 'Dave — rough agenda, will flesh out.', attachments: [PDF('agenda-rough.pdf')] }),
    label: 'AMBIGUOUS',
  },
  {
    name: 'ambiguous: "final slides" vs "slides v2 (still editing)"',
    commitment: commit({ id: 'amb11', text: 'Send Austin the final slides', recipientSlugs: ['austin-cohen'] }),
    message: msg({ to: ['austin.cohen@reserv.com'], subject: 'slides v2 (editing)', body: 'Austin — v2 of the slides, still editing the last few.', attachments: [{ filename: 'slides-v2.pptx', mimeType: 'application/vnd.ms-powerpoint', sizeBytes: 5000 }] }),
    label: 'AMBIGUOUS',
  },
  {
    name: 'ambiguous: "signed letter" vs "letter draft"',
    commitment: commit({ id: 'amb12', text: 'Send CJ the signed letter', recipientSlugs: ['cj-marples'] }),
    message: msg({ to: ['cj.marples@reserv.com'], subject: 'letter draft', body: 'CJ — letter draft for your review before I sign.', attachments: [PDF('letter-draft.pdf')] }),
    label: 'AMBIGUOUS',
  },
  {
    name: 'ambiguous: "full spreadsheet" vs "partial data dump"',
    commitment: commit({ id: 'amb13', text: 'Send Jamie the full spreadsheet', recipientSlugs: ['jamie-renner'] }),
    message: msg({ to: ['jamie.renner@reserv.com'], subject: 'partial data', body: 'Jamie — partial data dump; full sheet pending.', attachments: [{ filename: 'data-partial.xlsx', mimeType: 'application/vnd.ms-excel', sizeBytes: 3000 }] }),
    label: 'AMBIGUOUS',
  },
  {
    name: 'ambiguous: "completed doc" vs "doc — almost done"',
    commitment: commit({ id: 'amb14', text: 'Send Isaiah the completed doc', recipientSlugs: ['isaiah-cruz'] }),
    message: msg({ to: ['isaiah.cruz@reserv.com'], subject: 'doc (almost done)', body: 'Isaiah — doc almost done, sending what I have.', attachments: [PDF('doc-wip.pdf')] }),
    label: 'AMBIGUOUS',
  },
];

/**
 * The committed 50-pair golden set (M1 composition):
 *   6 anchor positives + 30 synthetic negatives + 14 judgment-call ambiguous.
 *
 * `morePositives` is retained as an EXTENDED positive bank (not part of the
 * 50) for recall stress-testing during soak re-evaluation; excluded here so
 * the committed set is exactly 50 per AC3a.
 */
export const GOLDEN_SET: GoldenPair[] = [
  ...anchors,
  ...negatives,
  ...ambiguous,
];

/** Extended positive bank for soak recall re-evaluation (NOT part of the 50). */
export const GOLDEN_EXTENDED_POSITIVES: GoldenPair[] = [...morePositives];
