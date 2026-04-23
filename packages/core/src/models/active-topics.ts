/**
 * Active topics data primitive + view renderers.
 *
 * Shared between:
 *   - CLAUDE.md generator (renders `## Active Topics` wikilink list)
 *   - Meeting-extraction prompt bias (bare-slug list for LLM proposal input)
 *
 * One data source (`getActiveTopics`) feeds both views. Renderers are
 * view-specific so that wikilinks don't leak `[[...]]` into the
 * extraction LLM's JSON output (see plan §9.6 and Step 7 review).
 *
 * Pure — no I/O, no clock reads unless explicitly injected.
 */

import { getTopicHeadline, type TopicPage } from './topic-page.js';

export interface ActiveTopicEntry {
  slug: string;
  area?: string;
  status: string;
  summary: string;          // one-line headline from Current state
  lastRefreshed: string;    // YYYY-MM-DD from frontmatter
}

export interface GetActiveTopicsOptions {
  /** Maximum entries returned. Default 25. */
  limit?: number;
  /**
   * Reference date for recency filtering. Default: new Date().
   * Injectable for deterministic tests.
   */
  today?: Date;
  /**
   * Only include topics with `last_refreshed` within this many days.
   * Topics outside the window are excluded. Default 90.
   */
  recencyDays?: number;
  /**
   * Optional per-topic "open items" lookup. Supplies `openItems` so the
   * sort can weight active work. When omitted, all topics sort with
   * open_items = 0 (tie on openItems falls through to lastRefreshed DESC).
   */
  openItemsBySlug?: Map<string, number>;
}

const DEFAULT_LIMIT = 25;
const DEFAULT_RECENCY_DAYS = 90;

function daysBetween(isoDate: string, now: Date): number {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return Infinity;
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Select + sort active topics for the boot-context Active Topics block.
 *
 * Filter: include only topics whose `openItems > 0` OR whose
 * `last_refreshed` is within `recencyDays` (default 90).
 *
 * Sort: `(openItems desc, lastRefreshed desc, slug asc)` — deterministic
 * slug tiebreak keeps output stable across refreshes when everything
 * else is equal. No `localeCompare`, no `Intl.Collator` — plain string
 * comparison for locale independence.
 */
export function getActiveTopics(
  topics: TopicPage[],
  options: GetActiveTopicsOptions = {},
): ActiveTopicEntry[] {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const today = options.today ?? new Date();
  const recencyDays = options.recencyDays ?? DEFAULT_RECENCY_DAYS;
  const openItemsBySlug = options.openItemsBySlug;

  const entries: Array<ActiveTopicEntry & { openItems: number }> = [];

  for (const page of topics) {
    const slug = page.frontmatter.topic_slug;
    const openItems = openItemsBySlug?.get(slug) ?? 0;
    const daysOld = daysBetween(page.frontmatter.last_refreshed, today);

    // Filter: active if has open items OR is recent
    if (openItems === 0 && daysOld > recencyDays) continue;

    const entry: ActiveTopicEntry & { openItems: number } = {
      slug,
      status: page.frontmatter.status,
      summary: getTopicHeadline(page),
      lastRefreshed: page.frontmatter.last_refreshed,
      openItems,
    };
    if (page.frontmatter.area !== undefined) entry.area = page.frontmatter.area;

    entries.push(entry);
  }

  entries.sort((a, b) => {
    if (a.openItems !== b.openItems) return b.openItems - a.openItems;
    if (a.lastRefreshed !== b.lastRefreshed) {
      return a.lastRefreshed < b.lastRefreshed ? 1 : -1;
    }
    if (a.slug < b.slug) return -1;
    if (a.slug > b.slug) return 1;
    return 0;
  });

  // Strip the internal openItems field before returning — it's a sort
  // signal, not part of the public ActiveTopicEntry surface.
  return entries.slice(0, limit).map(({ openItems: _o, ...rest }) => {
    void _o;
    return rest;
  });
}

/**
 * Render active topics as an Obsidian-style wikilink list for CLAUDE.md.
 *
 * Format (per entry):
 *   `- [[slug]] (area) — status — summary`
 *
 * Used by the CLAUDE.md generator. Skills resolving `[[slug]]` at
 * attention time navigate directly to the topic page.
 */
export function renderActiveTopicsAsWikilinks(entries: ActiveTopicEntry[]): string {
  if (entries.length === 0) return '';
  const lines: string[] = [];
  for (const e of entries) {
    const areaPart = e.area !== undefined ? ` (${e.area})` : '';
    const summaryPart = e.summary.length > 0 ? ` — ${e.summary}` : '';
    lines.push(`- [[${e.slug}]]${areaPart} — ${e.status}${summaryPart}`);
  }
  return lines.join('\n');
}

/**
 * Render active topics as a bare-slug list for the extraction-prompt
 * bias. **Intentionally strips wikilinks** — an LLM seeing `[[slug]]`
 * in a prompt tends to echo `[[...]]` back in its JSON output, corrupting
 * downstream topic frontmatter (reviewer §6 of Step 9 doc review).
 *
 * Format (per entry):
 *   `<slug> — <status>: <summary>`
 */
export function renderActiveTopicsAsSlugList(entries: ActiveTopicEntry[]): string {
  if (entries.length === 0) return '';
  const lines: string[] = [];
  for (const e of entries) {
    const summaryPart = e.summary.length > 0 ? `: ${e.summary}` : '';
    lines.push(`${e.slug} — ${e.status}${summaryPart}`);
  }
  return lines.join('\n');
}

/**
 * Compute the effective `last_refreshed` display date for the Active
 * Topics section header. Takes the max across entries so the header is
 * data-derived (stable under wall-clock drift).
 *
 * Returns empty string when there are no entries.
 */
export function maxLastRefreshed(entries: ActiveTopicEntry[]): string {
  if (entries.length === 0) return '';
  let max = entries[0].lastRefreshed;
  for (const e of entries) {
    if (e.lastRefreshed > max) max = e.lastRefreshed;
  }
  return max;
}
