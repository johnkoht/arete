/**
 * Meeting-file lockfile (phase-10-followup-2 Step 2).
 *
 * Provides `writeWithLock(storage, meetingPath, mutator)` — the canonical
 * read-modify-write primitive for meeting `.md` files. Wraps `proper-lockfile`
 * (shipped from Phase 10 10a-pre for commitments) and applies the same
 * 30s-stale + PID-check semantics to per-meeting locks.
 *
 * Why per-meeting: chef writes `staged_item_skip_reason` during winddown
 * while `arete meeting extract` may re-run in parallel (async Fathom
 * transcripts arrive 3 days late). The 10a-pre `CommitmentsService.withLock`
 * protects `.arete/commitments.json` only — meeting files need their own
 * lock surface. eng C2 required this; v3 F2 added the partial-merge
 * mutator contract that closes the SEMANTIC race the lock cannot.
 *
 * Mutator contract (v3 F2):
 *
 *   const result = await mutator({ frontmatter, body, mtime });
 *
 * The mutator returns either:
 *   - `{ frontmatter: Partial<...>, body?: string }` — shallow-merge the
 *     returned frontmatter keys into the current frontmatter. Keys NOT
 *     present in the returned object survive unchanged. To explicitly
 *     DELETE a key, return `{ [key]: undefined }`. To leave the body
 *     unchanged, omit it; to replace, return the new body string.
 *   - `{ abstain: '<reason>' }` — abort the write without touching the
 *     file; the caller receives `{ written: false, abstainReason }`.
 *
 * The partial-merge contract makes per-field ownership type-system-clean:
 * the extract path returns ONLY its 5 owned keys (status / edits / source
 * / confidence / owner), and `staged_item_skip_reason` survives BY DEFAULT
 * because the mutator never mentions it. Writers cannot accidentally
 * clobber sibling fields they don't own.
 */

import { access, mkdir, writeFile, stat, rename } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { lock as lockfileLock, type LockOptions } from 'proper-lockfile';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { StorageAdapter } from '../storage/adapter.js';
import { LockBootstrapError } from './commitments.js';

// ---------------------------------------------------------------------------
// Constants (shared shape with CommitmentsService — see commitments.ts:443)
// ---------------------------------------------------------------------------

const LOCK_STALE_MS = 30_000;

const LOCK_RETRIES = {
  retries: 10,
  factor: 1.5,
  minTimeout: 50,
  maxTimeout: 1_000,
  randomize: true,
};

const LOCK_OPTIONS: LockOptions = {
  stale: LOCK_STALE_MS,
  realpath: false,
  onCompromised: (err: Error) => {
    throw new Error(`meeting file lock was compromised: ${err.message}`);
  },
  retries: LOCK_RETRIES,
};

/** Default freshness window for the mtime-guard inside the lock. */
const DEFAULT_MTIME_GUARD_SECONDS = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MeetingFrontmatterRead {
  /** Parsed frontmatter — read-only view; mutator should return a Partial patch. */
  frontmatter: Readonly<Record<string, unknown>>;
  /** Body content (everything after the trailing `---`). */
  body: string;
  /** File mtime as of the read inside the lock. Used for mtime-guard checks. */
  mtime: Date;
}

/**
 * Mutator return value.
 *
 * `frontmatter` is shallow-merged into the current frontmatter; keys not
 * returned survive. Use `{ key: undefined }` to delete.
 *
 * `abstain` causes the helper to return without writing.
 */
export type MeetingMutationResult =
  | { frontmatter: Partial<Record<string, unknown>>; body?: string }
  | { abstain: string };

export type MeetingMutator = (
  current: MeetingFrontmatterRead,
) => Promise<MeetingMutationResult>;

export interface WriteWithLockOptions {
  /**
   * mtime-guard threshold (seconds). If the file's mtime is newer than
   * `now - this` AND the mutator did not explicitly opt out, the helper
   * aborts with `{ written: false, abstainReason: 'recent-user-edit' }`
   * BEFORE invoking the mutator. Default: 60s.
   *
   * Set to 0 to skip the guard (e.g., extract path that owns its 5 keys
   * and tolerates user-in-editor races by design).
   */
  mtimeGuardSeconds?: number;
}

export interface WriteWithLockResult {
  written: boolean;
  abstainReason?: string;
}

// ---------------------------------------------------------------------------
// Frontmatter helpers (shape-parallel to staged-items.ts internals)
// ---------------------------------------------------------------------------

function parseFrontmatterBlock(content: string): {
  data: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: content };
  return {
    data: (parseYaml(match[1]) ?? {}) as Record<string, unknown>,
    body: match[2],
  };
}

function serializeFrontmatterBlock(
  data: Record<string, unknown>,
  body: string,
): string {
  const fm = stringifyYaml(data).trimEnd();
  return `---\n${fm}\n---\n\n${body.replace(/^\n+/, '')}`;
}

// ---------------------------------------------------------------------------
// Lock target bootstrap
// ---------------------------------------------------------------------------

