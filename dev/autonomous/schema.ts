/**
 * Autonomous Agent Loop - PRD JSON Schema
 * 
 * Type definitions for the task-based PRD format used by the autonomous
 * execution system. This is INTERNAL tooling for Arete development only.
 * 
 * NOTE: This schema is still referenced by prd-to-json skill for generating
 * prd.json files. It may move to a different location in Phase 2 of the
 * subagent refactor. See .pi/skills/execute-prd/SKILL.md for current workflow.
 */

/**
 * Task status values
 */
export type TaskStatus = 'pending' | 'in_progress' | 'complete' | 'failed';

/**
 * A single task/user story from the PRD
 */
export interface Task {
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
}

/**
 * Complete PRD with metadata and task list
 */
export interface PRD {
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
}

/**
 * Validation helper
 */
export function validateTask(task: Task): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!task.id || typeof task.id !== 'string') {
    errors.push('Task must have a valid id');
  }

  if (!task.title || typeof task.title !== 'string') {
    errors.push('Task must have a title');
  }

  if (!task.description || typeof task.description !== 'string') {
    errors.push('Task must have a description');
  }

  if (!Array.isArray(task.acceptanceCriteria) || task.acceptanceCriteria.length === 0) {
    errors.push('Task must have at least one acceptance criterion');
  }

  const validStatuses: TaskStatus[] = ['pending', 'in_progress', 'complete', 'failed'];
  if (!validStatuses.includes(task.status)) {
    errors.push(`Task status must be one of: ${validStatuses.join(', ')}`);
  }

  if (typeof task.passes !== 'boolean') {
    errors.push('Task must have a passes boolean');
  }

  if (typeof task.attemptCount !== 'number' || task.attemptCount < 0) {
    errors.push('Task must have a valid attemptCount (>= 0)');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validation helper for PRD
 */
export function validatePRD(prd: PRD): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!prd.name || typeof prd.name !== 'string') {
    errors.push('PRD must have a name');
  }

  if (!prd.branchName || typeof prd.branchName !== 'string') {
    errors.push('PRD must have a branchName');
  }

  if (!prd.goal || typeof prd.goal !== 'string') {
    errors.push('PRD must have a goal');
  }

  if (!Array.isArray(prd.userStories) || prd.userStories.length === 0) {
    errors.push('PRD must have at least one user story');
  }

  // Validate each task
  prd.userStories.forEach((task, index) => {
    const taskValidation = validateTask(task);
    if (!taskValidation.valid) {
      errors.push(`Task ${index} (${task.id}): ${taskValidation.errors.join(', ')}`);
    }
  });

  return { valid: errors.length === 0, errors };
}
