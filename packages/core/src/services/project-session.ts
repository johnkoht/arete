/**
 * Project session markers (project-exit, Increment A).
 *
 * Harness state for the `/project` open ↔ `/project-exit` close loop:
 *
 *   - `.claude/active-project.json` — the single active-project marker. Tracks
 *     which project the agent currently has "open", when it was opened, and a
 *     `dirty` bit the close flow uses to decide whether a resume sidecar is
 *     worth writing. The LLM may only UPGRADE clean→dirty; the filesystem
 *     backstop (`dirtyByMtime`) is the source of truth for "did anything
 *     change". (C1: a stale-clean bit can never SUPPRESS a real edit.)
 *   - `.arete/sessions/<slug>.md` — the resume sidecar. The close flow writes
 *     "where you left off"; the next `arete project open <name>` reads it back.
 *     A single-deep `.prev` backup guards against a thinner overwrite clobbering
 *     a richer prior handoff.
 *
 * Marker IO lives under `.claude/` (harness state, NOT workspace content), so
 * these writes never trigger `refreshQmdIndex`. All IO goes through the
 * StorageAdapter — no direct `fs` (services invariant; see project-area.ts).
 */

import { join, basename } from 'node:path';
import type { StorageAdapter } from '../storage/adapter.js';

/** H1: only projects whose README was touched within this window seed a greeting. */
export const GREETING_RECENCY_DAYS = 14;
/** Top-N most-recent sidecars offered in a greeting. */
const GREETING_MAX_CANDIDATES = 3;

/** The active-project marker persisted at `.claude/active-project.json`. */
export interface ActiveProjectMarker {
  slug: string;
  name: string;
  /** ISO timestamp the project was opened. */
  openedAt: string;
  /**
   * Whether the open session has unsaved/uncaptured work. The LLM may set this
   * true; the filesystem backstop (`dirtyByMtime`) can independently upgrade
   * clean→dirty. Never used to suppress a write.
   */
  dirty: boolean;
}

/** `<root>/.claude/active-project.json`. */
export function activeProjectMarkerPath(root: string): string {
  return join(root, '.claude', 'active-project.json');
}

/** `<root>/.arete/sessions/<slug>.md`. */
export function resumeSidecarPath(root: string, slug: string): string {
  return join(root, '.arete', 'sessions', `${slug}.md`);
}

/**
 * Read the active-project marker. Returns undefined when absent OR malformed —
 * a corrupt marker must never throw (the open/close flows degrade to "no
 * active project" rather than crash).
 */
export async function readActiveProjectMarker(
  storage: StorageAdapter,
  root: string,
): Promise<ActiveProjectMarker | undefined> {
  const content = await storage.read(activeProjectMarkerPath(root));
  if (!content) return undefined;
  try {
    const parsed = JSON.parse(content) as Partial<ActiveProjectMarker>;
    if (
      typeof parsed.slug !== 'string' ||
      typeof parsed.name !== 'string' ||
      typeof parsed.openedAt !== 'string'
    ) {
      return undefined;
    }
    return {
      slug: parsed.slug,
      name: parsed.name,
      openedAt: parsed.openedAt,
      dirty: parsed.dirty === true,
    };
  } catch {
    return undefined;
  }
}

/** Write (overwrite) the active-project marker. */
export async function writeActiveProjectMarker(
  storage: StorageAdapter,
  root: string,
  marker: ActiveProjectMarker,
): Promise<void> {
  await storage.write(activeProjectMarkerPath(root), JSON.stringify(marker, null, 2) + '\n');
}

/**
 * Read-modify-write the marker's `dirty` bit to true. No-op when there is no
 * marker (nothing is open → nothing to mark dirty).
 */
export async function setActiveProjectMarkerDirty(
  storage: StorageAdapter,
  root: string,
): Promise<void> {
  const marker = await readActiveProjectMarker(storage, root);
  if (!marker) return;
  if (marker.dirty) return;
  await writeActiveProjectMarker(storage, root, { ...marker, dirty: true });
}

