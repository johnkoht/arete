/**
 * QMD collection auto-setup for Areté workspaces.
 *
 * Detects qmd binary, creates a collection if needed, and runs indexing.
 * Collection name is stored in arete.yaml to avoid parsing qmd output
 * and to support multiple workspaces with the same directory name.
 */

import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import type { QmdScope, QmdCollections } from '../models/workspace.js';

const execFileAsync = promisify(execFile);

/** Timeout for QMD index updates (30s) - updates can be slow for large workspaces */
const QMD_UPDATE_TIMEOUT_MS = 30_000;
const QMD_COLLECTION_ADD_TIMEOUT_MS = 10_000;
const QMD_EMBED_TIMEOUT_MS = 60_000; // Generous for first-run model download (~328MB)

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
  whichSync: () => { status: number | null; stdout?: string };
  execFileAsync: (
    file: string,
    args: string[],
    opts: { timeout: number; cwd: string; maxBuffer?: number },
  ) => Promise<{ stdout?: string; stderr?: string }>;
};

/**
 * Generate a unique collection name from workspace path.
 * Format: `<dirname>-<4-char-hash>` e.g. `acme-product-a3f2`
 */
export function generateCollectionName(workspaceRoot: string): string {
  const absPath = resolve(workspaceRoot);
  const dirName = basename(absPath);
  const hash = createHash('sha256').update(absPath).digest('hex').slice(0, 4);
  // Sanitize dirname: lowercase, replace non-alphanumeric with hyphens, collapse
  const sanitized = dirName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${sanitized || 'workspace'}-${hash}`;
}

/** Check if qmd is available on the system */
function isQmdAvailable(deps?: QmdSetupDeps): boolean {
  const whichSyncImpl =
    deps?.whichSync ??
    (() => spawnSync('which', ['qmd'], { encoding: 'utf8' }));
  try {
    const r = whichSyncImpl();
    return r.status === 0 && (r.stdout?.trim()?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

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
export async function embedQmdIndex(
  workspaceRoot: string,
  existingCollectionName: string | undefined,
  deps?: QmdSetupDeps,
): Promise<QmdEmbedResult> {
  const skippedResult: QmdEmbedResult = { embedded: false, skipped: true };

  if (process.env.ARETE_SEARCH_FALLBACK) {
    return skippedResult;
  }

  if (!existingCollectionName) {
    return skippedResult;
  }

  if (!isQmdAvailable(deps)) {
    return skippedResult;
  }

  const execImpl =
    deps?.execFileAsync ??
    (async (
      file: string,
      args: string[],
      opts: { timeout: number; cwd: string; maxBuffer?: number },
    ) => {
      const result = await execFileAsync(file, args, opts);
      return { stdout: result.stdout, stderr: result.stderr };
    });

  try {
    await execImpl('qmd', ['embed'], {
      timeout: QMD_EMBED_TIMEOUT_MS,
      cwd: workspaceRoot,
    });
    return { embedded: true, skipped: false };
  } catch (err) {
    return {
      embedded: false,
      warning: `qmd embed failed: ${(err as Error).message}`,
      skipped: false,
    };
  }
}

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
export async function refreshQmdIndex(
  workspaceRoot: string,
  existingCollectionName: string | undefined,
  deps?: QmdSetupDeps,
): Promise<QmdRefreshResult> {
  const skippedResult: QmdRefreshResult = { indexed: false, skipped: true };

  if (process.env.ARETE_SEARCH_FALLBACK) {
    return skippedResult;
  }

  if (!existingCollectionName) {
    return skippedResult;
  }

  if (!isQmdAvailable(deps)) {
    return skippedResult;
  }

  const execImpl =
    deps?.execFileAsync ??
    (async (
      file: string,
      args: string[],
      opts: { timeout: number; cwd: string; maxBuffer?: number },
    ) => {
      const result = await execFileAsync(file, args, opts);
      return { stdout: result.stdout, stderr: result.stderr };
    });

  try {
    await execImpl('qmd', ['update'], {
      timeout: QMD_UPDATE_TIMEOUT_MS,
      cwd: workspaceRoot,
    });

    // Run embed after successful update (incremental, ~0.2s for no-op)
    const embedResult = await embedQmdIndex(
      workspaceRoot,
      existingCollectionName,
      deps,
    );
    return {
      indexed: true,
      skipped: false,
      embedded: embedResult.embedded,
      embedWarning: embedResult.warning,
    };
  } catch (err) {
    return {
      indexed: false,
      warning: `qmd update failed: ${(err as Error).message}`,
      skipped: false,
    };
  }
}

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
export async function ensureQmdCollection(
  workspaceRoot: string,
  existingCollectionName?: string,
  deps?: QmdSetupDeps,
): Promise<QmdSetupResult> {
  const skippedResult: QmdSetupResult = {
    available: false,
    created: false,
    indexed: false,
    skipped: true,
  };

  if (!isQmdAvailable(deps)) {
    return skippedResult;
  }

  const execImpl =
    deps?.execFileAsync ??
    (async (
      file: string,
      args: string[],
      opts: { timeout: number; cwd: string; maxBuffer?: number },
    ) => {
      const result = await execFileAsync(file, args, opts);
      return { stdout: result.stdout, stderr: result.stderr };
    });

  const collectionName =
    existingCollectionName ?? generateCollectionName(workspaceRoot);

  // If we already have a collection name stored, verify it exists and update
  if (existingCollectionName) {
    // Check if the collection actually exists in qmd
    let collectionExists = false;
    try {
      const listResult = await execImpl('qmd', ['collection', 'list'], {
        timeout: QMD_UPDATE_TIMEOUT_MS,
        cwd: workspaceRoot,
      });
      // qmd collection list outputs lines like: "reserv-121f (qmd://reserv-121f/)"
      // Check if any line starts with the collection name
      collectionExists = (listResult.stdout ?? '')
        .split('\n')
        .some((line) => line.trim().startsWith(existingCollectionName));
    } catch {
      // If list fails, assume collection doesn't exist and try to create it
      collectionExists = false;
    }

    if (collectionExists) {
      // Collection exists, just update the index
      try {
        await execImpl('qmd', ['update'], {
          timeout: QMD_UPDATE_TIMEOUT_MS,
          cwd: workspaceRoot,
        });

        // Run embed after successful update
        const embedResult = await embedQmdIndex(workspaceRoot, collectionName, deps);
        return {
          available: true,
          created: false,
          indexed: true,
          collectionName,
          skipped: false,
          embedded: embedResult.embedded,
          embedWarning: embedResult.warning,
        };
      } catch (err) {
        return {
          available: true,
          created: false,
          indexed: false,
          collectionName,
          skipped: false,
          warning: `qmd update failed: ${(err as Error).message}`,
        };
      }
    }
    // Collection name is in config but doesn't exist in qmd - fall through to create it
  }

  // Create a new collection
  try {
    await execImpl(
      'qmd',
      [
        'collection',
        'add',
        workspaceRoot,
        '--name',
        collectionName,
        '--mask',
        '**/*.md',
      ],
      {
        timeout: QMD_COLLECTION_ADD_TIMEOUT_MS,
        cwd: workspaceRoot,
      },
    );
  } catch (err) {
    return {
      available: true,
      created: false,
      indexed: false,
      collectionName,
      skipped: false,
      warning: `qmd collection add failed: ${(err as Error).message}`,
    };
  }

  // Run initial index
  try {
    await execImpl('qmd', ['update'], {
      timeout: QMD_UPDATE_TIMEOUT_MS,
      cwd: workspaceRoot,
    });

    // Run embed after successful update
    const embedResult = await embedQmdIndex(workspaceRoot, collectionName, deps);
    return {
      available: true,
      created: true,
      indexed: true,
      collectionName,
      skipped: false,
      embedded: embedResult.embedded,
      embedWarning: embedResult.warning,
    };
  } catch (err) {
    return {
      available: true,
      created: true,
      indexed: false,
      collectionName,
      skipped: false,
      warning: `Collection created but qmd update failed: ${(err as Error).message}`,
    };
  }
}

// ============================================================================
// Multi-collection support for scoped search
// ============================================================================

/**
 * Scope → relative path mapping for multi-collection setup.
 * - `all` indexes the entire workspace root
 * - Other scopes index specific directories
 */
export const SCOPE_PATHS: Record<QmdScope, string> = {
  all: '.', // workspace root
  memory: '.arete/memory', // includes items/ (L2) + areas/ (L3) + summaries/ (L3)
  meetings: 'resources/meetings',
  context: 'context',
  projects: 'projects',
  people: 'people',
  areas: 'areas',
  goals: 'goals',
  now: 'now',
  resources: 'resources',
  inbox: 'inbox',
};

/** File mask used for every Areté qmd collection. */
export const QMD_COLLECTION_MASK = '**/*.md';

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
export function buildQmdCollectionRoots(
  workspaceRoot: string,
  collections?: QmdCollections,
): QmdCollectionRoots {
  const roots: QmdCollectionRoots = {};
  for (const scope of ALL_SCOPES) {
    const rel = SCOPE_PATHS[scope];
    if (rel === '.') continue;
    roots[generateScopedCollectionName(workspaceRoot, scope)] = rel;
    const configured = collections?.[scope];
    if (configured) {
      roots[configured] = rel;
    }
  }
  return roots;
}

/**
 * Convert a raw qmd result path (`qmd://collection/relative/path.md`) to a
 * workspace-relative path. Collections found in `roots` get their
 * workspace-relative root prefixed; unknown collections (e.g. the root
 * `all` collection, or collections from other workspaces) just have the
 * `qmd://collection/` prefix stripped (previous behavior).
 */
export function rebaseQmdPath(
  rawPath: string,
  roots: QmdCollectionRoots,
): string {
  const match = rawPath.match(/^qmd:\/\/([^/]+)\/(.+)$/);
  if (!match) return rawPath;
  const root = roots[match[1]];
  return root ? `${root}/${match[2]}` : match[2];
}

/** All scopes in order of creation */
export const ALL_SCOPES: readonly QmdScope[] = [
  'all',
  'memory',
  'meetings',
  'context',
  'projects',
  'people',
  'areas',
  'goals',
  'now',
  'resources',
  'inbox',
] as const;

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
 * Compare two filesystem paths for equivalence, tolerating symlinks
 * (qmd stores realpaths, e.g. `/tmp` → `/private/tmp` on macOS).
 */
function pathsEquivalent(a: string, b: string): boolean {
  const normalize = (p: string) => resolve(p).replace(/\/+$/, '');
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  try {
    return realpathSync(na) === realpathSync(nb);
  } catch {
    return false;
  }
}

/**
 * Check whether an existing qmd collection's registered path/pattern still
 * matches what the scope definition expects. Returns true when a mismatch
 * is POSITIVELY detected (collection must be re-created). When
 * `qmd collection show` fails or its output can't be parsed, returns false
 * — we can't verify, so we leave the collection alone (non-destructive).
 */
async function collectionSpecMismatch(
  execImpl: NonNullable<QmdSetupDeps['execFileAsync']>,
  workspaceRoot: string,
  collectionName: string,
  expectedAbsolutePath: string,
): Promise<boolean> {
  let stdout: string;
  try {
    const showResult = await execImpl(
      'qmd',
      ['collection', 'show', collectionName],
      { timeout: QMD_COLLECTION_ADD_TIMEOUT_MS, cwd: workspaceRoot },
    );
    stdout = showResult.stdout ?? '';
  } catch {
    return false; // Can't verify — assume OK
  }

  const pathMatch = stdout.match(/^\s*Path:\s*(.+)$/m);
  const patternMatch = stdout.match(/^\s*Pattern:\s*(.+)$/m);
  if (!pathMatch && !patternMatch) return false; // Unparseable — assume OK

  if (pathMatch && !pathsEquivalent(pathMatch[1].trim(), expectedAbsolutePath)) {
    return true;
  }
  if (patternMatch && patternMatch[1].trim() !== QMD_COLLECTION_MASK) {
    return true;
  }
  return false;
}

/**
 * Generate a unique scoped collection name from workspace path and scope.
 * Format: `arete-<4-char-hash>-<scope>` e.g. `arete-a3f2-memory`
 *
 * @param workspaceRoot - Absolute path to the workspace
 * @param scope - The scope identifier (all, memory, meetings, etc.)
 * @returns Collection name
 */
export function generateScopedCollectionName(
  workspaceRoot: string,
  scope: QmdScope,
): string {
  const absPath = resolve(workspaceRoot);
  const hash = createHash('sha256').update(absPath).digest('hex').slice(0, 4);
  return `arete-${hash}-${scope}`;
}

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
export async function ensureQmdCollections(
  workspaceRoot: string,
  existingCollections?: QmdCollections,
  deps?: QmdCollectionsDeps,
): Promise<QmdCollectionsResult> {
  const skippedResult: QmdCollectionsResult = {
    available: false,
    skipped: true,
    scopes: [],
    collections: {},
    indexed: false,
  };

  if (process.env.ARETE_SEARCH_FALLBACK) {
    return skippedResult;
  }

  if (!isQmdAvailable(deps)) {
    return skippedResult;
  }

  const execImpl =
    deps?.execFileAsync ??
    (async (
      file: string,
      args: string[],
      opts: { timeout: number; cwd: string; maxBuffer?: number },
    ) => {
      const result = await execFileAsync(file, args, opts);
      return { stdout: result.stdout, stderr: result.stderr };
    });

  const pathExistsImpl = deps?.pathExists ?? existsSync;

  // Get list of existing qmd collections
  let existingQmdCollections = new Set<string>();
  try {
    const listResult = await execImpl('qmd', ['collection', 'list'], {
      timeout: QMD_UPDATE_TIMEOUT_MS,
      cwd: workspaceRoot,
    });
    // qmd collection list outputs lines like: "reserv-121f (qmd://reserv-121f/)"
    // Extract collection names
    for (const line of (listResult.stdout ?? '').split('\n')) {
      const trimmed = line.trim();
      if (trimmed) {
        // Extract name before first space or parenthesis
        const match = trimmed.match(/^([a-z0-9-]+)/);
        if (match) {
          existingQmdCollections.add(match[1]);
        }
      }
    }
  } catch {
    // If list fails, continue and let individual adds handle errors
  }

  const scopeResults: QmdScopeResult[] = [];
  const collections: QmdCollections = {};

  for (const scope of ALL_SCOPES) {
    const relativePath = SCOPE_PATHS[scope];
    const absolutePath = join(workspaceRoot, relativePath);

    // Check if path exists
    if (!pathExistsImpl(absolutePath)) {
      scopeResults.push({
        scope,
        created: false,
        skipped: true,
      });
      continue;
    }

    // Determine collection name
    const collectionName =
      existingCollections?.[scope] ?? generateScopedCollectionName(workspaceRoot, scope);

    // Check if collection already exists in qmd
    let migrated = false;
    if (existingQmdCollections.has(collectionName)) {
      // Verify the registered path/pattern still match the scope
      // definition. Collections created under older scope mappings
      // (e.g. memory → `.arete/memory/items`) keep their stale path
      // forever otherwise, silently excluding new content like
      // `.arete/memory/topics/` from search.
      const mismatch = await collectionSpecMismatch(
        execImpl,
        workspaceRoot,
        collectionName,
        absolutePath,
      );

      if (!mismatch) {
        // Collection exists and matches, no need to create
        scopeResults.push({
          scope,
          created: false,
          collectionName,
          skipped: false,
        });
        collections[scope] = collectionName;
        continue;
      }

      // Stale definition — remove so we can re-create with the same name
      try {
        await execImpl('qmd', ['collection', 'remove', collectionName], {
          timeout: QMD_COLLECTION_ADD_TIMEOUT_MS,
          cwd: workspaceRoot,
        });
        migrated = true;
      } catch (err) {
        // Removal failed — keep the existing (stale) collection rather
        // than risk losing it entirely. Surface a warning.
        scopeResults.push({
          scope,
          created: false,
          collectionName,
          skipped: false,
          warning: `qmd collection remove failed for ${scope} (stale path/pattern kept): ${(err as Error).message}`,
        });
        collections[scope] = collectionName;
        continue;
      }
    }

    // Create the collection
    try {
      await execImpl(
        'qmd',
        [
          'collection',
          'add',
          absolutePath,
          '--name',
          collectionName,
          '--mask',
          QMD_COLLECTION_MASK,
        ],
        {
          timeout: QMD_COLLECTION_ADD_TIMEOUT_MS,
          cwd: workspaceRoot,
        },
      );
      scopeResults.push({
        scope,
        created: true,
        collectionName,
        skipped: false,
        ...(migrated ? { migrated: true } : {}),
      });
      collections[scope] = collectionName;
    } catch (err) {
      scopeResults.push({
        scope,
        created: false,
        collectionName,
        skipped: false,
        ...(migrated ? { migrated: true } : {}),
        warning: `qmd collection add failed for ${scope}: ${(err as Error).message}`,
      });
    }
  }

  // If no collections were created or exist, skip the update
  const hasCollections = Object.keys(collections).length > 0;
  if (!hasCollections) {
    return {
      available: true,
      skipped: false,
      scopes: scopeResults,
      collections,
      indexed: false,
      warning: 'No collections created (no paths exist)',
    };
  }

  // Run global update once (updates ALL collections)
  let indexed = false;
  let updateWarning: string | undefined;
  try {
    await execImpl('qmd', ['update'], {
      timeout: QMD_UPDATE_TIMEOUT_MS,
      cwd: workspaceRoot,
    });
    indexed = true;
  } catch (err) {
    updateWarning = `qmd update failed: ${(err as Error).message}`;
  }

  // Run embed if update succeeded
  let embedded: boolean | undefined;
  let embedWarning: string | undefined;
  if (indexed) {
    // Use any collection name as a gate (we know at least one exists)
    const anyCollectionName = Object.values(collections)[0];
    const embedResult = await embedQmdIndex(workspaceRoot, anyCollectionName, deps);
    embedded = embedResult.embedded;
    embedWarning = embedResult.warning;
  }

  return {
    available: true,
    skipped: false,
    scopes: scopeResults,
    collections,
    indexed,
    warning: updateWarning,
    embedded,
    embedWarning,
  };
}
