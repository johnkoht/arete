/**
 * Docs provider — thin wrapper over the `gws` CLI for Google Docs operations.
 *
 * API command paths:
 *   gws drive files get  --params '{"fileId":"..."}'            (metadata via Drive)
 *   gws docs documents get --params '{"documentId":"..."}'      (content via Docs API)
 *   gws drive files list --params '{"q":"...","pageSize":N}'    (recent docs via Drive)
 */

import { gwsExec } from './client.js';
import { detectGws } from './detection.js';
import type { DocMetadata, DocsProvider, GwsDeps } from './types.js';

// ---------------------------------------------------------------------------
// Response mapping helpers
// ---------------------------------------------------------------------------

// Drive file metadata shape
type DriveFileRaw = {
  id?: string;
  name?: string;
  modifiedTime?: string;
  lastModifyingUser?: { displayName?: string; emailAddress?: string };
  webViewLink?: string;
};

// Google Docs document body shape (simplified)
type DocsParagraphElement = {
  textRun?: { content?: string };
};
type DocsParagraph = {
  elements?: DocsParagraphElement[];
};
type DocsStructuralElement = {
  paragraph?: DocsParagraph;
};
type DocsDocumentRaw = {
  documentId?: string;
  title?: string;
  body?: {
    content?: DocsStructuralElement[];
  };
};

function mapDocMetadata(raw: DriveFileRaw, docId: string): DocMetadata {
  return {
    id: raw.id ?? docId,
    title: raw.name ?? '',
    lastModified: raw.modifiedTime ?? '',
    lastModifiedBy:
      raw.lastModifyingUser?.displayName ??
      raw.lastModifyingUser?.emailAddress,
    webViewLink: raw.webViewLink,
  };
}

/** Extract plain text from a Google Docs document body. */
function extractDocText(doc: DocsDocumentRaw): string {
  const content = doc.body?.content ?? [];
  return content
    .flatMap((el) => el.paragraph?.elements ?? [])
    .map((el) => el.textRun?.content ?? '')
    .join('');
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
    // Use Drive API for file metadata (modifiedTime, webViewLink, etc.)
    const raw = await gwsExec(
      'drive',
      'files get',
      { fileId: docId },
      undefined,
      this.deps,
    );

    return mapDocMetadata(raw as DriveFileRaw, docId);
  }

  async getDocContent(docId: string): Promise<string> {
    // Use Docs API to get document content
    const raw = await gwsExec(
      'docs',
      'documents get',
      { documentId: docId },
      undefined,
      this.deps,
    );

    if (typeof raw === 'string') return raw;

    return extractDocText(raw as DocsDocumentRaw);
  }

  async getRecentDocs(
    options?: { maxResults?: number },
  ): Promise<DocMetadata[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const iso = cutoff.toISOString();
    const pageSize = options?.maxResults ?? 25;

    const raw = await gwsExec(
      'drive',
      'files list',
      {
        q: `mimeType = '${GOOGLE_DOCS_MIME}' and modifiedTime > '${iso}'`,
        pageSize,
      },
      undefined,
      this.deps,
    );

    type DriveListResponse = { files?: DriveFileRaw[] };
    const response = raw as DriveListResponse | DriveFileRaw[];

    const files: DriveFileRaw[] = Array.isArray(response)
      ? response
      : response?.files ?? [];

    return files.map((f) => mapDocMetadata(f, f.id ?? ''));
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function getGwsDocsProvider(deps?: GwsDeps): GwsDocsProvider {
  return new GwsDocsProvider(deps);
}
