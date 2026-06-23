/**
 * Week-memory store — durable interpretive overrides for the current week.
 *
 * Backs `now/week-memory.md`: the small, agent-managed set of corrections,
 * deprioritizations, and week-shape constraints that a fresh daily-plan agent
 * would otherwise re-derive wrong (see dev/work/plans/weekly-working-memory/).
 *
 * All I/O goes through StorageAdapter — this module NEVER imports `fs`
 * directly (Core PROFILE invariant). It mirrors the commitments store pattern
 * (id = sha256-prefix, list/resolve shape) but persists to a user-visible
 * markdown-with-frontmatter file in `now/` rather than JSON in `.arete/`.
 *
 * The backing file is YAML frontmatter (a `week` stamp + an `entries` list)
 * followed by a short human-readable header. The frontmatter is the source of
 * truth; the body is a glance for John.
 */
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { isoWeekStamp } from '../utils/dates.js';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Live store, relative to the workspace root. */
export const WEEK_MEMORY_FILE = 'now/week-memory.md';
/** Archive directory for prior-week stores, relative to the workspace root. */
export const WEEK_MEMORY_ARCHIVE_DIR = 'now/archive/week-plan';
const FILE_HEADER = `# Week Memory

<!-- AGENT-MANAGED. Do not hand-edit; use \`arete week-memory\`. -->
<!-- Interpretive overrides for the CURRENT week: corrections, deprioritizations, -->
<!-- and week-shape constraints a fresh daily-plan agent would re-derive wrong. -->
<!-- Spun up at week-plan, pruned by daily-winddown, archived at weekly-winddown. -->
<!-- This is NOT the sacred user-owned Notes section and NOT part of week.md. -->
`;
const defaultClock = () => new Date();
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/**
 * Stable id for an entry. Mirrors the commitments sha256-prefix convention.
 * Keyed on type+statement+created so two genuinely distinct captures never
 * collide, while dedup (type+statement, active) is handled separately.
 */
function computeEntryId(type, statement, created) {
    const normalized = statement.toLowerCase().trim().replace(/\s+/g, ' ');
    return createHash('sha256')
        .update(`${type}|${normalized}|${created}`)
        .digest('hex')
        .slice(0, 8);
}
/**
 * Parse the frontmatter block from the live file. Tolerant: a missing file,
 * absent frontmatter, or malformed YAML all yield an empty store rather than
 * throwing (the read path must never throw — Risk 4 / commitments parity).
 */
function parseFile(content) {
    if (content === null || content.trim() === '') {
        return { week: null, entries: [] };
    }
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) {
        return { week: null, entries: [] };
    }
    let fm;
    try {
        fm = parseYaml(match[1]) ?? {};
    }
    catch {
        return { week: null, entries: [] };
    }
    const week = typeof fm.week === 'string' ? fm.week : null;
    const rawEntries = Array.isArray(fm.entries) ? fm.entries : [];
    const entries = [];
    for (const raw of rawEntries) {
        if (!raw || typeof raw !== 'object')
            continue;
        const e = raw;
        if (typeof e.id !== 'string' ||
            typeof e.type !== 'string' ||
            typeof e.statement !== 'string' ||
            typeof e.why !== 'string' ||
            typeof e.status !== 'string' ||
            typeof e.created !== 'string') {
            continue;
        }
        entries.push({
            id: e.id,
            type: e.type,
            statement: e.statement,
            why: e.why,
            ...(typeof e.suppresses === 'string' && e.suppresses.length > 0
                ? { suppresses: e.suppresses }
                : {}),
            status: e.status,
            created: e.created,
            week: typeof e.week === 'string' ? e.week : week ?? '',
        });
    }
    return { week, entries };
}
/**
 * Serialize the store back to markdown-with-frontmatter. `week` is the live
 * stamp for the file (the latest entry's week, or the current week when empty).
 */
