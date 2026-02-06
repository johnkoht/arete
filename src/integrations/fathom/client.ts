/**
 * Fathom API client (External API v1).
 * @see https://developers.fathom.ai/api-overview
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import {
  FATHOM_API_BASE,
  FATHOM_DEFAULT_DAYS,
} from './config.js';
import type {
  MeetingListResponse,
  FathomMeeting,
  RecordingSummaryResponse,
  RecordingTranscriptResponse,
} from './types.js';

export interface ListMeetingsOptions {
  startDate?: string;
  endDate?: string;
  includeSummary?: boolean;
  includeTranscript?: boolean;
  includeActionItems?: boolean;
  minDurationMinutes?: number;
  excludePatterns?: string[];
}

/**
 * Load Fathom API key from env or workspace .credentials/credentials.yaml
 */
export function loadFathomApiKey(workspaceRoot: string | null): string | null {
  const fromEnv = process.env.FATHOM_API_KEY;
  if (fromEnv?.trim()) return fromEnv.trim();

  if (!workspaceRoot) return null;
  const credPath = join(workspaceRoot, '.credentials', 'credentials.yaml');
  if (!existsSync(credPath)) return null;
  try {
    const content = readFileSync(credPath, 'utf8');
    const creds = parseYaml(content) as Record<string, Record<string, string>>;
    const fathom = creds?.fathom?.api_key;
    return fathom?.trim() ?? null;
  } catch {
    return null;
  }
}

function toIsoDate(dateStr: string): string {
  if (dateStr.includes('T')) return dateStr;
  return `${dateStr}T00:00:00Z`;
}

function toIsoEndDate(dateStr: string): string {
  if (dateStr.includes('T')) return dateStr;
  return `${dateStr}T23:59:59Z`;
}

function meetingDurationMinutes(m: FathomMeeting): number {
  const start = m.recording_start_time || m.scheduled_start_time;
  const end = m.recording_end_time || m.scheduled_end_time;
  if (!start || !end) return 0;
  try {
    const a = new Date(start).getTime();
    const b = new Date(end).getTime();
    return Math.max(0, Math.round((b - a) / 60_000));
  } catch {
    return 0;
  }
}

/**
 * Fathom API client
 */
export class FathomClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = FATHOM_API_BASE) {
    if (!apiKey?.trim()) throw new Error('Fathom API key is required');
    this.apiKey = apiKey.trim();
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    // Path must be relative to baseUrl (no leading /) or URL() resolves from origin
    const pathNorm = path.startsWith('/') ? path.slice(1) : path;
    const url = new URL(`${this.baseUrl}/${pathNorm}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url.toString(), {
      method,
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('Invalid or expired Fathom API key');
      if (res.status === 429) throw new Error('Rate limited by Fathom API. Please wait and retry.');
      throw new Error(`Fathom API error: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  /**
   * List meetings with optional summary/transcript/action items (paginated).
   */
  async listMeetings(options: ListMeetingsOptions = {}): Promise<FathomMeeting[]> {
    const {
      startDate,
      endDate,
      includeSummary = false,
      includeTranscript = false,
      includeActionItems = false,
      minDurationMinutes = 5,
      excludePatterns = [],
    } = options;

    const params: Record<string, string> = {};
    if (startDate) params.created_after = toIsoDate(startDate);
    if (endDate) params.created_before = toIsoEndDate(endDate);
    if (includeSummary) params.include_summary = 'true';
    if (includeTranscript) params.include_transcript = 'true';
    if (includeActionItems) params.include_action_items = 'true';

    const all: FathomMeeting[] = [];
    let cursor: string | null = null;

    do {
      if (cursor) params.cursor = cursor;
      const res = await this.request<MeetingListResponse>('GET', '/meetings', params as Record<string, string>);
      const items = res.items ?? [];
      for (const m of items) {
        const duration = meetingDurationMinutes(m);
        if (duration < minDurationMinutes) continue;
        const title = m.title ?? '';
        if (excludePatterns.some((p) => title.toLowerCase().includes(p.toLowerCase()))) continue;
        all.push(m);
      }
      cursor = res.next_cursor ?? null;
    } while (cursor);

    return all;
  }

  /**
   * Get recording summary (fetch recording endpoint).
   */
  async getRecordingSummary(recordingId: number | string): Promise<RecordingSummaryResponse> {
    return this.request<RecordingSummaryResponse>(
      'GET',
      `/recordings/${encodeURIComponent(String(recordingId))}/summary`
    );
  }

  /**
   * Get recording transcript (fetch recording endpoint).
   */
  async getRecordingTranscript(recordingId: number | string): Promise<RecordingTranscriptResponse> {
    return this.request<RecordingTranscriptResponse>(
      'GET',
      `/recordings/${encodeURIComponent(String(recordingId))}/transcript`
    );
  }

  /**
   * Fetch full recording: list then get summary + transcript for each (uses fetch recording endpoints).
   */
  async fetchRecording(
    recordingId: number | string
  ): Promise<{ summary: string; transcript: string; actionItems: string[] }> {
    const [summaryRes, transcriptRes] = await Promise.all([
      this.getRecordingSummary(recordingId),
      this.getRecordingTranscript(recordingId),
    ]);
    const summary =
      (summaryRes as RecordingSummaryResponse & { summary?: { markdown_formatted?: string } }).summary?.markdown_formatted ??
      (summaryRes as RecordingSummaryResponse & { markdown_formatted?: string }).markdown_formatted ??
      '';
    const segments =
      (transcriptRes.transcript ?? transcriptRes.segments ?? []) as Array<{
        speaker?: { display_name?: string } | string;
        text?: string;
        timestamp?: string;
      }>;
    const transcript = formatTranscript(segments);
    const actionItems: string[] = [];
    return { summary, transcript, actionItems };
  }
}

function formatTranscript(
  segments: Array<{ speaker?: { display_name?: string } | string; text?: string; timestamp?: string }>
): string {
  if (!segments.length) return '';
  return segments
    .map((s) => {
      const speaker =
        typeof s.speaker === 'object' && s.speaker?.display_name
          ? s.speaker.display_name
          : typeof s.speaker === 'string'
            ? s.speaker
            : 'Unknown';
      const text = s.text ?? '';
      const ts = s.timestamp ?? '';
      return ts ? `**[${ts}] ${speaker}**: ${text}` : `**${speaker}**: ${text}`;
    })
    .join('\n\n');
}

export { formatTranscript };
