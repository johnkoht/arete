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
     * Move a task from its current location to a new destination.
     */
    moveTask(taskId: string, destination: TaskDestination): Promise<WorkspaceTask>;
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