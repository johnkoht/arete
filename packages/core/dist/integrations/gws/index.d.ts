/**
 * Google Workspace integration via gws CLI.
 *
 * Phase 0: detection + generic CLI wrapper.
 * Phase 1+: email, drive, docs providers.
 */
import type { AreteConfig } from '../../models/workspace.js';
import type { StorageAdapter } from '../../storage/adapter.js';
export type { GwsDetectionResult, GwsExecOptions, GwsDeps, EmailThread, DriveFile, DocMetadata, SheetRange, DirectoryPerson, EmailProvider, DriveProvider, DocsProvider, SheetsProvider, DirectoryProvider, } from './types.js';
export { GwsNotInstalledError, GwsAuthError, GwsTimeoutError, GwsExecError, } from './types.js';
export { detectGws } from './detection.js';
export { gwsExec } from './client.js';
export { GmailProvider, getGmailProvider } from './gmail.js';
export { GwsDriveProvider, getGwsDriveProvider } from './drive.js';
export { GwsDocsProvider, getGwsDocsProvider } from './docs.js';
export { GwsSheetsProvider, getGwsSheetsProvider } from './sheets.js';
export { GwsDirectoryProvider, getGwsDirectoryProvider } from './people.js';
export declare function getEmailProvider(config: AreteConfig, _storage: StorageAdapter, _workspaceRoot: string): Promise<import('./types.js').EmailProvider | null>;
export declare function getDriveProvider(config: AreteConfig, _storage: StorageAdapter, _workspaceRoot: string): Promise<import('./types.js').DriveProvider | null>;
export declare function getDocsProvider(config: AreteConfig, _storage: StorageAdapter, _workspaceRoot: string): Promise<import('./types.js').DocsProvider | null>;
export declare function getSheetsProvider(config: AreteConfig, _storage: StorageAdapter, _workspaceRoot: string): Promise<import('./types.js').SheetsProvider | null>;
export declare function getDirectoryProvider(config: AreteConfig, _storage: StorageAdapter, _workspaceRoot: string): Promise<import('./types.js').DirectoryProvider | null>;
//# sourceMappingURL=index.d.ts.map