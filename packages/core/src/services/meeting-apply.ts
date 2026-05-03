/**
 * Meeting apply service — applies extracted intelligence to meeting files.
 *
 * Writes staged sections and updates frontmatter, but does NOT touch
 * people files or commitments. The separation allows for composable
 * meeting processing pipelines.
 *
 * Used by `arete meeting apply <file>` CLI command.
 */

import { resolve, dirname, join, basename } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { StorageAdapter } from '../storage/adapter.js';
import type { MeetingIntelligence, MeetingExtractionResult } from './meeting-extraction.js';
import { formatStagedSections, updateMeetingContent } from './meeting-extraction.js';
import { writeMeetingSummary, type MeetingSummaryInput } from './summary-writer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Options for applying meeting intelligence.
 */
export interface ApplyMeetingOptions {
  /** Skip archiving the linked agenda file. */
  skipAgenda?: boolean;
  /** Clear existing staged sections before writing new ones. */
  clear?: boolean;
  /**
   * Skip the topic alias/merge pass (Phase A #1 of topic-wiki-memory).
   * When set, `intelligence.topics` is written to frontmatter verbatim
   * without normalization against existing topic slugs. Use with
   * `--skip-topics` on `arete meeting apply` when you want apply to
   * be fast and will run `arete memory refresh` later.
   */
  skipTopicAlias?: boolean;
  /**
   * Skip the post-apply summary writer (Phase 1 wiki expansion §a.1).
   * Use during reprocessing where the source body hasn't changed and
   * the existing summary is fresh; the writer also self-skips on
   * content_hash match, so this flag is mostly a fast-path.
   */
  skipSummary?: boolean;
}

/**
 * Result of applying meeting intelligence.
 */
export interface ApplyMeetingResult {
  /** Path to the updated meeting file. */
  meetingPath: string;
  /** Number of action items staged. */
  actionItemsStaged: number;
  /** Number of decisions staged. */
  decisionsStaged: number;
  /** Number of learnings staged. */
  learningsStaged: number;
  /** Path to the archived agenda (if any). */
  agendaArchived: string | null;
  /**
   * Path to the per-meeting summary file (Phase 1 §a.1) when one was
   * written or already-fresh; null when no LLM was provided / writer
   * was skipped / write failed.
   */
  summaryPath: string | null;
  /**
   * Whether the summary was written this invocation. False for
   * already-fresh / no-llm / skip-summary paths.
   */
  summaryWritten: boolean;
  /** Warnings during processing. */
  warnings: string[];
}

/**
 * Dependencies for applyMeetingIntelligence (DI pattern for testing).
 */
export interface ApplyMeetingDeps {
  storage: StorageAdapter;
  /** Workspace root path for resolving relative paths. */
  workspaceRoot: string;
  /**
   * Optional TopicMemoryService — when provided, `intelligence.topics`
   * runs through `aliasAndMerge` before being written to frontmatter.
   * Coerces near-duplicate LLM-proposed slugs (e.g.,
   * `cover-whale-email-templates` → `cover-whale-templates`) against
   * existing topic pages. First-line sprawl defense sits in the
   * extraction prompt (see `meeting-extraction.ts:activeTopicSlugs`);
   * this is the backstop for cases where the bias didn't hold.
   */
  topicMemory?: import('./topic-memory.js').TopicMemoryService;
  /**
   * Optional WorkspacePaths — required when `topicMemory` is provided,
   * for reading the topic-page directory to derive existing identities.
   */
  workspacePaths?: import('../models/workspace.js').WorkspacePaths;
  /**
   * Optional LLM function for adjudicating the 0.4–0.67 ambiguous
   * alias band. Without it, ambiguous candidates stay as proposed
   * (conservative; lint catches residual sprawl later).
   */
  callLLM?: import('../integrations/conversations/extract.js').LLMCallFn;
}

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

interface FrontmatterResult {
  data: Record<string, unknown>;
  body: string;
}

function parseFrontmatter(content: string): FrontmatterResult {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: content };
  try {
    const data = parseYaml(match[1]) as Record<string, unknown>;
    return { data, body: match[2] };
  } catch {
    return { data: {}, body: content };
  }
}

function serializeFrontmatter(data: Record<string, unknown>, body: string): string {
  const fm = stringifyYaml(data).trimEnd();
  return `---\n${fm}\n---\n\n${body.replace(/^\n+/, '')}`;
}

/**
 * Extract YYYY-MM-DD from a meeting filename, e.g.,
 * `2026-04-22-cover-whale.md` → `2026-04-22`. Returns null if no
 * date prefix is present.
 */