function serializeFile(week, entries) {
    const fmData = {
        week,
        entries: entries.map((e) => ({
            id: e.id,
            type: e.type,
            statement: e.statement,
            why: e.why,
            ...(e.suppresses ? { suppresses: e.suppresses } : {}),
            status: e.status,
            created: e.created,
            week: e.week,
        })),
    };
    const yaml = stringifyYaml(fmData).trimEnd();
    return `---\n${yaml}\n---\n\n${FILE_HEADER}`;
}
async function writeStore(storage, root, week, entries) {
    const path = join(root, WEEK_MEMORY_FILE);
    await storage.write(path, serializeFile(week, entries));
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Read all entries (active + resolved). Returns [] when the file is absent,
 * empty, or unparseable — never throws.
 */
export async function readWeekMemory(storage, root) {
    const content = await storage.read(join(root, WEEK_MEMORY_FILE));
    return parseFile(content).entries;
}
/**
 * List entries, optionally filtered by active status.
 * `{ active: true }` returns only active entries; `{ active: false }` returns
 * only resolved; omitting `active` returns all.
 */
export async function listWeekMemory(storage, root, opts = {}) {
    const entries = await readWeekMemory(storage, root);
    if (opts.active === undefined)
        return entries;
    const want = opts.active ? 'active' : 'resolved';
    return entries.filter((e) => e.status === want);
}
/**
 * Append an entry. Dedup: an identical active entry (same `type`+`statement`,
 * case-insensitive) is a no-op that returns the existing entry. The created
 * entry carries a generated id, `status: 'active'`, and the current ISO week.
 */
export async function addWeekMemoryEntry(storage, root, input, clock = defaultClock) {
    const content = await storage.read(join(root, WEEK_MEMORY_FILE));
    const { entries } = parseFile(content);
    const normStatement = input.statement.toLowerCase().trim().replace(/\s+/g, ' ');
    const existing = entries.find((e) => e.status === 'active' &&
        e.type === input.type &&
        e.statement.toLowerCase().trim().replace(/\s+/g, ' ') === normStatement);
    if (existing) {
        return { entry: existing, deduped: true };
    }
    const now = clock();
    const created = now.toISOString();
    const week = isoWeekStamp(now);
    const entry = {
        id: computeEntryId(input.type, input.statement, created),
        type: input.type,
        statement: input.statement,
        why: input.why,
        ...(input.suppresses && input.suppresses.length > 0
            ? { suppresses: input.suppresses }
            : {}),
        status: 'active',
        created,
        week,
    };
    const next = [...entries, entry];
    await writeStore(storage, root, week, next);
    return { entry, deduped: false };
}
/**
 * Flip an entry's status to `resolved` WITHOUT deleting it (retire, not erase).
 * No-op when already resolved or when the id is unknown. `id` may be a full id
 * or an 8-char prefix (commitments parity).
 */
export async function resolveWeekMemory(storage, root, id, clock = defaultClock) {
    const content = await storage.read(join(root, WEEK_MEMORY_FILE));
    const { week, entries } = parseFile(content);
    const idx = entries.findIndex((e) => e.id === id || e.id.startsWith(id));
    if (idx === -1) {
        return { entry: null, outcome: 'unknown' };
    }
    const target = entries[idx];
    if (target.status === 'resolved') {
        return { entry: target, outcome: 'already' };
    }
    const updated = { ...target, status: 'resolved' };
    const next = [...entries];
    next[idx] = updated;
    const liveWeek = week ?? isoWeekStamp(clock());
    await writeStore(storage, root, liveWeek, next);
    return { entry: updated, outcome: 'resolved' };
}
/**
 * Week-stamped, idempotent archive (Risk 2).
 *
 * Reads the live file's week stamp. If it equals the CURRENT ISO week (a
 * same-week re-run), this is a NO-OP — active overrides are preserved. Only
 * when the live stamp is a PRIOR week does it move the entries to
 * `now/archive/week-plan/week-memory-YYYY-Www.md` and reset the live file
 * empty (stamped with the current week).
 *
 * The current-week determination is injectable via `clock` so the boundary is
 * testable without the wall clock.
 */
export async function archiveWeekMemory(storage, root, clock = defaultClock) {
    const livePath = join(root, WEEK_MEMORY_FILE);
    const content = await storage.read(livePath);
    const { week, entries } = parseFile(content);
    const currentWeek = isoWeekStamp(clock());
    // Nothing to archive (absent file, freshly-seeded `week: ""` store, or a
    // store with no entries): skip. Archiving zero entries is never useful, and
    // a blank/seeded week stamp must not produce a malformed `week-memory-.md`.
    if (entries.length === 0) {
        return { skipped: true, reason: 'empty' };
    }
    const liveWeek = week ?? currentWeek;
    // Same-week (or future-stamped) re-run: no-op — never wipe active overrides.
    if (liveWeek === currentWeek) {
        return { skipped: true, reason: 'current-week' };
    }
    // Prior week: move to the dated archive and reset the live file.
    const archivePath = join(root, WEEK_MEMORY_ARCHIVE_DIR, `week-memory-${liveWeek}.md`);
    await storage.write(archivePath, serializeFile(liveWeek, entries));
    await writeStore(storage, root, currentWeek, []);
    return {
        skipped: false,
        archivePath,
        archivedWeek: liveWeek,
        movedCount: entries.length,
    };
}
//# sourceMappingURL=week-memory.js.map