/** Delete the active-project marker. No-op when absent. */
export async function clearActiveProjectMarker(
  storage: StorageAdapter,
  root: string,
): Promise<void> {
  const path = activeProjectMarkerPath(root);
  if (!(await storage.exists(path))) return;
  await storage.delete(path);
}

/** Read the resume sidecar for a project. Undefined when absent. */
export async function readResumeSidecar(
  storage: StorageAdapter,
  root: string,
  slug: string,
): Promise<string | undefined> {
  const content = await storage.read(resumeSidecarPath(root, slug));
  return content ?? undefined;
}

/** Count markdown bullet lines (`- ` / `* `) — the thinness signal. */
function countBulletLines(content: string): number {
  let count = 0;
  for (const line of content.split('\n')) {
    if (/^\s*[-*]\s+/.test(line)) count++;
  }
  return count;
}

/**
 * Write the resume sidecar. Before overwriting an existing sidecar, copy it to
 * `<slug>.md.prev` (single-deep backup). Returns `thinnerThanPrev: true` when
 * the NEW content has fewer markdown bullet lines than the prior — the signal
 * the close flow uses to warn before clobbering a richer handoff.
 */
export async function writeResumeSidecar(
  storage: StorageAdapter,
  root: string,
  slug: string,
  content: string,
): Promise<{ thinnerThanPrev: boolean }> {
  const path = resumeSidecarPath(root, slug);
  const prior = await storage.read(path);
  let thinnerThanPrev = false;
  if (prior !== null) {
    await storage.write(`${path}.prev`, prior);
    thinnerThanPrev = countBulletLines(content) < countBulletLines(prior);
  }
  await storage.write(path, content);
  return { thinnerThanPrev };
}

/**
 * Filesystem backstop (C1): true when ANY file under
 * `projects/active/<slug>/` OR the resume sidecar has a modified-time newer
 * than `openedAtIso`. This is the source of truth for "did anything change"
 * — the LLM `dirty` bit can only UPGRADE clean→dirty, never the reverse.
 */
export async function dirtyByMtime(
  storage: StorageAdapter,
  root: string,
  slug: string,
  openedAtIso: string,
): Promise<boolean> {
  const openedAt = new Date(openedAtIso).getTime();
  if (Number.isNaN(openedAt)) return false;

  const candidates: string[] = [];
  const projectDir = join(root, 'projects', 'active', slug);
  if (await storage.exists(projectDir)) {
    candidates.push(...(await storage.list(projectDir, { recursive: true })));
  }
  candidates.push(resumeSidecarPath(root, slug));

  for (const path of candidates) {
    const modified = await storage.getModified(path);
    if (modified && modified.getTime() > openedAt) return true;
  }
  return false;
}

/** `<root>/.arete/sessions/.last-greeting` — once/day greeting throttle stamp. */
function lastGreetingPath(root: string): string {
  return join(root, '.arete', 'sessions', '.last-greeting');
}

/** `<root>/.arete/sessions/` — the resume-sidecar directory. */
function sessionsDir(root: string): string {
  return join(root, '.arete', 'sessions');
}

/** YYYY-MM-DD for a date (UTC) — the once/day greeting key. */
function isoDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Statusline segment for the active project, or '' when none.
 *
 *   - no marker             -> ''
 *   - clean                 -> `▸ <slug>`
 *   - dirty (bit OR mtime)  -> `▸ <slug> · unsaved`
 *
 * C1 backstop: the `· unsaved` suffix shows when the LLM `dirty` bit is set OR
 * `dirtyByMtime(...)` detects a real edit — a stale-clean bit can never suppress
 * the marker that work is in flight.
 */
