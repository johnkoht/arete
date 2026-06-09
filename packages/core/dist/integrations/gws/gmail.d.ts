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
import type { EmailThread, EmailProvider, GwsDeps } from './types.js';
type GmailHeader = {
    name: string;
    value: string;
};
type GmailBody = {
    data?: string;
    size?: number;
    attachmentId?: string;
};
type GmailPayload = {
    headers?: GmailHeader[];
    mimeType?: string;
    filename?: string;
    body?: GmailBody;
    parts?: GmailPayload[];
};
type GmailMessage = {
    id?: string;
    threadId?: string;
    labelIds?: string[];
    snippet?: string;
    internalDate?: string;
    payload?: GmailPayload;
};
/**
 * Split a comma-separated address list header into individual normalized
 * email addresses. Handles "Name <email>" form per RFC 5322 (best-effort).
 *
 * Examples:
 *   "Jane <jane@x.com>, bob@y.com" → ["jane@x.com", "bob@y.com"]
 *   ""                              → []
 */
declare function parseAddressList(headerValue: string): string[];
/**
 * Decode a base64url-encoded body part. Returns '' on failure.
 *
 * Gmail uses RFC 4648 base64url (URL-safe alphabet, no padding) — convert
 * to standard base64 before Buffer.from.
 */
declare function decodeBase64Url(data: string | undefined): string;
/**
 * Walk a MIME tree and extract the best plain-text body.
 *
 * Preference order: text/plain → text/html (HTML stripped to plain).
 * Recursively walks multipart/* containers.
 */
declare function extractBody(payload: GmailPayload | undefined): string;
/**
 * Strip HTML tags + decode common entities. Used as a fallback when
 * text/plain isn't available. Not a full HTML→text converter — adequate
 * for LLM prompt input.
 */
declare function stripHtml(html: string): string;
/**
 * Walk a MIME tree and collect attachment metadata (no payload).
 *
 * An attachment is any part with a non-empty `filename` (per Gmail API
 * convention). Inline images that lack a filename are skipped.
 */
declare function extractAttachments(payload: GmailPayload | undefined): EmailThread['attachments'];
/**
 * Extended mapper for Sent extraction (Phase 11-pre).
 *
 * Adds to/cc/bcc/body/attachments/sentAt/cacheVersion. Body is only
 * populated when `fetchBody=true` (caller controls the format= param).
 */
declare function mapSentMessage(msg: GmailMessage, opts: {
    fetchBody: boolean;
}): EmailThread;
/**
 * Detect whether a thrown error is a Gmail rate-limit (HTTP 429 or quota).
 * Errors from `gwsExec` wrap stderr; we sniff for "429" or "quota" or
 * "rate".
 */
declare function isRateLimitError(err: unknown): boolean;
/**
 * Retry `fn` with exponential backoff on rate-limit errors.
 * Backoff: 250ms, 500ms, 1000ms (max 3 retries). Caller can override.
 */
declare function withRateLimitRetry<T>(fn: () => Promise<T>, opts?: {
    maxRetries?: number;
    baseDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
}): Promise<T>;
export type FetchSentOpts = {
    /** Override the default `in:sent` query (e.g. add `subject:foo`). */
    query?: string;
    /** YYYY-MM-DD — restrict to messages on/after this date. */
    sinceDate?: string;
    /** Decode body + extract attachments. Default false (faster). */
    fetchBody?: boolean;
    /** Max messages to fetch. Default 100. */
    limit?: number;
};
export declare class GmailProvider implements EmailProvider {
    readonly name = "gmail";
    private deps?;
    constructor(deps?: GwsDeps);
    isAvailable(): Promise<boolean>;
    searchThreads(query: string, options?: {
        maxResults?: number;
    }): Promise<EmailThread[]>;
    getThread(threadId: string): Promise<EmailThread>;
    getImportantUnread(options?: {
        maxResults?: number;
    }): Promise<EmailThread[]>;
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
    fetchSent(opts?: FetchSentOpts): Promise<EmailThread[]>;
}
export declare function getGmailProvider(deps?: GwsDeps): GmailProvider;
export declare const __testing__: {
    decodeBase64Url: typeof decodeBase64Url;
    extractBody: typeof extractBody;
    extractAttachments: typeof extractAttachments;
    parseAddressList: typeof parseAddressList;
    mapSentMessage: typeof mapSentMessage;
    isRateLimitError: typeof isRateLimitError;
    withRateLimitRetry: typeof withRateLimitRetry;
    stripHtml: typeof stripHtml;
};
export {};
//# sourceMappingURL=gmail.d.ts.map