/**
 * Phase 11 11a Step 5 — resolution-decisions log tests.
 *
 * Format parity with dedup-decisions.log + phase=p11-11a attribution (F1),
 * parser + M4 repeat-detection. Append test uses a tmp dir (no production
 * writes). Runs under `tsx --test`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  renderResolutionDecisionLine,
  appendResolutionDecisionLog,
  parseResolutionLog,
  hasPriorUnresolveForEvidence,
  RESOLUTION_LOG_PHASE,
} from '../../src/services/resolution-decisions-log.js';

describe('renderResolutionDecisionLine — F1 phase attribution', () => {
  it('emits phase=p11-11a column', () => {
    const line = renderResolutionDecisionLine('2026-06-05T00:00:00.000Z', {
      action: 'RESOLVE-HIGH-AUTO',
      id: 'abcd1234',
      confidence: 'HIGH',
      evidenceRef: 'https://mail.google.com/x/t1',
      reasoning: 'deck.pdf sent to lindsay',
    });
    assert.match(line, /phase=p11-11a/);
    assert.equal(RESOLUTION_LOG_PHASE, 'p11-11a');
    assert.match(line, /RESOLVE-HIGH-AUTO/);
    assert.match(line, /abcd1234 HIGH/);
  });

  it('single-lines reasoning', () => {
    const line = renderResolutionDecisionLine('2026-06-05T00:00:00.000Z', {
      action: 'UNRESOLVE', id: 'abcd1234', confidence: '-', evidenceRef: '-',
      reasoning: 'multi\nline\nnote',
    });
    assert.equal(line.split('\n').length, 1);
  });

  it('empty evidenceRef renders as -', () => {
    const line = renderResolutionDecisionLine('2026-06-05T00:00:00.000Z', {
      action: 'SUPPRESS-HIT', id: 'abcd1234', confidence: '-', evidenceRef: '', reasoning: '',
    });
    const cols = line.split(' ');
    // ISO ACTION phase=.. id conf evidence
    assert.equal(cols[5], '-');
  });
});

describe('appendResolutionDecisionLog — tmp dir (no prod writes)', () => {
  it('writes a parseable line to dev/diary/resolution-decisions.log', async () => {
    const root = await mkdtemp(join(tmpdir(), 'arete-reslog-'));
    await appendResolutionDecisionLog(root, {
      action: 'RESOLVE-HIGH-STAGED', id: 'abcd1234', confidence: 'HIGH',
      evidenceRef: 'gmail:t1', reasoning: 'staged for confirm',
    });
    const content = await readFile(join(root, 'dev', 'diary', 'resolution-decisions.log'), 'utf8');
    assert.match(content, /RESOLVE-HIGH-STAGED phase=p11-11a abcd1234 HIGH gmail:t1/);
    const parsed = parseResolutionLog(content);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].action, 'RESOLVE-HIGH-STAGED');
    assert.equal(parsed[0].phase, 'p11-11a');
  });
});

describe('parseResolutionLog', () => {
  it('round-trips render → parse', () => {
    const line = renderResolutionDecisionLine('2026-06-05T12:00:00.000Z', {
      action: 'RESOLVE-MEDIUM-FLAGGED', id: 'beef0001', confidence: 'MEDIUM',
      evidenceRef: 'gmail:t9', reasoning: 'draft not final',
    });
    const [e] = parseResolutionLog(line);
    assert.equal(e.action, 'RESOLVE-MEDIUM-FLAGGED');
    assert.equal(e.id, 'beef0001');
    assert.equal(e.confidence, 'MEDIUM');
    assert.equal(e.evidenceRef, 'gmail:t9');
    assert.equal(e.reasoning, 'draft not final');
  });

  it('skips malformed lines', () => {
    assert.equal(parseResolutionLog('garbage\n\n  ').length, 0);
  });
});

describe('hasPriorUnresolveForEvidence — M4 repeat-detection', () => {
  const now = new Date('2026-06-20T00:00:00.000Z');
  const log = [
    renderResolutionDecisionLine('2026-06-10T00:00:00.000Z', {
      action: 'UNRESOLVE', id: 'abcd1234', confidence: '-', evidenceRef: 'gmail:t1', reasoning: 'wrong',
    }),
  ].join('\n');

  it('detects prior UNRESOLVE for same (id, evidence) within 30d', () => {
    const entries = parseResolutionLog(log);
    assert.equal(hasPriorUnresolveForEvidence(entries, 'abcd1234', 'gmail:t1', now), true);
  });

  it('different evidence → no match', () => {
    const entries = parseResolutionLog(log);
    assert.equal(hasPriorUnresolveForEvidence(entries, 'abcd1234', 'gmail:t2', now), false);
  });

  it('outside 30d window → no match', () => {
    const entries = parseResolutionLog(log);
    const farFuture = new Date('2026-08-01T00:00:00.000Z');
    assert.equal(hasPriorUnresolveForEvidence(entries, 'abcd1234', 'gmail:t1', farFuture), false);
  });

  it('prefix-tolerant id match (64-char vs 8-char)', () => {
    const entries = parseResolutionLog(log);
    assert.equal(hasPriorUnresolveForEvidence(entries, 'abcd1234' + 'f'.repeat(56), 'gmail:t1', now), true);
  });
});
