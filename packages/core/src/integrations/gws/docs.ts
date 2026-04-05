/**
 * Docs provider — thin wrapper over the `gws` CLI for Google Docs operations.
 *
 * Implements `DocsProvider` interface using `gwsExec()` for CLI calls
 * and `detectGws()` for availability checks.
 */

import { gwsExec } from './client.js';
import { detectGws } from './detection.js';
import type { DocMetadata, DocsProvider, GwsDeps } from './types.js';

// ---------------------------------------------------------------------------
// Response mapping helpers
// ---------------------------------------------------------------------------

type DocRaw = {
  documentId?: string;
  title?: string;
  lastModifiedTime?: string;
  lastModifyingUser?: { displayName?: string; emailAddress?: string };
  webViewLink?: string;
};

function mapDocMetadata(raw: DocRaw): DocMetadata {
  return {
    id: raw.documentId ?? '',
    title: raw.title ?? '',
    lastModified: raw.lastModifiedTime ?? '',
    lastModifiedBy:
      raw.lastModifyingUser?.displayName ??
      raw.lastModifyingUser?.emailAddress,
    webViewLink: raw.webViewLink,
  };
}

// ---------------------------------------------------------------------------
// GwsDocsProvider class
// ---------------------------------------------------------------------------

const GOOGLE_DOCS_MIME = 'application/vnd.google-apps.document';

export class GwsDocsProvider implements DocsProvider {
  readonly name = 'docs';
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

  async getDoc(docId: string): Promise<DocMetadata> {
    const raw = await gwsExec(
      'docs',
      'get',
      { documentId: docId },
      undefined,
      this.deps,
    );

    return mapDocMetadata(raw as DocRaw);
  }

  async getDocContent(docId: string): Promise<string> {
    const raw = await gwsExec(
      'docs',
      'export',
      { documentId: docId, mimeType: 'text/plain' },
      undefined,
      this.deps,
    );

    // The export command may return a string directly, or an object with content
    if (typeof raw === 'string') {
      return raw;
    }

    if (raw && typeof raw === 'object') {
      const obj = raw as { content?: string; body?: string; text?: string };
      return obj.content ?? obj.body ?? obj.text ?? '';
    }

    return '';
  }

  async getRecentDocs(
    options?: { maxResults?: number },
  ): Promise<DocMetadata[]> {
    // Use Drive search filtered to Google Docs mimeType
    const { gwsExec: exec } = await import('./client.js');

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const iso = cutoff.toISOString();
    const maxResults = options?.maxResults ?? 25;

    const raw = await exec(
      'drive',
      'files',
      {
        q: `mimeType = '${GOOGLE_DOCS_MIME}' and modifiedTime > '${iso}'`,
        maxResults,
      },
      undefined,
      this.deps,
    );

    type DriveFileRaw = {
      id?: string;
      name?: string;
      modifiedTime?: string;
      owners?: Array<{ emailAddress?: string; displayName?: string }>;
      webViewLink?: string;
    };
    type DriveListResponse = { files?: DriveFileRaw[] };

    const response = raw as DriveListResponse | DriveFileRaw[];

    const files: DriveFileRaw[] = Array.isArray(response)
      ? response
      : response?.files ?? [];

    return files.map((f) => ({
      id: f.id ?? '',
      title: f.name ?? '',
      lastModified: f.modifiedTime ?? '',
      lastModifiedBy: f.owners?.[0]?.emailAddress ?? f.owners?.[0]?.displayName,
      webViewLink: f.webViewLink,
    }));
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function getGwsDocsProvider(deps?: GwsDeps): GwsDocsProvider {
  return new GwsDocsProvider(deps);
}
