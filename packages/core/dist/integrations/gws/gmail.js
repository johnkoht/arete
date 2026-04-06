/**
 * Gmail provider — thin wrapper over the `gws` CLI for email operations.
 *
 * Gmail API command paths:
 *   gws gmail users messages list --params '{"userId":"me","q":"...","maxResults":N}'
 *   gws gmail users messages get  --params '{"userId":"me","id":"...","format":"metadata","metadataHeaders":["From","Subject","Date"]}'
 *
 * Note: messages.list returns only {id, threadId}. Full metadata requires a
 * separate messages.get call per message (capped at 10 to limit API calls).
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
        // Step 1: List message IDs
        const listRaw = await gwsExec('gmail', 'users messages list', { userId: 'me', q: query, maxResults }, undefined, this.deps);
        const listResponse = listRaw;
        const messageIds = (listResponse.messages ?? [])
            .map((m) => m.id)
            .filter(Boolean)
            .slice(0, 10); // cap detail fetches to limit API calls
        if (messageIds.length === 0)
            return [];
        // Step 2: Fetch metadata for each message in parallel
        const messageResults = await Promise.all(messageIds.map((id) => gwsExec('gmail', 'users messages get', { userId: 'me', id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] }, undefined, this.deps).catch(() => null)));
        return messageResults
            .filter((m) => m !== null && typeof m === 'object')
            .map(mapMessage);
    }
    async getThread(threadId) {
        const raw = await gwsExec('gmail', 'users messages get', { userId: 'me', id: threadId, format: 'full' }, undefined, this.deps);
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