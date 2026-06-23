/**
 * Meeting series resolver (single-pass-extraction W1.5).
 *
 * Links a meeting to its prior occurrences in the same recurring series —
 * a linkage that did not exist before this module: `loadRecentMeetingBatch`
 * is a flat date window with no series concept, so "Anthony 1:1 6/9" related
 * to "Anthony 1:1 6/2" exactly as much as to any unrelated meeting.
 *
 * Matching (BOTH must hold — the conjunction is the AC13 negative case:
 * an ad-hoc John+Anthony escalation shares attendees with the weekly but
 * not the title, and must NOT receive series context):
 *   1. Title similarity: token Jaccard over normalized titles ≥
 *      SERIES_TITLE_JACCARD, OR both titles match the same
 *      `recurring_meetings[].title` entry from area config (substring,
 *      case-insensitive — same convention as area-parser).
 *   2. Attendee overlap: overlap coefficient (|∩| / min size) ≥
 *      SERIES_ATTENDEE_OVERLAP, evaluated whenever BOTH sides carry
 *      attendee metadata. When the TARGET has attendees but the candidate
 *      has none, the overlap gate cannot run and the title gate is
 *      tightened to Jaccard ≥ SERIES_TITLE_JACCARD_NO_ATTENDEE (0.7) to
 *      compensate (an explicit shared recurring-config match still passes).
 *      When the TARGET itself has no attendee metadata, the title gate
 *      alone decides (current behavior, unchanged).
 *
 * Window: candidates strictly BEFORE the target date, within
 * SERIES_WINDOW_DAYS (~35 days — catches biweeklies and a skipped week).
 * Same-day meetings are NOT series context (they are priorItems).
 *
 * excludePath trap (LEARNINGS.md 2026-04-29): the target meeting is excluded
 * by strict `===` against the paths emitted by `storage.list(meetingsDir)`.
 * Callers MUST pass `meetingPath` exactly as `storage.list` would emit it —
 * no `path.resolve()` / `path.normalize()`, which silently miss the match
 * for symlinked or `./`-prefixed inputs.
 */
import { parse as parseYaml } from 'yaml';
import { extractIntelligenceFromFrontmatter } from './meeting-reconciliation.js';
// ---------------------------------------------------------------------------
// Constants (exported for tests)
// ---------------------------------------------------------------------------
export const SERIES_WINDOW_DAYS = 35;
export const SERIES_TITLE_JACCARD = 0.5;
/**
 * Stricter title bar for the asymmetric attendee case (review should-fix 4):
 * when the target carries attendee metadata but a candidate has none, the
 * attendee gate cannot corroborate the match, so the title must clear this
 * higher bar instead of SERIES_TITLE_JACCARD.
 */
export const SERIES_TITLE_JACCARD_NO_ATTENDEE = 0.7;
export const SERIES_ATTENDEE_OVERLAP = 0.5;
/** Max prior same-series meetings returned (newest first). */
export const SERIES_MAX_PRIOR = 2;
/** Generic title tokens that carry no series identity. */
const TITLE_STOP_TOKENS = new Set([
    'meeting', 'call', 'sync', 'weekly', 'biweekly', 'monthly', 'daily',
    'and', 'the', 'a', 'an', 'of', 'with', 'on', 'for', 're',
]);
// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------
/**
 * Normalize a meeting title to identity-bearing tokens.
 * Strips a leading YYYY-MM-DD prefix, lowercases, splits on non-alphanumerics
 * (keeping digit groups like "1 1" from "1:1" — "1:1" → tokens "1","1" which
 * collapse in a Set; acceptable: "1:1" identity comes from the names), and
 * drops generic stop tokens and pure date tokens.
 */
export function normalizeTitleTokens(raw) {
    const noDate = raw.replace(/^\d{4}-\d{2}-\d{2}[-_\s]*/, '');
    const tokens = noDate
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 0)
        .filter((t) => !TITLE_STOP_TOKENS.has(t))
        .filter((t) => !/^\d{4}$/.test(t)); // bare years
    return new Set(tokens);
}
/** Token-set Jaccard over normalized titles. Empty ∪ empty = 0. */
export function titleSimilarity(a, b) {
    const ta = normalizeTitleTokens(a);
    const tb = normalizeTitleTokens(b);
    if (ta.size === 0 || tb.size === 0)
        return 0;
    let intersection = 0;
    for (const t of ta)
        if (tb.has(t))
            intersection++;
    const union = ta.size + tb.size - intersection;
    return union === 0 ? 0 : intersection / union;
}
/**
 * Normalize one attendee token to a comparable identity: the name part
 * before any `<email>` / `(...)` suffix, lowercased and whitespace-collapsed.
 * Falls back to the email itself when there is no name part.
 */
