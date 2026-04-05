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
  EmailProvider,
  DriveProvider,
  DocsProvider,
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
