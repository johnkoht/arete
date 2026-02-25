/**
 * Fathom API client.
 */
import { parse as parseYaml } from 'yaml';
import { FATHOM_API_BASE } from './config.js';
export async function loadFathomApiKey(storage, workspaceRoot) {
    const fromEnv = process.env.FATHOM_API_KEY;
    if (fromEnv?.trim())
        return fromEnv.trim();
    if (!workspaceRoot)
        return null;
    const { join } = await import('path');
    const credPath = join(workspaceRoot, '.credentials', 'credentials.yaml');
    const exists = await storage.exists(credPath);
    if (!exists)
        return null;
    const content = await storage.read(credPath);
    if (!content)
        return null;
    try {
        const creds = parseYaml(content);
        const key = creds?.fathom?.api_key;
        return key?.trim() ?? null;
    }
    catch {
        return null;
    }
}
export class FathomClient {
    apiKey;
    baseUrl;
    constructor(apiKey, baseUrl = FATHOM_API_BASE) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        if (!apiKey?.trim())
            throw new Error('Fathom API key is required');
        this.apiKey = apiKey.trim();
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }
    async request(method, path, params) {
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
            if (res.status === 401)
                throw new Error('Invalid or expired Fathom API key');
            if (res.status === 429)
                throw new Error('Rate limited by Fathom API');
            throw new Error(`Fathom API error: ${res.status} ${res.statusText}`);
        }
        return res.json();
    }
    async listMeetings(options = {}) {
        const { startDate, endDate, includeSummary = false, includeTranscript = false, includeActionItems = false, } = options;
        const params = {};
        if (startDate)
            params.created_after = startDate.includes('T') ? startDate : `${startDate}T00:00:00Z`;
        if (endDate)
            params.created_before = endDate.includes('T') ? endDate : `${endDate}T23:59:59Z`;
        if (includeSummary)
            params.include_summary = 'true';
        if (includeTranscript)
            params.include_transcript = 'true';
        if (includeActionItems)
            params.include_action_items = 'true';
        const all = [];
        let cursor = null;
        do {
            if (cursor)
                params.cursor = cursor;
            const res = await this.request('GET', '/meetings', params);
            for (const m of res.items ?? []) {
                all.push(m);
            }
            cursor = res.next_cursor ?? null;
        } while (cursor);
        return all;
    }
    async fetchRecording(recordingId) {
        const [summaryRes, transcriptRes] = await Promise.all([
            this.request('GET', `/recordings/${encodeURIComponent(String(recordingId))}/summary`),
            this.request('GET', `/recordings/${encodeURIComponent(String(recordingId))}/transcript`),
        ]);
        const summary = summaryRes
            .summary?.markdown_formatted ??
            summaryRes.markdown_formatted ??
            '';
        const segments = (transcriptRes.transcript ?? transcriptRes.segments ?? []);
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
//# sourceMappingURL=client.js.map