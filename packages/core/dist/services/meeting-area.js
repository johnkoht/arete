/**
 * Meeting area backfill helpers (Phase 13 AC2/AC3).
 *
 * Third instantiation of the backfill contract (after `commitments
 * backfill-area` and `project-area.ts`): list area-less meetings with the
 * inference inputs `suggestAreaForMeeting` needs, write the `area:` +
 * `area_set_by:` provenance pair into meeting frontmatter, and selectively
 * reset ONLY backfill-stamped areas.
 *
 * Differences from the project backfill, both deliberate:
 *  - Writes go through `writeWithLock` (meeting files are mutated by
 *    extract/approve concurrently) with `mtimeGuardSeconds: 0` — set-area
 *    and backfill are explicit user-gated commands that own exactly two
 *    keys, and the default 60s guard would silently no-op the designed
 *    process→set-area sequence (pre-mortem D4).
 *  - Same-values rerun performs ZERO write calls (review finding 2 —
 *    deliberately STRONGER than the project backfill's identical-content
 *    guarantee, because meeting backfill can touch hundreds of committed
 *    files).
 *
 * No direct `fs` — all I/O through StorageAdapter (services invariant);
 * `writeWithLock` owns its own locked read/write internals.
 */
import { join, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { writeWithLock } from './meeting-lock.js';
const FM_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
function parseMeetingFm(content) {
    const match = content.match(FM_BLOCK);
    if (!match)
        return { fm: {}, body: content };
    try {
        return {
            fm: (parseYaml(match[1]) ?? {}),
            body: match[2] ?? '',
        };
    }
    catch {
        return { fm: {}, body: match[2] ?? '' };
    }
}
function parseTopics(raw) {
    if (Array.isArray(raw)) {
        return raw.map((t) => String(t).trim()).filter((t) => t.length > 0);
    }
    if (typeof raw === 'string') {
        return raw
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
    }
    return [];
}
function meetingDate(fm, filePath) {
    if (typeof fm.date === 'string' && fm.date.length >= 10)
        return fm.date.slice(0, 10);
    if (fm.date instanceof Date)
        return fm.date.toISOString().slice(0, 10);
    const m = basename(filePath).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
}
/**
 * List area-less meetings annotated for backfill (candidate filter:
 * meetings WITH a non-empty `area:` are never candidates — this excludes
 * the ~96 legacy capture-flow carriers and makes apply rerun a no-op at
 * the listing level). Phase 13 AC3.
 *
 * @param opts.sinceDay  Optional YYYY-MM-DD cutoff (`--days` limiter);
 *                       meetings dated strictly before it are skipped.
 *                       Undated meetings are kept (honest: age unknown).
 * @param opts.areaSlugs Known area slugs, used to fill
 *                       `alsoMatchesViaTopics` (D2 preview column).
 */
export async function listMeetingsForBackfill(storage, paths, opts = {}) {
    const meetingsDir = join(paths.resources, 'meetings');
    if (!(await storage.exists(meetingsDir)))
        return [];
    const areaSet = new Set(opts.areaSlugs ?? []);
    const out = [];
    for (const filePath of await storage.list(meetingsDir, { extensions: ['.md'] })) {
        const file = basename(filePath);
        if (file === 'index.md')
            continue;
        const content = await storage.read(filePath);
        if (!content)
            continue;
        const { fm, body } = parseMeetingFm(content);
        if (typeof fm.area === 'string' && fm.area.trim().length > 0)
            continue; // not a candidate
        const date = meetingDate(fm, filePath);
        if (opts.sinceDay && date && date < opts.sinceDay)
            continue;
        const topics = parseTopics(fm.topics);
        out.push({
            path: filePath,
            file,
            title: typeof fm.title === 'string' && fm.title.trim().length > 0
                ? fm.title.trim()
                : file.replace(/\.md$/, ''),
            date,
            summary: typeof fm.summary === 'string' ? fm.summary : undefined,
            body,
            topics,
            alsoMatchesViaTopics: topics.filter((t) => areaSet.has(t)),
        });
    }
    // Newest first — matches preview-table reading order.
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return out;
}
/**
 * Per-match-type qualification for meeting backfill (pre-mortem D1).
 *
 * With the inherited 0.7 floor, every non-recurring proposal is a 0.8
 * name-substring match — so signal policy IS the precision lever here:
 *  - below floor → unqualified (`below-floor`);
 *  - uncorroborated `area-name-summary` → unqualified
 *    (`summary-name-only`) — a bare summary mention is structurally the
 *    same tangentiality as the observed topic-leak;
 *  - uncorroborated `area-name-title` → qualified but flagged
 *    `nameOnly` (`title-name-only`) for the preview spot-check;
 *  - everything else (recurring title, corroborated matches, qualifying
 *    keyword matches) → qualified, unflagged.
 *
 * STRICTER than the floor, never looser — the floor stays non-negotiable.
 */
export function qualifyMeetingAreaMatch(match, floor = 0.7) {
    if (match.confidence < floor) {
        return { qualified: false, nameOnly: false, reason: 'below-floor' };
    }
    if (match.signal === 'area-name-summary' && !match.corroborated) {
        return { qualified: false, nameOnly: true, reason: 'summary-name-only' };
    }
    if (match.signal === 'area-name-title' && !match.corroborated) {
        return { qualified: true, nameOnly: true, reason: 'title-name-only' };
    }
    return { qualified: true, nameOnly: false };
}
/**
 * Write `area:` + `area_set_by:` into a meeting's frontmatter under the
 * meeting lock, preserving body bytes and all other frontmatter keys
 * (writeWithLock shallow-merge contract). Phase 13 AC2/AC3.
 *
 * - Same-values rerun → mutator abstains BEFORE serialization: zero
 *   write calls, byte-identical file (review finding 2).
 * - `mtimeGuardSeconds: 0` — explicit user-gated write owning exactly two
 *   keys; the default 60s guard would silently swallow the designed
 *   process→set-area sequence (pre-mortem D4). Callers MUST surface
 *   `written: false` results.
 */
export async function applyAreaToMeeting(storage, meetingPath, areaSlug, setBy) {
    const result = await writeWithLock(storage, meetingPath, async ({ frontmatter }) => {
        if (frontmatter['area'] === areaSlug && frontmatter['area_set_by'] === setBy) {
            return { abstain: 'noop-same-values' };
        }
        return { frontmatter: { area: areaSlug, area_set_by: setBy } };
    }, { mtimeGuardSeconds: 0 });
    return {
        written: result.written,
        noop: result.abstainReason === 'noop-same-values',
        abstainReason: result.abstainReason === 'noop-same-values' ? undefined : result.abstainReason,
    };
}
/**
 * Clear `area` + `area_set_by` ONLY on meetings stamped
 * `area_set_by: backfill`. `approval`/`manual` provenance and the legacy
 * capture-flow carriers (no `area_set_by` at all) are left intact
 * (AC3 `--reset` contract; pre-mortem D6 implication 3).
 */
export async function resetBackfilledMeetingAreas(storage, paths) {
    const meetingsDir = join(paths.resources, 'meetings');
    const reset = [];
    if (!(await storage.exists(meetingsDir)))
        return { reset };
    for (const filePath of await storage.list(meetingsDir, { extensions: ['.md'] })) {
        if (basename(filePath) === 'index.md')
            continue;
        const content = await storage.read(filePath);
        if (!content)
            continue;
        const { fm } = parseMeetingFm(content);
        if (fm['area_set_by'] !== 'backfill')
            continue;
        const result = await writeWithLock(storage, filePath, async () => ({ frontmatter: { area: undefined, area_set_by: undefined } }), { mtimeGuardSeconds: 0 });
        if (result.written)
            reset.push(basename(filePath));
    }
    return { reset };
}
//# sourceMappingURL=meeting-area.js.map