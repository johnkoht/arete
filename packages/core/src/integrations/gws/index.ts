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

// ---------------------------------------------------------------------------
// Provider factories (Phase 1+ — return null for now)
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getDriveProvider(
  _config: AreteConfig,
  _storage: StorageAdapter,
  _workspaceRoot: string,
): Promise<import('./types.js').DriveProvider | null> {
  return null; // Phase 2
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getDocsProvider(
  _config: AreteConfig,
  _storage: StorageAdapter,
  _workspaceRoot: string,
): Promise<import('./types.js').DocsProvider | null> {
  return null; // Phase 2
}
