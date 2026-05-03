/**
 * Tests for slack-thread heuristic (Phase 1 §a.3 / MC3).
 *
 * Pure decision logic — no fs needed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateSlackThread,
  formatSlackEvalLogLine,
  slackSummariesEnabled,
  DEFAULT_SLACK_MESSAGE_THRESHOLD,
  DEFAULT_SLACK_PARTICIPANT_THRESHOLD,
} from '../../src/services/slack-heuristic.js';

describe('evaluateSlackThread', () => {
  it('would NOT summarize a small chatty thread (under all thresholds)', () => {
    const r = evaluateSlackThread({
      threadId: 't1',
      messages: 5,
      participants: 2,
    });
    assert.equal(r.wouldSummarize, false);
    assert.equal(r.trigger, 'none');
    assert.deepEqual(r.allTriggers, ['none']);
  });

  it('messages threshold (default 10) triggers summary', () => {
    const r = evaluateSlackThread({
      threadId: 't1',
      messages: DEFAULT_SLACK_MESSAGE_THRESHOLD,
      participants: 2,
    });
    assert.equal(r.wouldSummarize, true);
    assert.equal(r.trigger, 'messages');
    assert.deepEqual(r.allTriggers, ['messages']);
  });

  it('participants threshold (default 3) triggers summary', () => {
    const r = evaluateSlackThread({
      threadId: 't1',
      messages: 4,
      participants: DEFAULT_SLACK_PARTICIPANT_THRESHOLD,
    });
    assert.equal(r.wouldSummarize, true);
    assert.equal(r.trigger, 'participants');
  });

  it('decision detected triggers summary regardless of size', () => {
    const r = evaluateSlackThread({
      threadId: 't1',
      messages: 3,
      participants: 2,
      decisionDetected: true,
    });
    assert.equal(r.wouldSummarize, true);
    assert.equal(r.trigger, 'decision');
  });

  it('user_flag triggers summary regardless of size', () => {
    const r = evaluateSlackThread({
      threadId: 't1',
      messages: 1,
      participants: 1,
      userFlagged: true,
    });
    assert.equal(r.wouldSummarize, true);
    assert.equal(r.trigger, 'user_flag');
  });

  it('priority: user_flag > decision > messages > participants', () => {
    const r = evaluateSlackThread({
      threadId: 't1',
      messages: 20,
      participants: 5,
      decisionDetected: true,
      userFlagged: true,
    });
    assert.equal(r.trigger, 'user_flag');
    assert.deepEqual(r.allTriggers, ['user_flag', 'decision', 'messages', 'participants']);
  });

  it('respects custom message threshold', () => {
    const r = evaluateSlackThread(
      { threadId: 't1', messages: 5, participants: 2 },
      { messageThreshold: 3 },
    );
    assert.equal(r.wouldSummarize, true);
    assert.equal(r.trigger, 'messages');
  });

  it('respects custom participant threshold', () => {
    const r = evaluateSlackThread(
      { threadId: 't1', messages: 1, participants: 4 },
      { participantThreshold: 5 },
    );
    assert.equal(r.wouldSummarize, false);
  });

  it('boundary: messages exactly at threshold triggers', () => {
    const r = evaluateSlackThread({ threadId: 't1', messages: 10, participants: 1 });
    assert.equal(r.wouldSummarize, true);
  });

  it('boundary: messages one below threshold does not trigger', () => {
    const r = evaluateSlackThread({ threadId: 't1', messages: 9, participants: 1 });
    assert.equal(r.wouldSummarize, false);
  });
});

describe('formatSlackEvalLogLine', () => {
  it('formats a "would summarize" line with the canonical event grammar', () => {
    const r = evaluateSlackThread({
      threadId: 'C123/16998765.000',
      messages: 12,
      participants: 4,
    });
    const line = formatSlackEvalLogLine(r, '2026-04-22T15:30:00Z');
    assert.match(line, /^## \[2026-04-22T15:30:00Z\] slack-thread-eval/);
    assert.match(line, /thread=C123\/16998765\.000/);
    assert.match(line, /would_summarize=true/);
    assert.match(line, /trigger=messages/);
    assert.match(line, /messages=12/);
    assert.match(line, /participants=4/);
  });

  it('formats a "would not summarize" line', () => {
    const r = evaluateSlackThread({ threadId: 't1', messages: 2, participants: 2 });
    const line = formatSlackEvalLogLine(r, '2026-04-22T15:30:00Z');
    assert.match(line, /would_summarize=false/);
    assert.match(line, /trigger=none/);
  });
});

describe('slackSummariesEnabled', () => {
  it('returns false when env var is unset', () => {
    assert.equal(slackSummariesEnabled({}), false);
  });

  it('returns false for "0"', () => {
    assert.equal(slackSummariesEnabled({ ARETE_SLACK_SUMMARIES: '0' }), false);
  });

  it('returns true for "1"', () => {
    assert.equal(slackSummariesEnabled({ ARETE_SLACK_SUMMARIES: '1' }), true);
  });

  it('returns true for "true" / "TRUE" / "True"', () => {
    assert.equal(slackSummariesEnabled({ ARETE_SLACK_SUMMARIES: 'true' }), true);
    assert.equal(slackSummariesEnabled({ ARETE_SLACK_SUMMARIES: 'TRUE' }), true);
    assert.equal(slackSummariesEnabled({ ARETE_SLACK_SUMMARIES: 'True' }), true);
  });

  it('returns true for "yes"', () => {
    assert.equal(slackSummariesEnabled({ ARETE_SLACK_SUMMARIES: 'yes' }), true);
  });

  it('returns false for unrecognized values', () => {
    assert.equal(slackSummariesEnabled({ ARETE_SLACK_SUMMARIES: 'maybe' }), false);
    assert.equal(slackSummariesEnabled({ ARETE_SLACK_SUMMARIES: '' }), false);
  });
});
