/**
 * Project topics-cache helpers (Phase 14 AC2).
 *
 * `arete project refresh-topics` support: compute the top-K relevant wiki
 * topics for a project (the phase-12 project wiki query through
 * `retrieveWiki`, score-floored), diff against the cached `topics:`
 * frontmatter, and — ONLY when the slug set actually changed — rewrite
 * the `topics:` + `topics_refreshed:` pair plus the ownership comment.
 *
 * Binding constraints (phase-12 pre-mortem, carried whole):
 *  - R1: this writer is the ONLY code path that persists the topics
 *    cache, and it runs only from the explicit verb (the `/update-project`
 *    skill calls the verb after approval — never writes frontmatter
 *    itself).
 *  - R2: same slug set → ZERO write calls, even under `--apply`. The
 *    change gate lives here, in tested code, not in prose. No
 *    `topics_refreshed` bump on a no-op.
 *  - R10: the cache is display/convenience only. The ownership comment
 *    stamped below is the user-facing do-not-depend notice; the
 *    no-consumer guard test in project-topics.test.ts is the CI copy.
 *
 * Frontmatter writes use the same yaml parse → mutate → stringify
 * round-trip as project-area.ts (body preserved, nested blocks survive).
 * No direct `fs` — all I/O through StorageAdapter (services invariant).
 */

import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/index.js';
import type { TopicMemoryService } from './topic-memory.js';
import { parseProjectReadme } from './project-area.js';
import {
  buildProjectWikiQuery,
  parseTopicsCache,
  projectDisplayName,
  resolveProjectArea,
  retrieveWiki,
} from './brief-assemblers.js';

/** Cache cap — top-K by rank above the floor (phase-12 OQ5 default). */
export const PROJECT_TOPICS_CAP = 5;

/**
 * Absolute `retrieveWiki` score floor (Phase 14 AC2, review finding 3):
 * a slug enters the cache only when its retrieval score clears this
 * threshold — never "top-5 regardless of score", so weak-corpus projects
 * cache nothing instead of garbage.
 *
 * Calibrated 2026-06-11 against the 23 wiki-rescue-W4 project-fed
 * landing-pad topics in the live arete-reserv workspace (the phase-12
 * amendment's designated validation material; full table in the phase-14
 * build-report). On the qmd backend the score is
 * `qmd_score × 0.6 + recency(0/0.1/0.2) + area(0.1)`; observed landing-pad
 * hits for their feeding projects scored ≥ ~0.45 while unrelated topics
 * scored ≤ ~0.25. On the token-fallback backend the score is
 * alias-jaccard (0..1) + area bonus, where one-shared-token noise sits
 * ≤ ~0.25 and genuine alias overlap ≥ ~0.5. 0.35 separates both scales
 * with margin (pre-mortem D6).
 */
export const PROJECT_TOPICS_SCORE_FLOOR = 0.35;

/**
 * Ownership comment stamped directly after the frontmatter on first
 * apply. Doubles as the R10 do-not-depend notice.
 */
export const PROJECT_TOPICS_OWNERSHIP_COMMENT =
  '<!-- topics: maintained by arete via /update-project; display cache only — do not hand-edit or depend on; edits are overwritten -->';

/**
 * Stable substring used to detect an existing ownership comment
 * (pre-mortem D7: dedup by substring anywhere in the body, never by
 * position — a hand-moved comment must not be re-inserted).
 */
const OWNERSHIP_COMMENT_SENTINEL = 'topics: maintained by arete';

/** One computed topic candidate with its retrieval score. */
export interface ComputedProjectTopic {
  slug: string;
  /** retrieveWiki score (see PROJECT_TOPICS_SCORE_FLOOR doc for scales). */
  score: number;
}

/** Preview/diff result for one project's topics cache. */
export interface ProjectTopicsRefresh {
  slug: string;
  readmePath: string;
  /** The phase-12 wiki query the computation ran with. */
  query: string;
  /** Resolved project area (query/area bonus input), when present. */
  area?: string;
  /** Top-K computed slugs above the floor, rank order. */
  computed: ComputedProjectTopic[];
  /** Candidates retrieved but rejected by the floor (preview visibility). */
  belowFloor: ComputedProjectTopic[];
  /** Currently cached `topics:` slugs (empty when none). */
  current: string[];
  /** Currently cached `topics_refreshed:` date, when present. */
  currentRefreshed?: string;
  /** True when the computed slug SET differs from the cached set (R2 gate). */
  changed: boolean;
  /**
   * True when wiki retrieval THREW (vs legitimately returned nothing).
   * `changed` is forced false in that case — a transient retrieval
   * failure must never be misread as "the cache should be emptied".
   */
  retrievalFailed?: boolean;
}

