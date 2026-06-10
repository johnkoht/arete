/**
 * Project area backfill helpers (Phase 12 AC2).
 *
 * `arete project backfill-area` support: list active projects with their
 * area-resolution status (reusing the AC1 priority parser), write the
 * `area:` + `area_set_by: backfill` provenance pair into a project README's
 * frontmatter, and selectively reset ONLY backfill-stamped areas.
 *
 * Frontmatter writes use the parse/serialize round-trip pattern from
 * `meeting-lock.ts` (yaml parse → mutate → stringify, body preserved).
 * No direct `fs` — all I/O through StorageAdapter (services invariant).
 */

import { join, basename } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/index.js';
import { resolveProjectArea } from './brief-assemblers.js';

/** One active project, annotated for the backfill flow. */
export interface ProjectBackfillCandidate {
  slug: string;
  /** Display title (frontmatter `name:`/`title:`/`project:` → slug). */
  title: string;
  readmePath: string;
  /** Resolved area per the AC1 priority parser (undefined = unresolved). */
  area?: string;
  /** Which signal resolved the area (frontmatter | prose). */
  areaSource?: 'frontmatter' | 'prose';
  /** Provenance marker (`manual` | `creation` | `backfill`). */
  areaSetBy?: string;
  /**
   * Inference text for `suggestAreaForMeeting`: README `## Background` +
   * `## Key Questions` section bodies (plan AC2). Empty string when neither
   * section exists.
   */
  inferenceSummary: string;
}

const FM_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseReadme(content: string): { fm: Record<string, unknown>; body: string } {
  const match = content.match(FM_BLOCK);
  if (!match) return { fm: {}, body: content };
  try {
    return {
      fm: (parseYaml(match[1]) ?? {}) as Record<string, unknown>,
      body: match[2] ?? '',
    };
  } catch {
    return { fm: {}, body: match[2] ?? '' };
  }
}

function extractSectionText(body: string, heading: string): string {
  const re = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]+?)(?=\\n##\\s|$)`, 'i');
  const match = body.match(re);
  return match ? match[1].trim() : '';
}

function displayTitle(fm: Record<string, unknown>, slug: string): string {
  for (const key of ['name', 'title', 'project'] as const) {
    const value = fm[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return slug;
}

/**
 * List active projects annotated with area resolution + inference text.
 * Used by `arete project backfill-area` (preview, apply, reset).
 */
export async function listProjectsForBackfill(
  storage: StorageAdapter,
  paths: WorkspacePaths,
): Promise<ProjectBackfillCandidate[]> {
  const activeDir = join(paths.projects, 'active');
  if (!(await storage.exists(activeDir))) return [];

  const out: ProjectBackfillCandidate[] = [];
  for (const dir of await storage.listSubdirectories(activeDir)) {
    const readmePath = join(dir, 'README.md');
    const content = await storage.read(readmePath);
    if (!content) continue;
    const { fm, body } = parseReadme(content);
    const res = resolveProjectArea(fm, body);
    const background = extractSectionText(body, 'Background');
    const keyQuestions = extractSectionText(body, 'Key Questions');
    out.push({
      slug: basename(dir),
      title: displayTitle(fm, basename(dir)),
      readmePath,
      area: res.area,
      areaSource: res.source,
      areaSetBy: res.areaSetBy,
      inferenceSummary: [background, keyQuestions].filter(Boolean).join('\n\n'),
    });
  }
  return out;
}

/**
 * Write `area:` + `area_set_by:` into a project README's frontmatter,
 * preserving body and all other frontmatter keys (yaml round-trip).
 * Idempotent: same values → identical output content.
 */
export async function applyAreaToProjectReadme(
  storage: StorageAdapter,
  readmePath: string,
  areaSlug: string,
  setBy: 'backfill' | 'creation' = 'backfill',
): Promise<void> {
  const content = await storage.read(readmePath);
  if (!content) throw new Error(`Project README not found: ${readmePath}`);
  const { fm, body } = parseReadme(content);
  fm['area'] = areaSlug;
  fm['area_set_by'] = setBy;
  const fmText = stringifyYaml(fm).trimEnd();
  await storage.write(readmePath, `---\n${fmText}\n---\n\n${body.replace(/^\n+/, '')}`);
}

/**
 * Clear `area` + `area_set_by` ONLY on projects stamped
 * `area_set_by: backfill`. Creation/manual provenance is left intact
 * (AC2 `--reset` contract, mirrors `commitments backfill-area --reset`).
 */
export async function resetBackfilledProjectAreas(
  storage: StorageAdapter,
  paths: WorkspacePaths,
): Promise<{ reset: string[] }> {
  const reset: string[] = [];
  for (const candidate of await listProjectsForBackfill(storage, paths)) {
    const content = await storage.read(candidate.readmePath);
    if (!content) continue;
    const { fm, body } = parseReadme(content);
    if (fm['area_set_by'] !== 'backfill') continue;
    delete fm['area'];
    delete fm['area_set_by'];
    const fmText = stringifyYaml(fm).trimEnd();
    await storage.write(
      candidate.readmePath,
      `---\n${fmText}\n---\n\n${body.replace(/^\n+/, '')}`,
    );
    reset.push(candidate.slug);
  }
  return { reset };
}
