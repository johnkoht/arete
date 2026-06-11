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
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/index.js';
import type { TopicMemoryService } from './topic-memory.js';
/** Cache cap — top-K by rank above the floor (phase-12 OQ5 default). */
export declare const PROJECT_TOPICS_CAP = 5;
/**
 * Absolute `retrieveWiki` score floor (Phase 14 AC2, review finding 3):
 * a slug enters the cache only when its retrieval score clears this
 * threshold — never "top-5 regardless of score", so weak-corpus projects
 * cache nothing instead of garbage.
 *
 * Calibrated 2026-06-11 against the live arete-reserv workspace with the
 * 23 wiki-rescue-W4 project-fed landing-pad topics as validation material
 * (the phase-12 amendment's designated set; full per-project table in the
 * phase-14 build-report). On the qmd backend the score is
 * `qmd_score × 0.6 + recency(0/0.1/0.2) + area(0.1)`. Observed across all
 * 11 active projects: clearly-relevant topics scored 0.41–0.76; the weak
 * tail (one-token/coincidental matches on thin-corpus projects) scored
 * 0.29–0.32. 0.35 keeps every ≥0.41 relevant hit plus the stronger
 * landing-pad hit (declination-letters 0.376) and caches NOTHING for the
 * thin-corpus projects (pop-belongings-estimate's best was 0.292) —
 * precision over recall, per review finding 3. On the no-provider
 * fallback scale (alias-jaccard + area bonus) one-shared-token noise
 * sits ≤ ~0.25 and genuine slug/alias overlap ≥ ~0.6, so the same
 * constant separates both scales with ≥0.1 margin (pre-mortem D6).
 */
export declare const PROJECT_TOPICS_SCORE_FLOOR = 0.35;
/**
 * Ownership comment stamped directly after the frontmatter on first
 * apply. Doubles as the R10 do-not-depend notice.
 */
export declare const PROJECT_TOPICS_OWNERSHIP_COMMENT = "<!-- topics: maintained by arete via /update-project; display cache only \u2014 do not hand-edit or depend on; edits are overwritten -->";
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
export declare function computeProjectTopicsRefresh(storage: StorageAdapter, topicMemory: TopicMemoryService, paths: WorkspacePaths, slug: string, options?: {
    cap?: number;
    floor?: number;
}): Promise<ProjectTopicsRefresh | null>;
/** Order-insensitive slug-set equality (the R2 change gate). */
export declare function sameSlugSet(a: string[], b: string[]): boolean;
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
export declare function applyProjectTopics(storage: StorageAdapter, refresh: ProjectTopicsRefresh, options?: {
    today?: string;
}): Promise<ApplyProjectTopicsResult>;
//# sourceMappingURL=project-topics.d.ts.map