/**
 * Compute the topics-cache refresh preview for one active project.
 * PURE READ — performs no writes. Returns null when the project README
 * does not exist.
 */
export async function computeProjectTopicsRefresh(
  storage: StorageAdapter,
  topicMemory: TopicMemoryService,
  paths: WorkspacePaths,
  slug: string,
  options: { cap?: number; floor?: number } = {},
): Promise<ProjectTopicsRefresh | null> {
  const cap = options.cap ?? PROJECT_TOPICS_CAP;
  const floor = options.floor ?? PROJECT_TOPICS_SCORE_FLOOR;

  const readmePath = join(paths.projects, 'active', slug, 'README.md');
  const content = await storage.read(readmePath);
  if (!content) return null;

  const { fm, body } = parseProjectReadme(content);
  const areaRes = resolveProjectArea(fm, body);
  const name = projectDisplayName(fm, slug);
  const query = buildProjectWikiQuery(name, areaRes.area, body);

  // Over-fetch (2×cap) so the floor filters BEFORE the cap — "top-K by
  // rank above the floor", never "top-K regardless of score".
  let matches: Array<{ slug: string; score: number }> = [];
  let retrievalFailed = false;
  try {
    matches = await retrieveWiki(topicMemory, paths, query, {
      area: areaRes.area,
      limit: cap * 2,
    });
  } catch {
    // Retrieval failure must not break the verb — and must not be
    // misread as "the wiki has no topics" (which would clear a legit
    // cache on apply). Forced no-change below.
    retrievalFailed = true;
  }

  const computed: ComputedProjectTopic[] = [];
  const belowFloor: ComputedProjectTopic[] = [];
  for (const m of matches) {
    const entry = { slug: m.slug, score: Number(m.score.toFixed(3)) };
    if (m.score >= floor && computed.length < cap) computed.push(entry);
    else if (m.score < floor) belowFloor.push(entry);
  }

  const cache = parseTopicsCache(fm);
  const current = cache.topics ?? [];
  const changed =
    !retrievalFailed &&
    !sameSlugSet(
      computed.map((c) => c.slug),
      current,
    );

  return {
    slug,
    readmePath,
    query,
    area: areaRes.area,
    computed,
    belowFloor,
    current,
    currentRefreshed: cache.topicsRefreshed,
    changed,
    ...(retrievalFailed ? { retrievalFailed } : {}),
  };
}

/** Order-insensitive slug-set equality (the R2 change gate). */
export function sameSlugSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  if (set.size !== new Set(b).size) return false;
  for (const s of b) if (!set.has(s)) return false;
  return true;
}

/** Result of an apply call. */
export interface ApplyProjectTopicsResult {
  /** False = R2 no-op: the slug set was unchanged and NO write happened. */
  written: boolean;
}

/**
 * Apply a computed refresh to the project README — change-gated wholesale
 * rewrite of `topics:` + `topics_refreshed:` plus the ownership comment
 * (inserted once, directly after the frontmatter; detected by stable
 * substring so a hand-moved comment is never duplicated).
 *
 * R2: when `refresh.changed` is false this performs ZERO storage calls
 * (asserted by the counting-adapter test) and returns `{ written: false }`.
 */
export async function applyProjectTopics(
  storage: StorageAdapter,
  refresh: ProjectTopicsRefresh,
  options: { today?: string } = {},
): Promise<ApplyProjectTopicsResult> {
  if (!refresh.changed) return { written: false };

  const content = await storage.read(refresh.readmePath);
  if (!content) {
    throw new Error(`Project README not found: ${refresh.readmePath}`);
  }
  const { fm, body } = parseProjectReadme(content);

  // Re-check the gate against the file as it exists NOW (the preview may
  // be stale relative to a concurrent hand-edit of `topics:`).
  const cache = parseTopicsCache(fm);
  const computedSlugs = refresh.computed.map((c) => c.slug);
  if (sameSlugSet(computedSlugs, cache.topics ?? [])) {
    return { written: false };
  }

  // Wholesale rewrite of exactly the two system-owned keys.
  if (computedSlugs.length > 0) {
    fm['topics'] = computedSlugs;
  } else {
    delete fm['topics'];
  }
  fm['topics_refreshed'] = options.today ?? new Date().toISOString().slice(0, 10);

  const fmText = stringifyYaml(fm).trimEnd();
  let normalizedBody = body.replace(/^\n+/, '');
  if (!normalizedBody.includes(OWNERSHIP_COMMENT_SENTINEL)) {
    normalizedBody = `${PROJECT_TOPICS_OWNERSHIP_COMMENT}\n\n${normalizedBody}`;
  }
  await storage.write(refresh.readmePath, `---\n${fmText}\n---\n\n${normalizedBody}`);
  return { written: true };
}
