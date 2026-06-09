/**
 * Phase 11 11a — resolution pipeline unit tests (Step 2).
 *
 * Pure-module tests: pre-filter (recipient/M5/temporal/artifact/jaccard),
 * LLM cross-check parsing + precedence, suppress check, adapter.
 *
 * NO live LLM, NO live Gmail — the LLM is a deterministic injected mock.
 * Runs under `tsx --test`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { EmailThread } from '../../src/integrations/gws/types.js';
import type { Commitment } from '../../src/models/index.js';
import {
  findResolutionEvidence,
  runResolutionPipeline,
  applyResolutionDecisions,
  parseResolutionResponse,
  buildResolutionPrompt,
  isSuppressed,
  computeSuppressUntil,
  inTemporalWindow,
  extractArtifactNouns,
  checkArtifactMatch,
  commitmentToResolutionInput,
  peopleDirectoryFromMap,
  PERMANENT_SUPPRESS_SENTINEL,
  UNRESOLVE_SUPPRESS_DAYS,
  type OpenCommitmentForResolution,
  type ResolutionCandidate,
  type LLMCallConcurrentFn,
} from '../../src/services/commitment-resolution-pipeline.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const peopleDir = peopleDirectoryFromMap({
  'lindsay-gray': 'lindsay.gray@reserv.com ', // trailing whitespace — normalizeEmail trims
  'dave-wiedenheft': 'dave@reserv.com',
  'john-koht': 'john.koht@reserv.com',
});

function sentMsg(over: Partial<EmailThread> = {}): EmailThread {
  return {
    id: 'thread-1',
    subject: 'Here is the deck',
    snippet: '',
    from: 'john.koht@reserv.com',
    date: '2026-06-03',
    labels: ['SENT'],
    unread: false,
    to: ['lindsay.gray@reserv.com'],
    cc: [],
    bcc: [],
    body: 'Hi Lindsay, attached is the deck we discussed.',
    attachments: [{ filename: 'deck.pdf', mimeType: 'application/pdf', sizeBytes: 1024 }],
    sentAt: '2026-06-03T15:00:00.000Z',
    ...over,
  };
}

function openCommit(over: Partial<OpenCommitmentForResolution> = {}): OpenCommitmentForResolution {
  return {
    id: 'c1',
    text: 'Send Lindsay the deck',
    date: '2026-06-01',
    recipientSlugs: ['lindsay-gray'],
    ...over,
  };
}

/** Deterministic LLM mock that returns a fixed confidence per thread id. */
function llmMock(map: Record<string, 'HIGH' | 'MEDIUM' | 'LOW'>): LLMCallConcurrentFn {
  return async (prompts) => {
    const prompt = prompts[0].prompt;
    // Reconstruct candidate order from the numbered lines in the prompt.
    const lines: string[] = [];
    let n = 0;
    // Build response by matching each candidate's "sent:" line order.
    // Simpler: parse the "<N>. to: <email>" lines and emit a verdict keyed by
    // the thread we know maps to that email — but the prompt doesn't carry
    // thread ids. Instead the mock is built knowing candidate ORDER, so we
    // emit verdicts positionally using the provided ordered map values.
    void prompt;
    for (const conf of Object.values(map)) {
      n += 1;
      lines.push(`${n}. ${conf} | mock verdict`);
    }
    return [lines.join('\n')];
  };
}

// ---------------------------------------------------------------------------
// Suppress check (AC6b / AC6c / G5)
// ---------------------------------------------------------------------------

