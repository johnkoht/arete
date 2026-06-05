/**
 * Shared types for Google Workspace (gws CLI) integrations.
 */

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class GwsNotInstalledError extends Error {
  constructor(message = 'gws CLI binary not found in PATH. Install it to use Google Workspace integrations.') {
    super(message);
    this.name = 'GwsNotInstalledError';
  }
}

export class GwsAuthError extends Error {
  constructor(message = 'gws CLI authentication failed. Run `gws auth login` to authenticate.') {
    super(message);
    this.name = 'GwsAuthError';
  }
}

export class GwsTimeoutError extends Error {
  constructor(command: string, timeoutMs: number) {
    super(`gws command timed out after ${timeoutMs}ms: ${command}`);
    this.name = 'GwsTimeoutError';
  }
}

export class GwsExecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GwsExecError';
  }
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export type GwsDetectionResult = {
  installed: boolean;
  version?: string;
  authenticated?: boolean;
};

// ---------------------------------------------------------------------------
// Exec options & dependency injection
// ---------------------------------------------------------------------------

export type GwsExecOptions = {
  /** Command timeout in milliseconds (default 30000). */
  timeout?: number;
};

export type GwsDeps = {
  exec: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
};

// ---------------------------------------------------------------------------
// Placeholder domain types (Phase 1+)
// ---------------------------------------------------------------------------

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
  // NEW in Phase 11-pre (F4) — additive, optional. Populated when
  // fetchBody=true; emitted in cache only when fetchBody=true (serialization gate).
  to?: string[];
  cc?: string[];
  bcc?: string[];
  body?: string;
  attachments?: { filename: string; mimeType: string; sizeBytes: number }[];
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
  pulledAt: string;          // ISO8601
  daysCovered: number;
  threads: EmailThread[];
  recipientIndex: Record<string, string[]>; // normalized email → thread.id[]
};

/**
 * Current cache envelope version. Bump if EmailThread shape changes.
 */
export const GMAIL_SENT_CACHE_VERSION = 2;

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

// ---------------------------------------------------------------------------
// Provider interfaces (stubs for Phase 1+)
// ---------------------------------------------------------------------------

export interface EmailProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  searchThreads(query: string, options?: { maxResults?: number }): Promise<EmailThread[]>;
  getThread(threadId: string): Promise<EmailThread>;
  getImportantUnread(options?: { maxResults?: number }): Promise<EmailThread[]>;
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
    sinceDate?: string;       // YYYY-MM-DD
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
export function normalizeEmail(raw: string | undefined | null): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed) return '';
  // Match Name <email@domain> form first.
  const angleMatch = trimmed.match(/<([^>]+)>/);
  const candidate = angleMatch ? angleMatch[1] : trimmed;
  const inner = candidate.trim().toLowerCase();
  // Basic shape check — must contain '@' and have non-empty local + domain.
  if (!inner.includes('@')) return '';
  const [local, domain] = inner.split('@');
  if (!local || !domain) return '';
  return inner;
}

export interface DriveProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  search(query: string, options?: { maxResults?: number }): Promise<DriveFile[]>;
  getFile(fileId: string): Promise<DriveFile>;
  getRecentFiles(options?: { maxResults?: number }): Promise<DriveFile[]>;
}

export interface DocsProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  getDoc(docId: string): Promise<DocMetadata>;
  getDocContent(docId: string): Promise<string>;
  getRecentDocs(options?: { maxResults?: number }): Promise<DocMetadata[]>;
}

// ---------------------------------------------------------------------------
// Sheets types (Phase 3)
// ---------------------------------------------------------------------------

export type SheetRange = {
  range: string;
  values: string[][];
};

export interface SheetsProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  getSpreadsheet(spreadsheetId: string): Promise<{ id: string; title: string; sheets: string[] }>;
  getRange(spreadsheetId: string, range: string): Promise<SheetRange>;
}

// ---------------------------------------------------------------------------
// Directory / People types (Phase 3)
// ---------------------------------------------------------------------------

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
  searchDirectory(query: string, options?: { maxResults?: number }): Promise<DirectoryPerson[]>;
}
