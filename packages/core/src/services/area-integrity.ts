/**
 * Area integrity check — report-only scan for dangling `area:` references
 * and alias-map hygiene problems (`arete areas check`).
 *
 * Areas live in `areas/{slug}.md` and are referenced by slug from meeting,
 * project, note, goal, and topic-page frontmatter with no validation at
 * write time — typos and post-rename references dangle silently. This
 * service walks every referencing surface, resolves each value against the
 * canonical slug set plus the `aliases:` map (see `area-parser.ts`
 * `loadAreaAliasMap`), and reports what does not resolve. It never writes.
 *
 * Surfaces scanned for `area:` values:
 *  - meetings:      `resources/meetings/*.md` frontmatter `area`
 *  - projects:      `projects/active/<slug>/README.md` and BOTH archive
 *                   shapes (`projects/archive/<slug>/` and
 *                   `projects/archive/YYYY-MM_<slug>/`), resolved via
 *                   `resolveProjectArea` (frontmatter + prose `**Area**:`)
 *  - notes:         `resources/notes/*.md` frontmatter `area`
 *  - goals:         `goals/*.md` frontmatter `area`
 *  - topic pages:   `.arete/memory/topics/*.md` frontmatter `area`
 *
 * Alias hygiene reported alongside dangling refs:
 *  - duplicate aliases  — same alias claimed by 2+ areas (first claim wins
 *    at resolution time; the rest silently lose)
 *  - shadowing aliases  — an alias equal to another area's canonical slug
 *    (dead: direct filename lookup always wins)
 *  - orphan artifacts   — `areas/{slug}/memory.md` dirs and
 *    `.arete/memory/areas/{slug}.md` summaries keyed by a `{slug}` that is
 *    neither a canonical slug nor an alias
 *
 * Deliberate exclusions (covered by canonicalize-on-read, not this check):
 *  - task `@area(...)` metadata — tasks are free-text lines and attributing
 *    a specific file/owner to each value is ambiguous
 *  - memory-item `**Topics**:` bullets — topic tokens mix areas, topics,
 *    and people; flagging non-area tokens would be noise
 *
 * Pure read-only; all I/O via StorageAdapter; missing directories produce
 * empty report sections, never throws.
 */

import { join, basename, relative } from 'path';
import { parse as parseYaml } from 'yaml';
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/index.js';
import { resolveProjectArea } from './brief-assemblers.js';

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

/** One unresolved `area:` value, grouped across every file that uses it. */
export interface DanglingAreaRef {
  /** The unresolved value as written. */
  value: string;
  /** Number of files referencing it. */
  count: number;
  /** Workspace-relative paths of the referencing files. */
  files: string[];
}

/** An alias claimed by two or more areas — only the first claimant wins. */
export interface DuplicateAlias {
  alias: string;
  /** Canonical slugs of every area claiming the alias (slug order). */
  areas: string[];
}

/** An alias equal to another area's canonical slug — dead at resolution. */
export interface ShadowingAlias {
  alias: string;
  /** Area that declares the shadowing alias. */
  declaredBy: string;
  /** Area whose canonical slug is shadowed (= alias). */
  shadows: string;
}

/** An area-keyed artifact whose slug resolves to no area. */
export interface OrphanAreaArtifact {
  slug: string;
  /** Workspace-relative path of the artifact. */
  path: string;
  kind: 'area-memory-dir' | 'memory-area-summary';
}

export interface AreaIntegrityReport {
  /** Canonical area slugs found (templates excluded), sorted. */
  canonicalSlugs: string[];
  /** Number of distinct known aliases (after dedup, including shadowed). */
  aliasCount: number;
  /** Number of files whose `area:` value was inspected. */
  scannedFiles: number;
  /** Unresolved `area:` values, sorted by value. */
  dangling: DanglingAreaRef[];
  duplicateAliases: DuplicateAlias[];
  shadowingAliases: ShadowingAlias[];
  orphans: OrphanAreaArtifact[];
  /** True when no dangling refs, duplicate aliases, or shadowing aliases. */
  clean: boolean;
}

// ---------------------------------------------------------------------------
// Frontmatter helpers (same lenient shape as sibling parsers)
// ---------------------------------------------------------------------------

