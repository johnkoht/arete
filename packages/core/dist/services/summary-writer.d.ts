/**
 * SummaryWriter — writes a per-source summary file under
 * `.arete/memory/summaries/<source-type>/<slug>.md`.
 *
 * One unit per primary ingest (per the absorption principle):
 *  - meetings → `.arete/memory/summaries/meetings/<date>-<slug>.md`
 *  - inbox docs → `.arete/memory/summaries/inbox/<doc-id>.md`
 *  - slack threads → `.arete/memory/summaries/slack/<thread-id>.md`
 *
 * Pure helpers (`buildMeetingSummaryPrompt`, `parseMeetingSummaryResponse`,
 * `buildInboxSummaryPrompt`, `parseInboxSummaryResponse`) are exported for
 * unit tests; the service-style entry points (`writeMeetingSummary`,
 * `writeInboxSummary`) own the I/O against `StorageAdapter`.
 *
 * No new abstractions: keeps the same DI shape as
 * `applyMeetingIntelligence` (storage + workspaceRoot + optional LLM).
 *
 * Idempotency: the writer uses `summaryAlreadyFresh` to skip when an
 * existing summary file references the same source content hash. This
 * mirrors topic-memory's `sources_integrated[].hash` pattern. Sentinels
 * are NOT used — the file is fully system-owned (the user edits the
 * source meeting/inbox file, not the derived summary).
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { MeetingSummary, MeetingSummarySections, InboxSummarySections } from '../models/source-summary.js';
import type { LLMCallFn } from '../integrations/conversations/extract.js';
/**
 * Schema version stamped into summary frontmatter. Bump when the section
 * shape or prompt changes meaningfully so a future backfill can be
 * targeted by version, not blanket re-summary.
 */
export declare const SUMMARY_EXTRACTION_VERSION = "1";
export interface MeetingSummaryInput {
    /** Workspace-relative path to the meeting source. */
    sourcePath: string;
    /** YYYY-MM-DD. */
    date: string;
    /** Body of the meeting file (transcript + notes). */
    sourceBody: string;
    area?: string;
    importance?: 'skip' | 'light' | 'standard' | 'heavy';
    topics?: string[];
    participants?: string[];
    /**
     * Side-thread headlines surfaced by wiki-aware extraction
     * (`intelligence.could_include`). The body-block rendering on the
     * meeting source file was removed in Phase 1 wiki expansion; these
     * items are passed through here so the summary's `## FYI` section
     * still picks them up. May be undefined or empty.
     */
    couldInclude?: string[];
}
export interface InboxSummaryInput {
    /** Workspace-relative path to the inbox doc. */
    sourcePath: string;
    /** YYYY-MM-DD. */
    date: string;
    /** Body to summarize. */
    sourceBody: string;
    /** Doc title — used in the prompt to anchor the LLM. */
    title?: string;
    area?: string;
    topics?: string[];
}
export interface WriteSummaryDeps {
    storage: StorageAdapter;
    /** Workspace root — summaries write under `<root>/.arete/memory/...`. */
    workspaceRoot: string;
    /**
     * Optional LLM. When omitted, the writer skips (returns
     * `{ written: false, reason: 'no-llm' }`); it does NOT fall back to a
     * heuristic. Synthesis-quality output is the whole point of the
     * summary file.
     */
    callLLM?: LLMCallFn;
}
export interface WriteSummaryResult {
    /** Absolute path to the summary file (whether written or skipped). */
    summaryPath: string;
    written: boolean;
    /** Why we didn't write — set when `written: false`. */
    reason?: 'no-llm' | 'already-fresh' | 'malformed-llm-response' | 'llm-error';
    /** Set when written or already-fresh; null when no summary file exists. */
    contentHash?: string;
    /** Warnings (non-fatal). */
    warnings: string[];
}
/**
 * Hash a summary's source body for idempotency. Mirrors
 * `hashMeetingSource` in topic-memory: frontmatter changes on the
 * source file (status bumps, attendee fixes) do not bust dedup.
 *
 * Caller passes the body slice they want hashed. For meetings, that
 * should be the meeting body (frontmatter stripped); for inbox docs,
 * the full markdown body is fine since inbox docs are produced by us.
 */
export declare function hashSummarySource(body: string): string;
/**
 * Derive the summary filename for a meeting source. Convention:
 * `<date>-<slug>.md` where `<slug>` is the meeting filename minus the
 * leading date prefix and `.md` extension. Stable across reprocesses.
 */
export declare function summaryPathForMeeting(workspaceRoot: string, input: {
    sourcePath: string;
    date: string;
}): string;
/**
 * Derive the summary filename for an inbox doc. Convention:
 * `<doc-id>.md` where `<doc-id>` is the inbox doc filename minus `.md`.
 * Inbox doc IDs are already date-prefixed by the writer when relevant,
 * so we don't re-prefix here.
 */
export declare function summaryPathForInbox(workspaceRoot: string, input: {
    sourcePath: string;
}): string;
/**
 * Derive the summary filename for a slack thread. Convention:
 * `.arete/memory/summaries/slack/<thread-slug>.md` where thread-slug is
 * a sanitized thread id (channel+ts).
 */
export declare function summaryPathForSlack(workspaceRoot: string, input: {
    threadId: string;
}): string;
/**
 * Returns `true` if a summary file already exists at `summaryPath` and
 * was generated from the same source content (hash match). Caller skips
 * the LLM call when this returns true.
 *
 * Looks up the embedded hash in summary frontmatter
 * (`extraction_version` is bumped if shape changes; `content_hash` is a
 * separate field tracked here).
 */
export declare function summaryAlreadyFresh(storage: StorageAdapter, summaryPath: string, expectedHash: string): Promise<boolean>;
/**
 * Build the meeting summary prompt. Sonnet-tier; designed to produce a
 * post-call-email-quality summary.
 *
 * The prompt enumerates required sections and asks for explicit "no
 * content" sentinels when a section would be empty, so the parser can
 * cleanly omit them.
 */
export declare function buildMeetingSummaryPrompt(input: MeetingSummaryInput): string;
/**
 * Build the inbox-doc summary prompt. Source-agnostic; same shape used
 * for slack threads in Phase 1.5 when `ARETE_SLACK_SUMMARIES=1`.
 */
export declare function buildInboxSummaryPrompt(input: InboxSummaryInput): string;
/**
 * Parse the meeting summary JSON response. Returns null when malformed
 * (caller skips writing — no fallback heuristic; quality is the whole
 * point).
 */
export declare function parseMeetingSummaryResponse(response: string): MeetingSummarySections | null;
export declare function parseInboxSummaryResponse(response: string): InboxSummarySections | null;
/**
 * Write a meeting summary file. Skips silently when no LLM is provided
 * (caller's choice; we don't degrade to heuristic).
 */
export declare function writeMeetingSummary(input: MeetingSummaryInput, deps: WriteSummaryDeps): Promise<WriteSummaryResult>;
export declare function writeInboxSummary(input: InboxSummaryInput, deps: WriteSummaryDeps): Promise<WriteSummaryResult>;
/**
 * Read a meeting summary file if one exists. Returns null when the
 * summary doesn't exist or fails to parse.
 *
 * Used by topic-memory.integrateSource to prefer summary over transcript
 * (with transcript fallback during the backfill window).
 */
export declare function readMeetingSummary(storage: StorageAdapter, workspaceRoot: string, input: {
    sourcePath: string;
    date: string;
}): Promise<MeetingSummary | null>;
export declare function resolveMeetingSourcePath(workspaceRoot: string, sourcePath: string): string;
//# sourceMappingURL=summary-writer.d.ts.map