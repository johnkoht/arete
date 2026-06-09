/**
 * Shared types for Google Workspace (gws CLI) integrations.
 */
export declare class GwsNotInstalledError extends Error {
    constructor(message?: string);
}
export declare class GwsAuthError extends Error {
    constructor(message?: string);
}
export declare class GwsTimeoutError extends Error {
    constructor(command: string, timeoutMs: number);
}
export declare class GwsExecError extends Error {
    constructor(message: string);
}
export type GwsDetectionResult = {
    installed: boolean;
    version?: string;
    authenticated?: boolean;
};
export type GwsExecOptions = {
    /** Command timeout in milliseconds (default 30000). */
    timeout?: number;
};
export type GwsDeps = {
    exec: (command: string, args: string[]) => Promise<{
        stdout: string;
        stderr: string;
    }>;
};
/**
 * EmailThread — extended in Phase 11-pre (F4) for Sent-folder extraction.
 *
 * The 11-pre additions (`to/cc/bcc/body/attachments/sentAt`) are OPTIONAL
 * to preserve backward compatibility with pre-11-pre callers. They are
 * populated by the Gmail provider's `fetchSent` (and `searchThreads(..., {
 * fetchBody: true })`) modes. When `fetchBody=false`, body+attachments stay
 * absent / empty.
 *
 * `cacheVersion` is a per-thread marker (default 2). Cache readers also
 * verify the envelope `version: 2` field on `GmailSentCache`; v1 (envelope
 * `version` missing OR !== 2) is rejected and refetched.
 */
export type EmailThread = {
    id: string;
    subject: string;
    snippet: string;
    from: string;
    date: string;
    labels: string[];
    unread: boolean;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    body?: string;
    attachments?: {
        filename: string;
        mimeType: string;
        sizeBytes: number;
    }[];
    sentAt?: string;
    cacheVersion?: number;
};
/**
 * Gmail Sent-folder cache envelope (Phase 11-pre, F4).
 *
 * Written to `.arete/cache/gmail-sent-YYYY-MM-DD.json`. Readers reject any
 * envelope where `version !== 2` with a clear error (and invalidate the
 * cache so the next call refetches).
 */
export type GmailSentCache = {
    version: 2;
    pulledAt: string;
    daysCovered: number;
    threads: EmailThread[];
    recipientIndex: Record<string, string[]>;
};
/**
 * Current cache envelope version. Bump if EmailThread shape changes.
 */
export declare const GMAIL_SENT_CACHE_VERSION = 2;
export type DriveFile = {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    owners: string[];
    webViewLink?: string;
};
export type DocMetadata = {
    id: string;
    title: string;
    lastModified: string;
    lastModifiedBy?: string;
    webViewLink?: string;
};
export interface EmailProvider {
    name: string;
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
     * Optional on the interface for backward compatibility with non-Gmail
     * stubs / mocks. Real providers (GmailProvider) implement it.
     *
     * Returns extended EmailThread shape — when `fetchBody=true`, includes
     * `to/cc/body/attachments/sentAt`. When `fetchBody=false` (default),
     * skips body extraction (faster, smaller payload).
     */
    fetchSent?(opts: {
        query?: string;
        sinceDate?: string;
        fetchBody?: boolean;
        limit?: number;
    }): Promise<EmailThread[]>;
}
/**
 * Normalize an email address for indexing/matching (Phase 11-pre, eng MC1).
 *
 * - Strips whitespace.
 * - Extracts the address from `"Name" <email>` form.
 * - Lowercases.
 * - Returns '' for unparseable input.
 */
export declare function normalizeEmail(raw: string | undefined | null): string;
export interface DriveProvider {
    name: string;
    isAvailable(): Promise<boolean>;
    search(query: string, options?: {
        maxResults?: number;
    }): Promise<DriveFile[]>;
    getFile(fileId: string): Promise<DriveFile>;
    getRecentFiles(options?: {
        maxResults?: number;
    }): Promise<DriveFile[]>;
}
export interface DocsProvider {
    name: string;
    isAvailable(): Promise<boolean>;
    getDoc(docId: string): Promise<DocMetadata>;
    getDocContent(docId: string): Promise<string>;
    getRecentDocs(options?: {
        maxResults?: number;
    }): Promise<DocMetadata[]>;
}
export type SheetRange = {
    range: string;
    values: string[][];
};
export interface SheetsProvider {
    name: string;
    isAvailable(): Promise<boolean>;
    getSpreadsheet(spreadsheetId: string): Promise<{
        id: string;
        title: string;
        sheets: string[];
    }>;
    getRange(spreadsheetId: string, range: string): Promise<SheetRange>;
}
export type DirectoryPerson = {
    email: string;
    name: string;
    title?: string;
    department?: string;
    manager?: string;
    photoUrl?: string;
};
export interface DirectoryProvider {
    name: string;
    isAvailable(): Promise<boolean>;
    lookupPerson(email: string): Promise<DirectoryPerson | null>;
    searchDirectory(query: string, options?: {
        maxResults?: number;
    }): Promise<DirectoryPerson[]>;
}
//# sourceMappingURL=types.d.ts.map