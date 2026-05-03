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

import { join, dirname, basename, resolve as pathResolve, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import type { StorageAdapter } from '../storage/adapter.js';
import type {
  MeetingSummary,
  InboxSummary,
  MeetingSummarySections,
  InboxSummarySections,
  SourceSummaryFrontmatter,
  MeetingSectionName,
  InboxSectionName,
} from '../models/source-summary.js';
import {
  renderSourceSummary,
  parseSourceSummary,
  MEETING_SECTION_NAMES,
  INBOX_SECTION_NAMES,
} from '../models/source-summary.js';
import type { LLMCallFn } from '../integrations/conversations/extract.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Schema version stamped into summary frontmatter. Bump when the section
 * shape or prompt changes meaningfully so a future backfill can be
 * targeted by version, not blanket re-summary.
 */
export const SUMMARY_EXTRACTION_VERSION = '1';

const SUMMARIES_DIR = 'summaries';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Body hash for idempotency
// ---------------------------------------------------------------------------

/**
 * Hash a summary's source body for idempotency. Mirrors
 * `hashMeetingSource` in topic-memory: frontmatter changes on the
 * source file (status bumps, attendee fixes) do not bust dedup.
 *
 * Caller passes the body slice they want hashed. For meetings, that
 * should be the meeting body (frontmatter stripped); for inbox docs,
 * the full markdown body is fine since inbox docs are produced by us.
 */
export function hashSummarySource(body: string): string {
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Path derivation
// ---------------------------------------------------------------------------

/**
 * Derive the summary filename for a meeting source. Convention:
 * `<date>-<slug>.md` where `<slug>` is the meeting filename minus the
 * leading date prefix and `.md` extension. Stable across reprocesses.
 */
export function summaryPathForMeeting(workspaceRoot: string, input: { sourcePath: string; date: string }): string {
  const base = basename(input.sourcePath).replace(/\.md$/i, '');
  // Strip leading YYYY-MM-DD- if present so we don't double-prefix.
  const slug = base.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  const fileName = `${input.date}-${slug}.md`;
  return join(workspaceRoot, '.arete', 'memory', SUMMARIES_DIR, 'meetings', fileName);
}

/**
 * Derive the summary filename for an inbox doc. Convention:
 * `<doc-id>.md` where `<doc-id>` is the inbox doc filename minus `.md`.
 * Inbox doc IDs are already date-prefixed by the writer when relevant,
 * so we don't re-prefix here.
 */
export function summaryPathForInbox(workspaceRoot: string, input: { sourcePath: string }): string {
  const base = basename(input.sourcePath).replace(/\.md$/i, '');
  return join(workspaceRoot, '.arete', 'memory', SUMMARIES_DIR, 'inbox', `${base}.md`);
}

// ---------------------------------------------------------------------------
// Idempotency check
// ---------------------------------------------------------------------------

/**
 * Returns `true` if a summary file already exists at `summaryPath` and
 * was generated from the same source content (hash match). Caller skips
 * the LLM call when this returns true.
 *
 * Looks up the embedded hash in summary frontmatter
 * (`extraction_version` is bumped if shape changes; `content_hash` is a
 * separate field tracked here).
 */
export async function summaryAlreadyFresh(
  storage: StorageAdapter,
  summaryPath: string,
  expectedHash: string,
): Promise<boolean> {
  const existing = await storage.read(summaryPath);
  if (existing === null) return false;
  // Use a quick regex rather than full parse — content_hash lives in
  // frontmatter and cheap-grepping is enough for idempotency.
  const m = existing.match(/^content_hash:\s*['"]?([a-f0-9]+)['"]?\s*$/m);
  if (!m) return false;
  return m[1] === expectedHash;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

/**
 * Build the meeting summary prompt. Sonnet-tier; designed to produce a
 * post-call-email-quality summary.
 *
 * The prompt enumerates required sections and asks for explicit "no
 * content" sentinels when a section would be empty, so the parser can
 * cleanly omit them.
 */
export function buildMeetingSummaryPrompt(input: MeetingSummaryInput): string {
  const participants =
    input.participants && input.participants.length > 0
      ? input.participants.join(', ')
      : '(participants not specified)';
  const topics =
    input.topics && input.topics.length > 0 ? input.topics.join(', ') : '(no topic tags yet)';
  const area = input.area ?? '(no area)';

  return `You are summarizing a meeting for John, the participant. Produce a post-call-email-quality summary that John would send to attendees explaining what happened, what was decided, what's next.

MEETING METADATA:
  Date: ${input.date}
  Participants: ${participants}
  Area: ${area}
  Topics (tagged): ${topics}

MEETING CONTENT:
${input.sourceBody}

Return ONLY a JSON object with this exact shape (no markdown fences, no prose outside JSON):

{
  "What happened": "string — narrative of the meeting in 3–6 sentences. State the purpose, the throughline, and the outcome at a high level.",
  "What was decided": "string — bulleted list (markdown) of decisions made. Use [[topic-slug]] wikilinks where relevant. Empty string if no decisions.",
  "What's next": "string — bulleted list of action items + commitments with owners (e.g., '- John: schedule pilot kickoff by Thursday'). Empty string if no next steps.",
  "Open questions": "string — bulleted list of questions raised but not resolved. Empty string if none.",
  "FYI": "string — bulleted list of context-only items worth knowing but not actionable. Empty string if none.",
  "Things mentioned but not actioned": "string — bulleted list of references/mentions that are not action items, e.g., a project John brought up but didn't drive. Empty string if none."
}

Constraints:
- Each value MUST be a string. Use empty string ("") for sections with no content; do NOT omit keys.
- No section body may contain raw '---' (would break frontmatter on next parse).
- Each section body must be under 4000 characters.
- Do not invent attendees, decisions, or commitments not in the source.
- Prefer concise synthesis over verbatim quoting.`;
}

/**
 * Build the inbox-doc summary prompt. Source-agnostic; same shape used
 * for slack threads in Phase 1.5 when `ARETE_SLACK_SUMMARIES=1`.
 */
export function buildInboxSummaryPrompt(input: InboxSummaryInput): string {
  const title = input.title ?? '(untitled)';
  const topics =
    input.topics && input.topics.length > 0 ? input.topics.join(', ') : '(no topics)';
  const area = input.area ?? '(no area)';

  return `You are summarizing an inbox document for John. Produce a curated TL;DR + key points + relevance + followups.

DOCUMENT METADATA:
  Title: ${title}
  Date: ${input.date}
  Area: ${area}
  Topics: ${topics}

DOCUMENT CONTENT:
${input.sourceBody}

Return ONLY a JSON object with this exact shape (no markdown fences, no prose outside JSON):

{
  "Summary": "string — one-paragraph TL;DR. Empty string if document is too short to merit a summary.",
  "Key points": "string — bulleted list of highlights. Empty string if none.",
  "What's relevant": "string — connection to existing topics/people/orgs. Use [[wikilinks]] where applicable. Empty string if none.",
  "Followups": "string — bulleted list of anything actionable. Empty string if none."
}

Constraints:
- Each value MUST be a string. Empty string for absent sections; do NOT omit keys.
- No section body may contain raw '---'.
- Each section body must be under 3000 characters.
- Do not invent facts not in the source.`;
}

// ---------------------------------------------------------------------------
// LLM response parsing
// ---------------------------------------------------------------------------

/**
 * Parse the meeting summary JSON response. Returns null when malformed
 * (caller skips writing — no fallback heuristic; quality is the whole
 * point).
 */
export function parseMeetingSummaryResponse(response: string): MeetingSummarySections | null {
  return parseSummaryJson(response, MEETING_SECTION_NAMES) as MeetingSummarySections | null;
}

export function parseInboxSummaryResponse(response: string): InboxSummarySections | null {
  return parseSummaryJson(response, INBOX_SECTION_NAMES) as InboxSummarySections | null;
}

function parseSummaryJson(
  response: string,
  recognized: readonly string[],
): Partial<Record<string, string>> | null {
  const cleaned = response.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const rec = parsed as Record<string, unknown>;

  const out: Partial<Record<string, string>> = {};
  let any = false;
  for (const key of recognized) {
    const v = rec[key];
    if (typeof v !== 'string') continue;
    // Frontmatter-injection guard: reject any value that contains a
    // raw '---' on its own line (would break parsing on next read).
    if (/(^|\n)\s*---\s*(\n|$)/.test(v)) continue;
    if (v.length > 8000) continue;
    if (v.trim().length === 0) continue;
    out[key] = v.trim();
    any = true;
  }
  return any ? out : null;
}

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

/**
 * Stamp content_hash + extraction_version into the rendered summary
 * frontmatter so future runs can detect "already fresh".
 *
 * We add `content_hash` directly to the file content rather than the
 * model's frontmatter type so the model stays focused on user-visible
 * fields. The hash is operational metadata.
 */
function stampHashAndVersion(rendered: string, contentHash: string): string {
  const fmMatch = rendered.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    // Defensive: shouldn't happen. Return as-is.
    return rendered;
  }
  const fmBody = fmMatch[1];
  const rest = fmMatch[2];
  // Append content_hash + extraction_version; we don't deduplicate
  // because the renderer doesn't write these keys today.
  const stamped = `${fmBody}\ncontent_hash: '${contentHash}'\nextraction_version: '${SUMMARY_EXTRACTION_VERSION}'`;
  return `---\n${stamped}\n---\n${rest}`;
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

/**
 * Write a meeting summary file. Skips silently when no LLM is provided
 * (caller's choice; we don't degrade to heuristic).
 */
export async function writeMeetingSummary(
  input: MeetingSummaryInput,
  deps: WriteSummaryDeps,
): Promise<WriteSummaryResult> {
  const warnings: string[] = [];
  const summaryPath = summaryPathForMeeting(deps.workspaceRoot, input);
  const contentHash = hashSummarySource(input.sourceBody);

  if (await summaryAlreadyFresh(deps.storage, summaryPath, contentHash)) {
    return { summaryPath, written: false, reason: 'already-fresh', contentHash, warnings };
  }

  if (!deps.callLLM) {
    return { summaryPath, written: false, reason: 'no-llm', warnings };
  }

  const prompt = buildMeetingSummaryPrompt(input);
  let response: string;
  try {
    response = await deps.callLLM(prompt);
  } catch (err) {
    warnings.push(`summary LLM failed: ${err instanceof Error ? err.message : 'unknown'}`);
    return { summaryPath, written: false, reason: 'llm-error', warnings };
  }

  const sections = parseMeetingSummaryResponse(response);
  if (sections === null) {
    warnings.push('summary LLM returned malformed JSON; skipping write');
    return { summaryPath, written: false, reason: 'malformed-llm-response', warnings };
  }

  const summary: MeetingSummary = {
    frontmatter: buildMeetingFrontmatter(input),
    sections,
  };
  const rendered = renderSourceSummary(summary);
  const stamped = stampHashAndVersion(rendered, contentHash);

  await deps.storage.mkdir(dirname(summaryPath));
  await deps.storage.write(summaryPath, stamped);

  return { summaryPath, written: true, contentHash, warnings };
}

export async function writeInboxSummary(
  input: InboxSummaryInput,
  deps: WriteSummaryDeps,
): Promise<WriteSummaryResult> {
  const warnings: string[] = [];
  const summaryPath = summaryPathForInbox(deps.workspaceRoot, input);
  const contentHash = hashSummarySource(input.sourceBody);

  if (await summaryAlreadyFresh(deps.storage, summaryPath, contentHash)) {
    return { summaryPath, written: false, reason: 'already-fresh', contentHash, warnings };
  }

  if (!deps.callLLM) {
    return { summaryPath, written: false, reason: 'no-llm', warnings };
  }

  const prompt = buildInboxSummaryPrompt(input);
  let response: string;
  try {
    response = await deps.callLLM(prompt);
  } catch (err) {
    warnings.push(`summary LLM failed: ${err instanceof Error ? err.message : 'unknown'}`);
    return { summaryPath, written: false, reason: 'llm-error', warnings };
  }

  const sections = parseInboxSummaryResponse(response);
  if (sections === null) {
    warnings.push('summary LLM returned malformed JSON; skipping write');
    return { summaryPath, written: false, reason: 'malformed-llm-response', warnings };
  }

  const summary: InboxSummary = {
    frontmatter: buildInboxFrontmatter(input),
    sections,
  };
  const rendered = renderSourceSummary(summary);
  const stamped = stampHashAndVersion(rendered, contentHash);

  await deps.storage.mkdir(dirname(summaryPath));
  await deps.storage.write(summaryPath, stamped);

  return { summaryPath, written: true, contentHash, warnings };
}

// ---------------------------------------------------------------------------
// Reader (used by topic integration in Step 3)
// ---------------------------------------------------------------------------

/**
 * Read a meeting summary file if one exists. Returns null when the
 * summary doesn't exist or fails to parse.
 *
 * Used by topic-memory.integrateSource to prefer summary over transcript
 * (with transcript fallback during the backfill window).
 */
export async function readMeetingSummary(
  storage: StorageAdapter,
  workspaceRoot: string,
  input: { sourcePath: string; date: string },
): Promise<MeetingSummary | null> {
  const summaryPath = summaryPathForMeeting(workspaceRoot, input);
  const content = await storage.read(summaryPath);
  if (content === null) return null;
  const parsed = parseSourceSummary(content);
  if (parsed === null) return null;
  if (parsed.frontmatter.source_type !== 'meeting') return null;
  return parsed as MeetingSummary;
}

// ---------------------------------------------------------------------------
// Frontmatter builders
// ---------------------------------------------------------------------------

function buildMeetingFrontmatter(input: MeetingSummaryInput): MeetingSummary['frontmatter'] {
  const fm: SourceSummaryFrontmatter = {
    source_path: toWorkspaceRelative(input.sourcePath),
    source_type: 'meeting',
    date: input.date,
  };
  if (input.area !== undefined) fm.area = input.area;
  if (input.importance !== undefined) fm.importance = input.importance;
  if (input.topics !== undefined && input.topics.length > 0) fm.topics = input.topics;
  if (input.participants !== undefined && input.participants.length > 0) {
    fm.participants = input.participants;
  }
  return fm as MeetingSummary['frontmatter'];
}

function buildInboxFrontmatter(input: InboxSummaryInput): InboxSummary['frontmatter'] {
  const fm: SourceSummaryFrontmatter = {
    source_path: toWorkspaceRelative(input.sourcePath),
    source_type: 'inbox',
    date: input.date,
  };
  if (input.area !== undefined) fm.area = input.area;
  if (input.topics !== undefined && input.topics.length > 0) fm.topics = input.topics;
  return fm as InboxSummary['frontmatter'];
}

/**
 * Normalize a path to workspace-relative for storage in summary
 * frontmatter. Absolute paths are stripped of the workspace prefix
 * when possible; otherwise stored as-is.
 */
function toWorkspaceRelative(path: string): string {
  // We don't have workspaceRoot here; the caller passes the path
  // already in the form they want stored. Just normalize separators
  // and pass through.
  return path.replace(/\\/g, '/');
}

// Re-export the absolute-path resolver for callers that need it.
export function resolveMeetingSourcePath(workspaceRoot: string, sourcePath: string): string {
  return isAbsolute(sourcePath) ? sourcePath : pathResolve(workspaceRoot, sourcePath);
}
