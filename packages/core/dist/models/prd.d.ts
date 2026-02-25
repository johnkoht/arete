/**
 * PRD/Task types with validators.
 *
 * Standalone — imports NOTHING from other model files.
 * Migrated from dev/autonomous/schema.ts.
 */
/** Task status values */
export type TaskStatus = 'pending' | 'in_progress' | 'complete' | 'failed';
/** A single task/user story from the PRD */
export type Task = {
    /** Unique identifier (e.g., "task-1", "auth-setup") */
    id: string;
    /** Short, descriptive title */
    title: string;
    /** Detailed description of what needs to be done */
    description: string;
    /** List of acceptance criteria that define "done" */
    acceptanceCriteria: string[];
    /** Current status of the task */
    status: TaskStatus;
    /** Whether quality checks (tests, typecheck) passed */
    passes: boolean;
    /** Number of attempts made to complete this task */
    attemptCount: number;
    /** Notes from execution attempts (errors, learnings, etc.) */
    notes?: string;
    /** Git commit SHA if successfully completed */
    commitSha?: string;
};
/** Complete PRD with metadata and task list */
export type PRD = {
    /** Name of the feature/PRD (kebab-case) */
    name: string;
    /** Git branch name for this work */
    branchName: string;
    /** High-level goal of this PRD */
    goal: string;
    /** List of tasks to complete */
    userStories: Task[];
    /** Metadata */
    metadata: {
        /** When this PRD was created */
        createdAt: string;
        /** When execution started (if applicable) */
        startedAt?: string;
        /** When execution completed (if applicable) */
        completedAt?: string;
        /** Total number of tasks */
        totalTasks: number;
        /** Number of completed tasks */
        completedTasks: number;
        /** Number of failed tasks */
        failedTasks: number;
    };
};
/** Validation helper for Task */
export declare function validateTask(task: Task): {
    valid: boolean;
    errors: string[];
};
/** Validation helper for PRD */
export declare function validatePRD(prd: PRD): {
    valid: boolean;
    errors: string[];
};
//# sourceMappingURL=prd.d.ts.map