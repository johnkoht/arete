/**
 * Gmail provider — thin wrapper over the `gws` CLI for email operations.
 *
 * Implements `EmailProvider` interface using `gwsExec()` for CLI calls
 * and `detectGws()` for availability checks.
 */
import { gwsExec } from './client.js';
import { detectGws } from './detection.js';
function getHeader(payload, name) {
    if (!payload?.headers)
        return '';
    const header = payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
    return header?.value ?? '';
}
function mapMessage(msg) {
    const labels = msg.labelIds ?? [];
    return {
        id: msg.id ?? msg.threadId ?? '',
        subject: getHeader(msg.payload, 'Subject'),
        snippet: msg.snippet ?? '',
        from: getHeader(msg.payload, 'From'),
        date: getHeader(msg.payload, 'Date'),
        labels,
        unread: labels.includes('UNREAD'),
    };
}
// ---------------------------------------------------------------------------
// GmailProvider class
// ---------------------------------------------------------------------------
export class GmailProvider {
    name = 'gmail';
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async isAvailable() {
        try {
            const result = await detectGws(this.deps);
            return result.installed && result.authenticated !== false;
        }
        catch {
            return false;
        }
    }
    async searchThreads(query, options) {
        const maxResults = options?.maxResults ?? 20;
        const raw = await gwsExec('gmail', 'messages', { q: query, maxResults }, undefined, this.deps);
        // Defensive: handle various response shapes
        const response = raw;
        if (Array.isArray(response)) {
            return response.map(mapMessage);
        }
        if (response && typeof response === 'object' && 'messages' in response) {
            return (response.messages ?? []).map(mapMessage);
        }
        // Single message or unrecognized shape
        if (response && typeof response === 'object' && ('id' in response || 'threadId' in response)) {
            return [mapMessage(response)];
        }
        return [];
    }
    async getThread(threadId) {
        const raw = await gwsExec('gmail', 'messages', { id: threadId }, undefined, this.deps);
        return mapMessage(raw);
    }
    async getImportantUnread(options) {
        return this.searchThreads('is:important is:unread -category:promotions -category:social', options);
    }
}
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function getGmailProvider(deps) {
    return new GmailProvider(deps);
}
//# sourceMappingURL=gmail.js.map