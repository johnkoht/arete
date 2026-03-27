/**
 * Task Scoring Service — pure functions for intelligent task prioritization.
 *
 * Scoring dimensions:
 * - Due date (0-40): overdue > today > this week > next week > later
 * - Commitment weight (0-25): tasks linked to commitments via @from
 * - Meeting relevance (0-20): tasks matching today's attendees/areas
 * - Week priority (0-15): task text matches week priority keywords
 *
 * Modifiers:
 * - +10: task @person is in needsAttentionPeople
 * - +20: task relates to today's meeting (attendee or area)
 * - -10: deep work task when <2hrs focus available
 *
 * Follows pure function pattern — no service class, no I/O.
 */
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Score weights per dimension */
const SCORE_WEIGHTS = {
    dueDate: {
        overdue: 40,
        today: 35,
        thisWeek: 25,
        nextWeek: 10,
        later: 0,
    },
    commitment: {
        linked: 25,
        none: 0,
    },
    meetingRelevance: {
        match: 20,
        none: 0,
    },
    weekPriority: {
        match: 15,
        none: 0,
    },
    modifiers: {
        needsAttention: 10,
        todayMeeting: 20,
        deepWorkPenalty: -10,
    },
};
/** Minimum hours needed for deep work tasks */
const DEEP_WORK_THRESHOLD_HOURS = 2;
/** Keywords that indicate deep work tasks */
const DEEP_WORK_KEYWORDS = [
    'write',
    'design',
    'architect',
    'review',
    'analyze',
    'plan',
    'research',
    'document',
    'draft',
    'spec',
    'rfc',
    'prd',
];
// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------
/**
 * Get start of day for a date (midnight local time).
 */
function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}
/**
 * Get end of week (Sunday) for a date.
 */
function endOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const daysUntilSunday = 7 - day;
    d.setDate(d.getDate() + daysUntilSunday);
    d.setHours(23, 59, 59, 999);
    return d;
}
/**
 * Get end of next week (following Sunday).
 */
function endOfNextWeek(date) {
    const d = endOfWeek(date);
    d.setDate(d.getDate() + 7);
    return d;
}
/**
 * Parse ISO date string to Date object (local time).
 * Handles both YYYY-MM-DD and YYYY-MM-DDTHH:MM:SS formats.
 */
function parseDate(isoString) {
    // If already has time component, parse directly
    if (isoString.includes('T')) {
        return new Date(isoString);
    }
    // For YYYY-MM-DD, parse as local date (not UTC)
    const [year, month, day] = isoString.split('-').map(Number);
    return new Date(year, month - 1, day);
}
// ---------------------------------------------------------------------------
// Scoring functions (individual dimensions)
// ---------------------------------------------------------------------------
/**
 * Score based on due date urgency.
 * - Overdue: 40
 * - Due today: 35
 * - Due this week: 25
 * - Due next week: 10
 * - Later or no due date: 0
 */
export function scoreDueDate(task, referenceDate) {
    const { due } = task.metadata;
    if (!due) {
        return { score: SCORE_WEIGHTS.dueDate.later, reason: 'No due date' };
    }
    const dueDate = parseDate(due);
    const today = startOfDay(referenceDate);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const thisWeekEnd = endOfWeek(referenceDate);
    const nextWeekEnd = endOfNextWeek(referenceDate);
    if (dueDate < today) {
        return { score: SCORE_WEIGHTS.dueDate.overdue, reason: `Overdue (was ${due})` };
    }
    if (dueDate <= todayEnd) {
        return { score: SCORE_WEIGHTS.dueDate.today, reason: 'Due today' };
    }
    if (dueDate <= thisWeekEnd) {
        return { score: SCORE_WEIGHTS.dueDate.thisWeek, reason: 'Due this week' };
    }
    if (dueDate <= nextWeekEnd) {
        return { score: SCORE_WEIGHTS.dueDate.nextWeek, reason: 'Due next week' };
    }
    return { score: SCORE_WEIGHTS.dueDate.later, reason: `Due ${due}` };
}
/**
 * Score based on commitment linkage.
 * Tasks with @from(commitment:xxx) get priority.
 */
export function scoreCommitment(task) {
    const { from } = task.metadata;
    if (from?.type === 'commitment') {
        return {
            score: SCORE_WEIGHTS.commitment.linked,
            reason: `Linked to commitment ${from.id}`,
        };
    }
    return { score: SCORE_WEIGHTS.commitment.none, reason: 'No commitment link' };
}
/**
 * Score based on meeting relevance.
 * Task @person or @area matching today's meeting = priority.
 */
export function scoreMeetingRelevance(task, context) {
    const { person, area } = task.metadata;
    // Check person match
    if (person && context.todayMeetingAttendees.includes(person)) {
        return {
            score: SCORE_WEIGHTS.meetingRelevance.match,
            reason: `@${person} is in today's meeting`,
        };
    }
    // Check area match
    if (area && context.todayMeetingAreas.includes(area)) {
        return {
            score: SCORE_WEIGHTS.meetingRelevance.match,
            reason: `@area(${area}) has meeting today`,
        };
    }
    return { score: SCORE_WEIGHTS.meetingRelevance.none, reason: 'No meeting relevance' };
}
/**
 * Score based on week priority alignment.
 * Task text matching week priority keywords = priority.
 */
