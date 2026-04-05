/**
 * Google Workspace integration via gws CLI.
 *
 * Phase 0: detection + generic CLI wrapper.
 * Phase 1+: email, drive, docs providers.
 */

import type { AreteConfig } from '../../models/workspace.js';
import type { StorageAdapter } from '../../storage/adapter.js';

// Barrel exports
export type {
  GwsDetectionResult,
  GwsExecOptions,
  GwsDeps,
  EmailThread,
  DriveFile,
  DocMetadata,
  SheetRange,
  DirectoryPerson,
  EmailProvider,
  DriveProvider,
  DocsProvider,
  SheetsProvider,
  DirectoryProvider,
} from './types.js';

export {
  GwsNotInstalledError,
  GwsAuthError,
  GwsTimeoutError,
  GwsExecError,
} from './types.js';

export { detectGws } from './detection.js';
export { gwsExec } from './client.js';
export { GmailProvider, getGmailProvider } from './gmail.js';
export { GwsDriveProvider, getGwsDriveProvider } from './drive.js';
export { GwsDocsProvider, getGwsDocsProvider } from './docs.js';
export { GwsSheetsProvider, getGwsSheetsProvider } from './sheets.js';
export { GwsDirectoryProvider, getGwsDirectoryProvider } from './people.js';

// ---------------------------------------------------------------------------
// Provider factories
// ---------------------------------------------------------------------------

export async function getEmailProvider(
  config: AreteConfig,
  _storage: StorageAdapter,
  _workspaceRoot: string,
): Promise<import('./types.js').EmailProvider | null> {
  const gwsConfig = config.integrations?.['google-workspace'] as { status?: string } | undefined;
  if (gwsConfig && gwsConfig.status === 'active') {
    const { getGmailProvider } = await import('./gmail.js');
    return getGmailProvider();
  }
  return null;
}

export async function getDriveProvider(
  config: AreteConfig,
  _storage: StorageAdapter,
  _workspaceRoot: string,
): Promise<import('./types.js').DriveProvider | null> {
  const gwsConfig = config.integrations?.['google-workspace'] as { status?: string } | undefined;
  if (gwsConfig && gwsConfig.status === 'active') {
    const { getGwsDriveProvider } = await import('./drive.js');
    return getGwsDriveProvider();
  }
  return null;
}

export async function getDocsProvider(
  config: AreteConfig,
  _storage: StorageAdapter,
  _workspaceRoot: string,
): Promise<import('./types.js').DocsProvider | null> {
  const gwsConfig = config.integrations?.['google-workspace'] as { status?: string } | undefined;
  if (gwsConfig && gwsConfig.status === 'active') {
    const { getGwsDocsProvider } = await import('./docs.js');
    return getGwsDocsProvider();
  }
  return null;
}

export async function getSheetsProvider(
  config: AreteConfig,
  _storage: StorageAdapter,
  _workspaceRoot: string,
): Promise<import('./types.js').SheetsProvider | null> {
  const gwsConfig = config.integrations?.['google-workspace'] as { status?: string } | undefined;
  if (gwsConfig && gwsConfig.status === 'active') {
    const { getGwsSheetsProvider } = await import('./sheets.js');
    return getGwsSheetsProvider();
  }
  return null;
}

export async function getDirectoryProvider(
  config: AreteConfig,
  _storage: StorageAdapter,
  _workspaceRoot: string,
): Promise<import('./types.js').DirectoryProvider | null> {
  const gwsConfig = config.integrations?.['google-workspace'] as { status?: string } | undefined;
  if (gwsConfig && gwsConfig.status === 'active') {
    const { getGwsDirectoryProvider } = await import('./people.js');
    return getGwsDirectoryProvider();
  }
  return null;
}
