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
function mapDocMetadata(raw, docId) {
    return {
        id: raw.id ?? docId,
        title: raw.name ?? '',
        lastModified: raw.modifiedTime ?? '',
        lastModifiedBy: raw.lastModifyingUser?.displayName ??
            raw.lastModifyingUser?.emailAddress,
        webViewLink: raw.webViewLink,
    };
}
/** Extract plain text from a Google Docs document body. */
function extractDocText(doc) {
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
        // Use Drive API for file metadata (modifiedTime, webViewLink, etc.)
        const raw = await gwsExec('drive', 'files get', { fileId: docId }, undefined, this.deps);
        return mapDocMetadata(raw, docId);
    }
    async getDocContent(docId) {
        // Use Docs API to get document content
        const raw = await gwsExec('docs', 'documents get', { documentId: docId }, undefined, this.deps);
        if (typeof raw === 'string')
            return raw;
        return extractDocText(raw);
    }
    async getRecentDocs(options) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        const iso = cutoff.toISOString();
        const pageSize = options?.maxResults ?? 25;
        const raw = await gwsExec('drive', 'files list', {
            q: `mimeType = '${GOOGLE_DOCS_MIME}' and modifiedTime > '${iso}'`,
            pageSize,
        }, undefined, this.deps);
        const response = raw;
        const files = Array.isArray(response)
            ? response
            : response?.files ?? [];
        return files.map((f) => mapDocMetadata(f, f.id ?? ''));
    }
}
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function getGwsDocsProvider(deps) {
    return new GwsDocsProvider(deps);
}
//# sourceMappingURL=docs.js.map