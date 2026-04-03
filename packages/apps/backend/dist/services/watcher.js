/**
 * File watchers for the backend:
 *
 * 1. Meeting file watcher — watches resources/meetings/ for new synced files
 *    and queues them for auto-processing.
 * 2. Task file watcher — watches now/week.md and now/tasks.md for changes
 *    and broadcasts SSE events for UI cache invalidation.
 *
 * Uses Node.js fs.watch (no external deps). Debounces reads to handle
 * partial-write races.
 */
import { watch } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function parseFrontmatterStatus(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!match)
        return null;
    try {
        const data = parseYaml(match[1]);
        return typeof data['status'] === 'string' ? data['status'] : null;
    }
    catch {
        return null;
    }
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Start watching the meetings directory for new `status: synced` files.
 *
 * When a new (or changed) .md file is detected with `status: synced` in its
 * frontmatter, calls `onNew(slug)` once (deduped by slug in memory).
 *
 * Returns a cleanup function that stops the watcher.
 *
 * @param workspaceRoot - Absolute path to workspace root
 * @param onNew - Callback invoked with the meeting slug (filename without .md)
 * @param deps - Injectable dependencies for testing
 */
export function startMeetingWatcher(workspaceRoot, onNew, deps = {}) {
    const { fswatchFn = watch, readFileFn = (p, enc) => readFile(p, enc), } = deps;
    const meetingsDir = join(workspaceRoot, 'resources', 'meetings');
    // Track slugs we've already queued to avoid double-processing
    const queued = new Set();
    // Debounce timers: filename → timer handle
    const timers = new Map();
    function handleFile(filename) {
        if (extname(filename) !== '.md')
            return;
        const slug = basename(filename, '.md');
        // Clear existing debounce timer for this file
        const existing = timers.get(filename);
        if (existing)
            clearTimeout(existing);
        const timer = setTimeout(async () => {
            timers.delete(filename);
            if (queued.has(slug))
                return;
            const filePath = join(meetingsDir, filename);
            let content;
            try {
                content = await readFileFn(filePath, 'utf8');
            }
            catch {
                // File may have been deleted or moved — ignore
                return;
            }
            const status = parseFrontmatterStatus(content);
            if (status !== 'synced')
                return;
            queued.add(slug);
            onNew(slug);
        }, 500);
        timers.set(filename, timer);
    }
    let watcher = null;
    try {
        watcher = fswatchFn(meetingsDir, { recursive: true }, (event, filename) => {
            if (!filename)
                return;
            // Normalize path separators (Windows compat)
            const normalized = filename.replace(/\\/g, '/');
            // Only handle the filename part (not subdirectory paths)
            const base = normalized.split('/').pop();
            if (!base)
                return;
            handleFile(base);
        });
    }
    catch {
        // Meetings dir doesn't exist yet — watcher not started, return noop
        return () => {
            // Clear any pending timers
            for (const t of timers.values())
                clearTimeout(t);
            timers.clear();
        };
    }
    return () => {
        watcher?.close();
        for (const t of timers.values())
            clearTimeout(t);
        timers.clear();
    };
}
/**
 * Start watching task files (now/week.md and now/tasks.md) for changes.
 *
 * When either file changes, calls `onChange(filename)` with the base filename
 * (e.g. 'week.md' or 'tasks.md'). Debounced at 500ms per file to coalesce
 * rapid writes.
 *
 * Watches the `now/` directory rather than individual files so that file
 * creation/deletion is also detected (fs.watch on a nonexistent file would fail).
 *
 * Returns a cleanup function that stops the watcher.
 *
 * @param workspaceRoot - Absolute path to workspace root
 * @param onChange - Callback invoked with the changed filename ('week.md' or 'tasks.md')
 * @param deps - Injectable dependencies for testing
 */
export function startTaskFileWatcher(workspaceRoot, onChange, deps = {}) {
    const { fswatchFn = watch, } = deps;
    const nowDir = join(workspaceRoot, 'now');
    // Only watch these specific files
    const WATCHED_FILES = new Set(['week.md', 'tasks.md']);
    // Debounce timers per filename
    const timers = new Map();
    function handleFile(filename) {
        if (!WATCHED_FILES.has(filename))
            return;
        // Clear existing debounce timer for this file
        const existing = timers.get(filename);
        if (existing)
            clearTimeout(existing);
        const timer = setTimeout(() => {
            timers.delete(filename);
            onChange(filename);
        }, 500);
        timers.set(filename, timer);
    }
    let watcher = null;
    try {
        watcher = fswatchFn(nowDir, { recursive: false }, (_event, filename) => {
            if (!filename)
                return;
            // Normalize path separators (Windows compat)
            const normalized = filename.replace(/\\/g, '/');
            const base = normalized.split('/').pop();
            if (!base)
                return;
            handleFile(base);
        });
    }
    catch {
        // now/ dir doesn't exist yet — watcher not started, return noop
        return () => {
            for (const t of timers.values())
                clearTimeout(t);
            timers.clear();
        };
    }
    return () => {
        watcher?.close();
        for (const t of timers.values())
            clearTimeout(t);
        timers.clear();
    };
}
