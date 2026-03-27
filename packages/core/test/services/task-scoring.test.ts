/**
 * Tests for task scoring service.
 *
 * Covers each scoring dimension, modifiers, edge cases, and combined scoring.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreTask,
  scoreTasks,
  getTopTasks,
  scoreDueDate,
  scoreCommitment,
  scoreMeetingRelevance,
  scoreWeekPriority,
  calculateModifiers,
  formatScoredTask,
  formatTaskRecommendations,
} from '../../src/services/task-scoring.js';
import type { WorkspaceTask } from '../../src/models/tasks.js';
import type { ScoringContext, ScoredTask } from '../../src/services/task-scoring.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<WorkspaceTask> = {}): WorkspaceTask {
  return {
    id: 'abc12345',
    text: 'Default task',
    completed: false,
    metadata: {},
    source: { file: 'now/week.md', section: '### Must complete' },
    ...overrides,
  };
}

/**
 * Create a local date (not UTC) for consistent testing across timezones.
 */
function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0); // noon local time
}

function makeContext(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    todayMeetingAttendees: [],
    todayMeetingAreas: [],
    weekPriorities: [],
    availableFocusHours: 4,
    needsAttentionPeople: [],
    referenceDate: localDate(2026, 3, 25), // Tuesday, March 25, 2026
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// scoreDueDate tests
// ---------------------------------------------------------------------------

describe('scoreDueDate', () => {
  const ref = localDate(2026, 3, 25); // Tuesday, March 25, 2026

  it('returns 0 for task with no due date', () => {
    const task = makeTask();
    const result = scoreDueDate(task, ref);
    assert.equal(result.score, 0);
    assert.equal(result.reason, 'No due date');
  });

  it('returns 40 for overdue task', () => {
    const task = makeTask({ metadata: { due: '2026-03-20' } }); // 5 days ago
    const result = scoreDueDate(task, ref);
    assert.equal(result.score, 40);
    assert.ok(result.reason.includes('Overdue'));
  });

  it('returns 35 for task due today', () => {
    const task = makeTask({ metadata: { due: '2026-03-25' } });
    const result = scoreDueDate(task, ref);
    assert.equal(result.score, 35);
    assert.equal(result.reason, 'Due today');
  });

  it('returns 25 for task due this week', () => {
    // Reference is Tuesday 2026-03-25, so Sunday is 2026-03-29
    const task = makeTask({ metadata: { due: '2026-03-27' } }); // Thursday
    const result = scoreDueDate(task, ref);
    assert.equal(result.score, 25);
    assert.equal(result.reason, 'Due this week');
  });

  it('returns 10 for task due next week', () => {
    // Next week ends Sunday 2026-04-05
    const task = makeTask({ metadata: { due: '2026-04-02' } });
    const result = scoreDueDate(task, ref);
    assert.equal(result.score, 10);
    assert.equal(result.reason, 'Due next week');
  });

  it('returns 0 for task due later than next week', () => {
    const task = makeTask({ metadata: { due: '2026-04-20' } });
    const result = scoreDueDate(task, ref);
    assert.equal(result.score, 0);
    assert.ok(result.reason.includes('Due 2026-04-20'));
  });
});

// ---------------------------------------------------------------------------
// scoreCommitment tests
// ---------------------------------------------------------------------------

describe('scoreCommitment', () => {
  it('returns 0 for task without commitment link', () => {
    const task = makeTask();
    const result = scoreCommitment(task);
    assert.equal(result.score, 0);
    assert.equal(result.reason, 'No commitment link');
  });

  it('returns 25 for task linked to commitment', () => {
    const task = makeTask({
      metadata: { from: { type: 'commitment', id: 'abc12345' } },
    });
    const result = scoreCommitment(task);
    assert.equal(result.score, 25);
    assert.ok(result.reason.includes('commitment abc12345'));
  });

  it('returns 0 for task linked to meeting (not commitment)', () => {
    const task = makeTask({
      metadata: { from: { type: 'meeting', id: '2026-03-25' } },
    });
    const result = scoreCommitment(task);
    assert.equal(result.score, 0);
    assert.equal(result.reason, 'No commitment link');
  });
});

// ---------------------------------------------------------------------------
// scoreMeetingRelevance tests
// ---------------------------------------------------------------------------

describe('scoreMeetingRelevance', () => {
  it('returns 0 when no meetings today', () => {
    const task = makeTask({ metadata: { person: 'sarah' } });
    const context = { todayMeetingAttendees: [], todayMeetingAreas: [] };
    const result = scoreMeetingRelevance(task, context);
    assert.equal(result.score, 0);
    assert.equal(result.reason, 'No meeting relevance');
  });

  it('returns 20 when task @person matches today meeting attendee', () => {
    const task = makeTask({ metadata: { person: 'sarah' } });
    const context = { todayMeetingAttendees: ['sarah', 'john'], todayMeetingAreas: [] };
    const result = scoreMeetingRelevance(task, context);
    assert.equal(result.score, 20);
    assert.ok(result.reason.includes('@sarah'));
  });

  it('returns 20 when task @area matches today meeting area', () => {
    const task = makeTask({ metadata: { area: 'coverwhale' } });
    const context = { todayMeetingAttendees: [], todayMeetingAreas: ['coverwhale'] };
    const result = scoreMeetingRelevance(task, context);
    assert.equal(result.score, 20);
    assert.ok(result.reason.includes('coverwhale'));
  });

  it('returns 0 when task person does not match any attendee', () => {
    const task = makeTask({ metadata: { person: 'alice' } });
    const context = { todayMeetingAttendees: ['bob', 'charlie'], todayMeetingAreas: [] };
    const result = scoreMeetingRelevance(task, context);
    assert.equal(result.score, 0);
  });

  it('prefers person match over area check', () => {
    const task = makeTask({ metadata: { person: 'sarah', area: 'some-area' } });
    const context = { todayMeetingAttendees: ['sarah'], todayMeetingAreas: ['some-area'] };
    const result = scoreMeetingRelevance(task, context);
    assert.equal(result.score, 20);
    assert.ok(result.reason.includes('@sarah'));
  });
});

// ---------------------------------------------------------------------------
// scoreWeekPriority tests
// ---------------------------------------------------------------------------

describe('scoreWeekPriority', () => {
  it('returns 0 when no week priorities set', () => {
    const task = makeTask({ text: 'Send API docs' });
    const result = scoreWeekPriority(task, []);
    assert.equal(result.score, 0);
    assert.equal(result.reason, 'No week priorities set');
  });

  it('returns 15 when task matches week priority keyword', () => {
    const task = makeTask({ text: 'Send API documentation to partner' });
    const result = scoreWeekPriority(task, ['API documentation release']);
    assert.equal(result.score, 15);
    assert.ok(result.reason.includes('Matches week priority'));
  });

  it('returns 0 when no keywords match', () => {
    const task = makeTask({ text: 'Review budget report' });
    const result = scoreWeekPriority(task, ['API documentation', 'Partner launch']);
    assert.equal(result.score, 0);
    assert.equal(result.reason, 'No priority match');
  });

  it('ignores short words (<=3 chars)', () => {
    const task = makeTask({ text: 'Send the API docs' });
    const result = scoreWeekPriority(task, ['the API']); // "the" should be ignored
    assert.equal(result.score, 0); // "API" is 3 chars, filtered out
  });

  it('matches case-insensitively', () => {
    const task = makeTask({ text: 'DOCUMENTATION review' });
    const result = scoreWeekPriority(task, ['documentation']);
    assert.equal(result.score, 15);
  });
});

// ---------------------------------------------------------------------------
// calculateModifiers tests
// ---------------------------------------------------------------------------

describe('calculateModifiers', () => {
  it('returns +10 when @person needs attention', () => {
    const task = makeTask({ metadata: { person: 'sarah' } });
    const context = makeContext({ needsAttentionPeople: ['sarah'] });
    const result = calculateModifiers(task, context);
    assert.equal(result.score, 10);
    assert.ok(result.reasons.some((r) => r.includes('needs attention')));
  });

  it('returns +20 when task relates to today meeting', () => {
    const task = makeTask({ metadata: { person: 'john' } });
    const context = makeContext({ todayMeetingAttendees: ['john'] });
    const result = calculateModifiers(task, context);
    assert.equal(result.score, 20);
    assert.ok(result.reasons.some((r) => r.includes("Today's meeting")));
  });

  it('returns +20 for area match to today meeting', () => {
    const task = makeTask({ metadata: { area: 'glance' } });
    const context = makeContext({ todayMeetingAreas: ['glance'] });
    const result = calculateModifiers(task, context);
    assert.equal(result.score, 20);
  });

  it('returns -10 for deep work task with insufficient focus time', () => {
    const task = makeTask({ text: 'Write the PRD for new feature' });
    const context = makeContext({ availableFocusHours: 1 });
    const result = calculateModifiers(task, context);
    assert.equal(result.score, -10);
    assert.ok(result.reasons.some((r) => r.includes('Deep work')));
  });

  it('does not penalize deep work when sufficient focus time', () => {
    const task = makeTask({ text: 'Write the PRD for new feature' });
    const context = makeContext({ availableFocusHours: 3 });
    const result = calculateModifiers(task, context);
    assert.equal(result.score, 0);
    assert.equal(result.reasons.length, 0);
  });

  it('stacks modifiers when multiple apply', () => {
    const task = makeTask({ metadata: { person: 'sarah' } });
    const context = makeContext({
      needsAttentionPeople: ['sarah'],
      todayMeetingAttendees: ['sarah'],
    });
    const result = calculateModifiers(task, context);
    // +10 (needs attention) + +20 (today meeting) = 30
    assert.equal(result.score, 30);
    assert.equal(result.reasons.length, 2);
  });

  it('returns 0 when no modifiers apply', () => {
    const task = makeTask();
    const context = makeContext();
    const result = calculateModifiers(task, context);
    assert.equal(result.score, 0);
    assert.equal(result.reasons.length, 0);
  });

  it('detects various deep work keywords', () => {
    const keywords = ['design', 'architect', 'review', 'analyze', 'research', 'document', 'draft', 'spec', 'rfc'];
    const context = makeContext({ availableFocusHours: 0.5 });

    for (const keyword of keywords) {
      const task = makeTask({ text: `${keyword} the proposal` });
      const result = calculateModifiers(task, context);
      assert.equal(result.score, -10, `Expected penalty for keyword: ${keyword}`);
    }
  });
});

// ---------------------------------------------------------------------------
// scoreTask (combined) tests
// ---------------------------------------------------------------------------

describe('scoreTask', () => {
  it('combines all dimension scores correctly', () => {
    const task = makeTask({
      text: 'Send API docs to Sarah',
      metadata: {
        due: '2026-03-25', // today
        person: 'sarah',
        from: { type: 'commitment', id: 'abc123' },
      },
    });
    const context = makeContext({
      todayMeetingAttendees: ['sarah'],
      weekPriorities: ['Send API documentation'],
      needsAttentionPeople: ['sarah'],
    });

    const { score, breakdown } = scoreTask(task, context);

    // Due today: 35
    assert.equal(breakdown.dueDate.score, 35);
    // Commitment: 25
    assert.equal(breakdown.commitment.score, 25);
    // Meeting relevance: 20
    assert.equal(breakdown.meetingRelevance.score, 20);
    // Week priority: 15
    assert.equal(breakdown.weekPriority.score, 15);
    // Modifiers: +10 (needs attention) + +20 (today meeting) = 30
    assert.equal(breakdown.modifiers.score, 30);

    // Total: 35 + 25 + 20 + 15 + 30 = 125
    assert.equal(score, 125);
    assert.equal(breakdown.total, 125);
  });

  it('handles task with no matching dimensions', () => {
    const task = makeTask({ text: 'Simple task' });
    const context = makeContext();
    const { score, breakdown } = scoreTask(task, context);

    assert.equal(breakdown.dueDate.score, 0);
    assert.equal(breakdown.commitment.score, 0);
    assert.equal(breakdown.meetingRelevance.score, 0);
    assert.equal(breakdown.weekPriority.score, 0);
    assert.equal(breakdown.modifiers.score, 0);
    assert.equal(score, 0);
  });

  it('uses provided referenceDate from context', () => {
    const task = makeTask({ metadata: { due: '2026-03-25' } });
    const context = makeContext({ referenceDate: localDate(2026, 3, 30) }); // 5 days later

    const { breakdown } = scoreTask(task, context);
    // Due date is in the past relative to reference
    assert.equal(breakdown.dueDate.score, 40); // overdue
  });
});

// ---------------------------------------------------------------------------
// scoreTasks tests
// ---------------------------------------------------------------------------

describe('scoreTasks', () => {
  it('returns empty array for empty input', () => {
    const result = scoreTasks([], makeContext());
    assert.deepEqual(result, []);
  });

  it('sorts tasks by score descending', () => {
    const tasks = [
      makeTask({ id: 'low', text: 'Low priority' }),
      makeTask({ id: 'high', text: 'High priority', metadata: { due: '2026-03-25' } }),
      makeTask({ id: 'medium', text: 'Medium', metadata: { due: '2026-03-27' } }),
    ];
    const context = makeContext();

    const result = scoreTasks(tasks, context);

    assert.equal(result.length, 3);
    assert.equal(result[0].task.id, 'high'); // due today = 35
    assert.equal(result[1].task.id, 'medium'); // due this week = 25
    assert.equal(result[2].task.id, 'low'); // no due = 0
  });

  it('includes breakdown for each task', () => {
    const tasks = [makeTask({ metadata: { due: '2026-03-25' } })];
    const result = scoreTasks(tasks, makeContext());

    assert.equal(result.length, 1);
    assert.ok(result[0].breakdown);
    assert.equal(result[0].breakdown.dueDate.score, 35);
  });
});

// ---------------------------------------------------------------------------
// getTopTasks tests
// ---------------------------------------------------------------------------

describe('getTopTasks', () => {
  it('returns top N tasks by score', () => {
    // Create tasks with distinct scores to ensure deterministic ordering
    const tasks = [
      makeTask({ id: 'overdue', metadata: { due: '2026-03-20' } }),      // overdue = 40
      makeTask({ id: 'today', metadata: { due: '2026-03-25' } }),        // today = 35
      makeTask({ id: 'this-week', metadata: { due: '2026-03-28' } }),    // this week = 25
      makeTask({ id: 'next-week', metadata: { due: '2026-04-02' } }),    // next week = 10
      makeTask({ id: 'later', metadata: { due: '2026-04-20' } }),        // later = 0
      makeTask({ id: 'no-due' }),                                        // no due = 0
    ];
    const context = makeContext();

    const top5 = getTopTasks(tasks, context, 5);

    assert.equal(top5.length, 5);
    // Sorted by score: overdue (40), today (35), this-week (25), next-week (10), later/no-due (0)
    assert.equal(top5[0].task.id, 'overdue');
    assert.equal(top5[1].task.id, 'today');
    assert.equal(top5[2].task.id, 'this-week');
    assert.equal(top5[3].task.id, 'next-week');
    // Position 4 is either 'later' or 'no-due' (both score 0)
  });

  it('returns all tasks if fewer than limit', () => {
    const tasks = [makeTask(), makeTask({ id: 'two' })];
    const result = getTopTasks(tasks, makeContext(), 10);
    assert.equal(result.length, 2);
  });

  it('defaults to 5 if limit not specified', () => {
    const tasks = Array.from({ length: 10 }, (_, i) => makeTask({ id: `t${i}` }));
    const result = getTopTasks(tasks, makeContext());
    assert.equal(result.length, 5);
  });
});

// ---------------------------------------------------------------------------
// formatScoredTask tests
// ---------------------------------------------------------------------------

describe('formatScoredTask', () => {
  it('formats task with rank and score', () => {
    const scored: ScoredTask = {
      task: makeTask({ text: 'Send API docs' }),
      score: 35,
      breakdown: {
        dueDate: { score: 35, reason: 'Due today' },
        commitment: { score: 0, reason: 'No commitment link' },
        meetingRelevance: { score: 0, reason: 'No meeting relevance' },
        weekPriority: { score: 0, reason: 'No priority match' },
        modifiers: { score: 0, reasons: [] },
        total: 35,
      },
    };

    const result = formatScoredTask(scored, 1);

    assert.ok(result.includes('1. Send API docs (score: 35)'));
    assert.ok(result.includes('Due today: +35'));
    // Should not include zero-score dimensions
    assert.ok(!result.includes('Commitment'));
  });

  it('includes all non-zero dimensions', () => {
    const scored: ScoredTask = {
      task: makeTask({ text: 'Task' }),
      score: 80,
      breakdown: {
        dueDate: { score: 35, reason: 'Due today' },
        commitment: { score: 25, reason: 'Linked' },
        meetingRelevance: { score: 20, reason: '@sarah is in meeting' },
        weekPriority: { score: 0, reason: 'No match' },
        modifiers: { score: 0, reasons: [] },
        total: 80,
      },
    };

    const result = formatScoredTask(scored, 2);

    assert.ok(result.includes('2. Task (score: 80)'));
    assert.ok(result.includes('Due today: +35'));
    assert.ok(result.includes('Commitment: +25'));
    assert.ok(result.includes('@sarah'));
  });

  it('includes modifier reasons', () => {
    const scored: ScoredTask = {
      task: makeTask({ text: 'Task' }),
      score: 30,
      breakdown: {
        dueDate: { score: 0, reason: 'No due date' },
        commitment: { score: 0, reason: '' },
        meetingRelevance: { score: 0, reason: '' },
        weekPriority: { score: 0, reason: '' },
        modifiers: { score: 30, reasons: ['+10: @sarah needs attention', '+20: Today\'s meeting context'] },
        total: 30,
      },
    };

    const result = formatScoredTask(scored, 1);

    assert.ok(result.includes('+10: @sarah needs attention'));
    assert.ok(result.includes("+20: Today\'s meeting context"));
  });
});

// ---------------------------------------------------------------------------
// formatTaskRecommendations tests
// ---------------------------------------------------------------------------

describe('formatTaskRecommendations', () => {
  it('returns message for empty tasks', () => {
    const result = formatTaskRecommendations([]);
    assert.equal(result, 'No tasks to recommend.');
  });

  it('formats multiple tasks with header', () => {
    const tasks: ScoredTask[] = [
      {
        task: makeTask({ text: 'First task' }),
        score: 50,
        breakdown: {
          dueDate: { score: 35, reason: 'Due today' },
          commitment: { score: 15, reason: 'Linked' },
          meetingRelevance: { score: 0, reason: '' },
          weekPriority: { score: 0, reason: '' },
          modifiers: { score: 0, reasons: [] },
          total: 50,
        },
      },
      {
        task: makeTask({ text: 'Second task' }),
        score: 25,
        breakdown: {
          dueDate: { score: 25, reason: 'This week' },
          commitment: { score: 0, reason: '' },
          meetingRelevance: { score: 0, reason: '' },
          weekPriority: { score: 0, reason: '' },
          modifiers: { score: 0, reasons: [] },
          total: 25,
        },
      },
    ];

    const result = formatTaskRecommendations(tasks, 5);

    assert.ok(result.includes('**Recommended focus for today:**'));
    assert.ok(result.includes('1. First task (score: 50)'));
    assert.ok(result.includes('2. Second task (score: 25)'));
  });

  it('respects limit parameter', () => {
    const tasks: ScoredTask[] = Array.from({ length: 10 }, (_, i) => ({
      task: makeTask({ text: `Task ${i}` }),
      score: 100 - i * 10,
      breakdown: {
        dueDate: { score: 0, reason: '' },
        commitment: { score: 0, reason: '' },
        meetingRelevance: { score: 0, reason: '' },
        weekPriority: { score: 0, reason: '' },
        modifiers: { score: 0, reasons: [] },
        total: 100 - i * 10,
      },
    }));

    const result = formatTaskRecommendations(tasks, 3);

    assert.ok(result.includes('1. Task 0'));
    assert.ok(result.includes('2. Task 1'));
    assert.ok(result.includes('3. Task 2'));
    assert.ok(!result.includes('4. Task 3'));
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  it('handles task with empty text', () => {
    const task = makeTask({ text: '' });
    const context = makeContext({ weekPriorities: ['something'] });
    const { score } = scoreTask(task, context);
    assert.equal(score, 0);
  });

  it('handles malformed due date gracefully', () => {
    const task = makeTask({ metadata: { due: 'invalid-date' } });
    const context = makeContext();
    // Should not throw
    const { breakdown } = scoreTask(task, context);
    // NaN date comparisons fall through to "later"
    assert.ok(breakdown.dueDate.score <= 40);
  });

  it('handles empty weekPriorities array', () => {
    const task = makeTask({ text: 'Some task' });
    const context = makeContext({ weekPriorities: [] });
    const { breakdown } = scoreTask(task, context);
    assert.equal(breakdown.weekPriority.score, 0);
    assert.equal(breakdown.weekPriority.reason, 'No week priorities set');
  });

  it('handles negative available focus hours', () => {
    const task = makeTask({ text: 'Write documentation' });
    const context = makeContext({ availableFocusHours: -1 });
    const { breakdown } = scoreTask(task, context);
    // Should still penalize (negative is definitely < 2)
    assert.equal(breakdown.modifiers.score, -10);
  });

  it('handles concurrent person and area match', () => {
    const task = makeTask({ metadata: { person: 'sarah', area: 'glance' } });
    const context = makeContext({
      todayMeetingAttendees: ['sarah'],
      todayMeetingAreas: ['glance'],
    });
    const { breakdown } = scoreTask(task, context);
    // meetingRelevance: 20 (first match wins)
    // modifiers: +20 (today meeting)
    assert.equal(breakdown.meetingRelevance.score, 20);
    assert.equal(breakdown.modifiers.score, 20);
  });
});
