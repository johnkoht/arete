/**
 * Task domain types.
 *
 * Imports from common.ts ONLY.
 */

/**
 * Metadata extracted from @tag(value) patterns in task text.
 */
export type TaskMetadata = {
  /** Area slug from @area(slug) */
  area?: string;
  /** Project slug from @project(slug) */
  project?: string;
  /** Person slug from @person(slug) */
  person?: string;
  /** Source reference from @from(type:id) — e.g. commitment:abc123 or meeting:2026-03-27 */
  from?: { type: 'commitment' | 'meeting'; id: string };
  /** Due date from @due(YYYY-MM-DD), ISO date string */
  due?: string;
};

/**
 * GTD bucket destinations for tasks.
 * - inbox, must, should, could: in now/week.md
 * - anytime, someday: in now/tasks.md
 */
export type TaskDestination = 'inbox' | 'must' | 'should' | 'could' | 'anytime' | 'someday';

/**
 * A task read from or written to the workspace.
 */
export type WorkspaceTask = {
  /** Content hash (sha256 of normalized text, 8-char prefix like commitments) */
  id: string;
  /** Task description (without @tags) */
  text: string;
  /** Checkbox state: true = [x], false = [ ] */
  completed: boolean;
  /** Extracted metadata from @tag(value) patterns */
  metadata: TaskMetadata;
  /** Where the task was read from */
  source: { file: string; section: string };
};

/**
 * Result of parsing a task line.
 */
export type ParsedTaskLine = {
  /** Clean text without @tags */
  text: string;
  /** Checkbox completed state */
  completed: boolean;
  /** Extracted metadata */
  metadata: TaskMetadata;
  /** Raw line for debugging */
  raw: string;
};

/**
 * Options for listing tasks.
 */
export type ListTasksOptions = {
  /** Filter by area slug */
  area?: string;
  /** Filter by project slug */
  project?: string;
  /** Filter by person slug */
  person?: string;
  /** Filter by due date (tasks due on or before this date) */
  due?: string;
  /** Filter by completed state */
  completed?: boolean;
  /** Filter by destination */
  destination?: TaskDestination;
};
