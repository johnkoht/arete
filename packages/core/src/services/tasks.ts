/**
 * TaskService — manages GTD tasks across now/week.md and now/tasks.md.
 *
 * Follows StorageAdapter pattern — no direct fs calls.
 * Uses content-hash IDs like CommitmentsService.
 */

import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/workspace.js';
import type {
  TaskMetadata,
  TaskDestination,
  WorkspaceTask,
  ParsedTaskLine,
  ListTasksOptions,
} from '../models/tasks.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Bucket-to-file and section mapping */
const DESTINATION_MAP: Record<TaskDestination, { file: 'week.md' | 'tasks.md'; section: string }> = {
  inbox: { file: 'week.md', section: '## Inbox' },
  must: { file: 'week.md', section: '### Must complete' },
  should: { file: 'week.md', section: '### Should complete' },
  could: { file: 'week.md', section: '### Could complete' },
  anytime: { file: 'tasks.md', section: '## Anytime' },
  someday: { file: 'tasks.md', section: '## Someday' },
};

/** Pattern for task checkbox lines */
const TASK_LINE_PATTERN = /^- \[([ xX])\] (.+)$/;

/** Pattern for @tag(value) extraction */
const TAG_PATTERN = /@([a-z]+)\(([^)]*)\)/g;

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Compute task ID from normalized text.
 * Returns 8-char prefix of sha256 hash (like commitments).
 */
function computeTaskId(text: string): string {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  const hash = createHash('sha256').update(normalized).digest('hex');
  return hash.slice(0, 8);
}

/**
 * Parse @tag(value) patterns from text.
 * Returns clean text (without tags) and extracted metadata.
 */
function parseMetadata(text: string): { cleanText: string; metadata: TaskMetadata } {
  const metadata: TaskMetadata = {};
  
  // Extract all @tag(value) patterns
  const cleanText = text.replace(TAG_PATTERN, (match, tagName, value) => {
    switch (tagName) {
      case 'area':
        metadata.area = value.trim();
        break;
      case 'project':
        metadata.project = value.trim();
        break;
      case 'person':
        metadata.person = value.trim();
        break;
      case 'due':
        metadata.due = value.trim();
        break;
      case 'from': {
        // Parse type:id format
        const colonIdx = value.indexOf(':');
        if (colonIdx > 0) {
          const type = value.slice(0, colonIdx).trim();
          const id = value.slice(colonIdx + 1).trim();
          if (type === 'commitment' || type === 'meeting') {
            metadata.from = { type, id };
          }
        }
        break;
      }
      // Unknown tags: skip (don't fail)
      default:
        return match; // Keep unknown tags in text
    }
    return ''; // Remove known tags from text
  }).trim().replace(/\s+/g, ' ');
  
  return { cleanText, metadata };
}

/**
 * Parse a single task line.
 * Returns null if line is not a valid task.
 */
function parseTaskLine(line: string): ParsedTaskLine | null {
  const match = line.match(TASK_LINE_PATTERN);
  if (!match) return null;
  
  const completed = match[1].toLowerCase() === 'x';
  const rawText = match[2];
  const { cleanText, metadata } = parseMetadata(rawText);
  
  return {
    text: cleanText,
    completed,
    metadata,
    raw: line,
  };
}

/**
 * Format a task for writing to file.
 */
function formatTask(text: string, metadata: TaskMetadata, completed: boolean = false): string {
  const checkbox = completed ? '[x]' : '[ ]';
  const parts = [text];
  
  if (metadata.area) parts.push(`@area(${metadata.area})`);
  if (metadata.project) parts.push(`@project(${metadata.project})`);
  if (metadata.person) parts.push(`@person(${metadata.person})`);
  if (metadata.from) parts.push(`@from(${metadata.from.type}:${metadata.from.id})`);
  if (metadata.due) parts.push(`@due(${metadata.due})`);
  
  return `- ${checkbox} ${parts.join(' ')}`;
}

/**
 * Find section in content and return start/end line indices.
 * Handles both ## and ### headers.
 * 
 * Each section ends at ANY next header (# ## or ###) because
 * our GTD buckets (Inbox, Must, Should, Could, Anytime, Someday)
 * are independent sections, not a nested hierarchy.
 */
function findSection(
  lines: string[],
  sectionHeader: string,
): { start: number; end: number } | null {
  // Find section start
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === sectionHeader) {
      start = i;
      break;
    }
  }
  
  if (start === -1) return null;
  
  // Find section end (next header of any level, or end of file)
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    // Any markdown header (# ## ### etc) ends this section
    if (line.startsWith('#')) {
      end = i;
      break;
    }
  }
  
  return { start, end };
}

/**
 * Extract tasks from a section.
 */