export async function statuslineSegment(storage: StorageAdapter, root: string): Promise<string> {
  const marker = await readActiveProjectMarker(storage, root);
  if (!marker) return '';
  const dirty = marker.dirty || (await dirtyByMtime(storage, root, marker.slug, marker.openedAt));
  return dirty ? `▸ ${marker.slug} · unsaved` : `▸ ${marker.slug}`;
}

export interface SessionStartResult {
  /** True when a stale active-project marker was wiped this run. */
  wipedMarker: boolean;
  /** Stale-marker advisory (null when nothing was wiped or the wipe was clean). */
  notice: string | null;
  /** Once/day "welcome back" greeting (null when not a startup or already greeted). */
  greeting: string | null;
}

/**
 * SessionStart handler. `now` is injected for testability.
 *
 * Two independent concerns:
 *   - Stale-marker wipe (startup|clear only): a marker left behind by a prior
 *     session is cleared; if it was dirty (bit OR mtime) we advise the resume
 *     note may be stale.
 *   - Greeting (startup only): once/day, offer to resume recently-touched
 *     projects that have a resume sidecar.
 */
export async function handleSessionStart(
  storage: StorageAdapter,
  root: string,
  opts: { source: string; now: Date },
): Promise<SessionStartResult> {
  const { source, now } = opts;

  let wipedMarker = false;
  let notice: string | null = null;

  // Stale-marker wipe — only on a fresh start or an explicit clear.
  if (source === 'startup' || source === 'clear') {
    const marker = await readActiveProjectMarker(storage, root);
    if (marker) {
      const dirty =
        marker.dirty || (await dirtyByMtime(storage, root, marker.slug, marker.openedAt));
      if (dirty) {
        notice = `You left \`${marker.slug}\` with unsaved work — its resume note may be stale. Re-open with \`/project ${marker.slug}\` to pick it back up.`;
      }
      await clearActiveProjectMarker(storage, root);
      wipedMarker = true;
    }
  }

  // Greeting — startup only.
  const greeting = source === 'startup' ? await buildStartupGreeting(storage, root, now) : null;

  return { wipedMarker, notice, greeting };
}

/**
 * Build the once/day "welcome back" greeting, or null. Stamps `.last-greeting`
 * ONLY when it actually emits a greeting (so a no-candidate run can still greet
 * later the same day once a recent project appears).
 *
 * H1 recency filter: a sidecar only seeds a greeting when its project README
 * was modified within `GREETING_RECENCY_DAYS` of `now`.
 */
async function buildStartupGreeting(
  storage: StorageAdapter,
  root: string,
  now: Date,
): Promise<string | null> {
  // Once/day throttle: already greeted today → nothing.
  const stamp = await storage.read(lastGreetingPath(root));
  if (stamp !== null && stamp.trim() === isoDay(now)) return null;

  const recencyFloor = now.getTime() - GREETING_RECENCY_DAYS * 24 * 60 * 60 * 1000;

  const files = await storage.list(sessionsDir(root));
  const candidates: Array<{ slug: string; sidecarMtime: number }> = [];
  for (const file of files) {
    if (!file.endsWith('.md') || file.endsWith('.md.prev')) continue;
    const slug = basename(file, '.md');
    const readmeMtime = await storage.getModified(join(root, 'projects', 'active', slug, 'README.md'));
    if (!readmeMtime || readmeMtime.getTime() < recencyFloor) continue;
    const sidecarMtime = await storage.getModified(file);
    candidates.push({ slug, sidecarMtime: sidecarMtime ? sidecarMtime.getTime() : 0 });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.sidecarMtime - a.sidecarMtime);
  const slugs = candidates.slice(0, GREETING_MAX_CANDIDATES).map((c) => c.slug);

  // Only stamp now that we're committed to emitting a greeting.
  await storage.write(lastGreetingPath(root), isoDay(now) + '\n');

  return (
    'Welcome back. Pick up where you left off? ' +
    slugs.map((s) => `\`/project ${s}\``).join(' or ')
  );
}
