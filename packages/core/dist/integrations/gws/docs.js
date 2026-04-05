/**
 * Docs provider — thin wrapper over the `gws` CLI for Google Docs operations.
 *
 * Implements `DocsProvider` interface using `gwsExec()` for CLI calls
 * and `detectGws()` for availability checks.
 */
import { gwsExec } from './client.js';
import { detectGws } from './detection.js';
function mapDocMetadata(raw) {
    return {
        id: raw.documentId ?? '',
        title: raw.title ?? '',
        lastModified: raw.lastModifiedTime ?? '',
        lastModifiedBy: raw.lastModifyingUser?.displayName ??
            raw.lastModifyingUser?.emailAddress,
        webViewLink: raw.webViewLink,
    };
}
// ---------------------------------------------------------------------------
// GwsDocsProvider class
// ---------------------------------------------------------------------------
const GOOGLE_DOCS_MIME = 'application/vnd.google-apps.document';
export class GwsDocsProvider {
    name = 'docs';
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async isAvailable() {
        try {
            const result = await detectGws(this.deps);
            return result.installed && result.authenticated !== false;
        }
        catch {
            return false;
        }
    }
    async getDoc(docId) {
        const raw = await gwsExec('docs', 'get', { documentId: docId }, undefined, this.deps);
        return mapDocMetadata(raw);
    }
    async getDocContent(docId) {
        const raw = await gwsExec('docs', 'export', { documentId: docId, mimeType: 'text/plain' }, undefined, this.deps);
        // The export command may return a string directly, or an object with content
        if (typeof raw === 'string') {
            return raw;
        }
        if (raw && typeof raw === 'object') {
            const obj = raw;
            return obj.content ?? obj.body ?? obj.text ?? '';
        }
        return '';
    }
    async getRecentDocs(options) {
        // Use Drive search filtered to Google Docs mimeType
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        const iso = cutoff.toISOString();
        const maxResults = options?.maxResults ?? 25;
        const raw = await gwsExec('drive', 'files', {
            q: `mimeType = '${GOOGLE_DOCS_MIME}' and modifiedTime > '${iso}'`,
            maxResults,
        }, undefined, this.deps);
        const response = raw;
        const files = Array.isArray(response)
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
export function getGwsDocsProvider(deps) {
    return new GwsDocsProvider(deps);
}
//# sourceMappingURL=docs.js.map