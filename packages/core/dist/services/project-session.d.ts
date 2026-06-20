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
import type { StorageAdapter } from '../storage/adapter.js';
/** H1: only projects whose README was touched within this window seed a greeting. */
export declare const GREETING_RECENCY_DAYS = 14;
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
export declare function activeProjectMarkerPath(root: string): string;
/** `<root>/.arete/sessions/<slug>.md`. */
export declare function resumeSidecarPath(root: string, slug: string): string;
/**
 * Read the active-project marker. Returns undefined when absent OR malformed —
 * a corrupt marker must never throw (the open/close flows degrade to "no
 * active project" rather than crash).
 */
export declare function readActiveProjectMarker(storage: StorageAdapter, root: string): Promise<ActiveProjectMarker | undefined>;
/** Write (overwrite) the active-project marker. */
export declare function writeActiveProjectMarker(storage: StorageAdapter, root: string, marker: ActiveProjectMarker): Promise<void>;
/**
 * Read-modify-write the marker's `dirty` bit to true. No-op when there is no
 * marker (nothing is open → nothing to mark dirty).
 */
export declare function setActiveProjectMarkerDirty(storage: StorageAdapter, root: string): Promise<void>;
/** Delete the active-project marker. No-op when absent. */
export declare function clearActiveProjectMarker(storage: StorageAdapter, root: string): Promise<void>;
/** Read the resume sidecar for a project. Undefined when absent. */
export declare function readResumeSidecar(storage: StorageAdapter, root: string, slug: string): Promise<string | undefined>;
/**
 * Write the resume sidecar. Before overwriting an existing sidecar, copy it to
 * `<slug>.md.prev` (single-deep backup). Returns `thinnerThanPrev: true` when
 * the NEW content has fewer markdown bullet lines than the prior — the signal
 * the close flow uses to warn before clobbering a richer handoff.
 */
export declare function writeResumeSidecar(storage: StorageAdapter, root: string, slug: string, content: string): Promise<{
    thinnerThanPrev: boolean;
}>;
/**
 * Filesystem backstop (C1): true when ANY file under
 * `projects/active/<slug>/` OR the resume sidecar has a modified-time newer
 * than `openedAtIso`. This is the source of truth for "did anything change"
 * — the LLM `dirty` bit can only UPGRADE clean→dirty, never the reverse.
 */
export declare function dirtyByMtime(storage: StorageAdapter, root: string, slug: string, openedAtIso: string): Promise<boolean>;
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
export declare function statuslineSegment(storage: StorageAdapter, root: string): Promise<string>;
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
export declare function handleSessionStart(storage: StorageAdapter, root: string, opts: {
    source: string;
    now: Date;
}): Promise<SessionStartResult>;
//# sourceMappingURL=project-session.d.ts.map