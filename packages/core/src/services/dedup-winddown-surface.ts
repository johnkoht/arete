/**
 * Phase 10b-aux Step 3 — winddown surfacing for dedup decisions.
 *
 * Reads the parsed `dedup-decisions.log` (via dedup-explain.parseDedupLog)
 * and formats the two chef-curated winddown sections specified in the plan
 * §"Winddown flow" + AC8a:
 *
 *   - "Deduped today" — MERGE decisions, each with an inline
 *     `[[unmerge: <canonical> ← <dupe>]]` hint for copy-paste recovery
 *     (pre-mortem F3 discoverability fix).
 *   - "Possibly mergeable" — UNCERTAIN decisions awaiting user confirm
 *     (AC4a).
 *
 * Pure module: NO filesystem, NO LLM. The winddown wire-in (SKILL.md /
 * its driver) reads the log file, parses it, filters to today's entries,
 * and calls these formatters.
 *
 * Scoping note: the log is append-only across all days. Callers pass the
 * entries they want surfaced (typically "today's" — filtered by the ISO
 * date prefix). `filterLogByDate` is provided as the conventional filter.
 */

import type { DedupLogEntry } from './dedup-explain.js';

/**
 * Filter log entries to a single ISO date (YYYY-MM-DD prefix on the
 * timestamp column). Used to scope "Deduped today" to the current day.
 *
 * Exported for tests + the winddown driver.
 */
export function filterLogByDate(
  entries: ReadonlyArray<DedupLogEntry>,
  isoDate: string,
): DedupLogEntry[] {
  return entries.filter((e) => e.iso.startsWith(isoDate));
}

const SHORT = 8;
const shortId = (id: string): string =>
  id.replace(/^canon_/, '').slice(0, SHORT);

/**
 * Format the "Deduped today" section (AC8a).
 *
 * Returns the empty string when there are no MERGE entries — callers omit
 * the section entirely (the winddown template only renders non-empty
 * sections).
 *
 * Each merge entry inlines a ready-to-edit `[[unmerge]]` directive so the
 * user can split a wrong merge in the NEXT winddown (F3 discoverability).
 */
export function formatDedupedTodaySection(
  entries: ReadonlyArray<DedupLogEntry>,
): string {
  const merges = entries.filter((e) => e.decision === 'MERGE');
  if (merges.length === 0) return '';

  const lines: string[] = [];
  lines.push(`### Deduped today (${merges.length} merge${merges.length === 1 ? '' : 's'})`);
  lines.push('');
  for (const m of merges) {
    const tierNote =
      m.llmDecision === '-'
        ? 'exact text-hash match'
        : `jaccard ${m.jaccard}, ${m.llmTier}-tier ${m.llmDecision}`;
    const reasoning = m.reasoning ? ` — ${m.reasoning}` : '';
    lines.push(`- merged ${shortId(m.newId)} → canonical ${shortId(m.canonicalId)} (${tierNote})${reasoning}`);
    lines.push(
      `  → wrong? add \`[[unmerge: ${shortId(m.canonicalId)} ← ${shortId(m.newId)}]]\` below to split next winddown`,
    );
  }
  return lines.join('\n');
}

/**
 * Format the "Possibly mergeable" section (AC4a).
 *
 * Surfaces UNCERTAIN decisions — items the LLM cross-check couldn't call
 * SAME or DIFFERENT. They were registered as NEW canonicals; the user can
 * confirm a merge here. Returns '' when there are none.
 */
export function formatPossiblyMergeableSection(
  entries: ReadonlyArray<DedupLogEntry>,
): string {
  const uncertain = entries.filter((e) => e.decision === 'UNCERTAIN');
  if (uncertain.length === 0) return '';

  const lines: string[] = [];
  lines.push(
    `### Possibly mergeable (${uncertain.length} pair${uncertain.length === 1 ? '' : 's'} — your call)`,
  );
  lines.push('');
  for (const u of uncertain) {
    const reasoning = u.reasoning ? ` — ${u.reasoning}` : '';
    lines.push(
      `- ${shortId(u.newId)} may be the same as canonical ${shortId(u.canonicalId)} (jaccard ${u.jaccard}, ${u.llmTier}-tier UNCERTAIN)${reasoning}`,
    );
    lines.push(
      `  → confirm merge in the per-meeting approval UI, or leave as-is to keep them distinct`,
    );
  }
  return lines.join('\n');
}

/**
 * Build BOTH sections (Deduped today + Possibly mergeable) for a given
 * day's log entries, joined by a blank line. Returns '' when neither
 * section has content. Convenience for the winddown driver.
 *
 * @param entries  ALL parsed log entries (pre-date-filter).
 * @param isoDate  The day to scope to (YYYY-MM-DD).
 */
export function formatDedupWinddownSections(
  entries: ReadonlyArray<DedupLogEntry>,
  isoDate: string,
): string {
  const today = filterLogByDate(entries, isoDate);
  const sections = [
    formatDedupedTodaySection(today),
    formatPossiblyMergeableSection(today),
  ].filter((s) => s.length > 0);
  return sections.join('\n\n');
}