export function scoreWeekPriority(task, weekPriorities) {
    if (weekPriorities.length === 0) {
        return { score: SCORE_WEIGHTS.weekPriority.none, reason: 'No week priorities set' };
    }
    const taskTextLower = task.text.toLowerCase();
    // Check if any word in week priorities appears in task text
    for (const priority of weekPriorities) {
        const words = priority.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        for (const word of words) {
            if (taskTextLower.includes(word)) {
                return {
                    score: SCORE_WEIGHTS.weekPriority.match,
                    reason: `Matches week priority: "${priority.slice(0, 30)}..."`,
                };
            }
        }
    }
    return { score: SCORE_WEIGHTS.weekPriority.none, reason: 'No priority match' };
}
/**
 * Calculate modifiers that adjust the base score.
 */
export function calculateModifiers(task, context) {
    let totalModifier = 0;
    const reasons = [];
    const { person, area } = task.metadata;
    // +10 if @person is in needsAttentionPeople
    if (person && context.needsAttentionPeople.includes(person)) {
        totalModifier += SCORE_WEIGHTS.modifiers.needsAttention;
        reasons.push(`+10: @${person} needs attention`);
    }
    // +20 if task relates to today's meeting attendee or area
    // (This stacks with meetingRelevance for high-signal tasks)
    const hasTodayMeeting = (person && context.todayMeetingAttendees.includes(person)) ||
        (area && context.todayMeetingAreas.includes(area));
    if (hasTodayMeeting) {
        totalModifier += SCORE_WEIGHTS.modifiers.todayMeeting;
        reasons.push('+20: Today\'s meeting context');
    }
    // -10 if deep work task but insufficient focus time
    if (isDeepWorkTask(task) && context.availableFocusHours < DEEP_WORK_THRESHOLD_HOURS) {
        totalModifier += SCORE_WEIGHTS.modifiers.deepWorkPenalty;
        reasons.push(`-10: Deep work needs ${DEEP_WORK_THRESHOLD_HOURS}hrs, only ${context.availableFocusHours}hrs available`);
    }
    return { score: totalModifier, reasons };
}
/**
 * Detect if a task requires deep focus time.
 */
function isDeepWorkTask(task) {
    const textLower = task.text.toLowerCase();
    return DEEP_WORK_KEYWORDS.some((keyword) => textLower.includes(keyword));
}
// ---------------------------------------------------------------------------
// Main scoring function
// ---------------------------------------------------------------------------
/**
 * Score a single task against the current context.
 * Returns total score and breakdown by dimension.
 */
export function scoreTask(task, context) {
    const referenceDate = context.referenceDate ?? new Date();
    // Calculate each dimension
    const dueDate = scoreDueDate(task, referenceDate);
    const commitment = scoreCommitment(task);
    const meetingRelevance = scoreMeetingRelevance(task, context);
    const weekPriority = scoreWeekPriority(task, context.weekPriorities);
    const modifiers = calculateModifiers(task, context);
    // Sum total
    const total = dueDate.score +
        commitment.score +
        meetingRelevance.score +
        weekPriority.score +
        modifiers.score;
    const breakdown = {
        dueDate,
        commitment,
        meetingRelevance,
        weekPriority,
        modifiers,
        total,
    };
    return { score: total, breakdown };
}
/**
 * Score multiple tasks and return sorted by score descending.
 */
export function scoreTasks(tasks, context) {
    return tasks
        .map((task) => {
        const { score, breakdown } = scoreTask(task, context);
        return { task, score, breakdown };
    })
        .sort((a, b) => b.score - a.score);
}
/**
 * Get top N tasks by score.
 */
export function getTopTasks(tasks, context, limit = 5) {
    return scoreTasks(tasks, context).slice(0, limit);
}
/**
 * Format a scored task for display (Architect/Preparer requirement).
 */
export function formatScoredTask(scoredTask, rank) {
    const { task, breakdown } = scoredTask;
    const lines = [];
    lines.push(`${rank}. ${task.text} (score: ${breakdown.total})`);
    // Show non-zero scores with reasons
    if (breakdown.dueDate.score > 0) {
        lines.push(`   - ${breakdown.dueDate.reason}: +${breakdown.dueDate.score}`);
    }
    if (breakdown.commitment.score > 0) {
        lines.push(`   - Commitment: +${breakdown.commitment.score}`);
    }
    if (breakdown.meetingRelevance.score > 0) {
        lines.push(`   - ${breakdown.meetingRelevance.reason}: +${breakdown.meetingRelevance.score}`);
    }
    if (breakdown.weekPriority.score > 0) {
        lines.push(`   - ${breakdown.weekPriority.reason}: +${breakdown.weekPriority.score}`);
    }
    for (const reason of breakdown.modifiers.reasons) {
        lines.push(`   - ${reason}`);
    }
    return lines.join('\n');
}
/**
 * Format top tasks as a recommendation block for the LLM.
 */
export function formatTaskRecommendations(scoredTasks, limit = 5) {
    const top = scoredTasks.slice(0, limit);
    if (top.length === 0) {
        return 'No tasks to recommend.';
    }
    const lines = ['**Recommended focus for today:**', ''];
    for (let i = 0; i < top.length; i++) {
        lines.push(formatScoredTask(top[i], i + 1));
        if (i < top.length - 1)
            lines.push('');
    }
    return lines.join('\n');
}
//# sourceMappingURL=task-scoring.js.map