function extractTasksFromSection(
  lines: string[],
  section: { start: number; end: number },
  file: string,
  sectionHeader: string,
): WorkspaceTask[] {
  const tasks: WorkspaceTask[] = [];
  
  for (let i = section.start + 1; i < section.end; i++) {
    const line = lines[i];
    const parsed = parseTaskLine(line);
    if (parsed) {
      tasks.push({
        id: computeTaskId(parsed.text),
        text: parsed.text,
        completed: parsed.completed,
        metadata: parsed.metadata,
        source: { file, section: sectionHeader },
      });
    }
  }
  
  return tasks;
}

/**
 * Reverse lookup: find destination from section header.
 */
function sectionToDestination(section: string): TaskDestination | null {
  for (const [dest, mapping] of Object.entries(DESTINATION_MAP)) {
    if (mapping.section === section) {
      return dest as TaskDestination;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// TaskService
// ---------------------------------------------------------------------------

export class TaskService {
  private readonly weekFile: string;
  private readonly tasksFile: string;

  constructor(
    private readonly storage: StorageAdapter,
    workspacePaths: WorkspacePaths,
  ) {
    this.weekFile = join(workspacePaths.now, 'week.md');
    this.tasksFile = join(workspacePaths.now, 'tasks.md');
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private getFilePath(dest: TaskDestination): string {
    const mapping = DESTINATION_MAP[dest];
    return mapping.file === 'week.md' ? this.weekFile : this.tasksFile;
  }

  private async readFile(filePath: string): Promise<string[]> {
    const content = await this.storage.read(filePath);
    if (content === null) return [];
    return content.split('\n');
  }

  private async writeFile(filePath: string, lines: string[]): Promise<void> {
    await this.storage.write(filePath, lines.join('\n'));
  }

  /**
   * Read all tasks from a file, organized by section.
   */
  private async readTasksFromFile(
    filePath: string,
    destinations: TaskDestination[],
  ): Promise<WorkspaceTask[]> {
    const lines = await this.readFile(filePath);
    if (lines.length === 0) return [];

    const tasks: WorkspaceTask[] = [];
    const fileName = filePath.endsWith('week.md') ? 'week.md' : 'tasks.md';

    for (const dest of destinations) {
      const mapping = DESTINATION_MAP[dest];
      if (mapping.file !== fileName) continue;

      const section = findSection(lines, mapping.section);
      if (section) {
        tasks.push(...extractTasksFromSection(lines, section, filePath, mapping.section));
      }
    }

    return tasks;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * List tasks, optionally filtered.
   * Reads both week.md and tasks.md.
   */
  async listTasks(options?: ListTasksOptions): Promise<WorkspaceTask[]> {
    // Determine which destinations to read
    let destinations: TaskDestination[];
    if (options?.destination) {
      destinations = [options.destination];
    } else {
      destinations = ['inbox', 'must', 'should', 'could', 'anytime', 'someday'];
    }

    // Read from both files
    const weekDestinations = destinations.filter((d) =>
      DESTINATION_MAP[d].file === 'week.md'
    );
    const tasksDestinations = destinations.filter((d) =>
      DESTINATION_MAP[d].file === 'tasks.md'
    );

    const [weekTasks, tasksTasks] = await Promise.all([
      weekDestinations.length > 0
        ? this.readTasksFromFile(this.weekFile, weekDestinations)
        : [],
      tasksDestinations.length > 0
        ? this.readTasksFromFile(this.tasksFile, tasksDestinations)
        : [],
    ]);

    let allTasks = [...weekTasks, ...tasksTasks];

    // Apply filters
    if (options?.area) {
      allTasks = allTasks.filter((t) => t.metadata.area === options.area);
    }
    if (options?.project) {
      allTasks = allTasks.filter((t) => t.metadata.project === options.project);
    }
    if (options?.person) {
      allTasks = allTasks.filter((t) => t.metadata.person === options.person);
    }
    if (options?.due) {
      allTasks = allTasks.filter((t) => t.metadata.due && t.metadata.due <= options.due!);
    }
    if (options?.completed !== undefined) {
      allTasks = allTasks.filter((t) => t.completed === options.completed);
    }

    return allTasks;
  }

  /**
   * Add a task to the specified destination.
   */
  async addTask(
    text: string,
    destination: TaskDestination,
    metadata: TaskMetadata = {},
  ): Promise<WorkspaceTask> {
    const filePath = this.getFilePath(destination);
    const mapping = DESTINATION_MAP[destination];
    let lines = await this.readFile(filePath);

    // If file is empty or doesn't exist, create minimal structure
    if (lines.length === 0) {
      lines = ['', mapping.section, ''];
    }

    // Find section
    let section = findSection(lines, mapping.section);

    // If section doesn't exist, append it
    if (!section) {
      // Ensure file ends with newline before adding section
      if (lines.length > 0 && lines[lines.length - 1] !== '') {
        lines.push('');
      }
      lines.push(mapping.section, '');
      section = { start: lines.length - 2, end: lines.length };
    }

    // Format and insert task after section header
    const taskLine = formatTask(text, metadata);
    const insertAt = section.start + 1;
    lines.splice(insertAt, 0, taskLine);

    await this.writeFile(filePath, lines);

    return {
      id: computeTaskId(text),
      text,
      completed: false,
      metadata,
      source: { file: filePath, section: mapping.section },
    };
  }

  /**
   * Mark a task as completed.
   * Returns the linked commitment ID if @from(commitment:xxx) is present.
   */
  async completeTask(taskId: string): Promise<{ task: WorkspaceTask; linkedCommitmentId?: string }> {
    // Search both files for the task
    const allTasks = await this.listTasks();
    const matches = allTasks.filter((t) => t.id === taskId || t.id.startsWith(taskId));

    if (matches.length === 0) {
      throw new Error(`No task found matching id "${taskId}"`);
    }
    if (matches.length > 1) {
      const ids = matches.map((t) => t.id).join(', ');
      throw new Error(`Ambiguous prefix "${taskId}" matches ${matches.length} tasks: ${ids}`);
    }

    const task = matches[0];
    const filePath = task.source.file;
    const lines = await this.readFile(filePath);

    // Find and update the task line
    const section = findSection(lines, task.source.section);
    if (!section) {
      throw new Error(`Section "${task.source.section}" not found in ${filePath}`);
    }

    let found = false;
    for (let i = section.start + 1; i < section.end; i++) {
      const parsed = parseTaskLine(lines[i]);
      if (parsed && computeTaskId(parsed.text) === task.id) {
        // Replace [ ] with [x]
        lines[i] = lines[i].replace('[ ]', '[x]');
        found = true;
        break;
      }
    }

    if (!found) {
      throw new Error(`Task line not found in section "${task.source.section}"`);
    }

    await this.writeFile(filePath, lines);

    const updatedTask: WorkspaceTask = { ...task, completed: true };
    const linkedCommitmentId = task.metadata.from?.type === 'commitment'
      ? task.metadata.from.id
      : undefined;

    return { task: updatedTask, linkedCommitmentId };
  }

  /**
   * Move a task from its current location to a new destination.
   */
  async moveTask(taskId: string, destination: TaskDestination): Promise<WorkspaceTask> {
    // Find the task
    const allTasks = await this.listTasks();
    const matches = allTasks.filter((t) => t.id === taskId || t.id.startsWith(taskId));

    if (matches.length === 0) {
      throw new Error(`No task found matching id "${taskId}"`);
    }
    if (matches.length > 1) {
      const ids = matches.map((t) => t.id).join(', ');
      throw new Error(`Ambiguous prefix "${taskId}" matches ${matches.length} tasks: ${ids}`);
    }

    const task = matches[0];
    const sourceFile = task.source.file;
    const destFile = this.getFilePath(destination);
    const destMapping = DESTINATION_MAP[destination];

    // Check if already in destination
    if (task.source.section === destMapping.section) {
      return task; // No-op
    }

    // Remove from source
    const sourceLines = await this.readFile(sourceFile);
    const sourceSection = findSection(sourceLines, task.source.section);
    if (sourceSection) {
      for (let i = sourceSection.start + 1; i < sourceSection.end; i++) {
        const parsed = parseTaskLine(sourceLines[i]);
        if (parsed && computeTaskId(parsed.text) === task.id) {
          sourceLines.splice(i, 1);
          break;
        }
      }
      await this.writeFile(sourceFile, sourceLines);
    }

    // Add to destination (handles cross-file moves)
    return this.addTask(task.text, destination, task.metadata);
  }

  /**
   * Find a task by ID (prefix match supported).
   */
  async findTask(taskId: string): Promise<WorkspaceTask | null> {
    const allTasks = await this.listTasks();
    const matches = allTasks.filter((t) => t.id === taskId || t.id.startsWith(taskId));

    if (matches.length === 0) return null;
    if (matches.length > 1) {
      throw new Error(`Ambiguous prefix "${taskId}" matches ${matches.length} tasks`);
    }

    return matches[0];
  }

  /**
   * Delete a task by ID.
   */
  async deleteTask(taskId: string): Promise<WorkspaceTask> {
    const task = await this.findTask(taskId);
    if (!task) {
      throw new Error(`No task found matching id "${taskId}"`);
    }

    const filePath = task.source.file;
    const lines = await this.readFile(filePath);
    const section = findSection(lines, task.source.section);

    if (!section) {
      throw new Error(`Section "${task.source.section}" not found in ${filePath}`);
    }

    for (let i = section.start + 1; i < section.end; i++) {
      const parsed = parseTaskLine(lines[i]);
      if (parsed && computeTaskId(parsed.text) === task.id) {
        lines.splice(i, 1);
        break;
      }
    }

    await this.writeFile(filePath, lines);
    return task;
  }
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export { parseMetadata, parseTaskLine, formatTask, computeTaskId, findSection };