describe('isSuppressed — structured field check (G5)', () => {
  const now = new Date('2026-06-10T00:00:00.000Z');

  it('no suppress field → not suppressed', () => {
    assert.equal(isSuppressed({}, now), false);
  });

  it('future 14d suppress → suppressed', () => {
    const until = '2026-06-20T00:00:00.000Z';
    assert.equal(isSuppressed({ unresolveSuppressedUntil: until }, now), true);
  });

  it('past suppress → not suppressed (window elapsed)', () => {
    const until = '2026-06-05T00:00:00.000Z';
    assert.equal(isSuppressed({ unresolveSuppressedUntil: until }, now), false);
  });

  it('permanent sentinel → always suppressed (AC6c)', () => {
    assert.equal(
      isSuppressed({ unresolveSuppressedUntil: PERMANENT_SUPPRESS_SENTINEL }, now),
      true,
    );
  });

  it('computeSuppressUntil is now + 14d', () => {
    const out = new Date(computeSuppressUntil(now));
    const expected = now.getTime() + UNRESOLVE_SUPPRESS_DAYS * 86400000;
    assert.equal(out.getTime(), expected);
  });

  it('PERMANENT_SUPPRESS_SENTINEL is the documented far-future literal', () => {
    assert.equal(PERMANENT_SUPPRESS_SENTINEL, '2100-01-01T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// Temporal window (AC3b)
// ---------------------------------------------------------------------------

describe('inTemporalWindow — uses commitment.date not createdAt (AC3b)', () => {
  it('async-review scenario: meeting Mon, evidence Wed → in window', () => {
    // commitment.date = Monday; Sent = Wednesday; (processed Thursday irrelevant)
    assert.equal(inTemporalWindow('2026-06-01', '2026-06-03T15:00:00.000Z'), true);
  });

  it('same-day send → in window (inclusive of commitment day)', () => {
    assert.equal(inTemporalWindow('2026-06-01', '2026-06-01T18:00:00.000Z'), true);
  });

  it('pre-commitment send → NOT in window', () => {
    assert.equal(inTemporalWindow('2026-06-01', '2026-05-31T23:00:00.000Z'), false);
  });

  it('send beyond 90d forward → NOT in window', () => {
    assert.equal(inTemporalWindow('2026-06-01', '2026-12-01T00:00:00.000Z'), false);
  });
});

// ---------------------------------------------------------------------------
// Artifact extraction + match (false-positive guard)
// ---------------------------------------------------------------------------

describe('artifact heuristics', () => {
  it('extracts named artifacts from commitment text', () => {
    assert.deepEqual(extractArtifactNouns('Send Lindsay the deck'), ['deck']);
    assert.deepEqual(extractArtifactNouns('Email Dave the PRD and the spec'), ['spec', 'prd'].sort());
    assert.deepEqual(extractArtifactNouns('Call Lindsay about hiring'), []);
  });

  it('no named artifact → match gate is N/A (true)', () => {
    assert.equal(checkArtifactMatch([], sentMsg({ attachments: [] })), true);
  });

  it('named artifact corroborated by attachment filename', () => {
    assert.equal(
      checkArtifactMatch(['deck'], sentMsg({ attachments: [{ filename: 'deck.pdf', mimeType: 'application/pdf', sizeBytes: 1 }] })),
      true,
    );
  });

  it('named artifact corroborated by body mention', () => {
    assert.equal(
      checkArtifactMatch(['deck'], { subject: 'follow up', body: 'here is the deck', attachments: [] }),
      true,
    );
  });

  it('named artifact with no corroboration → no match (false-positive guard)', () => {
    assert.equal(
      checkArtifactMatch(['deck'], { subject: 'hi', body: 'just checking in', attachments: [] }),
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// findResolutionEvidence — pre-filter
// ---------------------------------------------------------------------------

describe('findResolutionEvidence — deterministic pre-filter', () => {
  it('AC2 basic case: recipient + temporal + artifact + jaccard → candidate', () => {
    const res = findResolutionEvidence(openCommit(), [sentMsg()], peopleDir);
    assert.equal(res.kind, 'candidates');
    if (res.kind !== 'candidates') return;
    assert.equal(res.candidates.length, 1);
    assert.equal(res.candidates[0].matchedRecipientSlug, 'lindsay-gray');
    assert.equal(res.candidates[0].matchedRecipientEmail, 'lindsay.gray@reserv.com');
    assert.equal(res.candidates[0].artifactMatch, true);
    assert.ok(res.candidates[0].url?.includes('thread-1'));
  });

  it('suppressed commitment short-circuits before any candidate (AC6b)', () => {
    const future = new Date(Date.now() + 5 * 86400000).toISOString();
    const res = findResolutionEvidence(
      openCommit({ unresolveSuppressedUntil: future }),
      [sentMsg()],
      peopleDir,
    );
    assert.equal(res.kind, 'suppressed');
  });

  it('M5: role=self recipient excluded → no-recipient, never reaches matching', () => {
    // Self-reminder: recipientSlugs already excludes self via the adapter,
    // so the pipeline sees an empty recipient set.
    const res = findResolutionEvidence(
      openCommit({ recipientSlugs: [] }),
      [sentMsg({ to: ['john.koht@reserv.com'] })],
      peopleDir,
    );
    assert.equal(res.kind, 'no-recipient');
  });

  it('recipient mismatch → no candidates', () => {
    const res = findResolutionEvidence(
      openCommit(),
      [sentMsg({ to: ['someone-else@reserv.com'] })],
      peopleDir,
    );
    assert.equal(res.kind, 'candidates');
    if (res.kind !== 'candidates') return;
    assert.equal(res.candidates.length, 0);
  });

  it('pre-commitment send culled by temporal gate (AC3b)', () => {
    const res = findResolutionEvidence(
      openCommit(),
      [sentMsg({ sentAt: '2026-05-30T10:00:00.000Z' })],
      peopleDir,
    );
    assert.equal(res.kind, 'candidates');
    if (res.kind !== 'candidates') return;
    assert.equal(res.candidates.length, 0);
  });

  it('named-artifact commitment with no corroborating attachment/body → culled', () => {
    const res = findResolutionEvidence(
      openCommit({ text: 'Send Lindsay the deck' }),
      [sentMsg({ subject: 'lunch?', body: 'want to grab lunch tomorrow', attachments: [] })],
      peopleDir,
    );
    assert.equal(res.kind, 'candidates');
    if (res.kind !== 'candidates') return;
    assert.equal(res.candidates.length, 0);
  });

  it('caps candidates at RESOLUTION_CANDIDATE_CAP', () => {
    const many: EmailThread[] = [];
    for (let i = 0; i < 8; i += 1) {
      many.push(sentMsg({ id: `t${i}`, sentAt: `2026-06-0${(i % 9) + 1}T10:00:00.000Z` }));
    }
    const res = findResolutionEvidence(openCommit(), many, peopleDir);
    assert.equal(res.kind, 'candidates');
    if (res.kind !== 'candidates') return;
    assert.ok(res.candidates.length <= 3);
  });
});

// ---------------------------------------------------------------------------
// LLM parse + precedence
// ---------------------------------------------------------------------------

describe('parseResolutionResponse', () => {
  const cands: ResolutionCandidate[] = [
    { threadId: 'a', subject: '', sentAt: '', matchedRecipientSlug: '', matchedRecipientEmail: '', artifactMatch: true, jaccard: 0.5, bodyExcerpt: '', attachmentNames: [] },
    { threadId: 'b', subject: '', sentAt: '', matchedRecipientSlug: '', matchedRecipientEmail: '', artifactMatch: true, jaccard: 0.4, bodyExcerpt: '', attachmentNames: [] },
  ];

  it('parses numbered HIGH/MEDIUM/LOW lines', () => {
    const out = parseResolutionResponse('1. HIGH | sent the deck\n2. LOW | unrelated', cands);
    assert.equal(out[0].confidence, 'HIGH');
    assert.equal(out[1].confidence, 'LOW');
    assert.equal(out[0].reasoning, 'sent the deck');
  });

  it('FAIL-SAFE: unparseable line defaults to LOW (never auto-resolve)', () => {
    const out = parseResolutionResponse('garbage response with no structure', cands);
    assert.equal(out[0].confidence, 'LOW');
    assert.equal(out[1].confidence, 'LOW');
  });

  it('tolerates ) and : delimiters and case', () => {
    const out = parseResolutionResponse('1) high - ok\n2: Medium', cands);
    assert.equal(out[0].confidence, 'HIGH');
    assert.equal(out[1].confidence, 'MEDIUM');
  });
});

describe('applyResolutionDecisions — precedence', () => {
  const cands: ResolutionCandidate[] = [
    { threadId: 'a', subject: '', sentAt: '', matchedRecipientSlug: '', matchedRecipientEmail: '', artifactMatch: true, jaccard: 0.3, bodyExcerpt: '', attachmentNames: [] },
    { threadId: 'b', subject: '', sentAt: '', matchedRecipientSlug: '', matchedRecipientEmail: '', artifactMatch: true, jaccard: 0.9, bodyExcerpt: '', attachmentNames: [] },
  ];

  it('any HIGH → resolve-high at highest-jaccard HIGH', () => {
    const out = applyResolutionDecisions(cands, [
      { threadId: 'a', confidence: 'HIGH', reasoning: 'x' },
      { threadId: 'b', confidence: 'HIGH', reasoning: 'y' },
    ]);
    assert.equal(out.kind, 'resolve-high');
    if (out.kind !== 'resolve-high') return;
    assert.equal(out.candidate.threadId, 'b'); // higher jaccard
  });

  it('no HIGH but MEDIUM → flag-medium (never mutates)', () => {
    const out = applyResolutionDecisions(cands, [
      { threadId: 'a', confidence: 'MEDIUM', reasoning: 'maybe' },
      { threadId: 'b', confidence: 'LOW', reasoning: 'no' },
    ]);
    assert.equal(out.kind, 'flag-medium');
  });

  it('all LOW → ignore', () => {
    const out = applyResolutionDecisions(cands, [
      { threadId: 'a', confidence: 'LOW', reasoning: 'no' },
      { threadId: 'b', confidence: 'LOW', reasoning: 'no' },
    ]);
    assert.equal(out.kind, 'ignore');
  });

  it('no candidates → ignore/no-candidates', () => {
    const out = applyResolutionDecisions([], []);
    assert.equal(out.kind, 'ignore');
    if (out.kind !== 'ignore') return;
    assert.equal(out.reason, 'no-candidates');
  });
});

// ---------------------------------------------------------------------------
// runResolutionPipeline — end to end (mocked LLM)
// ---------------------------------------------------------------------------

describe('runResolutionPipeline (mocked LLM)', () => {
  it('AC2: HIGH match → resolve-high outcome', async () => {
    const { outcome } = await runResolutionPipeline(
      openCommit(),
      [sentMsg()],
      peopleDir,
      llmMock({ 'thread-1': 'HIGH' }),
    );
    assert.equal(outcome.kind, 'resolve-high');
  });

  it('AC3 false-positive guard: FINAL deck vs deck-draft → MEDIUM (not auto-resolved)', async () => {
    const { outcome } = await runResolutionPipeline(
      openCommit({ text: 'Send Lindsay the FINAL deck' }),
      [sentMsg({
        subject: 'deck draft',
        body: 'Lindsay — here is the deck-draft for review, not final yet.',
        attachments: [{ filename: 'deck-draft.pdf', mimeType: 'application/pdf', sizeBytes: 1 }],
      })],
      peopleDir,
      // The LLM (here mocked) returns MEDIUM for the draft-vs-final case.
      llmMock({ 'thread-1': 'MEDIUM' }),
    );
    assert.equal(outcome.kind, 'flag-medium');
  });

  it('suppressed → ignore, no LLM call', async () => {
    let called = false;
    const spyLlm: LLMCallConcurrentFn = async () => { called = true; return ['1. HIGH | x']; };
    const future = new Date(Date.now() + 5 * 86400000).toISOString();
    const { outcome } = await runResolutionPipeline(
      openCommit({ unresolveSuppressedUntil: future }),
      [sentMsg()],
      peopleDir,
      spyLlm,
    );
    assert.equal(outcome.kind, 'ignore');
    assert.equal(called, false);
  });

  it('LLM throw → all LOW → ignore (fail-safe, never auto-resolve)', async () => {
    const throwLlm: LLMCallConcurrentFn = async () => { throw new Error('provider down'); };
    const { outcome } = await runResolutionPipeline(openCommit(), [sentMsg()], peopleDir, throwLlm);
    assert.equal(outcome.kind, 'ignore');
  });
});

// ---------------------------------------------------------------------------
// commitmentToResolutionInput adapter (M5)
// ---------------------------------------------------------------------------

describe('commitmentToResolutionInput — M5 self-exclusion', () => {
  function commit(over: Partial<Commitment>): Commitment {
    return {
      id: 'c', text: 'Send Lindsay the deck', direction: 'i_owe_them',
      personSlug: 'lindsay-gray', personName: 'Lindsay Gray', source: 'm.md',
      date: '2026-06-01', createdAt: '2026-06-01', status: 'open', resolvedAt: null,
      ...over,
    };
  }

  it('role=self stakeholder excluded from recipientSlugs', () => {
    const input = commitmentToResolutionInput(commit({
      stakeholders: [
        { slug: 'john-koht', role: 'self' },
        { slug: 'lindsay-gray', role: 'recipient' },
      ],
    }));
    assert.deepEqual(input.recipientSlugs, ['lindsay-gray']);
  });

  it('counter-test: role=recipient retained', () => {
    const input = commitmentToResolutionInput(commit({
      stakeholders: [{ slug: 'lindsay-gray', role: 'recipient' }],
    }));
    assert.deepEqual(input.recipientSlugs, ['lindsay-gray']);
  });

  it('self-direction with only self stakeholder → empty recipientSlugs', () => {
    const input = commitmentToResolutionInput(commit({
      direction: 'self',
      stakeholders: [{ slug: 'john-koht', role: 'self' }],
    }));
    assert.deepEqual(input.recipientSlugs, []);
  });

  it('v1 fallback: personSlug used when no stakeholders[] (non-self direction)', () => {
    const input = commitmentToResolutionInput(commit({ stakeholders: undefined }));
    assert.deepEqual(input.recipientSlugs, ['lindsay-gray']);
  });

  it('v1 self-direction: personSlug NOT used as recipient', () => {
    const input = commitmentToResolutionInput(commit({ direction: 'self', stakeholders: undefined }));
    assert.deepEqual(input.recipientSlugs, []);
  });

  it('carries unresolveSuppressedUntil through', () => {
    const input = commitmentToResolutionInput(commit({ unresolveSuppressedUntil: PERMANENT_SUPPRESS_SENTINEL }));
    assert.equal(input.unresolveSuppressedUntil, PERMANENT_SUPPRESS_SENTINEL);
  });
});

// ---------------------------------------------------------------------------
// M5 full-pipeline self-leak guard (never reaches LLM)
// ---------------------------------------------------------------------------

describe('M5 — self stakeholder never reaches LLM', () => {
  it('commitment with only self stakeholder + Sent to self → no-match, no LLM', async () => {
    let called = false;
    const spyLlm: LLMCallConcurrentFn = async () => { called = true; return ['1. HIGH | x']; };
    const input = commitmentToResolutionInput({
      id: 'c', text: 'Note to self: prep deck', direction: 'self',
      personSlug: 'john-koht', personName: 'John Koht', source: 'm.md',
      date: '2026-06-01', createdAt: '2026-06-01', status: 'open', resolvedAt: null,
      stakeholders: [{ slug: 'john-koht', role: 'self' }],
    });
    const { outcome } = await runResolutionPipeline(
      input,
      [sentMsg({ to: ['john.koht@reserv.com'] })],
      peopleDir,
      spyLlm,
    );
    assert.equal(outcome.kind, 'ignore');
    assert.equal(called, false);
  });
});

// ---------------------------------------------------------------------------
// Prompt stability
// ---------------------------------------------------------------------------

describe('buildResolutionPrompt', () => {
  it('includes commitment text, date, named artifacts, and recipient', () => {
    const c = openCommit();
    const cands: ResolutionCandidate[] = [{
      threadId: 'thread-1', subject: 'Here is the deck', sentAt: '2026-06-03T15:00:00.000Z',
      matchedRecipientSlug: 'lindsay-gray', matchedRecipientEmail: 'lindsay.gray@reserv.com',
      artifactMatch: true, jaccard: 0.4, bodyExcerpt: 'attached is the deck', attachmentNames: ['deck.pdf'],
    }];
    const prompt = buildResolutionPrompt(c, cands);
    assert.ok(prompt.includes('Send Lindsay the deck'));
    assert.ok(prompt.includes('2026-06-01'));
    assert.ok(prompt.includes('deck')); // named artifact
    assert.ok(prompt.includes('lindsay.gray@reserv.com'));
    assert.ok(prompt.includes('deck.pdf'));
    assert.ok(prompt.includes('DRAFT/partial is NOT the same as a FINAL'));
  });
});