export function normalizeAttendee(raw) {
    const beforeEmail = raw.split('<')[0].split('(')[0].trim();
    const base = beforeEmail.length > 0 ? beforeEmail : raw.trim();
    return base.toLowerCase().replace(/\s+/g, ' ');
}
/**
 * Overlap coefficient (|A ∩ B| / min(|A|,|B|)) over normalized attendees.
 * Returns null when either side is empty (no attendee evidence).
 */
export function attendeeOverlap(a, b) {
    const sa = new Set(a.map(normalizeAttendee).filter((s) => s.length > 0));
    const sb = new Set(b.map(normalizeAttendee).filter((s) => s.length > 0));
    if (sa.size === 0 || sb.size === 0)
        return null;
    let intersection = 0;
    for (const t of sa)
        if (sb.has(t))
            intersection++;
    return intersection / Math.min(sa.size, sb.size);
}
/** Case-insensitive substring match against recurring_meetings titles. */
export function matchesRecurringTitle(title, recurringTitles) {
    const lower = title.toLowerCase();
    for (const rt of recurringTitles) {
        const r = rt.trim().toLowerCase();
        if (r.length === 0)
            continue;
        if (lower.includes(r) || r.includes(lower))
            return rt;
    }
    return null;
}
/** Parse `## Open Questions` bullets (with or without oq_NNN ids). */
export function parseOpenQuestionsSection(body) {
    const headerMatch = body.match(/^##\s+Open Questions\s*$/im);
    if (!headerMatch || headerMatch.index === undefined)
        return [];
    const after = body.slice(headerMatch.index + headerMatch[0].length);
    const boundary = after.match(/\n##\s/);
    const section = boundary && boundary.index !== undefined ? after.slice(0, boundary.index) : after;
    const out = [];
    for (const line of section.split('\n')) {
        const m = line.match(/^\s*-\s+(?:oq_\d+:\s*)?(.+)$/);
        if (m && m[1].trim())
            out.push(m[1].trim());
    }
    return out;
}
// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------
function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match)
        return { frontmatter: {}, body: content };
    try {
        return {
            frontmatter: (parseYaml(match[1]) ?? {}),
            body: match[2],
        };
    }
    catch {
        return { frontmatter: {}, body: content };
    }
}
function attendeesFromFrontmatter(frontmatter) {
    if (!Array.isArray(frontmatter.attendees))
        return [];
    return frontmatter.attendees.filter((a) => typeof a === 'string');
}
function titleFromMeeting(frontmatter, filePath) {
    if (typeof frontmatter.title === 'string' && frontmatter.title.trim()) {
        return frontmatter.title.trim();
    }
    const filename = filePath.split('/').pop() ?? '';
    return filename
        .replace(/\.md$/, '')
        .replace(/^\d{4}-\d{2}-\d{2}[-_]?/, '')
        .replace(/-/g, ' ');
}
function dateFromMeeting(frontmatter, filePath) {
    if (typeof frontmatter.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(frontmatter.date)) {
        return frontmatter.date.slice(0, 10);
    }
    const filename = filePath.split('/').pop() ?? '';
    const m = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
}
// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------
/**
 * Resolve the prior same-series meetings for `meetingPath`.
 *
 * @param storage - storage adapter
 * @param meetingsDir - meetings directory (e.g., `<root>/resources/meetings`)
 * @param meetingPath - target meeting path EXACTLY as `storage.list` emits it
 *   (strict-=== exclusion — see module JSDoc for the LEARNINGS.md trap)
 * @param opts.recurringTitles - `recurring_meetings[].title` entries from
 *   area config; lets explicitly-configured series match even when titles
 *   drift below the Jaccard threshold
 * @returns SeriesResolution or null when no series is found
 */
