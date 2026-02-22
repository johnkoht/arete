/**
 * QMD collection auto-setup for Areté workspaces.
 *
 * Detects qmd binary, creates a collection if needed, and runs indexing.
 * Collection name is stored in arete.yaml to avoid parsing qmd output
 * and to support multiple workspaces with the same directory name.
 */

import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const execFileAsync = promisify(execFile);

const QMD_UPDATE_TIMEOUT_MS = 30_000;
const QMD_COLLECTION_ADD_TIMEOUT_MS = 10_000;

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
};

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
    return { indexed: true, skipped: false };
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

  // If we already have a collection name stored, just update the index
  if (existingCollectionName) {
    try {
      await execImpl('qmd', ['update'], {
        timeout: QMD_UPDATE_TIMEOUT_MS,
        cwd: workspaceRoot,
      });
      return {
        available: true,
        created: false,
        indexed: true,
        collectionName,
        skipped: false,
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
    return {
      available: true,
      created: true,
      indexed: true,
      collectionName,
      skipped: false,
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
