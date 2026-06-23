/**
 * Plan-context aggregator (WS-2 / WS-3 — plan-context-injection).
 *
 * `arete plan-context --week|--day` composes the EXISTING project/topic/wiki
 * assemblers into one pre-seeded, `[source]`-tagged bundle for the planning
 * surfaces (week-plan, daily-plan). It does NOT duplicate assembly:
 *
 *   - project bodies come ONLY through `selectProjectDocs` (the WS-1 engine);
 *   - active-project metadata via `listActiveProjects`;
 *   - "what changed" via `assembleProjectWhatsNew`;
 *   - active topics via `getActiveTopics`;
 *   - last week's plan by reading `now/week.md`.
 *
 * NO LLM / embeddings — selection is lexical (jaccard + mtime) inside
 * `selectProjectDocs`; everything here is composition + budgeting + tagging.
 *
 * The CLI command (`packages/cli/src/commands/plan-context.ts`) is a thin
 * shell over `assemblePlanContext` — it performs ZERO body parsing
 * (pre-mortem R6): no `parseFrontmatter` on project READMEs, no `## ` heading
 * regex of its own, no `readFileSync` of project docs. All of that lives here,
 * composing the engines above. `openQuestions[]` (R7) is derived by extracting
 * the `/open questions/i` heading SECTION from the `expanded[]` docs that
 * `selectProjectDocs` already returns — never by re-reading files.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { CommitmentsService } from './commitments.js';
import type { EntityService } from './entity.js';
import type { TopicMemoryService } from './topic-memory.js';
import type { AreaMemoryService } from './area-memory.js';
import type { WorkspacePaths } from '../models/index.js';
import { type WeekMemoryEntry } from './week-memory.js';
/**
 * PER-PROJECT expanded-body budget (chars) — each chosen project gets this,
 * NOT a shared total divided down (the divided model starved real docs to
 * filename-only: 8k / 6 projects ≈ 1.3k < any real doc → 0 expanded).
 * `--week` runs ~weekly, so it spends freely; `--day` is area-scoped (few
 * projects) so it stays tighter. The generic single-project `/project` read
 * stays at `PROJECT_DOC_BUDGET_DEFAULT` (12k).
 */
export declare const PLAN_CONTEXT_WEEK_PER_PROJECT_BUDGET = 10000;
export declare const PLAN_CONTEXT_DAY_PER_PROJECT_BUDGET = 6000;
/** Back-compat default (single-project plan-context read). */
export declare const PLAN_CONTEXT_PROJECT_DOC_BUDGET = 12000;
/**
 * Max projects expanded per bundle (recency/area-ranked); rest summarized.
 * Raised to cover a realistic active-project set; with per-project budgets the
 * worst case is bounded (cap × per-project). NOTE: project weighting (surface
 * driving vs reference projects) is a deferred follow-up — for now `--week`
 * surfaces all recency-ranked active projects up to this cap.
 */
export declare const PLAN_CONTEXT_MAX_PROJECTS = 12;
/** "Recently active" window (days) for the --day fallback (pre-mortem R13). */
export declare const PLAN_CONTEXT_RECENT_DAYS = 7;
export type PlanContextMode = 'week' | 'day' | 'project';
/** A selected/listed project document, tagged with the project slug. */
export interface PlanContextSelectedDoc {
    slug: string;
    rel: string;
    heading: string;
    score: number;
    provenance: 'published' | 'reference' | 'draft';
    /** True when this doc was budget-listed (title only), not expanded. */
    listed: boolean;
}
export interface PlanContextProject {
    slug: string;
    status: string | null;
    /** Compact "what changed since last touched" summary (composed, not parsed). */
    whatsNew: PlanContextWhatsNew | null;
    selectedDocs: PlanContextSelectedDoc[];
    /** Open-question bullets extracted from a doc's `/open questions/i` section. */
    openQuestions: string[];
    /** Provenance tag for the planner — always `'project'` for this surface. */
    source: 'project';
    /** Surfaced when selection fell back / scored below the relevance floor. */
    lowConfidence?: boolean;
}
export interface PlanContextWhatsNew {
    since: string | null;
    meetings: number;
    commitments: number;
    topics: number;
}
export interface PlanContextTopic {
    slug: string;
    area?: string;
    status: string;
    summary: string;
    source: 'topic';
}
export interface PlanContextGoal {
    rel: string;
    title: string;
    source: 'goal';
}
export interface PlanContextBundle {
    mode: PlanContextMode;
    projects: PlanContextProject[];
    topics: PlanContextTopic[];
    goals: PlanContextGoal[];
    /** Prior `now/week.md` content (null when absent — never an error). */
    lastWeek: string | null;
    /**
     * Active week-memory overrides (status==='active'; resolved excluded).
     * Both --day and --week return the SAME full active set — entries have no
     * area field, the set is intentionally tiny, and area-filtering could hide a
     * relevant override (so week-constraints are always surfaced). Absent store
     * → [] (the core read never throws).
     */
    weekMemory: WeekMemoryEntry[];
    generatedAt: string;
    /**
     * Why `projects[]` is what it is — present only when the --day scope could
     * not bind to an area today (`'no-area-today'`) or fell back to
     * recently-active projects (`'recent-active-fallback'`). Never silent (R13).
     */
    reason?: 'no-area-today' | 'recent-active-fallback';
}
export interface AssemblePlanContextDeps {
    storage: StorageAdapter;
    commitments: CommitmentsService;
    topicMemory: TopicMemoryService;
    areaMemory: AreaMemoryService;
    entities: EntityService;
}
export interface AssemblePlanContextOptions {
    /** Today's areas for `--day` scope (caller resolves; e.g. from meeting index). */
    todayAreas?: string[];
    /** Required for `mode === 'project'`: the single project slug to bundle. */
    projectSlug?: string;
    /** Total expanded-body budget shared across projects. */
    budgetChars?: number;
    /** Max projects expanded into the bundle. */
    maxProjects?: number;
    /** Injected for deterministic recency/timestamps in tests. */
    referenceDate?: Date;
}
/**
 * Extract the body of the first section whose heading matches `/open
 * questions/i`, split into non-empty bullet/line items (R7). Operates on a doc
 * BODY already returned by `selectProjectDocs.expanded[]` — composes selection
 * output, never re-reads files. Returns [] when no such section exists.
 */
export declare function extractOpenQuestions(body: string): string[];
/** List today's distinct areas from the meeting index (pure read, NO network). */
export declare function resolveTodayAreas(deps: Pick<AssemblePlanContextDeps, 'storage'>, paths: WorkspacePaths, referenceDate?: Date): Promise<string[]>;
/**
 * Assemble the plan-context bundle for `--week` or `--day`. Pure read,
 * NO LLM. Composes WS-1 `selectProjectDocs` + existing assemblers.
 */
export declare function assemblePlanContext(mode: PlanContextMode, paths: WorkspacePaths, deps: AssemblePlanContextDeps, opts?: AssemblePlanContextOptions): Promise<PlanContextBundle>;
//# sourceMappingURL=plan-context.d.ts.map