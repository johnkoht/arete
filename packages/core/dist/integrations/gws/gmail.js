/**
 * Gmail provider — thin wrapper over the `gws` CLI for email operations.
 *
 * Gmail API command paths:
 *   gws gmail users messages list --params '{"userId":"me","q":"...","maxResults":N}'
 *   gws gmail users messages get  --params '{"userId":"me","id":"...","format":"metadata","metadataHeaders":["From","Subject","Date"]}'
 *
 * Note: messages.list returns only {id, threadId}. Full metadata requires a
 * separate messages.get call per message (capped at 10 to limit API calls).
 *
 * Phase 11-pre (F4) adds `fetchSent()` for the Sent folder with optional
 * body+attachment extraction, MIME walk, and rate-limit-aware retry.
 */
import { gwsExec } from './client.js';
import { detectGws } from './detection.js';
import { GMAIL_SENT_CACHE_VERSION, normalizeEmail } from './types.js';
function getHeader(payload, name) {
    if (!payload?.headers)
        return '';
    const header = payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
    return header?.value ?? '';
}
/**
 * Split a comma-separated address list header into individual normalized
 * email addresses. Handles "Name <email>" form per RFC 5322 (best-effort).
 *
 * Examples:
 *   "Jane <jane@x.com>, bob@y.com" → ["jane@x.com", "bob@y.com"]
 *   ""                              → []
 */
function parseAddressList(headerValue) {
    if (!headerValue)
        return [];
    // Naive comma-split — does NOT handle quoted commas inside display names
    // (rare in practice and acceptable for this surface). For robustness we
    // could pull in `email-addresses` later if it becomes a problem.
    return headerValue
        .split(',')
        .map((s) => normalizeEmail(s))
        .filter((s) => s.length > 0);
}
/**
 * Decode a base64url-encoded body part. Returns '' on failure.
 *
 * Gmail uses RFC 4648 base64url (URL-safe alphabet, no padding) — convert
 * to standard base64 before Buffer.from.
 */
function decodeBase64Url(data) {
    if (!data)
        return '';
    try {
        const std = data.replace(/-/g, '+').replace(/_/g, '/');
        // Pad to multiple of 4.
        const padded = std + '='.repeat((4 - (std.length % 4)) % 4);
        return Buffer.from(padded, 'base64').toString('utf8');
    }
    catch {
        return '';
    }
}
/**
 * Walk a MIME tree and extract the best plain-text body.
 *
 * Preference order: text/plain → text/html (HTML stripped to plain).
 * Recursively walks multipart/* containers.
 */
function extractBody(payload) {
    if (!payload)
        return '';
    // Single-part message.
    if (!payload.parts || payload.parts.length === 0) {
        if (payload.mimeType?.startsWith('text/plain')) {
            return decodeBase64Url(payload.body?.data);
        }
        if (payload.mimeType?.startsWith('text/html')) {
            return stripHtml(decodeBase64Url(payload.body?.data));
        }
        return '';
    }
    // Multipart — prefer text/plain at any depth.
    const plain = findPart(payload, (p) => p.mimeType?.startsWith('text/plain') === true);
    if (plain && plain.body?.data)
        return decodeBase64Url(plain.body.data);
    const html = findPart(payload, (p) => p.mimeType?.startsWith('text/html') === true);
    if (html && html.body?.data)
        return stripHtml(decodeBase64Url(html.body.data));
    return '';
}
function findPart(payload, predicate) {
    if (predicate(payload))
        return payload;
    for (const part of payload.parts ?? []) {
        const match = findPart(part, predicate);
        if (match)
            return match;
    }
    return null;
}
/**
 * Strip HTML tags + decode common entities. Used as a fallback when
 * text/plain isn't available. Not a full HTML→text converter — adequate
 * for LLM prompt input.
 */
