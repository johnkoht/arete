/**
 * Phase 11 11a — integration tests stitching pipeline + mutators + ordering.
 *
 * These exercise the full state machine the wire-in will drive, WITHOUT
 * touching disk or production: detect → stage → confirm/unresolve →
 * next-day re-detect (suppress loop AC6b), and the temporal AC3b scenario
 * end-to-end. Mock LLM only.
 *
 * Runs under `tsx --test`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Commitment } from '../../src/models/index.js';
import type { EmailThread } from '../../src/integrations/gws/types.js';
import {
  runResolutionPipeline,
  commitmentToResolutionInput,
  peopleDirectoryFromMap,
  type LLMCallConcurrentFn,
} from '../../src/services/commitment-resolution-pipeline.js';
import {
  stageResolve,
  autoResolve,
  applyConfirm,
  applyUnresolve,
  applyUnconfirm,
} from '../../src/services/resolution-directives.js';

const peopleDir = peopleDirectoryFromMap({ 'lindsay-gray': 'lindsay.gray@reserv.com' });
const highLlm: LLMCallConcurrentFn = async () => ['1. HIGH | deck delivered'];

function commit(): Commitment {
  return {
    id: 'c1c1c1c1c1c1c1c1', text: 'Send Lindsay the deck', direction: 'i_owe_them',
    personSlug: 'lindsay-gray', personName: 'Lindsay Gray', source: 'm.md',
    date: '2026-06-01', createdAt: '2026-06-01', status: 'open', resolvedAt: null,
    stakeholders: [{ slug: 'lindsay-gray', role: 'recipient' }], source_external: [],
  };
}

function sent(): EmailThread {
  return {
    id: 't1', subject: 'deck', snippet: '', from: 'john.koht@reserv.com', date: '2026-06-03',
    labels: ['SENT'], unread: false, to: ['lindsay.gray@reserv.com'], cc: [], bcc: [],
    body: 'Lindsay — deck attached.', attachments: [{ filename: 'deck.pdf', mimeType: 'application/pdf', sizeBytes: 1 }],
    sentAt: '2026-06-03T15:00:00.000Z',
  };
}

describe('week-1 flow: detect → stage → confirm (AC2a/AC7)', () => {
  it('HIGH stages (status stays open), then [[confirm]] → user-resolve', async () => {
    const c = commit();
    const { outcome } = await runResolutionPipeline(commitmentToResolutionInput(c), [sent()], peopleDir, highLlm);
    assert.equal(outcome.kind, 'resolve-high');
    if (outcome.kind !== 'resolve-high') return;

    // Week-1: caller STAGES.
    const staged = stageResolve(c, { url: outcome.candidate.url!, threadId: outcome.candidate.threadId }, new Date('2026-06-03T16:00:00.000Z'));
    assert.equal(staged.status, 'open');
    assert.ok(staged.resolveStagedAt);

    // User [[confirm]] next winddown.
    const res = applyConfirm(staged, new Date('2026-06-04T09:00:00.000Z'));
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.commitment.status, 'resolved');
    assert.equal(res.commitment.resolvedBy, 'user');
    assert.ok(res.commitment.confirmedAt);
  });

  it('confirm → unconfirm within 24h re-stages for re-evaluation (AC2b)', async () => {
    const c = commit();
    const staged = stageResolve(c, { url: 'u', threadId: 't1' }, new Date('2026-06-03T16:00:00.000Z'));
    const confirmed = applyConfirm(staged, new Date('2026-06-04T09:00:00.000Z'));
    assert.equal(confirmed.ok, true);
    if (!confirmed.ok) return;
    const unconf = applyUnconfirm(confirmed.commitment, new Date('2026-06-04T20:00:00.000Z'));
    assert.equal(unconf.ok, true);
    if (!unconf.ok) return;
    assert.equal(unconf.commitment.status, 'open');
    assert.ok(unconf.commitment.resolveStagedAt);
  });
});

describe('suppress loop: auto-resolve → unresolve → next-day skip (AC6b/G5)', () => {
  it('unresolved commitment is skipped at next-day pre-check (structured field)', async () => {
    const c = commit();
    // Week-2+: auto-mutate.
    const resolved = autoResolve(c, { url: 'https://m/t1', threadId: 't1', sentAt: '2026-06-03T15:00:00.000Z' });
    assert.equal(resolved.status, 'resolved');
    assert.equal(resolved.resolvedBy, 'auto-gmail');

    // User [[unresolve]] → reopen + 14d suppress.
    const un = applyUnresolve(resolved, { now: new Date('2026-06-04T00:00:00.000Z') });
    assert.equal(un.ok, true);
    if (!un.ok) return;
    assert.equal(un.commitment.status, 'open');
    assert.ok(un.commitment.unresolveSuppressedUntil);
    assert.equal(un.commitment.source_external?.length, 1); // preserved (audit)

    // Next day: pipeline finds the SAME evidence → pre-check SKIPs (no LLM).
    let llmCalled = false;
    const spyLlm: LLMCallConcurrentFn = async () => { llmCalled = true; return ['1. HIGH | x']; };
    const { outcome } = await runResolutionPipeline(
      commitmentToResolutionInput(un.commitment),
      [sent()],
      peopleDir,
      spyLlm,
      { now: new Date('2026-06-05T00:00:00.000Z') }, // within 14d window
    );
    assert.equal(outcome.kind, 'ignore');
    if (outcome.kind === 'ignore') assert.equal(outcome.reason, 'suppressed');
    assert.equal(llmCalled, false);
  });

  it('after 14d window elapses, the same evidence can resolve again', async () => {
    const c = commit();
    const resolved = autoResolve(c, { url: 'https://m/t1', threadId: 't1', sentAt: '2026-06-03T15:00:00.000Z' });
    const un = applyUnresolve(resolved, { now: new Date('2026-06-04T00:00:00.000Z') });
    assert.equal(un.ok, true);
    if (!un.ok) return;
    // 20 days later — window elapsed.
    const { outcome } = await runResolutionPipeline(
      commitmentToResolutionInput(un.commitment),
      [sent()],
      peopleDir,
      highLlm,
      { now: new Date('2026-06-24T00:00:00.000Z') },
    );
    assert.equal(outcome.kind, 'resolve-high');
  });

  it('permanent suppress is never re-resolved (AC6c)', async () => {
    const c = commit();
    const resolved = autoResolve(c, { url: 'https://m/t1', threadId: 't1', sentAt: '2026-06-03T15:00:00.000Z' });
    const un = applyUnresolve(resolved, { permanent: true, now: new Date('2026-06-04T00:00:00.000Z') });
    assert.equal(un.ok, true);
    if (!un.ok) return;
    const { outcome } = await runResolutionPipeline(
      commitmentToResolutionInput(un.commitment),
      [sent()],
      peopleDir,
      highLlm,
      { now: new Date('2030-01-01T00:00:00.000Z') }, // years later
    );
    assert.equal(outcome.kind, 'ignore');
  });
});

describe('AC3b temporal — meeting Mon, evidence Wed, processed Thu', () => {
  it('resolves using commitment.date, not createdAt or processing time', async () => {
    const c: Commitment = {
      ...commit(),
      date: '2026-06-01',                       // meeting Monday
      createdAt: '2026-06-01T10:00:00.000Z',
    };
    const wedEvidence = { ...sent(), sentAt: '2026-06-03T11:00:00.000Z' }; // Wednesday
    const { outcome } = await runResolutionPipeline(
      commitmentToResolutionInput(c),
      [wedEvidence],
      peopleDir,
      highLlm,
      { now: new Date('2026-06-04T09:00:00.000Z') }, // processed Thursday
    );
    assert.equal(outcome.kind, 'resolve-high');
  });
});
