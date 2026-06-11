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
 * Deliberate exclusions:
 *  - task `@area(...)` metadata — tasks are free-text lines and attributing
 *    a specific file/owner to each value is ambiguous. NOTE: the task area
 *    filter (tasks.ts listTasks) compares raw, NOT canonicalized — no
 *    in-repo caller passes an area today, but a future caller must
 *    canonicalize or extend this check.
 *  - memory-item `**Topics**:` bullets — topic tokens mix areas, topics,
 *    and people; flagging non-area tokens would be noise. These ARE
 *    canonicalized on read (readAreaTaggedMemoryItems).
 *
 * Pure read-only; all I/O via StorageAdapter; missing directories produce
 * empty report sections, never throws.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/index.js';
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
/**
 * Run the full integrity scan. Read-only; never throws on missing dirs.
 */
export declare function checkAreaIntegrity(storage: StorageAdapter, paths: WorkspacePaths): Promise<AreaIntegrityReport>;
//# sourceMappingURL=area-integrity.d.ts.map