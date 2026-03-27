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
import type { WorkspaceTask } from '../models/tasks.js';
/**
 * Context needed for scoring tasks.
 */
export interface ScoringContext {
    /** Person slugs from today's calendar meetings */
    todayMeetingAttendees: string[];
    /** Area slugs from today's meetings */
    todayMeetingAreas: string[];
    /** Priority text from now/week.md */
    weekPriorities: string[];
    /** Hours of focus time available today */
    availableFocusHours: number;
    /** People marked as needs_attention in their profile */
    needsAttentionPeople: string[];
    /** Reference date for scoring (defaults to today) */
    referenceDate?: Date;
}
/**
 * Breakdown of score by dimension for transparency.
 */
export interface ScoreBreakdown {
    dueDate: {
        score: number;
        reason: string;
    };
    commitment: {
        score: number;
        reason: string;
    };
    meetingRelevance: {
        score: number;
        reason: string;
    };
    weekPriority: {
        score: number;
        reason: string;
    };
    modifiers: {
        score: number;
        reasons: string[];
    };
    total: number;
}
/**
 * A task with its computed score and breakdown.
 */
export interface ScoredTask {
    task: WorkspaceTask;
    score: number;
    breakdown: ScoreBreakdown;
}
/**
 * Score based on due date urgency.
 * - Overdue: 40
 * - Due today: 35
 * - Due this week: 25
 * - Due next week: 10
 * - Later or no due date: 0
 */
export declare function scoreDueDate(task: WorkspaceTask, referenceDate: Date): {
    score: number;
    reason: string;
};
/**
 * Score based on commitment linkage.
 * Tasks with @from(commitment:xxx) get priority.
 */
export declare function scoreCommitment(task: WorkspaceTask): {
    score: number;
    reason: string;
};
/**
 * Score based on meeting relevance.
 * Task @person or @area matching today's meeting = priority.
 */
export declare function scoreMeetingRelevance(task: WorkspaceTask, context: Pick<ScoringContext, 'todayMeetingAttendees' | 'todayMeetingAreas'>): {
    score: number;
    reason: string;
};
/**
 * Score based on week priority alignment.
 * Task text matching week priority keywords = priority.
 */
export declare function scoreWeekPriority(task: WorkspaceTask, weekPriorities: string[]): {
    score: number;
    reason: string;
};
/**
 * Calculate modifiers that adjust the base score.
 */
export declare function calculateModifiers(task: WorkspaceTask, context: ScoringContext): {
    score: number;
    reasons: string[];
};
/**
 * Score a single task against the current context.
 * Returns total score and breakdown by dimension.
 */
export declare function scoreTask(task: WorkspaceTask, context: ScoringContext): {
    score: number;
    breakdown: ScoreBreakdown;
};
/**
 * Score multiple tasks and return sorted by score descending.
 */
export declare function scoreTasks(tasks: WorkspaceTask[], context: ScoringContext): ScoredTask[];
/**
 * Get top N tasks by score.
 */
export declare function getTopTasks(tasks: WorkspaceTask[], context: ScoringContext, limit?: number): ScoredTask[];
/**
 * Format a scored task for display (Architect/Preparer requirement).
 */
export declare function formatScoredTask(scoredTask: ScoredTask, rank: number): string;
/**
 * Format top tasks as a recommendation block for the LLM.
 */
export declare function formatTaskRecommendations(scoredTasks: ScoredTask[], limit?: number): string;
//# sourceMappingURL=task-scoring.d.ts.map