function extractDateFromFilename(absPath: string): string | null {
  const m = basename(absPath).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Content manipulation helpers
// ---------------------------------------------------------------------------

/**
 * Headers that are part of staged sections.
 */
const STAGED_HEADERS = new Set([
  'summary',
  'core',
  'could include',
  'staged action items',
  'staged decisions',
  'staged learnings',
]);

/**
 * Remove all staged sections from meeting body content.
 * Removes: `## Summary`, `## Staged Action Items`, `## Staged Decisions`, `## Staged Learnings`
 * and all content until the next `##` header that is not a staged header.
 */
export function clearStagedSections(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let skipping = false;

  for (const line of lines) {
    // Check for section headers
    const headerMatch = line.match(/^## (.+)$/);
    if (headerMatch) {
      const headerName = headerMatch[1].trim().toLowerCase();
      if (STAGED_HEADERS.has(headerName)) {
        skipping = true;
        continue;
      } else {
        // Non-staged header - stop skipping and include this line
        skipping = false;
      }
    }

    if (!skipping) {
      result.push(line);
    }
  }

  // Trim trailing blank lines
  while (result.length > 0 && result[result.length - 1].trim() === '') {
    result.pop();
  }

  return result.join('\n');
}

// ---------------------------------------------------------------------------
// Main Function
// ---------------------------------------------------------------------------

/**
 * Apply extracted intelligence to a meeting file.
 *
 * This function:
 * 1. Reads the meeting file
 * 2. Optionally clears existing staged sections (if options.clear)
 * 3. Formats and writes staged sections (Summary, Action Items, Decisions, Learnings)
 * 4. Updates frontmatter: status: processed, processed_at: <timestamp>
 * 5. Archives linked agenda (if present and not skipped)
 *
 * Does NOT touch people files or commitments.
 *
 * @param meetingPath - Path to the meeting file (absolute or relative to workspaceRoot)
 * @param intelligence - Extracted meeting intelligence (from extractMeetingIntelligence)
 * @param deps - Dependencies (storage, workspaceRoot)
 * @param options - Optional flags (skipAgenda, clear)
 * @returns Result with counts and warnings
 */
export async function applyMeetingIntelligence(
  meetingPath: string,
  intelligence: MeetingIntelligence,
  deps: ApplyMeetingDeps,
  options: ApplyMeetingOptions = {},
): Promise<ApplyMeetingResult> {
  const { storage, workspaceRoot } = deps;
  const warnings: string[] = [];

  // Resolve path
  const absPath = meetingPath.startsWith('/')
    ? meetingPath
    : resolve(workspaceRoot, meetingPath);

  // 1. Read meeting file
  const content = await storage.read(absPath);
  if (!content) {
    throw new Error(`Meeting file not found: ${meetingPath}`);
  }

  // 2. Parse frontmatter and body
  let { data, body } = parseFrontmatter(content);

  // 3. Optionally clear existing staged sections
  if (options.clear) {
    body = clearStagedSections(body);
  }

  // 4. Format staged sections from intelligence
  // Build a MeetingExtractionResult wrapper for formatStagedSections
  const extractionResult: MeetingExtractionResult = {
    intelligence,
    validationWarnings: [],
    rawItems: [],
  };
  const stagedSections = formatStagedSections(extractionResult);

  // 5. Update meeting content with staged sections
  const updatedBody = updateMeetingContent(body, stagedSections);

  // 6. Update frontmatter
  data['status'] = 'processed';
  data['processed_at'] = new Date().toISOString();

  // Write topics + item counts for agent-facing frontmatter.
  //
  // Alias/merge pass (Phase A #1 of topic-wiki-memory): coerce LLM-proposed
  // slugs against existing topic pages so near-duplicates (e.g.,
  // `cover-whale-email-templates` → `cover-whale-templates`) collapse to
  // one canonical slug instead of sprawling into two topic pages on next
  // refresh. Skipped when `options.skipTopicAlias` or when dependencies
  // aren't provided (pre-topic-wiki-memory behavior).
  const proposedTopics = intelligence.topics ?? [];
  let normalizedTopics = proposedTopics;
  if (
    !options.skipTopicAlias &&
    deps.topicMemory !== undefined &&
    deps.workspacePaths !== undefined &&
    proposedTopics.length > 0
  ) {
    try {
      const { TopicMemoryService } = await import('./topic-memory.js');
      const { topics: existingPages } = await deps.topicMemory.listAll(deps.workspacePaths);
      const existingIdentities = TopicMemoryService.toIdentities(existingPages);
      const aliasResults = await deps.topicMemory.aliasAndMerge(
        proposedTopics,
        existingIdentities,
        { callLLM: deps.callLLM },
      );
      normalizedTopics = aliasResults.map((r) => r.resolved);
    } catch (err) {
      warnings.push(`topic alias/merge failed (non-fatal): ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }
  data['topics'] = normalizedTopics;
  data['open_action_items'] = intelligence.actionItems.length;
  data['my_commitments'] = intelligence.actionItems.filter(i => i.direction === 'i_owe_them').length;
  data['their_commitments'] = intelligence.actionItems.filter(i => i.direction === 'they_owe_me').length;
  data['decisions_count'] = intelligence.decisions.length;
  data['learnings_count'] = intelligence.learnings.length;

  // 7. Write meeting file
  const updatedContent = serializeFrontmatter(data, updatedBody);
  await storage.write(absPath, updatedContent);

  // 8. Archive linked agenda (if present and not skipped)
  let agendaArchived: string | null = null;
  if (!options.skipAgenda) {
    const agendaPath = data['agenda'] as string | undefined;
    if (agendaPath) {
      const absAgendaPath = agendaPath.startsWith('/')
        ? agendaPath
        : resolve(workspaceRoot, agendaPath);

      const agendaContent = await storage.read(absAgendaPath);
      if (agendaContent) {
        const agendaResult = parseFrontmatter(agendaContent);
        agendaResult.data['status'] = 'processed';
        const updatedAgenda = serializeFrontmatter(agendaResult.data, agendaResult.body);
        await storage.write(absAgendaPath, updatedAgenda);
        agendaArchived = agendaPath;
      } else {
        warnings.push(`Linked agenda not found: ${agendaPath}`);
      }
    }
  }

  // 9. Write per-meeting summary file (Phase 1 §a.1).
  //
  // Hook lives AFTER frontmatter is finalized (so the summary inherits
  // resolved topics, importance, participants) and AFTER the meeting
  // file is written (so summary parses the same body the user reads).
  // The writer is idempotent on body content_hash — reprocessing the
  // same meeting is a no-op against an unchanged body.
  let summaryPath: string | null = null;
  let summaryWritten = false;
  if (!options.skipSummary) {
    try {
      const dateRaw = data['date'];
      const meetingDate = typeof dateRaw === 'string'
        ? dateRaw.slice(0, 10)
        : extractDateFromFilename(absPath);
      if (meetingDate !== null) {
        // Workspace-relative source_path for portability.
        const wsRel = absPath.startsWith(workspaceRoot)
          ? absPath.slice(workspaceRoot.length).replace(/^[/\\]+/, '')
          : absPath;

        const importanceRaw = data['importance'];
        const importance: 'skip' | 'light' | 'standard' | 'heavy' | undefined =
          importanceRaw === 'skip' ||
          importanceRaw === 'light' ||
          importanceRaw === 'standard' ||
          importanceRaw === 'heavy'
            ? importanceRaw
            : undefined;

        const areaRaw = data['area'];
        const area = typeof areaRaw === 'string' ? areaRaw : undefined;

        const attendeesRaw = data['attendees'];
        const participants: string[] | undefined = Array.isArray(attendeesRaw)
          ? attendeesRaw
              .map((a) => (typeof a === 'string' ? a : (a as { name?: string })?.name))
              .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          : typeof attendeesRaw === 'string'
            ? attendeesRaw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
            : undefined;

        // Hash on body alone, mirroring topic-memory.hashMeetingSource —
        // frontmatter changes (status bumps, item counts) don't bust dedup.
        const summaryInput: MeetingSummaryInput = {
          sourcePath: wsRel,
          date: meetingDate,
          sourceBody: updatedBody,
          area,
          importance,
          topics: normalizedTopics,
          participants,
        };

        const summaryResult = await writeMeetingSummary(summaryInput, {
          storage,
          workspaceRoot,
          callLLM: deps.callLLM,
        });
        summaryPath = summaryResult.summaryPath;
        summaryWritten = summaryResult.written;
        for (const w of summaryResult.warnings) warnings.push(w);
      }
    } catch (err) {
      // Summary is non-fatal; meeting apply succeeded.
      warnings.push(
        `summary writer failed (non-fatal): ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }

  return {
    meetingPath: absPath,
    actionItemsStaged: intelligence.actionItems.length,
    decisionsStaged: intelligence.decisions.length,
    learningsStaged: intelligence.learnings.length,
    agendaArchived,
    summaryPath,
    summaryWritten,
    warnings,
  };
}
