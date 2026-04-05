/**
 * Drive provider — thin wrapper over the `gws` CLI for Google Drive operations.
 *
 * Implements `DriveProvider` interface using `gwsExec()` for CLI calls
 * and `detectGws()` for availability checks.
 */

import { gwsExec } from './client.js';
import { detectGws } from './detection.js';
import type { DriveFile, DriveProvider, GwsDeps } from './types.js';

// ---------------------------------------------------------------------------
// Response mapping helpers
// ---------------------------------------------------------------------------

type DriveFileRaw = {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  owners?: Array<{ emailAddress?: string; displayName?: string }> | string[];
  webViewLink?: string;
};

type DriveListResponse = {
  files?: DriveFileRaw[];
};

function mapDriveFile(raw: DriveFileRaw): DriveFile {
  const owners: string[] = [];
  if (Array.isArray(raw.owners)) {
    for (const owner of raw.owners) {
      if (typeof owner === 'string') {
        owners.push(owner);
      } else if (owner && typeof owner === 'object') {
        owners.push(owner.emailAddress ?? owner.displayName ?? 'unknown');
      }
    }
  }

  return {
    id: raw.id ?? '',
    name: raw.name ?? '',
    mimeType: raw.mimeType ?? '',
    modifiedTime: raw.modifiedTime ?? '',
    owners,
    webViewLink: raw.webViewLink,
  };
}

// ---------------------------------------------------------------------------
// GwsDriveProvider class
// ---------------------------------------------------------------------------

export class GwsDriveProvider implements DriveProvider {
  readonly name = 'drive';
  private deps?: GwsDeps;

  constructor(deps?: GwsDeps) {
    this.deps = deps;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const result = await detectGws(this.deps);
      return result.installed && result.authenticated !== false;
    } catch {
      return false;
    }
  }

  async search(
    query: string,
    options?: { maxResults?: number },
  ): Promise<DriveFile[]> {
    const maxResults = options?.maxResults ?? 25;

    const raw = await gwsExec(
      'drive',
      'files',
      { q: query, maxResults },
      undefined,
      this.deps,
    );

    // Defensive: handle various response shapes
    const response = raw as DriveListResponse | DriveFileRaw[] | DriveFileRaw;

    if (Array.isArray(response)) {
      return response.map(mapDriveFile);
    }

    if (response && typeof response === 'object' && 'files' in response) {
      return (response.files ?? []).map(mapDriveFile);
    }

    // Single file or unrecognized shape
    if (response && typeof response === 'object' && 'id' in response) {
      return [mapDriveFile(response as DriveFileRaw)];
    }

    return [];
  }

  async getFile(fileId: string): Promise<DriveFile> {
    const raw = await gwsExec(
      'drive',
      'files',
      { fileId },
      undefined,
      this.deps,
    );

    return mapDriveFile(raw as DriveFileRaw);
  }

  async getRecentFiles(
    options?: { maxResults?: number },
  ): Promise<DriveFile[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const iso = cutoff.toISOString();

    return this.search(`modifiedTime > '${iso}'`, options);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function getGwsDriveProvider(deps?: GwsDeps): GwsDriveProvider {
  return new GwsDriveProvider(deps);
}