function stripHtml(html) {
    if (!html)
        return '';
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * Walk a MIME tree and collect attachment metadata (no payload).
 *
 * An attachment is any part with a non-empty `filename` (per Gmail API
 * convention). Inline images that lack a filename are skipped.
 */
function extractAttachments(payload) {
    if (!payload)
        return [];
    const out = [];
    walk(payload);
    return out;
    function walk(p) {
        if (p.filename && p.filename.length > 0) {
            out.push({
                filename: p.filename,
                mimeType: p.mimeType ?? 'application/octet-stream',
                sizeBytes: p.body?.size ?? 0,
            });
        }
        for (const child of p.parts ?? [])
            walk(child);
    }
}
/**
 * Base mapper — used by both list/searchThreads (metadata only) and
 * the extended Sent extraction path.
 */
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
/**
 * Extended mapper for Sent extraction (Phase 11-pre).
 *
 * Adds to/cc/bcc/body/attachments/sentAt/cacheVersion. Body is only
 * populated when `fetchBody=true` (caller controls the format= param).
 */
function mapSentMessage(msg, opts) {
    const base = mapMessage(msg);
    const to = parseAddressList(getHeader(msg.payload, 'To'));
    const cc = parseAddressList(getHeader(msg.payload, 'Cc'));
    const bcc = parseAddressList(getHeader(msg.payload, 'Bcc'));
    // sentAt: prefer internalDate (epoch ms string) over the Date header
    // because internalDate is normalized to UTC by Gmail.
    let sentAt;
    if (msg.internalDate) {
        const ms = Number(msg.internalDate);
        if (Number.isFinite(ms) && ms > 0) {
            sentAt = new Date(ms).toISOString();
        }
    }
    if (!sentAt) {
        const dateHeader = base.date;
        if (dateHeader) {
            const parsed = new Date(dateHeader);
            if (!Number.isNaN(parsed.getTime())) {
                sentAt = parsed.toISOString();
            }
        }
    }
    const extended = {
        ...base,
        to,
        cc,
        bcc,
        attachments: extractAttachments(msg.payload),
        sentAt,
        cacheVersion: GMAIL_SENT_CACHE_VERSION,
    };
    if (opts.fetchBody) {
        extended.body = extractBody(msg.payload);
    }
    return extended;
}
// ---------------------------------------------------------------------------
// Rate-limit retry helper (F4 — backoff on 429)
// ---------------------------------------------------------------------------
/**
 * Detect whether a thrown error is a Gmail rate-limit (HTTP 429 or quota).
 * Errors from `gwsExec` wrap stderr; we sniff for "429" or "quota" or
 * "rate".
 */
function isRateLimitError(err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    return (lower.includes('429') ||
        lower.includes('rate limit') ||
        lower.includes('rate-limit') ||
        lower.includes('quota') ||
        lower.includes('userratelimitexceeded'));
}
/**
 * Retry `fn` with exponential backoff on rate-limit errors.
 * Backoff: 250ms, 500ms, 1000ms (max 3 retries). Caller can override.
 */
async function withRateLimitRetry(fn, opts = {}) {
    const maxRetries = opts.maxRetries ?? 3;
    const baseDelay = opts.baseDelayMs ?? 250;
    const sleep = opts.sleep ??
        ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            return await fn();
        }
        catch (err) {
            if (!isRateLimitError(err) || attempt >= maxRetries)
                throw err;
            const delay = baseDelay * Math.pow(2, attempt);
            await sleep(delay);
            attempt++;
        }
    }
}
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
    /**
     * Fetch Sent-folder messages (Phase 11-pre, F4).
     *
     * Builds a query of `in:sent[ after:YYYY/MM/DD][ <user-query>]`. Lists
     * message IDs, then fetches per-message detail in parallel with
     * `format: full` (when fetchBody=true) or `metadata` (otherwise).
     *
     * Returns extended EmailThread shape with to/cc/body/attachments/sentAt.
     * Rate-limit aware: 429 / "quota" responses trigger exponential backoff
     * via `withRateLimitRetry`.
     */
    async fetchSent(opts = {}) {
        const fetchBody = opts.fetchBody ?? false;
        const limit = opts.limit ?? 100;
        // Build the Gmail search query.
        let q = 'in:sent';
        if (opts.sinceDate) {
            // Convert YYYY-MM-DD → YYYY/MM/DD for Gmail's `after:` operator.
            const after = opts.sinceDate.replace(/-/g, '/');
            q += ` after:${after}`;
        }
        if (opts.query && opts.query.trim().length > 0) {
            q += ` ${opts.query.trim()}`;
        }
        // List call — with rate-limit retry.
        const listRaw = await withRateLimitRetry(() => gwsExec('gmail', 'users messages list', { userId: 'me', q, maxResults: limit }, undefined, this.deps));
        const listResponse = listRaw;
        const ids = (listResponse.messages ?? [])
            .map((m) => m.id)
            .filter(Boolean)
            .slice(0, limit);
        if (ids.length === 0)
            return [];
        // Per-message detail, parallel — each call wrapped in retry.
        const format = fetchBody ? 'full' : 'metadata';
        const params = (id) => fetchBody
            ? { userId: 'me', id, format }
            : {
                userId: 'me',
                id,
                format,
                metadataHeaders: ['From', 'To', 'Cc', 'Bcc', 'Subject', 'Date'],
            };
        const detailResults = await Promise.all(ids.map((id) => withRateLimitRetry(() => gwsExec('gmail', 'users messages get', params(id), undefined, this.deps)).catch(() => null)));
        return detailResults
            .filter((m) => m !== null && typeof m === 'object')
            .map((m) => mapSentMessage(m, { fetchBody }));
    }
}
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function getGmailProvider(deps) {
    return new GmailProvider(deps);
}
// ---------------------------------------------------------------------------
// Exports for testability
// ---------------------------------------------------------------------------
export const __testing__ = {
    decodeBase64Url,
    extractBody,
    extractAttachments,
    parseAddressList,
    mapSentMessage,
    isRateLimitError,
    withRateLimitRetry,
    stripHtml,
};
//# sourceMappingURL=gmail.js.map