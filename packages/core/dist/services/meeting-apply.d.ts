/**
 * Meeting apply service — applies extracted intelligence to meeting files.
 *
 * Writes staged sections and updates frontmatter, but does NOT touch
 * people files or commitments. The separation allows for composable
 * meeting processing pipelines.
 *
 * Used by `arete meeting apply <file>` CLI command.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { MeetingIntelligence } from './meeting-extraction.js';
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
/**
 * Remove all staged sections from meeting body content.
 * Removes: `## Summary`, `## Staged Action Items`, `## Staged Decisions`, `## Staged Learnings`
 * and all content until the next `##` header that is not a staged header.
 */
export declare function clearStagedSections(content: string): string;
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
export declare function applyMeetingIntelligence(meetingPath: string, intelligence: MeetingIntelligence, deps: ApplyMeetingDeps, options?: ApplyMeetingOptions): Promise<ApplyMeetingResult>;
//# sourceMappingURL=meeting-apply.d.ts.map