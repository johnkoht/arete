/**
 * QMD collection auto-setup for Areté workspaces.
 *
 * Detects qmd binary, creates a collection if needed, and runs indexing.
 * Collection name is stored in arete.yaml to avoid parsing qmd output
 * and to support multiple workspaces with the same directory name.
 */
/** Result of qmd setup attempt */
export type QmdSetupResult = {
    /** Whether qmd was detected on the system */
    available: boolean;
    /** Whether a new collection was created */
    created: boolean;
    /** Whether the index was updated */
    indexed: boolean;
    /** Collection name (if created or already existed) */
    collectionName?: string;
    /** Warning message if something went wrong (non-fatal) */
    warning?: string;
    /** Whether setup was skipped entirely */
    skipped: boolean;
    /** Whether qmd embed succeeded (creates vector embeddings) */
    embedded?: boolean;
    /** Warning from qmd embed if it failed */
    embedWarning?: string;
};
/** Injectable test dependencies */
export type QmdSetupDeps = {
    whichSync: () => {
        status: number | null;
        stdout?: string;
    };
    execFileAsync: (file: string, args: string[], opts: {
        timeout: number;
        cwd: string;
        maxBuffer?: number;
    }) => Promise<{
        stdout?: string;
        stderr?: string;
    }>;
};
/**
 * Generate a unique collection name from workspace path.
 * Format: `<dirname>-<4-char-hash>` e.g. `acme-product-a3f2`
 */
export declare function generateCollectionName(workspaceRoot: string): string;
/** Result of a qmd refresh attempt */
export type QmdRefreshResult = {
    /** Whether the index was updated */
    indexed: boolean;
    /** Warning message if something went wrong (non-fatal) */
    warning?: string;
    /** Whether refresh was skipped entirely */
    skipped: boolean;
    /** Whether qmd embed succeeded (creates vector embeddings) */
    embedded?: boolean;
    /** Warning from qmd embed if it failed */
    embedWarning?: string;
};
/** Result of a qmd embed attempt */
export type QmdEmbedResult = {
    /** Whether qmd embed succeeded */
    embedded: boolean;
    /** Warning message if something went wrong (non-fatal) */
    warning?: string;
    /** Whether embed was skipped entirely */
    skipped: boolean;
};
/**
 * Run qmd embed to create vector embeddings for semantic search.
 *
 * - If `ARETE_SEARCH_FALLBACK` env var is set, returns `{ skipped: true }`.
 * - If qmd is not on PATH, returns `{ skipped: true }`.
 * - If `existingCollectionName` is undefined or empty, returns `{ skipped: true }`.
 * - Otherwise runs `qmd embed` in workspaceRoot.
 * - All failures are non-fatal (returns warning, never throws).
 *
 * Note: First run may download the embedding model (~328MB), hence the generous timeout.
 *
 * @param workspaceRoot - Absolute path to the workspace
 * @param existingCollectionName - Used only as a "qmd configured?" gate
 * @param deps - Injectable dependencies for testing
 * @returns Embed result
 */
export declare function embedQmdIndex(workspaceRoot: string, existingCollectionName: string | undefined, deps?: QmdSetupDeps): Promise<QmdEmbedResult>;
/**
 * Refresh the qmd index for an existing collection.
 *
 * - If `ARETE_SEARCH_FALLBACK` env var is set, returns `{ skipped: true }`.
 * - If qmd is not on PATH, returns `{ skipped: true }`.
 * - If `existingCollectionName` is undefined or empty, returns `{ skipped: true }`.
 * - Otherwise runs `qmd update` in workspaceRoot.
 * - All failures are non-fatal (returns warning, never throws).
 *
 * @param workspaceRoot - Absolute path to the workspace
 * @param existingCollectionName - Used only as a "qmd configured?" gate: when
 *   undefined or empty the refresh is skipped. The name is **not** passed to the
 *   qmd CLI — qmd infers the active collection from the working directory
 *   (`cwd: workspaceRoot`).
 * @param deps - Injectable dependencies for testing
 * @returns Refresh result
 */
export declare function refreshQmdIndex(workspaceRoot: string, existingCollectionName: string | undefined, deps?: QmdSetupDeps): Promise<QmdRefreshResult>;
/**
 * Ensure a qmd collection exists for the workspace and index it.
 *
 * - If qmd is not installed, returns `{ skipped: true }`.
 * - If a collection name is already stored in config, runs `qmd update` only.
 * - Otherwise creates a new collection and indexes it.
 * - All failures are non-fatal (returns warning, never throws).
 *
 * @param workspaceRoot - Absolute path to the workspace
 * @param existingCollectionName - Used only as a "qmd configured?" gate: when
 *   provided, skips collection creation and runs `qmd update` only. The name is
 *   **not** passed to the qmd CLI — qmd infers the active collection from the
 *   working directory (`cwd: workspaceRoot`).
 * @param deps - Injectable dependencies for testing
 * @returns Result with status and optional collection name to persist
 */
export declare function ensureQmdCollection(workspaceRoot: string, existingCollectionName?: string, deps?: QmdSetupDeps): Promise<QmdSetupResult>;
//# sourceMappingURL=qmd-setup.d.ts.map