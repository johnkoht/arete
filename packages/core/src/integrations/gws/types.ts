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

export type EmailThread = {
  id: string;
  subject: string;
  snippet: string;
  from: string;
  date: string;
  labels: string[];
  unread: boolean;
};

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
  getRecentDocs(options?: { maxResults?: number }): Promise<DocMetadata[]>;
}
