/**
 * Fathom API client.
 */

import { parse as parseYaml } from 'yaml';
import type { StorageAdapter } from '../../storage/adapter.js';
import { FATHOM_API_BASE } from './config.js';
import type {
  FathomMeeting,
  TranscriptSegment,
  RecordingSummaryResponse,
  RecordingTranscriptResponse,
} from './types.js';

export async function loadFathomApiKey(
  storage: StorageAdapter,
  workspaceRoot: string | null
): Promise<string | null> {
  const fromEnv = process.env.FATHOM_API_KEY;
  if (fromEnv?.trim()) return fromEnv.trim();
  if (!workspaceRoot) return null;

  const { join } = await import('path');
  const credPath = join(workspaceRoot, '.credentials', 'credentials.yaml');
  const exists = await storage.exists(credPath);
  if (!exists) return null;

  const content = await storage.read(credPath);
  if (!content) return null;
  try {
    const creds = parseYaml(content) as Record<string, Record<string, string>>;
    const key = creds?.fathom?.api_key;
    return key?.trim() ?? null;
  } catch {
    return null;
  }
}

export interface ListMeetingsOptions {
  startDate?: string;
  endDate?: string;
  includeSummary?: boolean;
  includeTranscript?: boolean;
  includeActionItems?: boolean;
}

export class FathomClient {
  constructor(
    private apiKey: string,
    private baseUrl: string = FATHOM_API_BASE
  ) {
    if (!apiKey?.trim()) throw new Error('Fathom API key is required');
    this.apiKey = apiKey.trim();
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    const pathNorm = path.startsWith('/') ? path.slice(1) : path;
    const url = new URL(`${this.baseUrl}/${pathNorm}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v));
        }
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
      if (res.status === 429) throw new Error('Rate limited by Fathom API');
      throw new Error(`Fathom API error: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async listMeetings(options: ListMeetingsOptions = {}): Promise<FathomMeeting[]> {
    const {
      startDate,
      endDate,
      includeSummary = false,
      includeTranscript = false,
      includeActionItems = false,
    } = options;

    const params: Record<string, string> = {};
    if (startDate) params.created_after = startDate.includes('T') ? startDate : `${startDate}T00:00:00Z`;
    if (endDate) params.created_before = endDate.includes('T') ? endDate : `${endDate}T23:59:59Z`;
    if (includeSummary) params.include_summary = 'true';
    if (includeTranscript) params.include_transcript = 'true';
    if (includeActionItems) params.include_action_items = 'true';

    const all: FathomMeeting[] = [];
    let cursor: string | null = null;

    do {
      if (cursor) params.cursor = cursor;
      const res = await this.request<{ items?: FathomMeeting[]; next_cursor?: string }>(
        'GET',
        '/meetings',
        params as Record<string, string>
      );
      for (const m of res.items ?? []) {
        all.push(m);
      }
      cursor = res.next_cursor ?? null;
    } while (cursor);

    return all;
  }

  async fetchRecording(
    recordingId: number | string
  ): Promise<{ summary: string; transcript: string; actionItems: string[] }> {
    const [summaryRes, transcriptRes] = await Promise.all([
      this.request<RecordingSummaryResponse>(
        'GET',
        `/recordings/${encodeURIComponent(String(recordingId))}/summary`
      ),
      this.request<RecordingTranscriptResponse>(
        'GET',
        `/recordings/${encodeURIComponent(String(recordingId))}/transcript`
      ),
    ]);
    const summary =
      (summaryRes as RecordingSummaryResponse & { summary?: { markdown_formatted?: string } })
        .summary?.markdown_formatted ??
      (summaryRes as RecordingSummaryResponse & { markdown_formatted?: string }).markdown_formatted ??
      '';
    const segments =
      (transcriptRes.transcript ?? transcriptRes.segments ?? []) as TranscriptSegment[];
    const transcript = segments
      .map((s) => {
        const speaker = s.speaker?.display_name ?? 'Unknown';
        const text = s.text ?? '';
        const ts = s.timestamp ?? '';
        return ts ? `**[${ts}] ${speaker}**: ${text}` : `**${speaker}**: ${text}`;
      })
      .join('\n\n');
    return { summary, transcript, actionItems: [] };
  }
}
