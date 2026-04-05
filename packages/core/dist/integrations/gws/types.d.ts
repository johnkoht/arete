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
}
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