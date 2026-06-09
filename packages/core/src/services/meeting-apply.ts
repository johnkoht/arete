/**
 * Meeting apply service — applies extracted intelligence to meeting files.
 *
 * Writes staged sections and updates frontmatter, but does NOT touch
 * people files or commitments. The separation allows for composable
 * meeting processing pipelines.
 *
 * Used by `arete meeting apply <file>` CLI command.
 */

import { resolve } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { StorageAdapter } from '../storage/adapter.js';
import type { MeetingIntelligence, MeetingExtractionResult } from './meeting-extraction.js';
import { formatStagedSections, updateMeetingContent } from './meeting-extraction.js';
import { writeMeetingSummaryFromFrontmatter } from './summary-writer.js';
import { refreshOrgs } from './org-entity.js';
import { writeMeetingApplyFrontmatter } from './meeting-frontmatter.js';

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
  /**
   * Skip the post-apply org-entity auto-detection refresh (Phase 1
   * wiki expansion §b). When set, no `.arete/memory/entities/orgs/`
   * pages are written from this apply.
   */
  skipOrgEntities?: boolean;
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
  /**
   * Slugs of org-entity pages refreshed this invocation. Empty when
   * skipOrgEntities is set, when no orgs qualified, or when the
   * detection scan was skipped (e.g., no workspacePaths).
   */
  orgsRefreshed: string[];
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

  // 6. Update frontmatter — unified writer (phase-3-5-followup-5 AC1).
  //
  // Alias/merge pass (Phase A #1 of topic-wiki-memory): coerce LLM-proposed
  // slugs against existing topic pages so near-duplicates (e.g.,
  // `cover-whale-email-templates` → `cover-whale-templates`) collapse to
  // one canonical slug instead of sprawling into two topic pages on next
  // refresh. Skipped when `options.skipTopicAlias` or when dependencies
  // aren't provided (pre-topic-wiki-memory behavior).
  await writeMeetingApplyFrontmatter(
    data,
    intelligence,
    { status: 'processed', processedAt: new Date().toISOString() },
    {
      topicMemory: deps.topicMemory,
      workspacePaths: deps.workspacePaths,
      callLLM: deps.callLLM,
      skipTopicAlias: options.skipTopicAlias,
      onWarning: (msg) => warnings.push(msg),
    },
  );

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
      // Derivation (date/area/importance/topics/participants) is shared
      // with the `arete meeting approve` summary hook via
      // `writeMeetingSummaryFromFrontmatter` (wiki-repair W2 — single
      // derivation path so the two writers can never diverge). Hash on
      // body alone, mirroring topic-memory.hashMeetingSource —
      // frontmatter changes (status bumps, item counts) don't bust
      // dedup. `data['topics']` carries the post-alias-coerce result
      // the unified writer just wrote; `could_include` headlines feed
      // the summary's `## FYI` section (body-block rendering on the
      // source file was removed in Phase 1).
      const summaryResult = await writeMeetingSummaryFromFrontmatter(
        {
          absPath,
          frontmatter: data,
          body: updatedBody,
          couldInclude: intelligence.could_include,
        },
        { storage, workspaceRoot, callLLM: deps.callLLM },
      );
      if (summaryResult !== null) {
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

  // 10. Refresh org-entity pages (Phase 1 §b).
  //
  // Auto-detection scans recent meetings for non-internal email domains
  // and writes/updates pages under .arete/memory/entities/orgs/. The
  // scan runs on every meeting apply because:
  //   - Detection threshold (≥2 distinct meetings in 90d) is cheap to
  //     re-evaluate; expensive part is only triggered when an org
  //     newly qualifies.
  //   - Existing pages are byte-equal-skipped when content hasn't
  //     changed.
  // Caller can disable via `options.skipOrgEntities`. No LLM cost; runs
  // independently of `deps.callLLM`.
  let orgsRefreshed: string[] = [];
  if (!options.skipOrgEntities && deps.workspacePaths !== undefined) {
    try {
      const result = await refreshOrgs(deps.workspacePaths, storage, {
        // Pass `today` from the meeting apply so detection windows are
        // deterministic relative to the meeting being processed (not
        // wall-clock at write time).
        today: new Date().toISOString().slice(0, 10),
      });
      orgsRefreshed = result.written;
      for (const w of result.warnings) warnings.push(w);
    } catch (err) {
      warnings.push(
        `org-entity refresh failed (non-fatal): ${err instanceof Error ? err.message : 'unknown'}`,
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
    orgsRefreshed,
    warnings,
  };
}