export async function resolveMeetingSeries(storage, meetingsDir, meetingPath, opts) {
    const windowDays = opts?.windowDays ?? SERIES_WINDOW_DAYS;
    const maxPrior = opts?.maxPrior ?? SERIES_MAX_PRIOR;
    const recurringTitles = opts?.recurringTitles ?? [];
    const targetContent = await storage.read(meetingPath);
    if (!targetContent)
        return null;
    const target = parseFrontmatter(targetContent);
    const targetTitle = titleFromMeeting(target.frontmatter, meetingPath);
    const targetDate = dateFromMeeting(target.frontmatter, meetingPath);
    if (!targetDate)
        return null;
    const targetAttendees = attendeesFromFrontmatter(target.frontmatter);
    const targetHasAttendees = targetAttendees.map(normalizeAttendee).filter((s) => s.length > 0).length > 0;
    const targetRecurring = matchesRecurringTitle(targetTitle, recurringTitles);
    const cutoff = new Date(targetDate + 'T00:00:00');
    cutoff.setDate(cutoff.getDate() - windowDays);
    const files = await storage.list(meetingsDir, { extensions: ['.md'] });
    const candidates = [];
    for (const filePath of files) {
        // Strict === against storage.list output — the excludePath trap.
        if (filePath === meetingPath)
            continue;
        const filename = filePath.split('/').pop() ?? '';
        const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
        if (!dateMatch)
            continue;
        const candidateDate = dateMatch[1];
        // Strictly BEFORE the target date (same-day = priorItems, not series),
        // and within the window.
        if (candidateDate >= targetDate)
            continue;
        if (new Date(candidateDate + 'T00:00:00') < cutoff)
            continue;
        const content = await storage.read(filePath);
        if (!content)
            continue;
        const parsed = parseFrontmatter(content);
        const candidateTitle = titleFromMeeting(parsed.frontmatter, filePath);
        const candidateAttendees = attendeesFromFrontmatter(parsed.frontmatter);
        // Gate 1: title similarity OR shared recurring-config entry.
        const sim = titleSimilarity(targetTitle, candidateTitle);
        const candidateRecurring = matchesRecurringTitle(candidateTitle, recurringTitles);
        const sharedRecurring = targetRecurring !== null && candidateRecurring !== null && targetRecurring === candidateRecurring;
        if (sim < SERIES_TITLE_JACCARD && !sharedRecurring)
            continue;
        // Gate 2: attendee overlap (when both sides carry attendee metadata).
        // Asymmetric case (review should-fix 4): when the TARGET has attendees
        // but the candidate has none, the overlap gate cannot corroborate —
        // require the stricter title bar instead (explicit shared recurring
        // config still passes). When the TARGET has no attendee metadata, the
        // title gate alone decides (unchanged).
        const overlap = attendeeOverlap(targetAttendees, candidateAttendees);
        if (overlap !== null) {
            if (overlap < SERIES_ATTENDEE_OVERLAP)
                continue;
        }
        else if (targetHasAttendees) {
            if (!sharedRecurring && sim < SERIES_TITLE_JACCARD_NO_ATTENDEE)
                continue;
        }
        candidates.push({
            path: filePath,
            date: candidateDate,
            title: candidateTitle,
            items: extractIntelligenceFromFrontmatter(parsed.frontmatter, parsed.body),
            openQuestions: parseOpenQuestionsSection(parsed.body),
            matchedBy: sharedRecurring && sim < SERIES_TITLE_JACCARD ? 'recurring-config' : 'title+attendees',
        });
    }
    if (candidates.length === 0)
        return null;
    candidates.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const top = candidates.slice(0, maxPrior);
    return {
        meetings: top.map(({ matchedBy: _mb, ...rest }) => rest),
        matchedBy: top[0].matchedBy,
    };
}
// ---------------------------------------------------------------------------
// Prompt rendering
// ---------------------------------------------------------------------------
/** Per-meeting item cap in the rendered series block (budget guard). */
const SERIES_RENDER_MAX_ITEMS = 8;
/**
 * Render a SeriesResolution as the Layer-1 series-context block body for
 * `buildSinglePassExtractionPrompt({ sections: { seriesContext } })`.
 * The advisory framing/header is added by the prompt builder.
 */
export function renderSeriesContext(resolution) {
    const lines = [];
    for (const m of resolution.meetings) {
        lines.push(`### ${m.date} — ${m.title}`);
        const items = [];
        if (m.items) {
            for (const ai of m.items.actionItems) {
                items.push(`- [action] ${ai.description}${ai.ownerSlug ? ` (@${ai.ownerSlug})` : ''}`);
            }
            for (const d of m.items.decisions)
                items.push(`- [decision] ${d}`);
            for (const l of m.items.learnings)
                items.push(`- [learning] ${l}`);
        }
        if (items.length > SERIES_RENDER_MAX_ITEMS) {
            const omitted = items.length - SERIES_RENDER_MAX_ITEMS;
            items.length = SERIES_RENDER_MAX_ITEMS;
            items.push(`- (+ ${omitted} more items not shown)`);
        }
        lines.push(...(items.length > 0 ? items : ['- (no recorded items)']));
        if (m.openQuestions.length > 0) {
            lines.push('Open questions from that meeting:');
            for (const q of m.openQuestions)
                lines.push(`- ${q}`);
        }
        lines.push('');
    }
    return lines.join('\n').trimEnd();
}
//# sourceMappingURL=meeting-series.js.map