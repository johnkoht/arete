/**
 * TaskService — manages GTD tasks across now/week.md and now/tasks.md.
 *
 * Follows StorageAdapter pattern — no direct fs calls.
 * Uses content-hash IDs like CommitmentsService.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/workspace.js';
import type { TaskMetadata, TaskDestination, WorkspaceTask, ParsedTaskLine, ListTasksOptions } from '../models/tasks.js';
import type { CommitmentsService } from './commitments.js';
/**
 * Thrown when a task ID does not match any task.
 */
export declare class TaskNotFoundError extends Error {
    constructor(id: string);
}
/**
 * Thrown when a task ID prefix matches multiple tasks.
 */
export declare class AmbiguousIdError extends Error {
    constructor(id: string, matchCount: number, matchedIds: string[]);
}
/**
 * Compute task ID from normalized text.
 * Returns 8-char prefix of sha256 hash (like commitments).
 */
declare function computeTaskId(text: string): string;
/**
 * Parse @tag(value) patterns from text.
 * Returns clean text (without tags) and extracted metadata.
 */
declare function parseMetadata(text: string): {
    cleanText: string;
    metadata: TaskMetadata;
};
/**
 * Parse a single task line.
 * Returns null if line is not a valid task.
 */
declare function parseTaskLine(line: string): ParsedTaskLine | null;
/**
 * Format a task for writing to file.
 */
declare function formatTask(text: string, metadata: TaskMetadata, completed?: boolean): string;
/**
 * Find section in content and return start/end line indices.
 * Handles both ## and ### headers.
 *
 * Each section ends at ANY next header (# ## or ###) because
 * our GTD buckets (Inbox, Must, Should, Could, Anytime, Someday)
 * are independent sections, not a nested hierarchy.
 */
declare function findSection(lines: string[], sectionHeader: string): {
    start: number;
    end: number;
} | null;
/**
 * Result of completing a task.
 */
export type CompleteTaskResult = {
    task: WorkspaceTask;
    linkedCommitmentId?: string;
    resolvedCommitment?: {
        id: string;
        text: string;
    };
};
export declare class TaskService {
    private readonly storage;
    private readonly weekFile;
    private readonly tasksFile;
    private readonly commitments?;
    constructor(storage: StorageAdapter, workspacePaths: WorkspacePaths, commitments?: CommitmentsService);
    private getFilePath;
    private readFile;
    private writeFile;
    /**
     * Read all tasks from a file, organized by section.
     */
    private readTasksFromFile;
    /**
     * List tasks, optionally filtered.
     * Reads both week.md and tasks.md.
     */
    listTasks(options?: ListTasksOptions): Promise<WorkspaceTask[]>;
    /**
     * Add a task to the specified destination.
     *
     * Dedup logic (runs before insert):
     * 1. Fast-path: if metadata.from.id matches any existing task's @from(commitment:id), skip insert.
     * 2. Jaccard similarity: if normalized text similarity >= 0.8 vs any existing task, skip insert.
     * In both cases, returns the existing task instead of inserting.
     */
    addTask(text: string, destination: TaskDestination, metadata?: TaskMetadata): Promise<WorkspaceTask>;
    /**
     * Mark a task as completed.
     * Auto-resolves linked commitment if @from(commitment:xxx) is present and CommitmentsService was provided.
     * Returns the linked commitment ID and resolved commitment info if applicable.
     *
     * NOTE: Auto-resolution is silent (no throw on missing commitment) per Harvester requirement.
     */
    completeTask(taskId: string): Promise<CompleteTaskResult>;
    /**
     * F1: mark open tasks complete by linked commitment id prefix.
     *
     * Used by CommitmentsService.resolve() to back-propagate commitment
     * resolution onto the working surface (week.md / tasks.md) so the
     * user's task checkboxes match commitments.json. Without this, a
     * resolved commitment leaves its linked task open — the Cover Whale
     * orphan class.
     *
     * Iterates both files, finds tasks with `@from(commitment:<prefix>)`,
     * marks `[x]` + `@completedAt`. Does NOT call commitments.resolve();
     * the caller (commitments.resolve itself) has already updated
     * commitments.json. Already-completed tasks are skipped.
     *
     * Returns list of tasks that were marked complete (empty if none).
     */
    completeTaskByCommitmentId(commitmentIdPrefix: string): Promise<{
        id: string;
        text: string;
    }[]>;
    /**
     * F2 + FU3: returns the subset of `commitmentIdPrefixes` that are
     * referenced by at least one OPEN task via `@from(commitment:<prefix>)`.
     * Used by CommitmentsService.save() to refuse pruning commitments
     * with live task references. Completed tasks with stale references
     * are intentionally NOT counted — those references are historical
     * and pruning the commitment leaves only a harmless dangling
     * reference in a checked-off line.
     *
     * Batched (FU3): reads both task files ONCE regardless of how many
     * prefixes are queried. Caller (save()) consults this once per write
     * rather than once per prune-candidate.
     */
    hasOpenTaskReferencesToCommitments(commitmentIdPrefixes: string[]): Promise<Set<string>>;
    /**
     * Uncomplete a task — change [x] back to [ ] and remove @completedAt.
     */
    uncompleteTask(taskId: string): Promise<WorkspaceTask>;
    /**
     * Move a task from its current location to a new destination.
     */
    moveTask(taskId: string, destination: TaskDestination): Promise<WorkspaceTask>;
    /**
     * Update task metadata.
     * Supports updating due date, area, and project.
     * - Pass `{ due: 'YYYY-MM-DD' }` to set/change due date
     * - Pass `{ due: null }` to remove due date
     * - Pass `{ area: 'slug' }` to set/change area
     * - Pass `{ area: null }` to remove area
     * - Pass `{ project: 'slug' }` to set/change project
     * - Pass `{ project: null }` to remove project
     *
     * Atomic: validates before writing — file unchanged on validation error.
     */
    updateTask(taskId: string, updates: {
        due?: string | null;
        area?: string | null;
        project?: string | null;
    }): Promise<WorkspaceTask>;
    /**
     * Find a task by ID (prefix match supported).
     */
    findTask(taskId: string): Promise<WorkspaceTask | null>;
    /**
     * Delete a task by ID.
     */
    deleteTask(taskId: string): Promise<WorkspaceTask>;
}
export { parseMetadata, parseTaskLine, formatTask, computeTaskId, findSection };
//# sourceMappingURL=tasks.d.ts.map