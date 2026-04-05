/**
 * Docs provider — thin wrapper over the `gws` CLI for Google Docs operations.
 *
 * Implements `DocsProvider` interface using `gwsExec()` for CLI calls
 * and `detectGws()` for availability checks.
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