/**
 * QMD collection auto-setup for Areté workspaces.
 *
 * Detects qmd binary, creates a collection if needed, and runs indexing.
 * Collection name is stored in arete.yaml to avoid parsing qmd output
 * and to support multiple workspaces with the same directory name.
 */
import type { QmdScope, QmdCollections } from '../models/workspace.js';
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
/**
 * Scope → relative path mapping for multi-collection setup.
 * - `all` indexes the entire workspace root
 * - Other scopes index specific directories
 */
export declare const SCOPE_PATHS: Record<QmdScope, string>;
/** All scopes in order of creation */
export declare const ALL_SCOPES: readonly QmdScope[];
/** Result for a single scope's collection setup */
export type QmdScopeResult = {
    /** The scope (all, memory, meetings, etc.) */
    scope: QmdScope;
    /** Whether the collection was created */
    created: boolean;
    /** Collection name (if created) */
    collectionName?: string;
    /** Whether this scope was skipped (path doesn't exist) */
    skipped: boolean;
    /** Warning message if something went wrong */
    warning?: string;
};
/** Result of multi-collection setup */
export type QmdCollectionsResult = {
    /** Whether qmd was detected on the system */
    available: boolean;
    /** Whether setup was skipped entirely (qmd not available or fallback mode) */
    skipped: boolean;
    /** Results for each scope */
    scopes: QmdScopeResult[];
    /** Map of scope → collection name for scopes that were created */
    collections: QmdCollections;
    /** Whether the global update was run */
    indexed: boolean;
    /** Warning from the global update if it failed */
    warning?: string;
    /** Whether qmd embed succeeded */
    embedded?: boolean;
    /** Warning from qmd embed if it failed */
    embedWarning?: string;
};
/** Injectable test dependencies for multi-collection setup */
export type QmdCollectionsDeps = QmdSetupDeps & {
    /** Check if a path exists. Defaults to fs.existsSync. */
    pathExists?: (path: string) => boolean;
};
/**
 * Generate a unique scoped collection name from workspace path and scope.
 * Format: `arete-<4-char-hash>-<scope>` e.g. `arete-a3f2-memory`
 *
 * @param workspaceRoot - Absolute path to the workspace
 * @param scope - The scope identifier (all, memory, meetings, etc.)
 * @returns Collection name
 */
export declare function generateScopedCollectionName(workspaceRoot: string, scope: QmdScope): string;
/**
 * Ensure QMD collections exist for all scopes where the path exists.
 *
 * Creates 10 scope-based collections:
 * - "all" → workspace root (entire workspace)
 * - "memory" → .arete/memory/items/
 * - "meetings" → resources/meetings/
 * - "context" → context/
 * - "projects" → projects/
 * - "people" → people/
 * - "areas" → areas/
 * - "goals" → goals/
 * - "now" → now/
 * - "resources" → resources/ (conversations, notes, meetings)
 *
 * Scopes with non-existent paths are skipped (expected for fresh workspaces).
 *
 * - If ARETE_SEARCH_FALLBACK env var is set, returns skipped: true.
 * - If qmd is not on PATH, returns skipped: true.
 * - Creates each collection with: qmd collection add [path] --name [name] --mask "**\/*.md"
 * - Runs "qmd update" once after all collections are created.
 * - All failures are non-fatal (returns warnings, never throws).
 *
 * @param workspaceRoot - Absolute path to the workspace
 * @param existingCollections - Existing collections from config (scope to collection name).
 *   Collections that already exist in config are verified and re-created if missing from qmd.
 * @param deps - Injectable dependencies for testing
 * @returns Result with collections map suitable for storing in arete.yaml
 */
export declare function ensureQmdCollections(workspaceRoot: string, existingCollections?: QmdCollections, deps?: QmdCollectionsDeps): Promise<QmdCollectionsResult>;
//# sourceMappingURL=qmd-setup.d.ts.map