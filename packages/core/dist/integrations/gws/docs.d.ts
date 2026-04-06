/**
 * Docs provider — thin wrapper over the `gws` CLI for Google Docs operations.
 *
 * API command paths:
 *   gws drive files get  --params '{"fileId":"..."}'            (metadata via Drive)
 *   gws docs documents get --params '{"documentId":"..."}'      (content via Docs API)
 *   gws drive files list --params '{"q":"...","pageSize":N}'    (recent docs via Drive)
 */
import type { DocMetadata, DocsProvider, GwsDeps } from './types.js';
export declare class GwsDocsProvider implements DocsProvider {
    readonly name = "docs";
    private deps?;
    constructor(deps?: GwsDeps);
    isAvailable(): Promise<boolean>;
    getDoc(docId: string): Promise<DocMetadata>;
    getDocContent(docId: string): Promise<string>;
    getRecentDocs(options?: {
        maxResults?: number;
    }): Promise<DocMetadata[]>;
}
export declare function getGwsDocsProvider(deps?: GwsDeps): GwsDocsProvider;
//# sourceMappingURL=docs.d.ts.map