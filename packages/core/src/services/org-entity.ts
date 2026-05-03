/**
 * Org-entity service: auto-detect orgs from meeting attendees and
 * refresh org pages under `.arete/memory/entities/orgs/<slug>.md`.
 *
 * Phase 1 §b of the wiki expansion plan.
 *
 * Auto-detection heuristic (default):
 *   - Scan all meetings under resources/meetings/.
 *   - Group attendees by email domain.
 *   - Internal domains (default: ['reserv.com']) are skipped.
 *   - An org "qualifies" if it appears on ≥2 distinct meetings within a
 *     90-day window from `today`.
 *
 * Manual seeding (Phase 1 §b "manual" path) is the
 * `arete entity org create <slug>` CLI command — wired in commands/.
 *
 * The page is sentinel-bracketed: the writer regenerates only the auto
 * section (`<!-- AUTO_ORG_MEMORY:START -->` ... `<!-- AUTO_ORG_MEMORY:END -->`).
 * User-authored prose outside the sentinels is preserved.
 */

import { join, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';

import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/workspace.js';
import type {
  OrgEntity,
  OrgEntityFrontmatter,
} from '../models/org-entity.js';
import {
  renderOrgEntityPage,
  parseOrgEntityPage,
  upsertOrgMemorySection,
} from '../models/org-entity.js';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Internal domains skipped by org auto-detection. */
export const DEFAULT_INTERNAL_DOMAINS: readonly string[] = ['reserv.com'];

/** Window for "appears on ≥2 distinct meetings" detection. */
export const DEFAULT_DETECTION_WINDOW_DAYS = 90;

/** Minimum distinct meetings within window for an org to qualify. */
export const DEFAULT_DETECTION_MIN_MEETINGS = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetectOrgsOptions {
  /** Reference date (today). YYYY-MM-DD. Default: now. */
  today?: string;
  /**
   * Domain blocklist. Attendees with these domains never count toward
   * org detection. Default: `DEFAULT_INTERNAL_DOMAINS`.
   */
  internalDomains?: readonly string[];
  /** Day window. Default: 90. */
  windowDays?: number;
  /** Minimum distinct meeting count within window. Default: 2. */
  minMeetings?: number;
  /**
   * Cap the number of meetings scanned (for huge workspaces). When set,
   * the most recent N meeting files are scanned. Default: no cap.
   */
  maxMeetingsScanned?: number;
}

export interface DetectedOrg {
  /** Slug derived from the email domain (e.g., 'cover-whale.com' → 'cover-whale'). */
  slug: string;
  /** Email domain used for detection. */
  domain: string;
  /** Distinct meeting paths the org's attendees appeared on. */
  sources: string[];
  /** People (attendees) seen across these meetings — name strings. */
  peopleNames: string[];
  /** Earliest meeting date (YYYY-MM-DD). */
  firstSeen: string;
  /** Latest meeting date (YYYY-MM-DD). */
  lastSeen: string;
}

export interface RefreshOrgsOptions extends DetectOrgsOptions {
  /**
   * When true, do not write — return the planned actions only. Useful
   * for `arete wiki lint` and dry-run previews.
   */
  dryRun?: boolean;
}

export interface RefreshOrgsResult {
  detected: DetectedOrg[];
  /** Slugs whose pages were created or updated this run. */
  written: string[];
  /** Slugs whose pages were skipped because content was already fresh. */
  skipped: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Scan meeting frontmatter and detect orgs that meet the threshold.
 * Pure-ish: reads via StorageAdapter, no clock reads inside (today is
 * injected).
 */
export async function detectOrgsFromMeetings(
  paths: WorkspacePaths,
  storage: StorageAdapter,
  options: DetectOrgsOptions = {},
): Promise<DetectedOrg[]> {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const internalDomains = new Set(
    (options.internalDomains ?? DEFAULT_INTERNAL_DOMAINS).map((d) => d.toLowerCase()),
  );
  const windowDays = options.windowDays ?? DEFAULT_DETECTION_WINDOW_DAYS;
  const minMeetings = options.minMeetings ?? DEFAULT_DETECTION_MIN_MEETINGS;

  const cutoff = subtractDays(today, windowDays);

  const meetingsDir = join(paths.resources, 'meetings');
  const exists = await storage.exists(meetingsDir);
  if (!exists) return [];

  let meetingFiles = await storage.list(meetingsDir, { extensions: ['.md'] });
  // Filter out index.md and any non-date-prefixed files.
  meetingFiles = meetingFiles.filter((p) => {
    const name = basename(p);
    if (name === 'index.md') return false;
    return /^\d{4}-\d{2}-\d{2}/.test(name);
  });
  // Sort newest first; cap if requested.
  meetingFiles.sort((a, b) => basename(b).localeCompare(basename(a)));
  if (options.maxMeetingsScanned !== undefined) {
    meetingFiles = meetingFiles.slice(0, options.maxMeetingsScanned);
  }

  // domain → { sources: Set<path>, names: Set<string>, dates: string[] }
  const byDomain = new Map<
    string,
    { sources: Set<string>; names: Set<string>; dates: string[] }
  >();

  for (const filePath of meetingFiles) {
    const content = await storage.read(filePath);
    if (content === null) continue;
    const fm = parseFrontmatter(content);
    if (fm === null) continue;
    const dateRaw = fm.date;
    const date =
      typeof dateRaw === 'string'
        ? dateRaw.slice(0, 10)
        : extractDateFromFilename(filePath);
    if (date === null) continue;
    if (date < cutoff || date > today) continue;

    const attendees = parseAttendees(fm);
    const seenDomainsForThisMeeting = new Set<string>();
    for (const att of attendees) {
      if (att.email === '') continue;
      const dom = extractDomain(att.email);
      if (dom === null) continue;
      if (internalDomains.has(dom)) continue;

      seenDomainsForThisMeeting.add(dom);
      const entry =
        byDomain.get(dom) ??
        ({ sources: new Set<string>(), names: new Set<string>(), dates: [] } as const);
      entry.sources.add(filePath);
      if (att.name.trim().length > 0) entry.names.add(att.name.trim());
      // Only add the date for THIS meeting once per domain (avoid skewed
      // counts when multiple attendees from the same domain are present).
      if (!byDomain.has(dom)) byDomain.set(dom, entry);
    }
    // After the per-meeting loop, append the date for any domain we saw.
    for (const dom of seenDomainsForThisMeeting) {
      const entry = byDomain.get(dom);
      if (entry !== undefined && !entry.dates.includes(date)) {
        entry.dates.push(date);
      }
    }
  }

  const out: DetectedOrg[] = [];
  for (const [domain, entry] of byDomain.entries()) {
    if (entry.sources.size < minMeetings) continue;
    const dates = [...entry.dates].sort();
    out.push({
      slug: slugifyDomain(domain),
      domain,
      sources: [...entry.sources].sort(),
      peopleNames: [...entry.names].sort(),
      firstSeen: dates[0],
      lastSeen: dates[dates.length - 1],
    });
  }
  // Stable order by slug.
  out.sort((a, b) => a.slug.localeCompare(b.slug));
  return out;
}

// ---------------------------------------------------------------------------
// Render auto-section
// ---------------------------------------------------------------------------

/**
 * Render the auto-section body for an org page. Pure; deterministic
 * for equal inputs.
 *
 * Shape (markdown bullets):
 *   - **Last seen on**: 2026-04-22
 *   - **Recent sources**: <list>
 *   - **People**: <list>
 *   - **Open meetings (last 90d)**: N
 */
export function renderOrgAutoSection(
  org: DetectedOrg,
  today: string,
): string {
  const lines: string[] = [];
  lines.push(`- **Last seen**: ${org.lastSeen}`);
  lines.push(`- **First seen**: ${org.firstSeen}`);
  lines.push(`- **Distinct meetings (in window)**: ${org.sources.length}`);
  if (org.peopleNames.length > 0) {
    lines.push(`- **People**: ${org.peopleNames.join(', ')}`);
  }
  // Most recent 5 source paths (relative basenames for readability).
  if (org.sources.length > 0) {
    const recent = org.sources.slice(-5).map((p) => `[[${basename(p).replace(/\.md$/, '')}]]`);
    lines.push(`- **Recent sources**: ${recent.join(', ')}`);
  }
  lines.push(`- **Refreshed**: ${today}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/**
 * Auto-detect and refresh org pages in one pass.
 *
 * - Scans meetings, detects qualifying orgs.
 * - For each detected org:
 *    - If the page doesn't exist: render fresh from the org-entity model
 *      and write.
 *    - If the page exists: parse, update frontmatter (last_refreshed,
 *      sources_integrated, people, last_seen), then upsert the auto
 *      section in place (preserving user prose outside the sentinels).
 */
export async function refreshOrgs(
  paths: WorkspacePaths,
  storage: StorageAdapter,
  options: RefreshOrgsOptions = {},
): Promise<RefreshOrgsResult> {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const detected = await detectOrgsFromMeetings(paths, storage, options);
  const warnings: string[] = [];
  const written: string[] = [];
  const skipped: string[] = [];

  if (options.dryRun) {
    return { detected, written, skipped, warnings };
  }

  const orgsDir = join(paths.memory, 'entities', 'orgs');
  await storage.mkdir(orgsDir);

  for (const det of detected) {
    const pagePath = join(orgsDir, `${det.slug}.md`);
    const existing = await storage.read(pagePath);

    let frontmatter: OrgEntityFrontmatter;
    let userOuterContent: string | null = null;

    if (existing === null) {
      frontmatter = {
        org_slug: det.slug,
        status: 'active',
        people: det.peopleNames.map(slugifyPersonName),
        first_seen: det.firstSeen,
        last_refreshed: today,
        sources_integrated: det.sources,
      };
    } else {
      const parsed = parseOrgEntityPage(existing);
      if (parsed === null) {
        warnings.push(
          `org page at ${pagePath} unparseable; skipping refresh (would clobber user content)`,
        );
        skipped.push(det.slug);
        continue;
      }
      frontmatter = {
        ...parsed.frontmatter,
        last_refreshed: today,
        sources_integrated: dedupKeepOrder([
          ...(parsed.frontmatter.sources_integrated ?? []),
          ...det.sources,
        ]),
        people: dedupKeepOrder([
          ...(parsed.frontmatter.people ?? []),
          ...det.peopleNames.map(slugifyPersonName),
        ]),
      };
      // Preserve outer (non-auto-section) content verbatim.
      userOuterContent = existing;
    }

    const autoSection = renderOrgAutoSection(det, today);

    let outContent: string;
    if (userOuterContent === null) {
      // Fresh page.
      outContent = renderOrgEntityPage({
        frontmatter,
        autoSection,
      });
    } else {
      // Existing page: update frontmatter in-place; upsert auto section.
      outContent = updateFrontmatterAndAutoSection(
        userOuterContent,
        frontmatter,
        autoSection,
      );
    }

    // Idempotency check — skip the write if content is byte-identical
    // to existing (avoids spurious filesystem mtime bumps).
    if (existing !== null && existing === outContent) {
      skipped.push(det.slug);
      continue;
    }
    await storage.write(pagePath, outContent);
    written.push(det.slug);
  }

  return { detected, written, skipped, warnings };
}

// ---------------------------------------------------------------------------
// Manual create
// ---------------------------------------------------------------------------

/**
 * Manually create an org-entity page from a slug + optional metadata.
 * Used by `arete entity org create <slug>` (Phase 1 §b "manual" path)
 * for accounts that aren't detected via meeting attendees (e.g.,
 * partners discussed but never on calls).
 */
export async function createOrgEntityManual(
  paths: WorkspacePaths,
  storage: StorageAdapter,
  input: {
    slug: string;
    today: string;
    aliases?: string[];
    relatedTopics?: string[];
    /** Free-form prose to set as the user-authored body (outside sentinels). */
    prose?: string;
  },
): Promise<{ pagePath: string; created: boolean }> {
  const orgsDir = join(paths.memory, 'entities', 'orgs');
  await storage.mkdir(orgsDir);
  const pagePath = join(orgsDir, `${input.slug}.md`);

  const existing = await storage.read(pagePath);
  if (existing !== null) {
    return { pagePath, created: false };
  }

  const frontmatter: OrgEntityFrontmatter = {
    org_slug: input.slug,
    status: 'active',
    aliases: input.aliases !== undefined && input.aliases.length > 0 ? input.aliases : undefined,
    related_topics:
      input.relatedTopics !== undefined && input.relatedTopics.length > 0
        ? input.relatedTopics
        : undefined,
    first_seen: input.today,
    last_refreshed: input.today,
  };

  const autoSection = `- **Manually seeded on**: ${input.today}\n- **No auto-detected meetings yet** — refreshes when meeting attendees match.`;
  const page: OrgEntity = { frontmatter, autoSection };

  let content = renderOrgEntityPage(page);
  if (input.prose !== undefined && input.prose.trim().length > 0) {
    // Insert user-authored prose ABOVE the sentinels so it's preserved
    // on the next refresh.
    content = content.replace(
      /<!-- AUTO_ORG_MEMORY:START -->/,
      `${input.prose.trim()}\n\n<!-- AUTO_ORG_MEMORY:START -->`,
    );
  }

  await storage.write(pagePath, content);
  return { pagePath, created: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;
  try {
    const parsed = parseYaml(match[1]) as Record<string, unknown>;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseAttendees(fm: Record<string, unknown>): Array<{ name: string; email: string }> {
  const attendees: Array<{ name: string; email: string }> = [];
  const raw = fm.attendees;
  if (!Array.isArray(raw)) return attendees;
  for (const a of raw) {
    if (typeof a === 'string') {
      const angle = a.match(/^(.+?)\s*<([^>]+)>$/);
      if (angle) {
        attendees.push({ name: angle[1].trim(), email: angle[2].trim() });
      } else if (a.includes('@')) {
        attendees.push({ name: a.split('@')[0].replace(/[._-]/g, ' '), email: a });
      } else {
        attendees.push({ name: a, email: '' });
      }
    } else if (a !== null && typeof a === 'object') {
      const obj = a as Record<string, unknown>;
      attendees.push({
        name: typeof obj.name === 'string' ? obj.name : '',
        email: typeof obj.email === 'string' ? obj.email : '',
      });
    }
  }
  return attendees;
}

function extractDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase().trim() || null;
}

function extractDateFromFilename(absPath: string): string | null {
  const m = basename(absPath).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Domain → slug. Strips the TLD and normalizes:
 *   cover-whale.com → cover-whale
 *   leap.legal      → leap
 *   foxen.io        → foxen
 *   acme.co.uk      → acme
 *
 * If the domain has only one segment (rare, but possible in test
 * fixtures), return it directly.
 */
export function slugifyDomain(domain: string): string {
  const parts = domain.toLowerCase().split('.');
  if (parts.length === 0) return domain;
  if (parts.length === 1) return sanitizeSlug(parts[0]);
  // Drop common TLDs (last 1–2 parts). Heuristic: strip just the
  // final segment unless the second-to-last is a 2-char ccTLD-y
  // ('co', 'com', 'net', 'org').
  let nonTld = parts.slice(0, -1);
  if (nonTld.length >= 2) {
    const second = nonTld[nonTld.length - 1];
    if (['co', 'com', 'net', 'org'].includes(second)) {
      nonTld = nonTld.slice(0, -1);
    }
  }
  // Use the LAST remaining segment (most specific). For sub.acme.com,
  // 'acme' is what we want, not 'sub'.
  return sanitizeSlug(nonTld[nonTld.length - 1] ?? parts[0]);
}

function sanitizeSlug(s: string): string {
  return s.replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function slugifyPersonName(name: string): string {
  return sanitizeSlug(name.toLowerCase().replace(/\s+/g, '-'));
}

function dedupKeepOrder<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of arr) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

function subtractDays(today: string, days: number): string {
  const d = new Date(today + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return today;
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Update the frontmatter block of an existing org-entity file in place
 * and replace the auto-section. Preserves user content outside the
 * sentinels.
 */
function updateFrontmatterAndAutoSection(
  existingContent: string,
  newFrontmatter: OrgEntityFrontmatter,
  newAutoSection: string,
): string {
  // Re-serialize via the model's renderer to get a canonical
  // frontmatter block, then graft user-authored body content via
  // upsert.
  const fresh = renderOrgEntityPage({
    frontmatter: newFrontmatter,
    autoSection: newAutoSection,
  });

  // Replace the existing file's frontmatter with the canonical one,
  // then replace the auto section. The frontmatter region is
  // ^---\n...\n---\n? in both files. The auto section sits between
  // sentinels — upsert handles it.
  const fmRe = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
  const freshFmMatch = fresh.match(fmRe);
  if (!freshFmMatch) return fresh; // defensive

  const freshFm = freshFmMatch[0];
  const remaining = existingContent.replace(fmRe, '');

  // Now upsert auto section into `remaining` (which still has user
  // content + old auto section).
  const withUpdatedAuto = upsertOrgMemorySection(remaining, newAutoSection);

  return `${freshFm}${withUpdatedAuto}`;
}