function parseFrontmatter(
  content: string,
): { frontmatter: Record<string, unknown>; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  try {
    const frontmatter = parseYaml(match[1] ?? '') as Record<string, unknown> | null;
    if (!frontmatter || typeof frontmatter !== 'object') return null;
    return { frontmatter, body: match[2] ?? '' };
  } catch {
    return null;
  }
}

/** List `.md` files in a dir, tolerating a missing dir (empty array). */
async function listMarkdown(storage: StorageAdapter, dir: string): Promise<string[]> {
  try {
    if (!(await storage.exists(dir))) return [];
    return await storage.list(dir, { extensions: ['.md'] });
  } catch {
    return [];
  }
}

/** Subdirectories of a dir, tolerating a missing dir (empty array). */
async function listSubdirs(storage: StorageAdapter, dir: string): Promise<string[]> {
  try {
    if (!(await storage.exists(dir))) return [];
    return await storage.listSubdirectories(dir);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Area-side scan: canonical slugs + raw per-area alias declarations
// ---------------------------------------------------------------------------

interface AreaAliasDeclarations {
  /** Canonical slugs (templates excluded). */
  canonicalSlugs: string[];
  /** slug → aliases declared in that area's frontmatter (trimmed, non-self). */
  declaredAliases: Map<string, string[]>;
}

async function scanAreaDeclarations(
  storage: StorageAdapter,
  areasDir: string,
): Promise<AreaAliasDeclarations> {
  const canonicalSlugs: string[] = [];
  const declaredAliases = new Map<string, string[]>();

  for (const filePath of await listMarkdown(storage, areasDir)) {
    const base = basename(filePath);
    if (base.startsWith('_')) continue; // templates
    const content = await storage.read(filePath);
    if (!content) continue;
    const slug = base.replace(/\.md$/, '');
    canonicalSlugs.push(slug);

    const parsed = parseFrontmatter(content);
    const rawAliases = parsed?.frontmatter.aliases;
    const aliases = Array.isArray(rawAliases)
      ? rawAliases
          .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
          .map((a) => a.trim())
          .filter((a) => a !== slug)
      : [];
    declaredAliases.set(slug, aliases);
  }

  canonicalSlugs.sort((a, b) => a.localeCompare(b));
  return { canonicalSlugs, declaredAliases };
}

// ---------------------------------------------------------------------------
// Reference collection
// ---------------------------------------------------------------------------

interface AreaRef {
  value: string;
  /** Workspace-relative path of the referencing file. */
  file: string;
}

function frontmatterArea(frontmatter: Record<string, unknown>): string | undefined {
  const value = frontmatter.area;
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return undefined;
}

/** Collect `area:` frontmatter refs from every `.md` file in `dir`. */
async function collectFrontmatterRefs(
  storage: StorageAdapter,
  dir: string,
  root: string,
  refs: AreaRef[],
): Promise<number> {
  let scanned = 0;
  for (const filePath of await listMarkdown(storage, dir)) {
    if (basename(filePath).startsWith('_')) continue;
    const content = await storage.read(filePath);
    if (!content) continue;
    const parsed = parseFrontmatter(content);
    if (!parsed) continue;
    scanned++;
    const value = frontmatterArea(parsed.frontmatter);
    if (value) refs.push({ value, file: relative(root, filePath) });
  }
  return scanned;
}

/** Collect project README refs (frontmatter + prose) for one projects subdir. */
async function collectProjectRefs(
  storage: StorageAdapter,
  projectsSubdir: string,
  root: string,
  refs: AreaRef[],
): Promise<number> {
  let scanned = 0;
  for (const dir of await listSubdirs(storage, projectsSubdir)) {
    const readmePath = join(dir, 'README.md');
    const content = await storage.read(readmePath);
    if (!content) continue;
    scanned++;
    const parsed = parseFrontmatter(content);
    const resolution = resolveProjectArea(
      parsed?.frontmatter ?? {},
      parsed?.body ?? content,
    );
    if (resolution.area) {
      refs.push({ value: resolution.area, file: relative(root, readmePath) });
    }
  }
  return scanned;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Run the full integrity scan. Read-only; never throws on missing dirs.
 */
export async function checkAreaIntegrity(
  storage: StorageAdapter,
  paths: WorkspacePaths,
): Promise<AreaIntegrityReport> {
  const root = paths.root;
  const areasDir = join(root, 'areas');

  // -- 1. Canonical slugs + alias declarations -----------------------------
  const { canonicalSlugs, declaredAliases } = await scanAreaDeclarations(
    storage,
    areasDir,
  );
  const canonicalSet = new Set(canonicalSlugs);

  // Alias hygiene: duplicates, shadows, and the resolvable alias set.
  // Mirrors loadAreaAliasMap semantics (slug order, first claim wins),
  // but keeps the losers so they can be reported.
  const duplicateClaims = new Map<string, string[]>(); // alias → claimant slugs
  const shadowingAliases: ShadowingAlias[] = [];
  const knownAliases = new Set<string>();

  for (const slug of canonicalSlugs) {
    for (const alias of declaredAliases.get(slug) ?? []) {
      if (canonicalSet.has(alias)) {
        shadowingAliases.push({ alias, declaredBy: slug, shadows: alias });
        continue;
      }
      const claims = duplicateClaims.get(alias);
      if (claims) {
        if (!claims.includes(slug)) claims.push(slug);
      } else {
        duplicateClaims.set(alias, [slug]);
      }
      // Even a losing duplicate still RESOLVES (to the first claimant),
      // so every claimed alias counts as known for dangling-ref purposes.
      knownAliases.add(alias);
    }
  }

  const duplicateAliases: DuplicateAlias[] = [...duplicateClaims.entries()]
    .filter(([, areas]) => areas.length > 1)
    .map(([alias, areas]) => ({ alias, areas }))
    .sort((a, b) => a.alias.localeCompare(b.alias));

  const resolves = (value: string): boolean =>
    canonicalSet.has(value) || knownAliases.has(value);

  // -- 2. Reference surfaces ------------------------------------------------
  const refs: AreaRef[] = [];
  let scannedFiles = 0;

  scannedFiles += await collectFrontmatterRefs(
    storage, join(paths.resources, 'meetings'), root, refs);
  scannedFiles += await collectProjectRefs(
    storage, join(paths.projects, 'active'), root, refs);
  scannedFiles += await collectProjectRefs(
    storage, join(paths.projects, 'archive'), root, refs);
  scannedFiles += await collectFrontmatterRefs(
    storage, join(paths.resources, 'notes'), root, refs);
  scannedFiles += await collectFrontmatterRefs(
    storage, paths.goals, root, refs);
  scannedFiles += await collectFrontmatterRefs(
    storage, join(paths.memory, 'topics'), root, refs);

  // Group unresolved values.
  const danglingByValue = new Map<string, string[]>();
  for (const ref of refs) {
    if (resolves(ref.value)) continue;
    const files = danglingByValue.get(ref.value);
    if (files) files.push(ref.file);
    else danglingByValue.set(ref.value, [ref.file]);
  }
  const dangling: DanglingAreaRef[] = [...danglingByValue.entries()]
    .map(([value, files]) => ({ value, count: files.length, files: files.sort() }))
    .sort((a, b) => a.value.localeCompare(b.value));

  // -- 3. Orphan area-keyed artifacts ---------------------------------------
  const orphans: OrphanAreaArtifact[] = [];

  // areas/{slug}/memory.md dirs
  for (const dir of await listSubdirs(storage, areasDir)) {
    const slug = basename(dir);
    const memoryPath = join(dir, 'memory.md');
    if (!(await storage.exists(memoryPath))) continue;
    if (resolves(slug)) continue;
    orphans.push({
      slug,
      path: relative(root, memoryPath),
      kind: 'area-memory-dir',
    });
  }

  // .arete/memory/areas/{slug}.md summaries
  for (const filePath of await listMarkdown(storage, join(paths.memory, 'areas'))) {
    const base = basename(filePath);
    if (base.startsWith('_')) continue;
    const slug = base.replace(/\.md$/, '');
    if (resolves(slug)) continue;
    orphans.push({
      slug,
      path: relative(root, filePath),
      kind: 'memory-area-summary',
    });
  }
  orphans.sort((a, b) => a.slug.localeCompare(b.slug) || a.path.localeCompare(b.path));

  return {
    canonicalSlugs,
    aliasCount: knownAliases.size,
    scannedFiles,
    dangling,
    duplicateAliases,
    shadowingAliases,
    orphans,
    clean:
      dangling.length === 0 &&
      duplicateAliases.length === 0 &&
      shadowingAliases.length === 0,
  };
}