async function ensureMeetingLockTarget(filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch (err) {
    // For a meeting-file lock, the file MUST already exist — we don't
    // bootstrap an empty meeting. Surface as LockBootstrapError so the
    // caller can decide to abstain.
    throw new LockBootstrapError(filePath, err);
  }
}

// ---------------------------------------------------------------------------
// Atomic write via tmp+rename
// ---------------------------------------------------------------------------

async function atomicWriteViaStorage(
  storage: StorageAdapter,
  filePath: string,
  content: string,
): Promise<void> {
  // Storage adapters expose .write() but not all of them implement
  // atomic-rename semantics. For FileStorageAdapter we use the OS-level
  // rename for true atomicity; for adapters that override .write() with
  // their own semantics (e.g., memory mocks), we trust .write() to be
  // atomic at the granularity that adapter supports.
  //
  // The .lock is held throughout, so an interrupted write leaves the
  // tmp file behind but the lock prevents readers from seeing it; on
  // recovery, proper-lockfile's stale TTL releases the lock and the
  // next writer overwrites cleanly.
  const dir = dirname(filePath);
  const name = basename(filePath);
  const tmpPath = join(dir, `.${name}.tmp-${process.pid}-${Date.now()}`);
  try {
    await writeFile(tmpPath, content, 'utf8');
    await rename(tmpPath, filePath);
  } catch (err) {
    // Fallback: if the OS rename path fails (e.g., a virtual storage
    // adapter that overrides write), write directly through the adapter.
    await storage.write(filePath, content);
  }
}

// ---------------------------------------------------------------------------
// Public API: writeWithLock
// ---------------------------------------------------------------------------

/**
 * Run `mutator` against the meeting file at `meetingPath` under an
 * exclusive `proper-lockfile` lock.
 *
 * Flow:
 *   1. Bootstrap lock target (throws LockBootstrapError if file missing).
 *   2. Acquire proper-lockfile lock on `<meetingPath>.lock` (30s TTL, PID check).
 *   3. Read file inside lock + parse frontmatter + capture mtime.
 *   4. mtime-guard: if file is newer than `now - mtimeGuardSeconds`,
 *      abstain (release lock, return `{ written: false, abstainReason }`).
 *   5. Invoke mutator. If it returns `{ abstain: ... }`, release + return.
 *   6. Shallow-merge `result.frontmatter` into current frontmatter
 *      (explicit `undefined` deletes the key).
 *   7. Use `result.body` if provided; else preserve current body.
 *   8. Serialize + atomic tmp+rename write through `storage`.
 *   9. Release lock (best-effort; compromised-lock release errors swallowed).
 */
export async function writeWithLock(
  storage: StorageAdapter,
  meetingPath: string,
  mutator: MeetingMutator,
  options: WriteWithLockOptions = {},
): Promise<WriteWithLockResult> {
  await ensureMeetingLockTarget(meetingPath);

  const release = await lockfileLock(meetingPath, LOCK_OPTIONS);
  try {
    // Read inside the lock so the mutator sees a snapshot that can't
    // change underneath us.
    const raw = await storage.read(meetingPath);
    if (raw === null) {
      // File vanished between bootstrap-check and read — extremely rare,
      // but possible if a user deleted the meeting concurrently.
      return { written: false, abstainReason: 'meeting-file-vanished' };
    }
    const { data: frontmatter, body } = parseFrontmatterBlock(raw);

    let mtime: Date;
    try {
      const st = await stat(meetingPath);
      mtime = st.mtime;
    } catch {
      // Storage adapter without real fs (e.g., mocks) — fall through to
      // a synthetic mtime that won't fail the guard.
      mtime = new Date(0);
    }

    // mtime-guard: protect against user editing the file in another window
    // milliseconds before chef tried to write to it.
    const guardSec = options.mtimeGuardSeconds ?? DEFAULT_MTIME_GUARD_SECONDS;
    if (guardSec > 0) {
      const ageMs = Date.now() - mtime.getTime();
      if (ageMs >= 0 && ageMs < guardSec * 1000) {
        return { written: false, abstainReason: 'recent-user-edit' };
      }
    }

    const result = await mutator({ frontmatter, body, mtime });
    if ('abstain' in result) {
      return { written: false, abstainReason: result.abstain };
    }

    // Shallow-merge: copy current frontmatter, overlay returned keys,
    // explicit `undefined` deletes.
    const merged: Record<string, unknown> = { ...frontmatter };
    for (const [key, value] of Object.entries(result.frontmatter)) {
      if (value === undefined) {
        delete merged[key];
      } else {
        merged[key] = value;
      }
    }

    const newBody = result.body ?? body;
    const newContent = serializeFrontmatterBlock(merged, newBody);

    await atomicWriteViaStorage(storage, meetingPath, newContent);
    return { written: true };
  } finally {
    try {
      await release();
    } catch {
      // Compromised/stolen lock release error; swallow per
      // CommitmentsService precedent (commitments.ts:735).
    }
  }
}
