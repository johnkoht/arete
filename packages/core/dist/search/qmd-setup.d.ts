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
/** File mask used for every Areté qmd collection. */
export declare const QMD_COLLECTION_MASK = "**/*.md";
/**
 * Map of qmd collection name → workspace-relative root directory, used to
 * rebase collection-relative result paths back to workspace-relative paths.
 *
 * Background: qmd result paths are relative to the COLLECTION root
 * (`qmd://arete-da59-memory/topics/foo.md` → `topics/foo.md`), but all
 * downstream consumers (topic retrieval post-filters, storage reads, CLI
 * display) expect workspace-relative paths (`.arete/memory/topics/foo.md`).
 * This matters doubly for the `memory` scope: qmd's file walker prunes
 * dot-directories regardless of mask, so `.arete/memory` content is ONLY
 * reachable via a collection rooted inside `.arete/memory` — whose result
 * paths then need the `.arete/memory/` prefix restored.
 */
export type QmdCollectionRoots = Record<string, string>;
/**
 * Build the collection-name → workspace-relative-root map for a workspace.
 *
 * Includes both the deterministic generated names
 * (`arete-<hash>-<scope>`) and any names configured in
 * `arete.yaml` `qmd_collections` (covers renamed/legacy collections).
 * Scopes rooted at the workspace root (`.`) are omitted — their result
 * paths are already workspace-relative after prefix stripping.
 */
export declare function buildQmdCollectionRoots(workspaceRoot: string, collections?: QmdCollections): QmdCollectionRoots;
/**
 * Convert a raw qmd result path (`qmd://collection/relative/path.md`) to a
 * workspace-relative path. Collections found in `roots` get their
 * workspace-relative root prefixed; unknown collections (e.g. the root
 * `all` collection, or collections from other workspaces) just have the
 * `qmd://collection/` prefix stripped (previous behavior).
 */
export declare function rebaseQmdPath(rawPath: string, roots: QmdCollectionRoots): string;
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
    /**
     * True when an existing collection was re-created because its registered
     * path or pattern no longer matched the expected scope definition
     * (e.g. `memory` collections created before the `.arete/memory/items`
     * → `.arete/memory` repoint).
     */
    migrated?: boolean;
    /** Warning message if something went wrong */
    warning?: string;
    /**
     * Info-grade note (wiki-repair W5): set when the collection's spec
     * could not be verified (`qmd collection show` failed/unparseable) and
     * was left as-is. Not an error — but no longer silent.
     */
    note?: string;
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
 * - "memory" → .arete/memory/ (includes items/, areas/, summaries/)
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
 *   Collections that already exist in config are verified and re-created if missing from
 *   qmd, or if their registered path/pattern no longer match the scope definition
 *   (migration for collections created under older scope mappings).
 * @param deps - Injectable dependencies for testing
 * @returns Result with collections map suitable for storing in arete.yaml
 */
export declare function ensureQmdCollections(workspaceRoot: string, existingCollections?: QmdCollections, deps?: QmdCollectionsDeps): Promise<QmdCollectionsResult>;
//# sourceMappingURL=qmd-setup.d.ts.map