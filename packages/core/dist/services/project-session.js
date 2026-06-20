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
import { join } from 'node:path';
/** `<root>/.claude/active-project.json`. */
export function activeProjectMarkerPath(root) {
    return join(root, '.claude', 'active-project.json');
}
/** `<root>/.arete/sessions/<slug>.md`. */
export function resumeSidecarPath(root, slug) {
    return join(root, '.arete', 'sessions', `${slug}.md`);
}
/**
 * Read the active-project marker. Returns undefined when absent OR malformed —
 * a corrupt marker must never throw (the open/close flows degrade to "no
 * active project" rather than crash).
 */
export async function readActiveProjectMarker(storage, root) {
    const content = await storage.read(activeProjectMarkerPath(root));
    if (!content)
        return undefined;
    try {
        const parsed = JSON.parse(content);
        if (typeof parsed.slug !== 'string' ||
            typeof parsed.name !== 'string' ||
            typeof parsed.openedAt !== 'string') {
            return undefined;
        }
        return {
            slug: parsed.slug,
            name: parsed.name,
            openedAt: parsed.openedAt,
            dirty: parsed.dirty === true,
        };
    }
    catch {
        return undefined;
    }
}
/** Write (overwrite) the active-project marker. */
export async function writeActiveProjectMarker(storage, root, marker) {
    await storage.write(activeProjectMarkerPath(root), JSON.stringify(marker, null, 2) + '\n');
}
/**
 * Read-modify-write the marker's `dirty` bit to true. No-op when there is no
 * marker (nothing is open → nothing to mark dirty).
 */
export async function setActiveProjectMarkerDirty(storage, root) {
    const marker = await readActiveProjectMarker(storage, root);
    if (!marker)
        return;
    if (marker.dirty)
        return;
    await writeActiveProjectMarker(storage, root, { ...marker, dirty: true });
}
/** Delete the active-project marker. No-op when absent. */
export async function clearActiveProjectMarker(storage, root) {
    const path = activeProjectMarkerPath(root);
    if (!(await storage.exists(path)))
        return;
    await storage.delete(path);
}
/** Read the resume sidecar for a project. Undefined when absent. */
export async function readResumeSidecar(storage, root, slug) {
    const content = await storage.read(resumeSidecarPath(root, slug));
    return content ?? undefined;
}
/** Count markdown bullet lines (`- ` / `* `) — the thinness signal. */
function countBulletLines(content) {
    let count = 0;
    for (const line of content.split('\n')) {
        if (/^\s*[-*]\s+/.test(line))
            count++;
    }
    return count;
}
/**
 * Write the resume sidecar. Before overwriting an existing sidecar, copy it to
 * `<slug>.md.prev` (single-deep backup). Returns `thinnerThanPrev: true` when
 * the NEW content has fewer markdown bullet lines than the prior — the signal
 * the close flow uses to warn before clobbering a richer handoff.
 */
export async function writeResumeSidecar(storage, root, slug, content) {
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
export async function dirtyByMtime(storage, root, slug, openedAtIso) {
    const openedAt = new Date(openedAtIso).getTime();
    if (Number.isNaN(openedAt))
        return false;
    const candidates = [];
    const projectDir = join(root, 'projects', 'active', slug);
    if (await storage.exists(projectDir)) {
        candidates.push(...(await storage.list(projectDir, { recursive: true })));
    }
    candidates.push(resumeSidecarPath(root, slug));
    for (const path of candidates) {
        const modified = await storage.getModified(path);
        if (modified && modified.getTime() > openedAt)
            return true;
    }
    return false;
}
//# sourceMappingURL=project-session.js.map